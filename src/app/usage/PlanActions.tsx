"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Cancelling, and updating a card.
 *
 * Cancellation does NOT go through Stripe's customer portal any more. It used
 * to, and when the portal was not switched on in the Stripe dashboard the
 * request fell through to a Checkout page — a customer pressing "cancel" was
 * shown a card form offering the same plan again. Now it posts to our own
 * route, which can only end things, never charge.
 */

const REASONS: { value: string; label: string }[] = [
  { value: "too_expensive", label: "Too expensive for how much I use it" },
  { value: "not_using", label: "I am not drafting enough to need a plan" },
  { value: "missing_feature", label: "Something I need is missing" },
  { value: "quality", label: "The drafts were not good enough" },
  { value: "switching", label: "I am using something else" },
  { value: "temporary", label: "Only pausing — I will be back" },
  { value: "other", label: "Another reason" },
];

export function CancelPlan({
  planLabel,
  purchasedCredits,
}: {
  planLabel: string;
  /** Credits bought outright, which survive the cancellation. */
  purchasedCredits: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason || "other", note }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not cancel. Please try again.");
        setBusy(false);
        return;
      }
      /* Re-render from the server rather than patching state here: the
         balance, the plan panel and the billing summary all move at once, and
         all three should be read back rather than guessed at. */
      router.replace("/usage?cancelled=1");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="cancel-link" onClick={() => setOpen(true)}>
        Cancel plan
      </button>

      {open && (
        <div
          className="fdu-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fdu-cancel-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="fdu-modal">
            <h3 id="fdu-cancel-title">Cancel your {planLabel}?</h3>
            <p>
              Your plan ends straight away. The unused part of this month is refunded to your card.
            </p>

            <div className="modal-note">
              <strong>You keep everything you have already drafted.</strong>
              <br />
              {purchasedCredits > 0 ? (
                <>
                  The {purchasedCredits} credit{purchasedCredits === 1 ? "" : "s"} you bought
                  separately stay on your account and never expire — you can carry on drafting with
                  those. This month&rsquo;s membership allowance ends today.
                </>
              ) : (
                <>
                  This month&rsquo;s membership allowance ends today. Anything you buy afterwards
                  never expires, and you can re-join any plan whenever you like.
                </>
              )}
            </div>

            <div className="cancel-reason">
              <label htmlFor="fdu-reason">Why are you leaving?</label>
              <select
                id="fdu-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              >
                <option value="">Prefer not to say</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <textarea
                id="fdu-note"
                placeholder="Anything else you would like to tell us (optional)"
                value={note}
                maxLength={1000}
                rows={3}
                disabled={busy}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {error && <p className="cancel-error">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="u-btn" onClick={() => setOpen(false)} disabled={busy}>
                Keep plan
              </button>
              <button type="button" className="u-btn danger" disabled={busy} onClick={() => void cancel()}>
                {busy ? "Cancelling…" : "Cancel my plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * "Update payment method".
 *
 * Always on the page, as the design draws it — but what it does depends on
 * whether there is a card to update. With one, it opens Stripe's card form,
 * and nothing it opens can cancel or buy. Without one there is nothing for
 * Stripe to show, so rather than sending somebody to an empty portal and
 * bringing them back confused, it says where a card actually comes from.
 *
 * It used to try Stripe either way, which is why a trial account pressing it
 * got "Could not open Stripe just now" — an error message for something that
 * was never an error.
 */
export function UpdateCard({
  hasCard,
  className = "u-btn billing-btn",
  label = "Update payment method",
}: {
  /** Whether Stripe holds a card for this account. */
  hasCard: boolean;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => {
          if (!hasCard) {
            setMessage(
              "Start your first plan or buy credits, and your card is saved securely by Stripe at checkout. You can change it here afterwards.",
            );
            return;
          }
          setBusy(true);
          setMessage(null);
          fetch("/api/billing/payment-method", { method: "POST" })
            .then((r) => r.json())
            .then((json: { url?: string; error?: string }) => {
              if (json.url) window.location.assign(json.url);
              else {
                setMessage(json.error ?? "Could not open Stripe.");
                setBusy(false);
              }
            })
            .catch(() => {
              setMessage("Could not reach Stripe.");
              setBusy(false);
            });
        }}
      >
        {busy ? "Opening Stripe…" : label}
      </button>
      {message && <div className="cancelled-note">{message}</div>}
    </>
  );
}
