"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import Toast from "@/components/Toast";
import RegisterForm from "./RegisterForm";

/**
 * Two steps on one screen.
 *
 *   1. The waitlist. Only the email is required — every extra required field on
 *      a form like this costs sign-ups, and the firm can ask the rest later.
 *      The one thing it cannot do later is contact somebody whose address it
 *      never got.
 *
 *   2. Choosing a password, immediately, in the space the first form was in.
 *      No email in between: see the note at the top of RegisterForm.
 *
 * ── WHY THE SECOND STEP IS SHOWN TO EVERYBODY ───────────────────────────────
 * It would be tidier to skip it for somebody who already has an account. It
 * would also mean this form answering "does this address use FD AI", one
 * address at a time, to anyone on the internet. So the step is always offered
 * and Supabase decides — it replies to a repeat sign-up with a lookalike
 * success, and RegisterForm turns that into "sign in instead" without ever
 * having been told anything.
 *
 * ── AND WHY THE TOAST FIRES AT STEP ONE ─────────────────────────────────────
 * Because being on the list is a thing that has already happened and is worth
 * saying so. If they close the tab at the password field, the firm still has
 * their address and they are still on the waitlist — which is exactly what the
 * corner says.
 */
export default function WaitlistForm({
  instant = false,
  supabaseUrl,
  supabaseKey,
  google = false,
}: {
  /** Does joining lead straight to a password? signup_config decides. */
  instant?: boolean;
  supabaseUrl: string;
  supabaseKey: string;
  google?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [canRegister, setCanRegister] = useState(false);

  const ready = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name, company, note, source: "signup_modal" }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; canRegister?: boolean }
        | null;
      if (!res.ok || !j?.ok) {
        setError(j?.error ?? "We could not add you just now. Please try again.");
        return;
      }
      track("waitlist_joined");
      /* The SERVER says whether registration is open, not the prop: the prop
         was read when the page was rendered, and the switch can have moved
         since — including between somebody opening this page and filling it
         in. The prop only decides the wording before the form is sent. */
      setCanRegister(Boolean(j.canRegister));
      setJoined(email.trim().toLowerCase());
    } catch {
      setError("Could not reach us just now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (joined) {
    return (
      <>
        {canRegister ? (
          <RegisterForm
            email={joined}
            supabaseUrl={supabaseUrl}
            supabaseKey={supabaseKey}
            google={google}
          />
        ) : (
          <div className="note note-ok" style={{ marginTop: 20 }}>
            <b>You&rsquo;re on the list.</b>
            <p style={{ margin: "6px 0 0" }}>
              We will write to <b>{joined}</b> as soon as FD AI is ready for you.
            </p>
          </div>
        )}

        <Toast
          title={canRegister ? "You're on the list" : "Welcome to FD AI"}
          body={
            canRegister ? (
              <>
                <b>{joined}</b> is registered. Choose a password to open your account and start
                drafting — or{" "}
                <a href="/contact">contact us for more information</a>.
              </>
            ) : (
              <>
                You have been added to the waitlist. Our earliest update will reach you at{" "}
                <b>{joined}</b>. Do not hesitate to{" "}
                <a href="/contact">contact us for more information</a>.
              </>
            )
          }
        />
      </>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 15, marginTop: 22 }}>
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
        <span className="field-label">
          Your name <span style={{ color: "var(--grey-4)", fontWeight: 400 }}>(optional)</span>
        </span>
        <input
          className="input"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label style={{ display: "block" }}>
        <span className="field-label">
          Company <span style={{ color: "var(--grey-4)", fontWeight: 400 }}>(optional)</span>
        </span>
        <input
          className="input"
          type="text"
          autoComplete="organization"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </label>

      <label style={{ display: "block" }}>
        <span className="field-label">
          What do you need to draft?{" "}
          <span style={{ color: "var(--grey-4)", fontWeight: 400 }}>(optional)</span>
        </span>
        <textarea
          className="input"
          rows={2}
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          style={{ resize: "vertical", minHeight: 60 }}
        />
        <span className="field-help">
          It helps us decide which documents to build next — please leave out anything
          confidential.
        </span>
      </label>

      {error && <p className="note note-warn">{error}</p>}

      <button type="submit" className="btn btn-gold" disabled={!ready || busy}>
        {busy
          ? instant
            ? "Registering you…"
            : "Adding you…"
          : instant
            ? "Continue"
            : "Join the waitlist"}
      </button>
    </form>
  );
}
