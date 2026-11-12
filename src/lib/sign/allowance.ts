import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { FAIR_USE, FREE_SIGN, FREE_SIGN_SINCE, SIGN_ONLY, SIGN_PLANS, biggerPlan, signPricingOn, type SignTier } from "@/lib/billing/sign-plans";
import { dailyLimit, startOfDaySgt, startOfMonthSgt, type SignAccount } from "./account";
import type { SignStore } from "./store";

/**
 * What this sender may still send (0223). FD_SIGN_PRICING=on: the monthly plan from their FD AI
 * membership or their FD Sign plan, whichever is bigger (lib/billing/sign-plans.ts, 0225). Off (today): the daily Beta limit, phone codes unmetered.
 */
export function signPricingLive(): boolean {
  return signPricingOn();
}

export interface Allowance {
  live: boolean;
  tier: SignTier;
  label: string;
  /** "day" (Beta), "month" (a plan: FD Sign or FD AI membership) or "free" (no plan: the first FREE_SIGN, ever) */
  per: "day" | "month" | "free";
  used: number;
  /** null = no limit (Unlimited: FAIR_USE behind the scenes); 0 = no plan */
  limit: number | null;
}

async function tierOf(userId: string): Promise<SignTier> {
  const pick = (t: string | undefined): SignTier => (t && t in SIGN_PLANS ? (t as SignTier) : "none");
  if (!isSupabaseConfigured() || !isAdminClientConfigured()) return pick(process.env.FD_SIGN_PREVIEW_TIER);
  const db = supabaseAdmin();
  /* 0225: an FD AI membership (active_membership, which SQL 131 keeps to basic/pro/unlimited) and an
     FD Sign plan of its own can both be running; the bigger allowance counts. */
  const [m, s] = await Promise.all([
    db.rpc("active_membership", { p_user_id: userId }),
    db.from("subscriptions").select("tier").eq("user_id", userId).in("status", ["trialing", "active", "past_due"]).in("tier", SIGN_ONLY),
  ]);
  let tier = pick((m.data as Array<{ tier?: string }> | null)?.[0]?.tier);
  for (const row of (s.data as Array<{ tier?: string }> | null) ?? []) tier = biggerPlan(tier, pick(row.tier));
  return tier;
}

export async function allowance(me: SignAccount, store: SignStore): Promise<Allowance> {
  if (!signPricingLive()) {
    return { live: false, tier: "none", label: "Beta", per: "day", used: await store.sentSince(me.id, startOfDaySgt()), limit: dailyLimit() };
  }
  const tier = await tierOf(me.id);
  /* 0229: no plan yet = the first FREE_SIGN requests are free; 0231: counted from launch day (FREE_SIGN_SINCE) */
  if (tier === "none") {
    return { live: true, tier, label: "Free", per: "free", used: await store.sentSince(me.id, new Date(FREE_SIGN_SINCE).toISOString()), limit: FREE_SIGN };
  }
  const plan = SIGN_PLANS[tier];
  return { live: true, tier, label: plan.label, per: "month", used: await store.sentSince(me.id, startOfMonthSgt()), limit: plan.requests };
}

/** null = may send; otherwise the message to show. The signing code (email, WhatsApp or SMS) is part of the request. */
export function blockReason(a: Allowance): string | null {
  if (a.live && a.limit === 0) return "FD Sign is part of the paid plans. Choose a plan to send documents for signing.";
  if (a.per === "free" && a.used >= (a.limit ?? 0)) return `You've used your ${a.limit} free signing requests. Choose a plan to keep sending.`;
  const cap = a.limit ?? FAIR_USE;
  if (a.used < cap) return null;
  if (!a.live) return `You've sent ${a.limit} requests today, the most for now while FD Sign is free. Please try again tomorrow.`;
  return a.limit === null
    ? "You've reached this month's fair-use limit. Please contact us and we'll help."
    : `You've used your ${a.limit} signing request${a.limit === 1 ? "" : "s"} this month. Upgrade for more, or send again from the 1st.`;
}
