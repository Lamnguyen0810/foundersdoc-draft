"use client";

import { useEffect, useRef, useState } from "react";

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
  /** The full questionnaire transcript, retained while drafting and afterwards. */
  conversation?: {
    who: "fd" | "me";
    text: string;
    label?: string;
    skipped?: boolean;
  }[];
  /** Follow-up turns, oldest first. */
  follow: {
    who: "me" | "fd";
    text: string;
    version?: number;
    fileName?: string;
    documentText?: string;
    detailLevel?: number;
  }[];
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
  conversation = [],
  follow,
}: DraftReadyProps) {
  const [text, setText] = useState("");
  const detailLabels = ["Concise", "Standard", "Detailed", "Thorough", "Maximum"] as const;
  const [sliderValue, setSliderValue] = useState(ndaDetailLevel);
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const ready = state === "ready";

  useEffect(
    () => () => {
      if (sliderTimer.current) clearTimeout(sliderTimer.current);
    },
    [],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const thread = threadRef.current;
      if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [conversation, follow, busy, error, paywalled]);

  function chooseDetailLevel(level: 1 | 2 | 3 | 4 | 5) {
    setSliderValue(level);
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    sliderTimer.current = setTimeout(() => {
      onChangeNdaDetailLevel(level);
      sliderTimer.current = null;
    }, 350);
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
            <div className="cg-msg">
              <p className="cg-typing" aria-label="Drafting">
                <i />
                <i />
                <i />
              </p>
            </div>
          </div>
        )}

        {ready && (
        <div className="cg-turn">
          <div className="cg-msg">
            <p>
              Done. I’ve drafted your <b>{docLabel}</b> on a Singapore-law precedent.{" "}
              {/* Say plainly what was and was not filled in. A draft that quietly
                  looks complete is the one that gets sent without being read. */}
              {skippedCount > 0 ? (
                <>
                  I filled in only the details you provided and left{" "}
                  <b>
                    {skippedCount} {skippedCount === 1 ? "detail" : "details"}
                  </b>{" "}
                  blank for you to complete — each one is marked in the document.
                </>
              ) : (
                <>I used every answer you gave. Anything I could not confirm is marked in the document.</>
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
          </div>
        </div>
        )}

        <div className="gen-follow-stream">
          {follow.map((m, k) =>
            m.who === "me" ? (
              <div className="cg-user" key={k}>
                <div className="cg-bubble">{m.text}</div>
              </div>
            ) : (
              <div className="cg-turn" key={k}>
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
              <div className="cg-msg">
                <p>{error}</p>
                <small>Your current document has been kept. You can try the request again.</small>
              </div>
            </div>
          )}
          {paywalled && !busy && (
            <div className="cg-turn">
              <div className="cg-msg">
                <p>You’ve used the free revisions included with this draft.</p>
                <a className="btn btn-gold" href="/billing">Add credits</a>
              </div>
            </div>
          )}
        </div>

        {ready && /non-disclosure/i.test(docLabel) && (
          <div className="gen-depth">
            <div className="gen-depth-head">
              <p className="gen-section-label">Comprehensiveness</p>
              <b>{sliderValue}/5 · {detailLabels[sliderValue - 1]}</b>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={sliderValue}
              disabled={busy}
              aria-label="NDA comprehensiveness"
              aria-valuetext={`Level ${sliderValue}: ${detailLabels[sliderValue - 1]}`}
              onChange={(event) =>
                chooseDetailLevel(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)
              }
            />
            <div className="gen-depth-scale" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((level) => (
                <span key={level} className={sliderValue === level ? "on" : ""}>{level}</span>
              ))}
            </div>
          </div>
        )}

        {ready && (
          <div className="gen-quick">
            <p className="gen-section-label">Quick refinements</p>
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
