"use client";

import { useState } from "react";
import type { PricedMembership, PricedPack } from "@/lib/billing/prices";

/**
 * The buy buttons.
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

export default function BuyButtons({
  items,
  highlightTier,
  currentTier,
}: {
  items: Item[];
  /** Tier to mark as the recommended one, purely presentational. */
  highlightTier?: string;
  /** The tier this person is already on, if any. */
  currentTier?: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(lookupKey: string) {
    setBusy(lookupKey);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookupKey }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not start checkout. Please try again.");
        setBusy(null);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("Could not reach the payment service. Check your connection and try again.");
      setBusy(null);
    }
  }

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 12,
        }}
      >
        {items.map((item) => {
          const recommended = isMembership(item) && item.tier === highlightTier;
          const isCurrent = isMembership(item) && item.tier === currentTier;

          return (
            <div
              key={item.lookupKey}
              style={{
                border: "1px solid var(--grey-2)",
                borderLeft: recommended ? "2px solid var(--gold)" : "1px solid var(--grey-2)",
                borderRadius: 14,
                padding: 18,
                background: "var(--white)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                opacity: item.missing ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 15 }}>{item.label}</strong>
                {recommended && (
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--gold)",
                      fontWeight: 600,
                    }}
                  >
                    Most popular
                  </span>
                )}
                {isCurrent && (
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--grey-5)",
                      fontWeight: 600,
                    }}
                  >
                    Your plan
                  </span>
                )}
              </div>

              <p style={{ fontSize: 26, margin: "2px 0 0", letterSpacing: "-0.02em" }}>
                {item.price}
                {isMembership(item) && (
                  <span style={{ fontSize: 13, color: "var(--grey-5)" }}> / month</span>
                )}
              </p>

              <p className="sub" style={{ fontSize: 13, margin: 0, flex: 1 }}>
                {item.blurb}
              </p>

              {item.mismatch && (
                <p style={{ fontSize: 12, color: "#c2410c", margin: 0 }}>{item.mismatch}</p>
              )}

              <button
                type="button"
                className="btn"
                disabled={busy !== null || item.missing || isCurrent}
                onClick={() => void buy(item.lookupKey)}
                style={{ marginTop: 8, width: "100%", justifyContent: "center" }}
              >
                {item.missing
                  ? "Not set up yet"
                  : isCurrent
                    ? "Current plan"
                    : busy === item.lookupKey
                      ? "Opening Stripe…"
                      : isMembership(item)
                        ? "Join"
                        : "Buy"}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="note note-warn" style={{ marginTop: 14 }}>
          {error}
        </p>
      )}
    </>
  );
}
