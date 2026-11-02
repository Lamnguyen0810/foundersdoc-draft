"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { matchFile } from "@/lib/esop/match";
import type { Envelope, Signer } from "@/lib/sign/store";
import { autoPlace, colour, type Box, type BoxKind } from "@/lib/sign/boxes";
import type { PdfInfo } from "../../sign/PdfPages";

/* pdf.js only runs in the browser */
const BoxEditor = dynamic(() => import("./BoxEditor"), { ssr: false, loading: () => <div className="fs-pages-wait">Loading the document…</div> });

/* FD Sign — the Founders Doc side, in the site's own look (globals.css
   tokens: Geist/Inter, ink and gold, light and dark).
   Five numbered steps: 1 documents · 2 how the first signer signs (each /
   batch, explained with live numbers) · 3 signers and order · 4 signature
   boxes on the lines (placed automatically, drag to adjust) · 5 review & send.
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
  boxes: Box[];
  info: PdfInfo | null;
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
  boxesReady = true,
  codesReady = true,
}: {
  recent: Array<Envelope & { signers: Signer[] }>;
  holders: Holder[];
  director: string;
  hook: boolean;
  preview: boolean;
  boxesReady?: boolean;
  codesReady?: boolean;
}) {
  const router = useRouter();
  const pick = useRef<HTMLInputElement>(null);
  /* The tab lives in the address (?tab=sent), so the browser's Back button
     returns from Sent to New. */
  const params = useSearchParams();
  const tab: "new" | "sent" = params.get("tab") === "sent" ? "sent" : "new";
  function setTab(t: "new" | "sent") {
    if (t === tab) return;
    window.history.pushState(null, "", t === "sent" ? "?tab=sent" : window.location.pathname);
    window.scrollTo({ top: 0 });
  }
  const [now] = useState(() => Date.now()); // for "link expired" (30 days)
  const [issued, setIssued] = useState<Record<string, string>>({}); // signer id → link made this visit
  const [mode, setMode] = useState<"each" | "batch">("each");
  const [dir, setDir] = useState({ name: director, email: "", role: "Director" });
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [toast, setToast] = useState("");
  const [over, setOver] = useState(false);
  const dirRef = useRef(dir);
  useEffect(() => {
    dirRef.current = dir;
  }, [dir]);
  const [cur, setCur] = useState(0); // document shown in step 4
  const [who, setWho] = useState(1); // signer the new boxes are for
  const [armed, setArmed] = useState<BoxKind | null>(null);
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
    const made = list.map((file, i) => {
        const m = matchFile(file.name, holders.map((h) => ({ id: h.id, name: h.name, legal_name: null })));
        const h = holders.find((x) => x.id === m.holderId);
        return {
          key: `${Date.now()}-${i}-${file.name}`,
          file,
          title: file.name.replace(/\.pdf$/i, ""),
          holderId: h?.id ?? "",
          tranche: m.tranche ? String(m.tranche) : "",
          signers: [{ name: h?.name ?? "", email: h?.email ?? "", role: "Option Holder" }],
          boxes: [] as Box[],
          info: null as PdfInfo | null,
        };
      });
    setRows((r) => [...r, ...made]);
    /* read each PDF in the background and put the boxes on the signature lines */
    void import("../../sign/PdfPages").then(async ({ openPdf, readPdf }) => {
      for (const m of made) {
        try {
          const d = await openPdf(m.file);
          const info = await readPdf(d);
          void d.destroy();
          setRows((l) => l.map((r) => (r.key === m.key ? { ...r, info, boxes: r.boxes.length ? r.boxes : autoPlace(info, [dirRef.current, ...r.signers]) } : r)));
        } catch {
          /* unreadable here: the server check will say so on Send */
        }
      }
    });
  }
  function removeSigner(r: Row, i: number) {
    const pos = i + 2;
    setRow(r.key, {
      signers: r.signers.filter((_, k) => k !== i),
      boxes: r.boxes.filter((b) => b.position !== pos).map((b) => (b.position > pos ? { ...b, position: b.position - 1 } : b)),
    });
    setWho(1);
  }
  function placeAgain(r: Row) {
    if (r.info) setRow(r.key, { boxes: autoPlace(r.info, [dir, ...r.signers]) });
  }
  function copyToAll(r: Row) {
    setRows((l) =>
      l.map((x) =>
        x.key === r.key
          ? x
          : { ...x, boxes: r.boxes.filter((b) => b.position <= x.signers.length + 1 && (!x.info || b.page <= x.info.pages.length)).map((b) => ({ ...b, id: `${b.id}-${x.key}` })) },
      ),
    );
    say(`Boxes copied to ${plural(rows.length - 1, "document")}`);
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
    for (const r of rows) {
      const missing = [dir, ...r.signers].filter((_, k) => !r.boxes.some((b) => b.kind === "signature" && b.position === k + 1));
      if (missing.length && !window.confirm(`${r.title}: no signature box for ${missing.map((m) => m.name || "a signer").join(", ")}. Their signature will go on the audit page instead. Send anyway?`)) return;
    }
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
          fields: r.boxes.map((b) => ({ position: b.position, kind: b.kind, page: b.page, x: b.x, y: b.y, w: b.w, h: b.h })),
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
  /* A signer's link. Only a fingerprint of each link is stored, so showing it
     again means making a new one (the old one stops working). Made once per
     visit, so Open and Copy give the same link. */
  async function linkFor(envelopeId: string, signerId: string): Promise<string | null> {
    if (issued[signerId]) return issued[signerId];
    const res = await fetch("/api/sign/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ envelopeId, signerId }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; link?: string };
    if (!res.ok || !j.link) {
      say(j.error || "Could not make a link.");
      return null;
    }
    setIssued((m) => ({ ...m, [signerId]: j.link as string }));
    return j.link;
  }
  async function copyLink(envelopeId: string, signerId: string) {
    const l = await linkFor(envelopeId, signerId);
    if (l) await copy(l);
  }
  async function openLink(envelopeId: string, signerId: string) {
    const w = window.open("about:blank", "_blank"); // opened now, so the browser doesn't block it
    const l = await linkFor(envelopeId, signerId);
    if (l && w) w.location.href = l;
    else w?.close();
  }
  const holderName = (id: string | null) => holders.find((h) => h.id === id)?.name;
  async function cancelRequest(envelopeId: string, title: string) {
    if (!window.confirm(`Cancel "${title}"? Nobody will be able to sign it, and the links will say it was cancelled. You can send a corrected one afterwards.`)) return;
    const res = await fetch("/api/sign/void", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ envelopeId }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return say(j.error || "Could not cancel.");
    say("Request cancelled");
    router.refresh();
  }
  const expired = (s: Signer) => s.status === "invited" && !!s.invited_at && now - Date.parse(s.invited_at) > 30 * 86_400_000;

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

        {(!boxesReady || (hook && !codesReady) || (!hook && !preview)) && (
          <div className="fs-setup">
            {hook && !codesReady && (
              <p>
                <b>⚠ One step left in Supabase:</b> run <code>114_fd_sign_codes.sql</code> so signers can confirm the email code before signing. Until then Send is blocked.
              </p>
            )}
            {!boxesReady && (
              <p>
                <b>⚠ One step left in Supabase:</b> run <code>113_fd_sign_fields.sql</code> so the signature boxes you place are saved. Until then Send is blocked.
              </p>
            )}
            {!hook && !preview && (
              <p>
                <b>✉ Emails are off:</b> nobody is emailed yet. After you send, press <b>Copy link</b> for each person and send it yourself. When a signer finishes, the next person&rsquo;s <b>Open</b> and <b>Copy link</b> buttons appear in <b>Sent</b>. Turn emails on with the Zap &ldquo;FD Sign – emails&rdquo; and <code>SIGN_HOOK_URL</code> in Vercel.
              </p>
            )}
          </div>
        )}

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
                        <button
                          className="fs-icon"
                          onClick={() => {
                            setRows((l) => l.filter((x) => x.key !== r.key));
                            setCur(0);
                          }}
                          aria-label="Remove"
                        >
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
                          <button className="fs-icon" onClick={() => removeSigner(r, i)} aria-label={`Remove ${s.name || "this signer"}`} title="Remove this signer">
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

              {/* 4 · signature boxes */}
              <section className="fs-step">
                <header>
                  <span className="fs-num">4</span>
                  <div>
                    <h2>Where each person signs</h2>
                    <p>Each signature goes on its line in the document. The boxes are placed on the &ldquo;Director&rdquo; and &ldquo;Option Holder&rdquo; lines for you: drag to move, drag the corner to resize.</p>
                  </div>
                </header>
                {n === 0 && <p className="fs-hint">Add documents in step 1 to place the signatures.</p>}
                {n > 0 &&
                  (() => {
                    const r = rows[Math.min(cur, n - 1)];
                    const people = [dir, ...r.signers];
                    const names = people.map((p) => p.name.trim());
                    const missing = people.filter((_, k) => !r.boxes.some((b) => b.kind === "signature" && b.position === k + 1));
                    const target = Math.min(who, people.length);
                    return (
                      <div className="fs-place">
                        {n > 1 && (
                          <div className="fs-tabs" role="tablist">
                            {rows.map((x, i) => (
                              <button key={x.key} role="tab" aria-selected={x.key === r.key} className={x.key === r.key ? "on" : ""} onClick={() => (setCur(i), setArmed(null))}>
                                {i + 1}. {x.title}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="fs-place-bar">
                          <div className="fs-place-who">
                            {people.map((p, k) => {
                              const c = r.boxes.filter((b) => b.position === k + 1).length;
                              return (
                                <button key={k} className={`fs-who ${target === k + 1 ? "on" : ""}`} style={{ ["--c" as string]: colour(k + 1) }} onClick={() => setWho(k + 1)} title="New boxes are for this person">
                                  <i />
                                  {p.name.trim() || `Signer ${k + 1}`}
                                  <em>{c ? plural(c, "box", "boxes") : "no box"}</em>
                                </button>
                              );
                            })}
                          </div>
                          <div className="fs-place-tools">
                            <button className={`dbtn ${armed === "signature" ? "gold" : ""}`} onClick={() => setArmed(armed === "signature" ? null : "signature")}>
                              + Signature
                            </button>
                            <button className={`dbtn ${armed === "date" ? "gold" : ""}`} onClick={() => setArmed(armed === "date" ? null : "date")}>
                              + Date
                            </button>
                            <button className="dbtn" disabled={!r.info} onClick={() => placeAgain(r)} title="Put the boxes back on the Director and Option Holder lines">
                              ↺ Place automatically
                            </button>
                            {n > 1 && (
                              <button className="dbtn" onClick={() => copyToAll(r)} title="Same layout on every document (certificates in one batch)">
                                Copy to all {n} documents
                              </button>
                            )}
                          </div>
                        </div>
                        {armed && (
                          <p className="fs-armed">
                            Click on the page where {names[target - 1] || "this signer"}&rsquo;s {armed === "date" ? "date" : "signature"} goes.{" "}
                            <button className="fs-textbtn" onClick={() => setArmed(null)}>
                              Cancel
                            </button>
                          </p>
                        )}
                        <div className="fs-place-doc">
                          <BoxEditor
                            key={r.key}
                            file={r.file}
                            boxes={r.boxes}
                            onChange={(b) => setRow(r.key, { boxes: b })}
                            names={names}
                            active={target}
                            armed={armed}
                            onPlaced={() => setArmed(null)}
                            onInfo={(info) =>
                              setRows((l) => l.map((x) => (x.key === r.key && !x.info ? { ...x, info, boxes: x.boxes.length ? x.boxes : autoPlace(info, [dirRef.current, ...x.signers]) } : x)))
                            }
                          />
                        </div>
                        <p className={missing.length ? "fs-warn" : "fs-hint"}>
                          {missing.length
                            ? `No signature box yet for ${missing.map((m) => m.name || "a signer").join(", ")}: their signature would go on the audit page instead.`
                            : `✓ Every signer has a place to sign on this document.`}
                        </p>
                      </div>
                    );
                  })()}
              </section>

              {/* 5 · review */}
              <section className="fs-step">
                <header>
                  <span className="fs-num">5</span>
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
                    <span>The signed PDF (signatures on their lines, plus an audit trail page) is filed on the holder&rsquo;s row, and everyone gets a copy.</span>
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
                          <b>{s.name}</b> · {plural(s.documents.length, "document")} · {s.emailed ? "emailed" : "send them this link, or open it to sign now"}
                        </span>
                        <span className="fs-linkbtns">
                          <a className="dbtn gold" href={s.link} target="_blank" rel="noreferrer">
                            Open ↗
                          </a>
                          <button className="dbtn" onClick={() => void copy(s.link)}>
                            Copy link
                          </button>
                        </span>
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
                  <span>Upload the certificates, set who signs and in what order, and check where each person signs.</span>
                </li>
                <li>
                  <b>Sign</b>
                  <span>Each signer opens a private link, sees their &ldquo;sign here&rdquo; boxes, draws or types a signature and agrees to sign electronically.</span>
                </li>
                <li>
                  <b>File</b>
                  <span>Signatures are stamped on their lines, an audit trail page is added (time, IP, browser, document fingerprint), and the copy is filed on the ESOP dashboard.</span>
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
                            {s.role} · {s.status === "signed" ? `signed ${fmt(s.signed_at)}` : s.status === "invited" ? (expired(s) ? "link expired: send a new one" : s.viewed_at ? "opened, not signed yet" : "link sent") : "waiting for their turn"}
                          </span>
                        </div>
                        {s.status === "invited" && e.status === "sent" && (
                          <span className="fs-linkbtns">
                            <button className="dbtn gold" onClick={() => void openLink(e.id, s.id)} title="Open this person's signing page in a new tab">
                              Open ↗
                            </button>
                            <button className="dbtn" onClick={() => void copyLink(e.id, s.id)} title={hook ? "A fresh link (the emailed one stops working), copied" : "Copy this person's signing link to send them"}>
                              Copy link
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="fs-env-actions">
                    {e.status === "sent" && (
                      <button className="dbtn fs-cancel" onClick={() => void cancelRequest(e.id, e.title)} title="Withdraw this request, e.g. if there is a mistake on the certificate">
                        Cancel request
                      </button>
                    )}
                    <a className="dbtn" href={`/api/sign/file?e=${e.id}`} target="_blank" rel="noreferrer">
                      Original
                    </a>
                    {e.status === "completed" && (
                      <a className="dbtn gold" href={`/api/sign/file?e=${e.id}&signed=1&doc=1`} target="_blank" rel="noreferrer" title="The signed document on its own, without the audit trail page">
                        Signed {/certificate/i.test(e.title) ? "certificate" : "document"} only
                      </a>
                    )}
                    <a className="dbtn" href={`/api/sign/file?e=${e.id}&signed=1`} target="_blank" rel="noreferrer">
                      {e.status === "completed" ? "With audit trail" : "PDF so far"}
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
