import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { isStripeConfigured, stripe, webhookSecret } from "@/lib/billing/stripe";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Which subscription an invoice belongs to.
 *
 * ⚠ Stripe MOVED this. Up to a point, an invoice carried `subscription` at the
 * top level. From API version 2025-08-27 it lives at
 * `parent.subscription_details.subscription` instead, and the old field is
 * simply absent — not null, absent. Code reading the old path gets `undefined`,
 * concludes the invoice is not for a subscription, and returns happily having
 * granted nobody anything. The payment succeeds and the credits never arrive.
 *
 * Both shapes are read here so this keeps working whichever API version the
 * account is pinned to, and whichever it moves to next.
 */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const shaped = invoice as Stripe.Invoice & {
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
    subscription?: string | { id: string } | null;
  };

  const current = shaped.parent?.subscription_details?.subscription;
  if (current) return typeof current === "string" ? current : current.id;

  const legacy = shaped.subscription;
  if (legacy) return typeof legacy === "string" ? legacy : legacy.id;

  return null;
}

/**
 * The current billing period.
 *
 * ⚠ Moved in the same release: `current_period_start` / `current_period_end`
 * were on the subscription and are now on each subscription ITEM. Reading the
 * old place yields undefined, which is then stored as null — so the renewal
 * date never shows, and the Unlimited fair-use window silently falls back to
 * the calendar month instead of the customer's actual billing period.
 */
function periodFromSubscription(sub: Stripe.Subscription): {
  start: string | null;
  end: string | null;
} {
  const item = sub.items?.data?.[0] as
    | { current_period_start?: number | null; current_period_end?: number | null }
    | undefined;
  const legacy = sub as Stripe.Subscription & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };

  const iso = (v: number | null | undefined) =>
    typeof v === "number" ? new Date(v * 1000).toISOString() : null;

  return {
    start: iso(item?.current_period_start ?? legacy.current_period_start),
    end: iso(item?.current_period_end ?? legacy.current_period_end),
  };
}

/**
 * Keep the local copy of a subscription in step with Stripe's.
 *
 * Stripe is the authority; this row exists only so that generating a draft is
 * one database read instead of a network call to Stripe. Everything is taken
 * from the event — nothing is inferred — and the row is keyed on the Stripe
 * subscription id so events arriving out of order converge on the same row
 * rather than creating a second one.
 */
async function upsertSubscription(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const period = periodFromSubscription(sub);

  const { error } = await db.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      stripe_subscription_id: sub.id,
      tier: sub.metadata?.tier ?? "basic",
      status: sub.status,
      current_period_start: period.start,
      current_period_end: period.end,
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) throw error;
}

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

        /* A subscription checkout has no `credits` on it — the credits arrive
           with the invoice, below. Handled there so the first month and the
           twelfth take exactly the same path. */
        if (session.mode === "subscription") return ok("subscription start handled by invoice");

        /* Bundles and top-ups are both bought outright and never expire; the
           source is recorded so cancellation can tell them apart from the
           monthly membership allowance, which does end. */
        const source = session.metadata?.source === "topup" ? "topup" : "purchase";

        const { error } = await db.from("credit_grants").insert({
          user_id: userId,
          credits,
          remaining: credits,
          source,
          expires_at: null, // bought credits do not expire
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

        return ok(`granted ${credits} ${source} credits`);
      }

      /* ── THE MONTHLY ALLOWANCE ──────────────────────────────────────────
         Every membership payment lands here — the first one and every renewal
         — so there is one code path and no "first month is special" bug. The
         invoice id is the idempotency key, and the database function ignores a
         repeat, because Stripe WILL deliver this twice eventually. */
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subId = subscriptionIdFromInvoice(invoice);
        if (!subId) return ok("invoice not for a subscription");

        const sub = await stripe().subscriptions.retrieve(subId);
        const userId = sub.metadata?.supabase_user_id;
        const tier = sub.metadata?.tier;
        const monthly = Number(sub.metadata?.monthly_credits ?? 0);

        if (!userId || !tier) {
          console.error("[webhook] subscription without metadata:", subId);
          return ok("subscription missing metadata");
        }

        await upsertSubscription(db, userId, sub);

        // Unlimited grants no credits — it is metered by fair use instead.
        if (!Number.isFinite(monthly) || monthly <= 0) {
          return ok(`${tier}: no monthly credits to grant`);
        }

        const { error: grantError } = await db.rpc("grant_membership_credits", {
          p_user_id: userId,
          p_credits: monthly,
          p_ref: `invoice_${invoice.id}`,
        });
        if (grantError) throw grantError;

        return ok(`${tier}: granted ${monthly} monthly credits`);
      }

      /* ── STATUS CHANGES ─────────────────────────────────────────────────
         Kept as a local copy so drafting never has to call Stripe. */
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) return ok("subscription without user metadata");
        await upsertSubscription(db, userId, sub);
        return ok(`subscription ${sub.status}`);
      }

      /* ── CANCELLATION ───────────────────────────────────────────────────
         The monthly allowance stops. Anything BOUGHT — a bundle, a top-up —
         is the customer's property and is deliberately left alone. Widening
         this takes money from people who paid for it. */
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) return ok("cancellation without user metadata");

        await upsertSubscription(db, userId, sub);

        const { error: endError } = await db.rpc("end_membership_credits", { p_user_id: userId });
        if (endError) throw endError;

        return ok("membership ended; bought credits untouched");
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
