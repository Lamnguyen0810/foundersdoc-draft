/**
 * Change what an FD Sign plan costs (0227).
 *
 *   node scripts/set-sign-price.mjs sk_test_... fdsign_personal 8.50
 *   node scripts/set-sign-price.mjs sk_live_... fdsign_personal 8.50 --live
 *
 * Stripe never edits a price: a price is the record of what somebody agreed to pay. So this makes a NEW
 * monthly SGD price on the same product, moves the lookup key onto it (new buyers get it straight
 * away) and archives the old one. People already subscribed keep the old price; it is listed below, so
 * nobody is moved without a decision.
 *
 * Then change the same plan's amountCents in src/lib/billing/sign-plans.ts (the line is printed), so the
 * comparison page and the plan text say the same as Stripe charges. A plan's number of requests or its
 * name is only that file: change it there and deploy.
 */
import Stripe from "stripe";
import { SIGN_PRODUCTS } from "../src/lib/billing/sign-plans.ts";

const clean = (s) => (s ?? "").trim().replace(/^["']|["']$/g, "").trim();
const key = clean(process.argv[2]);
const lookupKey = clean(process.argv[3]);
const amount = clean(process.argv[4]);
const allowLive = process.argv.includes("--live");

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const plan = SIGN_PRODUCTS.find((p) => p.lookupKey === lookupKey);
if (!/^sk_(live|test)_/.test(key) || !plan || !/^\d+(\.\d{1,2})?$/.test(amount)) {
  die(
    "usage:  node scripts/set-sign-price.mjs <sk_test_... | sk_live_...> <plan> <S$ a month> [--live]\n\n" +
      "  plans:  " + SIGN_PRODUCTS.map((p) => `${p.lookupKey} (${p.label})`).join(", ") + "\n" +
      "  e.g.    node scripts/set-sign-price.mjs sk_test_... fdsign_personal 8.50",
  );
}
if (key.startsWith("sk_live_") && !allowLive) die("That is a LIVE key. Run it again with --live on the end if that is what you want.");

const cents = Math.round(Number(amount) * 100);
if (cents < 100) die("A plan under S$1.00 a month looks like a typo. Nothing was changed.");

const stripe = new Stripe(key);
const mode = key.startsWith("sk_live_") ? "LIVE" : "test";

const current = (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })).data[0];
if (!current) die(`No active price "${lookupKey}" in this ${mode} account. Run scripts/create-stripe-products.mjs first.`);
if (current.unit_amount === cents) die(`${plan.label} is already S$${(cents / 100).toFixed(2)} a month. Nothing to change.`);

const product = typeof current.product === "string" ? current.product : current.product.id;
const next = await stripe.prices.create({
  product,
  currency: "sgd",
  unit_amount: cents,
  recurring: { interval: "month" },
  lookup_key: lookupKey,
  transfer_lookup_key: true,
  metadata: { ...current.metadata, replaces: current.id },
});
await stripe.prices.update(current.id, { active: false });

const subs = await stripe.subscriptions.list({ price: current.id, status: "active", limit: 100 });

console.log(`\n  ✓ ${mode}: ${plan.label} S$${((current.unit_amount ?? 0) / 100).toFixed(2)} → S$${(cents / 100).toFixed(2)} a month`);
console.log(`    new buyers get ${next.id}; the old price ${current.id} is archived.`);
console.log(
  subs.data.length
    ? `    ${subs.data.length}${subs.has_more ? "+" : ""} subscriber(s) stay on the old price until moved (ask before moving them).`
    : "    nobody was subscribed to the old price.",
);
console.log(`\n  Now in src/lib/billing/sign-plans.ts set ${plan.tier}'s amountCents to ${cents}, then deploy.\n`);
