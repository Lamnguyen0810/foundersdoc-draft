import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getWallet } from "@/lib/billing/credits";
import { pricedCatalogue } from "@/lib/billing/prices";
import { recentInvoices, type InvoiceRow } from "@/lib/billing/invoices";
import PricingView from "./PricingView";

/* The account's own pricing page. The public one is /pricing (same view,
   no account), so this one is kept out of search results. */
export const metadata = { title: "Pricing — FD AI", robots: { index: false, follow: false }, alternates: { canonical: "https://foundersdoc.com/pricing" } };
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    paid?: string;
    cancelled?: string;
    joined?: string;
    resumed?: string;
    changed?: string;
  }>;
}) {
  if (!isSupabaseConfigured()) redirect("/draft");
  const user = await getUser();
  if (!user) redirect("/login?next=%2Fbilling");

  const { paid, cancelled, joined, resumed, changed } = await searchParams;
  const wallet = await getWallet();
  const catalogue = await pricedCatalogue();

  /* One round trip for balance, membership and fair-use usage. The database
     decides all three — the page never works any of it out for itself. */
  let membership: {
    tier: string | null;
    status: string | null;
    period_end: string | null;
    unlimited_cap: number;
    unlimited_used: number;
  } | null = null;
  let stripeCustomerId: string | null = null;

  try {
    const supabase = await createClient();
    const summary = await supabase.rpc("billing_summary");
    const row = Array.isArray(summary.data) ? summary.data[0] : summary.data;
    if (row) {
      membership = {
        tier: row.tier ?? null,
        status: row.status ?? null,
        period_end: row.period_end ?? null,
        unlimited_cap: Number(row.unlimited_cap ?? 0),
        unlimited_used: Number(row.unlimited_used ?? 0),
      };
    }

    /* The Stripe customer id is recorded by the webhook when the first payment
       lands. No id means nobody has ever been charged, so there is nothing to
       list — and no reason to call Stripe. */
    const { data: account } = await supabase
      .from("billing_accounts")
      .select("stripe_customer_id")
      .maybeSingle();
    stripeCustomerId = (account?.stripe_customer_id as string | null) ?? null;
  } catch {
    // The page still works without these; it just shows less.
  }

  const invoices: InvoiceRow[] = await recentInvoices(stripeCustomerId);

  const tier = membership?.tier ?? null;
  const trialLive = Boolean(wallet.inTrial && wallet.trialEndsAt);

  return (
    <PricingView
      guest={false}
      catalogue={catalogue}
      tier={tier}
      trialLive={trialLive}
      notices={{ paid, cancelled, joined, resumed, changed }}
      invoices={invoices}
    />
  );
}
