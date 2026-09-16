"use client";

import { useState } from "react";

/**
 * Giving credits back, and taking them away.
 *
 * ── WHAT THIS FILE IS NOT ALLOWED TO DECIDE ─────────────────────────────────
 * Anything. It holds no balance of its own, does no arithmetic on one, and
 * trusts no number it has not just been handed by the server. After every
 * change it displays what the database says the balance now is, never what this
 * code worked out it ought to be — because a balance calculated in a browser is
 * a balance somebody can edit.
 *
 * The route it calls checks `isAdmin()`, and each database function it reaches
 * checks `is_admin()` again for itself. Credits are money; the guarantee lives
 * at the bottom of the stack.
 */

interface Found {
  user_id: string;
  email: string;
  full_name: string | null;
  balance: number;
}

export interface Action {
  id: number;
  created_at: string;
  actor_email: string | null;
  subject_email: string | null;
  action: "grant" | "revoke";
  credits: number;
  balance_after: number;
  reason: string | null;
}

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB");
}

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/admin/credits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) || `Request failed (${res.status})`);
  return json as T;
}

/** What the accounts list already knows about a person, for the meta boxes. */
export interface AccountLite {
  user_id: string;
  tier: string | null;
  drafts_total: number;
  last_draft_at: string | null;
}

export default function CreditsPanel({
  accounts,
}: {
  accounts: AccountLite[];
}) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("5");
  const [action, setAction] = useState<"grant" | "revoke">("grant");
  const [reason, setReason] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "" | "ok" | "err" }>({ text: "", kind: "" });

  const account = found ? accounts.find((a) => a.user_id === found.user_id) : undefined;

  async function lookup() {
    const value = email.trim();
    if (!value) {
      setMsg({ text: "Enter an email address.", kind: "err" });
      return;
    }
    setBusy(true);
    setMsg({ text: "Looking up…", kind: "" });
    try {
      const j = await post<{ user: Found }>({ action: "lookup", email: value });
      setFound(j.user);
      setMsg({ text: "", kind: "" });
    } catch (e) {
      setFound(null);
      setMsg({ text: e instanceof Error ? e.message : "Lookup failed.", kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  const credits = Number.parseInt(amount, 10);
  const amountOk = credits >= 1 && credits <= 1000;

  async function apply() {
    if (!found || !amountOk) return;
    setBusy(true);
    setConfirming(false);
    try {
      const j = await post<{ balance: number }>({
        action,
        userId: found.user_id,
        credits,
        reason: reason.trim() || undefined,
      });
      setFound({ ...found, balance: j.balance });
      setMsg({
        text:
          action === "grant"
            ? `Added. ${found.email} now has ${j.balance}.`
            : `Removed. ${found.email} now has ${j.balance}.`,
        kind: "ok",
      });
      setReason("");
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "The change could not be saved.", kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  const planText = account?.tier
    ? account.tier.charAt(0).toUpperCase() + account.tier.slice(1)
    : "No membership";

  return (
    <div className="credit-box">
      <h2>Adjust credits</h2>
      <div className="toolbar">
        <input
          className="input"
          placeholder="User email"
          style={{ flex: 1, minWidth: 220 }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void lookup()}
        />
        <button className="btn dark" type="button" disabled={busy} onClick={() => void lookup()}>
          Look up
        </button>
      </div>

      {msg.text && (
        <p
          className="empty"
          role="status"
          aria-live="polite"
          style={{ textAlign: "left", padding: "10px 0 0", color: msg.kind === "err" ? "var(--danger)" : msg.kind === "ok" ? "var(--success)" : undefined }}
        >
          {msg.text}
        </p>
      )}

      {found && (
        <div className="user-result show">
          <b>{found.email}</b>
          <div className="user-meta">
            <div className="meta-box"><span>Plan</span><b>{planText}</b></div>
            <div className="meta-box"><span>Credits</span><b>{found.balance}</b></div>
            <div className="meta-box"><span>Drafts</span><b>{account ? account.drafts_total : "—"}</b></div>
            <div className="meta-box"><span>Last active</span><b>{account?.last_draft_at ? ago(account.last_draft_at) : "—"}</b></div>
          </div>
          <div className="adjust-grid">
            <div>
              <label className="field-label">Action</label>
              <select style={{ width: "100%" }} value={action} onChange={(e) => setAction(e.target.value as "grant" | "revoke")}>
                <option value="grant">Add credits</option>
                <option value="revoke">Remove credits</option>
              </select>
            </div>
            <div>
              <label className="field-label">Amount</label>
              <input
                className="input"
                type="number"
                min={1}
                max={1000}
                style={{ width: "100%" }}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Reason</label>
            <textarea placeholder="Reason for adjustment" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button
            className="btn yellow"
            type="button"
            style={{ marginTop: 10 }}
            disabled={busy || !amountOk}
            onClick={() => setConfirming(true)}
          >
            Review adjustment
          </button>
        </div>
      )}

      {confirming && found && (
        <div className="overlay show" onClick={(e) => e.target === e.currentTarget && setConfirming(false)}>
          <div className="modal small">
            <div className="modal-head">
              <div>
                <h3>Confirm credit change</h3>
                <p>Check before applying.</p>
              </div>
              <button className="close" type="button" onClick={() => setConfirming(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                {action === "grant" ? "Add" : "Remove"} <b>{credits}</b> credit{credits === 1 ? "" : "s"}{" "}
                {action === "grant" ? "to" : "from"} <b>{found.email}</b>
                {reason.trim() ? ` — “${reason.trim()}”` : ""}. Their balance goes from {found.balance} to{" "}
                {action === "grant" ? found.balance + credits : Math.max(0, found.balance - credits)}.
                {action === "revoke" ? " This cannot be undone from here." : ""}
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn" type="button" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn yellow" type="button" onClick={() => void apply()}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
