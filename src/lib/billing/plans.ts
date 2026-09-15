/**
 * ⭐ THE PRICE LIST. One file, and the only one.
 *
 * Everything the product sells is described here: the pay-as-you-go bundles,
 * the memberships, and the member-only top-ups. The pricing page renders from
 * it, checkout validates against it, and the Stripe setup script creates
 * products from it. Change a price here and those three move together.
 *
 * ── WHY PRICES ARE REPEATED HERE AND IN STRIPE ──────────────────────────────
 * Stripe is the authority on what a customer is charged — the number below is
 * never sent to Stripe at checkout, only the LOOKUP KEY is. Stripe resolves the
 * key to its own price. So the figures here are for display and for creating
 * the products in the first place; if the two ever disagree, Stripe wins and
 * the customer is charged correctly, which is the safe direction for a
 * mismatch to fail in.
 *
 * ── WHY LOOKUP KEYS ─────────────────────────────────────────────────────────
 * A price id (price_1Abc…) is different in test and live mode, so hard-coding
 * one means a code change to go live. A lookup key is chosen by us and set
 * identically in both, so moving from the sandbox to the real account is a swap
 * of three environment variables and nothing else.
 */

export type Currency = "SGD";

/** A one-off purchase: credits for money, no recurring commitment. */
export interface CreditPack {
  kind: "pack" | "topup";
  lookupKey: string;
  label: string;
  credits: number;
  /** Cents, so there is no floating point anywhere near money. */
  amountCents: number;
  currency: Currency;
  blurb: string;
}

/** A recurring membership. */
export interface Membership {
  kind: "membership";
  tier: "basic" | "pro" | "unlimited";
  lookupKey: string;
  label: string;
  /** Credits granted each month. Null for Unlimited, which grants none. */
  monthlyCredits: number | null;
  amountCents: number;
  currency: Currency;
  blurb: string;
  bestFor: string;
}

const SGD: Currency = "SGD";

/* ── Pay-as-you-go ──────────────────────────────────────────────────────────
   Never expire. Bought outright, and never taken back — not on cancellation,
   not on anything. See supabase/010_pricing_model.sql. */
export const PACKS: CreditPack[] = [
  {
    kind: "pack",
    lookupKey: "fdai_pack_1",
    label: "Single document",
    credits: 1,
    amountCents: 880,
    currency: SGD,
    blurb: "One document, whenever you need it.",
  },
  {
    kind: "pack",
    lookupKey: "fdai_pack_3",
    label: "3-document bundle",
    credits: 3,
    amountCents: 2400,
    currency: SGD,
    blurb: "S$8.00 a document.",
  },
  {
    kind: "pack",
    lookupKey: "fdai_pack_5",
    label: "5-document bundle",
    credits: 5,
    amountCents: 3800,
    currency: SGD,
    blurb: "S$7.60 a document.",
  },
];

/* ── Memberships ────────────────────────────────────────────────────────────
   Monthly credits roll over for as long as the membership lasts. They stop
   when it is cancelled; anything bought separately does not. */
export const MEMBERSHIPS: Membership[] = [
  {
    kind: "membership",
    tier: "basic",
    lookupKey: "fdai_member_basic",
    label: "Basic",
    monthlyCredits: 3,
    amountCents: 1880,
    currency: SGD,
    blurb: "3 documents a month, unused ones carry over.",
    bestFor: "Light regular use",
  },
  {
    kind: "membership",
    tier: "pro",
    lookupKey: "fdai_member_pro",
    label: "Pro",
    monthlyCredits: 10,
    amountCents: 4980,
    currency: SGD,
    blurb: "10 documents a month, unused ones carry over.",
    bestFor: "Frequent users and small businesses",
  },
  {
    kind: "membership",
    tier: "unlimited",
    lookupKey: "fdai_member_unlimited",
    label: "Unlimited",
    monthlyCredits: null,
    amountCents: 8880,
    currency: SGD,
    blurb: "Draft as much as you need, within fair use.",
    bestFor: "Heavy users and teams",
  },
];

/* ── Member top-ups ─────────────────────────────────────────────────────────
   Cheaper per document than pay-as-you-go, and only sold to someone with a
   live membership. The gate is enforced on the server in the checkout route —
   never here, and never in the browser, where it would be a suggestion. */
export const TOPUPS: CreditPack[] = [
  {
    kind: "topup",
    lookupKey: "fdai_topup_1",
    label: "1 document",
    credits: 1,
    amountCents: 680,
    currency: SGD,
    blurb: "S$6.80 a document.",
  },
  {
    kind: "topup",
    lookupKey: "fdai_topup_3",
    label: "3 documents",
    credits: 3,
    amountCents: 1950,
    currency: SGD,
    blurb: "S$6.50 a document.",
  },
  {
    kind: "topup",
    lookupKey: "fdai_topup_5",
    label: "5 documents",
    credits: 5,
    amountCents: 3100,
    currency: SGD,
    blurb: "S$6.20 a document.",
  },
  {
    kind: "topup",
    lookupKey: "fdai_topup_10",
    label: "10 documents",
    credits: 10,
    amountCents: 5900,
    currency: SGD,
    blurb: "S$5.90 a document.",
  },
];

export const ALL_ONE_OFF: CreditPack[] = [...PACKS, ...TOPUPS];

export function packByLookupKey(key: string): CreditPack | undefined {
  return ALL_ONE_OFF.find((p) => p.lookupKey === key);
}

export function membershipByLookupKey(key: string): Membership | undefined {
  return MEMBERSHIPS.find((m) => m.lookupKey === key);
}

export function membershipByTier(tier: string): Membership | undefined {
  return MEMBERSHIPS.find((m) => m.tier === tier);
}

/** "S$8.80". Cents in, a price a human recognises out. */
export function money(amountCents: number, currency: Currency = SGD): string {
  const symbol = currency === "SGD" ? "S$" : "";
  return `${symbol}${(amountCents / 100).toFixed(2)}`;
}

/** "S$7.60 a document", for showing a bundle is better value than a single. */
export function perCredit(pack: CreditPack): string {
  return money(Math.round(pack.amountCents / pack.credits), pack.currency);
}

/* ── The trial ──────────────────────────────────────────────────────────────
   Shown on the pricing page. The DATABASE is the authority on what a new
   account actually receives (billing_config), so these two must be kept in
   step — the migration sets the same numbers, and the setup script checks. */
export const TRIAL = { credits: 3, days: 14 } as const;
