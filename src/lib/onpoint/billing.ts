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
/* 0281: the fee proposal: S$280 one-off setup (early-adopter, normally S$1,088), S$80/month for the first
   3 months, then S$180/month; GST not included. In Stripe: the monthly price (above), a one-off setup price
   and a coupon of S$100 off the monthly plan for 3 months. "Create prices in Stripe" makes all three. */
export const SETUP_KEY = () => process.env.ONPOINT_SETUP_LOOKUP?.trim() || "onpoint_setup";
export const COUPON_ID = () => process.env.ONPOINT_INTRO_COUPON?.trim() || "onpoint_intro";
export const PLAN = { setup: 28_000, setup_was: 108_800, intro: 8_000, intro_months: 3, monthly: 18_000, currency: "sgd" } as const;
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

/** 0281: card payment is "opening soon" until Founders Doc opens it; until then everything is free */
export async function billingOpen(wsId: string): Promise<boolean> {
  const r = await db().from("onpoint_workspaces").select("billing_open").eq("id", wsId).maybeSingle();
  return !r.error && (r.data as { billing_open?: boolean } | null)?.billing_open === true;
}
export async function setBillingOpen(m: Me, on: boolean) {
  if (!m.founder) throw new OpError("Only Founders Doc can open billing.", 403);
  forgetPlan(m.ws.id);
  const r = await db().from("onpoint_workspaces").update({ billing_open: on, updated_at: new Date().toISOString() }).eq("id", m.ws.id);
  if (r.error) {
    const missing = /billing_open/.test(r.error.message);
    throw new OpError(missing ? "Run supabase/140_onpoint_billing_open.sql first." : r.error.message, missing ? 503 : 500);
  }
}

async function remember(wsId: string, customer: string | null, sub: string | null) {
  const r = await db()
    .from("onpoint_workspaces")
    .update({ stripe_customer_id: customer, stripe_subscription_id: sub, billing_linked_at: new Date().toISOString() })
    .eq("id", wsId);
  if (r.error) throw new OpError(r.error.message, 500);
}

const idOf = (v: string | { id: string } | null | undefined) => (v == null ? null : typeof v === "string" ? v : v.id);

async function thePrice(key = PRICE_KEY()): Promise<Stripe.Price | null> {
  const r = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1, expand: ["data.product"] });
  return r.data[0] ?? null;
}
async function theCoupon(): Promise<Stripe.Coupon | null> {
  try {
    const c = await stripe().coupons.retrieve(COUPON_ID());
    return c.valid ? c : null;
  } catch {
    return null;
  }
}

/** Founders Doc: make the proposal's prices in Stripe (in the mode of the key set: test or live). Safe twice. */
export async function setupStripe(m: Me) {
  if (!m.founder) throw new OpError("Only Founders Doc can set up prices.", 403);
  if (!isStripeConfigured()) throw new OpError("Stripe is not set up on this site.", 503);
  const s = stripe();
  const made: string[] = [];
  let monthly = await thePrice();
  if (!monthly) {
    const prod = await s.products.create({ name: "OnPoint Workflows", description: "Reminder system: unlimited users, hosting, updates, support and maintenance", metadata: { product: "onpoint" } });
    monthly = await s.prices.create({ product: prod.id, currency: PLAN.currency, unit_amount: PLAN.monthly, recurring: { interval: "month" }, lookup_key: PRICE_KEY(), nickname: "OnPoint monthly", tax_behavior: "exclusive", metadata: { product: "onpoint" } });
    made.push("monthly price S$180");
  }
  if (!(await thePrice(SETUP_KEY()))) {
    const prod = await s.products.create({ name: "OnPoint Workflows · one-off setup", description: "Workspace configuration, white-labelling, schedule migration and onboarding (early-adopter price)", metadata: { product: "onpoint" } });
    await s.prices.create({ product: prod.id, currency: PLAN.currency, unit_amount: PLAN.setup, lookup_key: SETUP_KEY(), nickname: "OnPoint setup", tax_behavior: "exclusive", metadata: { product: "onpoint" } });
    made.push("setup price S$280");
  }
  if (!(await theCoupon())) {
    const product = typeof monthly.product === "string" ? monthly.product : monthly.product.id;
    await s.coupons.create({ id: COUPON_ID(), name: "Early adopter: S$80/month for 3 months", amount_off: PLAN.monthly - PLAN.intro, currency: PLAN.currency, duration: "repeating", duration_in_months: PLAN.intro_months, applies_to: { products: [product] }, metadata: { product: "onpoint" } });
    made.push("first-3-months coupon (S$100 off)");
  }
  return { made };
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
  /** 0281: opening soon until Founders Doc opens it; the plan from the fee proposal; what is ready in Stripe */
  open: boolean;
  plan: typeof PLAN;
  ready: { monthly: boolean; setup: boolean; coupon: boolean; tax: boolean };
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
  const base: BillingView = {
    configured: isStripeConfigured(),
    mode: stripeMode(),
    open: await billingOpen(m.ws.id),
    plan: PLAN,
    ready: { monthly: false, setup: false, coupon: false, tax: !!TAX_RATE() },
    price: null,
    sub: null,
    card: null,
    invoices: [],
  };
  if (!base.configured) return base;
  const s = stripe();
  const [price, sub, setup, coupon] = await Promise.all([thePrice(), findSubscription(m.ws.id), thePrice(SETUP_KEY()), theCoupon()]);
  base.ready = { monthly: !!price, setup: !!setup, coupon: !!coupon, tax: !!TAX_RATE() };
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
  /* 0281: opening soon: OnPoint cannot pay yet (Founders Doc can, to test) */
  if (!m.founder && !(await billingOpen(m.ws.id))) throw new OpError("Card payment is opening soon. Until then, OnPoint Workflows is free to use.", 403);
  const [price, setup, coupon] = await Promise.all([thePrice(), thePrice(SETUP_KEY()), theCoupon()]);
  if (!price) throw new OpError(`The monthly price is not set up in Stripe yet (lookup key “${PRICE_KEY()}”).`, 503);
  const have = await ids(m.ws.id);
  const meta = { product: "onpoint", onpoint_workspace: m.ws.id };
  const tax = TAX_RATE();
  const taxed = tax ? { tax_rates: [tax] } : {};
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    /* the one-off setup goes on the first invoice only; the coupon makes the first 3 months S$80 */
    line_items: [{ price: price.id, quantity: 1, ...taxed }, ...(setup ? [{ price: setup.id, quantity: 1, ...taxed }] : [])],
    ...(coupon ? { discounts: [{ coupon: coupon.id }] } : { allow_promotion_codes: true }),
    ...(have.stripe_customer_id ? { customer: have.stripe_customer_id } : m.founder ? {} : { customer_email: m.email }),
    subscription_data: { metadata: meta, description: "OnPoint Workflows · monthly subscription" },
    metadata: meta,
    billing_address_collection: "auto",
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
  forgetPlan(m.ws.id);
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

/* ── the plan and going live (0283) ─────────────────────────────────────
 * As in the proposal's rollout: 1 connect your data, 2 set the rules, 3 test run (all part of the setup, in test
 * mode), 4 go live = reminders reach the clients. Once card payment is open, going live needs an active plan
 * (paid, or Stripe still retrying a failed card). Signing in, the dashboard and Billing always work, so OnPoint
 * can set up, see its data and pay. Like the old design: a plan that ends stops the sending, not the access.
 */
export type PlanState = "free" | "active" | "retrying" | "none";
const planCache = new Map<string, { state: PlanState; until: number }>();
export async function planState(wsId: string): Promise<PlanState> {
  const hit = planCache.get(wsId);
  if (hit && hit.until > Date.now()) return hit.state;
  let state: PlanState = "free";
  if (await billingOpen(wsId)) {
    state = "none";
    if (isStripeConfigured()) {
      const sub = await findSubscription(wsId).catch(() => null);
      state = sub?.status === "active" || sub?.status === "trialing" ? "active" : sub?.status === "past_due" ? "retrying" : "none";
    }
  }
  planCache.set(wsId, { state, until: Date.now() + 5 * 60_000 });
  return state;
}
export const forgetPlan = (wsId: string) => planCache.delete(wsId);
/** may reminders go to the clients themselves (not the test inbox)? */
export const liveAllowed = (state: PlanState) => state !== "none";
