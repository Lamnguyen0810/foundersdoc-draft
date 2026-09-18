"use client";

import { useState } from "react";

/**
 * "Give this person an account."
 *
 * One button per waitlist row. It creates the account, which grants the three
 * credits by trigger, and sends the invitation — the same thing a self-serve
 * sign-up does, chosen deliberately instead of automatically.
 *
 * ── WHY IT DOES NOT REFRESH THE PAGE ────────────────────────────────────────
 * The admin tables are server-rendered and a router.refresh() would redraw the
 * whole tab — several RPCs, a second or two — to change one word in one cell.
 * The row is told what happened here instead, and the next navigation shows
 * the state from the database. Nothing is cached that could disagree: the
 * button disables itself once it has worked.
 */
export default function InviteButton({ email, invited }: { email: string; invited: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    invited ? "done" : "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  if (state === "done") {
    return (
      <span className="badge green" title={message ?? "This address has an FD AI account."}>
        Account
      </span>
    );
  }

  async function invite() {
    setState("busy");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/waitlist/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; error?: string }
        | null;

      if (res.ok && j?.ok) {
        setMessage(j.message ?? null);
        setState("done");
        return;
      }
      setMessage(j?.error ?? "Could not create the account.");
      setState("error");
    } catch {
      setMessage("Could not reach the server.");
      setState("error");
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={invite}
        disabled={state === "busy"}
        title={`Create an FD AI account for ${email} and email them an invitation.`}
      >
        {state === "busy" ? "Inviting…" : state === "error" ? "Try again" : "Invite"}
      </button>
      {message && state === "error" && (
        <div className="bad" style={{ fontSize: 11, marginTop: 4, maxWidth: 260 }}>
          {message}
        </div>
      )}
    </>
  );
}
