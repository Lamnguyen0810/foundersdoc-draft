"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * "Continue with Google", on both screens.
 *
 * ── WHY IT HAS TO BE ON BOTH ────────────────────────────────────────────────
 * Because signing in with Google and signing UP with Google are the same
 * request, and Supabase decides which it was. Somebody who registered with
 * Google has no password — none was ever set — so a sign-in screen offering
 * only an email and a password offers them nothing at all. The button existed
 * on the sign-up screen first, which meant a person could get in once and
 * never again.
 *
 * ── WHAT IT DOES NOT DECIDE ─────────────────────────────────────────────────
 * Whether the account may exist. Google proves who they are; the gate in
 * 038_the_door_opens.sql decides whether an account is allowed at all, and it
 * refuses before any row is written. A refusal comes back through Google's
 * redirect as a URL fragment, which /auth/welcome reads and turns into a
 * message on the sign-in screen.
 *
 * ── WHAT IT MUST SAY ────────────────────────────────────────────────────────
 * Which screen it is on. Google's round trip carries nothing about that, and
 * yet it is the difference between the two screens: on the sign-up screen a
 * new account is the point; on the sign-in screen a new account is a person
 * who has none and should be told so. So before the browser leaves for
 * Google, the button tells /auth/google where it was pressed, and
 * /auth/welcome asks that route afterwards what to do with what came back.
 * The `intent` prop is required so that no screen can forget to say.
 *
 * ── THE MARK ────────────────────────────────────────────────────────────────
 * Inline SVG, in Google's own four colours, on a white button. Their brand
 * guidelines ask for exactly that, and an <img> from their CDN would be one
 * more thing to load before somebody can sign in.
 */
export default function GoogleButton({
  supabaseUrl,
  supabaseKey,
  /** Where to land afterwards. A path on this site, not a full URL. */
  next = "/draft",
  /** The screen this button is on. See "WHAT IT MUST SAY" above. */
  intent,
  label = "Continue with Google",
  /** Told when Google itself could not be reached; the caller shows it. */
  onError,
  disabled = false,
}: {
  supabaseUrl: string;
  supabaseKey: string;
  next?: string;
  intent: "sign-in" | "sign-up";
  label?: string;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    onError?.("");
    try {
      /* Say where we are before we go. Best effort: if this cannot be said,
         the sign-in behaves as it always did rather than not at all. */
      await fetch("/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "leaving", intent }),
      }).catch(() => undefined);

      const supabase = createBrowserClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          /* /auth/welcome, not /auth/confirm: Google's round trip comes back
             with the session in the URL's HASH, which never reaches a server.
             See the note at the top of Welcome.tsx. */
          redirectTo: `${window.location.origin}/auth/welcome?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        onError?.("Could not open Google just now. Use your email and password instead.");
        setBusy(false);
      }
      /* On success the browser is already leaving for Google, so nothing is
         reset: there is no "here" to come back to. */
    } catch {
      onError?.("Could not reach Google just now. Use your email and password instead.");
      setBusy(false);
    }
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
