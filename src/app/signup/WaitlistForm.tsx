"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import Toast from "@/components/Toast";

/**
 * The waitlist form, which is now also the sign-up form.
 *
 * Only the email is required. Every extra required field on a form like this
 * costs sign-ups, and the firm can ask the rest when it invites them — the one
 * thing it cannot do later is contact someone whose address it never got.
 *
 * ── WHAT `instant` CHANGES, AND WHAT IT DOES NOT ────────────────────────────
 * It changes only the words. The server decides whether an account is made, by
 * reading signup_config, and this cannot talk it into one — which is the right
 * way round: a switch honoured in the browser is not a switch.
 *
 * ── WHY THE REPLY NEVER SAYS WHETHER AN ACCOUNT WAS CREATED ─────────────────
 * Because that is the same as saying whether this address already uses FD AI,
 * and this form is open to the whole internet. So the confirmation is the same
 * confirmation whether the person is new, already on the list, or already a
 * member — "check your email" — and the inbox tells them apart.
 */
export default function WaitlistForm({ instant = false }: { instant?: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [slow, setSlow] = useState<string | null>(null);

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
        | { ok?: boolean; error?: string; note?: string }
        | null;
      if (!res.ok || !j?.ok) {
        setError(j?.error ?? "We could not add you just now. Please try again.");
        return;
      }
      track("waitlist_joined");
      setSlow(j.note ?? null);
      setJoined(email);
    } catch {
      setError("Could not reach us just now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (joined) {
    return (
      <>
        <div className="note note-ok" style={{ marginTop: 20 }}>
          <b>{instant ? "Check your email." : "You’re on the list."}</b>
          <p style={{ margin: "6px 0 0" }}>
            {instant ? (
              <>
                We have sent a link to <b>{joined}</b>. Open it and your account is ready, with
                three documents to use over the next fortnight. Once you are in, choose a
                password under Settings so you can sign in again.
              </>
            ) : (
              <>
                We will write to <b>{joined}</b> as soon as FD AI is ready for you.
              </>
            )}
          </p>
          {slow && <p style={{ margin: "6px 0 0" }}>{slow}</p>}
        </div>
        <Toast
          title="Welcome to FD AI"
          body={
            instant ? (
              <>
                Your link is on its way to <b>{joined}</b>. If it has not arrived in a few
                minutes, check the spam folder, or{" "}
                <a href="/contact">let us know</a>.
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
            ? "Creating your account…"
            : "Adding you…"
          : instant
            ? "Create my account"
            : "Join the waitlist"}
      </button>
    </form>
  );
}
