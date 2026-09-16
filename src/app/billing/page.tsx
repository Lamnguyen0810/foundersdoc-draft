import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getWallet } from "@/lib/billing/credits";
import { pricedCatalogue } from "@/lib/billing/prices";
import { recentInvoices, type InvoiceRow } from "@/lib/billing/invoices";
import { TRIAL, money } from "@/lib/billing/plans";
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

  const notices = joined || paid || cancelled || resumed || changed;
  const savings = (credits: number, cents: number) =>
    money(credits * catalogue.packs[0].amountCents - cents);

  return (
    <main className="fdp">
      <PricingMotion />

      {/* ── the section tabs, sticky under the app's header ──────────────── */}
      <div className="pricing-nav-shell">
        <div className="wrap">
          <nav className="pricing-nav" aria-label="Pricing sections">
            <a className="tab-link active" href="#trial">Free trial</a>
            <a className="tab-link" href="#credits">Flexible credits</a>
            <a className="tab-link" href="#memberships">Memberships</a>
            <a className="tab-link" href="#topups">Member top-ups</a>
            <a className="tab-link" href="#compare">Compare</a>
          </nav>
        </div>
      </div>

      {/* ── hero, as designed ────────────────────────────────────────────── */}
      <div className="hero-shell">
        <section className="hero wrap" id="top">
          <div className="eyebrow">FD AI pricing</div>
          <h1>Simple, flexible pricing for every way you use FD AI.</h1>
          <p>Start free, buy credits when needed, or switch to a monthly plan for better ongoing value.</p>
          <div className="hero-actions">
            <a className="btn btn-black" href="#trial">Start with free trial</a>
            <a className="btn btn-white" href="#compare">Help me choose</a>
          </div>
          <div className="hero-meta">
            <span><i />No card required</span>
            <span><i />Purchased credits do not expire</span>
            <span><i />Cancel anytime</span>
          </div>
          <div className="scroll-note">Scroll to explore <i>↓</i></div>
        </section>
      </div>

      {/* ── notices the design does not have ─────────────────────────────── */}
      {(notices || catalogue.anyMissing || catalogue.anyWrongCurrency) && (
        <div className="wrap" style={{ paddingTop: 24 }}>
          {resumed && (
            <div className="banner ok"><div><strong>Your membership is back on.</strong><span>The cancellation is withdrawn and nothing was charged — you keep the period you had already paid for.</span></div></div>
          )}
          {changed && (
            <div className="banner ok"><div><strong>Plan changed.</strong><span>Stripe has adjusted your next invoice for the part-month, so you are not charged twice for the same days.</span></div></div>
          )}
          {joined && (
            <div className="banner ok"><div><strong>Welcome to FD AI.</strong><span>Your membership is active. This month&rsquo;s documents land on your account within a few seconds — reload if the number above has not moved yet.</span></div></div>
          )}
          {paid && (
            <div className="banner ok"><div><strong>Payment received.</strong><span>Your documents are on your account. If the number above has not moved yet, reload in a moment.</span></div></div>
          )}
          {cancelled && (
            <div className="banner"><div><strong>Nothing was charged.</strong><span>You left the payment page before finishing. Your account is unchanged.</span></div></div>
          )}
          {catalogue.anyMissing && (
            <div className="banner warn"><div><strong>Some products do not exist in Stripe yet.</strong><span>Run scripts/create-stripe-products.mjs against this Stripe account. Until then those buttons will not work.</span></div></div>
          )}
          {catalogue.anyWrongCurrency && (
            <div className="banner error"><div><strong>A price in Stripe is not in Singapore dollars.</strong><span>FD AI sells in SGD. The affected items are marked below and cannot be bought until they are re-created in SGD.</span></div></div>
          )}
        </div>
      )}

      {/* ── overview, as designed ────────────────────────────────────────── */}
      <section className="overview wrap reveal">
        <div className="overview-grid">
          <div className="panel journey-panel">
            <div className="journey-kicker">How pricing works</div>
            <h2>Choose the path that fits your workflow.</h2>
            <p className="sub">The page is designed as a clear decision flow: start free, stay flexible with one-off credits, or choose a monthly membership for better value.</p>
            <div className="journey-steps">
              <div className="journey-step"><small>Start free</small><strong>{TRIAL.credits} trial credits</strong><p>Try FD AI over {TRIAL.days} days before making any commitment.</p></div>
              <div className="journey-step"><small>Occasional use</small><strong>From {catalogue.packs[0].price}</strong><p>Buy credits only when you need them, with no expiry.</p></div>
              <div className="journey-step"><small>Regular use</small><strong>From {catalogue.memberships[0].price} / month</strong><p>Lower your effective cost with a monthly membership.</p></div>
            </div>
          </div>

          <div className="panel recommended-panel">
            <div className="pill">Recommended for most regular users</div>
            <div className="rec-card">
              <h2>Pro Membership</h2>
              <div className="rec-price"><strong>{catalogue.memberships[1].price}</strong><span>/ month</span></div>
              <div className="rec-meta">10 credits each month</div>
              <div className="rec-copy">A strong default choice for regular users who want better monthly value without jumping straight to unlimited usage.</div>
              <div className="checklist">
                <div><b>✓</b><span>S$4.98 per included credit</span></div>
                <div><b>✓</b><span>Best value for frequent individual use</span></div>
                <div><b>✓</b><span>Access to exclusive member top-up rates</span></div>
              </div>
              <a className="btn btn-black" href="#memberships">Choose Pro Membership</a>
              <div className="helper-note">A good default for regular users and small teams.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── step 1: trial ─────────────────────────────────────────────────── */}
      <section className="section" id="trial">
        <div className="wrap reveal">
          <div className="section-head">
            <div className="section-kicker">Step 1</div>
            <h2>Start with a free trial</h2>
            <p>A simple way to explore FD AI before committing to a paid option.</p>
          </div>
          <div className="banner">
            <div>
              <strong>Your first {TRIAL.credits} credits are free.</strong>
              <span>Use them over {TRIAL.days} days, then continue with flexible credits or a membership if FD AI suits your workflow.</span>
            </div>
            <div className="badge">No card required</div>
          </div>
          <div className="card-grid three-up">
            <article className="card">
              <div className="tag gold">Included</div>
              <div className="plan-title">{TRIAL.credits} credits</div>
              <div className="plan-rate">Use them to try FD AI before paying.</div>
              <div className="divider" />
              <div className="points">
                <div><b>✓</b><span>Designed for first-time users</span></div>
                <div><b>✓</b><span>An easy way to test the experience</span></div>
              </div>
              <Link className="btn btn-white card-btn" href="/draft">{trialLive ? "Start a draft" : "Start free trial"}</Link>
            </article>
            <article className="card">
              <div className="tag">Access period</div>
              <div className="plan-title">{TRIAL.days} days</div>
              <div className="plan-rate">Trial credits expire after {TRIAL.days} days.</div>
              <div className="divider" />
              <div className="points">
                <div><b>✓</b><span>Enough time to explore the workflow</span></div>
                <div><b>✓</b><span>Decide later if you want to upgrade</span></div>
              </div>
              <a className="btn btn-white card-btn" href="#compare">Learn more</a>
            </article>
            <article className="card featured">
              <div className="tag gold">Best next step</div>
              <div className="plan-title">Then choose a plan</div>
              <div className="plan-rate">Move to credits or a membership once you are ready.</div>
              <div className="divider" />
              <div className="points">
                <div><b>✓</b><span>Occasional use: buy credits</span></div>
                <div><b>✓</b><span>Regular use: choose membership</span></div>
              </div>
              <a className="btn btn-black card-btn" href="#credits">See pricing options</a>
            </article>
          </div>
        </div>
      </section>

      {/* ── step 2A: flexible credits ─────────────────────────────────────── */}
      <section className="section alt" id="credits">
        <div className="wrap reveal">
          <div className="section-head">
            <div className="section-kicker">Step 2A</div>
            <h2>Flexible credits</h2>
            <p>For occasional use. Buy only what you need, with no subscription and no expiry.</p>
          </div>
          <div className="card-grid three-up">
            {catalogue.packs.map((pk, i) => {
              const featured = pk.credits === 3;
              const last = i === catalogue.packs.length - 1;
              return (
                <article key={pk.lookupKey} className={`card${featured ? " featured" : ""}`}>
                  <div className={`tag${featured ? " gold" : ""}`}>{featured ? "Most popular" : last ? "Best PAYG rate" : "One-off"}</div>
                  <div className="plan-title">{pk.credits === 1 ? "Single credit" : `${pk.credits}-credit bundle`}</div>
                  <div className="plan-price"><strong>{pk.price}</strong></div>
                  <div className="plan-credit">{pk.credits} credit{pk.credits === 1 ? "" : "s"}</div>
                  <div className="plan-rate">{money(Math.round(pk.amountCents / pk.credits))} per credit</div>
                  <div className="divider" />
                  <div className="points">
                    <div><b>✓</b><span>No expiry</span></div>
                    <div><b>✓</b><span>{pk.credits === 1 ? "Best for one-off use" : featured ? "Useful for occasional drafting" : "Best value without membership"}</span></div>
                  </div>
                  {pk.credits > 1 && <div className="saving">Save {savings(pk.credits, pk.amountCents)} vs single credits</div>}
                  <BuyButton item={pk} label={pk.credits === 1 ? "Buy credit" : "Buy bundle"} className={`btn ${featured ? "btn-black" : "btn-white"} card-btn`} />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── step 2B: memberships ──────────────────────────────────────────── */}
      <section className="section" id="memberships">
        <div className="wrap reveal">
          <div className="section-head">
            <div className="section-kicker">Step 2B</div>
            <h2>Monthly memberships</h2>
            <p>For regular use. Get a lower effective rate, plus access to exclusive member top-ups.</p>
          </div>
          <div className="shell soft">
            <div className="banner">
              <div>
                <strong>Recommended: Pro Membership</strong>
                <span>Best value for regular users and small teams.</span>
              </div>
              <div className="badge">Billed monthly</div>
            </div>
            <div className="card-grid three-up">
              {catalogue.memberships.map((m) => {
                const current = m.tier === tier;
                const featured = m.tier === "pro";
                const tagText = current ? "Your plan" : m.tier === "basic" ? "Light use" : m.tier === "pro" ? "Recommended" : "Heavy use";
                return (
                  <article key={m.lookupKey} className={`card${featured ? " featured" : ""}`}>
                    <div className={`tag${featured || current ? " gold" : ""}`}>{tagText}</div>
                    <div className="plan-title">{m.label}</div>
                    <div className="plan-price"><strong>{m.price}</strong><span>/ month</span></div>
                    <div className="plan-credit">{m.monthlyCredits ? `${m.monthlyCredits} credits each month` : "Unlimited usage*"}</div>
                    <div className="plan-rate">{m.monthlyCredits ? `${money(Math.round(m.amountCents / m.monthlyCredits))} per included credit` : "Fixed monthly pricing"}</div>
                    <div className="divider" />
                    <div className="points">
                      {m.tier === "basic" && (<><div><b>✓</b><span>For light monthly use</span></div><div><b>✓</b><span>Member top-ups available</span></div><div><b>✓</b><span>Credits reset monthly</span></div></>)}
                      {m.tier === "pro" && (<><div><b>✓</b><span>For frequent monthly use</span></div><div><b>✓</b><span>Best value for regular use</span></div><div><b>✓</b><span>Access to exclusive top-up rates</span></div></>)}
                      {m.tier === "unlimited" && (<><div><b>✓</b><span>For heavy users and teams</span></div><div><b>✓</b><span>No need to manage credits</span></div><div><b>✓</b><span>Fair-use terms apply</span></div></>)}
                    </div>
                    <BuyButton item={m} label={`Choose ${m.label}`} isCurrent={current} className={`btn ${featured ? "btn-black" : "btn-white"} card-btn`} />
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── member top-ups ────────────────────────────────────────────────── */}
      <section className="section alt" id="topups">
        <div className="wrap reveal">
          <div className="section-head">
            <div className="section-kicker">Members only</div>
            <h2>Exclusive member top-ups</h2>
            <p>Available only to active Basic and Pro members who need extra credits before their monthly reset.</p>
          </div>
          <div className="shell gold">
            <div className="exclusive-top">
              <div>
                <div className="pill">Exclusive access</div>
                <h3 style={{ marginTop: 12 }}>Private top-up rates for members</h3>
                <p>Top up only when needed, without changing your membership plan.</p>
              </div>
              <div className="badge">Basic and Pro members only</div>
            </div>
            <div className="card-grid four-up">
              {catalogue.topups.map((t) => {
                const featured = t.credits === 10;
                return (
                  <article key={t.lookupKey} className={`card topup-card${featured ? " featured" : ""}`}>
                    <div className={`tag ${featured ? "gold" : "exclusive"}`}>{featured ? "Best top-up rate" : "Members only"}</div>
                    <div className="plan-title">{t.credits} credit{t.credits === 1 ? "" : "s"}</div>
                    <div className="plan-price"><strong>{t.price}</strong></div>
                    <div className="plan-rate">{money(Math.round(t.amountCents / t.credits))} per credit</div>
                    <BuyButton item={t} label="Top up" className={`btn ${featured ? "btn-black" : "btn-white"} card-btn`} />
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── compare ───────────────────────────────────────────────────────── */}
      <section className="section" id="compare">
        <div className="wrap reveal">
          <div className="section-head">
            <div className="section-kicker">Quick guide</div>
            <h2>Which option fits you?</h2>
            <p>Choose based on how often you expect to use FD AI.</p>
          </div>
          <div className="compare-grid">
            <article className="compare-card"><small>Occasional</small><h3>Flexible credits</h3><p>Best if you only use FD AI from time to time and want full flexibility with no expiry.</p><a href="#credits">View flexible credits →</a></article>
            <article className="compare-card"><small>Regular</small><h3>Basic or Pro</h3><p>Best if you use FD AI every month and want a lower effective cost.</p><a href="#memberships">View memberships →</a></article>
            <article className="compare-card"><small>Heavy</small><h3>Unlimited</h3><p>Best if you use FD AI heavily and prefer one predictable monthly price.</p><a href="#memberships">View Unlimited →</a></article>
          </div>
          <div className="footer-note">
            <span>Trial credits expire {TRIAL.days} days after activation. Purchased pay-as-you-go credits do not expire.</span>
            <span>All prices shown in SGD. Unlimited usage is subject to FD AI fair-use terms.</span>
          </div>
        </div>
      </section>

      {/* ── billing history: ours ─────────────────────────────────────────── */}
      {invoices.length > 0 && (
        <section className="section alt" id="invoices">
          <div className="wrap reveal">
            <div className="section-head">
              <div className="section-kicker">Your account</div>
              <h2>Billing history</h2>
              <p>Every charge, in Singapore dollars. Receipts are issued by Stripe.</p>
            </div>
            <div className="shell invoices" style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Date</th><th>What</th><th>Amount</th><th>Status</th><th style={{ textAlign: "right" }}>Receipt</th></tr></thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{inv.paidAt ? when(inv.paidAt) : "—"}</td>
                      <td>{inv.description}</td>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{inv.amount}{inv.currency !== "sgd" && <span style={{ color: "#b42318", fontWeight: 500 }}> ({inv.currency.toUpperCase()})</span>}</td>
                      <td><span className={`tag ${inv.status === "paid" ? "gold" : ""}`}>{inv.status === "paid" ? "Paid" : inv.status}</span></td>
                      <td style={{ textAlign: "right" }}>
                        {inv.pdfUrl ? <a className="btn btn-white" href={inv.pdfUrl} target="_blank" rel="noreferrer" style={{ minHeight: 36, padding: "6px 12px", fontSize: 12 }}>↓ Download</a>
                          : inv.hostedUrl ? <a href={inv.hostedUrl} target="_blank" rel="noreferrer">View</a> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 14, fontSize: 12.5 }}>
              <Link href="/billing/history">See every plan and payment &rsaquo;</Link>
            </p>
          </div>
        </section>
      )}

      {/* ── final CTA, as designed ────────────────────────────────────────── */}
      <section className="final-cta">
        <div className="wrap reveal">
          <div className="cta-box">
            <div className="section-kicker">Still unsure?</div>
            <h2>Start free and choose later.</h2>
            <p>If you are not ready to commit, begin with {TRIAL.credits} free credits. You can explore FD AI first and decide what fits your workflow afterwards.</p>
            <div className="hero-actions">
              <a className="btn btn-black" href="#trial">Start free</a>
              <a className="btn btn-white" href="#compare">Compare options</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
