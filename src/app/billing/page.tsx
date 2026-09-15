import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getWallet } from "@/lib/billing/credits";
import { isStripeConfigured, stripeMode } from "@/lib/billing/stripe";
import { pricedCatalogue } from "@/lib/billing/prices";
import { TRIAL } from "@/lib/billing/plans";
import BuyButtons from "./BuyButtons";

export const metadata = { title: "Credits — FD AI" };
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

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; cancelled?: string; joined?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/draft");
  const user = await getUser();
  if (!user) redirect("/login?next=%2Fbilling");

  const { paid, cancelled, joined } = await searchParams;
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
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("billing_summary");
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      membership = {
        tier: row.tier ?? null,
        status: row.status ?? null,
        period_end: row.period_end ?? null,
        unlimited_cap: Number(row.unlimited_cap ?? 0),
        unlimited_used: Number(row.unlimited_used ?? 0),
      };
    }
  } catch {
    // The page still works without it; it just shows no membership panel.
  }

  const tier = membership?.tier ?? null;
  const isMember = Boolean(tier);
  const isUnlimited = tier === "unlimited";

  let history: GrantRow[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("credit_grants")
      .select("credits,remaining,source,expires_at,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    history = (data as GrantRow[] | null) ?? [];
  } catch {
    history = [];
  }

  const trialLive = wallet.inTrial && wallet.trialEndsAt;

  return (
    <main className="wrap" style={{ maxWidth: 760, padding: "56px 24px 96px" }}>
      <p className="kicker">FD AI</p>
      <h1 style={{ fontSize: "clamp(26px, 3vw, 32px)", marginTop: 8 }}>Credits</h1>
      <p className="sub" style={{ margin: "10px 0 28px", fontSize: 15 }}>
        One credit drafts one document. Reading and downloading documents you have already made
        is always free.
      </p>

      {/* Which Stripe account is answering is decided entirely by the key in
          the environment, and the key's own prefix says which mode it is. The
          banner therefore cannot be left switched on by mistake, and cannot be
          absent when it matters. Founders Doc has a real Stripe account taking
          real payments, so being certain which one is in play is not a nicety. */}
      {mode === "test" && isStripeConfigured() && (
        <p className="note note-warn" style={{ marginBottom: 20 }}>
          <b>Test mode.</b> Payments here are not real and no money moves. Use card{" "}
          <code>4242 4242 4242 4242</code>, any future expiry, any CVC.
        </p>
      )}

      {mode === "live" && (
        <p
          className="note note-warn"
          style={{ marginBottom: 20, borderLeftColor: "#c2410c", color: "#c2410c" }}
        >
          <b>Live mode — real cards will be charged.</b> This page is connected to a live Stripe
          account. Check the prices below are the ones you intend before anyone uses it.
        </p>
      )}

      {paid && (
        <p className="note note-ok" style={{ marginBottom: 20 }}>
          <b>Payment received.</b> Your credits appear within a few seconds — Stripe tells us
          directly, so if the number below has not moved yet, reload in a moment.
        </p>
      )}
      {joined && (
        <p className="note note-ok" style={{ marginBottom: 20 }}>
          <b>Welcome to FD AI.</b> Your membership is active and this month&rsquo;s documents are on
          your account within a few seconds. Stripe tells us directly, so reload in a moment if the
          number below has not moved.
        </p>
      )}
      {cancelled && (
        <p className="note" style={{ marginBottom: 20 }}>
          Checkout cancelled. Nothing was charged.
        </p>
      )}

      {/* ── the balance ───────────────────────────────────────────────────── */}
      <section
        style={{
          border: "1px solid var(--grey-2)",
          borderLeft: "2px solid var(--gold)",
          borderRadius: 14,
          padding: "clamp(20px, 3vw, 28px)",
          background: "var(--white)",
          marginBottom: 28,
        }}
      >
        <p style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--grey-4)", fontWeight: 600 }}>
          Documents you can draft
        </p>
        <p style={{ fontSize: 44, lineHeight: 1.1, margin: "8px 0 0", letterSpacing: "-0.03em" }}>
          {wallet.credits}
        </p>
        {isUnlimited ? (
          <p className="sub" style={{ marginTop: 10, fontSize: 14 }}>
            You are on <b style={{ color: "var(--ink)" }}>Unlimited</b> — drafting does not spend
            these.{" "}
            {membership!.unlimited_cap > 0 && (
              <>
                You have drafted <b style={{ color: "var(--ink)" }}>{membership!.unlimited_used}</b>{" "}
                of {membership!.unlimited_cap} documents this month under fair use.
              </>
            )}
          </p>
        ) : trialLive ? (
          <p className="sub" style={{ marginTop: 10, fontSize: 14 }}>
            Your {TRIAL.days}-day free trial runs until{" "}
            <b style={{ color: "var(--ink)" }}>{when(wallet.trialEndsAt!)}</b>. Unused trial
            documents stop then — bought ones never expire.
          </p>
        ) : wallet.credits === 0 ? (
          <p className="sub" style={{ marginTop: 10, fontSize: 14 }}>
            Your trial has finished. Buy documents or join a membership to draft again. Everything
            you have already drafted stays in <Link href="/history">your history</Link>, readable
            and downloadable.
          </p>
        ) : isMember ? (
          <p className="sub" style={{ marginTop: 10, fontSize: 14 }}>
            Unused documents carry over each month for as long as your membership lasts. Anything
            you bought outright stays yours either way.
          </p>
        ) : (
          <p className="sub" style={{ marginTop: 10, fontSize: 14 }}>These do not expire.</p>
        )}
      </section>

      {/* ── membership status, when there is one ──────────────────────────── */}
      {isMember && (
        <section
          style={{
            border: "1px solid var(--grey-2)",
            borderRadius: 14,
            padding: "18px 20px",
            background: "var(--white)",
            marginBottom: 28,
          }}
        >
          <p style={{ margin: 0, fontSize: 15 }}>
            <b style={{ textTransform: "capitalize" }}>{tier}</b> membership
            {membership!.status === "past_due" && (
              <span style={{ color: "#c2410c" }}> — payment needs attention</span>
            )}
          </p>
          {membership!.period_end && (
            <p className="sub" style={{ margin: "6px 0 0", fontSize: 13 }}>
              Renews {when(membership!.period_end)}.
            </p>
          )}
          <p className="sub" style={{ margin: "6px 0 0", fontSize: 13 }}>
            To change or cancel, choose any membership below and you will be taken to Stripe, where
            your card details are held.
          </p>
        </section>
      )}

      {/* ── what is for sale ──────────────────────────────────────────────── */}
      {!isStripeConfigured() ? (
        <p className="note note-warn">
          Payments are not switched on yet. Set <code>STRIPE_SECRET_KEY</code> and{" "}
          <code>STRIPE_WEBHOOK_SECRET</code> to enable this page.
        </p>
      ) : (
        <>
          {catalogue.anyMissing && (
            <p className="note note-warn" style={{ marginBottom: 14 }}>
              <b>Some products do not exist in Stripe yet.</b> Run{" "}
              <code>node scripts/create-stripe-products.mjs &lt;secret key&gt;</code> against this
              Stripe account. Until then the prices shown are from the price list, not from Stripe,
              and those buttons will not work.
            </p>
          )}

          <h2 style={{ fontSize: 19, marginBottom: 4 }}>Membership</h2>
          <p className="sub" style={{ margin: "0 0 14px", fontSize: 14 }}>
            A monthly allowance that carries over for as long as you stay a member. Better value
            than buying one at a time, and members pay less for extra documents.
          </p>
          <BuyButtons items={catalogue.memberships} highlightTier="pro" currentTier={tier} />

          <h2 style={{ fontSize: 19, margin: "36px 0 4px" }}>Buy as you go</h2>
          <p className="sub" style={{ margin: "0 0 14px", fontSize: 14 }}>
            No commitment. These never expire.
          </p>
          <BuyButtons items={catalogue.packs} />

          {isMember && !isUnlimited && (
            <>
              <h2 style={{ fontSize: 19, margin: "36px 0 4px" }}>Member top-ups</h2>
              <p className="sub" style={{ margin: "0 0 14px", fontSize: 14 }}>
                Your member price, for when this month&rsquo;s allowance runs out before the next
                one arrives. These never expire either.
              </p>
              <BuyButtons items={catalogue.topups} />
            </>
          )}
        </>
      )}

      {/* ── history ───────────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <>
          <h2 style={{ fontSize: 19, margin: "36px 0 12px" }}>History</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--grey-5)", fontSize: 12 }}>
                  <th style={{ padding: "8px 10px 8px 0" }}>Date</th>
                  <th style={{ padding: "8px 10px" }}>What</th>
                  <th style={{ padding: "8px 10px" }}>Credits</th>
                  <th style={{ padding: "8px 10px" }}>Left</th>
                  <th style={{ padding: "8px 0 8px 10px" }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {history.map((g, idx) => (
                  <tr key={idx} style={{ borderTop: "1px solid var(--grey-2)" }}>
                    <td style={{ padding: "10px 10px 10px 0" }}>{when(g.created_at)}</td>
                    <td style={{ padding: "10px" }}>
                      {g.source === "trial"
                        ? "Free trial"
                        : g.source === "purchase"
                          ? "Bundle"
                          : g.source === "membership"
                            ? "Membership"
                            : g.source === "topup"
                              ? "Member top-up"
                              : g.source === "gift"
                                ? "Added by Founders Doc"
                                : g.source}
                    </td>
                    <td style={{ padding: "10px" }}>{g.credits}</td>
                    <td style={{ padding: "10px" }}>{g.remaining}</td>
                    <td style={{ padding: "10px 0 10px 10px", color: "var(--grey-5)" }}>
                      {g.expires_at ? when(g.expires_at) : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p style={{ marginTop: 32, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="btn btn-white" href="/draft">Back to drafting</Link>
        <Link className="btn btn-white" href="/history">Past drafts</Link>
      </p>
    </main>
  );
}
