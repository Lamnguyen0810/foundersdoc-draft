/**
 * Temporarily changes what a bundle costs, and puts it back afterwards.
 *
 *   node scripts/set-pack-price.mjs sk_live_... fdai_pack_1 0.50
 *   node scripts/set-pack-price.mjs sk_live_... fdai_pack_1 --restore
 *
 * ── WHY A SCRIPT IS NEEDED AT ALL ───────────────────────────────────────────
 * Editing amountCents in plans.ts does NOT change what anybody is charged. The
 * browser names a lookup key, Stripe resolves it to a price, and Stripe's
 * figure is what the card is debited. The number in plans.ts is what the PAGE
 * says. Change only that, and the site advertises fifty cents while taking
 * S$8.80 — the worst possible direction for the two to disagree in.
 *
 * Stripe will not let a price's amount be edited either, on purpose: a price
 * is a historical record of what somebody agreed to pay. The supported move is
 * to create a NEW price and transfer the lookup key onto it, which is what
 * this does — one API call, atomic, and the old price stays exactly as it was
 * for every purchase already made against it.
 *
 * ── HOW GOING BACK WORKS ────────────────────────────────────────────────────
 * The original price's id is written into the PRODUCT's metadata before the
 * key moves. --restore reads it back and moves the key home. So the original
 * price is never guessed at, never recreated, and never rounded: it is the
 * same object it always was, and restoring is exact.
 *
 * Refuses memberships. Moving a lookup key under a live subscription changes
 * what renewing customers are billed next month, which is not a thing to do
 * from a one-line command, and not a thing this script will help with.
 */
import Stripe from "stripe";
import { PACKS, TOPUPS, MEMBERSHIPS, SELLING_CURRENCY } from "../src/lib/billing/plans.ts";

const clean = (s) => (s ?? "").trim().replace(/^["']|["']$/g, "").trim();
const key = clean(process.argv[2]);
const lookupKey = clean(process.argv[3]);
const third = clean(process.argv[4]);
const restore = third === "--restore";

const ORIGINAL = "fdai_original_price";

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!/^sk_(live|test)_/.test(key) || !lookupKey || !third) {
  die(
    "usage:\n" +
      "  node scripts/set-pack-price.mjs <sk_...> <lookup_key> <amount in dollars>\n" +
      "  node scripts/set-pack-price.mjs <sk_...> <lookup_key> --restore\n\n" +
      "  e.g.  node scripts/set-pack-price.mjs sk_live_... fdai_pack_1 0.50\n" +
      "        node scripts/set-pack-price.mjs sk_live_... fdai_pack_1 --restore",
  );
}

if (MEMBERSHIPS.some((m) => m.lookupKey === lookupKey)) {
  die(
    `${lookupKey} is a MEMBERSHIP, and this script will not touch one.\n\n` +
      "  Moving a lookup key changes what existing subscribers are billed at their\n" +
      "  next renewal. That is a decision with customers on the other end of it, not\n" +
      "  a one-line command. Nothing has been changed.",
  );
}

const known = [...PACKS, ...TOPUPS].some((p) => p.lookupKey === lookupKey);
if (!known) {
  die(
    `Nothing in plans.ts sells "${lookupKey}".\n\n` +
      "  Bundles:  " + PACKS.map((p) => p.lookupKey).join(", ") + "\n" +
      "  Top-ups:  " + TOPUPS.map((p) => p.lookupKey).join(", "),
  );
}

let cents = null;
if (!restore) {
  const dollars = Number(third);
  if (!Number.isFinite(dollars) || dollars <= 0) die(`"${third}" is not an amount.`);
  cents = Math.round(dollars * 100);
  /* Stripe's floor for SGD. Below it the fee would exceed the charge, so the
     API refuses — better to say so here than to have it fail halfway. */
  if (cents < 50) die(`S$${dollars.toFixed(2)} is below Stripe's minimum of S$0.50 for SGD.`);
}

const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });

let account;
try {
  account = await stripe.accounts.retrieve();
} catch (err) {
  die(`Stripe rejected that key: ${err?.message ?? err}`);
}

const live = key.startsWith("sk_live_");
const who = account.settings?.dashboard?.display_name;
console.log(`\n${live ? "★ LIVE ACCOUNT" : "sandbox"}${who ? ` — ${who}` : ""} (${account.id})`);

const current = (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 }))
  .data[0];
if (!current) {
  die(
    `No active price with lookup key "${lookupKey}" in this account.\n\n` +
      "  Run  node scripts/check-stripe-products.mjs <key>  to see what is there.",
  );
}

const productId = typeof current.product === "string" ? current.product : current.product.id;
const product = await stripe.products.retrieve(productId);
const originalId = product.metadata?.[ORIGINAL] || null;

console.log(
  `Now: ${lookupKey} → ${current.id}, ` +
    `${(current.unit_amount / 100).toFixed(2)} ${current.currency.toUpperCase()}`,
);

// ─────────────────────────────────────────────────────────────── putting it back
if (restore) {
  if (!originalId) {
    die(
      "This product has no recorded original price, so there is nothing to restore to.\n\n" +
        "  That means the price was never changed by this script. If it was changed by\n" +
        "  hand, find the correct price in the Dashboard and move the lookup key onto\n" +
        "  it there. Nothing has been changed.",
    );
  }
  if (originalId === current.id) {
    console.log(`\n  = already the original price. Nothing to do.\n`);
    process.exit(0);
  }

  const original = await stripe.prices.retrieve(originalId);
  await stripe.prices.update(originalId, { lookup_key: lookupKey, transfer_lookup_key: true });
  await stripe.products.update(productId, { metadata: { [ORIGINAL]: "" } });

  console.log(
    `\n  ✓ restored: ${lookupKey} → ${original.id}, ` +
      `${(original.unit_amount / 100).toFixed(2)} ${original.currency.toUpperCase()}\n`,
  );
  console.log("  Now put plans.ts back to the same figure, or /billing will show a mismatch");
  console.log("  on the card — which is the page doing its job, but not a thing to leave up.\n");
  process.exit(0);
}

// ───────────────────────────────────────────────────────────────── changing it
if (current.unit_amount === cents) {
  console.log(`\n  = already ${(cents / 100).toFixed(2)}. Nothing to do.\n`);
  process.exit(0);
}

/* Recorded BEFORE anything moves, and only the first time, so that running
   this twice — 8.80 to 0.50, then 0.50 to 1.00 — still remembers 8.80 rather
   than deciding the original was fifty cents. */
if (!originalId) {
  await stripe.products.update(productId, { metadata: { [ORIGINAL]: current.id } });
  console.log(`  + remembered the original price (${current.id}) on the product`);
}

const next = await stripe.prices.create({
  product: productId,
  unit_amount: cents,
  currency: SELLING_CURRENCY,
  lookup_key: lookupKey,
  transfer_lookup_key: true,
  nickname: `temporary — ${(cents / 100).toFixed(2)} SGD`,
});

console.log(
  `\n  ✓ ${lookupKey} now resolves to ${next.id}, ` +
    `${(next.unit_amount / 100).toFixed(2)} ${next.currency.toUpperCase()}\n`,
);

const line = "─".repeat(72);
console.log(line);
console.log("The page and Stripe must now agree, or every visitor sees a warning on the");
console.log("card reading \"Stripe charges S$X, the price list says S$Y\".\n");
console.log(`  In src/lib/billing/plans.ts, set amountCents to ${cents} for ${lookupKey},`);
console.log("  commit, and deploy.\n");
console.log("To put everything back:\n");
console.log(`  node scripts/set-pack-price.mjs ${key.slice(0, 12)}… ${lookupKey} --restore`);
console.log("  …then change amountCents back and deploy.");
console.log(line + "\n");
