"use client";

import { useState } from "react";
import type { PricedPack } from "@/lib/billing/prices";

/**
 * The buy buttons.
 *
 * This component knows a pack's NAME and a display price. It does not know, and
 * never sends, an amount — it posts a lookup key and the server asks Stripe
 * what that costs. If this file said `amount: 15000`, anyone could change it in
 * their browser and buy twenty-five documents for a dollar.
 */
export default function BuyButtons({ packs }: { packs: PricedPack[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(pack: PricedPack) {
    setBusy(pack.lookupKey);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookupKey: pack.lookupKey }),
      });
      const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !j?.url) {
        setError(j?.error ?? "Could not start checkout. Please try again.");
        return;
      }
      // Off to Stripe's own page. No card detail is ever typed on this site.
      window.location.assign(j.url);
    } catch {
      setError("Could not reach the payment service. Check your connection.");
      setBusy(null);
    }
  }

  return (
    <>
      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        }}
      >
        {packs.map((p) => (
          <div
            key={p.lookupKey}
            style={{
              border: p.best ? "1px solid var(--gold)" : "1px solid var(--grey-2)",
              borderRadius: 14,
              padding: 20,
              background: "var(--white)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {p.best && (
              <span style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 600 }}>
                Most chosen
              </span>
            )}
            <b style={{ fontSize: 17, fontWeight: 500 }}>{p.name}</b>
            <span style={{ fontSize: 26, letterSpacing: "-0.02em" }}>{p.price}</span>
            {!p.live && (
              <span style={{ fontSize: 11, color: "var(--grey-4)" }}>
                placeholder — not set in Stripe
              </span>
            )}
            <span className="sub" style={{ fontSize: 13 }}>{p.blurb}</span>
            <button
              type="button"
              className="btn btn-gold"
              style={{ marginTop: 10 }}
              disabled={busy !== null || p.missing}
              onClick={() => void buy(p)}
            >
              {busy === p.lookupKey ? "Opening checkout…" : "Buy"}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="note note-warn" style={{ marginTop: 16 }}>{error}</p>}
      <p className="sub" style={{ fontSize: 12.5, marginTop: 14 }}>
        Payment is taken by Stripe on their own secure page. Card details are never typed on, sent
        to, or stored by foundersdoc.com.
      </p>
    </>
  );
}
