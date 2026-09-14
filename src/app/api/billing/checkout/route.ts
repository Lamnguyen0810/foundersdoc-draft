import { type NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { isStripeConfigured, siteUrl, stripe } from "@/lib/billing/stripe";
import { packByLookupKey } from "@/lib/billing/packs";

/**
 * Start a purchase.
 *
 * The browser asks for a pack by lookup key and gets back a URL to Stripe's own
 * hosted checkout page. That indirection is the entire PCI story: a card number
 * is typed on stripe.com, into Stripe's form, and this server never sees one —
 * not in a request body, not in a log, not in a crash report. For a law firm
 * that is not a nicety, it is the difference between a payment page and a
 * compliance programme.
 *
 * The AMOUNT is never sent from the browser. The browser names a pack; the
 * price is fetched from Stripe by lookup key. Otherwise anyone could edit the
 * request and buy 25 documents for a dollar.
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
  const pack = body.lookupKey ? packByLookupKey(body.lookupKey) : undefined;
  if (!pack) {
    return NextResponse.json({ error: "Unknown pack." }, { status: 400 });
  }

  const s = stripe();
  const origin = siteUrl(req.nextUrl.origin);

  try {
    // Price by lookup key, so test and live differ only by which keys are set.
    const prices = await s.prices.list({ lookup_keys: [pack.lookupKey], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) {
      return NextResponse.json(
        {
          error:
            `No active Stripe price with lookup key "${pack.lookupKey}". Create the product in ` +
            `Stripe and set that lookup key on its price.`,
        },
        { status: 500 },
      );
    }

    /* One Stripe customer per account, found by email and remembered on the
       session. Without this, a returning buyer becomes a second customer and
       the firm's Stripe dashboard fills with duplicates of the same person. */
    const existing = await s.customers.list({ email: user.email, limit: 1 });
    const customer =
      existing.data[0] ??
      (await s.customers.create({ email: user.email, metadata: { supabase_user_id: user.id } }));

    const session = await s.checkout.sessions.create({
      mode: "payment",
      customer: customer.id,
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${origin}/billing?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?cancelled=1`,
      // The webhook trusts these, and nothing else, to decide who gets credited.
      metadata: {
        supabase_user_id: user.id,
        credits: String(pack.credits),
        lookup_key: pack.lookupKey,
      },
      payment_intent_data: {
        metadata: { supabase_user_id: user.id, credits: String(pack.credits) },
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
