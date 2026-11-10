"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Head, Ic } from "../ui";
import { setHandoff } from "../handoff";
import { VERDICT_TEXT, type Issue, type Verdict } from "@/lib/sign/ready/rules";

/* FD Sign: Signing-ready check (0201). Rachel, 6 Nov 2026: "people upload
   documents which are not execution ready yet … upload it first to check what
   issues, as a separate tab, then do the signing." Upload → the checklist from the
   Execution-Readiness Playbook + an AI read → a report in reading order → fix and
   check again, or go on to New request with the same file. */

interface Result {
  checkId: string | null;
  file: { name: string; kind: "pdf" | "docx"; pages: number | null; size: number };
  verdict: Verdict;
  counts: { blocker: number; warning: number; advisory: number; expected: number };
  issues: Issue[];
  ai: { used: boolean };
}

const MAX = 10 * 1024 * 1024;
const TONE: Record<Verdict, "ok" | "warn" | "bad"> = { ready: "ok", ready_with_ack: "warn", not_ready: "bad", not_signable_here: "bad", cannot_process: "bad" };
const CAT: Record<string, string> = { placeholder: "Blanks and placeholders", annotation: "Drafting mark-up", structure: "Structure and cross-references", file: "File", signability: "Signing formalities", ai: "AI review" };

/* plain line icons (no emoji): the status mark in the report header */
function StatusIcon({ tone }: { tone: "ok" | "warn" | "bad" }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

function Item({ i, n, tick, onTick }: { i: Issue; n: number; tick?: boolean; onTick?: (v: boolean) => void }) {
  return (
    <li className={`fck-item ${i.severity}`}>
      <span className="fck-n">{String(n).padStart(2, "0")}</span>
      <div className="fck-body">
        <p className="fck-title">{i.title}</p>
        {i.evidence && <blockquote className="fck-q">{i.evidence}</blockquote>}
        <p className="fck-do">{i.action}</p>
        {onTick && (
          <label className="fck-tick">
            <input type="checkbox" checked={!!tick} onChange={(e) => onTick(e.target.checked)} />
            Reviewed: fine to sign as it is
          </label>
        )}
      </div>
      <div className="fck-loc">
        <span>{i.where}</span>
        <code>
          {i.code}
          {i.source === "ai" ? " · AI" : ""}
        </code>
      </div>
    </li>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="fck-sec">
      <header>
        <h2>{title}</h2>
        <span>{sub}</span>
      </header>
      {children}
    </section>
  );
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

  async function run(f: File | null | undefined) {
    setErr("");
    if (!f) return;
    if (f.size > MAX) return setErr("This file is over 10 MB. Please make it smaller and try again.");
    if (!/\.(pdf|docx)$/i.test(f.name)) return setErr(/\.doc$/i.test(f.name) ? "This is the old Word format (.doc). Save it as .docx or PDF, then upload that." : "Please upload a PDF or a Word file (.docx).");
    setFile(f);
    setRes(null);
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

  const issues = res?.issues ?? [];
  const blockers = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.map((i, k) => ({ i, k })).filter((x) => x.i.severity === "warning");
  const advisories = issues.filter((i) => i.severity === "advisory");
  const allTicked = warnings.every((w) => ticks[w.k]);
  const groups = [...new Set(warnings.map((w) => w.i.category))];

  const tone = res ? TONE[res.verdict] : "ok";
  const when = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  let n = 0;

  return (
    <div className="fds">
      <Head tab="check" />
      <main className="fds-main fck">
        {!res && (
          <>
            <header className="fck-intro">
              <span className="fck-label">FD Sign · Signing-ready check</span>
              <h1>Check a document before it is signed</h1>
              <p>Upload the version you intend to send. We review it as a lawyer reviews an execution version, then our AI reads it for inconsistencies a checklist cannot see. You receive a report of anything to resolve before signing.</p>
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
          <section className="fck-report">
            <div className="fck-rh">
              <div>
                <span className="fck-label">Execution readiness report</span>
                <h1>{res.file.name}</h1>
                <p className="fck-meta">
                  {res.file.pages ? `${res.file.pages} ${res.file.pages === 1 ? "page" : "pages"} · ` : ""}
                  {res.file.kind === "docx" ? "Word document" : "PDF"} · Reviewed {when} · {res.ai.used ? "Checklist and AI review" : "Checklist (AI review unavailable)"}
                </p>
              </div>
            </div>
            <div className={`fck-status ${tone}`} aria-live="polite">
              <StatusIcon tone={tone} />
              <div>
                <b>{VERDICT_TEXT[res.verdict].title}</b>
                <span>{VERDICT_TEXT[res.verdict].text}</span>
              </div>
            </div>
            <dl className="fck-stats">
              <div className={res.counts.blocker ? "bad" : ""}>
                <dt>Must fix</dt>
                <dd>{res.counts.blocker}</dd>
              </div>
              <div className={res.counts.warning ? "warn" : ""}>
                <dt>To review</dt>
                <dd>{res.counts.warning}</dd>
              </div>
              <div>
                <dt>For information</dt>
                <dd>{res.counts.advisory}</dd>
              </div>
              <div>
                <dt>Signature fields</dt>
                <dd>{res.counts.expected}</dd>
              </div>
            </dl>
            <div className="fck-actions">
              {(res.verdict === "ready" || res.verdict === "ready_with_ack") && (
                <button className="fds-btn ink lg" disabled={going || (res.verdict === "ready_with_ack" && !allTicked)} onClick={() => void goSend(res.verdict === "ready_with_ack" ? "acknowledged" : null)}>
                  {going ? "Opening…" : "Continue to signing"} <Ic n="chev" s={16} />
                </button>
              )}
              {(res.verdict === "not_ready" || res.verdict === "cannot_process") && (
                <button className="fds-btn ink lg" onClick={() => input.current?.click()}>
                  <Ic n="up" s={16} /> Upload revised version
                </button>
              )}
              {res.verdict === "not_signable_here" && (
                <Link className="fds-btn ink lg" href="/contact">
                  Consult a Founders Doc lawyer
                </Link>
              )}
              <button className="fds-btn lg" onClick={() => input.current?.click()}>
                Review another document
              </button>
              {(res.verdict === "not_ready" || res.verdict === "not_signable_here") && !anyway && (
                <button className="fck-link" onClick={() => setAnyway(true)}>
                  Proceed without changes
                </button>
              )}
              {res.verdict === "ready_with_ack" && !allTicked && <span className="fck-hint">Mark each review item as reviewed to continue.</span>}
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
          </section>
        )}

        <input ref={input} type="file" hidden accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => void run(e.target.files?.[0])} />
        {err && <div className="fds-err">{err}</div>}
        {res && busy && <p className="fck-hint">Reviewing the new file…</p>}

        {res && blockers.length > 0 && (
          <Section title="Must fix before signing" sub={`${blockers.length} ${blockers.length === 1 ? "item" : "items"}, in reading order`}>
            <ol className="fck-list">
              {blockers.map((i, k) => (
                <Item key={k} i={i} n={++n} />
              ))}
            </ol>
          </Section>
        )}
        {res && warnings.length > 0 && (
          <Section title="To review" sub={`${warnings.length} ${warnings.length === 1 ? "item" : "items"}`}>
            {groups.map((g) => (
              <div key={g} className="fck-group">
                <h3>{CAT[g] ?? g}</h3>
                <ol className="fck-list">
                  {warnings
                    .filter((w) => w.i.category === g)
                    .map((w) => (
                      <Item key={w.k} i={w.i} n={++n} tick={ticks[w.k]} onTick={res.verdict === "ready_with_ack" ? (v) => setTicks((t) => ({ ...t, [w.k]: v })) : undefined} />
                    ))}
                </ol>
              </div>
            ))}
          </Section>
        )}
        {res && advisories.length > 0 && (
          <details className="fck-sec fck-more">
            <summary>
              <h2>For information</h2>
              <span>{advisories.length} {advisories.length === 1 ? "item" : "items"} · show</span>
            </summary>
            <ol className="fck-list">
              {advisories.map((i, k) => (
                <Item key={k} i={i} n={++n} />
              ))}
            </ol>
          </details>
        )}
        {res && res.counts.expected > 0 && (
          <p className="fck-note">
            {res.counts.expected} blank {res.counts.expected === 1 ? "line" : "lines"} in signature blocks (signature, name or date) are treated as signature fields, not omissions.
          </p>
        )}

        <footer className="fck-legal">
          <p>
            This report is produced by an automated checklist and AI review. It identifies common issues and is not legal advice. The document is read only to produce this report and is not stored; we retain the findings (reference codes and locations), not the document&rsquo;s contents. For a lawyer&rsquo;s review, <Link href="/contact">contact Founders Doc</Link>.
          </p>
        </footer>
      </main>
    </div>
  );
}
