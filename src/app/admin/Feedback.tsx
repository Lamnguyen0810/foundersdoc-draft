"use client";

import { useState } from "react";
import { FIRM_WIDE } from "@/lib/playbook";
import type { FeedbackRow, LessonRow } from "@/lib/feedback";
import { stamp } from "./parts";

/**
 * Feedback from the lawyers, and the rules made from it.
 *
 * Left: what people said about drafts, newest first, with the passage they
 * had selected. Each new item can become a rule ("Turn into rule" opens the
 * text prefilled with the feedback, to be written as an instruction) or be
 * dismissed. Right: the rules — the lessons — with a switch each, and an
 * edit. Live lessons go into every later draft of their scope, after the
 * playbook, with the same authority. See supabase/045.
 *
 * Nothing here calls the model. The firm decides what the rule is.
 */

export interface FeedbackInitial {
  feedback: FeedbackRow[];
  lessons: LessonRow[];
  missing: boolean;
}

export default function Feedback({
  docTypes,
  initial,
}: {
  docTypes: { slug: string; label: string }[];
  initial: FeedbackInitial;
}) {
  const [feedback, setFeedback] = useState(initial.feedback);
  const [lessons, setLessons] = useState(initial.lessons);
  const [missing] = useState(initial.missing);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [showHandled, setShowHandled] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  /* The rule being written: from a piece of feedback, or from nothing. */
  const [writing, setWriting] = useState<{ feedback: FeedbackRow | null; scope: string; rule: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; rule: string } | null>(null);

  const label = (slug: string | null) =>
    slug === FIRM_WIDE || !slug ? "Every document" : (docTypes.find((d) => d.slug === slug)?.label ?? slug);

  async function reload() {
    const res = await fetch("/api/admin/feedback", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Partial<FeedbackInitial> & { error?: string };
    if (res.ok) {
      setFeedback(json.feedback ?? []);
      setLessons(json.lessons ?? []);
    }
  }

  async function post(body: Record<string, unknown>, done: string) {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setNotice({ text: json.error ?? "That did not work.", tone: "err" });
        return false;
      }
      await reload();
      setNotice({ text: done, tone: "ok" });
      return true;
    } finally {
      setBusy(false);
    }
  }

  const shownFeedback = feedback.filter((f) => showHandled || f.status === "new");
  const shownLessons = lessons.filter((l) => showRetired || l.live);
  const newCount = feedback.filter((f) => f.status === "new").length;
  const liveCount = lessons.filter((l) => l.live).length;

  return (
    <div className="table-card feedback-card">
      <div className="table-head">
        <div className="source-table-title">
          <h2>Feedback &amp; lessons</h2>
          <span className="source-count">
            {newCount} new · {liveCount} live {liveCount === 1 ? "rule" : "rules"}
          </span>
        </div>
        <div className="toolbar">
          <button
            className="btn"
            type="button"
            disabled={busy || missing}
            onClick={() => setWriting({ feedback: null, scope: docTypes[0]?.slug ?? FIRM_WIDE, rule: "" })}
          >
            Add a rule
          </button>
        </div>
      </div>

      {missing && (
        <div className="setup-note" style={{ margin: "0 18px 14px" }}>
          <strong>Feedback is not switched on yet.</strong> Run <code>supabase/045_feedback_and_lessons.sql</code> in the
          Supabase SQL editor. Until then the Feedback button on drafts has nowhere to send to.
        </div>
      )}

      <p className="playbook-why">
        <b>How the drafter learns.</b> An admin presses <b>Feedback</b> beside a draft and says what is wrong —
        or types a message beginning <b>feedback:</b> in the Slack drafts channel. It arrives here. Turn it into a
        rule — one line, written as an instruction — and every later draft of that kind follows it, after the
        playbook and with the same authority. Nothing is learned automatically: the firm writes the rule.
      </p>

      {notice && (
        <p className="empty" role="status" style={{ textAlign: "left", padding: "0 18px 10px", color: notice.tone === "ok" ? "var(--success)" : "var(--danger)" }}>
          {notice.text}
        </p>
      )}

      <div className="feedback-grid">
        <div className="feedback-col">
          <div className="feedback-col-head">
            <h3>Feedback</h3>
            <label className="feedback-toggle">
              <input type="checkbox" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} /> show handled
            </label>
          </div>
          {shownFeedback.length === 0 ? (
            <div className="empty">{feedback.length === 0 ? "Nothing yet. The Feedback button sits beside every draft." : "Nothing new."}</div>
          ) : (
            <ol className="feedback-list">
              {shownFeedback.map((f) => (
                <li key={f.id} className={f.status}>
                  <div className="feedback-meta">
                    <b>{f.user_email ?? "Someone"}</b> · {label(f.doc_type_slug)} · {stamp(f.created_at)}
                    {f.source === "slack" && (
                      <>
                        {" · "}
                        {f.link ? <a href={f.link} target="_blank" rel="noreferrer">via Slack</a> : "via Slack"}
                      </>
                    )}
                    {f.status !== "new" && (
                      <span className="badge gray" style={{ marginLeft: 8 }}>
                        {f.status === "applied" ? "Rule made" : "Dismissed"}
                      </span>
                    )}
                  </div>
                  {f.excerpt && <blockquote className="feedback-quote">{f.excerpt}</blockquote>}
                  <p className="feedback-text">{f.message}</p>
                  {f.status === "new" && (
                    <div className="inline-actions">
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => setWriting({ feedback: f, scope: f.doc_type_slug ?? FIRM_WIDE, rule: f.message })}
                      >
                        Turn into rule
                      </button>
                      <button
                        className="link-btn"
                        type="button"
                        disabled={busy}
                        onClick={() => void post({ action: "dismiss", feedbackId: f.id }, "Dismissed.")}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="feedback-col">
          <div className="feedback-col-head">
            <h3>Rules learnt</h3>
            <label className="feedback-toggle">
              <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> show switched off
            </label>
          </div>
          {shownLessons.length === 0 ? (
            <div className="empty">No rules yet.</div>
          ) : (
            <ol className="feedback-list">
              {shownLessons.map((l) => (
                <li key={l.id} className={l.live ? "live" : "off"}>
                  <div className="feedback-meta">
                    {label(l.scope)} · {stamp(l.created_at)}
                    {l.created_by ? ` · ${l.created_by}` : ""}
                    {!l.live && <span className="badge gray" style={{ marginLeft: 8 }}>Off</span>}
                  </div>
                  {editing?.id === l.id ? (
                    <>
                      <textarea rows={3} value={editing.rule} disabled={busy} onChange={(e) => setEditing({ id: l.id, rule: e.target.value })} />
                      <div className="inline-actions">
                        <button
                          className="btn"
                          type="button"
                          disabled={busy || !editing.rule.trim()}
                          onClick={async () => {
                            if (await post({ action: "edit", lessonId: l.id, rule: editing.rule }, "Rule updated.")) setEditing(null);
                          }}
                        >
                          Save
                        </button>
                        <button className="link-btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="feedback-text">{l.rule}</p>
                      <div className="inline-actions">
                        <button className="link-btn" type="button" disabled={busy} onClick={() => setEditing({ id: l.id, rule: l.rule })}>Edit</button>
                        <button
                          className="link-btn"
                          type="button"
                          disabled={busy}
                          onClick={() => void post({ action: "toggle", lessonId: l.id, live: !l.live }, l.live ? "Switched off. The next draft no longer follows it." : "Switched on.")}
                        >
                          {l.live ? "Switch off" : "Switch on"}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {writing && (
        <div className="overlay show" onClick={(e) => e.target === e.currentTarget && !busy && setWriting(null)}>
          <div className="modal">
            <div className="modal-head">
              <div>
                <h3>{writing.feedback ? "Turn feedback into a rule" : "A new rule"}</h3>
                <p>One instruction, in the firm’s words. It reaches the model on the next draft.</p>
              </div>
              <button className="close" type="button" onClick={() => setWriting(null)}>×</button>
            </div>
            <div className="modal-body">
              {writing.feedback && (
                <div className="feedback-origin">
                  <b>{writing.feedback.user_email ?? "Someone"} said</b>
                  {writing.feedback.excerpt && <blockquote className="feedback-quote">{writing.feedback.excerpt}</blockquote>}
                  <p>{writing.feedback.message}</p>
                </div>
              )}
              <label className="field-label" htmlFor="lessonScope">Applies to</label>
              <select id="lessonScope" style={{ width: "100%" }} value={writing.scope} disabled={busy} onChange={(e) => setWriting({ ...writing, scope: e.target.value })}>
                <option value={FIRM_WIDE}>Every document</option>
                {docTypes.map((d) => (
                  <option key={d.slug} value={d.slug}>{d.label}</option>
                ))}
              </select>
              <label className="field-label" htmlFor="lessonRule" style={{ marginTop: 12 }}>The rule</label>
              <textarea
                id="lessonRule"
                rows={4}
                value={writing.rule}
                disabled={busy}
                placeholder="e.g. Set every defined term in bold on first use and in the definitions clause."
                onChange={(e) => setWriting({ ...writing, rule: e.target.value })}
              />
            </div>
            <div className="modal-foot">
              <button className="btn" type="button" disabled={busy} onClick={() => setWriting(null)}>Cancel</button>
              <button
                className="btn yellow"
                type="button"
                disabled={busy || !writing.rule.trim()}
                onClick={async () => {
                  const ok = await post(
                    { action: "lesson", scope: writing.scope, rule: writing.rule, feedbackId: writing.feedback?.id ?? null },
                    "Rule saved and live — the next draft follows it.",
                  );
                  if (ok) setWriting(null);
                }}
              >
                {busy ? "Saving…" : "Save rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
