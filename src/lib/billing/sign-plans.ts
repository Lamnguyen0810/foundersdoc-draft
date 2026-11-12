/**
 * ⭐ FD SIGN PRICING (0223): the one place for FD Sign's limits. Pure: the send page, the pricing
 * page, the comparison pages and the server all read it. Proposal of 12 Nov 2026 (Rachel to agree):
 * FD Sign is part of the FD AI memberships (lib/billing/plans.ts), so there is no separate checkout.
 *
 *   requests     signing requests a sender can send each calendar month (Singapore time); null = no limit
 *                (fair use: FAIR_USE a month)
 *   phoneCodes   WhatsApp / SMS signing codes a month (lib/sign/phone.ts); beyond them the code goes
 *                by email, so nobody is ever charged per message
 *
 * Switched OFF until agreed: FD_SIGN_PRICING=on in Vercel turns it on (no deploy needed); until then
 * FD Sign works as before (free, FD_SIGN_DAILY_LIMIT requests a day) and nothing below is shown.
 * Change a number here and the send page, the pricing cards and the comparison pages all follow.
 */
export type SignTier = "free" | "basic" | "pro" | "unlimited";

export interface SignPlan {
  tier: SignTier;
  label: string;
  requests: number | null;
  phoneCodes: number;
}

export const SIGN_PLANS: Record<SignTier, SignPlan> = {
  free: { tier: "free", label: "Free", requests: 5, phoneCodes: 0 },
  basic: { tier: "basic", label: "Basic", requests: 20, phoneCodes: 10 },
  pro: { tier: "pro", label: "Pro", requests: 60, phoneCodes: 30 },
  unlimited: { tier: "unlimited", label: "Unlimited", requests: null, phoneCodes: 100 },
};

/** Unlimited's fair-use ceiling a month, so a script can't send thousands. */
export const FAIR_USE = 300;

/** "20 signing requests a month" / "Unlimited signing requests" */
export function requestsText(p: SignPlan): string {
  return p.requests === null ? "Unlimited signing requests (fair use)" : `${p.requests} signing request${p.requests === 1 ? "" : "s"} a month`;
}

/** "10 WhatsApp / SMS codes a month" / "Email codes" */
export function phoneText(p: SignPlan): string {
  return p.phoneCodes > 0 ? `${p.phoneCodes} WhatsApp / SMS codes a month` : "Email signing codes";
}

/** For the comparison pages (lib/products/compare.ts): what FD Sign costs, on or off. */
export function signPriceRows(live: boolean): { free: string; entry: string; team: string; limit: string } {
  if (!live) return { free: "Yes", entry: "S$0", team: "S$0", limit: "Up to 20 requests a day while FD Sign is free" };
  return {
    free: `Yes, ${SIGN_PLANS.free.requests} requests a month`,
    entry: `S$18.80 a month with FD AI Basic (${SIGN_PLANS.basic.requests} requests, plus drafting)`,
    team: `S$49.80 a month with FD AI Pro (${SIGN_PLANS.pro.requests} requests)`,
    limit: `${SIGN_PLANS.free.requests} a month free; ${SIGN_PLANS.basic.requests} / ${SIGN_PLANS.pro.requests} / unlimited on Basic, Pro, Unlimited`,
  };
}
