import type Stripe from "stripe";
import { MEMBERSHIPS } from "./plans";
import { SIGN_PRODUCTS } from "./sign-plans";
import { stripe } from "./stripe";

/**
 * The customer portal's configuration.
 *
 * ── WHY THIS IS IN CODE AND NOT THE DASHBOARD ───────────────────────────────
 * Stripe will not run a `subscription_update_confirm` flow unless the portal
 * configuration has plan switching turned on AND lists the products a customer
 * may switch to. That is a checkbox and a product picker in the Stripe
 * dashboard, in test mode and again in live mode, and if either is missed the
 * only symptom is that every plan change fails — which is exactly what
 * happened. A setting the application depends on to work should not live
 * somewhere the application cannot see.
 *
 * So the configuration is created here, from the same price list the pricing
 * page is built from, and found again by a marker in its metadata. Switching
 * to the live Stripe account creates it there on first use; nobody has to
 * remember anything.
 *
 * It is cached for the lifetime of the server process. Stripe allows many
 * configurations per account and this would otherwise make a new one on every
 * plan change.
 */

const MARKER = "fdai_portal_v1";

/* 0225: FD Sign's plans get a portal of their own, so a plan change there can only move between FD Sign
   plans (never from an FD Sign plan to an FD AI membership, which would leave the wrong tier on file). */
export type PortalKind = "membership" | "sign";
const MARKERS: Record<PortalKind, string> = { membership: MARKER, sign: "fdsign_portal_v1" };
const HEADLINES: Record<PortalKind, string> = { membership: "Founders Doc — FD AI membership", sign: "Founders Doc — FD Sign plan" };

const cached: Record<PortalKind, string | null> = { membership: null, sign: null };

/** The Stripe product behind each membership price, by lookup key. */
async function membershipProducts(
  s: Stripe,
  kind: PortalKind = "membership",
): Promise<{ product: string; prices: string[] }[]> {
  const keys = (kind === "sign" ? SIGN_PRODUCTS : MEMBERSHIPS).map((m) => m.lookupKey);
  const res = await s.prices.list({ lookup_keys: keys, active: true, limit: 20 });

  /* One entry per product, carrying its price. A product with no active price
     is left out rather than sent to Stripe, which would reject the whole
     configuration for one missing item. */
  const byProduct = new Map<string, string[]>();
  for (const price of res.data) {
    const product = typeof price.product === "string" ? price.product : price.product?.id;
    if (!product) continue;
    byProduct.set(product, [...(byProduct.get(product) ?? []), price.id]);
  }

  return [...byProduct].map(([product, prices]) => ({ product, prices }));
}

export async function portalConfigurationId(kind: PortalKind = "membership"): Promise<string | undefined> {
  if (cached[kind]) return cached[kind]!;

  const s = stripe();

  // Already made, on a previous deploy or a previous process.
  const existing = await s.billingPortal.configurations.list({ active: true, limit: 100 });
  const found = existing.data.find((c) => c.metadata?.fdai === MARKERS[kind]);
  if (found) {
    cached[kind] = found.id;
    return found.id;
  }

  const products = await membershipProducts(s, kind);

  /* No memberships in this Stripe account yet. Returning undefined lets the
     caller fall back to the account's default configuration rather than
     failing — a portal with fewer features still beats no portal. */
  if (products.length === 0) return undefined;

  const created = await s.billingPortal.configurations.create({
    business_profile: { headline: HEADLINES[kind] },
    metadata: { fdai: MARKERS[kind] },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
      /* At period end, not immediately: they have paid for the month and it is
         theirs. This is also what makes "cancel, then change your mind" a
         resume rather than a repurchase. */
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products,
      },
    },
  });

  cached[kind] = created.id;
  return created.id;
}

/** Forget the cached id — for tests, and after a configuration is changed. */
export function resetPortalConfigurationCache(): void {
  cached.membership = null;
  cached.sign = null;
}
