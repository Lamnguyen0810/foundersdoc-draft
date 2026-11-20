import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalCc, approvalCopies, approvalEmail, ownStandIn, type ApprovalItem } from "./approval";
import { trueCc } from "./test-mode";
import { paymentCc, paymentEmail, paymentSubject, type PaymentItem } from "./payment-email";
import { recipients, responseEmail, type Response } from "./respond";

/**
 * One look in both modes (0251). A simulation and the real run send the SAME emails: the same
 * subject, the same body, no "simulation" label anywhere. Only where an email goes differs, and
 * that is decided by the database (esop_companies.email_override), not by the email.
 * Sample names only. Run: npm run test:esop
 */

const holders = [
  { name: "Alex Tan", options: "4,400", options_number: 4400 },
  { name: "Jamie Lee", options: "4,400", options_number: 4400 },
];
const base = { ref: "B8-T2", batch: 8, tranche: 2, vest_date: "2026-12-01", vest_date_text: "1 Dec 2026", company: "Sample Company", slug: "sample-company" };
const LINK = "https://foundersdoc.com/approve/SAMPLE";
const labelled = (s: string) => /simulation|practice run|\[test\]|&#129514;|🧪/i.test(s);

test("the approval email is the same in a simulation and for real", () => {
  const item: ApprovalItem = { ...base, holders, leavers: [], to_name: "Alex", share_class: "Class B" };
  const real = approvalEmail(item, LINK);
  const sim = approvalEmail({ ...item, simulation: true }, LINK);
  assert.deepEqual(sim, real);
  assert.equal(real.subject, "FD x Sample Company ESOP: Issuance of Option Certificates for 2 Option Holders | Vesting 1 Dec 2026");
  assert.equal(approvalEmail({ ...item, holders: holders.slice(0, 1) }, LINK).subject, "FD x Sample Company ESOP: Issuance of Option Certificates for 1 Option Holder | Vesting 1 Dec 2026");
  assert.equal(approvalEmail({ ...item, company: "HitPay (TEST)" }, LINK).subject.startsWith("FD x HitPay ESOP: "), true, "a test label in the name never reaches the subject");
  assert.ok(!/Alex|Jamie/.test(real.subject), "holders are named in the email, not in the subject");
  assert.ok(!labelled(sim.subject) && !labelled(sim.html) && !labelled(sim.text));
});

test("the payment email, and its finance copy, are the same in a simulation and for real", () => {
  const item: PaymentItem = { ...base, holders, leavers: [], contact_name: "Alex" };
  const sim: PaymentItem = { ...item, simulation: true };
  assert.equal(paymentSubject(sim), paymentSubject(item));
  assert.equal(paymentSubject(item), "Upcoming ESOP vesting on 1 Dec 2026: 2 option holders · payment to issue certificates");
  for (const copy of [undefined, "finance"] as const) {
    const a = paymentEmail(item, "https://buy.stripe.com/SAMPLE", copy);
    const b = paymentEmail(sim, "https://buy.stripe.com/SAMPLE", copy);
    assert.deepEqual(b, a);
    assert.ok(!labelled(b.html) && !labelled(b.text ?? ""));
  }
});

test("a Modify or Cancel reads the same; a simulation only changes who is told", () => {
  const r: Response = { kind: "modify", note: "Sample note.", ref: "B8-T2", by: "alex.tan@example.com", by_name: "Alex", company: "Sample Company", slug: "sample-company", vest_date_text: "1 Dec 2026", self_serve: false, email_override: null, admins: [], slack_ts: null, holders };
  const sim = { ...r, email_override: "inbox@foundersdoc.com" };
  assert.deepEqual(responseEmail(sim, "https://foundersdoc.com/esop/sample-company"), responseEmail(r, "https://foundersdoc.com/esop/sample-company"));
  assert.equal(responseEmail(sim, "x").subject, "Change requested: Sample Company B8-T2");
  assert.equal(responseEmail({ ...sim, kind: "cancel" }, "x").subject, "Issuance cancelled: Sample Company B8-T2");
  /* the one thing that does change: in a simulation only its own inbox is emailed */
  assert.deepEqual(recipients(sim).to, ["inbox@foundersdoc.com"]);
});

test("no screen in the flow carries a mode label: the dashboard, Settings, the approval page, Admin → Sign", () => {
  const files = ["src/app/esop/[slug]/EsopSheet.tsx", "src/app/esop/[slug]/SettingsPage.tsx", "src/app/approve/[token]/page.tsx", "src/app/admin/sign/EsopPrepare.tsx", "src/app/admin/sign/SignAdmin.tsx"];
  for (const f of files) {
    const code = readFileSync(join(process.cwd(), f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "") /* comments may say it; the screen may not */
      .replace(/^\s*\/\/.*$/gm, "");
    for (const words of [/Simulation (is )?on/i, /\(simulation\)/i, /Reset simulation/i, /practice run/i, /during a simulation/i, /🧪/]) assert.ok(!words.test(code), `${f} shows ${words}`);
  }
});

/* ── the Founders Doc copy of the approval email (0253) ─────────────────────── */

test("the Founders Doc copy: marked as a copy, and it cannot approve anything", () => {
  const item: ApprovalItem = { ...base, holders, leavers: [], to: "alex.tan@example.com", to_name: "Alex", share_class: "Class B" };
  const real = approvalEmail(item, LINK);
  const copy = approvalEmail(item, "https://foundersdoc.com/esop/sample-company?ref=B8-T2", "team");
  assert.equal(copy.subject, `[Copy] ${real.subject}`);
  assert.match(copy.html, /Copy for Founders Doc\./);
  assert.ok(!/\/approve\//.test(copy.html) && !/\/approve\//.test(copy.text), "no approval link in the copy");
  assert.ok(!/do=modify|do=cancel/.test(copy.html + copy.text), "nor a Modify or Cancel link");
  assert.equal((copy.html.match(/href="https:\/\/foundersdoc\.com\/esop\/sample-company\?ref=B8-T2"/g) ?? []).length, 3, "all three buttons open the dashboard");
  /* the client's own email is untouched */
  assert.ok(!/Copy for Founders Doc/.test(real.html) && real.html.includes(`href="${LINK}"`) && real.html.includes(`href="${LINK}?do=modify"`));
});

test("who gets the copy: the ESOP_CC_EMAILS addresses for real, the simulation inbox alone in a simulation", () => {
  const item: ApprovalItem = { ...base, holders, leavers: [], to: "Alex.Tan@example.com", to_name: "Alex" };
  const before = process.env.ESOP_CC_EMAILS;
  try {
    process.env.ESOP_CC_EMAILS = " one@foundersdoc.com, Two@foundersdoc.com ,not-an-address, alex.tan@example.com, one@foundersdoc.com";
    assert.deepEqual(approvalCopies(item), ["one@foundersdoc.com", "two@foundersdoc.com"], "each once, never the client again");
    assert.deepEqual(approvalCopies({ ...item, simulation: true, to: "inbox@foundersdoc.com" }), ["inbox@foundersdoc.com"], "a simulation never reaches the real copy addresses");
    delete process.env.ESOP_CC_EMAILS;
    assert.deepEqual(approvalCopies(item), [], "no setting, no copies");
    assert.deepEqual(approvalCopies({ ...item, to: undefined }), []);
  } finally {
    if (before === undefined) delete process.env.ESOP_CC_EMAILS;
    else process.env.ESOP_CC_EMAILS = before;
  }
});

/* ── a true CC line (0254) ─────────────────────────────────────────────────── */

test("true CC: off until ESOP_TRUE_CC=1; then the copy addresses go on the CC line, and nobody in a simulation", () => {
  const item: ApprovalItem = { ...base, holders, leavers: [], to: "alex.tan@example.com", to_name: "Alex" };
  const before = { cc: process.env.ESOP_CC_EMAILS, on: process.env.ESOP_TRUE_CC };
  try {
    process.env.ESOP_CC_EMAILS = "one@foundersdoc.com,two@foundersdoc.com";
    delete process.env.ESOP_TRUE_CC;
    assert.equal(trueCc(), false, "separate copies are the default");
    process.env.ESOP_TRUE_CC = "yes";
    assert.equal(trueCc(), false, "only the exact value 1 switches it on");
    process.env.ESOP_TRUE_CC = " 1 ";
    assert.equal(trueCc(), true);
    assert.deepEqual(approvalCc(item), ["one@foundersdoc.com", "two@foundersdoc.com"]);
    assert.deepEqual(approvalCc({ ...item, simulation: true, to: "inbox@foundersdoc.com" }), [], "a rehearsal copies nobody");
    assert.deepEqual(approvalCc({ ...item, to: "one@foundersdoc.com" }), ["two@foundersdoc.com"], "never the person it is already addressed to");
    /* the payment email: the client's finance team first, then Founders Doc's own, each once */
    assert.deepEqual(paymentCc("alex.tan@example.com", ["Finance@example.com", "alex.tan@example.com"], false), ["finance@example.com", "one@foundersdoc.com", "two@foundersdoc.com"]);
    assert.deepEqual(paymentCc("alex.tan@example.com", ["one@foundersdoc.com"], false), ["one@foundersdoc.com", "two@foundersdoc.com"]);
    assert.deepEqual(paymentCc("inbox@foundersdoc.com", ["finance@example.com"], true), [], "a rehearsal copies nobody");
  } finally {
    for (const [k, v] of [["ESOP_CC_EMAILS", before.cc], ["ESOP_TRUE_CC", before.on]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

/* ── safety nets (0255) ────────────────────────────────────────────────────── */

test("a real approval email never goes to one of our own addresses standing in for the client's", () => {
  const item: ApprovalItem = { ...base, holders, leavers: [], to: "legal@foundersdoc.com", to_name: "Alex" };
  assert.equal(ownStandIn(item), true);
  assert.equal(ownStandIn({ ...item, to: " Legal@FoundersDoc.com " }), true);
  assert.equal(ownStandIn({ ...item, to: "alex.tan@example.com" }), false, "the client's own address is fine");
  assert.equal(ownStandIn({ ...item, simulation: true }), false, "a simulation is meant to go to our inbox");
  assert.equal(ownStandIn({ ...item, to: undefined }), false);
});
