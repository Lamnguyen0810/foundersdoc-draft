import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalEmail, type ApprovalItem } from "./approval";
import { paymentEmail, paymentSubject, type PaymentItem } from "./payment-email";
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
  assert.equal(real.subject, "Please approve: issuance of Option Certificates for Alex Tan and Jamie Lee (vesting 1 Dec 2026)");
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
