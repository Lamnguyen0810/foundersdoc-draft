import "server-only";
import { PACKS, type Pack } from "./packs";
import { isStripeConfigured, stripe } from "./stripe";

/**
 * What each pack actually costs, according to Stripe.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The price used to live in packs.ts as a string, which meant two sources of
 * truth: the number Stripe charges, and the number the page promises. They
 * agree on the day you write them and drift the first time someone edits a
 * price in the Stripe dashboard — at which point the site advertises one amount
 * and charges another. For a law firm that is not a cosmetic bug.
 *
 * So Stripe is the only authority. Change a price in the dashboard and the page
 * follows on the next load: no deploy, no code edit, and no decision needed
 * before the MVP can be seen.
 *
 * The string in packs.ts survives only as a fallback for when Stripe is not
 * configured at all, and it is labelled as such on screen.
 */

export interface PricedPack extends Pack {
  /** "S$150.00" — formatted from Stripe's own amount and currency. */
  price: string;
  /** False when this came from the fallback rather than from Stripe. */
  live: boolean;
  /** True when Stripe has no active price with this lookup key. */
  missing: boolean;
}

function money(amount: number, currency: string): string {
  // Stripe holds minor units: 15000 sgd = S$150.00. Zero-decimal currencies
  // (JPY and friends) are not divided — Intl knows which are which, so the
  // division is the only part that needs care.
  const zeroDecimal = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
  const value = zeroDecimal.has(currency.toLowerCase()) ? amount : amount / 100;
  const decimals = value % 1 === 0 ? 0 : 2;

  /* Intl renders SGD in an en-SG locale as a bare "$150" — which, to a
     Singaporean reader looking at a law firm's pricing, is indistinguishable
     from US dollars. The local convention is "S$", so say "S$". Every other
     currency goes through Intl unchanged. */
  const code = currency.toUpperCase();
  const amountText = value.toLocaleString("en-SG", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (code === "SGD") return `S$${amountText}`;

  try {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${code} ${amountText}`;
  }
}

export async function pricedPacks(): Promise<PricedPack[]> {
  if (!isStripeConfigured()) {
    return PACKS.map((p) => ({ ...p, price: p.displayPrice, live: false, missing: false }));
  }

  try {
    // One call for all of them rather than one per pack.
    const res = await stripe().prices.list({
      lookup_keys: PACKS.map((p) => p.lookupKey),
      active: true,
      limit: 20,
    });

    const byKey = new Map(res.data.filter((p) => p.lookup_key).map((p) => [p.lookup_key!, p]));

    return PACKS.map((p) => {
      const price = byKey.get(p.lookupKey);
      if (!price || price.unit_amount == null) {
        return { ...p, price: p.displayPrice, live: false, missing: true };
      }
      return { ...p, price: money(price.unit_amount, price.currency), live: true, missing: false };
    });
  } catch (err) {
    console.error("[billing] could not read prices from Stripe:", err);
    return PACKS.map((p) => ({ ...p, price: p.displayPrice, live: false, missing: false }));
  }
}
