"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { track } from "@/lib/track";

const MIN_PASSWORD_LENGTH = 12;

/**
 * Self-serve sign-up.
 *
 * The free week is NOT granted here. It is granted by a database trigger the
 * moment the account row is created, so there is no window in which someone is
 * signed in with an empty wallet, and no way to get a second trial by replaying
 * this request.
 *
 * Nothing is said about whether an address is already registered: Supabase
 * returns a lookalike response for a repeat sign-up, and this form keeps that
 * shape. Telling a stranger "that email already has an account" hands them a
 * way to test a list of addresses against a law firm's customer base.
 */
export default function SignupForm({
  supabaseUrl,
  supabaseKey,
}: {
  supabaseUrl: string;
  supabaseKey: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const ready = email.includes("@") && password.length >= MIN_PASSWORD_LENGTH && accepted;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=%2Fdraft` },
      });
      if (error) {
        setError(
          error.message.toLowerCase().includes("disabled")
            ? "Sign-up is not open yet. Please ask the firm for an account."
            : error.message,
        );
        return;
      }
      track("sign_up_started");
      setSent(true);
    } catch {
      setError("Could not reach the sign-up service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="note note-ok" style={{ marginTop: 18 }}>
        <b>Check your email.</b> We have sent a link to {email}. Open it and your free week
        starts. The link expires, so if it has been a while, sign up again.
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16, marginTop: 22 }}>
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
        <span className="field-label">Password</span>
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
        <span>
          I understand FD AI produces drafts for a lawyer to review, not legal advice, and I
          accept the <a href="/terms-of-service">terms of service</a>.
        </span>
      </label>

      {tooShort && (
        <p className="note note-warn">That is shorter than {MIN_PASSWORD_LENGTH} characters.</p>
      )}
      {error && <p className="note note-warn">{error}</p>}

      <button type="submit" className="btn btn-gold" disabled={!ready || busy}>
        {busy ? "Creating your account…" : "Start free week"}
      </button>
    </form>
  );
}
