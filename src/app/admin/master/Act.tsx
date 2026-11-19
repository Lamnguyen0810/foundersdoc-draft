"use client";

import { useState } from "react";
import type { ActionDo } from "@/lib/master/figures";

/**
 * The master dashboard's three actions (0250), beside a line under "Needs action":
 *   - Remind: email the signer of Founders Doc's own request(s) again;
 *   - Send approval email: for a coming vesting of a company Founders Doc runs;
 *   - Mark as paid: an approved vesting (with Undo, in case of a slip).
 *
 * Each asks once before it does anything ("Send" / "Cancel" in the row, no pop-up), because the
 * first two email a real person. What can be done is decided in lib/master/figures.ts and
 * checked again by each route; this only shows the button and the answer. The answer never
 * names a signer or an approver: the page's rule is kept here too.
 *
 * In the local preview nothing is called: the button answers with what would have happened.
 */

type Phase = { at: "idle" } | { at: "ask" } | { at: "busy" } | { at: "done"; text: string; undo?: boolean } | { at: "failed"; text: string };

const LABEL = (a: ActionDo) => (a.type === "remind" ? "Remind" : a.type === "paid" ? "Mark as paid" : a.again ? "Send approval email again" : "Send approval email");
const YES = (a: ActionDo) => (a.type === "paid" ? "Yes, paid" : "Send");

function question(a: ActionDo): string {
  if (a.type === "remind") return a.envelopes.length > 1 ? `Email the signer again about these ${a.envelopes.length} documents? One email, a fresh link.` : "Email the signer again? They get a fresh link.";
  if (a.type === "paid") return `Mark ${a.ref} as paid? Its certificates can then go out for signing, and the batch's holders are locked until every one is signed.`;
  return a.simulation ? `Email the approval for ${a.ref}? Simulation is on, so it goes to the simulation inbox, not the client.` : `Email the company's approver to approve ${a.ref}?`;
}

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  } catch {
    return { error: "Could not reach the server. Nothing was changed." };
  }
}

export default function Act({ act, preview }: { act: ActionDo; preview: boolean }) {
  const [phase, setPhase] = useState<Phase>({ at: "idle" });

  async function run(undo = false) {
    if (preview) return setPhase({ at: "done", text: undo ? "Preview: nothing was changed." : act.type === "paid" ? "Preview: it would be marked as paid." : "Preview: the email would be sent." });
    setPhase({ at: "busy" });
    if (act.type === "remind") {
      const out = await post("/api/sign/remind", { envelopeIds: act.envelopes });
      if (!out.ok) return setPhase({ at: "failed", text: String(out.error ?? "Could not send the reminder.") });
      return setPhase({ at: "done", text: Number(out.emailed) > 0 ? "Reminder sent." : "Emails are switched off here: a fresh link was made, no email left." });
    }
    if (act.type === "approval-email") {
      const out = await post("/api/esop/approval-email", { company: act.company, ref: act.ref });
      if (!out.ok) return setPhase({ at: "failed", text: String(out.error ?? "Could not send the email.") });
      return setPhase({ at: "done", text: out.sent ? (act.simulation ? "Approval email sent to the simulation inbox." : "Approval email sent.") : "Emails are switched off here: no email left. Open the dashboard to copy an approval link." });
    }
    const out = await post("/api/esop/paid", { company: act.company, ref: act.ref, paid: !undo });
    if (!out.ok) return setPhase({ at: "failed", text: String(out.error ?? "Could not save.") });
    setPhase(undo ? { at: "done", text: "No longer marked as paid." } : { at: "done", text: "Marked as paid.", undo: true });
  }

  if (phase.at === "ask")
    return (
      <span className="ms-ask" role="group" aria-label={question(act)}>
        <span className="ms-ask-text">{question(act)}</span>
        <button type="button" className="btn dark" onClick={() => void run()}>
          {YES(act)}
        </button>
        <button type="button" className="btn" onClick={() => setPhase({ at: "idle" })}>
          Cancel
        </button>
      </span>
    );
  if (phase.at === "done")
    return (
      <span className="ms-said ok" role="status">
        {phase.text}
        {phase.undo && (
          <button type="button" className="ms-undo" onClick={() => void run(true)}>
            Undo
          </button>
        )}
      </span>
    );
  return (
    <>
      {phase.at === "failed" && (
        <span className="ms-said bad" role="alert">
          {phase.text}
        </span>
      )}
      <button type="button" className="btn" disabled={phase.at === "busy"} onClick={() => setPhase({ at: "ask" })}>
        {phase.at === "busy" ? "Working…" : LABEL(act)}
      </button>
    </>
  );
}
