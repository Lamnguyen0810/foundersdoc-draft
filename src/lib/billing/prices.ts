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
import {
  MEMBERSHIPS,
  PACKS,
  SELLING_CURRENCY,
  TOPUPS,
  money,
  moneyIn,
  type CreditPack,
  type Membership,
} from "./plans";

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
  /** The currency Stripe will actually charge in, lower case, e.g. "sgd". */
  currencyCode: string;
  /** True when Stripe will charge in something other than Singapore dollars. */
  wrongCurrency: boolean;
}

export type PricedPack = CreditPack & Priced;
export type PricedMembership = Membership & Priced;

export interface Catalogue {
  packs: PricedPack[];
  memberships: PricedMembership[];
  topups: PricedPack[];
  /** True when at least one product has not been created in Stripe yet. */
  anyMissing: boolean;
  /** True when any live price is denominated in something other than SGD. */
  anyWrongCurrency: boolean;
}

function fallback<T extends { lookupKey: string; amountCents: number }>(item: T, missing: boolean): T & Priced {
  return {
    ...item,
    price: money(item.amountCents),
    live: false,
    missing,
    mismatch: null,
    currencyCode: SELLING_CURRENCY,
    wrongCurrency: false,
  };
}

export async function pricedCatalogue(): Promise<Catalogue> {
  const all = [...PACKS, ...MEMBERSHIPS, ...TOPUPS];

  if (!isStripeConfigured()) {
    return {
      packs: PACKS.map((p) => fallback(p, false)),
      memberships: MEMBERSHIPS.map((m) => fallback(m, false)),
      topups: TOPUPS.map((t) => fallback(t, false)),
      anyMissing: false,
      anyWrongCurrency: false,
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
      anyWrongCurrency: false,
    };
  }

  const price = <T extends { lookupKey: string; amountCents: number }>(item: T): T & Priced => {
    const live = byKey.get(item.lookupKey);
    if (!live || live.unit_amount == null) return fallback(item, true);

    /* ── CURRENCY IS CHECKED, NOT ASSUMED ─────────────────────────────────
       This used to format Stripe's figure with money(), which always writes
       "S$". A Price created in US dollars therefore appeared on the page as a
       Singapore price and was charged as an American one — a disagreement the
       customer would only discover on their statement. Stripe's own currency
       is printed, and a wrong one is called out. */
    const wrongCurrency = live.currency.toLowerCase() !== SELLING_CURRENCY;
    const shown = moneyIn(live.unit_amount, live.currency);

    const notes: string[] = [];
    if (wrongCurrency) {
      notes.push(
        `Stripe will charge in ${live.currency.toUpperCase()}, not Singapore dollars. ` +
          `Archive this price and re-create it in SGD.`,
      );
    }
    if (live.unit_amount !== item.amountCents) {
      notes.push(`Stripe charges ${shown}, the price list says ${money(item.amountCents)}`);
    }

    return {
      ...item,
      price: shown,
      live: true,
      missing: false,
      mismatch: notes.length ? notes.join(" ") : null,
      currencyCode: live.currency.toLowerCase(),
      wrongCurrency,
    };
  };

  const packs = PACKS.map(price);
  const memberships = MEMBERSHIPS.map(price);
  const topups = TOPUPS.map(price);

  const all_ = [...packs, ...memberships, ...topups];

  return {
    packs,
    memberships,
    topups,
    anyMissing: all_.some((p) => p.missing),
    anyWrongCurrency: all_.some((p) => p.wrongCurrency),
  };
}
