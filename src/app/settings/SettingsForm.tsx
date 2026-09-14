"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Change your own password.
 *
 * This needs no email, no SMTP and no admin: the person is already signed in, so
 * Supabase lets them update their own account directly. That is what makes it
 * worth building first — the "forgot password" flow needs a working mail sender,
 * this one needs nothing.
 *
 * The current password is asked for and verified before the change. Supabase does
 * not require it, but a signed-in session left open on a shared laptop should not
 * be enough to lock the real owner out of their account.
 */
export default function SettingsForm({
  supabaseUrl,
  supabaseKey,
  email,
  minLength,
}: {
  supabaseUrl: string;
  supabaseKey: string;
  email: string;
  minLength: number;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < minLength;
  const mismatch = confirm.length > 0 && next !== confirm;
  const same = next.length > 0 && next === current;
  const ready = current.length > 0 && next.length >= minLength && next === confirm && !same;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    setDone(false);

    try {
      const supabase = createBrowserClient(supabaseUrl, supabaseKey);

      // Prove they know the current password before changing it.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInError) {
        setError("That current password is not right.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        // Supabase enforces the project's own password rules server-side, so its
        // message is more useful here than anything invented.
        setError(updateError.message);
        return;
      }

      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setError("Could not reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "block" }}>
        <span className="field-label">Current password</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>

      <label style={{ display: "block" }}>
        <span className="field-label">New password</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <span className="field-help">
          At least {minLength} characters. Longer beats complicated — a passphrase of three
          unrelated words is stronger than a short password with symbols in it.
        </span>
      </label>

      <label style={{ display: "block" }}>
        <span className="field-label">New password again</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>

      {tooShort && <p className="note note-warn">That is shorter than {minLength} characters.</p>}
      {mismatch && <p className="note note-warn">The two new passwords do not match.</p>}
      {same && <p className="note note-warn">The new password is the same as the current one.</p>}
      {error && <p className="note note-warn">{error}</p>}
      {done && (
        <p className="note note-ok">
          Password changed. It applies the next time you sign in — you are not signed out here.
        </p>
      )}

      <button type="submit" disabled={!ready || busy} className="btn btn-gold">
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
