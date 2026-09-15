"use client";

import { useCallback, useState } from "react";

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

export default function CreditsPanel({ initialLog }: { initialLog: Action[] }) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "" | "ok" | "err" }>({ text: "", kind: "" });

  /* The history arrives already rendered from the server, which has an admin
     session of its own. Fetching it again on mount would show an empty table
     for one frame and cost a round trip to learn what the page already knew. */
  const [log, setLog] = useState<Action[]>(initialLog);

  const loadLog = useCallback(async () => {
    try {
      const j = await post<{ actions: Action[] }>({ action: "recent" });
      setLog(j.actions ?? []);
    } catch {
      /* Leave the last known history on screen. It is still true; it is just
         not newer. Blanking it would lose information to report a hiccup. */
    }
  }, []);

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

  async function change(action: "grant" | "revoke") {
    if (!found) {
      setMsg({ text: "Look up a user first.", kind: "err" });
      return;
    }
    const credits = Number.parseInt(amount, 10);
    if (!(credits >= 1 && credits <= 1000)) {
      setMsg({ text: "Enter a whole number between 1 and 1000.", kind: "err" });
      return;
    }

    /* Taking credits back cannot be undone by pressing the other button — the
       credits come off grants that may already be part-spent. So it asks, by
       name, before it happens. */
    if (action === "revoke") {
      const ok = window.confirm(
        `Take ${credits} credit${credits === 1 ? "" : "s"} back from ${found.email}?\n\n` +
          "This cannot be undone from here.",
      );
      if (!ok) return;
    }

    setBusy(true);
    setMsg({ text: action === "grant" ? "Adding…" : "Removing…", kind: "" });
    try {
      const j = await post<{ balance: number }>({
        action,
        userId: found.user_id,
        credits,
        reason: reason.trim() || undefined,
      });
      setFound({ ...found, balance: j.balance });
      setReason("");
      setMsg({
        text:
          action === "grant"
            ? `Added. ${found.email} now has ${j.balance}.`
            : `Removed. ${found.email} now has ${j.balance}.`,
        kind: "ok",
      });
      void loadLog();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "The change failed.", kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Give or take back credits</h2>
          <p className="sub">
            Look someone up by email, then add credits to their account or take them back. Credits
            given here never expire, and every change is recorded below with who made it.
          </p>
        </div>
      </div>

      <div className="credit-find">
        <label className="credit-label" htmlFor="creditEmail">
          Email address
        </label>
        <div className="credit-row">
          <input
            id="creditEmail"
            className="credit-input"
            type="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="name@firm.com"
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void lookup();
              }
            }}
          />
          <button className="secondary" type="button" disabled={busy} onClick={() => void lookup()}>
            Look up
          </button>
        </div>
        <p className={`credit-msg ${msg.kind}`} role="status" aria-live="polite">
          {msg.text}
        </p>
      </div>

      {found && (
        <div className="credit-found">
          <div className="credit-who">
            <span className="credit-name">{found.full_name || "(no name on file)"}</span>
            <span className="credit-sub">{found.email}</span>
          </div>

          <div className="credit-balance">
            <span className="credit-num">{found.balance}</span>
            <span className="credit-sub">credits left</span>
          </div>

          <div className="credit-act">
            <label className="credit-label" htmlFor="creditAmount">
              How many
            </label>
            <input
              id="creditAmount"
              className="credit-input credit-num-input"
              type="number"
              min={1}
              max={1000}
              step={1}
              value={amount}
              disabled={busy}
              onChange={(e) => setAmount(e.target.value)}
            />

            <label className="credit-label" htmlFor="creditReason">
              Why (optional)
            </label>
            <input
              id="creditReason"
              className="credit-input"
              type="text"
              maxLength={200}
              placeholder="e.g. goodwill after a failed draft"
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />

            <div className="credit-row">
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => void change("grant")}
              >
                Add credits
              </button>
              <button
                className="secondary credit-danger"
                type="button"
                disabled={busy}
                onClick={() => void change("revoke")}
              >
                Take back
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="credit-log">
        {log.length === 0 ? (
          <p className="fda-empty">No credits have been given out or taken back yet.</p>
        ) : (
          <div className="table-card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who did it</th>
                  <th>Account</th>
                  <th>Change</th>
                  <th className="num">Balance after</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id}>
                    <td className="muted">
                      <time dateTime={r.created_at} title={new Date(r.created_at).toLocaleString("en-GB")}>
                        {ago(r.created_at)}
                      </time>
                    </td>
                    <td className="muted wrap-cell">{r.actor_email || "—"}</td>
                    <td className="name wrap-cell">{r.subject_email || "—"}</td>
                    <td>
                      <span className={`status-pill ${r.action === "grant" ? "ready" : "review"}`}>
                        {r.action === "grant" ? "+" : "−"}
                        {r.credits}
                      </span>
                    </td>
                    <td className="num">{r.balance_after}</td>
                    <td className="muted wrap-cell">{r.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
