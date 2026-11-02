"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { matchFile } from "@/lib/esop/match";
import type { Envelope, Signer } from "@/lib/sign/store";

/* Send: pick PDFs (e.g. Option Certificates downloaded as PDF), each matched
   to an ESOP holder by its file name; the Director signs first, then the
   holder. "One batch" gives the Director ONE link for all of them.
   Track: who has signed, a new link for whoever's turn it is, the signed PDF. */

interface Holder {
  id: string;
  name: string;
  email: string | null;
  batch: number;
  status: string;
}
interface Row {
  key: string;
  file: File;
  title: string;
  holderId: string;
  tranche: string;
  signers: Array<{ name: string; email: string; role: string }>;
}
interface Sent {
  name: string;
  email: string;
  role: string;
  documents: string[];
  link: string;
  emailed: boolean;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function SignAdmin({
  recent,
  holders,
  director,
  hook,
  preview,
}: {
  recent: Array<Envelope & { signers: Signer[] }>;
  holders: Holder[];
  director: string;
  hook: boolean;
  preview: boolean;
}) {
  const router = useRouter();
  const pick = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"each" | "batch">("each");
  const [dir, setDir] = useState({ name: director, email: "", role: "Director" });
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [copied, setCopied] = useState("");
  const active = holders.filter((h) => h.status === "Active");

  function add(files: FileList) {
    const list = Array.from(files).filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    setRows((r) => [
      ...r,
      ...list.map((file, i) => {
        const m = matchFile(file.name, holders.map((h) => ({ id: h.id, name: h.name, legal_name: null })));
        const h = holders.find((x) => x.id === m.holderId);
        return {
          key: `${Date.now()}-${i}-${file.name}`,
          file,
          title: file.name.replace(/\.pdf$/i, ""),
          holderId: h?.id ?? "",
          tranche: m.tranche ? String(m.tranche) : "",
          signers: [{ name: h?.name ?? "", email: h?.email ?? "", role: "Option Holder" }],
        };
      }),
    ]);
  }
  const setRow = (key: string, patch: Partial<Row>) => setRows((l) => l.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  function setHolder(r: Row, id: string) {
    const h = holders.find((x) => x.id === id);
    setRow(r.key, { holderId: id, signers: h ? [{ name: h.name, email: h.email ?? "", role: "Option Holder" }, ...r.signers.slice(1)] : r.signers });
  }
  function setSigner(r: Row, i: number, patch: Partial<Row["signers"][number]>) {
    setRow(r.key, { signers: r.signers.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  }

  async function send() {
    setErr("");
    if (!rows.length) return setErr("Add at least one PDF.");
    if (!dir.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dir.email.trim())) return setErr("Fill in the first signer's name and email (e.g. the Director).");
    for (const r of rows) for (const s of r.signers) if (!s.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email.trim())) return setErr(`${r.title}: every signer needs a name and an email.`);
    setBusy(true);
    const form = new FormData();
    form.set(
      "meta",
      JSON.stringify({
        batch: mode === "batch",
        message,
        docs: rows.map((r) => ({
          title: r.title,
          holderId: r.holderId || undefined,
          tranche: r.tranche ? Number.parseInt(r.tranche, 10) : undefined,
          signers: [dir, ...r.signers],
        })),
      }),
    );
    rows.forEach((r, i) => form.set(`file${i}`, r.file));
    try {
      const res = await fetch("/api/sign/envelopes", { method: "POST", body: form });
      const j = (await res.json().catch(() => ({}))) as { error?: string; links?: Sent[] };
      if (!res.ok) throw new Error(j.error || "Could not send.");
      setSent(j.links ?? []);
      setRows([]);
      setMessage("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      window.prompt("Copy this link:", text);
    }
  }
  async function newLink(envelopeId: string, signerId: string) {
    const res = await fetch("/api/sign/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ envelopeId, signerId }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; link?: string };
    if (!res.ok || !j.link) return setErr(j.error || "Could not make a new link.");
    await copy(j.link);
    router.refresh();
  }

  const holderName = (id: string | null) => holders.find((h) => h.id === id)?.name;

  return (
    <main className="fdsign admin">
      <header className="fs-head">
        <span className="fs-pill">FD SIGN</span>
        <span className="fs-by">Founders Doc · admin</span>
        <span className="fs-me">{preview ? "Preview: nothing is stored" : hook ? "Emails: via Zapier ✓" : "Emails: not set up, copy the links"}</span>
      </header>

      <div className="fs-admin">
        <section className="fs-card">
          <h2>Send for signing</h2>
          <p className="fs-small">Upload the certificates as PDFs (Google Docs → File → Download → PDF). Each is matched to the holder by its file name. The first signer signs first, then the holder.</p>

          <div className="fs-seg wide">
            <button className={mode === "each" ? "on" : ""} onClick={() => setMode("each")}>
              Each certificate
              <small>a separate link per certificate</small>
            </button>
            <button className={mode === "batch" ? "on" : ""} onClick={() => setMode("batch")}>
              One batch
              <small>the first signer gets ONE link for all</small>
            </button>
          </div>

          <div className="fs-grid3">
            <label>
              First signer
              <input value={dir.name} onChange={(e) => setDir({ ...dir, name: e.target.value })} placeholder="Aditya Haripurkar" />
            </label>
            <label>
              Email
              <input value={dir.email} onChange={(e) => setDir({ ...dir, email: e.target.value })} placeholder="director@company.com" />
            </label>
            <label>
              Role
              <input value={dir.role} onChange={(e) => setDir({ ...dir, role: e.target.value })} />
            </label>
          </div>

          <div className="fs-files">
            {rows.map((r) => (
              <div key={r.key} className="fs-file">
                <div className="fs-file-top">
                  <input className="fs-title" value={r.title} onChange={(e) => setRow(r.key, { title: e.target.value })} aria-label="Document title" />
                  <button className="fs-x" onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))} aria-label="Remove">
                    ✕
                  </button>
                </div>
                <div className="fs-grid3">
                  <label>
                    ESOP holder (files the signed copy on their row)
                    <select value={r.holderId} onChange={(e) => setHolder(r, e.target.value)}>
                      <option value="">— not an ESOP certificate —</option>
                      {active.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} (Batch {h.batch})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tranche
                    <input value={r.tranche} onChange={(e) => setRow(r.key, { tranche: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="e.g. 3" />
                  </label>
                  <span />
                </div>
                {r.signers.map((s, i) => (
                  <div key={i} className="fs-grid3">
                    <label>
                      {i === 0 ? "Then: holder" : `Then: signer ${i + 2}`}
                      <input value={s.name} onChange={(e) => setSigner(r, i, { name: e.target.value })} placeholder="Full name" />
                    </label>
                    <label>
                      Email
                      <input value={s.email} onChange={(e) => setSigner(r, i, { email: e.target.value })} placeholder="name@company.com" />
                    </label>
                    <label>
                      Role
                      <input value={s.role} onChange={(e) => setSigner(r, i, { role: e.target.value })} />
                    </label>
                  </div>
                ))}
                <button className="fs-link" onClick={() => setRow(r.key, { signers: [...r.signers, { name: "", email: "", role: "Signer" }] })}>
                  + add another signer
                </button>
              </div>
            ))}
          </div>

          <button className="fs-btn ghost" onClick={() => pick.current?.click()}>
            ⬆ Add PDFs
          </button>
          <input
            ref={pick}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              if (e.currentTarget.files?.length) add(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
          />

          <label className="fs-block">
            Message to signers (optional)
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="e.g. Your Option Certificate for Batch 5, Tranche 3." />
          </label>
          {err && <p className="fs-err">{err}</p>}
          <button className="fs-btn primary" disabled={busy || !rows.length} onClick={() => void send()}>
            {busy ? "Sending…" : rows.length > 1 && mode === "batch" ? `Send ${rows.length} as one batch` : `Send ${rows.length || ""} for signing`}
          </button>

          {sent && (
            <div className="fs-sent">
              <b>Sent ✓</b>
              {sent.map((s) => (
                <div key={s.link} className="fs-sent-row">
                  <span>
                    {s.name} ({s.role}) · {s.documents.length} document{s.documents.length > 1 ? "s" : ""} · {s.emailed ? "emailed ✓" : "not emailed: copy the link"}
                  </span>
                  <button className="fs-btn ghost sm" onClick={() => void copy(s.link)}>
                    {copied === s.link ? "Copied ✓" : "Copy link"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="fs-card">
          <h2>Sent documents</h2>
          {!recent.length && <p className="fs-small">Nothing sent yet.</p>}
          <div className="fs-list">
            {recent.map((e) => (
              <div key={e.id} className="fs-item">
                <div className="fs-item-top">
                  <b>{e.title}</b>
                  <span className={`fs-status ${e.status}`}>{e.status === "completed" ? "✓ Completed" : e.status === "voided" ? "Cancelled" : "Out for signing"}</span>
                </div>
                <div className="fs-small">
                  {holderName(e.esop_holder_id) ? `ESOP: ${holderName(e.esop_holder_id)}${e.esop_tranche ? ` · Tranche ${e.esop_tranche}` : ""} · ` : ""}
                  {e.batch_id ? "batch · " : ""}sent {fmt(e.created_at)}
                  {e.completed_at ? ` · completed ${fmt(e.completed_at)}` : ""}
                  {e.filed_document_id ? " · filed on the dashboard ✓" : ""}
                </div>
                <div className="fs-people">
                  {e.signers.map((s) => (
                    <span key={s.id} className={`fs-chip ${s.status}`}>
                      {s.status === "signed" ? "✓" : s.status === "invited" ? "✍" : "⏳"} {s.position}. {s.name} · {s.role}
                      {s.signed_at ? ` · ${fmt(s.signed_at)}` : s.viewed_at ? " · opened" : ""}
                      {s.status === "invited" && (
                        <button className="fs-link" onClick={() => void newLink(e.id, s.id)} title="Make a new link and copy it">
                          new link
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                <div className="fs-item-actions">
                  <a className="fs-link" href={`/api/sign/file?e=${e.id}`} target="_blank" rel="noreferrer">
                    original
                  </a>
                  <a className="fs-link" href={`/api/sign/file?e=${e.id}&signed=1`} target="_blank" rel="noreferrer">
                    {e.status === "completed" ? "signed PDF" : "PDF so far"}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      {copied && <div className="fs-toast">Link copied</div>}
    </main>
  );
}
