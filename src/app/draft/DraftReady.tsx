"use client";

import { useEffect, useRef, useState } from "react";
import DetailSlider, { DETAIL_LABELS, toLevel, type DetailLevel } from "./DetailSlider";

/**
 * "Your draft is ready" — the conversation beside the document.
 *
 * ── WHY THIS SCREEN EXISTS ──────────────────────────────────────────────────
 * Before it, generating threw the person straight into a full-width document.
 * That is the wrong handover: they have just answered six questions and get no
 * acknowledgement of what was done with them, no summary, and no obvious way to
 * ask for a change — only a wall of contract.
 *
 * So the draft is announced in the chat, the way a colleague would announce it:
 * here is what I did, here is the file, here is how to ask for something else.
 * The document opens BESIDE it when they choose to open it, and closing the
 * document never closes the conversation.
 */

export interface QuickRefinement {
  label: string;
  prompt: string;
}

export const QUICK_REFINEMENTS: QuickRefinement[] = [
  {
    label: "Simplify language",
    prompt: "Make the language simpler and easier to read without changing the legal meaning.",
  },
  {
    label: "Make more concise",
    prompt: "Make the draft more concise while preserving the key protections.",
  },
  {
    label: "Flag open points",
    prompt:
      "Flag every placeholder or point that still needs confirmation before this can be sent.",
  },
];

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

/** One answered question, for the summary in the person's own message. */
export interface AnswerLine {
  label: string;
  value: string;
}

export interface DraftReadyProps {
  docLabel: string;
  /**
   * "drafting" while the model is still writing, "ready" once it has finished.
   *
   * This distinction is the whole point. The pane used to say "Your draft is
   * ready" and "Done. I've drafted your document" the instant generation
   * STARTED — while the document beside it still said "Drafting…". Announcing
   * a finished document that does not exist yet is worse than showing nothing.
   */
  state: "drafting" | "ready";
  /** The answers the person gave, summarised back to them. */
  answers: AnswerLine[];
  /** How many answers were skipped, so the summary can be honest about gaps. */
  skippedCount: number;
  docOpen: boolean;
  busy: boolean;
  onOpenDocument: () => void;
  onOpenVersion: (version: { documentText: string; version: number; detailLevel: number }) => void;
  onAsk: (prompt: string) => void;
  fileName: string;
  initialVersion?: { documentText: string; version: number; detailLevel: number; fileName: string };
  ndaDetailLevel: number;
  error?: string | null;
  paywalled?: boolean;
  onChangeNdaDetailLevel: (level: 1 | 2 | 3 | 4 | 5) => void;
  /** A line from FD AI in the thread — e.g. "already at that level". */
  onNote?: (text: string) => void;
  /** The full questionnaire transcript, retained while drafting and afterwards. */
  conversation?: {
    who: "fd" | "me";
    text: string;
    label?: string;
    skipped?: boolean;
  }[];
  /** Questions opened again under the draft, with their "Generate draft" button. */
  editing?: React.ReactNode;
  /** 0–1: how much of the first draft has been written (drafting only). */
  progress?: number;
  /** Follow-up turns, oldest first. */
  follow: {
    who: "me" | "fd";
    text: string;
    /** On an answer changed under a draft: the question's name. */
    label?: string;
    version?: number;
    fileName?: string;
    documentText?: string;
    detailLevel?: number;
  }[];
  /** The DRAFTER'S NOTES the model wrote for the reviewing lawyer — every
   *  [[TO CONFIRM]] and skipped answer — shown here, beside the page, and
   *  never inside the document or its download. */
  notes?: string | null;
}

/**
 * What the drafter says about the draft, as a colleague would.
 *
 * The model's notes (the playbook's FD Notes, or the older foot block) are
 * not in the document; they are shown here as reminders. Each is written
 * (lib/prompt.ts, NOTES FOR THE USER) as
 *
 *   what is missing | Question: the form question | What to put: …, e.g. …
 *
 * and shown as a small card with those three parts, so the person knows
 * what to supply, where it came from and what a good answer looks like.
 * A note in any other shape is shown as it is. Rule references the model
 * appended ("See R10.1.") are for the playbook's benefit and are left off.
 */
export interface Reminder {
  what: string;
  question?: string;
  put?: string;
}

export function parseReminder(line: string): Reminder {
  const parts = line.split(/\s+\|\s+|\s*\|\s*(?=(?:question|what to put)\s*:)/i).map((p) => p.trim());
  const r: Reminder = { what: "" };
  const rest: string[] = [];
  for (const p of parts) {
    const q = /^question\s*:\s*(.+)$/i.exec(p);
    const w = /^what to put\s*:\s*(.+)$/i.exec(p);
    if (q) r.question = q[1].replace(/^["“]|["”]$/g, "");
    else if (w) r.put = w[1];
    else rest.push(p);
  }
  r.what = rest.join(" — ") || line;
  if (/^not on the form\.?$/i.test(r.question ?? "")) r.question = undefined;
  return r;
}

function ThingsToCheck({ text, onFill }: { text: string; onFill: (r: Reminder) => void }) {
  const lines = text
    .replace(/^DRAFTER['’]S NOTES:?\s*/i, "")
    .split(/\n+/)
    .map((l) =>
      l
        .replace(/^\s*[•\-–*]\s*/, "")
        .replace(/\s*\(?\bSee R\d+(?:\.\d+)?\.?\)?\s*$/i, "")
        .replace(/\s*\(?\bR\d+(?:\.\d+)?\)?\s*$/i, "")
        .trim(),
    )
    .filter(Boolean)
    .filter((l) => !/^not yet answered:?$/i.test(l));
  if (lines.length === 0) return null;
  const items = lines.map(parseReminder);
  return (
    <>
      <p>
        {items.length === 1
          ? "One thing to fill in or check before it goes out:"
          : `${items.length} things to fill in or check before it goes out:`}
      </p>
      <ol className="cg-reminders">
        {items.map((r, i) => (
          <li key={i} className="cg-reminder">
            <b className="cg-reminder-what">{r.what}</b>
            {r.question && (
              <span className="cg-reminder-row">
                <span className="cg-reminder-k">Question</span>
                <span>{r.question}</span>
              </span>
            )}
            {r.put && (
              <span className="cg-reminder-row">
                <span className="cg-reminder-k">What to put</span>
                <span>{r.put}</span>
              </span>
            )}
            <button type="button" className="cg-reminder-fill" onClick={() => onFill(r)}>
              Fill this in
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * How far the draft has got, as a bar. The model writes the document from
 * top to bottom, so the share of the expected length already written is a
 * fair measure; before the first words arrive it creeps, so the page never
 * looks stuck. It never claims 100% until the draft is actually there.
 */
export function DraftProgress({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const stage =
    pct < 15 ? "Reading your answers and the firm’s playbook" : pct < 92 ? "Writing the clauses" : "Finishing the draft";
  return (
    <div
      className="draft-progress"
      role="progressbar"
      aria-label="Drafting progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="draft-progress-track">
        <div className="draft-progress-fill" style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
      <div className="draft-progress-label">
        <span>{stage}…</span>
        <b>{pct}%</b>
      </div>
    </div>
  );
}

function FdAvatar() {
  return <div className="cg-avatar" aria-hidden="true">FD</div>;
}

export default function DraftReady({
  docLabel,
  state,
  answers,
  skippedCount,
  docOpen,
  busy,
  onOpenDocument,
  onOpenVersion,
  onAsk,
  fileName,
  initialVersion,
  ndaDetailLevel,
  error,
  paywalled = false,
  onChangeNdaDetailLevel,
  onNote,
  conversation = [],
  follow,
  notes = null,
  progress = 0,
  editing = null,
}: DraftReadyProps) {
  const [text, setText] = useState("");
  /* The names of the five levels come from DetailSlider, which is also what
     draws the card on the question. This screen used to keep its own list —
     "Concise, Standard, Detailed, Thorough, Maximum" against the question's
     "Minimal, Basic, Standard, Detailed, Comprehensive" — so the summary and
     the slider directly beneath it called the same level different things. */
  /* A level picked on the slider waits for "Redraft" — a new version costs
     a credit, so a nudge of the slider must not spend one. Remembered with
     the level it was picked against, so opening another version (a new
     ndaDetailLevel) drops a stale pick without an effect. */
  const [picked, setPicked] = useState<{ from: number; level: DetailLevel } | null>(null);
  const sliderValue: DetailLevel = picked && picked.from === ndaDetailLevel ? picked.level : toLevel(ndaDetailLevel);
  const pending = sliderValue !== ndaDetailLevel;
  const threadRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLTextAreaElement>(null);

  const ready = state === "ready";

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const thread = threadRef.current;
      if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [conversation, follow, busy, error, paywalled]);

  function chooseDetailLevel(level: DetailLevel) {
    setPicked({ from: ndaDetailLevel, level });
  }

  function send() {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    onAsk(t);
  }

  return (
    <section className="gen-left">
      <div className="gen-left-head">
        <div className="gen-left-title">
          <span className="eyebrow">FD AI</span>
          <h2>{ready ? "Your draft is ready" : `Drafting your ${docLabel}…`}</h2>
          <p>
            {ready
              ? "Review the generated document beside the chat, or ask FD AI to refine, explain or update any part of it."
              : "This usually takes under a minute. The document opens here as soon as it is finished."}
          </p>
        </div>
        <span className={`gen-ready${ready ? "" : " is-working"}`}>
          <i />
          {ready ? "Ready" : "Working"}
        </span>
      </div>

      <div className="gen-thread" ref={threadRef}>
        <div className="gen-follow-stream" aria-label="Question and answer history">
          {conversation.map((message, index) =>
            message.who === "fd" ? (
              <div className="cg-turn" key={`question-${index}`}>
                <FdAvatar />
                <div className="cg-msg"><p>{message.text}</p></div>
              </div>
            ) : (
              <div className="cg-user" key={`answer-${index}`}>
                <div className="cg-bubble">
                  {message.label && <b>{message.label}</b>}
                  <p style={{ margin: message.label ? "4px 0 0" : 0 }}>{message.text}</p>
                </div>
              </div>
            ),
          )}
        </div>

        {/* The person's own message, with their answers summarised back. Seeing
            what was actually sent is how someone spots that they answered a
            question wrongly — before reading 3,000 words of contract looking
            for the consequence. */}
        <div className="cg-user cg-summary-wrap">
          <div className="cg-bubble cg-summary">
            <div className="cg-summary-head">
              <b>Draft instructions</b>
              <span>{docLabel}</span>
            </div>
            {answers.length > 0 && (
              <dl className="cg-answers">
                {answers.map((a) => (
                  <div key={a.label}>
                    <dt>{a.label}</dt>
                    <dd>{a.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {skippedCount > 0 && (
              <p className="cg-answers-skipped">
                {skippedCount} {skippedCount === 1 ? "detail needs" : "details need"} confirmation
              </p>
            )}
          </div>
        </div>

        {!ready && (
          <div className="cg-turn">
                <FdAvatar />
            <div className="cg-msg">
              <p className="cg-typing" aria-label="Drafting">
                <i />
                <i />
                <i />
              </p>
            </div>
          </div>
        )}
        {!ready && (
          <div className="cg-progress">
            <DraftProgress value={progress} />
          </div>
        )}

        {ready && (
        <div className="cg-turn">
                <FdAvatar />
          <div className="cg-msg">
            <p>
              Here’s your <b>{docLabel}</b>, drafted on the firm’s playbook and precedents.{" "}
              {/* Say plainly what was and was not filled in. A draft that quietly
                  looks complete is the one that gets sent without being read. */}
              {skippedCount > 0 ? (
                <>
                  I used the details you gave me and left{" "}
                  <b>
                    {skippedCount} {skippedCount === 1 ? "blank" : "blanks"}
                  </b>{" "}
                  where you skipped a question — you’ll see them as underlined gaps.
                </>
              ) : (
                <>I used every answer you gave; anything I couldn’t confirm is an underlined gap.</>
              )}
            </p>

            <button
              type="button"
              className="gen-doc-card cg-file"
              title="Open in the document view"
              onClick={() => initialVersion ? onOpenVersion(initialVersion) : onOpenDocument()}
              aria-pressed={docOpen}
            >
              <span className="cg-file-ic">
                <DocIcon />
              </span>
              <span>
                <b>{initialVersion?.fileName ?? fileName}</b>
                <small>Version 1 · click to display</small>
              </span>
            </button>

            {notes && (
              <ThingsToCheck
                text={notes}
                onFill={(r) => {
                  /* Start the message for them: the thing to fill in, ready
                     for the answer. Sending it revises the draft. */
                  setText(`${r.what.replace(/[.\s]+$/, "")}: `);
                  requestAnimationFrame(() => {
                    const box = composeRef.current;
                    if (box) {
                      box.focus();
                      box.setSelectionRange(box.value.length, box.value.length);
                    }
                  });
                }}
              />
            )}
          </div>
        </div>
        )}

        <div className="gen-follow-stream">
          {follow.map((m, k) =>
            m.who === "me" ? (
              <div className="cg-user" key={k}>
                <div className="cg-bubble">
                  {m.label ? (
                    <>
                      <b>{m.label}</b>
                      <p style={{ margin: "4px 0 0" }}>{m.text}</p>
                    </>
                  ) : (
                    m.text
                  )}
                </div>
              </div>
            ) : (
              <div className="cg-turn" key={k}>
                <FdAvatar />
                <div className="cg-msg">
                  <p>{m.text}</p>
                  {m.fileName && m.documentText && (
                    <button
                      type="button"
                      className="gen-doc-card cg-file"
                      onClick={() => onOpenVersion({
                        documentText: m.documentText!,
                        version: m.version!,
                        detailLevel: m.detailLevel ?? 3,
                      })}
                    >
                      <span className="cg-file-ic"><DocIcon /></span>
                      <span>
                        <b>{m.fileName}</b>
                        <small>Version {m.version} · click to display</small>
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ),
          )}
          {busy && ready && (
            <div className="cg-turn">
                <FdAvatar />
              <div className="cg-msg">
                <p className="cg-typing">
                  <i />
                  <i />
                  <i />
                </p>
              </div>
            </div>
          )}
          {error && !busy && (
            <div className="cg-turn" role="alert">
                <FdAvatar />
              <div className="cg-msg">
                <p>{error}</p>
                <small>Your current document has been kept. You can try the request again.</small>
              </div>
            </div>
          )}
          {paywalled && !busy && (
            <div className="cg-turn">
                <FdAvatar />
              <div className="cg-msg">
                <p>You have no credits left. Each new version of a draft uses one credit.</p>
                <a className="btn btn-gold" href="/billing">Add credits</a>
              </div>
            </div>
          )}
          {ready && editing}
        </div>

        {ready && /non-disclosure/i.test(docLabel) && (
          <div className="gen-depth-row">
            <DetailSlider
              flat
              value={sliderValue}
              disabled={busy}
              label="Comprehensiveness of this draft"
              onChange={chooseDetailLevel}
            />
            {/* Choosing a level never drafts by itself: nothing happens until
                Generate is pressed, and pressing it at the level the draft
                already has says so in the chat instead of spending a credit. */}
            <div className={`gd-confirm${pending ? " is-pending" : ""}`} role="group" aria-label="Generate at this level">
              <p>
                {pending ? (
                  <>
                    Generate a new version at level {sliderValue} — {DETAIL_LABELS[sliderValue - 1]}? It uses one credit;
                    this version stays in the thread.
                  </>
                ) : (
                  <>Choose a level, then press Generate. Each new version uses one credit.</>
                )}
              </p>
              <div className="gd-confirm-btns">
                <button
                  type="button"
                  className="btn btn-gold"
                  disabled={busy}
                  onClick={() => {
                    if (pending) {
                      onChangeNdaDetailLevel(sliderValue);
                      return;
                    }
                    onNote?.(
                      `This draft is already at level ${ndaDetailLevel} — ${DETAIL_LABELS[toLevel(ndaDetailLevel) - 1]}, so there is nothing new to generate and no credit was used. Choose a different level on the slider, then press Generate.`,
                    );
                  }}
                >
                  Generate · 1 credit
                </button>
                {pending && (
                  <button type="button" className="btn" disabled={busy} onClick={() => setPicked(null)}>
                    Keep level {ndaDetailLevel}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {ready && (
          <div className="gen-quick">
            <p className="gen-section-label">Quick refinements · each new version uses one credit</p>
            <div className="gen-quick-row">
              {QUICK_REFINEMENTS.map((q) => (
                <button key={q.label} type="button" disabled={busy} onClick={() => onAsk(q.prompt)}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="gen-compose">
        <div className="box">
          <button type="button" className="gen-add" title="Attach a file" aria-label="Attach a file">
            +
          </button>
          <textarea
            ref={composeRef}
            rows={1}
            placeholder="Ask FD AI to revise or explain something…"
            value={text}
            disabled={busy || !ready}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a new line, as in every chat app.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="button" className="gen-send" title="Send" onClick={send} disabled={busy || !ready}>
            ↑
          </button>
        </div>
        <p className="hint">
          Attach another file or ask for a change. Closing the document never interrupts this
          conversation.
        </p>
      </div>
    </section>
  );
}
