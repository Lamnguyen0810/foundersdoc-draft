import { emptyStore } from "./test-guard";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { FAIR_USE, FREE_SIGN, FREE_SIGN_DAYS, PREMIUM, SIGN_PLANS, SIGN_PRODUCTS, biggerPlan, isPremium, type SignTier } from "@/lib/billing/sign-plans";
import { allowance, blockReason } from "./allowance";
import { startOfDaySgt, startOfMonthSgt, type SignAccount } from "./account";
import { createSend } from "./service";
import { signStore, type SignStore } from "./store";
import { cleanText, parseFields, signerSize } from "./fields";
import { maskPhone, normalisePhone } from "./phone-format";
import { maskEmail } from "./code";

/**
 * FD Sign's plans and limits, and the small rules around a request (0243): who may send how much,
 * what a premium plan adds, and how boxes, phone numbers and typed text are cleaned.
 * Run: npm run test:sign
 */

const ME: SignAccount = { id: "33333333-3333-4333-8333-333333333333", email: "alex.tan@example.com", name: "Alex Tan", confirmed: true };
const DAY = 86_400_000;
const store = () => signStore() as SignStore;

async function sendOne(s: SignStore) {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  await createSend(s, {
    docs: [{ title: "Sample", fileName: "sample.pdf", bytes: await pdf.save(), esopHolderId: null, esopTranche: null, signers: [{ name: "Jamie Lee", email: "jamie.lee@example.com", role: "Signer" }], fields: [] }],
    batch: false,
    message: null,
    createdBy: "test",
    origin: "http://localhost:3000",
    who: { ip: null, ua: null },
    owner: { id: ME.id, email: ME.email, name: ME.name, folderId: null },
  });
}
const withTier = (tier: SignTier | null) => (tier ? (process.env.FD_SIGN_PREVIEW_TIER = tier) : delete process.env.FD_SIGN_PREVIEW_TIER);

beforeEach(() => {
  emptyStore();
  withTier(null);
  delete process.env.FD_SIGN_PRICING;
});

/* The prices and limits are written out here on purpose: a change to a plan should be a decision,
   and this test is where it is confirmed. */
test("the plans: prices, requests a month, and which ones are premium", () => {
  assert.deepEqual(
    (["sign_personal", "sign_standard", "sign_business"] as const).map((t) => [SIGN_PLANS[t].amountCents, SIGN_PLANS[t].requests]),
    [[715, 10], [1950, 30], [2925, 60]],
  );
  assert.deepEqual(SIGN_PRODUCTS.map((p) => p.currency), ["SGD", "SGD", "SGD"]);
  assert.equal(SIGN_PLANS.unlimited.requests, null);
  assert.deepEqual([...PREMIUM].sort(), ["pro", "sign_business", "sign_standard", "unlimited"]);
  for (const t of ["none", "sign_personal", "basic"]) assert.equal(isPremium(t), false, t);
  assert.equal(biggerPlan("sign_personal", "basic"), "basic");
  assert.equal(biggerPlan("unlimited", "sign_business"), "unlimited");
  assert.equal(biggerPlan("sign_business", "pro"), "sign_business", "equal allowances keep the first");
});

test("no plan: a free week of up to 10 requests, counted from the first one", async (t) => {
  const s = store();
  const start = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const before = await allowance(ME, s);
  assert.deepEqual([before.per, before.limit, before.used, before.premium, before.endsAt], ["free", FREE_SIGN, 0, false, null]);
  assert.equal(blockReason(before), null);

  await sendOne(s);
  const one = await allowance(ME, s);
  assert.equal(one.used, 1);
  assert.equal(Date.parse(one.endsAt!) - start, FREE_SIGN_DAYS * DAY, "the week starts with the first request");
  assert.equal(blockReason(one), null);

  for (let i = 1; i < FREE_SIGN; i++) await sendOne(s);
  assert.match(blockReason(await allowance(ME, s))!, /used your 10 free signing requests/);
});

test("no plan: when the week is over, no free requests are left", async (t) => {
  const s = store();
  const start = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now: start });
  await sendOne(s);
  t.mock.timers.setTime(start + FREE_SIGN_DAYS * DAY + 60_000);
  const after = await allowance(ME, s);
  assert.equal(after.limit, 1, "the limit becomes what was used");
  assert.match(blockReason(after)!, /free week has ended/);
});

test("a plan: its monthly limit, premium or not, and the message at the limit", async () => {
  const s = store();
  withTier("sign_personal");
  const personal = await allowance(ME, s);
  assert.deepEqual([personal.per, personal.limit, personal.premium, personal.label], ["month", 10, false, "Sign Personal"]);
  withTier("sign_standard");
  const standard = await allowance(ME, s);
  assert.deepEqual([standard.limit, standard.premium], [30, true]);
  assert.equal(blockReason({ ...standard, used: 29 }), null);
  assert.match(blockReason({ ...standard, used: 30 })!, /used your 30 signing requests this month/);
});

test("Unlimited: no stated limit, with a fair-use ceiling behind it", async () => {
  withTier("unlimited");
  const a = await allowance(ME, store());
  assert.deepEqual([a.limit, a.premium], [null, true]);
  assert.equal(blockReason({ ...a, used: FAIR_USE - 1 }), null);
  assert.match(blockReason({ ...a, used: FAIR_USE })!, /fair-use limit/);
});

test("pricing switched off: the free Beta's daily limit comes back", async () => {
  process.env.FD_SIGN_PRICING = "off";
  const a = await allowance(ME, store());
  assert.deepEqual([a.live, a.per, a.limit, a.premium], [false, "day", 20, false]);
  assert.match(blockReason({ ...a, used: 20 })!, /try again tomorrow/);
});

test("days and months turn over at midnight in Singapore", () => {
  /* 17:30 UTC on 30 Nov is 01:30 on 1 Dec in Singapore */
  const t = new Date("2026-11-30T17:30:00Z");
  assert.equal(startOfDaySgt(t), "2026-11-30T16:00:00.000Z");
  assert.equal(startOfMonthSgt(t), "2026-11-30T16:00:00.000Z");
  assert.equal(startOfMonthSgt(new Date("2026-11-30T15:59:00Z")), "2026-10-31T16:00:00.000Z");
});

test("boxes from the send page: only real boxes for real signers, kept on the page", () => {
  const ok = { position: 1, kind: "signature", page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.05 };
  const out = parseFields(
    [
      ok,
      { ...ok, position: 3 }, // no third signer
      { ...ok, kind: "stamp" }, // not a kind of box
      { ...ok, x: 1.2 }, // off the page
      { ...ok, page: 0 },
      { ...ok, x: 0.9, w: 0.5 }, // wider than the page allows: trimmed
      { ...ok, kind: "text", label: "  Job    title ", position: 2 },
      { ...ok, kind: "checkbox", position: 2 },
      "not a box",
    ],
    2,
  );
  assert.equal(out.length, 4);
  assert.ok(Math.abs(out[1].w - 0.1) < 1e-9);
  assert.deepEqual([out[2].label, out[2].required], ["Job title", true]);
  assert.deepEqual([out[3].label, out[3].required], ["I agree", false]);
  assert.deepEqual(parseFields("nothing", 2), []);
  assert.equal(parseFields(Array.from({ length: 150 }, () => ok), 1).length, 100, "at most 100 boxes a document");
});

test("what a signer types is tidied and capped; a resized box stays on the page", () => {
  assert.equal(cleanText("  Senior \t Consultant \r\n\r\n\r\n\r\n  Singapore "), "Senior Consultant\n\nSingapore");
  assert.equal(cleanText("x".repeat(900)).length, 500);
  assert.equal(cleanText(Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n")).split("\n").length, 20);
  const big = signerSize({ x: 0.8, y: 0.9 }, 0.5, 0.5)!;
  assert.ok(Math.abs(big.w - 0.2) < 1e-9 && Math.abs(big.h - 0.1) < 1e-9, "no wider or taller than the room left on the page");
  assert.deepEqual(signerSize({ x: 0.1, y: 0.1 }, 0.001, 0.001), { w: 0.03, h: 0.012 });
  assert.equal(signerSize({ x: 0.1, y: 0.1 }, "wide", 0.1), null);
});

test("phone numbers and addresses: read in the usual forms, and masked wherever they are shown", () => {
  assert.equal(normalisePhone("9123 4567"), "+6591234567");
  assert.equal(normalisePhone("+44 (20) 7946-0958"), "+442079460958");
  assert.equal(normalisePhone("0065 9123 4567"), "+6591234567");
  for (const bad of ["", "12345", "phone", "+0123456789"]) assert.equal(normalisePhone(bad), null, bad);
  assert.equal(maskPhone("+6591234567"), "+65 ****4567");
  assert.equal(maskEmail("jamie.lee@example.com"), "j******@example.com");
  assert.equal(maskEmail("al@example.com"), "a**@example.com");
});
