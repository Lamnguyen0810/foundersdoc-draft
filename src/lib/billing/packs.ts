/**
 * What is for sale.
 *
 * ── PRICES ARE TESTING PLACEHOLDERS ─────────────────────────────────────────
 * The amounts below are deliberately tiny, so that if these packs were ever
 * created in a LIVE Stripe account by mistake, the worst case is a few cents
 * rather than a real charge on someone's card. They are also only a fallback:
 * the price shown on /billing and the amount charged both come from Stripe
 * (see prices.ts), so setting real prices later is a dashboard edit with no
 * deploy. Update these strings when the real pricing is settled.
 *
 * S$0.50 is roughly Stripe's floor for SGD — a smaller amount is rejected, so
 * there is no point going lower.
 *
 * The credit count lives HERE and is also written onto the Stripe Price as
 * metadata. The webhook reads the metadata from Stripe, not this file, so the
 * number of credits granted always matches the thing that was actually paid
 * for — even if this file and Stripe drift apart. This file is for showing
 * prices on the page; Stripe is the authority on what was bought.
 */

export interface Pack {
  /** Set this as the Price's `lookup_key` in BOTH test and live Stripe. */
  lookupKey: string;
  name: string;
  credits: number;
  /** FALLBACK ONLY. The price shown on the page and the amount charged both
   *  come from Stripe (see prices.ts). This is what appears if Stripe is not
   *  configured yet, and the page says so when it is used. */
  displayPrice: string;
  blurb: string;
  best?: boolean;
}

export const PACKS: Pack[] = [
  {
    lookupKey: "fdai_pack_3",
    name: "3 documents",
    credits: 3,
    displayPrice: "S$0.50",
    blurb: "For an occasional NDA.",
  },
  {
    lookupKey: "fdai_pack_10",
    name: "10 documents",
    credits: 10,
    displayPrice: "S$1",
    blurb: "The usual choice.",
    best: true,
  },
  {
    lookupKey: "fdai_pack_25",
    name: "25 documents",
    credits: 25,
    displayPrice: "S$2",
    blurb: "For a team drafting regularly.",
  },
];

export function packByLookupKey(key: string): Pack | undefined {
  return PACKS.find((p) => p.lookupKey === key);
}
