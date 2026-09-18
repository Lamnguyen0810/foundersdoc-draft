"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { track } from "@/lib/track";

const MIN_PASSWORD_LENGTH = 12;

/**
 * Step two: choosing a password, on the page they are already looking at.
 *
 * ── WHY THERE IS NO EMAIL IN THE MIDDLE ─────────────────────────────────────
 * The first version of this sent an invitation and asked people to go and find
 * it. Every step between "I want to try this" and "I am trying this" loses
 * some of them, and an email step loses a lot: it depends on a template, a
 * mail provider, a spam filter and a person still being at their desk. It also
 * has to be configured correctly in three places before anybody can get in at
 * all, which is one place too many for a launch.
 *
 * So the account is made here, in the browser, with Supabase's own sign-up —
 * the same call any Next.js application makes — and the person is signed in
 * before they have looked away.
 *
 * ── THEN WHAT STOPS A STRANGER ──────────────────────────────────────────────
 * A trigger in the database: an account may be created only for an address
 * already on the waitlist, whichever provider asks. It refuses before the row
 * is written, so a refused sign-up never reaches 004's trigger and no trial
 * credits are granted. See 035_only_the_waitlist_may_register.sql.
 *
 * This form cannot talk its way past that, and neither can anything else —
 * which is the point of putting it there rather than here.
 *
 * ── WHAT IS NOT CLAIMED ─────────────────────────────────────────────────────
 * Nobody has proved they own this address. They typed it into the form one
 * screen ago and nothing checked. The account is worth three documents and a
 * fortnight, and the real owner takes it back with "Forgot your password?", so
 * the trade is deliberate — but it IS a trade, and turning "Confirm email" on
 * in Supabase is how FD reverses it.
 */

/** Supabase reports a trigger's refusal as a generic database error. */
function registerMessage(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("not_on_waitlist")) {
    return "That address is not on the waitlist. Join it first, on the previous step.";
  }
  if (m.includes("registration_closed")) {
    return "Registration is paused just now. You are on the list and we will be in touch.";
  }
  /* What the refusals above actually look like from the browser: GoTrue turns
     any exception from the trigger into this one sentence. */
  if (m.includes("database error") || m.includes("saving new user")) {
    return "We could not open an account for that address. Please contact us and we will sort it out.";
  }
  if (m.includes("already registered") || m.includes("already exists")) {
    return "That address already has an account. Sign in instead.";
  }
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
    return "Sign-up is switched off in Supabase. Turn 'Allow new users to sign up' on.";
  }
  if (m.includes("password")) return message;
  return "Could not create the account. Please try again, or contact us.";
}

export default function RegisterForm({
  email,
  supabaseUrl,
  supabaseKey,
  google,
}: {
  email: string;
  supabaseUrl: string;
  supabaseKey: string;
  /** Google sign-in is only offered where FD has configured the provider. */
  google: boolean;
}) {
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const ready = password.length >= MIN_PASSWORD_LENGTH && accepted;

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    try {
      const supabase = createBrowserClient(supabaseUrl, supabaseKey);
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

      if (signUpError) {
        setError(registerMessage(signUpError.message));
        return;
      }

      /* ── AN ADDRESS THAT ALREADY HAS AN ACCOUNT ────────────────────────
         Supabase does not say so — it answers a repeat sign-up with a
         lookalike success, on purpose, so that this form cannot be used to
         test which addresses are registered. The giveaway is an empty
         `identities` array, and the right thing to do with it is to say
         something true and useless to a stranger: sign in. */
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError("That address already has an account. Sign in instead.");
        return;
      }

      /* No session means "Confirm email" is still on in Supabase. The account
         exists and is waiting on a link — not the flow this page promises, but
         far better to say so than to send them to a drafting page that will
         bounce them straight back to sign in. */
      if (!data.session) {
        setCheck(true);
        return;
      }

      track("sign_up_started");
      /* A full document navigation, not router.push — the same reason as on
         the sign-in card: the router can serve a payload rendered while nobody
         was signed in, and the result is a blank page on the happiest moment
         in the product. */
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/draft");
      return; // leave the button disabled while the browser navigates away
    } catch {
      setError("Could not reach the sign-up service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient(supabaseUrl, supabaseKey);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/welcome?next=%2Fdraft` },
      });
      if (oauthError) {
        setError(registerMessage(oauthError.message));
        setBusy(false);
      }
      /* On success the browser is already leaving for Google. Nothing is reset
         here, because there is no "here" to come back to. */
    } catch {
      setError("Could not reach Google just now. Use a password instead.");
      setBusy(false);
    }
  }

  if (check) {
    return (
      <div className="note note-ok" style={{ marginTop: 20 }}>
        <b>Almost there — check your email.</b>
        <p style={{ margin: "6px 0 0" }}>
          Your account is made. Supabase is set to confirm addresses by email, so open the link we
          have just sent to <b>{email}</b> and you are in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={register} style={{ display: "grid", gap: 15, marginTop: 20 }}>
      <div className="note note-ok" style={{ margin: 0 }}>
        <b>You&rsquo;re on the list.</b>
        <p style={{ margin: "4px 0 0" }}>
          Choose a password and your three documents are ready to use.
        </p>
      </div>

      {/* Shown, not editable. They typed it one step ago, and an address they
          can change here is an address that no longer matches the waitlist row
          the database is about to check it against. */}
      <label style={{ display: "block" }}>
        <span className="field-label">Your email</span>
        <input className="input" type="email" value={email} readOnly disabled />
      </label>

      <label style={{ display: "block" }}>
        <span className="field-label">Choose a password</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span className="field-help">
          At least {MIN_PASSWORD_LENGTH} characters. Three unrelated words beat a short password
          with symbols in it.
        </span>
      </label>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5 }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          I understand FD AI produces drafts for a lawyer to review, not legal advice, and I
          accept the <a href="https://foundersdoc.com/terms-of-service">terms of service</a>.
        </span>
      </label>

      {tooShort && (
        <p className="note note-warn">That is shorter than {MIN_PASSWORD_LENGTH} characters.</p>
      )}
      {error && <p className="note note-warn">{error}</p>}

      <button type="submit" className="btn btn-gold" disabled={!ready || busy}>
        {busy ? "Creating your account…" : "Create my account"}
      </button>

      {google && (
        <>
          <div className="or-line">
            <span>or</span>
          </div>
          <button type="button" className="btn btn-google" onClick={withGoogle} disabled={busy}>
            <GoogleMark />
            Continue with Google
          </button>
        </>
      )}
    </form>
  );
}

/** Google's own mark, inline: their brand guidelines ask for this one. */
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
      <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.7z" />
      <path
        fill="#EA4335"
        d="M24 10.6c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.2 12.2-9.2z"
      />
    </svg>
  );
}
