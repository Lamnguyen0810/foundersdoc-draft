import { redirect } from "next/navigation";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { getWallet } from "@/lib/billing/credits";
import { TRIAL, membershipByTier, money } from "@/lib/billing/plans";
import { defaultCard } from "@/lib/billing/invoices";
import { paymentHistory } from "@/lib/billing/history";
import { loadSettings } from "@/lib/settings.server";
import { CancelPlan, UpdateCard } from "../usage/PlanActions";
import SettingsForm from "./SettingsForm";
import SettingsShell, { type BillingView, type DraftRow } from "./SettingsShell";
import "../usage/usage.css";
import "./settings.css";
import "./settings-app.css";

export const metadata = { title: "Settings — FD AI" };
export const dynamic = "force-dynamic";

/** Keep in step with Supabase → Authentication → Policies → Password requirements. */
const MIN_PASSWORD_LENGTH = 12;

/**
 * The settings page, to the designer's file of 16 September 2026.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * Every figure on it is read from the database or from Stripe at the moment
 * the page opens: the name from the profile, the company from user_settings,
 * the documents from drafts, credits and plan from the same functions the
 * usage page calls, the card and the payments from Stripe. Where the design
 * shows a feature FD AI does not have yet — a profile photo, Google sign-in,
 * two-factor, notifications, retention — the control is there as designed
 * and says "Coming soon", and leads to the site's coming-soon page. Nothing
 * pretends to work.
 */
export default async function SettingsPage() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) redirect("/draft");

  const user = await getUser();
  if (!user?.email) redirect("/login?next=%2Fsettings");

  const supabase = await createClient();

  const [{ data: profile }, { settings, tableMissing }, wallet] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    loadSettings(),
    getWallet(),
  ]);
  const fullName = (profile?.full_name as string | null) ?? "";

  /* ── documents ── */
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [{ data: draftRows, count: draftCount }, { count: draftsThisMonth }] = await Promise.all([
    supabase
      .from("drafts")
      .select("id,title,status,updated_at,doc_types(label)", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase.from("drafts").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
  ]);
  const drafts: DraftRow[] = ((draftRows ?? []) as {
    id: string; title: string | null; status: string; updated_at: string; doc_types: { label: string } | { label: string }[] | null;
  }[]).map((d) => {
    const dt = Array.isArray(d.doc_types) ? d.doc_types[0] : d.doc_types;
    return { id: d.id, title: d.title || "Untitled draft", status: d.status, updatedAt: d.updated_at, type: dt?.label ?? "Document" };
  });

  /* ── plan, credits, card, payments — the usage page's own sources ── */
  let tier: string | null = null;
  let status: string | null = null;
  let periodEnd: string | null = null;
  let periodUsed = 0;
  try {
    const { data } = await supabase.rpc("billing_summary");
    const row = Array.isArray(data) ? data[0] : data;
    tier = row?.tier ? String(row.tier) : null;
    status = row?.status ? String(row.status) : null;
    periodEnd = row?.period_end ?? null;
    periodUsed = Number(row?.period_used ?? 0);
  } catch {
    /* shown as pay-as-you-go */
  }
  const plan = tier ? membershipByTier(tier) : null;

  let stripeCustomerId: string | null = null;
  try {
    const { data: account } = await supabase.from("billing_accounts").select("stripe_customer_id").maybeSingle();
    stripeCustomerId = (account?.stripe_customer_id as string | null) ?? null;
  } catch {
    /* no card to show */
  }
  const [card, payments] = await Promise.all([defaultCard(stripeCustomerId), paymentHistory(stripeCustomerId)]);

  let purchasedCredits = 0;
  try {
    const { data: bought } = await supabase.from("credit_grants").select("remaining").in("source", ["purchase", "topup"]).gt("remaining", 0);
    purchasedCredits = (bought ?? []).reduce((a: number, g: { remaining: number }) => a + Number(g.remaining ?? 0), 0);
  } catch {
    /* general wording in the cancel dialog */
  }

  const cancelling = status === "canceled" || status === "cancelling";
  const allowance = plan?.monthlyCredits ?? (wallet.inTrial ? TRIAL.credits : null);
  const billing: BillingView = {
    credits: Number.isFinite(wallet.credits) ? wallet.credits : null,
    planLabel: plan ? `${plan.label} membership` : wallet.inTrial ? "Free trial" : "Pay as you go",
    planPrice: plan ? money(plan.amountCents, plan.currency) : null,
    status: plan ? (status === "past_due" ? "Payment failed" : cancelling ? "Ending" : "Active") : wallet.inTrial ? "Trial" : null,
    renewsAt: plan ? periodEnd : wallet.inTrial ? wallet.trialEndsAt : null,
    cancelling,
    card: card ? `${card.brand} •••• ${card.last4}` : null,
    allowance,
    used: periodUsed,
    draftsThisMonth: draftsThisMonth ?? 0,
    payments: payments.filter((p) => p.url).map((p) => ({
      id: p.id,
      at: p.paidAt,
      description: p.description,
      amount: p.amount,
      status: p.status,
      refunded: p.refunded,
      url: p.url,
    })),
  };

  return (
    <SettingsShell
      email={user.email}
      fullName={fullName}
      settings={settings}
      settingsMissing={tableMissing}
      drafts={drafts}
      draftCount={draftCount ?? drafts.length}
      billing={billing}
      supabase={{ url, key }}
      passwordForm={<SettingsForm supabaseUrl={url} supabaseKey={key} email={user.email} minLength={MIN_PASSWORD_LENGTH} />}
      cancelPlan={plan && !cancelling ? <span className="fdu"><CancelPlan planLabel={plan.label} purchasedCredits={purchasedCredits} /></span> : null}
      updateCard={<UpdateCard hasCard={Boolean(card)} className="btn" label="Update payment method" />}
    />
  );
}
