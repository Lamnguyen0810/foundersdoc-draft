"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Head, Ic } from "../ui";
import { setHandoff } from "../handoff";
import { VERDICT_TEXT, type Issue, type Verdict } from "@/lib/sign/ready/rules";

/* the page viewer is pdf.js in the browser: load it only when a report opens */
const PdfPages = dynamic(() => import("../../sign/PdfPages"), { ssr: false, loading: () => <div className="fs-pages-wait">Loading the document…</div> });

/* FD Sign: Signing-ready check (0201). Rachel, 6 Nov 2026: "people upload
   documents which are not execution ready yet … upload it first to check what
   issues, as a separate tab, then do the signing." Upload → the checklist from the
   Execution-Readiness Playbook + an AI read → a report → fix and check again, or go
   on to New request with the same file.
   0204: the report shows the whole document with each finding marked where it is,
   and the findings in a panel on the right (the ESOP dashboard's drawer style:
   black header, stat boxes, numbered rows, gold note). Site fonts throughout. */

interface Result {
  checkId: string | null;
  file: { name: string; kind: "pdf" | "docx"; pages: number | null; size: number };
  verdict: Verdict;
  counts: { blocker: number; warning: number; advisory: number; expected: number };
  issues: Issue[];
  preview: { pdf: string; pages: number } | null;
  ai: { used: boolean };
}

const MAX = 10 * 1024 * 1024;
const TONE: Record<Verdict, "ok" | "warn" | "bad"> = { ready: "ok", ready_with_ack: "warn", not_ready: "bad", not_signable_here: "bad", cannot_process: "bad" };
const SEV: Record<Issue["severity"], string> = { blocker: "Must fix", warning: "To review", advisory: "For information", expected: "Signature field" };
const SRC: Record<string, string> = { rules: "Checklist", ai: "AI review" };

/* plain line icons (no emoji): the status mark */
function StatusIcon({ tone }: { tone: "ok" | "warn" | "bad" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {tone === "ok" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.6 2.6L16 9.5" />
        </>
      ) : tone === "warn" ? (
        <>
          <path d="M12 3.5l9 16H3z" />
          <path d="M12 10v4M12 17h.01" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </>
      )}
    </svg>
  );
}

/* bring a mark or a row into view inside its own scrolling box (the page list or the
   panel), so the window itself doesn't jump; on a phone the boxes don't scroll, so the
   window does */
function reveal(el: HTMLElement | null) {
  if (!el) return;
  let box = el.parentElement;
  while (box && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
  if (!box || box === document.scrollingElement || box === document.body) return el.scrollIntoView({ behavior: "smooth", block: "center" });
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  box.scrollTo({ top: box.scrollTop + (r.top - b.top) - b.height / 2 + r.height / 2, behavior: "smooth" });
}

function fromBase64(b64: string): Blob {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: "application/pdf" });
}

export default function Check() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [ticks, setTicks] = useState<Record<number, boolean>>({});
  const [anyway, setAnyway] = useState(false);
  const [reason, setReason] = useState("");
  const [going, setGoing] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | Issue["severity"]>("all");

  async function run(f: File | null | undefined) {
    setErr("");
    if (!f) return;
    if (f.size > MAX) return setErr("This file is over 10 MB. Please make it smaller and try again.");
    if (!/\.(pdf|docx)$/i.test(f.name)) return setErr(/\.doc$/i.test(f.name) ? "This is the old Word format (.doc). Save it as .docx or PDF, then upload that." : "Please upload a PDF or a Word file (.docx).");
    setFile(f);
    setRes(null);
    setSel(null);
    setFilter("all");
    setTicks({});
    setAnyway(false);
    setReason("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/fd-sign/check", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not check this file.");
      setRes(j as Result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not check this file.");
    } finally {
      setBusy(false);
    }
  }

  async function goSend(decision: "acknowledged" | "sent_anyway" | null) {
    if (!file || !res) return;
    setGoing(true);
    setErr("");
    if (decision) {
      const r = await fetch("/api/fd-sign/check/decision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ checkId: res.checkId, decision, reason }) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setGoing(false);
        return setErr(j.error || "Could not record that.");
      }
    }
    setHandoff({ file, verdict: decision === "sent_anyway" ? "sent_anyway" : res.verdict });
    router.push("/fd-sign/new?from=check");
  }

  const issues = useMemo(() => res?.issues ?? [], [res]);
  /* one numbering for the marks and the panel: must fix, then review, then information */
  const rows = useMemo(() => {
    const rank: Record<string, number> = { blocker: 0, warning: 1, advisory: 2, expected: 3 };
    return issues
      .map((i, k) => ({ i, k }))
      .sort((a, b) => rank[a.i.severity] - rank[b.i.severity] || a.i.order - b.i.order)
      .map((r, n) => ({ ...r, n: n + 1 }));
  }, [issues]);
  const warnings = rows.filter((r) => r.i.severity === "warning");
  const allTicked = warnings.every((w) => ticks[w.k]);
  const marked = rows.filter((r) => r.i.mark).length;

  const src = useMemo<Blob | null>(() => {
    if (!res || res.verdict === "cannot_process") return null;
    if (res.preview?.pdf) return fromBase64(res.preview.pdf);
    return res.file.kind === "pdf" && file ? file : null;
  }, [res, file]);

  const tone = res ? TONE[res.verdict] : "ok";
  const when = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  function pick(k: number, from: "doc" | "panel") {
    setSel((cur) => (cur === k && from === "panel" ? null : k));
    requestAnimationFrame(() => reveal(document.getElementById(from === "panel" ? `fck-m-${k}` : `fck-r-${k}`)));
  }

  const shown = rows.filter((r) => filter === "all" || r.i.severity === filter);
  const groups = (["blocker", "warning", "advisory"] as const).filter((g) => shown.some((r) => r.i.severity === g));

  return (
    <div className="fds">
      <Head tab="check" />
      <main className={`fds-main fck ${res ? "wide" : ""}`}>
        {!res && (
          <>
            <header className="fck-intro">
              <span className="fck-label">FD Sign · Signing-ready check</span>
              <h1>Check a document before it is signed</h1>
              <p>Upload the version you intend to send. We review it as a lawyer reviews an execution version, then our AI reads it for inconsistencies a checklist cannot see. You see the whole document with each issue marked where it is, and a list of what to resolve before signing.</p>
            </header>
            <div className="fck-upload">
              <label
                className={`fck-drop ${over ? "over" : ""} ${busy ? "busy" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (!busy) input.current?.click();
                }}
                onDragOver={(e) => (e.preventDefault(), setOver(true))}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  void run(e.dataTransfer.files[0]);
                }}
              >
                <Ic n={busy ? "clock" : "up"} s={22} w={1.6} />
                <div>
                  <b>{busy ? `Reviewing ${file?.name ?? "your document"}` : "Select a document to review"}</b>
                  <span>{busy ? "Reading every page, then the AI review. Up to 30 seconds." : "PDF or Word (.docx), up to 10 MB. Drag it here or choose a file."}</span>
                </div>
                {!busy && <span className="fds-btn ink">Choose file</span>}
                {busy && <i className="fck-bar" aria-hidden />}
              </label>
              <dl className="fck-scope">
                <div>
                  <dt>Blanks and placeholders</dt>
                  <dd>[Party name], S$[●], TBC, merge fields, options left open</dd>
                </div>
                <div>
                  <dt>Drafting mark-up</dt>
                  <dd>Tracked changes, comments, notes to draft, &ldquo;Draft&rdquo; marks</dd>
                </div>
                <div>
                  <dt>Structure</dt>
                  <dd>Missing schedules, broken cross-references, signature blocks</dd>
                </div>
                <div>
                  <dt>Signing formalities</dt>
                  <dd>Wet ink, deeds, notarisation, documents excluded from e-signing</dd>
                </div>
              </dl>
            </div>
          </>
        )}

        {res && (
          <div className="fck-review">
            {/* left: the whole document, findings marked on the page */}
            <section className="fck-doc" aria-label="Document preview">
              <header className="fck-dbar">
                <div>
                  <b>Document preview</b>
                  <span>
                    {res.file.pages ?? res.preview?.pages ?? "–"} {(res.file.pages ?? res.preview?.pages) === 1 ? "page" : "pages"} · {marked} {marked === 1 ? "issue" : "issues"} marked
                    {res.file.kind === "docx" ? " · Word file shown as it will be signed" : ""}
                  </span>
                </div>
                <ul className="fck-legend" aria-label="Key">
                  <li className="blocker">Must fix</li>
                  <li className="warning">To review</li>
                  <li className="advisory">Information</li>
                </ul>
              </header>
              <div className="fck-pages">
                {src ? (
                  <PdfPages
                    src={src}
                    overlay={(page) =>
                      rows
                        .filter((r) => r.i.mark?.page === page && (filter === "all" || r.i.severity === filter))
                        .map(({ i, k, n }) => (
                          <button
                            key={k}
                            id={`fck-m-${k}`}
                            type="button"
                            className={`fck-mark ${i.severity} ${sel === k ? "on" : ""}`}
                            style={{ left: `${i.mark!.x * 100}%`, top: `${i.mark!.y * 100}%`, width: `${i.mark!.w * 100}%`, height: `${i.mark!.h * 100}%` }}
                            title={`${n}. ${i.title}`}
                            aria-label={`Issue ${n}: ${i.title}`}
                            onClick={() => pick(k, "doc")}
                          >
                            <span>{n}</span>
                          </button>
                        ))
                    }
                  />
                ) : (
                  <div className="fck-nopv">
                    <Ic n="doc" s={22} w={1.5} />
                    <b>{res.verdict === "cannot_process" ? "This file could not be opened for a preview" : "Preview not available for this file"}</b>
                    <span>The findings are listed in the panel.</span>
                  </div>
                )}
              </div>
            </section>

            {/* right: the report panel (ESOP drawer style) */}
            <aside className="fck-panel" aria-label="Execution readiness report">
              <header className="fck-ph">
                <span className="fck-label">Execution readiness report</span>
                <h1>{res.file.name}</h1>
                <span className="fck-meta">
                  {res.file.kind === "docx" ? "Word document" : "PDF"} · {when} · {res.ai.used ? "Checklist and AI review" : "Checklist (AI review unavailable)"}
                </span>
                <div className={`fck-verdict ${tone}`} aria-live="polite">
                  <StatusIcon tone={tone} />
                  <b>{VERDICT_TEXT[res.verdict].title}</b>
                </div>
              </header>

              <div className="fck-pb">
                <p className="fck-vtext">{VERDICT_TEXT[res.verdict].text}</p>
                <div className="fck-stats" role="group" aria-label="Filter the findings">
                  {(
                    [
                      ["blocker", "Must fix", res.counts.blocker],
                      ["warning", "To review", res.counts.warning],
                      ["advisory", "Information", res.counts.advisory],
                    ] as const
                  ).map(([key, label, count]) => (
                    <button key={key} type="button" className={`${key} ${count ? "has" : ""} ${filter === key ? "on" : ""}`} aria-pressed={filter === key} onClick={() => setFilter((f) => (f === key ? "all" : key))}>
                      <span>{label}</span>
                      <b>{count}</b>
                    </button>
                  ))}
                  <div className="fck-sigs">
                    <span>Signature fields</span>
                    <b>{res.counts.expected}</b>
                  </div>
                </div>

                <div className="fck-actions">
                  {(res.verdict === "ready" || res.verdict === "ready_with_ack") && (
                    <button className="fds-btn ink lg" disabled={going || (res.verdict === "ready_with_ack" && !allTicked)} onClick={() => void goSend(res.verdict === "ready_with_ack" ? "acknowledged" : null)}>
                      {going ? "Opening…" : "Continue to signing"} <Ic n="chev" s={16} />
                    </button>
                  )}
                  {(res.verdict === "not_ready" || res.verdict === "cannot_process") && (
                    <button className="fds-btn ink lg" onClick={() => input.current?.click()} disabled={busy}>
                      <Ic n="up" s={16} /> {busy ? "Reviewing…" : "Upload revised version"}
                    </button>
                  )}
                  {res.verdict === "not_signable_here" && (
                    <Link className="fds-btn ink lg" href="/contact">
                      Consult a Founders Doc lawyer
                    </Link>
                  )}
                  <div className="fck-alt">
                    <button className="fck-link" onClick={() => input.current?.click()} disabled={busy}>
                      Review another document
                    </button>
                    {(res.verdict === "not_ready" || res.verdict === "not_signable_here") && !anyway && (
                      <button className="fck-link" onClick={() => setAnyway(true)}>
                        Proceed without changes
                      </button>
                    )}
                  </div>
                  {res.verdict === "ready_with_ack" && !allTicked && <span className="fck-hint">Mark each item under To review as reviewed to continue.</span>}
                </div>
                {anyway && (
                  <div className="fck-anyway">
                    <label>
                      <b>Reason for proceeding without changes</b>
                      <small>Recorded with this report.</small>
                      <textarea className="fds-inp" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The blanks will be completed by hand at signing" />
                    </label>
                    <div>
                      <button className="fds-btn ink" disabled={going || reason.trim().length < 5} onClick={() => void goSend("sent_anyway")}>
                        {going ? "Opening…" : "Record reason and continue"}
                      </button>
                      <button className="fck-link" onClick={() => setAnyway(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {err && <div className="fds-err">{err}</div>}

                <div className="fck-findings">
                  <div className="fck-fh">
                    <h2>Findings</h2>
                    <span>{filter === "all" ? `${rows.length} in total` : `${SEV[filter]} only · `}{filter !== "all" && <button className="fck-link" onClick={() => setFilter("all")}>show all</button>}</span>
                  </div>
                  {!rows.length && <p className="fck-hint">Nothing to resolve. The checklist and the AI review found no issues.</p>}
                  {groups.map((g) => (
                    <div key={g} className="fck-group">
                      <h3>{SEV[g]}</h3>
                      <ol className="fck-rows">
                        {shown
                          .filter((r) => r.i.severity === g)
                          .map(({ i, k, n }) => (
                            <li key={k} id={`fck-r-${k}`} className={`fck-row ${i.severity} ${sel === k ? "on" : ""}`}>
                              <button type="button" className="fck-rbtn" onClick={() => pick(k, "panel")} aria-expanded={sel === k}>
                                <span className="fck-tn">{n}</span>
                                <span className="fck-rt">
                                  <b>{i.title}</b>
                                  <small>
                                    {i.mark ? i.where : `${i.where} · not marked on the page`} · {SRC[i.source]}
                                  </small>
                                </span>
                                <Ic n="chev" s={14} />
                              </button>
                              {sel === k && (
                                <div className="fck-rd">
                                  {i.evidence && (
                                    <p className="fck-q">
                                      <span>In the document</span>
                                      {i.evidence}
                                    </p>
                                  )}
                                  <div className="fck-note">
                                    <b>What to do</b>
                                    <span>{i.action}</span>
                                  </div>
                                  <p className="fck-code">Reference {i.code}</p>
                                </div>
                              )}
                              {res.verdict === "ready_with_ack" && i.severity === "warning" && (
                                <label className="fck-tick">
                                  <input type="checkbox" checked={!!ticks[k]} onChange={(e) => setTicks((t) => ({ ...t, [k]: e.target.checked }))} />
                                  Reviewed: fine to sign as it is
                                </label>
                              )}
                            </li>
                          ))}
                      </ol>
                    </div>
                  ))}
                  {res.counts.expected > 0 && (
                    <p className="fck-hint">
                      {res.counts.expected} blank {res.counts.expected === 1 ? "line" : "lines"} in signature blocks (signature, name or date) are treated as signature fields, not omissions.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}

        <input ref={input} type="file" hidden accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => (void run(e.target.files?.[0]), (e.target.value = ""))} />
        {!res && err && <div className="fds-err">{err}</div>}

        <footer className="fck-legal">
          <p>
            This report is produced by an automated checklist and AI review. It identifies common issues and is not legal advice. The document is read only to produce this report and is not stored; we retain the findings (reference codes and locations), not the document&rsquo;s contents. For a lawyer&rsquo;s review, <Link href="/contact">contact Founders Doc</Link>.
          </p>
        </footer>
      </main>
    </div>
  );
}
