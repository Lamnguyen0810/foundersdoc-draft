import Stripe from "stripe";

/**
 * The Stripe client, and the one rule that makes test → live a config change
 * rather than a code change.
 *
 * SWAPPABILITY. Nothing in this codebase names a Stripe price id. Prices are
 * found by LOOKUP KEY ("fdai_pack_10"), which you set on the Price in both your
 * test and live Stripe accounts. Going live is then: replace three environment
 * variables, redeploy. No hunting for hard-coded `price_1Abc…` strings, which
 * is the usual way a launch breaks — test ids simply do not exist in live mode,
 * and the failure appears at the checkout button, in front of a customer.
 *
 * The key itself tells you which mode you are in: sk_test_… or sk_live_….
 * `stripeMode()` reads that and the UI shows a banner in test mode, so nobody
 * mistakes a test purchase for a real one.
 */

let cached: Stripe | null = null;

export function stripeKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function isStripeConfigured(): boolean {
  return Boolean(stripeKey());
}

export function stripeMode(): "test" | "live" | "unset" {
  const k = stripeKey();
  if (!k) return "unset";
  return k.startsWith("sk_live_") ? "live" : "test";
}

export function stripe(): Stripe {
  const key = stripeKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  if (!cached) {
    cached = new Stripe(key, {
      // Pinned deliberately. Stripe changes shapes between versions, and a
      // silent upgrade is how a webhook starts reading a field that moved.
      apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
      appInfo: { name: "FD AI", url: "https://foundersdoc.com" },
      maxNetworkRetries: 2,
    });
  }
  return cached;
}

export function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

/**
 * Where Stripe sends people back to, and what the emails link to.
 *
 * Typed by hand into a hosting dashboard, from an address bar that hides the
 * protocol — so "foundersdoc.com" without the https:// is the obvious mistake,
 * and it is not a URL. Stripe rejects a success_url like that, and the failure
 * appears at the checkout button rather than at the setting that caused it.
 *
 * So: repair the obvious, reject the unusable, and fall back to the request's
 * own origin rather than breaking. A checkout that returns to the right place
 * by accident beats one that refuses to open.
 */
export function siteUrl(fallback: string): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return fallback;

  let value = raw.replace(/^['"]|['"]$/g, "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocol");
    return parsed.origin;
  } catch {
    console.error(
      `[billing] NEXT_PUBLIC_SITE_URL is not a usable URL: ${JSON.stringify(raw)}. ` +
        "Expected e.g. https://foundersdoc.com — using the request's own origin instead.",
    );
    return fallback;
  }
}
