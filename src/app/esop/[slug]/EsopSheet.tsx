"use client";

import { useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  calcHolder,
  fmtDay,
  isoDay,
  num,
  readHolderCsv,
  readTypedDay,
  schedule,
  today,
  type DocKind,
  type EsopBatch,
  type EsopCompany,
  type EsopDocument,
  type EsopHolder,
  type LeaverType,
} from "@/lib/esop/vesting";
import { buildXlsx, type XSheet } from "@/lib/esop/xlsx";

/**
 * The ESOP dashboard: a spreadsheet the CEO can keep up to date.
 *
 * DESIGN. This is the mock-up Rachel approved on 28 Oct ("website with a
 * sheet inside"), followed strictly: header, four figures, the sheet with
 * column letters and row numbers, the three tabs at the bottom, the same
 * columns in the same order. Two things the mock-up could only pretend to do
 * are done quietly so they do not change its look:
 *   - archive / restore: click the row number (a small menu opens)
 *   - several certificates: "📁 3 files" opens the list
 * Founders Doc admins also get the batch dates and Import holders (CSV),
 * under the Vesting schedule tab; the CEO's screen is exactly the mock-up.
 *
 * DATA. White cells are typed into and saved when you leave them; grey cells
 * are worked out (lib/esop/vesting.ts). Gold rows vest within 7 days. Leavers
 * are archived, never deleted. Saves go straight to Supabase with the
 * signed-in person's own session, so row-level security (105) decides what is
 * allowed. Without Supabase (preview) changes stay on screen.
 */

type Tab = "holders" | "archive" | "schedule";
type Role = "admin" | "ceo";

interface Props {
  company: EsopCompany;
  batches: EsopBatch[];
  holders: EsopHolder[];
  documents: EsopDocument[];
  role: Role;
  viewer: string;
  supabaseUrl: string | null;
  supabaseKey: string | null;
}

const BUCKET = "esop-docs";
const ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg";
const MAX_BYTES = 10 * 1024 * 1024;
const SELECT_HOLDER = "id, name, email, id_no, batch, options_per_tranche, status, leaver_type, last_day, notes, updated_at, updated_by";

const letters = (k: number) => Array.from({ length: k }, (_, i) => String.fromCharCode(65 + i));

function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

/** A white cell you type into. Saves on leaving it (or Enter); Esc undoes. */
function Cell({ value, onSave, className = "", label }: { value: string; onSave: (v: string) => void; className?: string; label: string }) {
  return (
    <td className={`ed ${className}`}>
      <input
        key={value}
        aria-label={label}
        defaultValue={value}
        style={{ width: `${Math.max(3, value.length) + 1}ch` }}
        onInput={(e) => (e.currentTarget.style.width = `${Math.max(3, e.currentTarget.value.length) + 1}ch`)}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v !== value) onSave(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.value = value;
            e.currentTarget.blur();
          }
        }}
      />
    </td>
  );
}

export default function EsopSheet(props: Props) {
  const { company, role } = props;
  /* Batch, then name in natural order ("Holder 2" before "Holder 10"); rows
     added on the page stay at the bottom until the next visit. */
  const [holders, setHolders] = useState<EsopHolder[]>(() =>
    [...props.holders].sort((a, b) => a.batch - b.batch || a.name.localeCompare(b.name, "en", { numeric: true })),
  );
  const [batches, setBatches] = useState<EsopBatch[]>(props.batches);
  const [docs, setDocs] = useState<EsopDocument[]>(props.documents);
  const [tab, setTab] = useState<Tab>("holders");
  const [q, setQ] = useState("");
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState<{ id: string; kind: "row" | "files" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const upTarget = useRef<{ holder: EsopHolder; kind: DocKind } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const client = useMemo(
    () => (props.supabaseUrl && props.supabaseKey ? createBrowserClient(props.supabaseUrl, props.supabaseKey) : null),
    [props.supabaseUrl, props.supabaseKey],
  );
  const now = useMemo(() => today(), []);
  const batchMap = useMemo(() => new Map(batches.map((b) => [b.batch, b])), [batches]);
  const local = client ? "" : " (preview, not stored)";

  function say(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }

  /* ── saving ─────────────────────────────────────────────────────────── */

  async function saveHolder(h: EsopHolder, patch: Partial<EsopHolder>, done = "Saved") {
    setHolders((list) => list.map((x) => (x.id === h.id ? { ...x, ...patch } : x)));
    if (!client) return say(done + local);
    const { data, error } = await client.from("esop_holders").update(patch).eq("id", h.id).select("updated_at, updated_by").single();
    if (error) {
      setHolders((list) => list.map((x) => (x.id === h.id ? h : x)));
      return say(`Not saved: ${error.message}`);
    }
    setHolders((list) => list.map((x) => (x.id === h.id ? { ...x, ...data } : x)));
    say(done);
  }

  function setNumber(h: EsopHolder, field: "batch" | "options_per_tranche", raw: string) {
    const n = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(n)) return say("Please type a whole number.");
    void saveHolder(h, { [field]: n });
  }

  function setText(h: EsopHolder, field: "name" | "email", raw: string) {
    if (field === "name" && !raw) return say("A holder needs a name.");
    void saveHolder(h, { [field]: raw || null });
  }

  function setLastDay(h: EsopHolder, raw: string) {
    const d = readTypedDay(raw);
    if (d === null) return say("Type the date like 12 Jul 2024.");
    void saveHolder(h, { last_day: d || null });
  }

  async function addRow() {
    setTab("holders");
    setQ("");
    const draft = { name: "New holder", batch: batches.at(-1)?.batch ?? 1, options_per_tranche: 0, status: "Active" as const };
    if (!client) {
      setHolders((l) => [
        ...l,
        { ...draft, id: crypto.randomUUID(), email: null, id_no: null, leaver_type: null, last_day: null, notes: null, updated_at: new Date().toISOString(), updated_by: null },
      ]);
      return say("Row added — type over it" + local);
    }
    const { data, error } = await client.from("esop_holders").insert({ ...draft, company_id: company.id }).select(SELECT_HOLDER).single<EsopHolder>();
    if (error || !data) return say(`Could not add a row: ${error?.message ?? "unknown error"}`);
    setHolders((l) => [...l, data]);
    say("Row added — type over it");
  }

  function archive(h: EsopHolder) {
    setMenu(null);
    if (!window.confirm(`Archive ${h.name}? They move to the Archive tab (last day today). Nothing is deleted.`)) return;
    void saveHolder(h, { status: "Leaver", leaver_type: "Good", last_day: isoDay(now) }, `${h.name} moved to Archive`);
  }

  function restore(h: EsopHolder) {
    setMenu(null);
    void saveHolder(h, { status: "Active", leaver_type: null, last_day: null }, `${h.name} is back in Holders`);
  }

  async function saveBatch(b: EsopBatch, patch: Partial<EsopBatch>) {
    setBatches((l) => l.map((x) => (x.batch === b.batch ? { ...x, ...patch } : x)));
    if (!client) return say("Saved" + local);
    const { error } = await client.from("esop_batches").update(patch).eq("company_id", company.id).eq("batch", b.batch);
    if (error) {
      setBatches((l) => l.map((x) => (x.batch === b.batch ? b : x)));
      return say(`Not saved: ${error.message}`);
    }
    say("Saved");
  }

  async function addBatch() {
    const row: EsopBatch = { batch: (batches.at(-1)?.batch ?? 0) + 1, vesting_start: null, tranches: 4, note: null };
    if (client) {
      const { error } = await client.from("esop_batches").insert({ ...row, company_id: company.id });
      if (error) return say(`Could not add batch: ${error.message}`);
    }
    setBatches((l) => [...l, row]);
    say(`Batch ${row.batch} added — type its vesting start`);
  }

  /* ── documents ──────────────────────────────────────────────────────── */

  function pickFile(holder: EsopHolder, kind: DocKind) {
    upTarget.current = { holder, kind };
    if (fileRef.current) {
      fileRef.current.value = "";
      fileRef.current.click();
    }
  }

  async function upload(file: File) {
    const t = upTarget.current;
    if (!t) return;
    if (file.size > MAX_BYTES) return say("That file is over 10 MB.");
    const certs = docs.filter((d) => d.holder_id === t.holder.id && d.kind === "certificate").length;
    const tranche = t.kind === "certificate" ? Math.min(certs + 1, 10) : null;
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${company.id}/${t.holder.id}/${t.kind}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
    const fileName = file.name.slice(0, 200);
    if (!client) {
      setDocs((l) => [...l, { id: crypto.randomUUID(), holder_id: t.holder.id, kind: t.kind, tranche, path, file_name: fileName, uploaded_at: new Date().toISOString() }]);
      return say(`${file.name} uploaded${local}`);
    }
    say("Uploading…");
    const up = await client.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (up.error) return say(/bucket/i.test(up.error.message) ? "File storage is not set up yet: run supabase/105." : `Upload failed: ${up.error.message}`);
    const { data, error } = await client
      .from("esop_documents")
      .insert({ company_id: company.id, holder_id: t.holder.id, kind: t.kind, tranche, path, file_name: fileName, size_bytes: file.size, uploaded_by: props.viewer })
      .select("id, holder_id, kind, tranche, path, file_name, uploaded_at")
      .single<EsopDocument>();
    if (error || !data) return say(`Saved the file but not its record: ${error?.message ?? "unknown error"}`);
    setDocs((l) => [...l, data]);
    say(`${file.name} uploaded`);
  }

  async function openDoc(d: EsopDocument) {
    setMenu(null);
    if (!client) return say("Preview: files are not stored, so there is nothing to open.");
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(d.path, 60);
    if (error || !data) return say(`Could not open the file: ${error?.message ?? "unknown error"}`);
    window.open(data.signedUrl, "_blank", "noopener");
  }

  /* ── Excel and CSV ──────────────────────────────────────────────────── */

  function downloadExcel() {
    const docCount = (h: EsopHolder, k: DocKind) => docs.filter((d) => d.holder_id === h.id && d.kind === k).length;
    const sheets: XSheet[] = [
      {
        name: "Holders",
        widths: [24, 30, 14, 8, 14, 16, 14, 12, 12, 10, 14, 11, 16, 20],
        rows: [
          ["Holder", "Email", "ID no.", "Batch", "Vesting start", "Options / tranche", "Total options", "Vested", "Unvested", "% vested", "Next vesting", "Days to go", "Letter of Grant", "Option certificates"],
          ...holders
            .filter((h) => h.status === "Active")
            .map((h) => {
              const c = calcHolder(h, batchMap, now);
              return [h.name, h.email, h.id_no, h.batch, fmtDay(c.start), h.options_per_tranche, c.total, c.vested, c.total - c.vested, c.total ? Math.round((c.vested / c.total) * 100) / 100 : 0, fmtDay(c.next), c.daysToNext, docCount(h, "letter_of_grant") ? "On file" : "Missing", docCount(h, "certificate")];
            }),
        ],
      },
      {
        name: "Archive",
        widths: [24, 30, 14, 8, 12, 14, 14, 14, 12, 16, 20],
        rows: [
          ["Holder", "Email", "ID no.", "Batch", "Leaver type", "Last day", "Total options", "Options kept", "Forfeited", "Letter of Grant", "Option certificates"],
          ...holders
            .filter((h) => h.status === "Leaver")
            .map((h) => {
              const c = calcHolder(h, batchMap, now);
              return [h.name, h.email, h.id_no, h.batch, h.leaver_type, fmtDay(h.last_day), c.total, c.kept, c.total - c.kept, docCount(h, "letter_of_grant") ? "On file" : "Missing", docCount(h, "certificate")];
            }),
        ],
      },
      {
        name: "Vesting schedule",
        widths: [14, 8, 9, 16, 10, 12],
        rows: [["Vesting date", "Batch", "Tranche", "Certificates due", "Leavers", "Status"], ...schedule(holders, batches, now).map((r) => [fmtDay(r.date), r.batch, `T${r.tranche}`, r.certificates, r.leavers, statusOf(r.daysLeft)])],
      },
    ];
    const bytes = buildXlsx(sheets);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${company.name.replace(/[^\w]+/g, "-").replace(/-+$/, "")}-ESOP-${isoDay(now)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importCsv(file: File) {
    const { rows, problems } = readHolderCsv(await file.text());
    if (!rows.length) return say(problems[0] ?? "Nothing to import.");
    if (!window.confirm(`Add ${rows.length} holder(s) from ${file.name}?${problems.length ? ` ${problems.length} row(s) will be skipped.` : ""}`)) return;
    if (!client) {
      setHolders((l) => [...l, ...rows.map((r) => ({ ...r, id: crypto.randomUUID(), notes: null, updated_at: new Date().toISOString(), updated_by: null }))]);
      return say(`${rows.length} added${local}`);
    }
    const { data, error } = await client.from("esop_holders").insert(rows.map((r) => ({ ...r, company_id: company.id }))).select(SELECT_HOLDER);
    if (error) return say(`Import failed, nothing added: ${error.message}`);
    setHolders((l) => [...l, ...((data ?? []) as EsopHolder[])]);
    const missing = [...new Set(rows.map((r) => r.batch))].filter((b) => !batchMap.has(b));
    say(`${data?.length ?? 0} added${missing.length ? ` — add batch ${missing.join(", ")} under Vesting schedule` : ""}`);
  }

  /* ── figures ────────────────────────────────────────────────────────── */

  const match = (h: EsopHolder) => h.name.toLowerCase().includes(q.trim().toLowerCase());
  const active = holders.filter((h) => h.status === "Active");
  const leavers = holders.filter((h) => h.status === "Leaver");
  const sched = schedule(holders, batches, now);
  const nx = sched.find((r) => r.daysLeft >= 0);
  const vested = active.reduce((s, h) => s + calcHolder(h, batchMap, now).vested, 0);
  const granted = active.reduce((s, h) => s + calcHolder(h, batchMap, now).total, 0);
  const docsOf = (h: EsopHolder, kind: DocKind) => docs.filter((d) => d.holder_id === h.id && d.kind === kind);
  const updated = holders.reduce((a, h) => (h.updated_at > a ? h.updated_at : a), "");

  function rowNumber(h: EsopHolder, n: number, action: "archive" | "restore") {
    const open = menu?.id === h.id && menu.kind === "row";
    return (
      <td className="rn">
        <button className="rnb" onClick={() => setMenu(open ? null : { id: h.id, kind: "row" })} aria-label={`Row ${n} options`}>
          {n}
        </button>
        {open && (
          <div className="pop">
            {action === "archive" ? (
              <button onClick={() => archive(h)}>Move to Archive (leaver)</button>
            ) : (
              <button onClick={() => restore(h)}>Move back to Holders</button>
            )}
          </div>
        )}
      </td>
    );
  }

  function docCells(h: EsopHolder) {
    const log = docsOf(h, "letter_of_grant").at(-1);
    const certs = docsOf(h, "certificate");
    const open = menu?.id === h.id && menu.kind === "files";
    return (
      <>
        <td className="c">
          {log ? (
            <button className="e-doc" onClick={() => openDoc(log)} title={log.file_name}>
              📄 {log.file_name}
            </button>
          ) : (
            <button className="up" onClick={() => pickFile(h, "letter_of_grant")}>
              ⬆ Upload
            </button>
          )}
        </td>
        <td className="c rel">
          {certs.length > 0 && (
            <>
              <button className="e-doc" onClick={() => setMenu(open ? null : { id: h.id, kind: "files" })}>
                📁 {certs.length} file{certs.length > 1 ? "s" : ""}
              </button>{" "}
            </>
          )}
          <button className="up" onClick={() => pickFile(h, "certificate")} aria-label={`Upload a certificate for ${h.name}`}>
            ⬆
          </button>
          {open && (
            <div className="pop right">
              {certs.map((d) => (
                <button key={d.id} onClick={() => openDoc(d)}>
                  📜 {d.tranche ? `Tranche ${d.tranche} · ` : ""}
                  {d.file_name}
                </button>
              ))}
            </div>
          )}
        </td>
      </>
    );
  }

  const leaverCls: Record<LeaverType, string> = { Good: "t-g", Bad: "t-b", Unvested: "t-u" };

  return (
    <div className="esop" onClick={(e) => menu && !(e.target as HTMLElement).closest(".pop, .rnb, .e-doc") && setMenu(null)}>
      <header className="esop-head">
        <div className="fd">FOUNDERS DOC</div>
        <div className="vr" />
        {company.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small static logo from public/
          <img src={company.logo_url} alt={company.name} />
        ) : (
          <b>{company.name}</b>
        )}
        <div className="crumb">ESOP dashboard</div>
        <div className="me">
          <span className="lock">
            <b>●</b> {role === "admin" ? "Founders Doc admin" : "CEO access"}
          </span>
          <span className="t">Signed in as {role === "admin" ? "Founders Doc" : "CEO"}</span>
          <div className="av">{role === "admin" ? "FD" : "CEO"}</div>
        </div>
      </header>

      <main className="esop-main">
        <div className="head">
          <div>
            <h1>ESOP overview</h1>
            <p className="sub">Updated {fmtDay((updated || isoDay(now)).slice(0, 10))} · maintained by Founders Doc</p>
          </div>
        </div>

        <div className="kpis">
          <div className="k">
            <span>Active holders</span>
            <b>{active.length}</b>
            <small>
              Letters of Grant on file: {active.filter((h) => docsOf(h, "letter_of_grant").length).length} of {active.length}
            </small>
          </div>
          <div className="k">
            <span>Archived leavers</span>
            <b>{leavers.length}</b>
            <small>{(["Good", "Bad", "Unvested"] as const).map((t) => `${leavers.filter((h) => h.leaver_type === t).length} ${t.toLowerCase()}`).join(" · ")}</small>
          </div>
          <div className="k">
            <span>Options vested</span>
            <b>{num(vested)}</b>
            <small>
              {granted ? Math.round((vested / granted) * 100) : 0}% of {num(granted)} granted
            </small>
          </div>
          <div className="k hl">
            <span>Next vesting · in {nx ? nx.daysLeft : "–"} days</span>
            <b>{nx ? fmtDay(nx.date) : "–"}</b>
            <small>{nx ? `Batch ${nx.batch}, Tranche ${nx.tranche} · ${nx.certificates} certificate(s)` : ""}</small>
          </div>
        </div>

        <section className="e-sheet">
          <div className="bar">
            <label className="e-search">
              <Ico>
                <circle cx="11" cy="11" r="6" />
                <path d="M20 20l-4.5-4.5" />
              </Ico>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search holder" />
            </label>
            <button className="e-btn g" onClick={addRow}>
              <Ico>
                <path d="M12 5v14M5 12h14" />
              </Ico>
              Add row
            </button>
            <button className="e-btn" onClick={downloadExcel}>
              <Ico>
                <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
              </Ico>
              Download Excel
            </button>
            <span className="e-hint">White cells can be edited · grey cells calculate themselves · gold rows vest within 7 days · ⬆ upload documents</span>
          </div>

          <div className="e-grid">
            {tab === "holders" && (
              <table>
                <thead>
                  <tr className="letters">
                    <th className="rn" />
                    {letters(13).map((l) => (
                      <th key={l}>{l}</th>
                    ))}
                  </tr>
                  <tr className="names">
                    <th className="rn" />
                    <th>Holder</th>
                    <th>Email</th>
                    <th>Batch</th>
                    <th>Vesting start</th>
                    <th>Options / tranche</th>
                    <th>Total options</th>
                    <th>Vested</th>
                    <th>Unvested</th>
                    <th>% vested</th>
                    <th>Next vesting</th>
                    <th>Days to go</th>
                    <th>Letter of Grant</th>
                    <th>Option certificates</th>
                  </tr>
                </thead>
                <tbody>
                  {active.filter(match).map((h, i) => {
                    const c = calcHolder(h, batchMap, now);
                    const p = c.total ? Math.round((c.vested / c.total) * 100) : 0;
                    return (
                      <tr key={h.id} className={c.daysToNext !== null && c.daysToNext <= 7 ? "soon" : ""}>
                        {rowNumber(h, i + 2, "archive")}
                        <Cell label="Holder" value={h.name} onSave={(v) => setText(h, "name", v)} />
                        <Cell label="Email" value={h.email ?? ""} onSave={(v) => setText(h, "email", v)} />
                        <Cell label="Batch" className="c" value={String(h.batch)} onSave={(v) => setNumber(h, "batch", v)} />
                        <td className="calc c">{fmtDay(c.start)}</td>
                        <Cell label="Options per tranche" className="num" value={num(h.options_per_tranche)} onSave={(v) => setNumber(h, "options_per_tranche", v)} />
                        <td className="calc num">{num(c.total)}</td>
                        <td className="calc num">{num(c.vested)}</td>
                        <td className="calc num">{num(c.total - c.vested)}</td>
                        <td className="calc">
                          <div className="pct">
                            <i style={{ width: `${p * 0.6}px` }} />
                            <span>{p}%</span>
                          </div>
                        </td>
                        <td className="calc c">{fmtDay(c.next)}</td>
                        <td className="calc c">{c.daysToNext === null ? "–" : `${c.daysToNext} days`}</td>
                        {docCells(h)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {tab === "archive" && (
              <table>
                <thead>
                  <tr className="letters">
                    <th className="rn" />
                    {letters(10).map((l) => (
                      <th key={l}>{l}</th>
                    ))}
                  </tr>
                  <tr className="names">
                    <th className="rn" />
                    <th>Holder</th>
                    <th>Email</th>
                    <th>Batch</th>
                    <th>Leaver type</th>
                    <th>Last day</th>
                    <th>Total options</th>
                    <th>Options kept</th>
                    <th>Forfeited</th>
                    <th>Letter of Grant</th>
                    <th>Option certificates</th>
                  </tr>
                </thead>
                <tbody>
                  {leavers.filter(match).map((h, i) => {
                    const c = calcHolder(h, batchMap, now);
                    const t = h.leaver_type ?? "Good";
                    return (
                      <tr key={h.id}>
                        {rowNumber(h, i + 2, "restore")}
                        <Cell label="Holder" value={h.name} onSave={(v) => setText(h, "name", v)} />
                        <Cell label="Email" value={h.email ?? ""} onSave={(v) => setText(h, "email", v)} />
                        <td className="ed c">{h.batch}</td>
                        <td className="ed c">
                          <select
                            aria-label="Leaver type"
                            className={`tag ${leaverCls[t]}`}
                            value={t}
                            onChange={(e) => void saveHolder(h, { leaver_type: e.target.value as LeaverType })}
                          >
                            <option>Good</option>
                            <option>Bad</option>
                            <option>Unvested</option>
                          </select>
                        </td>
                        <Cell label="Last day" className="c" value={fmtDay(h.last_day)} onSave={(v) => setLastDay(h, v)} />
                        <td className="calc num">{num(c.total)}</td>
                        <td className="calc num">{num(c.kept)}</td>
                        <td className="calc num">{num(c.total - c.kept)}</td>
                        {docCells(h)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {tab === "schedule" && (
              <>
                <table>
                  <thead>
                    <tr className="letters">
                      <th className="rn" />
                      {letters(6).map((l) => (
                        <th key={l}>{l}</th>
                      ))}
                    </tr>
                    <tr className="names">
                      <th className="rn" />
                      <th>Vesting date</th>
                      <th>Batch</th>
                      <th>Tranche</th>
                      <th>Certificates due</th>
                      <th>Leavers</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sched.map((x, i) => {
                      const st = statusOf(x.daysLeft);
                      return (
                        <tr key={`${x.batch}-${x.tranche}`} className={st === "This week" ? "soon" : ""}>
                          <td className="rn">{i + 2}</td>
                          <td className="calc">{fmtDay(x.date)}</td>
                          <td className="calc c">{x.batch}</td>
                          <td className="calc c">T{x.tranche}</td>
                          <td className="calc num">{num(x.certificates)}</td>
                          <td className="calc num">{num(x.leavers)}</td>
                          <td className="calc c">
                            {st === "Vested" ? <span style={{ color: "#9a9a9a" }}>Vested</span> : st === "Upcoming" ? "Upcoming" : <span className="tag t-s">{st}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {role === "admin" && (
                  <div className="fdonly">
                    <p>
                      <b>Batch dates</b> · Founders Doc only. Tranche 1 vests one year after the vesting start, then once a year.
                    </p>
                    <table>
                      <thead>
                        <tr className="names solo">
                          <th className="rn" />
                          <th>Batch</th>
                          <th>Vesting start</th>
                          <th>Yearly tranches</th>
                          <th>Holders</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batches.map((b, i) => (
                          <tr key={b.batch}>
                            <td className="rn">{i + 2}</td>
                            <td className="calc c">{b.batch}</td>
                            <Cell
                              label="Vesting start"
                              className="c"
                              value={fmtDay(b.vesting_start)}
                              onSave={(v) => {
                                const d = readTypedDay(v);
                                if (d === null) return say("Type the date like 1 Mar 2023.");
                                void saveBatch(b, { vesting_start: d || null });
                              }}
                            />
                            <Cell
                              label="Yearly tranches"
                              className="c"
                              value={String(b.tranches)}
                              onSave={(v) => {
                                const n = Number.parseInt(v, 10);
                                if (!Number.isFinite(n) || n < 1 || n > 10) return say("Tranches must be 1 to 10.");
                                void saveBatch(b, { tranches: n });
                              }}
                            />
                            <td className="calc num">{holders.filter((h) => h.batch === b.batch).length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="e-btn" onClick={addBatch}>
                      <Ico>
                        <path d="M12 5v14M5 12h14" />
                      </Ico>
                      Add batch
                    </button>{" "}
                    <button className="e-btn ghost" onClick={() => csvRef.current?.click()} title="Add holders from a CSV with the Google Sheet's columns">
                      Import holders (CSV)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="tabs">
            {(
              [
                ["holders", "Holders"],
                ["archive", "Archive"],
                ["schedule", "Vesting schedule"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
            <span className="soon2">
              <Ico>
                <path d="M4 20c3-1 4-5 7-5s2 4 5 4 3-6 4-7" />
              </Ico>
              E-signing of certificates: coming later
            </span>
          </div>
        </section>
        <p className="e-foot">
          {/test/i.test(company.name) || !client ? "Test data · placeholder names and option numbers · " : ""}
          {client ? "changes save automatically" : "preview: changes are not stored"}
        </p>
      </main>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void upload(f);
        }}
      />
      <input
        ref={csvRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void importCsv(f);
          e.currentTarget.value = "";
        }}
      />
      <div className={`e-toast ${toast ? "on" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function statusOf(daysLeft: number): "Vested" | "This week" | "This month" | "Upcoming" {
  return daysLeft < 0 ? "Vested" : daysLeft <= 7 ? "This week" : daysLeft <= 31 ? "This month" : "Upcoming";
}
