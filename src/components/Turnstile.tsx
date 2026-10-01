"use client";

/**
 * The bot check on every form that talks to Supabase Auth with a password or
 * an email: sign-up, sign-in, password reset, resending the confirmation and
 * changing the password. Cloudflare Turnstile — free, no limit, and for nearly
 * everyone invisible ("Managed" mode only asks for a click when the visitor
 * looks automated).
 *
 * How it fits together:
 *   1. NEXT_PUBLIC_TURNSTILE_SITE_KEY (Vercel) turns the widget on.
 *   2. The widget hands back a one-time token, which each form passes to
 *      Supabase as captchaToken.
 *   3. Supabase checks the token with Cloudflare, once "CAPTCHA protection"
 *      is switched on (Authentication -> Attack Protection, Turnstile, with
 *      the Secret Key).
 *
 * Without the site key nothing is shown and no token is sent, so the forms
 * work exactly as before — the code can go live before the keys exist. Turn
 * on the Supabase side only AFTER the site key is live, or every sign-in fails.
 *
 * A token works once. Each form bumps `round` after every attempt, and the
 * widget fetches a fresh token.
 */

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
/** Whether the bot check is in use on this site. */
export const turnstileOn = TURNSTILE_SITE_KEY.length > 0;

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile blocked"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export default function Turnstile({
  onToken,
  round = 0,
  action,
}: {
  /** A fresh token, or null when it expires or fails. */
  onToken: (token: string | null) => void;
  /** Bump after each attempt: a token works once. */
  round?: number;
  /** Shown in Cloudflare's analytics: "signup", "login", … */
  action?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!turnstileOn || !box.current) return;
    let gone = false;
    loadTurnstile()
      .then((ts) => {
        if (gone || !box.current || widget.current) return;
        widget.current = ts.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: "auto",
          size: "flexible",
          appearance: "interaction-only",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      gone = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [action]);

  /* A new attempt: the old token is spent. */
  useEffect(() => {
    if (round === 0 || !widget.current || !window.turnstile) return;
    cb.current(null);
    window.turnstile.reset(widget.current);
  }, [round]);

  if (!turnstileOn) return null;
  return <div ref={box} className="turnstile-box" />;
}
