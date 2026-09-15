/**
 * Reads back every FD AI price from Stripe and says whether it is right.
 *
 *   node scripts/check-stripe-prices.mjs sk_test_...
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
 * The price list in plans.ts is what the firm decided. Stripe holds what the
 * customer is actually charged. They drift — a price created by hand in the
 * dashboard, a leftover from an experiment, a product created before the
 * currency was settled — and the drift is invisible until somebody's card
 * statement disagrees with the page they bought from.
 *
 * Three things are checked, in order of how much they cost if wrong:
 *   1. CURRENCY. Everything is sold in Singapore dollars. A price in USD is
 *      charged in USD while the page still says S$.
 *   2. AMOUNT. Stripe's figure against the firm's.
 *   3. EXISTENCE. A missing lookup key is a button that leads to an error.
 *
 * Read-only. It creates nothing, changes nothing, and is safe against the live
 * account — which is why, unlike the create script, it does not ask for --live.
 */
import Stripe from "stripe";
import { PACKS, MEMBERSHIPS, TOPUPS, SELLING_CURRENCY, money, moneyIn } from "../src/lib/billing/plans.ts";

const key = (process.argv[2] ?? process.env.STRIPE_SECRET_KEY ?? "")
  .trim()
  .replace(/^["']|["']$/g, "");

if (!key) {
  console.error("usage: node scripts/check-stripe-prices.mjs <sk_test_... | sk_live_...>");
  process.exit(1);
}
if (!/^sk_(test|live)_/.test(key)) {
  console.error("\nThat is not a Stripe SECRET key (it should start sk_test_ or sk_live_).\n");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });
const mode = key.startsWith("sk_live_") ? "LIVE" : "test";
const items = [...PACKS, ...MEMBERSHIPS, ...TOPUPS];

console.log(`\nReading prices from the ${mode} Stripe account…\n`);

let prices = [];
try {
  const res = await stripe.prices.list({
    lookup_keys: items.map((i) => i.lookupKey),
    active: true,
    limit: 100,
  });
  prices = res.data;
} catch (err) {
  console.error(`Could not read from Stripe: ${err.message}`);
  process.exit(1);
}

const byKey = new Map(prices.filter((p) => p.lookup_key).map((p) => [p.lookup_key, p]));

const problems = [];
const pad = (s, n) => String(s).padEnd(n);

console.log(pad("LOOKUP KEY", 24) + pad("STRIPE", 14) + pad("EXPECTED", 14) + "STATUS");
console.log("─".repeat(72));

for (const item of items) {
  const live = byKey.get(item.lookupKey);
  const expected = money(item.amountCents) + (item.tier ? " /mo" : "");

  if (!live || live.unit_amount == null) {
    console.log(pad(item.lookupKey, 24) + pad("—", 14) + pad(expected, 14) + "✗ missing");
    problems.push(`${item.lookupKey} does not exist — run create-stripe-products.mjs`);
    continue;
  }

  const shown = moneyIn(live.unit_amount, live.currency);
  const wrongCurrency = live.currency.toLowerCase() !== SELLING_CURRENCY;
  const wrongAmount = live.unit_amount !== item.amountCents;

  const notes = [];
  if (wrongCurrency) notes.push(`✗ ${live.currency.toUpperCase()}, not SGD`);
  if (wrongAmount) notes.push("✗ amount differs");
  if (!notes.length) notes.push("✓");

  console.log(pad(item.lookupKey, 24) + pad(shown, 14) + pad(expected, 14) + notes.join("  "));

  if (wrongCurrency) {
    problems.push(
      `${item.lookupKey} is priced in ${live.currency.toUpperCase()}. Archive price ${live.id} ` +
        `in Stripe and re-run create-stripe-products.mjs to make it again in SGD.`,
    );
  }
  if (wrongAmount) {
    problems.push(
      `${item.lookupKey}: Stripe charges ${shown}, the price list says ${money(item.amountCents)}. ` +
        `Stripe wins — archive price ${live.id} and re-create it, or change plans.ts to match.`,
    );
  }
}

console.log();

if (!problems.length) {
  console.log(`Everything is in Singapore dollars and matches the price list.\n`);
  process.exit(0);
}

console.log(`${problems.length} thing${problems.length === 1 ? "" : "s"} to fix:\n`);
problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}\n`));
process.exit(1);
