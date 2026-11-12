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
 *   price      what the plan costs, for display; the FD Sign plans aren't sold yet (they need their Stripe
 *              products: placeholder = true keeps their price off the public pages)
 *
 * Switched OFF until agreed: FD_SIGN_PRICING=on in Vercel turns the limits on (no deploy needed); until
 * then FD Sign works as before (free Beta, FD_SIGN_DAILY_LIMIT requests a day) and nothing is shown.
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

/** The FD Sign plans of their own (not sold until their Stripe products exist and Rachel agrees the prices). */
export const SIGN_ONLY: SignTier[] = ["sign_personal", "sign_standard", "sign_business"];
export const SIGN_PRICES_PLACEHOLDER = true;

/** Unlimited's fair-use ceiling a month, so a script can't send thousands. */
export const FAIR_USE = 300;

/** "20 signing requests a month" / "Unlimited signing requests (fair use)" */
export function requestsText(p: SignPlan): string {
  return p.requests === null ? "Unlimited signing requests (fair use)" : `${p.requests} signing request${p.requests === 1 ? "" : "s"} a month`;
}

/** Every plan: the signer's code by email, WhatsApp or SMS. */
export const CODE_TEXT = "Signing code by email, WhatsApp or SMS";

const sgd = (c: number) => `S$${(c / 100).toFixed(2).replace(/\.00$/, "")}`;

/** For the comparison pages (lib/products/compare.ts): what FD Sign costs, on or off. */
export function signPriceRows(live: boolean): { free: string; entry: string; team: string; limit: string } {
  if (!live) return { free: "Yes", entry: "S$0", team: "S$0", limit: "Up to 20 requests a day while FD Sign is free" };
  const p = SIGN_PLANS.sign_personal, s = SIGN_PLANS.sign_standard, b = SIGN_PLANS.sign_business;
  return {
    free: "No (paid plans from half DocuSign's price)",
    entry: `${sgd(p.amountCents!)} a month (${p.label}, ${p.requests} requests)`,
    team: `${sgd(s.amountCents!)}–${sgd(b.amountCents!)} a month per account (${s.label}, ${b.label})`,
    limit: `${p.requests} / ${s.requests} / ${b.requests} a month; FD AI memberships include 20, 60 or unlimited`,
  };
}
