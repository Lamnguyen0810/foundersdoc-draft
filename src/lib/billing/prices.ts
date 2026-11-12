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
import { SIGN_PRODUCTS, signPricingOn, type SignProduct } from "./sign-plans";

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
/** 0225: an FD Sign plan, checked against Stripe like the rest */
export type PricedSign = SignProduct & Priced;

export interface Catalogue {
  packs: PricedPack[];
  memberships: PricedMembership[];
  topups: PricedPack[];
  /** 0225: FD Sign's own plans (shown once FD_SIGN_PRICING=on) */
  signPlans: PricedSign[];
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
  const all = [...PACKS, ...MEMBERSHIPS, ...TOPUPS, ...SIGN_PRODUCTS];

  if (!isStripeConfigured()) {
    return {
      packs: PACKS.map((p) => fallback(p, false)),
      memberships: MEMBERSHIPS.map((m) => fallback(m, false)),
      topups: TOPUPS.map((t) => fallback(t, false)),
      signPlans: SIGN_PRODUCTS.map((p) => fallback(p, false)),
      anyMissing: false,
      anyWrongCurrency: false,
    };
  }

  let byKey = new Map<string, { unit_amount: number | null; currency: string }>();
  try {
    /* As few calls as possible. Stripe takes at most 10 lookup keys per list call (0225: FD Sign's three
       plans made it 13), so the keys go in groups of 10, side by side. */
    const keys = all.map((p) => p.lookupKey);
    const groups: string[][] = [];
    for (let i = 0; i < keys.length; i += 10) groups.push(keys.slice(i, i + 10));
    const lists = await Promise.all(groups.map((g) => stripe().prices.list({ lookup_keys: g, active: true, limit: 20 })));
    byKey = new Map(
      lists
        .flatMap((res) => res.data)
        .filter((p) => p.lookup_key)
        .map((p) => [p.lookup_key!, { unit_amount: p.unit_amount, currency: p.currency }]),
    );
  } catch (err) {
    console.error("[billing] could not read prices from Stripe:", err);
    return {
      packs: PACKS.map((p) => fallback(p, false)),
      memberships: MEMBERSHIPS.map((m) => fallback(m, false)),
      topups: TOPUPS.map((t) => fallback(t, false)),
      signPlans: SIGN_PRODUCTS.map((p) => fallback(p, false)),
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
  const signPlans = SIGN_PRODUCTS.map(price);

  /* FD Sign's plans count towards "missing" only once they are on sale: until FD_SIGN_PRICING=on their
     Stripe products may not exist yet, and nobody should see a warning about it. */
  const all_ = [...packs, ...memberships, ...topups, ...(signPricingOn() ? signPlans : [])];

  return {
    packs,
    memberships,
    topups,
    signPlans,
    anyMissing: all_.some((p) => p.missing),
    anyWrongCurrency: all_.some((p) => p.wrongCurrency),
  };
}
