import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getWallet } from "@/lib/billing/credits";
import { isStripeConfigured, stripeMode } from "@/lib/billing/stripe";
import { pricedCatalogue } from "@/lib/billing/prices";
import { recentInvoices, type InvoiceRow } from "@/lib/billing/invoices";
import { TRIAL, perCredit, money } from "@/lib/billing/plans";
import BuyButton from "./BuyButtons";
import PricingMotion from "./PricingMotion";
import "./pricing.css";
/* Loaded after, deliberately: it overrides the generated stylesheet. */
import "./pricing-brand.css";

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
  let stripeCustomerId: string | null = null;

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
  const isMember = Boolean(tier);
  const isUnlimited = tier === "unlimited";
  const trialLive = Boolean(wallet.inTrial && wallet.trialEndsAt);

  return (
    <main className="fdp">
      {/* Decorative only; it adds no content and does nothing without JS. */}
      <div className="scroll-progress" aria-hidden="true" />
      <PricingMotion />

      <div className="page">
        {/* ── the account line ─────────────────────────────────────────────
            OUTSIDE the designed card, deliberately. The design is a pricing
            page and has no place in it for a signed-in person's balance; an
            earlier version of this file put one there by rewriting the hero,
            which replaced the firm's own marketing copy with an account
            readout. This sits above the card instead, so the design below is
            exactly the file the designer sent. The full picture is on /usage. */}
        {isMember || wallet.credits > 0 || trialLive ? (
          <p className="account-line">
            <span>
              <strong>
                {wallet.credits} document{wallet.credits === 1 ? "" : "s"}
              </strong>{" "}
              in your account
            </span>
            {isMember && (
              <span>
                <strong style={{ textTransform: "capitalize" }}>{tier}</strong> member
                {membership!.status === "past_due" && " — payment needs attention"}
              </span>
            )}
            {isUnlimited && membership!.unlimited_cap > 0 && (
              <span>
                {membership!.unlimited_used} of {membership!.unlimited_cap} drafted this month
              </span>
            )}
            {membership?.period_end && <span>Renews {when(membership.period_end)}</span>}
            {trialLive && <span>Trial ends {when(wallet.trialEndsAt!)}</span>}
            <Link href="/usage">Your usage</Link>
          </p>
        ) : null}

        {/* ── the hero, as designed ─────────────────────────────────────────
            Copied from the design file unchanged. Only the two buttons differ:
            the design scrolled with inline onclick handlers, which React does
            not take, so they are anchors to the same two sections. */}
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">FD AI pricing</div>
            <h1>Simple pricing for every stage of use.</h1>
            <p>
              Start with a free trial, buy credits when you need them, or choose a monthly
              membership for more regular use.
            </p>
            <div className="hero-actions">
              <a className="btn-primary" href="#pricing">
                View pricing
              </a>
              <a className="btn-secondary" href="#compare">
                Help me choose
              </a>
            </div>
            <div className="hero-meta">
              <span>
                <i />
                No card required
              </span>
              <span>
                <i />
                Purchased credits do not expire
              </span>
              <span>
                <i />
                Cancel anytime
              </span>
            </div>
            <div className="quick-nav">
              <a href="#trial">Free trial</a>
              <a href="#payg">Flexible credits</a>
              <a href="#membership">Monthly memberships</a>
              <a href="#topups">Exclusive top-ups</a>
            </div>
          </div>

          <aside className="hero-side">
            <div className="side-label">Recommended</div>
            <div className="rec-card">
              <h2>Pro Membership</h2>
              <div className="rec-price">
                <strong>S$49.80</strong>
                <span>/ month</span>
              </div>
              <div className="rec-credit">10 credits each month</div>
              <div className="rec-copy">
                Best for regular users who want a lower effective rate and the flexibility to top up
                when needed.
              </div>
              <div className="rec-points">
                <div>
                  <b>✓</b>
                  <span>S$4.98 per included credit</span>
                </div>
                <div>
                  <b>✓</b>
                  <span>Lower effective cost than pay-as-you-go</span>
                </div>
                <div>
                  <b>✓</b>
                  <span>Access to exclusive member top-up rates</span>
                </div>
              </div>
              <a className="rec-link" href="#membership">
                See membership plans
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
            {/* Only an administrator ever sees a wrong currency here, because the
                checkout route refuses to charge one — but it has to be visible
                somewhere, and this is the page the prices are read from. */}
            {catalogue.anyWrongCurrency && (
              <div className="recommended-bar" style={{ borderColor: "#b42318" }}>
                <div>
                  <strong>A price in Stripe is not in Singapore dollars.</strong>
                  <span>
                    FD AI sells in SGD and every figure here is written S$. The affected items are
                    marked below and cannot be bought until they are re-created in SGD — nobody can
                    be charged in the wrong currency in the meantime.
                  </span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── the trial ─────────────────────────────────────────────────────
            From the design, which our page had dropped — which is also why the
            hero's "Free trial" button pointed at an id that did not exist and
            did nothing when pressed. The figures come from the price list
            rather than being written into the copy, so changing the trial in
            one place changes it here too. The box on the right is the one
            departure: the design shows a "Start free trial" button, and
            everybody reading this page is signed in and already has theirs, so
            it says where they actually stand. */}
        <section className="section" id="trial">
          <div className="section-head">
            <div className="kicker">Start here</div>
            <h2>Try FD AI first</h2>
            <p>A simple way to explore FD AI before paying.</p>
          </div>

          <div className="trial-section-card">
            <div className="trial-main">
              <h3>Your first {TRIAL.credits} documents are free.</h3>
              <p>
                Use them over {TRIAL.days} days, then continue with pay-as-you-go documents or a
                monthly membership if FD AI suits your work.
              </p>
              <div className="trial-stats">
                <div className="trial-stat">
                  <small>Included</small>
                  <strong>{TRIAL.credits} documents</strong>
                </div>
                <div className="trial-stat">
                  <small>Access period</small>
                  <strong>{TRIAL.days} days</strong>
                </div>
                <div className="trial-stat">
                  <small>Payment</small>
                  <strong>No card required</strong>
                </div>
              </div>
            </div>

            <div className="trial-box">
              <strong>{trialLive ? "Your trial is running" : "Best for first-time users"}</strong>
              <p>
                {trialLive ? (
                  <>
                    It ends on <strong>{when(wallet.trialEndsAt!)}</strong>. Unused trial documents
                    stop then; anything you buy is yours for good.
                  </>
                ) : (
                  <>
                    Test the experience first, then decide whether occasional documents or a regular
                    membership makes more sense.
                  </>
                )}
              </p>
              <Link
                href="/draft"
                className="btn-primary"
                style={{
                  marginTop: 18,
                  height: 44,
                  borderRadius: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Start a draft
              </Link>
              <div className="trial-note">
                Unused trial documents expire after {TRIAL.days} days.
              </div>
            </div>
          </div>
        </section>

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
          /* `pricing` is the id the hero's "View pricing" button points at. In
             the design it is the section that opens the price list; here it
             wraps all three blocks, because our order puts memberships first. */
          <div id="pricing">
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
          </div>
        )}

        {/* ── what you have been charged ─────────────────────────────────
            Stripe's own portal shows this as "$88.80" with the real currency
            in grey underneath and a download icon the size of a full stop.
            None of that is configurable. So the same invoices are read through
            the API and written out here in FD's own type: S$18.80, and a
            download that says Download. */}
        {invoices.length > 0 && (
          <section className="section" id="invoices">
            <div className="section-head">
              <div className="kicker">Your account</div>
              <h2>Billing history</h2>
              <p>
                Every charge, in Singapore dollars. Receipts are issued by Stripe and are valid for
                your own accounts.
              </p>
            </div>

            <div className="topup-wrap" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#8a8378", fontSize: 11 }}>
                    <th style={{ padding: "8px 10px 8px 0" }}>Date</th>
                    <th style={{ padding: "8px 10px" }}>What</th>
                    <th style={{ padding: "8px 10px" }}>Amount</th>
                    <th style={{ padding: "8px 10px" }}>Status</th>
                    <th style={{ padding: "8px 0 8px 10px", textAlign: "right" }}>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} style={{ borderTop: "1px solid #efe7da" }}>
                      <td style={{ padding: "12px 10px 12px 0", whiteSpace: "nowrap" }}>
                        {inv.paidAt ? when(inv.paidAt) : "—"}
                      </td>
                      <td style={{ padding: "12px 10px" }}>{inv.description}</td>
                      <td style={{ padding: "12px 10px", fontWeight: 650, whiteSpace: "nowrap" }}>
                        {inv.amount}
                        {/* Only shown when Stripe charged in something other than
                            Singapore dollars — which should never happen, and is
                            worth seeing immediately if it does. */}
                        {inv.currency !== "sgd" && (
                          <span style={{ color: "#b42318", fontWeight: 500 }}>
                            {" "}
                            ({inv.currency.toUpperCase()})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "12px 10px" }}>
                        <span className={`tag ${inv.status === "paid" ? "gold" : ""}`}>
                          {inv.status === "paid" ? "Paid" : inv.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 0 12px 10px", textAlign: "right" }}>
                        {inv.pdfUrl ? (
                          <a
                            className="btn-secondary"
                            href={inv.pdfUrl}
                            /* Stripe serves the PDF from its own domain, so the
                               download attribute would be ignored; the link is
                               opened instead and the browser saves it. */
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 7,
                              padding: "8px 14px",
                              fontSize: 12,
                            }}
                          >
                            <span aria-hidden="true">↓</span> Download
                          </a>
                        ) : inv.hostedUrl ? (
                          <a href={inv.hostedUrl} target="_blank" rel="noreferrer">
                            View
                          </a>
                        ) : (
                          <span style={{ color: "#8a8378" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
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

        {/* ── the quick guide ───────────────────────────────────────────────
            Also from the design, also dropped, and also the reason a hero
            button — "Help me choose" — led nowhere. */}
        <section className="section" id="compare">
          <div className="section-head">
            <div className="kicker">Quick guide</div>
            <h2>Which option fits you?</h2>
            <p>Choose based on how often you expect to use FD AI.</p>
          </div>

          <div className="compare-grid">
            <article className="compare-card">
              <small>Occasional</small>
              <h3>Buy as you go</h3>
              <p>
                Best if you only use FD AI from time to time and want documents that do not expire.
              </p>
              <a href="#payg">View one-off prices</a>
            </article>

            <article className="compare-card">
              <small>Regular</small>
              <h3>Basic or Pro</h3>
              <p>Best if you draft every month and want a lower rate per document.</p>
              <a href="#membership">View memberships</a>
            </article>

            <article className="compare-card">
              <small>Heavy</small>
              <h3>Unlimited</h3>
              <p>Best if you draft heavily and prefer one predictable monthly price.</p>
              <a href="#membership">View Unlimited</a>
            </article>
          </div>
        </section>

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
