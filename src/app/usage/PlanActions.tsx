"use client";

import { useState } from "react";

/**
 * The two buttons on /usage that lead into Stripe.
 *
 * Neither of them decides anything. Both post the plan's lookup key to the
 * checkout route, which works out — on the server, where it cannot be edited —
 * whether that means "open the customer portal" or something else, and hands
 * back a URL. Cancellation itself happens in Stripe's portal, because that is
 * where the subscription lives and where a cancellation is a real thing rather
 * than a flag this app would then have to keep in step.
 */
async function openStripe(lookupKey: string): Promise<string> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lookupKey }),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "Could not reach Stripe. Please try again.");
  return json.url;
}

export function ManageBilling({ lookupKey, label = "Manage billing" }: { lookupKey: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="u-btn billing-btn"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          openStripe(lookupKey)
            .then((url) => window.location.assign(url))
            .catch((err: Error) => {
              setError(err.message);
              setBusy(false);
            });
        }}
      >
        {busy ? "Opening Stripe…" : label}
      </button>
      {error && <div className="cancelled-note">{error}</div>}
    </>
  );
}

export function CancelPlan({
  lookupKey,
  planLabel,
  endsOn,
}: {
  lookupKey: string;
  planLabel: string;
  /** The date access runs to, already formatted, when it is known. */
  endsOn: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="fdu-modal">
            <h3 id="fdu-cancel-title">Cancel your {planLabel}?</h3>
            <p>Your plan stays active until the end of the period you have already paid for.</p>
            <div className="modal-note">
              {endsOn ? (
                <>
                  <strong>Access remains until {endsOn}.</strong>
                  <br />
                  You can keep using your credits until then.
                </>
              ) : (
                <>You can keep using your credits until the current period ends.</>
              )}
              <br />
              <br />
              Cancelling finishes in Stripe, where your subscription is held.
            </div>
            {error && <p style={{ color: "#8b5a56" }}>{error}</p>}
            <div className="modal-actions">
              <button type="button" className="u-btn" onClick={() => setOpen(false)} disabled={busy}>
                Keep plan
              </button>
              <button
                type="button"
                className="u-btn danger"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  openStripe(lookupKey)
                    .then((url) => window.location.assign(url))
                    .catch((err: Error) => {
                      setError(err.message);
                      setBusy(false);
                    });
                }}
              >
                {busy ? "Opening Stripe…" : "Continue in Stripe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
