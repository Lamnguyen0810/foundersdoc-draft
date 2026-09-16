import Link from "next/link";
import { PAID_BENCHMARK } from "@/lib/ai/pricing";
import { getWallet } from "@/lib/billing/credits";
/* `money` here is the page's own US-dollar formatter for model costs; the
   price list's is Singapore dollars. Two currencies, two names, no confusion. */
import { TRIAL, membershipByTier, money as sgd } from "@/lib/billing/plans";
import { defaultCard } from "@/lib/billing/invoices";
import { paymentHistory, type PaymentRow } from "@/lib/billing/history";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { CancelPlan, UpdateCard } from "./PlanActions";
import "./usage.css";

export const metadata = { title: "Usage — FDAI" };
export const dynamic = "force-dynamic";

interface UsageRow {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | string;
  paid_benchmark_usd: number | string;
  created_at: string;
}

function money(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function num(v: number | string): number {
  return typeof v === "number" ? v : Number.parseFloat(v || "0");
}

/** Declared at module level, not inside the page: a component created during
 *  render is a new component type on every render. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card stat" style={{ padding: "16px 18px" }}>
      <dt
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--grey-4)",
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: "8px 0 0" }}>
        <b>{value}</b>
        {hint && <span>{hint}</span>}
      </dd>
    </div>
  );
}

/**
 * The cheapest honest way to buy `perMonth` documents a month.
 *
 * ── WHY THIS IS ARITHMETIC AND NOT MARKETING ────────────────────────────────
 * "Upgrade to Pro!" on a page belonging to somebody who drafts once a quarter
 * is a lie dressed as a suggestion, and the firm selling it is a law firm. So
 * nothing is recommended unless the sums say the person would pay LESS for the
 * documents they are actually using — and the saving is shown, so the claim can
 * be checked.
 *
 * Both sides are compared at the same volume: what a membership costs a month
 * against what the same number of documents costs in bundles at the best rate
 * on offer. A bundle buyer has to buy in whole bundles, which is part of why
 * the per-document price is worse, so that is how it is counted.
 */
/* ── WHAT USED TO BE HERE ───────────────────────────────────────────────────
   A recommendation engine: it costed the month against every plan and put the
   cheaper one on the button — "Move to Pro", with the saving worked out.

   It is gone because the button must not name a plan. Choosing between plans
   is what the pricing page is for, where all of them are side by side with
   what each includes; a button that has already decided skips the comparison
   and asks for a yes. The button now says only which direction is open —
   explore, or upgrade — and the choosing happens where it belongs. */

interface MembershipRow {
  id: string;
  tier: string;
  status: string;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancel_note: string | null;
}

const REASON_LABEL: Record<string, string> = {
  too_expensive: "Too expensive",
  not_using: "Not drafting enough",
  missing_feature: "Missing something needed",
  quality: "Not happy with the drafts",
  switching: "Using something else",
  temporary: "Pausing for now",
  other: "Another reason",
};

interface HistoryEntry {
  key: string;
  at: string | null;
  title: string;
  subtitle: string;
  amount: string;
  amountNote: string | null;
  badge: { text: string; tone: string };
  /** "Cancelled 16 Sept 2026 · Too expensive", when the plan behind it ended. */
  note: string | null;
  url: string;
}

function paymentBadge(p: PaymentRow): { text: string; tone: string } {
  switch (p.status) {
    case "paid":
      return { text: "Paid", tone: "" };
    case "refunded":
      return { text: "Refunded", tone: "off" };
    case "part_refunded":
      return { text: "Part refunded", tone: "warn" };
    case "failed":
      return { text: "Failed", tone: "bad" };
    default:
      return { text: "Pending", tone: "warn" };
  }
}

/**
 * One row of the billing history.
 *
 * A single button, View, opening Stripe's own page for that payment in a new
 * tab — the hosted invoice where there is one, the receipt where there is not.
 * Both carry Download invoice and Download receipt, which is why there is no
 * second button here: rendering our own copy of a record of money would give
 * two answers to a question that must only ever have one.
 */
function HistoryRow({ entry, current = false }: { entry: HistoryEntry; current?: boolean }) {
  const day = entry.at
    ? new Date(entry.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";
  return (
    <div className={current ? "billing-history-row current-billing-row" : "billing-history-row"}>
      <div className="history-date">
        <strong>{day}</strong>
        <span>{entry.title}</span>
      </div>
      <div className="history-amount">
        <strong>{entry.amount}</strong>
        <span>{entry.note ?? entry.amountNote ?? entry.subtitle}</span>
      </div>
      <div>
        <span className={entry.badge.tone ? `paid-pill ${entry.badge.tone}` : "paid-pill"}>
          {entry.badge.text}
        </span>
      </div>
      <div className="history-actions">
        <a className="history-btn receipt" href={entry.url} target="_blank" rel="noopener noreferrer">
          View
        </a>
      </div>
    </div>
  );
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const justCancelled = "cancelled" in (await searchParams);
  if (!isSupabaseConfigured()) {
    return (
      <main className="wrap" style={{ paddingTop: 48 }}>
        <h1 style={{ fontSize: 30 }}>Usage</h1>
        <p className="sub" style={{ marginTop: 12, maxWidth: "56ch" }}>
          Usage is recorded once Supabase is configured. Each draft still shows its own token count
          and cost estimate on the draft page. See SETUP_SUPABASE.md.
        </p>
      </main>
    );
  }

  const user = await getUser();
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("usage_log")
    .select("provider,model,input_tokens,output_tokens,cost_usd,paid_benchmark_usd,created_at")
    .gte("created_at", monthStart.toISOString())
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as UsageRow[];

  const drafts = rows.length;
  const inputTokens = rows.reduce((a, r) => a + r.input_tokens, 0);
  const outputTokens = rows.reduce((a, r) => a + r.output_tokens, 0);
  const actual = rows.reduce((a, r) => a + num(r.cost_usd), 0);
  const benchmark = rows.reduce((a, r) => a + num(r.paid_benchmark_usd), 0);
  const perDraft = drafts ? benchmark / drafts : 0;

  const byModel = new Map<string, { drafts: number; benchmark: number }>();
  for (const r of rows) {
    const key = `${r.provider} · ${r.model}`;
    const cur = byModel.get(key) ?? { drafts: 0, benchmark: 0 };
    cur.drafts += 1;
    cur.benchmark += num(r.paid_benchmark_usd);
    byModel.set(key, cur);
  }

  const monthLabel = monthStart.toLocaleString("en-GB", { month: "long", year: "numeric" });

  /* What the meter measures against, decided once here so the component itself
     holds no opinion about pricing. */
  const wallet = await getWallet();

  let tierFromSummary: string | null = null;
  let statusFromSummary: string | null = null;
  let periodEnd: string | null = null;
  let unlimitedCap = 0;
  let unlimitedUsed = 0;
  let spentThisPeriod = 0;

  try {
    const { data } = await supabase.rpc("billing_summary");
    const row = Array.isArray(data) ? data[0] : data;
    tierFromSummary = row?.tier ? String(row.tier) : null;
    statusFromSummary = row?.status ? String(row.status) : null;
    periodEnd = row?.period_end ?? null;
    unlimitedCap = Number(row?.unlimited_cap ?? 0);
    unlimitedUsed = Number(row?.unlimited_used ?? 0);
    /* period_used arrives from the database, counted over the same window
       fair use is enforced in. Working it out here from a separate query
       would eventually disagree with the gate about what month it is. */
    spentThisPeriod = Number(row?.period_used ?? 0);
  } catch {
    // The page still works without it; it just shows less.
  }

  const whenDay = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  /* The allowance the percentage is measured against, and nothing else. */
  let meter: {
    used: number;
    allowance: number | null;
    resetsLabel: string | null;
    note: string;
    carriedOver: number;
    balance: number;
  } = {
    used: spentThisPeriod,
    allowance: null,
    resetsLabel: null,
    note: "Bought documents never expire",
    carriedOver: 0,
    balance: Number.isFinite(wallet.credits) ? wallet.credits : 0,
  };

  const planForMeter = tierFromSummary ? membershipByTier(tierFromSummary) : null;

  if (tierFromSummary === "unlimited") {
    meter = {
      ...meter,
      /* The database already counts this one, because fair use is enforced on
         it — using its figure keeps the page and the gate in agreement. */
      used: unlimitedUsed,
      allowance: unlimitedCap > 0 ? unlimitedCap : null,
      resetsLabel: periodEnd ? `Resets ${whenDay(periodEnd)}` : null,
      note: unlimitedCap > 0 ? "Fair-use allowance" : "No limit set",
      carriedOver: 0,
    };
  } else if (planForMeter?.monthlyCredits) {
    const monthly = planForMeter.monthlyCredits;
    meter = {
      ...meter,
      allowance: monthly,
      resetsLabel: periodEnd ? `${monthly} more on ${whenDay(periodEnd)}` : null,
      note: "Unused documents carry over",
      // Anything held beyond this month's allowance came from earlier months
      // or from a bundle. It is real, and it is not part of this month's bar.
      carriedOver: Math.max(0, meter.balance - monthly),
    };
  } else if (wallet.inTrial && wallet.trialEndsAt) {
    meter = {
      ...meter,
      allowance: TRIAL.credits,
      resetsLabel: `Expires ${whenDay(wallet.trialEndsAt)}`,
      note: "Free trial",
      carriedOver: Math.max(0, meter.balance - TRIAL.credits),
    };
  }

  /* ── WHAT THE PLAN CARD SAYS ──────────────────────────────────────────────
     Every value below is read back from the database — the tier from
     billing_summary, the balance from the wallet, the month's drafting from
     usage_log. Nothing is assumed from what somebody clicked on the pricing
     page, because that and what they are actually being billed for can differ,
     and this is the screen where a person checks. */
  const currentTier = tierFromSummary;
  const plan = currentTier ? membershipByTier(currentTier) : null;
  const whenShort = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : null;

  const planLabel = plan
    ? `${plan.label} membership`
    : wallet.inTrial
      ? "Free trial"
      : "Pay as you go";

  const creditsNote = plan
    ? plan.monthlyCredits === null
      ? "Drafting does not spend credits on this plan"
      : "Carries over while you stay a member"
    : wallet.inTrial && wallet.trialEndsAt
      ? `Trial ends ${whenShort(wallet.trialEndsAt)}`
      : "Bought documents never expire";

  /* Who is allowed to see the model-cost figures further down. They are FD's
     own margin working, not the customer's business, so they are fetched for
     everyone (the query is the same one the page already runs) but rendered
     only for an administrator. */
  const admin = await isAdmin();

  /* The card Stripe will charge next, and the account it belongs to. Both are
     null until somebody has actually paid, which is the honest thing to show
     before a first payment rather than an invented placeholder. */
  let stripeCustomerId: string | null = null;
  try {
    const { data: account } = await supabase
      .from("billing_accounts")
      .select("stripe_customer_id")
      .maybeSingle();
    stripeCustomerId = (account?.stripe_customer_id as string | null) ?? null;
  } catch {
    // Same as above: the panel simply says less.
  }
  const card = await defaultCard(stripeCustomerId);

  /* Credits bought outright. The cancel dialog names the figure, because
     "you keep the 5 you paid for" is the sentence that stops somebody
     believing a cancellation wipes what they own. */
  let purchasedCredits = 0;
  try {
    const { data: bought } = await supabase
      .from("credit_grants")
      .select("remaining")
      .in("source", ["purchase", "topup"])
      .gt("remaining", 0);
    purchasedCredits = (bought ?? []).reduce(
      (a: number, g: { remaining: number }) => a + Number(g.remaining ?? 0),
      0,
    );
  } catch {
    // Shown as the general wording instead.
  }

  const cancelling = statusFromSummary === "canceled" || statusFromSummary === "cancelling";
  const pastDue = statusFromSummary === "past_due";

  /* The design draws one percentage bar. It measures this period's drafting
     against the allowance the plan gives, and shows nothing at all when there
     is no allowance to measure against — pay-as-you-go has no denominator. */
  const percent =
    meter.allowance && meter.allowance > 0
      ? Math.min(100, Math.round((meter.used / meter.allowance) * 100))
      : null;

  /* ── BILLING HISTORY, NOW ON THIS PAGE ────────────────────────────────────
     Two sources, one list. Stripe knows what was charged; it does not know
     that a membership was cancelled on the 16th because it was too expensive,
     which lives in our own table. Both are rendered as the same row so the
     list reads as one record rather than two tables stacked. */
  const payments = await paymentHistory(stripeCustomerId);

  let plans: MembershipRow[] = [];
  try {
    const { data } = await supabase.rpc("membership_history");
    plans = (data ?? []) as MembershipRow[];
  } catch {
    // 013_cancellation.sql has not been run yet; payments still show.
  }

  /* ── ONE ROW PER PAYMENT ──────────────────────────────────────────────────
     Every row in the design carries a View button, and View opens the Stripe
     page for that payment. So every row here is a payment — a row with nothing
     to open would have to say "No document", which is a button-shaped hole in
     a column of buttons.

     A membership that ended is therefore not a row of its own. It is written
     onto its final invoice instead: the same payment, with "Cancelled" and the
     reason underneath. Nothing is lost and View still works. */
  const endedByInvoice = new Map<string, MembershipRow>();
  for (const m of plans) {
    if (["active", "trialing", "past_due"].includes(m.status)) continue;
    if (m.stripe_subscription_id) endedByInvoice.set(m.stripe_subscription_id, m);
  }

  const entries: HistoryEntry[] = payments
    .map((p) => {
      const ended = p.subscriptionId ? endedByInvoice.get(p.subscriptionId) : undefined;
      const reason =
        ended?.cancel_reason && (REASON_LABEL[ended.cancel_reason] ?? ended.cancel_reason);

      return {
        key: p.id,
        at: p.paidAt,
        title: p.description,
        subtitle: p.subscriptionInvoice ? "Membership" : "One-off purchase",
        amount: p.amount,
        amountNote: card ? `Card •••• ${card.last4}` : null,
        badge: ended
          ? { text: ended.cancelled_at ? "Cancelled" : "Ended", tone: "off" }
          : paymentBadge(p),
        note: ended
          ? `${ended.cancelled_at ? "Cancelled" : "Ended"} ${whenShort(ended.cancelled_at ?? ended.current_period_end) ?? ""}${
              reason ? ` · ${reason}` : ""
            }`
          : null,
        url: p.url ?? "",
      };
    })
    .filter((e): e is HistoryEntry => typeof e.url === "string" && e.url.length > 0)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  const [latest, ...older] = entries;

  return (
    <main className="fdu">
      {justCancelled && (
        <div className="fdu-banner">
          <strong>Your membership has ended.</strong> Anything you bought outright is still on your
          account, every draft you have made is still in your history, and you can join a plan
          again whenever you like.
        </div>
      )}

      <header className="page-head">
        <h1>Plan &amp; Usage</h1>
        <p>Your plan, credits, billing and usage at a glance.</p>
      </header>

      <section className="overview" aria-label="Account overview">
        {/* ── credits ────────────────────────────────────────────────────── */}
        <article className="overview-section credits-section">
          <div className="section-label">Credits</div>
          <div className="credit-balance-row">
            <div className="credit-coin" aria-label={`${meter.balance} credits available`}>
              <div className="coin-inner">
                <strong>{meter.balance}</strong>
                <span>{meter.balance === 1 ? "credit" : "credits"}</span>
              </div>
            </div>
            <div className="credit-info">
              <h2 className="credit-title">Available credits</h2>
              <p className="credit-copy">{creditsNote}</p>
            </div>
          </div>
        </article>

        {/* ── current plan ───────────────────────────────────────────────── */}
        <article className="overview-section plan-section">
          <div className="section-label">Current plan</div>
          <div className="overview-summary plan-summary">
            <div className="plan-top">
              <div className="plan-name">{planLabel}</div>
              {plan ? (
                <div className={cancelling ? "status ending" : "status"}>
                  <i />
                  {cancelling ? "Ending" : pastDue ? "Payment due" : "Active"}
                </div>
              ) : (
                wallet.inTrial && (
                  <div className="status">
                    <i />
                    Trial
                  </div>
                )
              )}
            </div>
            <div className="price">
              {plan ? (
                <>
                  <strong>{sgd(plan.amountCents)}</strong> / month
                </>
              ) : (
                <>Pay only for what you draft</>
              )}
            </div>
          </div>

          <div className="rule" />

          <div className="simple-row">
            <span>{cancelling ? "Ends" : plan ? "Renews" : wallet.inTrial ? "Trial ends" : "Credits"}</span>
            <strong>
              {plan
                ? (whenShort(periodEnd) ?? "—")
                : wallet.inTrial && wallet.trialEndsAt
                  ? whenShort(wallet.trialEndsAt)
                  : "Never expire"}
            </strong>
          </div>

          {/* The button suggests a direction, never a named plan or a price —
              the pricing page is where a plan is chosen, and a label like
              "Move to Pro" decides for somebody before they have looked. */}
          <div className="action-row">
            <Link
              className="u-btn primary"
              href={plan ? "/billing#memberships" : "/billing"}
            >
              {plan ? "Upgrade my plan" : "Explore our plans"}
            </Link>
            <Link className="u-btn" href="/billing">
              View pricing
            </Link>
          </div>

          {plan && !cancelling ? (
            <CancelPlan planLabel={planLabel} purchasedCredits={purchasedCredits} />
          ) : cancelling ? (
            <div className="cancelled-note">
              Your plan ends on {whenShort(periodEnd) ?? "the end of this period"}. You can keep
              using it until then.
            </div>
          ) : null}
        </article>

        {/* ── billing summary ────────────────────────────────────────────── */}
        <article className="overview-section billing-section">
          <div className="section-label">Billing summary</div>
          <div className="overview-summary billing-summary">
            <div className="billing-amount">{plan ? sgd(plan.amountCents) : "—"}</div>
            <div className="billing-caption">
              {plan ? (
                cancelling ? (
                  "No further payments"
                ) : (
                  `Next payment · ${whenShort(periodEnd) ?? "date to be set"}`
                )
              ) : (
                <>
                  You haven&rsquo;t subscribed to any of our plans yet. Want to{" "}
                  <Link href="/billing#memberships">start your first plan</Link>?
                </>
              )}
            </div>
          </div>

          <div className="rule" />

          {/* Only shown once there is a card. "None on file" told the customer
              nothing they wanted to know and put an empty value where the
              design has a fact. */}
          {card ? (
            <div className="simple-row">
              <span>Payment method</span>
              <strong>&bull;&bull;&bull;&bull; {card.last4}</strong>
            </div>
          ) : (
            <div className="simple-row" aria-hidden="true" />
          )}

          {/* Always here, as the design draws it. It opens Stripe's card form
              whether or not a card exists — the route makes the Stripe
              customer if there is not one yet, so there is always somewhere
              to add a card rather than a button that refuses. */}
          <UpdateCard />
        </article>
      </section>

      {/* ── usage this month ─────────────────────────────────────────────── */}
      <section className="usage" aria-label="Usage this month">
        <div className="usage-head">
          <h2>Usage this month</h2>
          <span>{meter.note}</span>
        </div>
        <div className="usage-main">
          <div className="usage-count">
            <strong>{drafts}</strong>
            <span>{drafts === 1 ? "draft created" : "drafts created"}</span>
          </div>
          <div className="usage-bar">
            <div className="track">
              <span style={{ width: `${percent ?? 0}%` }} />
            </div>
            <small>
              {meter.allowance
                ? `${meter.used} of ${meter.allowance} monthly credits used`
                : `${meter.used} used this month`}
              {meter.carriedOver > 0 && ` · ${meter.carriedOver} carried over`}
              {meter.resetsLabel && ` · ${meter.resetsLabel}`}
            </small>
          </div>
          <div className="usage-percent">
            <strong>{percent === null ? "—" : `${percent}%`}</strong>
            <span>{percent === null ? "no monthly allowance" : "allowance used"}</span>
          </div>
        </div>
      </section>

      {/* ── billing history ──────────────────────────────────────────────── */}
      <section className="billing-history" id="billing-history" aria-labelledby="billingHistoryTitle">
        <div className="billing-history-head">
          <div>
            <h2 id="billingHistoryTitle">Billing history</h2>
            <p>View past payments, invoices and receipts.</p>
          </div>
          <UpdateCard className="history-link" />
        </div>

        {entries.length === 0 ? (
          <div className="history-none">
            Nothing yet. Payments and plan changes will be listed here.
          </div>
        ) : (
          <div className="billing-history-list">
            <HistoryRow entry={latest} current />
            {older.length > 0 && (
              <details className="history-dropdown">
                <summary className="history-more-btn">
                  <span className="history-more-label">
                    View older invoices <span className="history-more-count">({older.length})</span>
                  </span>
                  <span className="chevron" aria-hidden="true">
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 4.25 6 7.5l3.5-3.25" />
                    </svg>
                  </span>
                </summary>
                <div className="billing-history-more">
                  {older.map((e) => (
                    <HistoryRow key={e.key} entry={e} />
                  ))}
                </div>
              </details>
            )}
            <div className="billing-history-foot" />
          </div>
        )}
      </section>

      {error && <p className="note note-warn">Could not load usage. Has 001_schema.sql been run?</p>}

      {/* ── FD's own numbers ─────────────────────────────────────────────────
          Model costs, the paid-model benchmark and the margin working are
          commercially sensitive: they tell a customer what a draft costs us
          and therefore what the mark-up is. Only an administrator sees them. */}
      {admin && (
        <section style={{ marginTop: 34 }}>
          <p className="kicker" style={{ marginBottom: 12 }}>
            Admin · {monthLabel} · {user?.email}
          </p>

          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              margin: 0,
            }}
          >
            <Stat label="Drafts" value={drafts.toLocaleString()} hint="this month" />
            <Stat
              label="Tokens"
              value={`${(inputTokens + outputTokens).toLocaleString()}`}
              hint={`${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`}
            />
            <Stat label="Actual spend" value={money(actual)} hint="what you have paid" />
            <Stat
              label="On a paid model"
              value={money(benchmark)}
              hint={`${money(perDraft)} per draft`}
            />
          </dl>

          <section className="card" style={{ marginTop: 24, padding: 22 }}>
            <p className="kicker">The number pricing is built on</p>
            <p style={{ marginTop: 10, fontSize: 14.5, lineHeight: 1.7, color: "var(--grey-5)" }}>
              {drafts === 0 ? (
                <>Generate a few drafts and this becomes the margin calculation for pricing.</>
              ) : (
                <>
                  A draft costs about <strong>{money(perDraft)}</strong> on a{" "}
                  {PAID_BENCHMARK.label.toLowerCase()}. At $1–3 per draft, or inside a
                  subscription, that is a gross margin of roughly{" "}
                  <strong>{perDraft > 0 ? Math.round(1 / perDraft) : 0}×</strong> at $1 per
                  draft. Take it as an order of magnitude, not a quotation — token counts vary
                  with the length of the source document.
                </>
              )}
            </p>
          </section>

          {byModel.size > 0 && (
            <section style={{ marginTop: 28 }}>
              <p className="kicker" style={{ marginBottom: 10 }}>By model</p>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{ width: "100%", minWidth: 420, fontSize: 13.5, borderCollapse: "collapse" }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--grey-2)", textAlign: "left" }}>
                      {["Model", "Drafts", "Paid-model cost", "Per draft"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 0",
                            fontSize: 10.5,
                            fontWeight: 600,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "var(--grey-4)",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...byModel.entries()].map(([key, v]) => (
                      <tr key={key} style={{ borderBottom: "1px solid var(--grey-2)" }}>
                        <td style={{ padding: "9px 0" }}>{key}</td>
                        <td style={{ padding: "9px 0" }}>{v.drafts}</td>
                        <td style={{ padding: "9px 0" }}>{money(v.benchmark)}</td>
                        <td style={{ padding: "9px 0" }}>{money(v.benchmark / v.drafts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p style={{ marginTop: 24, fontSize: 12, color: "var(--grey-4)" }}>
            Prices are planning estimates from src/lib/ai/pricing.ts. Check the provider&apos;s
            pricing page before quoting a figure to anyone.
          </p>
        </section>
      )}
    </main>
  );
}
