"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** The first open in a browser: email me a code, type it in (124). */
export function CodeGate({ token, to, company }: { token: string; to: string; company: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [dev, setDev] = useState("");

  async function send() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/my-options/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const out = (await r.json().catch(() => ({}))) as { ok?: boolean; to?: string; devCode?: string; error?: string };
      if (!out.ok) return setMsg(out.error ?? "Could not send the code.");
      setSent(true);
      if (out.devCode) setDev(out.devCode);
      setMsg(`We sent a 6-digit code to ${out.to ?? to}.`);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/my-options/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, code }) });
      const out = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!out.ok) return setMsg(out.error ?? "That code isn't right.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mo-card mo-gate">
      <h1>Your {company} share options</h1>
      <p>To keep your record private, confirm it&rsquo;s you. We&rsquo;ll email a 6-digit code to <b>{to}</b>. You only need to do this once on this device.</p>
      {!sent ? (
        <button className="mo-btn gold" disabled={busy} onClick={() => void send()}>
          {busy ? "Sending…" : "Email me a code"}
        </button>
      ) : (
        <form onSubmit={(e) => void verify(e)} className="mo-codeform">
          <label>
            6-digit code
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </label>
          <button className="mo-btn gold" type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Show my options"}
          </button>
          <button className="mo-link" type="button" disabled={busy} onClick={() => void send()}>
            Send a new code
          </button>
        </form>
      )}
      {msg && (
        <p className="mo-msg" role="status">
          {msg}
          {dev && <span className="mo-dev"> (preview code: {dev})</span>}
        </p>
      )}
    </div>
  );
}

/** "Send me my link": always the same answer, so nobody learns who holds options. */
export function RequestLink({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dev, setDev] = useState<string[]>([]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/my-options/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const out = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; devLinks?: string[] };
      if (!out.ok) return setErr(out.error ?? "Please try again.");
      setDone(true);
      setDev(out.devLinks ?? []);
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className={compact ? "mo-req done" : "mo-card mo-req done"}>
        <b>Check your inbox.</b> If {email} is on a share option plan with holder access, a new private link is on its way. It can take a minute; check spam too.
        {dev.map((l) => (
          <a key={l} className="mo-dev" href={l}>
            Preview link
          </a>
        ))}
      </div>
    );
  return (
    <form className={compact ? "mo-req" : "mo-card mo-req"} onSubmit={(e) => void submit(e)}>
      {!compact && <h1>Your share options</h1>}
      <p>{compact ? "Need a new link? Type the email your company has for you." : "Type the email your company has for you, and we'll send you a private link to see your share options."}</p>
      <div className="mo-row">
        <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Your work email" />
        <button className="mo-btn gold" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send me my link"}
        </button>
      </div>
      {err && <p className="mo-msg">{err}</p>}
    </form>
  );
}
