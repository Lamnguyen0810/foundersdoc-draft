"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import Toast from "@/components/Toast";

/**
 * The waitlist form.
 *
 * Only the email is required. Every extra required field on a form like this
 * costs sign-ups, and the firm can ask the rest when it invites them — the one
 * thing it cannot do later is contact someone whose address it never got.
 */
export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

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
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) {
        setError(j?.error ?? "We could not add you just now. Please try again.");
        return;
      }
      track("waitlist_joined");
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
          <b>You&rsquo;re on the list.</b>
          <p style={{ margin: "6px 0 0" }}>
            We will write to <b>{joined}</b> as soon as FD AI is ready for you.
          </p>
        </div>
        <Toast
          title="Welcome to FD AI"
          body={
            <>
              You have been added to the waitlist. Our earliest update will reach you at{" "}
              <b>{joined}</b>. Do not hesitate to{" "}
              <a href="/contact">contact us for more information</a>.
            </>
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
        {busy ? "Adding you…" : "Join the waitlist"}
      </button>
    </form>
  );
}
