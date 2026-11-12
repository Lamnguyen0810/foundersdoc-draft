import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { FAIR_USE, SIGN_PLANS, type SignTier } from "@/lib/billing/sign-plans";
import { dailyLimit, startOfDaySgt, startOfMonthSgt, type SignAccount } from "./account";
import type { SignStore } from "./store";

/**
 * What this sender may still send (0223). FD_SIGN_PRICING=on: the monthly plan from their FD AI
 * membership (lib/billing/sign-plans.ts). Off (today): the daily Beta limit, phone codes unmetered.
 */
export function signPricingLive(): boolean {
  return (process.env.FD_SIGN_PRICING ?? "").trim().toLowerCase() === "on";
}

export interface Allowance {
  live: boolean;
  tier: SignTier;
  label: string;
  /** "day" (Beta) or "month" (plans) */
  per: "day" | "month";
  used: number;
  /** null = no limit (Unlimited: FAIR_USE behind the scenes); 0 = no plan */
  limit: number | null;
}

async function tierOf(userId: string): Promise<SignTier> {
  const pick = (t: string | undefined): SignTier => (t && t in SIGN_PLANS ? (t as SignTier) : "none");
  if (!isSupabaseConfigured() || !isAdminClientConfigured()) return pick(process.env.FD_SIGN_PREVIEW_TIER);
  const r = await supabaseAdmin().rpc("active_membership", { p_user_id: userId });
  return pick((r.data as Array<{ tier?: string }> | null)?.[0]?.tier);
}

export async function allowance(me: SignAccount, store: SignStore): Promise<Allowance> {
  if (!signPricingLive()) {
    return { live: false, tier: "none", label: "Beta", per: "day", used: await store.sentSince(me.id, startOfDaySgt()), limit: dailyLimit() };
  }
  const tier = await tierOf(me.id);
  const plan = SIGN_PLANS[tier];
  return { live: true, tier, label: plan.label, per: "month", used: await store.sentSince(me.id, startOfMonthSgt()), limit: plan.requests };
}

/** null = may send; otherwise the message to show. The signing code (email, WhatsApp or SMS) is part of the request. */
export function blockReason(a: Allowance): string | null {
  if (a.live && a.limit === 0) return "FD Sign is part of the paid plans. Choose a plan to send documents for signing.";
  const cap = a.limit ?? FAIR_USE;
  if (a.used < cap) return null;
  if (!a.live) return `You've sent ${a.limit} requests today, the most for now while FD Sign is free. Please try again tomorrow.`;
  return a.limit === null
    ? "You've reached this month's fair-use limit. Please contact us and we'll help."
    : `You've used your ${a.limit} signing request${a.limit === 1 ? "" : "s"} this month. Upgrade for more, or send again from the 1st.`;
}
