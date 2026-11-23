"use client";

import { useState } from "react";

/** /esop/access (0266): email → 6-digit code → the dashboard. */
export default function AccessForm({ initial }: { initial: string }) {
  const [email, setEmail] = useState(initial);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  async function post(url: string, body: object) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string; next?: string };
    return { ok: res.ok, ...j };
  }

  async function askCode(e?: React.FormEvent) {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await post("/api/esop/access", { email });
      if (!r.ok) return setErr(r.error || "Something went wrong. Please try again.");
      setNote(r.message || "Check your inbox.");
      setStep("code");
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await post("/api/esop/access/verify", { email, code });
      if (!r.ok) return setErr(r.error || "That code did not work.");
      window.location.assign(r.next || "/esop/access");
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "code")
    return (
      <form onSubmit={check}>
        <p className="apv-next" role="status">
          ✉️ {note}
        </p>
        <label className="apv-label" htmlFor="esop-access-code">
          6-digit code sent to {email}
        </label>
        <input
          id="esop-access-code"
          className="apv-text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={10}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          style={{ fontSize: 22, letterSpacing: 6 }}
        />
        {err && <p className="apv-err" style={{ marginTop: 10 }}>{err}</p>}
        <button type="submit" className="apv-btn" disabled={busy || code.length < 6}>
          {busy ? "Checking…" : "Open the dashboard"}
        </button>
        <p className="apv-small">
          No email?{" "}
          <button type="button" onClick={() => void askCode()} disabled={busy} style={{ border: 0, background: "none", padding: 0, textDecoration: "underline", cursor: "pointer", font: "inherit", color: "#161616" }}>
            Send a new code
          </button>{" "}
          or{" "}
          <button type="button" onClick={() => { setStep("email"); setCode(""); setErr(""); }} style={{ border: 0, background: "none", padding: 0, textDecoration: "underline", cursor: "pointer", font: "inherit", color: "#161616" }}>
            use another email
          </button>
          .
        </p>
      </form>
    );
  return (
    <form onSubmit={askCode}>
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
        {busy ? "Sending…" : "Email me a code"}
      </button>
    </form>
  );
}
