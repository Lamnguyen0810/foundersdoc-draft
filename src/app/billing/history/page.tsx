import Link from "next/link";
import { membershipByTier, money as sgd } from "@/lib/billing/plans";
import { paymentHistory, type PaymentRow } from "@/lib/billing/history";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import "../../usage/usage.css";

/**
 * Billing history — everything this account has ever subscribed to or paid for.
 *
 * ── WHY TWO SOURCES ─────────────────────────────────────────────────────────
 * Stripe knows what was charged. It does not know that a membership was
 * cancelled on the 16th because the customer said it was too expensive — that
 * lives in our own `subscriptions` table. So the page reads both: memberships
 * from the database, payments from Stripe, each as its own list.
 *
 * They are deliberately NOT merged into one stream. A membership and the
 * payments made under it are different kinds of fact — one is a relationship
 * with a beginning and an end, the other is money moving on a date — and
 * flattening them together produces a list where a row's meaning depends on
 * which columns happen to be filled in.
 *
 * ── VIEW ────────────────────────────────────────────────────────────────────
 * Every payment links to Stripe's own hosted page for that payment, in a new
 * tab: the invoice page where there is an invoice, the receipt where there is
 * not. We do not render a receipt ourselves. A receipt is a record of money,
 * and a second rendering of it is a second answer to a question that must only
 * have one.
 *
 * This is a working page, not a designed one — FD's designer has the visual
 * pass. It borrows /usage's stylesheet so it reads as a sibling meanwhile.
 */
export const metadata = { title: "Billing history — FD AI" };
export const dynamic = "force-dynamic";

interface MembershipRow {
  id: string;
  tier: string;
  status: string;
  started_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancel_note: string | null;
}

const REASON_LABEL: Record<string, string> = {
  too_expensive: "Too expensive",
  not_using: "Not drafting enough",
  missing_feature: "Missing something they needed",
  quality: "Not happy with the drafts",
  switching: "Using something else",
  temporary: "Pausing for now",
  other: "Another reason",
};

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The badge for a membership, in the customer's language rather than Stripe's. */
function membershipBadge(m: MembershipRow): { text: string; tone: string } {
  switch (m.status) {
    case "active":
    case "trialing":
      return { text: "Active", tone: "ok" };
    case "past_due":
      return { text: "Payment due", tone: "warn" };
    case "unpaid":
      return { text: "Unpaid", tone: "bad" };
    case "canceled":
      return m.cancelled_at
        ? { text: "Cancelled", tone: "off" }
        : { text: "Ended", tone: "off" };
    case "paused":
      return { text: "Paused", tone: "warn" };
    case "incomplete":
    case "incomplete_expired":
      return { text: "Never started", tone: "off" };
    default:
      return { text: m.status, tone: "off" };
  }
}

function paymentBadge(p: PaymentRow): { text: string; tone: string } {
  switch (p.status) {
    case "paid":
      return { text: "Paid", tone: "ok" };
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

export default async function BillingHistoryPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="fdu">
        <header className="page-head">
          <h1>Billing history</h1>
          <p>Sign-in is not configured, so there is no account to show history for.</p>
        </header>
      </main>
    );
  }

  const user = await getUser();
  const supabase = await createClient();

  let memberships: MembershipRow[] = [];
  let stripeCustomerId: string | null = null;

  try {
    const { data } = await supabase.rpc("membership_history");
    memberships = (data ?? []) as MembershipRow[];
  } catch {
    // Older database: 013_cancellation.sql has not been run yet.
  }

  try {
    const { data: account } = await supabase
      .from("billing_accounts")
      .select("stripe_customer_id")
      .maybeSingle();
    stripeCustomerId = (account?.stripe_customer_id as string | null) ?? null;
  } catch {
    // No account row yet — nobody has paid.
  }

  const payments = await paymentHistory(stripeCustomerId);

  return (
    <main className="fdu">
      <Link className="hist-back" href="/usage">
        &larr; Plan &amp; usage
      </Link>

      <header className="page-head">
        <h1>Billing history</h1>
        <p>
          Every plan and every payment on {user?.email ?? "this account"}. Nothing is removed when
          it ends.
        </p>
      </header>

      {/* ── memberships ──────────────────────────────────────────────────── */}
      <section className="hist" aria-label="Plans">
        <h2>Plans</h2>
        <p>Memberships you have had, including ones that ended.</p>

        {memberships.length === 0 ? (
          <div className="hist-none">
            You have never subscribed to a plan. Credits bought on their own are listed below.
          </div>
        ) : (
          <div className="hist-scroll">
            <table className="hist-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => {
                  const badge = membershipBadge(m);
                  const plan = membershipByTier(m.tier);
                  const live = ["active", "trialing", "past_due"].includes(m.status);
                  return (
                    <tr key={m.id}>
                      <td className="hist-what">
                        <strong style={{ textTransform: "capitalize" }}>
                          {plan?.label ?? m.tier} membership
                        </strong>
                        {m.cancel_reason && (
                          <small>
                            Reason given: {REASON_LABEL[m.cancel_reason] ?? m.cancel_reason}
                            {m.cancel_note ? ` — “${m.cancel_note}”` : ""}
                          </small>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${badge.tone}`}>
                          <i />
                          {badge.text}
                        </span>
                      </td>
                      <td className="when">{when(m.started_at)}</td>
                      <td className="when">
                        {live
                          ? `renews ${when(m.current_period_end)}`
                          : m.cancelled_at
                            ? when(m.cancelled_at)
                            : when(m.current_period_end)}
                      </td>
                      <td className="num">{plan ? `${sgd(plan.amountCents)} / mo` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── payments ─────────────────────────────────────────────────────── */}
      <section className="hist" aria-label="Payments">
        <h2>Payments</h2>
        <p>
          Membership charges and one-off credit purchases. View opens the invoice or receipt on
          Stripe, where it can be downloaded.
        </p>

        {payments.length === 0 ? (
          <div className="hist-none">No payments yet.</div>
        ) : (
          <div className="hist-scroll">
            <table className="hist-table">
              <thead>
                <tr>
                  <th>What</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const badge = paymentBadge(p);
                  return (
                    <tr key={p.id}>
                      <td className="hist-what">
                        <strong>{p.description}</strong>
                        <small>{p.subscriptionInvoice ? "Membership" : "One-off purchase"}</small>
                      </td>
                      <td>
                        <span className={`pill ${badge.tone}`}>
                          <i />
                          {badge.text}
                        </span>
                        {p.refunded && (
                          <small style={{ display: "block", marginTop: 4, color: "var(--u-muted)" }}>
                            {p.refunded} returned
                          </small>
                        )}
                      </td>
                      <td className="when">{when(p.paidAt)}</td>
                      <td className="num">{p.amount}</td>
                      <td>
                        {p.url ? (
                          <a
                            className="hist-view"
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View
                          </a>
                        ) : (
                          <span className="when">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
