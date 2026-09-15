"use client";

import { useState } from "react";
import type { PricedMembership, PricedPack } from "@/lib/billing/prices";

/**
 * The buy button, in the pricing design's own card.
 *
 * Every button does the same thing: name an item by lookup key, receive a
 * Stripe URL, go there. No amount, no credit count and no eligibility decision
 * is made in this file — the server owns all three, because anything decided
 * here can be edited by whoever is looking at the page.
 */

type Item = PricedPack | PricedMembership;

function isMembership(item: Item): item is PricedMembership {
  return item.kind === "membership";
}

export default function BuyButton({
  item,
  label,
  isCurrent = false,
}: {
  item: Item;
  label: string;
  /** True when this is the plan the viewer is already paying for. */
  isCurrent?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookupKey: item.lookupKey }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not start checkout. Please try again.");
        setBusy(false);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("Could not reach the payment service. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="card-btn"
        disabled={busy || item.missing || isCurrent}
        onClick={() => void buy()}
      >
        {item.missing
          ? "Not available yet"
          : isCurrent
            ? "Your current plan"
            : busy
              ? "Opening Stripe…"
              : label}
      </button>

      {item.mismatch && (
        <div className="plan-rate" style={{ color: "#b45309", marginTop: 8 }}>
          {item.mismatch}
        </div>
      )}

      {error && (
        <div className="plan-rate" style={{ color: "#b42318", marginTop: 8 }}>
          {error}
        </div>
      )}
    </>
  );
}

export { isMembership };
