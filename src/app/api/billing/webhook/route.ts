import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { isStripeConfigured, stripe, webhookSecret } from "@/lib/billing/stripe";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Where Stripe tells us a payment really happened.
 *
 * ── WHY CREDITS ARE NOT GRANTED ON THE SUCCESS PAGE ─────────────────────────
 * Because the success page is a URL, and a URL can be typed. If /billing?paid=1
 * granted credits, a customer could bookmark it and mint documents for ever.
 * The only party that knows a card was actually charged is Stripe, and this is
 * the only route that hears from it.
 *
 * ── THE THREE RULES ─────────────────────────────────────────────────────────
 *   1. VERIFY. Every request is checked against the signing secret. An
 *      unsigned or mis-signed POST is rejected before anything is read — this
 *      endpoint is public, so assume it is being probed.
 *   2. RAW BODY. The signature covers the exact bytes Stripe sent. Parsing the
 *      JSON first and re-serialising it changes those bytes and every
 *      verification fails. That is why req.text() appears before any parsing.
 *   3. ONCE. Stripe retries until it gets a 200 and may deliver the same event
 *      twice. Credits are granted inside a unique constraint on the session id,
 *      so a replay is recorded and ignored rather than paid out again.
 */
export const dynamic = "force-dynamic";

function ok(note: string) {
  // Always 200 for anything we have decided not to act on. A 4xx or 5xx makes
  // Stripe retry for days over something that was never going to succeed.
  return NextResponse.json({ received: true, note });
}

export async function POST(req: NextRequest) {
  const secret = webhookSecret();
  if (!isStripeConfigured() || !secret) return ok("stripe not configured");
  if (!isAdminClientConfigured()) {
    console.error("[webhook] SUPABASE_SECRET_KEY missing — cannot credit accounts.");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "unsigned" }, { status: 400 });

  const raw = await req.text(); // must be the untouched bytes — see rule 2
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(raw, signature, secret);
  } catch (err) {
    console.error("[webhook] signature rejected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Idempotency gate. The insert fails on a duplicate id, which tells us this
  // event has been seen — cheaper and more reliable than reading first.
  const { error: seen } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (seen) return ok(`already handled ${event.id}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        // An unpaid session (bank transfer still pending) is not a purchase yet.
        if (session.payment_status !== "paid") return ok("session not paid yet");

        const userId = session.metadata?.supabase_user_id;
        const credits = Number(session.metadata?.credits ?? 0);
        if (!userId || !Number.isFinite(credits) || credits <= 0) {
          console.error("[webhook] paid session with no usable metadata:", session.id);
          return ok("no metadata");
        }

        const { error } = await db.from("credit_grants").insert({
          user_id: userId,
          credits,
          remaining: credits,
          source: "purchase",
          expires_at: null, // paid credits do not expire
          stripe_ref: session.id,
        });

        // 23505 is a duplicate stripe_ref: the same purchase arriving twice.
        if (error && error.code !== "23505") throw error;

        // Remember the customer so future receipts and refunds line up.
        if (typeof session.customer === "string") {
          await db
            .from("billing_accounts")
            .upsert({ user_id: userId, stripe_customer_id: session.customer }, { onConflict: "user_id" });
        }

        return ok(`granted ${credits} credits`);
      }

      case "charge.refunded": {
        /* A refund must remove what was granted, or a refunded customer keeps
           free documents. Unspent credits are zeroed; credits already spent are
           left alone — the work was done and cannot be un-done. */
        const charge = event.data.object;
        const userId = charge.metadata?.supabase_user_id;
        if (!userId) return ok("refund without user metadata");

        const { data: grants } = await db
          .from("credit_grants")
          .select("id,remaining")
          .eq("user_id", userId)
          .eq("source", "purchase")
          .gt("remaining", 0)
          .order("created_at", { ascending: false })
          .limit(1);

        if (grants?.[0]) {
          await db.from("credit_grants").update({ remaining: 0 }).eq("id", grants[0].id);
          return ok(`refund: withdrew ${grants[0].remaining} unspent credits`);
        }
        return ok("refund: nothing unspent to withdraw");
      }

      default:
        return ok(`ignored ${event.type}`);
    }
  } catch (err) {
    console.error("[webhook] handler failed:", err);
    // Roll the idempotency record back so Stripe's retry can succeed: a failure
    // here means the credits were NOT granted, and the customer paid.
    await db.from("stripe_events").delete().eq("id", event.id);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
