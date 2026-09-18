"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { track } from "@/lib/track";

/**
 * The Supabase URL and publishable key are passed in as props rather than read
 * from process.env here.
 *
 * Why: Next.js inlines NEXT_PUBLIC_* variables into the client bundle at BUILD
 * time. Reading them in a client component means the app silently breaks if the
 * variables were added after the build — which is exactly what happens the first
 * time you wire Supabase up. Passing them from the server component means they
 * are read at request time and no rebuild is needed.
 *
 * Sending the publishable key to the browser is correct: it is designed to be
 * public and every request it makes is constrained by row-level security.
 */
/**
 * Turn a Supabase auth failure into something the person can act on.
 *
 * The old version said "those details were not accepted" for everything, which
 * is the right instinct — a login form should not confirm whether an address is
 * registered — but applied too widely it hides failures that have nothing to do
 * with the password, and leaves someone retyping a password that was correct
 * all along.
 *
 * The judgement here: this system has public sign-up switched OFF and every
 * account is created by the firm, so there is no stranger to enumerate accounts
 * for. A wrong password still gets the vague answer. The states an
 * administrator needs to SEE — an account never confirmed, a locked-out person,
 * too many attempts — are named, because only the firm can fix them and nobody
 * can fix what they cannot see.
 */
function signInMessage(error: { message?: string; code?: string; status?: number }): string {
  const code = (error.code ?? "").toLowerCase();
  const text = (error.message ?? "").toLowerCase();
  const is = (needle: string) => code.includes(needle) || text.includes(needle.replace(/_/g, " "));

  if (is("email_not_confirmed")) {
    return (
      "This account exists but has never been confirmed, so it cannot sign in yet — " +
      "the password is not the problem. An administrator confirms it in Supabase → " +
      "Authentication → Users → the three dots beside the account → Confirm email."
    );
  }
  if (is("over_request_rate_limit") || is("over_email_send_rate_limit") || error.status === 429) {
    return "Too many attempts in a short time. Wait a minute or two, then try again.";
  }
  if (is("user_banned")) return "This account has been suspended. Ask the firm.";
  if (is("invalid_api_key") || is("no api key") || is("api key")) {
    return (
      "The site cannot talk to the sign-in service: its API key is wrong. This is a site " +
      "setting, not your password. Check NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY on the " +
      "hosting project against Supabase → Project Settings → API Keys."
    );
  }
  if (is("signups_not_allowed") || is("email_provider_disabled")) {
    return "Email sign-in is switched off for this project. An administrator turns it back on in Supabase → Authentication → Providers → Email.";
  }
  if (is("failed_to_fetch") || is("network")) {
    return "Could not reach the sign-in service. Check your connection and try again.";
  }
  // Wrong password, unknown address, anything else: stay vague on purpose.
  return "Those details were not accepted. Check the email and password and try again.";
}

export default function LoginForm({
  supabaseUrl,
  supabaseKey,
}: {
  supabaseUrl: string;
  supabaseKey: string;
}) {
  const params = useSearchParams();
  /* Only ever a path on this site. Without this check, /login?next=https://evil
     would send someone straight off the domain after they authenticate. */
  const raw = params.get("next") || "/draft";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/draft";

  /* Messages for the redirects that land here: /auth/confirm sends people back
     with a reason when an email link fails, and the middleware sends them here
     with auth-unavailable when the auth service cannot be reached at all. Until
     this map existed those redirects arrived as a bare form with no explanation
     of why the person had been bounced. */
  const REASONS: Record<string, string> = {
    "auth-unavailable":
      "Sign-in is temporarily unavailable, so the workspace cannot be opened. The public site is unaffected. Please try again shortly, or tell the firm if it persists.",
    "bad-link": "That link was not valid. Ask for a new one.",
    "link-expired":
      "That link has expired or has already been used. Reset links work once, and not for long — request another below.",
    "not-configured": "Sign-in is not configured on this site yet.",
  };

  /* Where closing an account lands. Not an error — they asked for this — so it
     is worded as a confirmation rather than a refusal. */
  const CLOSED: Record<string, string> = {
    deactivate:
      "Your account is deactivated and you have been signed out everywhere. Contact FoundersDoc when you want it opened again.",
    delete:
      "Your account is closed. Your documents will be deleted in 30 days. If this was a mistake, contact FoundersDoc before then.",
  };
  const closedNote = CLOSED[params.get("closed") ?? ""] ?? null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(REASONS[params.get("error") ?? ""] ?? null);
  const [mode, setMode] = useState<"sign-in" | "forgot">("sign-in");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        /* The REASON CODE only — never the address that was tried. A run of
           these with reason "email_not_confirmed" tells an administrator that
           an account was created without being confirmed, which is a fault in
           the firm's setup and otherwise invisible. */
        track("sign_in_failed", { reason: (error.code ?? "unknown").slice(0, 40) });
        setError(signInMessage(error));
        return;
      }
      /* ── A CLOSED ACCOUNT DOES NOT COME BACK IN ────────────────────────
         Deactivating or deleting an account signs every session out, but
         nothing stops the same person signing in again a minute later — the
         password still works, because closing an account is our idea, not the
         sign-in service's. So the first thing a new session does is ask, and a
         closed account is signed straight back out.

         Asked here rather than in the middleware on purpose: this is once a
         day at sign-in, and the middleware runs on every request in the
         application. */
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: closed } = await supabase.rpc("account_closed", { p_user_id: user.id });
          if (closed) {
            await supabase.auth.signOut({ scope: "global" });
            setError(
              closed === "deleted"
                ? "This account has been closed and its documents are being deleted. If that was a mistake, contact FoundersDoc within 30 days."
                : "This account is deactivated. Contact FoundersDoc to open it again.",
            );
            return;
          }
        }
      } catch {
        /* 033 not run yet, or the check could not be made. A sign-in that
           works is better than one that fails for a reason nobody can see. */
      }

      track("sign_in_ok");
      /* A FULL page load, not router.push().
       *
       * signInWithPassword writes the session cookie in the browser. A
       * client-side navigation then asks Next.js for the destination, and the
       * router can serve an RSC payload it already had — one rendered while
       * nobody was signed in. The result is the blank screen that comes right
       * after a successful sign-in and goes away on a manual reload.
       *
       * A document navigation cannot race: the browser sends the new cookie,
       * the server renders for the signed-in user, and the page that arrives is
       * correct the first time. Sign-in happens once a day at most, so the cost
       * of a full load is the right trade for never showing a blank page. */
      window.location.assign(next);
      return; // keep the button disabled while the browser navigates away
    } catch {
      setError("Could not reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Send the reset email.
   *
   * The link lands on /auth/confirm, which exchanges the token for a session and
   * drops the person on /settings to choose a new password. Without that route
   * the email is a link to nowhere — which is why this button did not exist until
   * the route did.
   *
   * The response is deliberately the same whether or not the address has an
   * account: telling a stranger which emails are registered is a gift to them.
   */
  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter the email address on your account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient(supabaseUrl, supabaseKey);
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=%2Fsettings`,
      });
      setSent(true);
    } catch {
      setError("Could not reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "forgot") {
    return (
      <form onSubmit={sendReset} style={{ display: "grid", gap: 16 }}>
        {sent ? (
          <p className="note note-ok">
            If that address has an account, a reset link is on its way. It expires shortly, and
            opening it a second time will not work.
          </p>
        ) : (
          <>
            <label style={{ display: "block" }}>
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="field-help">
                We will send a link that lets you set a new password.
              </span>
            </label>
            {error && <p className="note note-warn">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-gold" style={{ width: "100%" }}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setMode("sign-in");
            setSent(false);
            setError(null);
          }}
          style={{
            fontSize: 13,
            color: "var(--grey-5)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "block" }}>
        <span className="field-label">Email</span>
        <input
          className="input"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label style={{ display: "block" }}>
        <span className="field-label">Password</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {closedNote && !error && <p className="note note-ok">{closedNote}</p>}
      {error && <p className="note note-warn">{error}</p>}

      <button type="submit" disabled={busy} className="btn btn-gold" style={{ width: "100%" }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode("forgot");
          setError(null);
        }}
        style={{
          fontSize: 13,
          color: "var(--grey-5)",
          textDecoration: "underline",
          textUnderlineOffset: 2,
          justifySelf: "center",
        }}
      >
        Forgot your password?
      </button>

    </form>
  );
}
