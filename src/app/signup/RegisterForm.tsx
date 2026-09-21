"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { track } from "@/lib/track";
import GoogleButton, { OrLine } from "@/components/GoogleButton";

const MIN_PASSWORD_LENGTH = 12;

/**
 * Signing up. The whole of it, on one screen.
 *
 * ── WHAT WAS REMOVED, AND WHY ───────────────────────────────────────────────
 * There used to be a step in front of this one: join the waitlist, then come
 * back and choose a password. That made sense while FD AI was invitation-only
 * — the list WAS the product's front door, and a database trigger enforced it.
 * FD AI is open now, so the first screen asked people to queue for something
 * they were already allowed to have.
 *
 * The waitlist itself is not deleted. Every row stays, the admin console still
 * reads it, and anyone on it who registers is still matched to their row. It
 * simply no longer stands between a person and an account.
 *
 * ── WHY THERE IS NO EMAIL IN THE MIDDLE ─────────────────────────────────────
 * The first version of this sent an invitation and asked people to go and find
 * it. Every step between "I want to try this" and "I am trying this" loses
 * some of them, and an email step loses a lot: it depends on a template, a
 * mail provider, a spam filter and a person still being at their desk. It also
 * has to be configured correctly in three places before anybody can get in at
 * all, which is one place too many for a launch.
 *
 * So the account is made here, in the browser, with Supabase's own sign-up,
 * and the person is signed in before they have looked away.
 *
 * ── WHAT IS NOT CLAIMED ─────────────────────────────────────────────────────
 * Nobody has proved they own this address. They typed it in and nothing
 * checked. The account is worth three documents and a fortnight, and the real
 * owner takes it back with "Forgot your password?", so the trade is
 * deliberate — but it IS a trade, and turning "Confirm email" on in Supabase
 * is how FD reverses it. That needs a mail provider configured first, because
 * the built-in sender is rate-limited to a handful an hour.
 *
 * ── AND THE NAME BOX ────────────────────────────────────────────────────────
 * It is the only field here that is not strictly needed to make an account,
 * and it earns its place three times over: the product greets people by it,
 * the admin list is unreadable without it, and the Slack announcement of a new
 * account otherwise says "hoang.co" where a person's name should be. Google
 * hands one over without being asked; a password sign-up has to be asked.
 */

/** Supabase reports a trigger's refusal as a generic database error. */
function registerMessage(message: string): string {
  const m = message.toLowerCase();

  /* The one gate left in the database: FD can stop registration from a single
     UPDATE, with no deploy, if something goes wrong at three in the morning. */
  if (m.includes("registration_closed")) {
    return "New accounts are paused just now. Please try again shortly, or contact us.";
  }
  /* What that refusal actually looks like from the browser: GoTrue turns any
     exception from a trigger into this one sentence, with nothing in it. */
  if (m.includes("database error") || m.includes("saving new user")) {
    return "We could not open an account for that address. Please contact us and we will sort it out.";
  }
  if (m.includes("already registered") || m.includes("already exists")) {
    return "That address already has an account. Sign in instead.";
  }
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
    return "Sign-up is switched off in Supabase. Turn 'Allow new users to sign up' on.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "That does not look like an email address.";
  }
  if (m.includes("password")) return message;
  return "Could not create the account. Please try again, or contact us.";
}

export default function RegisterForm({
  supabaseUrl,
  supabaseKey,
  google,
}: {
  supabaseUrl: string;
  supabaseKey: string;
  /** Google sign-in is only offered where FD has configured the provider. */
  google: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const ready =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    accepted;

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    try {
      const supabase = createBrowserClient(supabaseUrl, supabaseKey);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        /* full_name is where 001's handle_new_user trigger looks first when it
           writes the profile row, and where 037's announcement looks first when
           it writes the Slack line. The same key Google fills in, deliberately,
           so neither of them needs to know which way the person came in. */
        options: { data: { full_name: name.trim() } },
      });

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
      <label style={{ display: "block" }}>
        <span className="field-label">Your name</span>
        <input
          className="input"
          type="text"
          autoComplete="name"
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label style={{ display: "block" }}>
        <span className="field-label">Work email</span>
        <input
          className="input"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label style={{ display: "block" }}>
        <span className="field-label">Choose a password</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
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
