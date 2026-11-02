"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { matchFile } from "@/lib/esop/match";
import type { Envelope, Signer } from "@/lib/sign/store";

/* FD Sign — the Founders Doc side, in the site's own look (globals.css
   tokens: Geist/Inter, ink and gold, light and dark).
   Four numbered steps: 1 documents · 2 how the first signer signs (each /
   batch, explained with live numbers) · 3 signers and order · 4 review & send.
   Then "Sent" tracks every document. */

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

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
  const [tab, setTab] = useState<"new" | "sent">("new");
  const [mode, setMode] = useState<"each" | "batch">("each");
  const [dir, setDir] = useState({ name: director, email: "", role: "Director" });
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [toast, setToast] = useState("");
  const [over, setOver] = useState(false);
  const active = holders.filter((h) => h.status === "Active");
  const n = rows.length;
  const batch = mode === "batch" && n > 1;
  const first = dir.name.trim() || "The first signer";
  const open = recent.filter((e) => e.status === "sent").length;

  function say(t: string) {
    setToast(t);
    setTimeout(() => setToast(""), 1800);
  }

  function add(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!list.length) return setErr("Only PDF files can be sent for signing.");
    setErr("");
    setSent(null);
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
    if (!n) return setErr("Add at least one PDF in step 1.");
    if (!dir.name.trim() || !EMAIL.test(dir.email.trim())) return setErr("Step 3: fill in the first signer's name and email.");
    for (const r of rows) for (const s of r.signers) if (!s.name.trim() || !EMAIL.test(s.email.trim())) return setErr(`Step 3 · ${r.title}: every signer needs a name and an email.`);
    setBusy(true);
    const form = new FormData();
    form.set(
      "meta",
      JSON.stringify({
        batch,
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
      say("Link copied");
    } catch {
      window.prompt("Copy this link:", text);
    }
  }
  async function newLink(envelopeId: string, signerId: string) {
    const res = await fetch("/api/sign/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ envelopeId, signerId }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; link?: string };
    if (!res.ok || !j.link) return say(j.error || "Could not make a new link.");
    await copy(j.link);
    router.refresh();
  }
  const holderName = (id: string | null) => holders.find((h) => h.id === id)?.name;

  /* The plain-English preview of who gets which email. */
  const holderNames = rows.map((r) => r.signers[0]?.name || "the holder");
  const dirEmails = batch ? 1 : n;

  return (
    <main className="fdsign fs-adm">
      <div className="fs-adm-wrap">
        <div className="fs-adm-head">
          <div>
            <span className="fd-mark">FD Sign</span>
            <h1>Send for signing</h1>
            <p className="fs-lead">Option Certificates and other PDFs, signed in order, with an audit trail on every signed copy.</p>
          </div>
          <div className="fs-status-pill" title={hook ? "Signing emails go out automatically" : "Set SIGN_HOOK_URL to email links automatically"}>
            <i className={preview ? "" : hook ? "on" : "warn"} />
            {preview ? "Preview: nothing is stored" : hook ? "Emails on" : "Emails off: copy links"}
          </div>
        </div>

        <div className="fs-tabbar" role="tablist">
          <button role="tab" aria-selected={tab === "new"} className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>
            New
          </button>
          <button role="tab" aria-selected={tab === "sent"} className={tab === "sent" ? "on" : ""} onClick={() => setTab("sent")}>
            Sent <span className="fs-count">{recent.length}</span>
            {open > 0 && <span className="fs-count gold">{open} open</span>}
          </button>
        </div>

        {tab === "new" && (
          <div className="fs-adm-grid">
            <div className="fs-steps">
              {/* 1 · documents */}
              <section className="fs-step">
                <header>
                  <span className="fs-num">1</span>
                  <div>
                    <h2>Documents</h2>
                    <p>Download each certificate as a PDF (Google Docs → File → Download → PDF). Each is matched to the holder by its file name.</p>
                  </div>
                </header>
                <div
                  className={`fs-drop ${over ? "over" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(true);
                  }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(false);
                    add(e.dataTransfer.files);
                  }}
                >
                  <div className="fs-drop-ico">⬆</div>
                  <b>Drop PDFs here</b>
                  <span>or</span>
                  <button className="btn btn-black" onClick={() => pick.current?.click()}>
                    Choose files
                  </button>
                  <small>PDF · up to 4 MB in total per send</small>
                </div>
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
                {n > 0 && (
                  <div className="fs-docs">
                    {rows.map((r, i) => (
                      <div key={r.key} className="fs-docrow">
                        <span className="fs-docico">PDF</span>
                        <input className="input fs-doctitle" value={r.title} onChange={(e) => setRow(r.key, { title: e.target.value })} aria-label={`Document ${i + 1} title`} />
                        <select className="input" value={r.holderId} onChange={(e) => setHolder(r, e.target.value)} aria-label="ESOP holder">
                          <option value="">Not an ESOP certificate</option>
                          {active.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name} · Batch {h.batch}
                            </option>
                          ))}
                        </select>
                        <input className="input fs-tr" value={r.tranche} onChange={(e) => setRow(r.key, { tranche: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="Tranche" aria-label="Tranche" />
                        <button className="fs-icon" onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))} aria-label="Remove">
                          ✕
                        </button>
                      </div>
                    ))}
                    <p className="fs-hint">{rows.filter((r) => r.holderId).length} of {n} matched to an ESOP holder. A matched certificate is filed on the holder&rsquo;s row once signed.</p>
                  </div>
                )}
              </section>

              {/* 2 · each or batch */}
              <section className="fs-step">
                <header>
                  <span className="fs-num">2</span>
                  <div>
                    <h2>How should {dir.name.trim() ? dir.name.trim().split(/\s+/)[0] : "the first signer"} sign?</h2>
                    <p>The holders always get their own email. This only changes what the first signer (the Director) receives.</p>
                  </div>
                </header>
                <div className="fs-modes">
                  <button className={`fs-mode ${mode === "each" ? "on" : ""}`} onClick={() => setMode("each")}>
                    <span className="fs-radio" />
                    <b>Each certificate</b>
                    <span className="fs-viz">
                      {Array.from({ length: Math.max(1, Math.min(n || 3, 4)) }).map((_, k) => (
                        <i key={k} className="mail">
                          ✉<em>1</em>
                        </i>
                      ))}
                    </span>
                    <span>
                      {first} gets <b>{plural(Math.max(n, 1), "email")}</b>, one per certificate, and signs each one separately.
                    </span>
                    <small>Best for one certificate, or when they arrive at different times.</small>
                  </button>
                  <button className={`fs-mode ${mode === "batch" ? "on" : ""} ${n === 1 ? "dim" : ""}`} onClick={() => setMode("batch")}>
                    <span className="fs-radio" />
                    <b>One batch</b>
                    <span className="fs-viz">
                      <i className="mail big">
                        ✉<em>{Math.max(n, 2)}</em>
                      </i>
                    </span>
                    <span>
                      {first} gets <b>1 email</b> with all {n > 1 ? n : "the"} certificates, and signs them all at once.
                    </span>
                    <small>{n === 1 ? "Needs 2 or more documents: with 1 it works like Each." : "Best for a vesting batch, e.g. 8 holders on the same date."}</small>
                  </button>
                </div>
              </section>

              {/* 3 · signers */}
              <section className="fs-step">
                <header>
                  <span className="fs-num">3</span>
                  <div>
                    <h2>Signers and order</h2>
                    <p>The first signer signs every document first. Each holder gets their link only after that.</p>
                  </div>
                </header>
                <div className="fs-signer first">
                  <span className="fs-av">{initials(dir.name)}</span>
                  <div className="fs-signer-f">
                    <label>
                      Name
                      <input className="input" value={dir.name} onChange={(e) => setDir({ ...dir, name: e.target.value })} placeholder="Aditya Haripurkar" />
                    </label>
                    <label>
                      Email
                      <input className="input" value={dir.email} onChange={(e) => setDir({ ...dir, email: e.target.value })} placeholder="director@company.com" />
                    </label>
                    <label>
                      Role
                      <input className="input" value={dir.role} onChange={(e) => setDir({ ...dir, role: e.target.value })} />
                    </label>
                  </div>
                  <span className="fs-order">Signs 1st, on every document</span>
                  <span />
                </div>
                {rows.map((r, d) => (
                  <div key={r.key} className="fs-sgroup">
                    <div className="fs-sgroup-h">
                      <span className="fs-docico sm">PDF</span>
                      <b title={r.title}>
                        {d + 1}. {r.title}
                      </b>
                      <span className="fs-hint">after {dir.name.trim() || "the first signer"}</span>
                    </div>
                    {r.signers.map((s, i) => (
                      <div key={i} className="fs-signer">
                        <span className="fs-av alt">{initials(s.name)}</span>
                        <div className="fs-signer-f">
                          <label>
                            Name
                            <input className="input" value={s.name} onChange={(e) => setSigner(r, i, { name: e.target.value })} placeholder="Full name" />
                          </label>
                          <label>
                            Email
                            <input className="input" value={s.email} onChange={(e) => setSigner(r, i, { email: e.target.value })} placeholder="name@company.com" />
                          </label>
                          <label>
                            Role
                            <input className="input" value={s.role} onChange={(e) => setSigner(r, i, { role: e.target.value })} />
                          </label>
                        </div>
                        <span className="fs-order">Signs {i + 2 === 2 ? "2nd" : i + 2 === 3 ? "3rd" : `${i + 2}th`}</span>
                        {r.signers.length > 1 ? (
                          <button className="fs-icon" onClick={() => setRow(r.key, { signers: r.signers.filter((_, k) => k !== i) })} aria-label={`Remove ${s.name || "this signer"}`} title="Remove this signer">
                            ✕
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                    <button className="fs-textbtn" onClick={() => setRow(r.key, { signers: [...r.signers, { name: "", email: "", role: "Signer" }] })}>
                      + add a signer to this document
                    </button>
                  </div>
                ))}
                {n === 0 && <p className="fs-hint">Add documents in step 1 to fill in the holders.</p>}
              </section>

              {/* 4 · review */}
              <section className="fs-step">
                <header>
                  <span className="fs-num">4</span>
                  <div>
                    <h2>Review and send</h2>
                    <p>What happens when you press Send.</p>
                  </div>
                </header>
                <ol className="fs-flow">
                  <li>
                    <b>
                      {first} gets {plural(dirEmails, "email")}
                    </b>
                    <span>{batch ? `One link for all ${n} certificates, signed once.` : n > 1 ? `One link per certificate (${n} links).` : "One link to sign the certificate."}</span>
                  </li>
                  <li>
                    <b>Then each holder gets their own email</b>
                    <span>{n ? holderNames.join(", ") : "One per document."}</span>
                  </li>
                  <li>
                    <b>When everyone has signed</b>
                    <span>The signed PDF (with signature page and audit trail) is filed on the holder&rsquo;s row, and everyone gets a copy.</span>
                  </li>
                </ol>
                <label className="fs-field">
                  <span>
                    Message to signers <em>optional</em>
                  </span>
                  <textarea className="input" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="e.g. Your Option Certificate for Batch 5, Tranche 3." />
                </label>
                {err && <p className="fs-err">{err}</p>}
                <div className="fs-sendbar">
                  <span className="fs-hint">{n ? `${plural(n, "document")} · ${batch ? "one batch" : "each separately"}` : "No documents yet"}</span>
                  <button className="btn btn-gold" disabled={busy || !n} onClick={() => void send()}>
                    {busy ? "Sending…" : batch ? `Send ${n} as one batch` : `Send ${n ? plural(n, "document") : ""} for signing`}
                  </button>
                </div>
                {sent && (
                  <div className="fs-done">
                    <b>✓ Sent</b>
                    {sent.map((s) => (
                      <div key={s.link} className="fs-done-row">
                        <span className="fs-av sm">{initials(s.name)}</span>
                        <span>
                          <b>{s.name}</b> · {plural(s.documents.length, "document")} · {s.emailed ? "emailed" : "copy and send this link"}
                        </span>
                        <button className="dbtn" onClick={() => void copy(s.link)}>
                          Copy link
                        </button>
                      </div>
                    ))}
                    <button className="fs-textbtn" onClick={() => setTab("sent")}>
                      Track in Sent →
                    </button>
                  </div>
                )}
              </section>
            </div>

            <aside className="fs-how">
              <h3>How it works</h3>
              <ol>
                <li>
                  <b>Send</b>
                  <span>Upload the certificates, set who signs and in what order.</span>
                </li>
                <li>
                  <b>Sign</b>
                  <span>Each signer opens a private link, reads the PDF, draws or types a signature and agrees to sign electronically.</span>
                </li>
                <li>
                  <b>File</b>
                  <span>The signed copy gets a signature page and an audit trail (time, IP, browser, document fingerprint) and is filed on the ESOP dashboard.</span>
                </li>
              </ol>
              <div className="fs-how-note">Electronic signatures are recognised under s 8 of the Electronic Transactions Act 2010 (Singapore).</div>
            </aside>
          </div>
        )}

        {tab === "sent" && (
          <section className="fs-sentlist">
            {!recent.length && <p className="fs-hint">Nothing sent yet.</p>}
            {recent.map((e) => {
              const signed = e.signers.filter((s) => s.status === "signed").length;
              const pct = e.signers.length ? Math.round((signed / e.signers.length) * 100) : 0;
              return (
                <article key={e.id} className="fs-env">
                  <div className="fs-env-top">
                    <div>
                      <b>{e.title}</b>
                      <span className="fs-hint">
                        {holderName(e.esop_holder_id) ? `${holderName(e.esop_holder_id)}${e.esop_tranche ? ` · Tranche ${e.esop_tranche}` : ""} · ` : ""}
                        {e.batch_id ? "batch · " : ""}sent {fmt(e.created_at)}
                        {e.filed_document_id ? " · filed on the dashboard" : ""}
                      </span>
                    </div>
                    <span className={`fs-badge ${e.status}`}>{e.status === "completed" ? "Completed" : e.status === "voided" ? "Cancelled" : `${signed} of ${e.signers.length} signed`}</span>
                  </div>
                  <div className="fs-bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <div className="fs-env-people">
                    {e.signers.map((s) => (
                      <div key={s.id} className={`fs-person ${s.status}`}>
                        <span className="fs-av sm">{initials(s.name)}</span>
                        <div>
                          <b>
                            {s.position}. {s.name}
                          </b>
                          <span>
                            {s.role} · {s.status === "signed" ? `signed ${fmt(s.signed_at)}` : s.status === "invited" ? (s.viewed_at ? "opened, not signed yet" : "link sent") : "waiting for their turn"}
                          </span>
                        </div>
                        {s.status === "invited" && (
                          <button className="dbtn" onClick={() => void newLink(e.id, s.id)} title="Make a new link and copy it">
                            New link
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="fs-env-actions">
                    <a className="dbtn" href={`/api/sign/file?e=${e.id}`} target="_blank" rel="noreferrer">
                      Original
                    </a>
                    <a className={`dbtn ${e.status === "completed" ? "gold" : ""}`} href={`/api/sign/file?e=${e.id}&signed=1`} target="_blank" rel="noreferrer">
                      {e.status === "completed" ? "Signed PDF" : "PDF so far"}
                    </a>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
      <div className={`fd-toast ${toast ? "on" : ""}`} role="status">
        {toast}
      </div>
    </main>
  );
}
