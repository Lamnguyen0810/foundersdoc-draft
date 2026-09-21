"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { track } from "@/lib/track";
import GoogleButton, { OrLine } from "@/components/GoogleButton";

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
        {/* ── WHO THIS IS FOR ──────────────────────────────────────────────
            This said "drafts for a lawyer to review", which is wrong about the
            product: FD AI is for whoever needs a document, and most of them are
            founders rather than solicitors. Read on the way in, it told the
            person that what they were about to make would not be usable until
            somebody else had looked at it — which is not the offer.

            What it does NOT drop is "not legal advice". That sentence is the
            one doing the work on a law firm's sign-up screen, and it is
            accurate however competent the draft is. */}
        <span>
          I understand FD AI produces document drafts, not legal advice, and I accept the{" "}
          <a href="https://foundersdoc.com/terms-of-service">terms of service</a>.
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
          <OrLine />
          <GoogleButton
            supabaseUrl={supabaseUrl}
            supabaseKey={supabaseKey}
            next="/draft"
            disabled={busy}
            onError={(m) => setError(m || null)}
          />
        </>
      )}
    </form>
  );
}

