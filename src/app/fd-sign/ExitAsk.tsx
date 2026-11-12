"use client";

import { useEffect, useRef, useState } from "react";
import { RATING_WORDS } from "@/lib/exit-feedback";
import { SIGN_EXIT_REASONS, type SignExitReason } from "@/lib/sign/exit";

/* ── "Before you go" on the FD Sign send page (0233) ─────────────────────────
   The same box, the same moments and the same look as drafting's
   (app/draft/ExitFeedback.tsx), with reasons that fit sending for signature:
   • desktop: the pointer leaves through the top of the window;
   • a link to another page on the site (the plans, sign-in and the signing-ready
     check are part of the flow and never ask);
   • the browser's Back button.
   Once per tab, only after a document is in and before it is sent. Whatever
   they choose, the "left at step …" line goes to #fdai-signing with their answer. */

export interface ExitAnswer {
  reason: SignExitReason | null;
  rating: number | null;
  comment: string | null;
}

const KEY = "fd_sign_exit_asked";
const asked = () => {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const markAsked = () => {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private window: it may ask twice */
  }
};
const BACK = "__back__";
const STEPS = ["Document", "People", "Fields", "Review and send"];

export default function ExitAsk({ canAsk, step, onLeave }: { canAsk: () => boolean; step: number; onLeave: (a: ExitAnswer) => void }) {
  const [open, setOpen] = useState<null | { href: string | null }>(null);
  const [reason, setReason] = useState<SignExitReason | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const leaving = useRef(false);
  const guard = useRef<string | null>(null);
  const live = useRef(canAsk);
  useEffect(() => {
    live.current = canAsk;
  }, [canAsk]);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const ok = () => live.current() && !openRef.current && !leaving.current && !asked();

  /* Back: one extra history entry for this same page, added once a document is in */
  useEffect(() => {
    const t = setInterval(() => {
      if (guard.current || !ok()) return;
      try {
        const here = window.location.href;
        window.history.pushState(window.history.state, "", here);
        guard.current = here;
      } catch {
        /* no history API: Back simply leaves */
      }
    }, 800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ask = (href: string | null) => {
      markAsked();
      setReason(null);
      setRating(0);
      setComment("");
      setOpen({ href });
    };
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget || e.clientY > 0 || !window.matchMedia("(pointer: fine)").matches) return;
      if (ok()) ask(null);
    };
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
      if (url.pathname === window.location.pathname) return;
      if (/^\/(signup|login|auth|billing|pricing|api)(\/|$)/.test(url.pathname) || url.pathname.startsWith("/fd-sign/check") || a.closest("[data-no-exit]")) return;
      if (!ok()) return;
      e.preventDefault();
      e.stopPropagation();
      ask(url.href);
    };
    const onPop = (e: PopStateEvent) => {
      if (!guard.current || window.location.href !== guard.current) {
        guard.current = null;
        return;
      }
      guard.current = null;
      e.stopImmediatePropagation();
      if (ok()) ask(BACK);
      else if (!leaving.current) window.history.back();
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
  const said = !!(reason || rating || comment.trim());

  const leave = () => {
    const go = open.href;
    /* the pointer only left the window: post now only if they answered (closing the tab posts the plain line) */
    if (go || said) onLeave({ reason, rating: rating || null, comment: comment.trim() || null });
    setOpen(null);
    leaving.current = true;
    if (go === BACK) window.history.back();
    else if (go) window.location.assign(go);
    else leaving.current = false; // pointer left the window: they may still stay
  };
  const stay = () => setOpen(null);

  return (
    <div className="fb-overlay" style={{ zIndex: 120 }} onClick={(e) => e.target === e.currentTarget && stay()}>
      <div className="fb-modal exit-modal" role="dialog" aria-modal="true" aria-labelledby="fds-exit-title">
        <h3 id="fds-exit-title">Taking a break? 👋</h3>
        <p className="fb-sub">
          You&rsquo;re at step {step} of 4 ({STEPS[step - 1] ?? "Document"}) and nothing has been sent yet. If you leave now, this request isn&rsquo;t kept, so you&rsquo;d start
          again next time.
        </p>

        <div className="exit-q">
          <p className="exit-label">
            If you have a moment, what&rsquo;s holding you back? <span className="exit-opt">(optional)</span>
          </p>
          <div className="exit-chips">
            {SIGN_EXIT_REASONS.map((r) => (
              <button key={r.code} type="button" className={`exit-chip${reason === r.code ? " on" : ""}`} aria-pressed={reason === r.code} onClick={() => setReason(reason === r.code ? null : r.code)}>
                <span aria-hidden="true">{r.emoji}</span> {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="exit-q">
          <p className="exit-label">How&rsquo;s FD Sign been so far?</p>
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

        <textarea rows={3} maxLength={300} value={comment} placeholder="Anything you'd like to share? We read every message." onChange={(e) => setComment(e.target.value)} />
        <p className="exit-thanks">Thank you, it really helps us make FD Sign better for you.</p>

        <div className="fb-actions exit-actions">
          <button type="button" className="dbtn" onClick={leave}>
            {said ? "Send and leave" : "Maybe later"}
          </button>
          <button type="button" className="dbtn gold" onClick={stay} autoFocus>
            Keep going
          </button>
        </div>
      </div>
    </div>
  );
}
