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
  /** null = no limit (Unlimited: FAIR_USE behind the scenes) */
  limit: number | null;
  phoneUsed: number;
  /** null = not metered (pricing off) */
  phoneLimit: number | null;
}

async function tierOf(userId: string): Promise<SignTier> {
  if (!isSupabaseConfigured() || !isAdminClientConfigured()) return (process.env.FD_SIGN_PREVIEW_TIER as SignTier) in SIGN_PLANS ? (process.env.FD_SIGN_PREVIEW_TIER as SignTier) : "free";
  const r = await supabaseAdmin().rpc("active_membership", { p_user_id: userId });
  const t = ((r.data as Array<{ tier?: string }> | null)?.[0]?.tier ?? "free") as SignTier;
  return t in SIGN_PLANS ? t : "free";
}

export async function allowance(me: SignAccount, store: SignStore): Promise<Allowance> {
  if (!signPricingLive()) {
    return { live: false, tier: "free", label: "Beta", per: "day", used: await store.sentSince(me.id, startOfDaySgt()), limit: dailyLimit(), phoneUsed: 0, phoneLimit: null };
  }
  const tier = await tierOf(me.id);
  const plan = SIGN_PLANS[tier];
  const since = startOfMonthSgt();
  const [used, phoneUsed] = await Promise.all([store.sentSince(me.id, since), store.phoneSince(me.id, since).catch(() => 0)]);
  return { live: true, tier, label: plan.label, per: "month", used, limit: plan.requests, phoneUsed, phoneLimit: plan.phoneCodes };
}

/** null = may send; otherwise the message to show. phones = WhatsApp / SMS codes in this request. */
export function blockReason(a: Allowance, phones: number): string | null {
  const cap = a.limit ?? FAIR_USE;
  if (a.used >= cap) {
    if (!a.live) return `You've sent ${a.limit} requests today, the most for now while FD Sign is free. Please try again tomorrow.`;
    return a.limit === null
      ? "You've reached this month's fair-use limit. Please contact us and we'll help."
      : `You've used your ${a.limit} ${a.label === "Free" ? "free " : ""}signing request${a.limit === 1 ? "" : "s"} this month. Upgrade for more, or send again from the 1st.`;
  }
  if (a.live && a.phoneLimit !== null && phones > 0 && a.phoneUsed + phones > a.phoneLimit) {
    const left = Math.max(0, a.phoneLimit - a.phoneUsed);
    return a.phoneLimit === 0
      ? "WhatsApp and SMS codes come with FD AI memberships. Choose email for the code, or upgrade."
      : `Your plan has ${left} WhatsApp / SMS code${left === 1 ? "" : "s"} left this month. Choose email for the others, or upgrade.`;
  }
  return null;
}
