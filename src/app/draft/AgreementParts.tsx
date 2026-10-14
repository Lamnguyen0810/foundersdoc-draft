"use client";

/**
 * The pieces of the NDA drafting screen (DraftChat + DraftReady) that the
 * other documents share: Term Sheet, Employment, Contractor, Co-founder, SHA,
 * SPA, SSA, IA, Services and Loan.
 *
 * Those screens were cloned from one another before the NDA screen grew its
 * drafting state, its progress bar and its chat box, so each of them jumped
 * from a "Preparing…" button straight to the finished document and had no
 * way to ask FD AI anything. These are the NDA's own parts — the same markup
 * and the same classes — so every document looks and behaves like the NDA:
 *
 *   - DraftingLeft: "Drafting your …" with the Working pill, the answers sent,
 *     the typing dots and the progress bar (DraftReady in its drafting state);
 *   - useDraftProgress: the bar's value while the server works;
 *   - useAskFD + AskComposer + FollowStream + GenCompose: questions to FD AI,
 *     in the questionnaire and under the finished document (/api/ask, free).
 */

import { useEffect, useRef, useState } from "react";
import DraftReady, { type AnswerLine } from "./DraftReady";
import { offTopicAnswer, smallTalk } from "@/lib/draft-help";
import { track } from "@/lib/track";

type Turn = { who: "fd" | "me"; text: string; label?: string; skipped?: boolean };

/* ── the progress bar ─────────────────────────────────────────────────── */

/**
 * How far the draft has got, 0–1, while `active`. The server does not stream
 * an assembled agreement, so the bar creeps the way the NDA's does before its
 * first words arrive: quickly at first, then slower, and never past 95% until
 * the document is actually there (the screen then changes to the draft).
 */
export function useDraftProgress(active: boolean, expectedMs = 18_000): number {
  const [value, setValue] = useState(0);
  const started = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      started.current = null;
      const t = setTimeout(() => setValue(0), 0);
      return () => clearTimeout(t);
    }
    started.current = Date.now();
    const tau = expectedMs / 3;
    const id = setInterval(() => {
      const t = Date.now() - (started.current ?? Date.now());
      setValue(0.95 * (1 - Math.exp(-t / tau)));
    }, 250);
    return () => clearInterval(id);
  }, [active, expectedMs]);
  return value;
}

const noop = () => {};

/** The left of the draft view while the agreement is being prepared: the NDA's
 *  "Drafting your …" screen, with the questionnaire kept above it. */
export function DraftingLeft({
  docLabel,
  answers,
  skippedCount,
  conversation,
  progress,
}: {
  docLabel: string;
  answers: AnswerLine[];
  skippedCount: number;
  conversation: Turn[];
  progress: number;
}) {
  return (
    <DraftReady
      docLabel={docLabel}
      state="drafting"
      answers={answers}
      skippedCount={skippedCount}
      docOpen={false}
      busy
      onOpenDocument={noop}
      onOpenVersion={noop}
      onAsk={noop}
      fileName=""
      ndaDetailLevel={3}
      onChangeNdaDetailLevel={noop}
      conversation={conversation}
      follow={[]}
      progress={progress}
    />
  );
}

/* ── asking FD AI ─────────────────────────────────────────────────────── */

/**
 * Questions to FD AI, as on the NDA: small talk is answered in the browser,
 * anything else by /api/ask (free, logged, limited per hour). Visitors are
 * told to sign in, as on the NDA.
 */
export function useAskFD(docLabel: string, docSlug: string, guest: boolean) {
  const [asking, setAsking] = useState(false);
  const [follow, setFollow] = useState<Turn[]>([]);
  /* A file the person attached with "+", read once and sent with each
     question so FD AI can answer about it (as the NDA reads an attached
     document). */
  const [attached, setAttached] = useState<{ name: string; text: string } | null>(null);

  async function answer(question: string, onScreen = "", help = "", phase: "form" | "drafted" = "form"): Promise<string> {
    const q = question.trim();
    const quick = smallTalk(q, docLabel);
    if (quick) return quick;
    if (guest) {
      return "I can explain any question on this form — sign in and I’ll answer, or book a consultation with a Founders Doc lawyer.";
    }
    setAsking(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, doc: docLabel, onScreen, help, phase, attached: attached?.text, attachedName: attached?.name }),
      });
      const j = (await res.json().catch(() => null)) as { answer?: string; error?: string; offTopic?: boolean } | null;
      track("chat_question", { doc_type: docSlug, source: j?.offTopic ? "off_topic" : "ai" });
      if (j?.offTopic) return offTopicAnswer(docLabel, onScreen || undefined);
      return j?.answer || j?.error || "I couldn’t answer that just now. Try again in a moment.";
    } catch {
      return "I couldn’t answer that just now. Check your connection and try again.";
    } finally {
      setAsking(false);
    }
  }

  /** A question under the finished document: both turns go in the thread. */
  async function askFollow(question: string) {
    const q = question.trim();
    if (!q || asking) return;
    setFollow((f) => [...f, { who: "me", text: q }]);
    const a = await answer(q, "", "", "drafted");
    setFollow((f) => [...f, { who: "fd", text: a }]);
  }

  /** "+": read a Word, PDF or text file (/api/extract) and keep it for the
   *  questions that follow. Returns what FD AI says about it. */
  async function attach(file: File): Promise<string> {
    if (guest) return "Sign in to attach a file — I’ll read it and answer your questions about it.";
    setAsking(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const j = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok || !j?.text) return j?.error ?? "That file could not be read. Try a Word, PDF or text file.";
      setAttached({ name: file.name, text: j.text.slice(0, 20_000) });
      track("source_uploaded", { doc_type: docSlug, source: "chat" });
      return `I’ve read ${file.name}. Ask me anything about it — for example, how it compares with this ${docLabel}.`;
    } catch {
      return "That file could not be read. Check your connection and try again.";
    } finally {
      setAsking(false);
    }
  }

  async function attachFollow(file: File) {
    if (asking) return;
    setFollow((f) => [...f, { who: "me", text: `Attached ${file.name}` }]);
    const a = await attach(file);
    setFollow((f) => [...f, { who: "fd", text: a }]);
  }

  return { asking, answer, follow, askFollow, attach, attachFollow };
}

/** The NDA's typing dots, as a message from FD AI. */
export function TypingTurn({ convo = false }: { convo?: boolean }) {
  const dots = (
    <span className="cg-typing" role="status" aria-label="FD AI is answering">
      <i />
      <i />
      <i />
    </span>
  );
  if (convo) {
    return (
      <div className="m">
        <div className="av">FD</div>
        <div>
          <div className="txt">{dots}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="cg-turn">
      <div className="cg-avatar" aria-hidden="true">FD</div>
      <div className="cg-msg">
        <p className="cg-typing" aria-label="FD AI is answering">
          <i />
          <i />
          <i />
        </p>
      </div>
    </div>
  );
}

function AttachButton({ className, disabled, onAttach }: { className: string; disabled: boolean; onAttach?: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  if (!onAttach) return <span className={className} aria-hidden="true">+</span>;
  return (
    <>
      <button type="button" className={className} title="Attach a file" aria-label="Attach a file" disabled={disabled} onClick={() => ref.current?.click()}>
        +
      </button>
      <input
        ref={ref}
        type="file"
        hidden
        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onAttach(f);
        }}
      />
    </>
  );
}

/** The message box under the questionnaire — the NDA's, for questions. */
export function AskComposer({
  placeholder = "Ask FD AI a question",
  disabled = false,
  onSend,
  onAttach,
  children,
}: {
  placeholder?: string;
  disabled?: boolean;
  onSend: (text: string) => void;
  onAttach?: (file: File) => void;
  children?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    setText("");
    onSend(t);
  };
  return (
    <div className="composer">
      <div className="box">
        <AttachButton className="ic" disabled={disabled} onAttach={onAttach} />
        <textarea
          rows={1}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className="ic send" title="Send" disabled={!text.trim() || disabled} onClick={send}>
          ↑
        </button>
      </div>
      {children}
    </div>
  );
}

/** Questions and answers under the finished document. */
export function FollowStream({ follow, asking }: { follow: Turn[]; asking: boolean }) {
  if (follow.length === 0 && !asking) return null;
  return (
    <div className="gen-follow-stream">
      {follow.map((m, k) =>
        m.who === "me" ? (
          <div className="cg-user" key={k}>
            <div className="cg-bubble">{m.text}</div>
          </div>
        ) : (
          <div className="cg-turn" key={k}>
            <div className="cg-avatar" aria-hidden="true">FD</div>
            <div className="cg-msg">
              <p>{m.text}</p>
            </div>
          </div>
        ),
      )}
      {asking && <TypingTurn />}
    </div>
  );
}

/** The NDA's message box under the finished document. Questions are answered
 *  here; the wording itself is changed in the document beside it (free), or
 *  by changing an answer and drafting again. */
export function GenCompose({ disabled = false, onSend, onAttach }: { disabled?: boolean; onSend: (text: string) => void; onAttach?: (file: File) => void }) {
  const [text, setText] = useState("");
  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    setText("");
    onSend(t);
  };
  return (
    <div className="gen-compose">
      <div className="box">
        <AttachButton className="gen-add" disabled={disabled} onAttach={onAttach} />
        <textarea
          rows={1}
          placeholder="Ask FD AI to explain something…"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className="gen-send" title="Send" onClick={send} disabled={disabled || !text.trim()}>
          ↑
        </button>
      </div>
      <p className="hint">
        Attach another file or ask about any clause. To change the wording, edit the document beside this — it’s free.
      </p>
    </div>
  );
}

/** The NDA's document icon, for the "click to display" card. */
export function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

/**
 * Waits at least `ms` for `work`. An assembled agreement can come back in a
 * second, which flashed the drafting screen too fast to read; the NDA's
 * drafting screen is always seen, so this one is too.
 */
export async function atLeast<T>(work: Promise<T>, ms = 2500): Promise<T> {
  const [out] = await Promise.all([work, new Promise((r) => setTimeout(r, ms))]);
  return out;
}


/* ── things to fill in or check ───────────────────────────────────────── */

export interface ReminderItem {
  what: string;
  rows: { k: string; v: string }[];
  action?: { label: string; run: () => void };
}

/** The NDA's numbered list (DraftReady's ThingsToCheck), same markup. */
export function ReminderList({ items }: { items: ReminderItem[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <p>
        {items.length === 1 ? "One thing to fill in or check before it goes out:" : `${items.length} things to fill in or check before it goes out:`}
      </p>
      <ol className="cg-reminders">
        {items.map((r, i) => (
          <li key={i} className="cg-reminder">
            <b className="cg-reminder-what">{r.what}</b>
            {r.rows.map((row) => (
              <span className="cg-reminder-row" key={row.k}>
                <span className="cg-reminder-k">{row.k}</span>
                <span>{row.v}</span>
              </span>
            ))}
            {r.action && (
              <button type="button" className="cg-reminder-fill" onClick={r.action.run}>
                {r.action.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

type PointFlag = { level: string; title?: string; reason: string; field?: string };

const PARTY_WORDS =
  /\b(name|address|registration|uen|nric|passport|signator|signs|bank|account|swift|email|company|party|parties|lender|borrower|employer|employee|contractor|founder|shareholder|investor|seller|buyer|customer|provider|target|representative)/i;

const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.replace(/s$/, ""));

/**
 * The blanks the agreement was assembled with ([●]) and the points for the
 * lawyer, as the NDA's "things to fill in or check". Each opens the question
 * it belongs to, where there is one, so it can be answered and drafted again.
 */
export function buildReminders<S>(o: {
  missing: string[];
  flags: PointFlag[];
  steps: S[];
  label: (s: S) => string;
  question: (s: S) => string | undefined;
  id: (s: S) => string;
  isQuestion: (s: S) => boolean;
  open: (s: S) => void;
}): ReminderItem[] {
  /* Flags are matched strictly (their question, or two words in common);
     a general note such as "Beta" then has no button rather than a wrong one. */
  const find = (text: string, field?: string, strict = false): S | undefined => {
    if (field) {
      const hit = o.steps.find((s) => o.id(s) === field);
      if (hit) return hit;
    }
    const want = words(text);
    const party = !strict && PARTY_WORDS.test(text);
    let best: S | undefined;
    let score = 0;
    for (const s of o.steps) {
      const hay = new Set(words(`${o.label(s)} ${o.question(s) ?? ""}`));
      let n = want.filter((w) => hay.has(w)).length;
      if (party && !o.isQuestion(s)) n += 2;
      if (n > score) {
        score = n;
        best = s;
      }
    }
    return strict && score < 2 ? undefined : best;
  };
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  /* Some assemblers name a blank by its field ("id_no"): say it in words. */
  const FIELD_WORDS: Record<string, string> = {
    id_no: "registration or ID number",
    signatory_name: "signatory's name",
    signatory_title: "signatory's title",
    account_no: "bank account number",
    account_name: "bank account name",
    bank_address: "bank address",
    swift: "SWIFT / BIC code",
  };
  const say = (m: string) => FIELD_WORDS[m] ?? m.replace(/_/g, " ");
  const items: ReminderItem[] = [];
  for (const m of o.missing) {
    const s = find(say(m));
    items.push({
      what: `${cap(say(m))} is missing from the agreement`,
      rows: [
        ...(s ? [{ k: "Question", v: o.question(s) ?? o.label(s) }] : []),
        { k: "What to put", v: "Answer the question and draft again, or type it into the document where it shows [●]" },
      ],
      action: s ? { label: "Fill this in", run: () => o.open(s) } : undefined,
    });
  }
  for (const f of o.flags) {
    if (f.level !== "yellow" && f.level !== "red") continue;
    const s = find(f.title ?? "", f.field, true);
    items.push({
      what: f.title ?? "Worth checking",
      rows: [
        ...(s && o.isQuestion(s) ? [{ k: "Question", v: o.question(s) ?? o.label(s) }] : []),
        { k: "To check", v: f.reason },
      ],
      action: s ? { label: "Change answer", run: () => o.open(s) } : undefined,
    });
  }
  return items;
}
