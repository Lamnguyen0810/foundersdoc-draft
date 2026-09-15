/**
 * What the pricing page shows, checked against what Stripe will actually charge.
 *
 * The price list in plans.ts is what the firm decided. Stripe holds what the
 * customer is really billed. These should agree, and this module is where the
 * two are put side by side so that a disagreement is visible on the page
 * instead of being discovered on a card statement.
 *
 * When Stripe has no price for a lookup key, the item is marked `missing` and
 * the page says so rather than offering a button that leads to an error.
 */

import { isStripeConfigured, stripe } from "./stripe";
import { MEMBERSHIPS, PACKS, TOPUPS, money, type CreditPack, type Membership } from "./plans";

export interface Priced {
  lookupKey: string;
  /** What to print. Stripe's figure when it is available, ours otherwise. */
  price: string;
  /** True when this came from Stripe rather than from our own list. */
  live: boolean;
  /** True when Stripe has no active price for this lookup key. */
  missing: boolean;
  /** Set when Stripe's price and ours disagree — always worth showing FD. */
  mismatch: string | null;
}

export type PricedPack = CreditPack & Priced;
export type PricedMembership = Membership & Priced;

export interface Catalogue {
  packs: PricedPack[];
  memberships: PricedMembership[];
  topups: PricedPack[];
  /** True when at least one product has not been created in Stripe yet. */
  anyMissing: boolean;
}

function fallback<T extends { lookupKey: string; amountCents: number }>(item: T, missing: boolean): T & Priced {
  return { ...item, price: money(item.amountCents), live: false, missing, mismatch: null };
}

export async function pricedCatalogue(): Promise<Catalogue> {
  const all = [...PACKS, ...MEMBERSHIPS, ...TOPUPS];

  if (!isStripeConfigured()) {
    return {
      packs: PACKS.map((p) => fallback(p, false)),
      memberships: MEMBERSHIPS.map((m) => fallback(m, false)),
      topups: TOPUPS.map((t) => fallback(t, false)),
      anyMissing: false,
    };
  }

  let byKey = new Map<string, { unit_amount: number | null; currency: string }>();
  try {
    // One call for all of them rather than one per product.
    const res = await stripe().prices.list({
      lookup_keys: all.map((p) => p.lookupKey),
      active: true,
      limit: 50,
    });
    byKey = new Map(
      res.data
        .filter((p) => p.lookup_key)
        .map((p) => [p.lookup_key!, { unit_amount: p.unit_amount, currency: p.currency }]),
    );
  } catch (err) {
    console.error("[billing] could not read prices from Stripe:", err);
    return {
      packs: PACKS.map((p) => fallback(p, false)),
      memberships: MEMBERSHIPS.map((m) => fallback(m, false)),
      topups: TOPUPS.map((t) => fallback(t, false)),
      anyMissing: false,
    };
  }

  const price = <T extends { lookupKey: string; amountCents: number }>(item: T): T & Priced => {
    const live = byKey.get(item.lookupKey);
    if (!live || live.unit_amount == null) return fallback(item, true);
    return {
      ...item,
      price: money(live.unit_amount),
      live: true,
      missing: false,
      mismatch:
        live.unit_amount === item.amountCents
          ? null
          : `Stripe charges ${money(live.unit_amount)}, the price list says ${money(item.amountCents)}`,
    };
  };

  const packs = PACKS.map(price);
  const memberships = MEMBERSHIPS.map(price);
  const topups = TOPUPS.map(price);

  return {
    packs,
    memberships,
    topups,
    anyMissing: [...packs, ...memberships, ...topups].some((p) => p.missing),
  };
}
