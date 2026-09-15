import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getWallet } from "@/lib/billing/credits";
import { isStripeConfigured, stripeMode } from "@/lib/billing/stripe";
import { pricedCatalogue } from "@/lib/billing/prices";
import { TRIAL, perCredit, money } from "@/lib/billing/plans";
import BuyButton from "./BuyButtons";
import PricingMotion from "./PricingMotion";
import "./pricing.css";

export const metadata = { title: "Pricing — FD AI" };
export const dynamic = "force-dynamic";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

interface GrantRow {
  credits: number;
  remaining: number;
  source: string;
  expires_at: string | null;
  created_at: string;
}

const SOURCE_LABEL: Record<string, string> = {
  trial: "Free trial",
  purchase: "Bundle",
  membership: "Membership",
  topup: "Member top-up",
  gift: "Added by Founders Doc",
  refund_reversal: "Refund",
};

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
  const mode = stripeMode();
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
  let history: GrantRow[] = [];

  try {
    const supabase = await createClient();
    const [summary, grants] = await Promise.all([
      supabase.rpc("billing_summary"),
      supabase
        .from("credit_grants")
        .select("credits,remaining,source,expires_at,created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
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
    history = (grants.data as GrantRow[] | null) ?? [];
  } catch {
    // The page still works without these; it just shows less.
  }

  const tier = membership?.tier ?? null;
  const isMember = Boolean(tier);
  const isUnlimited = tier === "unlimited";
  const trialLive = Boolean(wallet.inTrial && wallet.trialEndsAt);

  return (
    <main className="fdp">
      {/* Decorative only; it adds no content and does nothing without JS. */}
      <div className="scroll-progress" aria-hidden="true" />
      <PricingMotion />

      <div className="page">
        {/* ── what this account actually has ─────────────────────────────── */}
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">Your account</div>
            <h1>
              {isUnlimited
                ? "Unlimited drafting is on."
                : `${wallet.credits} document${wallet.credits === 1 ? "" : "s"} ready to draft.`}
            </h1>
            <p>
              {isUnlimited ? (
                <>
                  Drafting does not spend credits on your plan.
                  {membership!.unlimited_cap > 0 && (
                    <>
                      {" "}You have drafted {membership!.unlimited_used} of{" "}
                      {membership!.unlimited_cap} documents this month under fair use.
                    </>
                  )}
                </>
              ) : trialLive ? (
                <>
                  Your {TRIAL.days}-day free trial runs until{" "}
                  <strong>{when(wallet.trialEndsAt!)}</strong>. Unused trial documents stop then —
                  bought ones never expire.
                </>
              ) : wallet.credits === 0 ? (
                <>
                  Buy documents or join a membership to draft again. Everything you have already
                  drafted stays in <Link href="/history">your history</Link>, readable and
                  downloadable.
                </>
              ) : isMember ? (
                <>
                  Unused documents carry over each month for as long as your membership lasts.
                  Anything you bought outright stays yours either way.
                </>
              ) : (
                <>One document drafts one agreement. These never expire.</>
              )}
            </p>

            <div className="hero-meta">
              {isMember && (
                <span>
                  <i />
                  <strong style={{ textTransform: "capitalize" }}>{tier}</strong>&nbsp;member
                  {membership!.status === "past_due" && " — payment needs attention"}
                </span>
              )}
              {membership?.period_end && (
                <span>
                  <i />
                  Renews {when(membership.period_end)}
                </span>
              )}
              <span>
                <i />
                Bought documents never expire
              </span>
            </div>

            <div className="quick-nav">
              <a href="#payg">Buy as you go</a>
              <a href="#membership">Memberships</a>
              {isMember && !isUnlimited && <a href="#topups">Member top-ups</a>}
              <a href="#history">Your history</a>
            </div>
          </div>

          <aside className="hero-side">
            <div className="side-label">{isMember ? "Your plan" : "Recommended"}</div>
            <div className="rec-card">
              <h2>{isUnlimited ? "Unlimited" : isMember ? "Your membership" : "Pro Membership"}</h2>
              <div className="rec-price">
                <strong>{isUnlimited ? money(8880) : wallet.credits}</strong>
                <span>{isUnlimited ? "/ month" : "documents left"}</span>
              </div>
              <div className="rec-credit">
                {isUnlimited
                  ? `Fair use: ${membership!.unlimited_used} of ${membership!.unlimited_cap} used`
                  : isMember
                    ? "Carried over while you stay a member"
                    : "10 documents a month for S$49.80"}
              </div>
              <div className="rec-copy">
                {isMember
                  ? "Members pay less per document and can top up at member rates when a month runs short."
                  : "Members pay less per document, get a monthly allowance that carries over, and can top up at member-only rates."}
              </div>
              <div className="rec-points">
                <div>
                  <b>✓</b>
                  <span>Reading and downloading past drafts is always free</span>
                </div>
                <div>
                  <b>✓</b>
                  <span>Bought documents never expire</span>
                </div>
                <div>
                  <b>✓</b>
                  <span>Cancel a membership at any time</span>
                </div>
              </div>
              <a className="rec-link" href={isMember ? "#topups" : "#membership"}>
                {isMember ? "Top up your account" : "See membership plans"}
              </a>
            </div>
          </aside>
        </section>

        {/* ── notices ────────────────────────────────────────────────────── */}
        {(joined || paid || cancelled || resumed || changed || mode === "test" || mode === "live" || catalogue.anyMissing) && (
          <section className="section" style={{ paddingTop: 34 }}>
            {resumed && (
              <div className="recommended-bar">
                <div>
                  <strong>Your membership is back on.</strong>
                  <span>
                    The cancellation is withdrawn and nothing was charged &mdash; you keep the
                    period you had already paid for.
                  </span>
                </div>
              </div>
            )}
            {changed && (
              <div className="recommended-bar">
                <div>
                  <strong>Plan changed.</strong>
                  <span>
                    Stripe has adjusted your next invoice for the part-month, so you are not
                    charged twice for the same days.
                  </span>
                </div>
              </div>
            )}
            {joined && (
              <div className="recommended-bar">
                <div>
                  <strong>Welcome to FD AI.</strong>
                  <span>
                    Your membership is active. This month&rsquo;s documents land on your account
                    within a few seconds — reload if the number above has not moved yet.
                  </span>
                </div>
              </div>
            )}
            {paid && (
              <div className="recommended-bar">
                <div>
                  <strong>Payment received.</strong>
                  <span>
                    Your documents appear within a few seconds. Stripe tells us directly, so reload
                    in a moment if the number has not moved.
                  </span>
                </div>
              </div>
            )}
            {cancelled && (
              <div className="recommended-bar">
                <div>
                  <strong>Checkout cancelled.</strong>
                  <span>Nothing was charged.</span>
                </div>
              </div>
            )}
            {mode === "test" && isStripeConfigured() && (
              <div className="recommended-bar">
                <div>
                  <strong>Test mode — no money moves.</strong>
                  <span>
                    Use card 4242 4242 4242 4242, any future expiry, any CVC.
                  </span>
                </div>
              </div>
            )}
            {mode === "live" && (
              <div className="recommended-bar" style={{ borderColor: "#c2410c" }}>
                <div>
                  <strong>Live mode — real cards will be charged.</strong>
                  <span>Check the prices below are the ones you intend before anyone uses this.</span>
                </div>
              </div>
            )}
            {catalogue.anyMissing && (
              <div className="recommended-bar" style={{ borderColor: "#c2410c" }}>
                <div>
                  <strong>Some products do not exist in Stripe yet.</strong>
                  <span>
                    Run scripts/create-stripe-products.mjs against this Stripe account. Until then
                    those buttons will not work.
                  </span>
                </div>
              </div>
            )}
          </section>
        )}

        {!isStripeConfigured() ? (
          <section className="section">
            <div className="recommended-bar">
              <div>
                <strong>Payments are not switched on yet.</strong>
                <span>Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable this page.</span>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* ── memberships ────────────────────────────────────────────── */}
            <section className="section" id="membership">
              <div className="section-head">
                <div className="kicker">Option one</div>
                <h2>Monthly memberships</h2>
                <p>
                  For regular use. A monthly allowance at a lower rate per document, and it carries
                  over for as long as you stay a member.
                </p>
              </div>

              <div className="card-grid membership-grid">
                {catalogue.memberships.map((m) => {
                  const current = m.tier === tier;
                  const featured = m.tier === "pro";
                  return (
                    <article
                      key={m.lookupKey}
                      className={`card${featured ? " featured" : ""}`}
                    >
                      <div className={`tag${featured ? " gold" : ""}`}>
                        {current ? "Your plan" : featured ? "Recommended" : m.bestFor}
                      </div>
                      <div className="plan-title">{m.label}</div>
                      <div className="plan-price">
                        <strong>{m.price}</strong>
                        <span>/ month</span>
                      </div>
                      <div className="plan-credit">
                        {m.monthlyCredits
                          ? `${m.monthlyCredits} documents each month`
                          : "Unlimited usage*"}
                      </div>
                      <div className="plan-rate">
                        {m.monthlyCredits
                          ? `${money(Math.round(m.amountCents / m.monthlyCredits))} per included document`
                          : "Fixed monthly price, fair-use terms apply"}
                      </div>
                      <div className="divider" />
                      <div className="points">
                        <div>
                          <b>✓</b>
                          <span>{m.bestFor}</span>
                        </div>
                        <div>
                          <b>✓</b>
                          <span>
                            {m.monthlyCredits
                              ? "Unused documents carry over while you remain a member"
                              : "No credits to keep track of"}
                          </span>
                        </div>
                        <div>
                          <b>✓</b>
                          <span>
                            {m.tier === "unlimited"
                              ? "Fair-use terms apply"
                              : "Access to member top-up rates"}
                          </span>
                        </div>
                      </div>
                      <BuyButton
                        item={m}
                        isCurrent={current}
                        label={isMember ? "Change plan" : `Choose ${m.label}`}
                      />
                    </article>
                  );
                })}
              </div>
            </section>

            {/* ── pay as you go ──────────────────────────────────────────── */}
            <section className="section" id="payg">
              <div className="section-head">
                <div className="kicker">Option two</div>
                <h2>Buy as you go</h2>
                <p>For occasional use. No commitment, and these never expire.</p>
              </div>

              <div className="card-grid payg-grid">
                {catalogue.packs.map((p, i) => {
                  const featured = i === 1;
                  const saving = p.credits * 880 - p.amountCents;
                  return (
                    <article key={p.lookupKey} className={`card${featured ? " featured" : ""}`}>
                      <div className={`tag${featured ? " gold" : ""}`}>
                        {featured ? "Most popular" : i === 2 ? "Best rate" : "One-off"}
                      </div>
                      <div className="plan-title">{p.label}</div>
                      <div className="plan-price">
                        <strong>{p.price}</strong>
                      </div>
                      <div className="plan-credit">
                        {p.credits} document{p.credits === 1 ? "" : "s"}
                      </div>
                      <div className="plan-rate">{perCredit(p)} per document</div>
                      <div className="divider" />
                      <div className="points">
                        <div>
                          <b>✓</b>
                          <span>No expiry</span>
                        </div>
                        <div>
                          <b>✓</b>
                          <span>{p.blurb}</span>
                        </div>
                      </div>
                      <div className="saving">
                        {saving > 0 ? `Save ${money(saving)} against single documents` : ""}
                      </div>
                      <BuyButton item={p} label="Buy" />
                    </article>
                  );
                })}
              </div>
            </section>

            {/* ── top-ups, members only ──────────────────────────────────── */}
            {isMember && !isUnlimited && (
              <section className="section" id="topups">
                <div className="section-head">
                  <div className="kicker">Members only</div>
                  <h2>Your top-up rates</h2>
                  <p>
                    For when this month&rsquo;s allowance runs out before the next one arrives.
                    Cheaper than buying publicly, and they never expire.
                  </p>
                </div>

                <div className="topup-wrap">
                  <div className="topup-head-inline">
                    <div>
                      <h3>Member pricing</h3>
                      <p>Top up without changing your plan.</p>
                    </div>
                    <div className="exclusive-pill">Exclusive access</div>
                  </div>

                  <div className="card-grid topup-grid">
                    {catalogue.topups.map((t, i) => (
                      <article
                        key={t.lookupKey}
                        className={`card topup-card topup-exclusive${i === 3 ? " featured" : ""}`}
                      >
                        <div className={`tag ${i === 3 ? "gold" : "exclusive"}`}>
                          {i === 3 ? "Best rate" : "Members only"}
                        </div>
                        <div className="plan-title">
                          {t.credits} document{t.credits === 1 ? "" : "s"}
                        </div>
                        <div className="plan-price">
                          <strong>{t.price}</strong>
                        </div>
                        <div className="plan-rate">{perCredit(t)} per document</div>
                        <BuyButton item={t} label="Top up" />
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ── history ────────────────────────────────────────────────────── */}
        {history.length > 0 && (
          <section className="section" id="history">
            <div className="section-head">
              <div className="kicker">Your account</div>
              <h2>Where your documents came from</h2>
            </div>

            <div className="topup-wrap" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#8a8378", fontSize: 11 }}>
                    <th style={{ padding: "8px 10px 8px 0" }}>Date</th>
                    <th style={{ padding: "8px 10px" }}>What</th>
                    <th style={{ padding: "8px 10px" }}>Documents</th>
                    <th style={{ padding: "8px 10px" }}>Left</th>
                    <th style={{ padding: "8px 0 8px 10px" }}>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((g, idx) => (
                    <tr key={idx} style={{ borderTop: "1px solid #efe7da" }}>
                      <td style={{ padding: "10px 10px 10px 0" }}>{when(g.created_at)}</td>
                      <td style={{ padding: "10px" }}>{SOURCE_LABEL[g.source] ?? g.source}</td>
                      <td style={{ padding: "10px" }}>{g.credits}</td>
                      <td style={{ padding: "10px" }}>{g.remaining}</td>
                      <td style={{ padding: "10px 0 10px 10px", color: "#8a8378" }}>
                        {g.expires_at ? when(g.expires_at) : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="footer-note">
          <span>
            Trial documents expire {TRIAL.days} days after you sign up. Bought documents do not
            expire. Membership documents carry over while your membership lasts.
          </span>
          <span>
            All prices in SGD. Unlimited usage is subject to fair-use terms. Card details are
            handled by Stripe and never reach Founders Doc.
          </span>
        </div>

        <p style={{ marginTop: 24, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn-secondary" href="/draft" style={{ display: "inline-flex", alignItems: "center", padding: "0 18px" }}>
            Back to drafting
          </Link>
          <Link className="btn-secondary" href="/history" style={{ display: "inline-flex", alignItems: "center", padding: "0 18px" }}>
            Past drafts
          </Link>
        </p>
      </div>
    </main>
  );
}
