import Link from "next/link";
import { PAID_BENCHMARK } from "@/lib/ai/pricing";
import { getWallet } from "@/lib/billing/credits";
/* `money` here is the page's own US-dollar formatter for model costs; the
   price list's is Singapore dollars. Two currencies, two names, no confusion. */
import {
  MEMBERSHIPS,
  PACKS,
  TOPUPS,
  TRIAL,
  membershipByTier,
  money as sgd,
} from "@/lib/billing/plans";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";

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
function cheapestFrom(
  options: { credits: number; amountCents: number }[],
  documents: number,
): number {
  if (documents <= 0) return 0;

  /* Buy as many of the best-value size as fit, then the smallest single item
     that covers what is left. Documents cannot be bought by the half, and the
     leftover is where the per-document price gets worse — which is the whole
     reason a membership can win. */
  const byValue = [...options].sort((a, b) => a.amountCents / a.credits - b.amountCents / b.credits);
  const bySize = [...options].sort((a, b) => a.amountCents - b.amountCents);
  const best = byValue[0];

  const whole = Math.floor(documents / best.credits);
  let cost = whole * best.amountCents;
  let left = documents - whole * best.credits;

  while (left > 0) {
    const fit = bySize.find((o) => o.credits >= left) ?? best;
    cost += fit.amountCents;
    left -= fit.credits;
  }
  return cost;
}

/**
 * What this month's drafting actually costs on the arrangement they are on.
 *
 * For somebody with no membership that is bundles at the best rate. For a
 * member it is the monthly fee PLUS the member top-ups they have to buy once
 * the allowance runs out — which is the number an earlier version of this
 * missed, and missing it made the whole feature dead: it compared a member's
 * fee against a dearer tier's fee, which a dearer tier can never beat, so no
 * member was ever shown anything.
 */
function costThisMonth(tier: string | null, documents: number): number {
  const plan = tier ? membershipByTier(tier) : null;
  if (!plan) return cheapestFrom(PACKS, documents);
  if (plan.monthlyCredits === null) return plan.amountCents; // Unlimited
  const overflow = Math.max(0, documents - plan.monthlyCredits);
  return plan.amountCents + cheapestFrom(TOPUPS, overflow);
}

interface Suggestion {
  label: string;
  reason: string;
  href: string;
}

/**
 * A way up the ladder, or nothing.
 *
 * ── WHY THIS IS ARITHMETIC AND NOT MARKETING ────────────────────────────────
 * "Upgrade to Pro!" on the page of somebody who drafts once a quarter is a
 * lie dressed as a suggestion, and the firm selling it is a law firm. Nothing
 * is recommended unless the sums say this person would pay LESS for the
 * documents they are actually using, and the saving is stated so the claim can
 * be checked against the price list.
 */
function suggest(tier: string | null, usedThisMonth: number): Suggestion | null {
  // One or two drafts is not a pattern. Nothing is said until there is one.
  if (usedThisMonth < 2) return null;

  const current = tier ? membershipByTier(tier) : null;
  if (current?.monthlyCredits === null) return null; // Unlimited: nothing above it

  const nowCosts = costThisMonth(tier, usedThisMonth);

  /* A candidate has to do two things: cover this much drafting without
     top-ups, and cost less than the present arrangement actually costs. */
  const better = MEMBERSHIPS.filter((m) => {
    if (current && m.amountCents <= current.amountCents) return false;
    const covers = m.monthlyCredits === null || m.monthlyCredits >= usedThisMonth;
    return covers && m.amountCents < nowCosts;
  }).sort((a, b) => a.amountCents - b.amountCents)[0];

  if (!better) return null;

  const saving = nowCosts - better.amountCents;
  const docs = `${usedThisMonth} document${usedThisMonth === 1 ? "" : "s"}`;

  return {
    label: `Move to ${better.label}`,
    reason: current
      ? `You have drafted ${docs} this month. On ${current.label} that is about ` +
        `${sgd(nowCosts)} once top-ups are counted; ${better.label} covers it for ` +
        `${sgd(better.amountCents)} — ${sgd(saving)} less at this rate.`
      : `You have drafted ${docs} this month. Bought as bundles that is about ` +
        `${sgd(nowCosts)}; ${better.label} covers it for ${sgd(better.amountCents)} a month, ` +
        `and unused documents carry over.`,
    href: "/billing",
  };
}

/**
 * The plan, the balance, and — only when the arithmetic earns it — a way up.
 *
 * This sits above everything else on the page because it answers the two
 * questions somebody opens /usage to ask: what am I on, and how much have I
 * got left. The cost tables below are interesting; this is the point.
 */
function PlanCard({
  planLabel,
  planPrice,
  renews,
  credits,
  creditsNote,
  suggestion,
  isMember,
}: {
  planLabel: string;
  planPrice: string | null;
  renews: string | null;
  credits: number;
  creditsNote: string;
  suggestion: Suggestion | null;
  isMember: boolean;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--grey-2)",
        borderRadius: 16,
        background: "var(--white)",
        padding: "20px 22px",
        marginBottom: 16,
        display: "grid",
        gap: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        alignItems: "start",
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--grey-4)",
          }}
        >
          Your plan
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {planLabel}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--grey-5)" }}>
          {planPrice ? `${planPrice} a month` : "No monthly fee"}
          {renews ? ` · ${renews}` : ""}
        </p>
      </div>

      <div>
        <p
          style={{
            margin: 0,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--grey-4)",
          }}
        >
          Documents left
        </p>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 22,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {credits}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--grey-5)" }}>{creditsNote}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {suggestion ? (
          <>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--grey-5)" }}>
              {suggestion.reason}
            </p>
            <Link
              href={suggestion.href}
              className="btn btn-gold"
              style={{ justifyContent: "center", height: 40 }}
            >
              {suggestion.label}
            </Link>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--grey-5)" }}>
              {isMember
                ? "Your plan fits how much you are drafting. Nothing to change."
                : "Buy documents as you need them, or join a membership for a lower rate."}
            </p>
            <Link
              href="/billing"
              className="btn"
              style={{ justifyContent: "center", height: 40 }}
            >
              {isMember ? "Manage membership" : "See plans"}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * How much of this month's allowance has been used.
 *
 * ── WHY A PERCENTAGE OF THE MONTH, AND NOT OF THE BALANCE ───────────────────
 * This used to measure the balance against itself. Credits roll over, so a Pro
 * member holding 470 of them against a 10-a-month allowance produced the
 * meaningless line "100% of your documents remaining — 470 of 470": a full bar
 * that said nothing, on a page whose entire job is to say how much has been
 * used.
 *
 * The denominator is now the ALLOWANCE for the month — three on Basic, ten on
 * Pro, the fair-use ceiling on Unlimited, the trial's own grant on a trial —
 * and the figure is what has been SPENT against it. That is a percentage with
 * a real meaning, it moves when somebody drafts, and it cannot exceed 100%.
 *
 * Carried-over credits are not hidden; they are stated underneath in words,
 * where a number that would break the bar cannot break it.
 *
 * Somebody who only ever buys bundles has no month and no allowance, so they
 * get no percentage at all — inventing a denominator for them would invent a
 * limit that does not exist.
 */
function Meter({
  used,
  allowance,
  resetsLabel,
  note,
  carriedOver,
  balance,
}: {
  /** Documents drafted in the current period. */
  used: number;
  /** The period's allowance. Null when this account has no monthly allowance. */
  allowance: number | null;
  resetsLabel: string | null;
  note: string;
  /** Credits held beyond this month's allowance, if any. */
  carriedOver: number;
  balance: number;
}) {
  const pct =
    allowance && allowance > 0
      ? Math.max(0, Math.min(100, Math.round((used / allowance) * 100)))
      : null;

  return (
    <section
      style={{
        border: "1px solid var(--grey-2)",
        borderRadius: 16,
        background: "var(--white)",
        padding: "18px 20px",
        maxWidth: 420,
        marginBottom: 28,
      }}
    >
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
        {pct === null
          ? `${balance} document${balance === 1 ? "" : "s"} available`
          : `${pct}% of this month's allowance used`}
      </p>

      {pct !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <span
            style={{
              flex: 1,
              height: 7,
              borderRadius: 999,
              background: "var(--grey-1, #eee)",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                width: `${pct}%`,
                height: "100%",
                borderRadius: 999,
                background: "var(--ink, #171612)",
              }}
            />
          </span>
        </div>
      )}

      <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--grey-5)" }}>
        {resetsLabel ? `${resetsLabel} · ${note}` : note}
      </p>

      {carriedOver > 0 && (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--grey-5)" }}>
          Plus {carriedOver} carried over from earlier months, which this bar does not count.
        </p>
      )}

      <Link
        href="/billing"
        className="btn"
        style={{
          marginTop: 16,
          width: "100%",
          height: 42,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ink, #171612)",
          color: "#fff",
          borderColor: "var(--ink, #171612)",
          borderRadius: 10,
          fontWeight: 600,
        }}
      >
        Add credits
      </Link>
    </section>
  );
}

export default async function UsagePage() {
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
  let periodEnd: string | null = null;
  let unlimitedCap = 0;
  let unlimitedUsed = 0;
  let spentThisPeriod = 0;

  try {
    const { data } = await supabase.rpc("billing_summary");
    const row = Array.isArray(data) ? data[0] : data;
    tierFromSummary = row?.tier ? String(row.tier) : null;
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

  return (
    <main className="wrap" style={{ paddingTop: 32 }}>
      <PlanCard
        planLabel={planLabel}
        planPrice={plan ? sgd(plan.amountCents) : null}
        renews={periodEnd ? `renews ${whenShort(periodEnd)}` : null}
        credits={Number.isFinite(wallet.credits) ? wallet.credits : 0}
        creditsNote={creditsNote}
        suggestion={suggest(currentTier, drafts)}
        isMember={Boolean(plan)}
      />

      <Meter {...meter} />

      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: "1px solid var(--grey-2)",
          paddingBottom: 20,
          marginBottom: 24,
        }}
      >
        <div>
          <p className="kicker">FD AI</p>
          <h1 style={{ fontSize: "clamp(26px, 3vw, 34px)", marginTop: 8 }}>Usage — {monthLabel}</h1>
          <p className="sub" style={{ marginTop: 6, fontSize: 14 }}>{user?.email}</p>
        </div>
        <Link className="btn btn-gold" href="/draft">
          New draft
        </Link>
      </header>

      {error && (
        <p className="note note-warn">Could not load usage. Has 001_schema.sql been run?</p>
      )}

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
              {PAID_BENCHMARK.label.toLowerCase()}. At $1–3 per draft, or inside a subscription,
              that is a gross margin of roughly{" "}
              <strong>{perDraft > 0 ? Math.round(1 / perDraft) : 0}×</strong> at $1 per draft. Take
              it as an order of magnitude, not a quotation — token counts vary with the length of
              the source document.
            </>
          )}
        </p>
      </section>

      {byModel.size > 0 && (
        <section style={{ marginTop: 28 }}>
          <p className="kicker" style={{ marginBottom: 10 }}>By model</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 420, fontSize: 13.5, borderCollapse: "collapse" }}>
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
        Prices are planning estimates from src/lib/ai/pricing.ts. Check the provider&apos;s pricing
        page before quoting a figure to anyone.
      </p>
    </main>
  );
}
