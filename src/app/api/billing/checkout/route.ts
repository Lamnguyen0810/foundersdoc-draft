import { type NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isStripeConfigured, siteUrl, stripe } from "@/lib/billing/stripe";
import {
  SELLING_CURRENCY,
  membershipByLookupKey,
  moneyIn,
  packByLookupKey,
} from "@/lib/billing/plans";

/**
 * Start a purchase — a bundle, a top-up, or a membership.
 *
 * The browser asks for something by lookup key and gets back a URL to Stripe's
 * own hosted checkout page. That indirection is the entire PCI story: a card
 * number is typed on stripe.com, into Stripe's form, and this server never sees
 * one — not in a request body, not in a log, not in a crash report. For a law
 * firm that is not a nicety, it is the difference between a payment page and a
 * compliance programme.
 *
 * ── WHAT THE BROWSER IS NOT TRUSTED WITH ────────────────────────────────────
 * Not the amount: the browser names a lookup key and Stripe resolves the price,
 * so editing the request cannot buy ten documents for a dollar.
 * Not the credit count: it comes from the price list on the server.
 * Not eligibility: top-ups are member-only, and that is checked here against
 * the database, because a check in the browser is a suggestion.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Payments are not switched on yet." }, { status: 503 });
  }

  const user = await getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { lookupKey?: string };
  const key = body.lookupKey ?? "";
  const pack = packByLookupKey(key);
  const membership = membershipByLookupKey(key);

  if (!pack && !membership) {
    return NextResponse.json({ error: "Unknown item." }, { status: 400 });
  }

  /* ── THE TOP-UP GATE ──────────────────────────────────────────────────────
     Top-ups are cheaper per document than anything sold publicly, on the
     understanding that the buyer is already paying a monthly fee. Without this
     check, anyone who reads the page source buys at member prices for ever. */
  if (pack?.kind === "topup") {
    const supabase = await createClient();
    const { data } = await supabase.rpc("active_membership");
    const tier = Array.isArray(data) ? data[0]?.tier : undefined;
    if (!tier) {
      return NextResponse.json(
        {
          error:
            "Top-ups are for members. Join Basic, Pro or Unlimited first, or buy a bundle at the " +
            "standard price.",
          code: "not_a_member",
        },
        { status: 403 },
      );
    }
  }

  const s = stripe();
  const origin = siteUrl(req.nextUrl.origin);

  try {
    const prices = await s.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) {
      return NextResponse.json(
        {
          error:
            `No active Stripe price with lookup key "${key}". Run ` +
            `scripts/create-stripe-products.mjs against this Stripe account.`,
        },
        { status: 500 },
      );
    }

    /* ── EVERY PRICE IS IN SINGAPORE DOLLARS, OR NOTHING HAPPENS ──────────
       FD AI is sold in SGD and every figure on the site is written "S$". A
       Price created in another currency does not announce itself: Stripe's
       checkout page simply charges what the Price says while our page keeps
       saying S$, and the customer finds out from their statement. Refusing
       here turns a silent mischarge into a message nobody can miss, on the
       firm's own screen, before any card is entered. */
    if (price.currency?.toLowerCase() !== SELLING_CURRENCY) {
      console.error(
        `[billing] price ${key} is denominated in ${price.currency} — refusing to charge.`,
      );
      return NextResponse.json(
        {
          error:
            `This item is priced in ${price.currency?.toUpperCase()} in Stripe ` +
            `(${moneyIn(price.unit_amount ?? 0, price.currency ?? "")}), but FD AI sells in ` +
            `Singapore dollars. Archive that price in Stripe and re-create it in SGD — ` +
            `nothing has been charged.`,
          code: "wrong_currency",
        },
        { status: 409 },
      );
    }

    /* One Stripe customer per account, found by email and remembered on the
       session. Without this a returning buyer becomes a second customer, and
       — far worse for a subscription — could end up paying twice. */
    const existing = await s.customers.list({ email: user.email, limit: 1 });
    const customer =
      existing.data[0] ??
      (await s.customers.create({ email: user.email, metadata: { supabase_user_id: user.id } }));

    if (membership) {
      /* ── WHAT "CANCELLED" ACTUALLY MEANS IN STRIPE ────────────────────────
         Cancelling does not end a subscription there and then. Stripe sets
         `cancel_at_period_end` and leaves the status ACTIVE until the paid
         period runs out — the customer has paid for the month, so they keep
         it. This code used to see that active subscription, decide the person
         was already a member, and send them to the billing portal, which
         showed them the plan they had just cancelled and no way to buy
         anything. A dead end, at the exact moment someone was trying to give
         us money.

         So: look at every subscription, not just "active" ones, and decide by
         what the customer is actually asking for. */
      const subs = await s.subscriptions.list({ customer: customer.id, status: "all", limit: 20 });
      const live = subs.data.find((sub) =>
        ["active", "trialing", "past_due"].includes(sub.status),
      );

      if (live) {
        const item = live.items.data[0];
        const onThisPlan = item?.price?.id === price.id;

        const metadata = {
          supabase_user_id: user.id,
          tier: membership.tier,
          monthly_credits: String(membership.monthlyCredits ?? 0),
        };

        /* Same plan, previously cancelled: they have changed their mind.
           Simply stop the cancellation — no new subscription, no second
           charge, and they keep the period they already paid for. */
        if (onThisPlan && live.cancel_at_period_end) {
          await s.subscriptions.update(live.id, { cancel_at_period_end: false, metadata });
          return NextResponse.json({ url: `${origin}/billing?resumed=1` });
        }

        /* A DIFFERENT plan: move this subscription onto the new price rather
           than starting a second one. Stripe would happily run both and charge
           for both, which is the worst outcome available here. */
        if (!onThisPlan && item) {
          await s.subscriptions.update(live.id, {
            items: [{ id: item.id, price: price.id }],
            cancel_at_period_end: false,
            proration_behavior: "create_prorations",
            metadata,
          });
          return NextResponse.json({ url: `${origin}/billing?changed=1` });
        }

        /* Same plan, not cancelled: nothing to sell them. The portal is the
           right destination — that is where cards and cancellation live. */
        const portal = await s.billingPortal.sessions.create({
          customer: customer.id,
          return_url: `${origin}/billing`,
        });
        return NextResponse.json({ url: portal.url, changed: true });
      }

      const session = await s.checkout.sessions.create({
        mode: "subscription",
        customer: customer.id,
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${origin}/billing?joined=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/billing?cancelled=1`,
        metadata: {
          supabase_user_id: user.id,
          tier: membership.tier,
          lookup_key: membership.lookupKey,
        },
        /* Copied onto the subscription itself, not just the checkout session.
           Renewal invoices months from now carry no memory of the session that
           started them, so without this the webhook would have no idea whose
           account to credit on the second month. */
        subscription_data: {
          metadata: {
            supabase_user_id: user.id,
            tier: membership.tier,
            monthly_credits: String(membership.monthlyCredits ?? 0),
          },
        },
        allow_promotion_codes: true,
      });

      return NextResponse.json({ url: session.url });
    }

    const session = await s.checkout.sessions.create({
      mode: "payment",
      customer: customer.id,
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${origin}/billing?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?cancelled=1`,
      // The webhook trusts these, and nothing else, to decide who gets credited.
      metadata: {
        supabase_user_id: user.id,
        credits: String(pack!.credits),
        lookup_key: pack!.lookupKey,
        source: pack!.kind === "topup" ? "topup" : "purchase",
      },
      payment_intent_data: {
        metadata: { supabase_user_id: user.id, credits: String(pack!.credits) },
      },
      // A receipt the buyer can produce for their own accounts.
      invoice_creation: { enabled: true },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing] checkout failed:", err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
