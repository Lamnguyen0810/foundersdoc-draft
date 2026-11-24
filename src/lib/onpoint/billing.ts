import "server-only";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isStripeConfigured, stripe, stripeMode } from "@/lib/billing/stripe";
import { OpError, type Me } from "./server";

/**
 * OnPoint's monthly card subscription (0269), in FD's own Stripe account.
 *
 * - The amount is NOT in code. It is the Stripe Price with lookup key `onpoint_monthly` (or the key in
 *   ONPOINT_PRICE_LOOKUP), so changing the fee is a Stripe dashboard change, in test and in live mode.
 * - GST: if ONPOINT_TAX_RATE_ID names a Stripe tax rate (e.g. "GST 9%, exclusive"), it is added to every invoice.
 * - The card is entered on Stripe's own checkout page and never reaches this system. Stripe charges it every
 *   month and emails the receipt; the page here only reads the plan, the card's last 4 digits and the invoices.
 * - Cancelling is by writing to us (the LOE's term), so the card portal lets OnPoint update the card and see
 *   invoices, not cancel.
 * - Every OnPoint object carries metadata product=onpoint, onpoint_workspace=<id>, so FD AI's own webhook
 *   (memberships) ignores them and the subscription can always be found again.
 */

export const PRICE_KEY = () => process.env.ONPOINT_PRICE_LOOKUP?.trim() || "onpoint_monthly";
const TAX_RATE = () => process.env.ONPOINT_TAX_RATE_ID?.trim() || "";
const PORTAL_MARKER = "onpoint_portal_v1";
const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

const db = () => supabaseAdmin();

interface Ids {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

async function ids(wsId: string): Promise<Ids> {
  const r = await db().from("onpoint_workspaces").select("stripe_customer_id, stripe_subscription_id").eq("id", wsId).maybeSingle();
  if (r.error) throw new OpError(r.error.message, 500);
  return (r.data as Ids | null) ?? { stripe_customer_id: null, stripe_subscription_id: null };
}

async function remember(wsId: string, customer: string | null, sub: string | null) {
  const r = await db()
    .from("onpoint_workspaces")
    .update({ stripe_customer_id: customer, stripe_subscription_id: sub, billing_linked_at: new Date().toISOString() })
    .eq("id", wsId);
  if (r.error) throw new OpError(r.error.message, 500);
}

const idOf = (v: string | { id: string } | null | undefined) => (v == null ? null : typeof v === "string" ? v : v.id);

async function thePrice(): Promise<Stripe.Price | null> {
  const r = await stripe().prices.list({ lookup_keys: [PRICE_KEY()], active: true, limit: 1, expand: ["data.product"] });
  return r.data[0] ?? null;
}

/** the subscription on file, or found again by its metadata (after a checkout whose return page was closed) */
async function findSubscription(wsId: string): Promise<Stripe.Subscription | null> {
  const s = stripe();
  const have = await ids(wsId);
  const expand = ["default_payment_method", "customer"];
  if (have.stripe_subscription_id) {
    try {
      const sub = await s.subscriptions.retrieve(have.stripe_subscription_id, { expand });
      if (sub.status !== "canceled" && sub.status !== "incomplete_expired") return sub;
    } catch {
      /* deleted in Stripe or the other mode's id: look again below */
    }
  }
  try {
    const found = await s.subscriptions.search({ query: `metadata['onpoint_workspace']:'${wsId}'`, limit: 10, expand: expand.map((e) => `data.${e}`) });
    const sub = found.data.filter((x) => LIVE.has(x.status)).sort((a, b) => b.created - a.created)[0];
    if (sub) {
      await remember(wsId, idOf(sub.customer), sub.id);
      return sub;
    }
  } catch {
    /* search is not available on every account; the stored id is then the only way */
  }
  return null;
}

export interface BillingView {
  configured: boolean;
  mode: "test" | "live" | "unset";
  price: { name: string; amount: number; currency: string; interval: string; tax: boolean } | null;
  sub: {
    status: string;
    cancel_at_period_end: boolean;
    renews_on: string | null;
    started_on: string;
    amount: number | null;
    currency: string;
    email: string | null;
  } | null;
  card: { brand: string; last4: string; exp: string } | null;
  invoices: Array<{ id: string; number: string | null; date: string; amount: number; currency: string; status: string; url: string | null; pdf: string | null }>;
}

const day = (unix: number | null | undefined) => (unix ? new Date(unix * 1000 + 8 * 3_600_000).toISOString().slice(0, 10) : null);

export async function billingView(m: Me): Promise<BillingView> {
  const base: BillingView = { configured: isStripeConfigured(), mode: stripeMode(), price: null, sub: null, card: null, invoices: [] };
  if (!base.configured) return base;
  const s = stripe();
  const [price, sub] = await Promise.all([thePrice(), findSubscription(m.ws.id)]);
  if (price) {
    const product = typeof price.product === "object" && price.product && "name" in price.product ? price.product.name : "OnPoint Workflows";
    base.price = { name: product, amount: price.unit_amount ?? 0, currency: price.currency, interval: price.recurring?.interval ?? "month", tax: !!TAX_RATE() };
  }
  if (!sub) return base;
  const item = sub.items.data[0];
  const customer = typeof sub.customer === "object" && sub.customer && !("deleted" in sub.customer && sub.customer.deleted) ? (sub.customer as Stripe.Customer) : null;
  base.sub = {
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    renews_on: day(item?.current_period_end),
    started_on: day(sub.start_date) ?? "",
    amount: item?.price?.unit_amount ?? null,
    currency: item?.price?.currency ?? "sgd",
    email: customer?.email ?? null,
  };
  let pm = typeof sub.default_payment_method === "object" ? sub.default_payment_method : null;
  if (!pm && customer?.invoice_settings?.default_payment_method) {
    const id = idOf(customer.invoice_settings.default_payment_method as string | { id: string });
    pm = id ? await s.paymentMethods.retrieve(id).catch(() => null) : null;
  }
  if (pm?.card) base.card = { brand: pm.card.brand, last4: pm.card.last4, exp: `${String(pm.card.exp_month).padStart(2, "0")}/${String(pm.card.exp_year).slice(-2)}` };
  const cust = idOf(sub.customer);
  if (cust) {
    const inv = await s.invoices.list({ customer: cust, limit: 12 });
    base.invoices = inv.data
      .filter((i) => i.status !== "draft")
      .map((i) => ({ id: i.id ?? "", number: i.number, date: day(i.created) ?? "", amount: i.total, currency: i.currency, status: i.status ?? "open", url: i.hosted_invoice_url ?? null, pdf: i.invoice_pdf ?? null }));
  }
  return base;
}

/** a Stripe Checkout page for the monthly plan; the card is entered there, never here */
export async function startCheckout(m: Me, origin: string): Promise<string> {
  if (!isStripeConfigured()) throw new OpError("Card payments are not set up yet.", 503);
  const s = stripe();
  const existing = await findSubscription(m.ws.id);
  if (existing && LIVE.has(existing.status) && existing.status !== "incomplete") throw new OpError("OnPoint already has a monthly plan. Use “Update card” to change the card.", 409);
  const price = await thePrice();
  if (!price) throw new OpError(`The monthly price is not set up in Stripe yet (lookup key “${PRICE_KEY()}”).`, 503);
  const have = await ids(m.ws.id);
  const meta = { product: "onpoint", onpoint_workspace: m.ws.id };
  const tax = TAX_RATE();
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1, ...(tax ? { tax_rates: [tax] } : {}) }],
    ...(have.stripe_customer_id ? { customer: have.stripe_customer_id } : m.founder ? {} : { customer_email: m.email }),
    subscription_data: { metadata: meta, description: "OnPoint Workflows · monthly subscription" },
    metadata: meta,
    billing_address_collection: "auto",
    allow_promotion_codes: true,
    success_url: `${origin}/onpoint?billing=done&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/onpoint?billing=cancelled`,
  });
  if (!session.url) throw new OpError("Stripe did not return a payment page.", 502);
  return session.url;
}

/** after Stripe sends them back: link the new subscription to this workspace */
export async function confirmCheckout(m: Me, sessionId: string): Promise<boolean> {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId) || !isStripeConfigured()) return false;
  const session = await stripe().checkout.sessions.retrieve(sessionId).catch(() => null);
  if (!session || session.metadata?.onpoint_workspace !== m.ws.id || session.status !== "complete") return false;
  await remember(m.ws.id, idOf(session.customer), idOf(session.subscription));
  return true;
}

async function portalConfig(s: Stripe): Promise<string> {
  const list = await s.billingPortal.configurations.list({ active: true, limit: 100 });
  const found = list.data.find((c) => c.metadata?.fdai === PORTAL_MARKER);
  if (found) return found.id;
  const made = await s.billingPortal.configurations.create({
    business_profile: { headline: "Founders Doc — OnPoint Workflows" },
    metadata: { fdai: PORTAL_MARKER },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
  });
  return made.id;
}

/** Stripe's page to change the card, billing email or address, and download invoices */
export async function portalUrl(m: Me, origin: string): Promise<string> {
  if (!isStripeConfigured()) throw new OpError("Card payments are not set up yet.", 503);
  const s = stripe();
  const sub = await findSubscription(m.ws.id);
  const customer = sub ? idOf(sub.customer) : (await ids(m.ws.id)).stripe_customer_id;
  if (!customer) throw new OpError("There is no card on file yet. Set up the monthly payment first.", 404);
  const session = await s.billingPortal.sessions.create({ customer, return_url: `${origin}/onpoint?view=billing`, configuration: await portalConfig(s) });
  return session.url;
}
