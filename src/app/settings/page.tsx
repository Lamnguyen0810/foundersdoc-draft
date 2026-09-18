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
import SettingsShell, { type BillingView, type DeletedRow, type DraftRow } from "./SettingsShell";
import "../usage/usage.css";
import "./settings.css";
import "./settings-app.css";
import { nameFallback } from "@/lib/draft-name";

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

  const [{ data: profile, error: profileError }, { settings, tableMissing }, wallet] =
    await Promise.all([
      supabase.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle(),
      loadSettings(),
      getWallet(),
    ]);

  /* 033 may not have been run, in which case there is no avatar_url column and
     the query above fails whole — taking the name with it. Ask again for the
     column that has always been there rather than showing an empty name field. */
  const fallbackProfile = profileError
    ? (await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()).data
    : null;
  const fullName =
    ((profile?.full_name ?? fallbackProfile?.full_name) as string | null) ?? "";

  /* ── documents ── */
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [{ data: draftRows, count: draftCount }, { count: draftsThisMonth }, binRows] =
    await Promise.all([
      supabase
        .from("drafts")
        .select("id,title,status,updated_at,doc_types(label)", { count: "exact" })
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("drafts")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", monthStart.toISOString()),
      /* The wastebasket. Its own query rather than a flag on the one above,
         because it is a different list with a different sort: what is nearest
         to being destroyed comes first. A database without 032 run simply
         errors here, and the section does not appear. */
      supabase
        .from("drafts")
        .select("id,title,deleted_at,doc_types(label)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: true })
        .limit(20),
    ]);
  const drafts: DraftRow[] = ((draftRows ?? []) as {
    id: string; title: string | null; status: string; updated_at: string; doc_types: { label: string } | { label: string }[] | null;
  }[]).map((d) => {
    const dt = Array.isArray(d.doc_types) ? d.doc_types[0] : d.doc_types;
    return {
      id: d.id,
      // Named by FD AI when it was drafted; the document type and the day for
      // the handful saved before naming existed.
      title: d.title?.trim() || nameFallback(dt?.label, d.updated_at),
      status: d.status,
      updatedAt: d.updated_at,
      type: dt?.label ?? "Document",
    };
  });

  /** How many days are left before a deleted document is destroyed for good. */
  const DAYS_KEPT = 30;
  /* Read once, so every row in the list counts down from the same moment. */
  const nowMs = new Date().getTime();
  const deleted: DeletedRow[] = ((binRows.data ?? []) as {
    id: string; title: string | null; deleted_at: string; doc_types: { label: string } | { label: string }[] | null;
  }[]).map((d) => {
    const dt = Array.isArray(d.doc_types) ? d.doc_types[0] : d.doc_types;
    const gone = new Date(new Date(d.deleted_at).getTime() + DAYS_KEPT * 86_400_000);
    const daysLeft = Math.max(0, Math.ceil((gone.getTime() - nowMs) / 86_400_000));
    return {
      id: d.id,
      title: d.title?.trim() || nameFallback(dt?.label, d.deleted_at),
      type: dt?.label ?? "Document",
      deletedAt: d.deleted_at,
      daysLeft,
    };
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
      deleted={deleted}
      lastSignInAt={user.last_sign_in_at ?? null}
      avatarUrl={(profile?.avatar_url as string | null) ?? null}
      userId={user.id}
      billing={billing}
      supabase={{ url, key }}
      passwordForm={<SettingsForm supabaseUrl={url} supabaseKey={key} email={user.email} minLength={MIN_PASSWORD_LENGTH} />}
      cancelPlan={plan && !cancelling ? <span className="fdu"><CancelPlan planLabel={plan.label} purchasedCredits={purchasedCredits} /></span> : null}
      updateCard={<UpdateCard hasCard={Boolean(card)} className="btn" label="Update payment method" />}
    />
  );
}
