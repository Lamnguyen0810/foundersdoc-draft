"use client";

import { useState } from "react";
import { stamp } from "./parts";
import type { Flag } from "@/lib/termsheet/types";

/**
 * The review queue: term sheets the playbook held (🟡) or stopped (🔴).
 *
 * A held draft is on the user's screen already, marked "being checked";
 * what they cannot do is download it. A lawyer reads the reasons, reads
 * the letter, and presses Release — with a note for the user if there is
 * something to say. A stopped draft has no letter; the user was told a
 * lawyer will be in touch, and this is the reminder to be in touch.
 * See supabase/048.
 */

export interface ReviewRow {
  id: string;
  title: string | null;
  status: string;
  who: string;
  doc_label: string | null;
  flags: Flag[] | null;
  answers: Record<string, unknown> | null;
  output_html: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface ReviewInitial {
  queue: ReviewRow[];
  missing: boolean;
}

export default function Review({ initial }: { initial: ReviewInitial }) {
  const [queue, setQueue] = useState(initial.queue);
  const [missing] = useState(initial.missing);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [showDone, setShowDone] = useState(false);

  async function reload() {
    const res = await fetch("/api/admin/review", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { queue?: ReviewRow[] };
    if (res.ok && json.queue) setQueue(json.queue);
  }

  async function release(id: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, note }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setNotice({ text: json.error ?? "That did not work.", tone: "err" });
        return;
      }
      setNote("");
      setOpen(null);
      await reload();
      setNotice({ text: "Released. The user can download it now.", tone: "ok" });
    } finally {
      setBusy(false);
    }
  }

  const isWaiting = (r: ReviewRow) => r.status === "held" || (r.status === "stopped" && !r.reviewed_at);
  const waiting = queue.filter(isWaiting);
  const done = queue.filter((r) => !isWaiting(r));
  const shown = showDone ? queue : waiting;

  return (
    <div className="table-card feedback-card" id="review">
      <div className="table-head">
        <div className="source-table-title">
          <h2>Review queue</h2>
          <span className="source-count">
            {waiting.length} waiting · {done.length} released
          </span>
        </div>
        <div className="toolbar">
          <label className="feedback-toggle">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show released
          </label>
        </div>
      </div>

      {missing && (
        <div className="setup-note" style={{ margin: "0 18px 14px" }}>
          <strong>The review queue is not switched on yet.</strong> Run <code>supabase/048_term_sheet.sql</code> in the
          Supabase SQL editor. Until then term sheets cannot be drafted.
        </div>
      )}

      <p className="playbook-why">
        <b>What lands here.</b> A term sheet the Drafting Playbook flags 🟡 is drafted and shown to the user, but held
        from download until a lawyer presses <b>Release</b>. One it stops 🔴 is not drafted; the user was told a lawyer
        will be in touch. Slack gets a line for each, with the reasons and the <b>#ref</b>. A released draft appears
        under “show released” for thirty days.
      </p>

      {notice && (
        <p className="empty" role="status" style={{ textAlign: "left", padding: "0 18px 10px", color: notice.tone === "ok" ? "var(--success)" : "var(--danger)" }}>
          {notice.text}
        </p>
      )}

      {shown.length === 0 ? (
        <div className="empty">{missing ? "" : "Nothing waiting. Held and stopped term sheets appear here."}</div>
      ) : (
        <ol className="feedback-list" style={{ padding: "0 18px 18px" }}>
          {shown.map((r) => {
            const flags = (r.flags ?? []).filter((f) => f.level === "yellow" || f.level === "red");
            const isOpen = open === r.id;
            return (
              <li key={r.id} className={isWaiting(r) ? "new" : "off"}>
                <div className="feedback-meta">
                  <b>{r.status === "held" ? "🟡 Held" : r.status === "stopped" ? (r.reviewed_at ? "🔴 Stopped · handled" : "🔴 Stopped") : "Released"}</b> · {r.doc_label ?? "Draft"} ·{" "}
                  {r.who} · {stamp(r.created_at)} · Ref #{r.id.slice(0, 6)}
                </div>
                <p className="feedback-text">
                  <b>{r.title ?? "Untitled"}</b>
                </p>
                {flags.length > 0 && (
                  <ul className="review-flags">
                    {flags.map((f, k) => (
                      <li key={k}>
                        <b>{f.scenario}</b> {f.reason}
                        {f.field ? <span className="feedback-note"> ({f.field})</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {r.review_note && (
                  <p className="feedback-note">
                    <b>Note to the user:</b> {r.review_note}
                  </p>
                )}
                {isWaiting(r) && (
                  <div className="inline-actions">
                    {r.output_html && (
                      <button type="button" className="btn" onClick={() => setOpen(isOpen ? null : r.id)}>
                        {isOpen ? "Hide the letter" : "Read the letter"}
                      </button>
                    )}
                    {!isOpen && (
                      <button type="button" className="btn" disabled={busy} onClick={() => { setOpen(r.id); setNote(""); }}>
                        {r.status === "held" ? "Release…" : "Close…"}
                      </button>
                    )}
                  </div>
                )}
                {isOpen && (
                  <div className="review-open">
                    {r.output_html && (
                      <div className="review-letter sheet" dangerouslySetInnerHTML={{ __html: r.output_html }} />
                    )}
                    <textarea
                      rows={2}
                      value={note}
                      placeholder={r.status === "held" ? "A note for the user (optional): what you changed, or what to watch." : "A note for the record (optional)."}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="inline-actions">
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void release(r.id)}>
                        {busy ? "Working…" : r.status === "held" ? "Release to the user" : "Mark as handled"}
                      </button>
                      <button type="button" className="btn" disabled={busy} onClick={() => setOpen(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
