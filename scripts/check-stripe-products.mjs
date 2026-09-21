/**
 * Reads a Stripe account and says whether every product this site sells exists
 * there, at the right price, in the right currency.
 *
 *   node scripts/check-stripe-products.mjs sk_live_...
 *
 * READ-ONLY. It creates nothing, changes nothing and archives nothing, so it
 * is safe to point at the live account at any time — including from a laptop
 * on a train, which is when this question usually gets asked.
 *
 * ── WHAT IT IS CHECKING ─────────────────────────────────────────────────────
 * Nothing in this codebase names a Stripe price id. Every purchase asks Stripe
 * for a price by LOOKUP KEY, which is a string we chose. If that string does
 * not exist in the account being charged, the buy button fails — not at the
 * card form, but before it, with "No active Stripe price with lookup key…".
 *
 * That is the good failure. The quiet ones are the other two:
 *
 *   • Stripe's amount differs from the price list in plans.ts. Stripe wins.
 *     The page can say S$8.80 while the card is charged something else.
 *   • The price is denominated in the wrong currency. The page writes "S$"
 *     regardless, and the customer finds out from their statement.
 *
 * /billing shows both of these to whoever is looking at it. This says the same
 * thing in a terminal, for the whole catalogue at once, without a browser and
 * without being signed in as anybody.
 */
import Stripe from "stripe";
import { PACKS, MEMBERSHIPS, TOPUPS, SELLING_CURRENCY, money } from "../src/lib/billing/plans.ts";

const clean = (s) => (s ?? "").trim().replace(/^["']|["']$/g, "").trim();
const key = clean(process.argv[2]);

if (!/^sk_(live|test)_/.test(key)) {
  console.error(
    "\nusage: node scripts/check-stripe-products.mjs <sk_live_... or sk_test_...>\n\n" +
      "  Stripe → Developers → API keys → Secret key → Reveal.\n" +
      "  Read-only: nothing is created or changed.\n",
  );
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });

let account;
try {
  account = await stripe.accounts.retrieve();
} catch (err) {
  console.error(`\nStripe rejected that key: ${err?.message ?? err}\n`);
  process.exit(1);
}

const live = key.startsWith("sk_live_");
const who = account.settings?.dashboard?.display_name;
console.log(`\n${live ? "LIVE" : "sandbox"}${who ? ` — ${who}` : ""} (${account.id})\n`);

const items = [
  ...PACKS.map((p) => ({ ...p, group: "bundle" })),
  ...MEMBERSHIPS.map((m) => ({ ...m, group: "membership" })),
  ...TOPUPS.map((t) => ({ ...t, group: "top-up" })),
];

/* One call rather than one per product: eleven round trips to answer a
   question this simple would be slower than the browser doing it. */
const found = await stripe.prices.list({
  lookup_keys: items.map((i) => i.lookupKey),
  active: true,
  limit: 100,
});
const byKey = new Map(found.data.filter((p) => p.lookup_key).map((p) => [p.lookup_key, p]));

const pad = (s, n) => String(s).padEnd(n);
let problems = 0;

console.log(pad("LOOKUP KEY", 24) + pad("IN THE CODE", 14) + pad("IN STRIPE", 14) + "VERDICT");
console.log("─".repeat(78));

for (const item of items) {
  const p = byKey.get(item.lookupKey);
  const ours = money(item.amountCents);

  if (!p) {
    problems++;
    console.log(
      pad(item.lookupKey, 24) + pad(ours, 14) + pad("—", 14) + "✗ MISSING — cannot be bought",
    );
    continue;
  }

  const theirs = `${(p.unit_amount / 100).toFixed(2)} ${p.currency.toUpperCase()}`;
  const wrongCurrency = p.currency.toLowerCase() !== SELLING_CURRENCY;
  const wrongAmount = p.unit_amount !== item.amountCents;

  /* A membership must be a recurring price and a bundle must not be. Getting
     this the wrong way round creates a subscription where a customer expected
     to pay once, which is the complaint nobody wants to receive. */
  const shouldRecur = item.group === "membership";
  const doesRecur = Boolean(p.recurring);

  const notes = [];
  if (wrongCurrency) notes.push("✗ WRONG CURRENCY");
  if (wrongAmount) notes.push("✗ AMOUNT DIFFERS — Stripe wins");
  if (shouldRecur !== doesRecur) {
    notes.push(doesRecur ? "✗ RECURRING but sold as one-off" : "✗ ONE-OFF but sold as a membership");
  }
  if (notes.length) problems += notes.length;

  console.log(pad(item.lookupKey, 24) + pad(ours, 14) + pad(theirs, 14) + (notes.join("  ") || "✓"));
}

console.log("─".repeat(78));

if (problems === 0) {
  console.log(`\n✓ All ${items.length} products exist in this account, at the prices the site shows.\n`);
} else {
  console.log(`\n${problems} problem(s).\n`);
  console.log("  MISSING        — run scripts/create-stripe-products.mjs against this account.");
  console.log("  AMOUNT DIFFERS — a price's amount cannot be edited in Stripe. Either change");
  console.log("                   plans.ts to agree, or use scripts/set-pack-price.mjs, which");
  console.log("                   creates a new price and moves the lookup key onto it.");
  console.log("  WRONG CURRENCY — archive that price and create it again in SGD.\n");
  process.exit(1);
}
