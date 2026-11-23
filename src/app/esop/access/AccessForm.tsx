"use client";

import { useState } from "react";

export default function AccessForm({ initial }: { initial: string }) {
  const [email, setEmail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [err, setErr] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/esop/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) setErr(j.error || "Something went wrong. Please try again.");
      else setDone(j.message || "Check your inbox.");
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <p className="apv-next" role="status">
        ✉️ {done}
      </p>
    );
  return (
    <form onSubmit={send}>
      <label className="apv-label" htmlFor="esop-access-email">
        Your email
      </label>
      <input
        id="esop-access-email"
        className="apv-text"
        type="email"
        required
        autoComplete="email"
        placeholder="name@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {err && <p className="apv-err" style={{ marginTop: 10 }}>{err}</p>}
      <button type="submit" className="apv-btn" disabled={busy}>
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
