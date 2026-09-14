import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getWallet } from "@/lib/billing/credits";
import { isStripeConfigured, stripeMode } from "@/lib/billing/stripe";
import { pricedPacks } from "@/lib/billing/prices";
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
  searchParams: Promise<{ paid?: string; cancelled?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/draft");
  const user = await getUser();
  if (!user) redirect("/login?next=%2Fbilling");

  const { paid, cancelled } = await searchParams;
  const wallet = await getWallet();
  const mode = stripeMode();
  const packs = await pricedPacks();

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
        {trialLive ? (
          <p className="sub" style={{ marginTop: 10, fontSize: 14 }}>
            Your free week runs until <b style={{ color: "var(--ink)" }}>{when(wallet.trialEndsAt!)}</b>.
            Unused trial credits stop then — bought credits never expire.
          </p>
        ) : wallet.credits === 0 ? (
          <p className="sub" style={{ marginTop: 10, fontSize: 14 }}>
            Your free week has finished. Add credits to draft again. Everything you have already
            drafted stays in <Link href="/history">your history</Link>, readable and downloadable.
          </p>
        ) : (
          <p className="sub" style={{ marginTop: 10, fontSize: 14 }}>These do not expire.</p>
        )}
      </section>

      {/* ── the packs ─────────────────────────────────────────────────────── */}
      <h2 style={{ fontSize: 19, marginBottom: 14 }}>Add credits</h2>

      {!isStripeConfigured() ? (
        <p className="note note-warn">
          Payments are not switched on yet. Set <code>STRIPE_SECRET_KEY</code> and{" "}
          <code>STRIPE_WEBHOOK_SECRET</code> to enable this page.
        </p>
      ) : (
        <>
          {packs.some((p) => p.missing) && (
            <p className="note note-warn" style={{ marginBottom: 14 }}>
              <b>Some packs are not set up in Stripe yet.</b> Create a product for each and set
              its price&rsquo;s <b>lookup key</b> to{" "}
              {packs.filter((p) => p.missing).map((p) => <code key={p.lookupKey} style={{ marginRight: 6 }}>{p.lookupKey}</code>)}
              — the prices below are placeholders until you do, and those buttons will not work.
            </p>
          )}
          <BuyButtons packs={packs} />
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
                      {g.source === "trial" ? "Free week" : g.source === "purchase" ? "Purchase" : g.source}
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
