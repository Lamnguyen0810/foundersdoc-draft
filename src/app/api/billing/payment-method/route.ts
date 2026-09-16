import { type NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isStripeConfigured, siteUrl, stripe } from "@/lib/billing/stripe";
import { portalConfigurationId } from "@/lib/billing/portal";

/**
 * "Update payment method" — straight to Stripe's card form.
 *
 * ── WHY ITS OWN ROUTE ───────────────────────────────────────────────────────
 * This used to borrow the checkout route, naming the plan the customer is on
 * and hoping to be handed the portal back. That worked only for a member with
 * a live subscription, and it landed them on the portal's front page to find
 * the card themselves. Worse, the same route can create a Checkout session, so
 * a button meant to change a card sat one branch away from one that takes
 * money.
 *
 * This route can do exactly one thing: open Stripe's payment-method update
 * flow for the signed-in customer, and come back here afterwards. It cannot
 * charge, cancel or change a plan.
 *
 * The card itself is typed on stripe.com, into Stripe's form — this server
 * never sees a card number, which is the whole reason for going out to Stripe
 * rather than collecting one ourselves.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Payments are not switched on yet." }, { status: 503 });
  }

  const user = await getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  /* The customer id is recorded by the webhook on the first payment. No id
     means nobody has ever paid, so there is no card to change — and Stripe
     would have nothing to show. */
  let customerId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("billing_accounts")
      .select("stripe_customer_id")
      .maybeSingle();
    customerId = (data?.stripe_customer_id as string | null) ?? null;
  } catch (err) {
    console.error("[payment-method] could not read the billing account:", err);
  }

  if (!customerId) {
    return NextResponse.json(
      {
        error:
          "There is no card on this account yet. One is saved the first time you buy credits or join a plan.",
      },
      { status: 409 },
    );
  }

  const origin = siteUrl(req.nextUrl.origin);

  try {
    const s = stripe();
    const session = await s.billingPortal.sessions.create({
      customer: customerId,
      configuration: await portalConfigurationId(),
      return_url: `${origin}/usage`,
      /* Straight to the card form rather than the portal's front page. */
      flow_data: {
        type: "payment_method_update",
        after_completion: {
          type: "redirect",
          redirect: { return_url: `${origin}/usage?card=1` },
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[payment-method] could not open the portal:", err);
    const detail = err instanceof Error ? err.message : "";

    /* The portal has to be activated once in the Stripe dashboard. Until it
       is, every call fails with the same unhelpful message, so say which
       switch is off rather than "try again". */
    if (/portal|configuration/i.test(detail)) {
      return NextResponse.json(
        {
          error:
            "Stripe's customer portal has not been activated on this account yet. " +
            "Stripe → Settings → Billing → Customer portal → Activate.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Could not open Stripe just now. Please try again in a moment." },
      { status: 502 },
    );
  }
}
