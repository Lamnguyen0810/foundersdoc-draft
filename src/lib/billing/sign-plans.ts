/**
 * ⭐ FD SIGN PRICING (0223, revised 0224): the one place for FD Sign's plans. Pure: the send page, the
 * pricing page, the comparison pages and the server all read it.
 *
 * Proposal of 12 Nov 2026 (Rachel: "50% cheaper than DocuSign"; Lam: no free tier, and the signing code
 * is part of every request):
 *   - Paid plans only. Three FD Sign plans at exactly half of DocuSign's price (Personal / Standard /
 *     Business Pro, read 12 Nov), each with more requests; FD AI memberships keep FD Sign included.
 *   - On every plan, each signer's code goes by email, WhatsApp or SMS: the sender's choice
 *     (lib/sign/phone.ts). No separate count or charge per code.
 *
 *   requests   signing requests a month (calendar month, Singapore time); null = no limit (FAIR_USE)
 *   price      what the plan costs (S$ cents a month); Stripe holds the real price under the lookup key
 *              (SIGN_PRODUCTS, created by scripts/create-stripe-products.mjs), and /billing shows Stripe's
 *
 * 0225: the three FD Sign plans are sold through Stripe as their own monthly subscription, beside (not
 * instead of) an FD AI membership. The larger of the two allowances counts (lib/sign/allowance.ts).
 *
 * Switched OFF until agreed: FD_SIGN_PRICING=on in Vercel turns the limits and the plan cards on (a
 * redeploy picks it up); until then FD Sign works as before (free Beta, FD_SIGN_DAILY_LIMIT requests a
 * day), nothing is shown and only an admin can buy a plan (to test).
 */
export type SignTier = "none" | "sign_personal" | "sign_standard" | "sign_business" | "basic" | "pro" | "unlimited";

export interface SignPlan {
  tier: SignTier;
  label: string;
  requests: number | null;
  /** S$ cents a month, for display; null = no FD Sign plan of its own (FD AI memberships show their own price) */
  amountCents: number | null;
  /** the DocuSign plan it is half of, for the proposal and comparison pages */
  halfOf?: string;
}

export const SIGN_PLANS: Record<SignTier, SignPlan> = {
  none: { tier: "none", label: "No plan", requests: 0, amountCents: null },
  sign_personal: { tier: "sign_personal", label: "Sign Personal", requests: 10, amountCents: 715, halfOf: "DocuSign Personal (US$11)" },
  sign_standard: { tier: "sign_standard", label: "Sign Standard", requests: 30, amountCents: 1950, halfOf: "DocuSign Standard (US$30 a user)" },
  sign_business: { tier: "sign_business", label: "Sign Business", requests: 60, amountCents: 2925, halfOf: "DocuSign Business Pro (US$45 a user)" },
  basic: { tier: "basic", label: "FD AI Basic", requests: 20, amountCents: null },
  pro: { tier: "pro", label: "FD AI Pro", requests: 60, amountCents: null },
  unlimited: { tier: "unlimited", label: "FD AI Unlimited", requests: null, amountCents: null },
};

/** The FD Sign plans of their own (their own Stripe subscription, 0225). */
export const SIGN_ONLY: SignTier[] = ["sign_personal", "sign_standard", "sign_business"];

/** FD_SIGN_PRICING=on: plans, limits and plan cards live. Read on the server (and at build for static pages). */
export function signPricingOn(): boolean {
  /* 0231: on by default, so going live needs only this merge, not a Vercel change.
     FD_SIGN_PRICING=off in Vercel (and a redeploy) brings the free Beta back. */
  return (process.env.FD_SIGN_PRICING ?? "").trim().toLowerCase() !== "off";
}

/** True for the FD Sign plans' tiers (sign_*), false for FD AI memberships and anything else. */
export function isSignTier(t: string | null | undefined): boolean {
  return !!t && (SIGN_ONLY as string[]).includes(t);
}

/** An FD Sign plan as Stripe sells it (0225). Same shape the billing code uses for memberships. */
export interface SignProduct {
  kind: "sign";
  tier: "sign_personal" | "sign_standard" | "sign_business";
  /** Stripe price lookup key */
  lookupKey: string;
  label: string;
  amountCents: number;
  currency: "SGD";
  requests: number;
  blurb: string;
}

const product = (tier: SignProduct["tier"], lookupKey: string, blurb: string): SignProduct => ({
  kind: "sign",
  tier,
  lookupKey,
  label: SIGN_PLANS[tier].label,
  amountCents: SIGN_PLANS[tier].amountCents!,
  currency: "SGD",
  requests: SIGN_PLANS[tier].requests!,
  blurb,
});

export const SIGN_PRODUCTS: SignProduct[] = [
  product("sign_personal", "fdsign_personal", "For one person sending now and then."),
  product("sign_standard", "fdsign_standard", "For a small team sending every week."),
  product("sign_business", "fdsign_business", "For teams that send contracts every day."),
];

export function signProductByLookupKey(key: string): SignProduct | undefined {
  return SIGN_PRODUCTS.find((p) => p.lookupKey === key);
}

/** The bigger allowance of two plans (null = no limit wins). */
export function biggerPlan(a: SignTier, b: SignTier): SignTier {
  const ra = SIGN_PLANS[a].requests, rb = SIGN_PLANS[b].requests;
  if (ra === null) return a;
  if (rb === null) return b;
  return rb > ra ? b : a;
}

/** 0236 (Rachel, 12 Nov: "1st week free"): with no plan, an account's first week is free, up to FREE_SIGN
 *  signing requests. The week starts with their first request, so it isn't used up before they try it.
 *  Then a plan (FD Sign or an FD AI membership). */
export const FREE_SIGN = 10;
export const FREE_SIGN_DAYS = 7;
export const FREE_TEXT = `First week free, up to ${FREE_SIGN} signing requests`;

/** 0236 (Rachel, 12 Nov): premium plans get the WhatsApp / SMS signing code and the daily or weekly status
 *  email. The other plans and the free week get the email code. */
export const PREMIUM: SignTier[] = ["sign_standard", "sign_business", "pro", "unlimited"];
export const isPremium = (t: SignTier | string | null | undefined): boolean => !!t && (PREMIUM as string[]).includes(t);
export const PREMIUM_TEXT = "Sign Standard, Sign Business, FD AI Pro and Unlimited";

/** 0231: the free requests count from launch day (Singapore time), so people who used the Beta get a fresh 3. */
export const FREE_SIGN_SINCE = "2026-11-12T00:00:00+08:00";

/** Unlimited's fair-use ceiling a month, so a script can't send thousands. */
export const FAIR_USE = 300;

/** "20 signing requests a month" / "Unlimited signing requests (fair use)" */
export function requestsText(p: SignPlan): string {
  return p.requests === null ? "Unlimited signing requests (fair use)" : `${p.requests} signing request${p.requests === 1 ? "" : "s"} a month`;
}

/** Every plan: the signer's code by email, WhatsApp or SMS. */
export const CODE_TEXT = "Signing code by email, WhatsApp or SMS";

/** 0227: the plan cards name only the code channels switched on (lib/sign/phone.ts phoneChannels()):
 *  email alone until WhatsApp / SMS are set up, so the page never promises what isn't ready. */
export function codeText(phone: string[] = []): string {
  const names = ["email", ...(phone.includes("whatsapp") ? ["WhatsApp"] : []), ...(phone.includes("sms") ? ["SMS"] : [])];
  return `Signing code by ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`}`;
}

const sgd = (c: number) => `S$${(c / 100).toFixed(2).replace(/\.00$/, "")}`;

/** For the comparison pages (lib/products/compare.ts): what FD Sign costs, on or off. */
export function signPriceRows(live: boolean): { free: string; entry: string; team: string; limit: string } {
  if (!live) return { free: "Yes", entry: "S$0", team: "S$0", limit: "Up to 20 requests a day while FD Sign is free" };
  const p = SIGN_PLANS.sign_personal, s = SIGN_PLANS.sign_standard, b = SIGN_PLANS.sign_business;
  return {
    free: FREE_TEXT,
    entry: `${sgd(p.amountCents!)} a month (${p.label}, ${p.requests} requests)`,
    team: `${sgd(s.amountCents!)}–${sgd(b.amountCents!)} a month per account (${s.label}, ${b.label})`,
    limit: `${p.requests} / ${s.requests} / ${b.requests} a month; FD AI memberships include 20, 60 or unlimited`,
  };
}
