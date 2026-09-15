/**
 * Creates every FD AI product in a Stripe account, from the price list in
 * src/lib/billing/plans.ts.
 *
 *   node scripts/create-stripe-products.mjs sk_test_...
 *
 * ── SAFE TO RUN TWICE ───────────────────────────────────────────────────────
 * It looks for an existing price with each lookup key first. Nothing is
 * duplicated, and nothing is changed: if a price already exists it is left
 * alone and reported, because silently re-pricing a product people are already
 * subscribed to is not something a script should decide.
 *
 * ── SWAPPING TO THE LIVE ACCOUNT ────────────────────────────────────────────
 * Run this again with the live secret key. The lookup keys are identical in
 * both accounts, so the application moves from sandbox to live by changing
 * three environment variables and nothing else:
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_SITE_URL
 *
 * It refuses a live key unless you also pass --live, so that a key pasted from
 * the wrong tab cannot create products in the real account by accident.
 */
import Stripe from "stripe";
import { PACKS, MEMBERSHIPS, TOPUPS, money } from "../src/lib/billing/plans.ts";

const key = process.argv[2];
const allowLive = process.argv.includes("--live");

if (!key) {
  console.error("usage: node scripts/create-stripe-products.mjs <sk_test_... | sk_live_...> [--live]");
  process.exit(1);
}
if (key.startsWith("sk_live_") && !allowLive) {
  console.error(
    "That is a LIVE key. This creates real products in the real account.\n" +
      "If that is what you want, run it again with --live on the end.",
  );
  process.exit(1);
}

const stripe = new Stripe(key);
const mode = key.startsWith("sk_live_") ? "LIVE" : "test";
console.log(`\nCreating FD AI products in the ${mode} account.\n`);

/** Every product this app sells, flattened into one shape. */
const ITEMS = [
  ...PACKS.map((p) => ({
    lookupKey: p.lookupKey,
    name: `FD AI — ${p.label}`,
    description: `${p.credits} document${p.credits === 1 ? "" : "s"}. ${p.blurb}`,
    amountCents: p.amountCents,
    recurring: false,
    metadata: { credits: String(p.credits), kind: "pack" },
  })),
  ...MEMBERSHIPS.map((m) => ({
    lookupKey: m.lookupKey,
    name: `FD AI ${m.label} membership`,
    description: m.blurb,
    amountCents: m.amountCents,
    recurring: true,
    metadata: {
      tier: m.tier,
      monthly_credits: String(m.monthlyCredits ?? 0),
      kind: "membership",
    },
  })),
  ...TOPUPS.map((t) => ({
    lookupKey: t.lookupKey,
    name: `FD AI — member top-up, ${t.label}`,
    description: `${t.blurb} Members only.`,
    amountCents: t.amountCents,
    recurring: false,
    metadata: { credits: String(t.credits), kind: "topup" },
  })),
];

let created = 0;
let existed = 0;

for (const item of ITEMS) {
  const found = await stripe.prices.list({ lookup_keys: [item.lookupKey], active: true, limit: 1 });

  if (found.data[0]) {
    const live = found.data[0];
    const same = live.unit_amount === item.amountCents;
    console.log(
      `  = ${item.lookupKey.padEnd(24)} exists at ${money(live.unit_amount ?? 0)}` +
        (same ? "" : `  ⚠ price list says ${money(item.amountCents)}`),
    );
    existed++;
    continue;
  }

  const product = await stripe.products.create({
    name: item.name,
    description: item.description,
    metadata: item.metadata,
  });

  await stripe.prices.create({
    product: product.id,
    currency: "sgd",
    unit_amount: item.amountCents,
    lookup_key: item.lookupKey,
    ...(item.recurring ? { recurring: { interval: "month" } } : {}),
    metadata: item.metadata,
  });

  console.log(
    `  + ${item.lookupKey.padEnd(24)} created at ${money(item.amountCents)}` +
      (item.recurring ? " / month" : ""),
  );
  created++;
}

console.log(`\n${created} created, ${existed} already there.\n`);

if (created > 0) {
  console.log("Next:");
  console.log("  1. Stripe → Developers → Webhooks → add an endpoint at");
  console.log("     https://foundersdoc.com/api/billing/webhook");
  console.log("     Events: checkout.session.completed, invoice.paid,");
  console.log("             customer.subscription.created, customer.subscription.updated,");
  console.log("             customer.subscription.deleted, charge.refunded");
  console.log("  2. Copy the signing secret into STRIPE_WEBHOOK_SECRET in Vercel.");
  console.log("  3. Stripe → Settings → Billing → Customer portal → activate it,");
  console.log("     so members can change or cancel their own plan.\n");
}
