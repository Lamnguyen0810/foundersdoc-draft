import type Stripe from "stripe";
import { MEMBERSHIPS } from "./plans";
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

let cached: string | null = null;

/** The Stripe product behind each membership price, by lookup key. */
async function membershipProducts(
  s: Stripe,
): Promise<{ product: string; prices: string[] }[]> {
  const keys = MEMBERSHIPS.map((m) => m.lookupKey);
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

export async function portalConfigurationId(): Promise<string | undefined> {
  if (cached) return cached;

  const s = stripe();

  // Already made, on a previous deploy or a previous process.
  const existing = await s.billingPortal.configurations.list({ active: true, limit: 100 });
  const found = existing.data.find((c) => c.metadata?.fdai === MARKER);
  if (found) {
    cached = found.id;
    return cached;
  }

  const products = await membershipProducts(s);

  /* No memberships in this Stripe account yet. Returning undefined lets the
     caller fall back to the account's default configuration rather than
     failing — a portal with fewer features still beats no portal. */
  if (products.length === 0) return undefined;

  const created = await s.billingPortal.configurations.create({
    business_profile: { headline: "Founders Doc — FD AI membership" },
    metadata: { fdai: MARKER },
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

  cached = created.id;
  return cached;
}

/** Forget the cached id — for tests, and after a configuration is changed. */
export function resetPortalConfigurationCache(): void {
  cached = null;
}
