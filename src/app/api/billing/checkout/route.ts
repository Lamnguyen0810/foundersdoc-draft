import { type NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isStripeConfigured, siteUrl, stripe } from "@/lib/billing/stripe";
import {
  SELLING_CURRENCY,
  membershipByLookupKey,
  moneyIn,
  packByLookupKey,
} from "@/lib/billing/plans";
import { portalConfigurationId } from "@/lib/billing/portal";

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
        const cancelling = Boolean(live.cancel_at_period_end);

        const metadata = {
          supabase_user_id: user.id,
          tier: membership.tier,
          monthly_credits: String(membership.monthlyCredits ?? 0),
        };

        /* ── SAME PLAN, ALREADY CANCELLED: they have changed their mind ────
           Nothing to charge — the period is paid for — so there is no payment
           page to show. Asking for a card here would either take money for a
           month they already own or start a second subscription beside the
           first. Stopping the cancellation is the whole of it. */
        if (onThisPlan && cancelling) {
          await s.subscriptions.update(live.id, { cancel_at_period_end: false, metadata });
          return NextResponse.json({ url: `${origin}/billing?resumed=1` });
        }

        /* ── A DIFFERENT PLAN, AFTER CANCELLING ───────────────────────────
           This is the path that was failing. Somebody on Unlimited cancels,
           then picks Pro. The old code sent that to Stripe's plan-change flow,
           and Stripe will not run one against a subscription already scheduled
           to end — so every attempt came back as "Could not start checkout",
           which told nobody anything.

           It is also the wrong shape. They have cancelled: they are not
           switching an ongoing plan, they are choosing again from scratch. So
           the cancelled subscription is ended now, with `prorate` so the unused
           part of the month they paid for returns as credit on their Stripe
           balance, and that credit comes straight off the new subscription's
           first invoice. Then they go through Checkout exactly as a new
           customer would — the card form, naming the plan they picked, which
           is what was asked for.

           One subscription exists at every moment. Ending the old one before
           creating the new one is what guarantees that. */
        if (!onThisPlan && cancelling) {
          await s.subscriptions.cancel(live.id, { prorate: true });
          // Falls through to the Checkout session below.
        } else if (!onThisPlan && item) {
          /* ── A DIFFERENT PLAN, STILL RUNNING ────────────────────────────
             A live subscription being switched. Here Checkout is the wrong
             tool: it would create a SECOND subscription and bill for both.
             Stripe's confirm flow changes the one that exists, showing the new
             plan, the proration and the next invoice first. */
          await s.subscriptions.update(live.id, { metadata });

          const flow = await s.billingPortal.sessions.create({
            customer: customer.id,
            configuration: await portalConfigurationId(),
            return_url: `${origin}/billing`,
            flow_data: {
              type: "subscription_update_confirm",
              subscription_update_confirm: {
                subscription: live.id,
                items: [{ id: item.id, price: price.id, quantity: 1 }],
              },
              after_completion: {
                type: "redirect",
                redirect: { return_url: `${origin}/billing?changed=1` },
              },
            },
          });

          return NextResponse.json({ url: flow.url });
        } else {
          /* Same plan, running normally. Nothing to sell them; the portal is
             where cards and cancellation live. */
          const portal = await s.billingPortal.sessions.create({
            customer: customer.id,
            configuration: await portalConfigurationId(),
            return_url: `${origin}/billing`,
          });
          return NextResponse.json({ url: portal.url, changed: true });
        }
      }

      const session = await s.checkout.sessions.create({
        mode: "subscription",
        // Singapore dollars only -- see the note on the one-off session below.
        adaptive_pricing: { enabled: false },
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

    /* ── EVERY PRICE IS SHOWN AND CHARGED IN SINGAPORE DOLLARS ─────────────
       Stripe's ADAPTIVE PRICING converts the total into whatever currency it
       guesses the buyer's country uses, and it is on by default. The result
       is a checkout page headed "Pay FOUNDERS DOC PTE. LTD." offering
       d186,701 beside SGD 8.80, with the dong PRESELECTED, because whoever
       is looking happens to be in Vietnam.

       Three reasons that is wrong for this product, in order of importance:

       1. The customer pays 2-4% more. Stripe takes it out of the exchange
          rate rather than out of our fee, so it costs the firm nothing and
          costs the buyer something -- precisely the sort of charge a law
          firm should not be adding to its own invoice by accident.
       2. The site says S$8.80 everywhere. A page that then quotes a
          six-figure number in another currency reads as a mistake.
       3. It is decided by GEOGRAPHY, not by choice. A Singapore firm's
          Singapore customer sees SGD; the same page shown to that customer
          on holiday does not. A price should not depend on where somebody
          happens to be standing.

       There is a switch for this in the Dashboard, and the Dashboard is the
       wrong place for it: account-wide, invisible from the code, and one
       click from being turned back on by somebody who does not know what it
       does. Setting it per session states what this integration requires,
       inside the integration.

       The SGD guard above is a DIFFERENT check and does not cover this. That
       one asks what currency the PRICE is denominated in, which stays SGD.
       This is about what the buyer is shown and charged at the till. */
    const session = await s.checkout.sessions.create({
      mode: "payment",
      adaptive_pricing: { enabled: false },
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
    /* ── SAY WHAT WENT WRONG ──────────────────────────────────────────────
       This used to answer every failure with "Could not start checkout.
       Please try again." Trying again never helped, because nothing that
       reaches here is transient — it is a missing product, a portal feature
       nobody switched on, a subscription in a state Stripe will not change.
       The customer retried, FD saw the same red line, and the actual reason
       sat in a server log nobody was reading.

       Stripe's own message is specific and safe to show: it names the
       parameter or the feature at fault and contains no card data, no keys
       and no other customer's details. */
    const stripeErr = err as { type?: string; code?: string; message?: string };
    const detail = typeof stripeErr?.message === "string" ? stripeErr.message : "";

    console.error("[billing] checkout failed:", {
      lookupKey: key,
      type: stripeErr?.type,
      code: stripeErr?.code,
      message: detail,
    });

    /* The one failure worth translating, because the fix is ours and the
       Stripe wording ("No such configuration") would send FD hunting in the
       dashboard for something this code is supposed to create. */
    if (/portal|configuration/i.test(detail)) {
      return NextResponse.json(
        {
          error:
            "The billing portal is not set up for plan changes on this Stripe account yet. " +
            "This should configure itself on the next attempt — if it keeps happening, the " +
            "membership products may be missing from Stripe.",
          code: "portal_not_configured",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error: detail
          ? `Stripe could not start this: ${detail}`
          : "Could not start checkout, and Stripe gave no reason. The server log has the details.",
      },
      { status: 500 },
    );
  }
}
