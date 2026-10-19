"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/track";
import { EXIT_REASONS, RATING_WORDS, type ExitReason } from "@/lib/exit-feedback";

/* ── "Before you go" ─────────────────────────────────────────────────────────
   Many people start answering and leave before they have a draft. When they
   look like leaving, this asks them why — a reason, a 1–5 rating and an
   optional comment — and, if they have no account, offers one, since that is
   what keeps their answers.

   Each screen says where its visitor is with one line:

     useExitFeedback({ doc: "ipaa", docLabel: "IP Assignment Agreement",
                       answered: 4, finished: false, guest });

   and the one host in draft/layout.tsx does the rest.

   WHEN IT OPENS (once per document per tab, never after a draft exists)
   • Desktop: the pointer leaves through the top of the window — on its way to
     the close button, the tab bar or the address bar.
   • Any device: a link to somewhere else on the site is clicked. The click is
     held, the box opens, and the link is followed when they choose to leave.
   • Any device: the browser's Back button (and Android's back gesture). Once
     the first question is answered, one extra history entry for this same
     page is added — a copy of the router's own entry, so the router treats
     it as its own. Back then lands on the copy: the box opens instead of the
     page changing. Keep drafting stays; Leave goes back for real.
   Not on closing the tab: a page may only show the browser's own "Leave
   site?" box there, with no question in it, and that box would also stop
   the sign-up and payment pages the flow itself sends people to.
   Links that are part of the flow (sign-up, sign-in, billing) never ask.     */

export interface ExitState {
  doc: string;
  docLabel: string;
  /** Questions answered so far. Nothing happens before the first. */
  answered: number;
  total?: number;
  /** A draft exists or is being made: leaving now is success, not giving up. */
  finished: boolean;
  guest: boolean;
}

/* A tiny store: the screen writes where the visitor is, the host reads it. */
let current: ExitState | null = null;
let owner: object | null = null;
/* What the screen said just before it went away. On Back the router takes
   the screen down a moment before the browser reports the move, so Back is
   judged on this when it comes within a couple of seconds. */
let lastSeen: { state: ExitState; at: number } | null = null;
const recent = (): ExitState | null => current ?? (lastSeen && Date.now() - lastSeen.at < 2000 ? lastSeen.state : null);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Called by each drafting screen on every render. */
export function useExitFeedback(state: ExitState) {
  const { doc, docLabel, answered, total, finished, guest } = state;
  /* Which screen wrote last: a screen that goes away clears only its own
     state, never a newer screen's (the router may mount the new one first). */
  const [me] = useState(() => ({}));
  useEffect(() => {
    current = { doc, docLabel, answered, total, finished, guest };
    owner = me;
    emit();
  }, [me, doc, docLabel, answered, total, finished, guest]);
  useEffect(
    () => () => {
      if (owner !== me) return;
      if (current) lastSeen = { state: current, at: Date.now() };
      current = null;
      owner = null;
      emit();
    },
    [me],
  );
}

const shownKey = (doc: string) => `fd_exit_asked_${doc}`;
const alreadyAsked = (doc: string) => {
  try {
    return sessionStorage.getItem(shownKey(doc)) === "1";
  } catch {
    return false;
  }
};
const markAsked = (doc: string) => {
  try {
    sessionStorage.setItem(shownKey(doc), "1");
  } catch {
    /* private window: it may ask twice, nothing worse */
  }
};
const anonId = () => {
  try {
    return sessionStorage.getItem("fd_anon");
  } catch {
    return null;
  }
};

type Trigger = "exit_intent" | "link" | "back";
/** open.href when Leave should go back in history rather than to a page. */
const BACK = "__back__";

export default function ExitFeedbackHost() {
  const state = useSyncExternalStore(subscribe, () => current, () => null);
  const [open, setOpen] = useState<null | { trigger: Trigger; href?: string; s: ExitState }>(null);
  const [reason, setReason] = useState<ExitReason | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const leaving = useRef(false);
  /* The extra history entry that catches Back (see the notes above). */
  const guard = useRef<string | null>(null);

  const live = !!state && state.answered > 0 && !state.finished;
  /* The listeners are registered once, so they read the latest value here. */
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  /* Arm the Back catcher once the first answer is in, if not asked yet. */
  useEffect(() => {
    if (!live || guard.current || !state || alreadyAsked(state.doc)) return;
    try {
      /* Both entries say "this document's conversation", so the NDA screen's
         own Back handling (DraftChat) stays on it rather than opening the
         catalogue when the copy is left. */
      const here = window.location.href;
      const entry = { ...((window.history.state as object | null) ?? {}), fdScreen: "chat", fdSlug: state.doc };
      window.history.replaceState(entry, "", here);
      window.history.pushState(entry, "", here);
      guard.current = here;
    } catch {
      /* no history API: Back simply leaves */
    }
  }, [live, state]);

  useEffect(() => {
    const canAsk = () => {
      const s = recent();
      return !!s && s.answered > 0 && !s.finished && !openRef.current && !leaving.current && !alreadyAsked(s.doc);
    };
    const ask = (trigger: Trigger, href?: string) => {
      const s = recent()!;
      markAsked(s.doc);
      setReason(null);
      setRating(0);
      setComment("");
      setOpen({ trigger, href, s });
      track("exit_prompt_shown", { doc_type: s.doc, step: s.answered, total_steps: s.total, source: trigger });
    };

    /* Desktop: heading for the top of the window. */
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget || e.clientY > 0) return;
      if (!window.matchMedia("(pointer: fine)").matches) return;
      if (canAsk()) ask("exit_intent");
    };

    /* A link elsewhere on the site: hold it, ask, then follow it. */
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (/^\/(signup|login|auth|billing|api)(\/|$)/.test(url.pathname) || a.closest("[data-no-exit]")) return;
      if (!canAsk()) return;
      e.preventDefault();
      e.stopPropagation();
      ask("link", url.href);
    };

    /* Back: the copy was just left, so this is still the same page. */
    const onPop = (e: PopStateEvent) => {
      if (!guard.current || window.location.href !== guard.current) {
        guard.current = null;
        return;
      }
      guard.current = null;
      /* Still on the same page: nothing else needs to hear about it. */
      e.stopImmediatePropagation();
      if (canAsk()) ask("back", BACK);
      else if (!leaving.current) window.history.back(); // nothing to ask: finish going back
    };

    document.addEventListener("mouseout", onOut);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop, true);
    return () => {
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop, true);
    };
  }, []);

  if (!open) return null;
  const st = open.s;

  const stay = () => {
    track("exit_prompt_stayed", { doc_type: st.doc, step: st.answered, source: open.trigger });
    setOpen(null);
  };

  const leave = (withFeedback: boolean) => {
    const go = open.href;
    if (!withFeedback) track("exit_prompt_left", { doc_type: st.doc, step: st.answered, source: open.trigger });
    setOpen(null);
    if (go === BACK) {
      leaving.current = true;
      window.history.back();
    } else if (go) {
      leaving.current = true;
      window.location.assign(go);
    }
  };

  const send = async () => {
    if (!reason && !rating && !comment.trim()) return leave(false);
    setSending(true);
    track("exit_feedback", { doc_type: st.doc, step: st.answered, total_steps: st.total, reason: reason ?? "none", count: rating, source: open.trigger });
    await fetch("/api/exit-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        doc: st.doc,
        step: st.answered,
        total: st.total ?? null,
        reason,
        rating: rating || null,
        comment: comment.trim() || null,
        trigger: open.trigger,
        anon_id: anonId(),
      }),
    }).catch(() => {});
    setSending(false);
    leave(true);
  };

  const done = st.total
    ? `${st.answered} of ${st.total} questions answered`
    : `${st.answered} ${st.answered === 1 ? "question" : "questions"} answered`;
  const said = !!(reason || rating || comment.trim());

  return (
    <div className="fb-overlay" onClick={(e) => e.target === e.currentTarget && stay()}>
      <div className="fb-modal exit-modal" role="dialog" aria-modal="true" aria-labelledby="exit-title">
        <h3 id="exit-title">Taking a break? 👋</h3>
        <p className="fb-sub">
          You&rsquo;ve made a good start on your {st.docLabel} ({done}).{" "}
          {st.guest
            ? "Your answers are saved in this tab. Create a free account whenever you're ready to keep them and get your draft."
            : "Your answers are saved in this tab, so you can pick up right where you left off."}
        </p>

        <div className="exit-q">
          <p className="exit-label">
            If you have a moment, what&rsquo;s holding you back? <span className="exit-opt">(optional)</span>
          </p>
          <div className="exit-chips">
            {EXIT_REASONS.map((r) => (
              <button key={r.code} type="button" className={`exit-chip${reason === r.code ? " on" : ""}`} aria-pressed={reason === r.code} onClick={() => setReason(reason === r.code ? null : r.code)}>
                <span aria-hidden="true">{r.emoji}</span> {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="exit-q">
          <p className="exit-label">How&rsquo;s your experience been so far?</p>
          <div className="exit-rate">
            <div className="exit-stars" role="radiogroup" aria-label="Your rating out of 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} out of 5: ${RATING_WORDS[n]}`} title={RATING_WORDS[n]} className={`exit-star${n <= rating ? " on" : ""}`} onClick={() => setRating(rating === n ? 0 : n)}>
                  ★
                </button>
              ))}
            </div>
            {rating > 0 && <span className="exit-rate-word">{RATING_WORDS[rating]}</span>}
          </div>
        </div>

        <textarea rows={3} maxLength={1000} value={comment} placeholder="Anything you'd like to share? We read every message." onChange={(e) => setComment(e.target.value)} disabled={sending} />
        <p className="exit-thanks">Thank you, it really helps us make FD AI better for you.</p>

        <div className="fb-actions exit-actions">
          <button type="button" className="dbtn" onClick={() => void send()} disabled={sending}>
            {sending ? "Sending…" : said ? "Send and leave" : "Maybe later"}
          </button>
          {st.guest && (
            <a className="dbtn" href="/signup?from=draft" onClick={() => { leaving.current = true; track("exit_prompt_signup", { doc_type: st.doc, step: st.answered }); }}>
              Save my progress (free)
            </a>
          )}
          <button type="button" className="dbtn gold" onClick={stay} autoFocus>
            Keep drafting
          </button>
        </div>
      </div>
    </div>
  );
}
