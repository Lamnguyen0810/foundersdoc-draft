"use client";

import { useState } from "react";

/**
 * "Continue with Google", on both screens.
 *
 * ── WHY IT HAS TO BE ON BOTH ────────────────────────────────────────────────
 * Somebody who registered with Google has no password — none was ever set —
 * so a sign-in screen offering only an email and a password offers them
 * nothing at all. The button existed on the sign-up screen first, which meant
 * a person could get in once and never again.
 *
 * ── WHAT IT DOES ────────────────────────────────────────────────────────────
 * Very little. It sends the browser to /auth/google on THIS site, saying
 * which screen it was on and where to land afterwards. That route talks to
 * Google; /auth/google/callback talks to Supabase. Nothing about Google, and
 * nothing about Supabase, happens in the browser any more — which is what
 * makes Google's consent screen name foundersdoc.com rather than a Supabase
 * address. See lib/auth/google.ts for the why.
 *
 * ── WHAT IT MUST SAY ────────────────────────────────────────────────────────
 * Which screen it is on. Google's round trip carries nothing about that, and
 * yet it is the difference between the two screens: on the sign-up screen a
 * new account is the point; on the sign-in screen a new account is a person
 * who has none and should be told so. The `intent` prop is required so that
 * no screen can forget to say.
 *
 * ── THE MARK ────────────────────────────────────────────────────────────────
 * Inline SVG, in Google's own four colours, on a white button. Their brand
 * guidelines ask for exactly that, and an <img> from their CDN would be one
 * more thing to load before somebody can sign in.
 */
export default function GoogleButton({
  /** Where to land afterwards. A path on this site, not a full URL. */
  next = "/draft",
  /** The screen this button is on. See "WHAT IT MUST SAY" above. */
  intent,
  label = "Continue with Google",
  disabled = false,
}: {
  next?: string;
  intent: "sign-in" | "sign-up";
  label?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  function go() {
    setBusy(true);
    const p = new URLSearchParams({ intent, next });
    /* A full navigation, not the router: /auth/google is a route handler
       that answers with a redirect to Google, and the app router has no
       business trying to render that. */
    window.location.assign(new URL(`/auth/google?${p.toString()}`, window.location.origin).href);
    /* The browser is leaving; nothing is reset because there is no "here"
       to come back to. */
  }

  return (
    <button
      type="button"
      className="btn btn-google"
      onClick={go}
      disabled={busy || disabled}
      style={{ width: "100%" }}
    >
      <GoogleMark />
      {busy ? "Opening Google…" : label}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.6c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.2 12.2-9.2z"
      />
    </svg>
  );
}

/** A rule with "or" sitting in it, between a password and Google. */
export function OrLine() {
  return (
    <div className="or-line">
      <span>or</span>
    </div>
  );
}
