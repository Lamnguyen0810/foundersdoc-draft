import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalCc, approvalCopies, approvalEmail, ownStandIn, type ApprovalItem } from "./approval";
import { trueCc } from "./test-mode";
import { esopSubject, esopTag } from "./subjects";
import { approvedSlackText, certificateNumbers, sgTime } from "./approved-slack";
import { holderNoteEmail, noteCc } from "./holder-note";
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
  assert.equal(paymentSubject(item), "FD x Sample Company ESOP: Payment for 2 Option Certificates | Vesting 1 Dec 2026");
  assert.equal(paymentSubject({ ...item, holders: holders.slice(0, 1) }), "FD x Sample Company ESOP: Payment for 1 Option Certificate | Vesting 1 Dec 2026");
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

test("true CC is the rule (0257): the copy addresses go on the CC line, and nobody in a simulation", () => {
  const item: ApprovalItem = { ...base, holders, leavers: [], to: "alex.tan@example.com", to_name: "Alex" };
  const before = { cc: process.env.ESOP_CC_EMAILS, on: process.env.ESOP_TRUE_CC };
  try {
    process.env.ESOP_CC_EMAILS = "one@foundersdoc.com,two@foundersdoc.com";
    delete process.env.ESOP_TRUE_CC;
    assert.equal(trueCc(), true, "a CC line from the start: no switch to remember");
    process.env.ESOP_TRUE_CC = " 1 ";
    assert.equal(trueCc(), true);
    process.env.ESOP_TRUE_CC = " 0 ";
    assert.equal(trueCc(), false, "only the exact value 0 goes back to separate copies");
    delete process.env.ESOP_TRUE_CC;
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

/* ── the option holders' note, sent by the website (0256) ──────────────────── */

test("the holders' note: the approved words, the company's name, and no mode label", () => {
  const m = holderNoteEmail({ company: "HitPay (TEST)", slug: "hitpay", vest_date_text: "1 Dec 2026" });
  assert.equal(m.subject, "FD x HitPay ESOP: Your Options Have Vested | Vesting 1 Dec 2026");
  assert.match(m.html, /Hi there,/);
  assert.match(m.html, /We&#39;re pleased|We're pleased to share that your HitPay ESOP options have vested\./);
  assert.match(m.html, /Signing request/);
  assert.match(m.html, /hitpay-logo\.png/);
  assert.ok(!labelled(m.subject) && !labelled(m.html) && !labelled(m.text));
  const other = holderNoteEmail({ company: "Sample Company", slug: "sample-company" });
  assert.equal(other.subject, "FD x Sample Company ESOP: Your Options Have Vested");
  assert.ok(!/hitpay-logo/.test(other.html), "another company does not get HitPay's logo");
});

test("who is copied on a holder's note: Founders Doc, then the client's contact; nobody in a simulation", () => {
  const before = process.env.ESOP_CC_EMAILS;
  try {
    process.env.ESOP_CC_EMAILS = "one@foundersdoc.com, two@foundersdoc.com";
    assert.deepEqual(noteCc("jamie.lee@example.com", "Alex.Tan@example.com", false), ["one@foundersdoc.com", "two@foundersdoc.com", "alex.tan@example.com"]);
    assert.deepEqual(noteCc("alex.tan@example.com", "alex.tan@example.com", false), ["one@foundersdoc.com", "two@foundersdoc.com"], "a holder who is also the contact is not copied on their own note");
    assert.deepEqual(noteCc("jamie.lee@example.com", null, false), ["one@foundersdoc.com", "two@foundersdoc.com"]);
    assert.deepEqual(noteCc("inbox@foundersdoc.com", "inbox@foundersdoc.com", true), [], "a rehearsal copies nobody");
  } finally {
    if (before === undefined) delete process.env.ESOP_CC_EMAILS;
    else process.env.ESOP_CC_EMAILS = before;
  }
});

/* ── one subject line for the whole vesting (0257) ─────────────────────────── */

test("every email of a vesting carries the same line: firm x client, what it is, the vesting date", () => {
  const v = { company: "Sample Company", vest_date_text: "1 Dec 2026" };
  assert.equal(esopSubject("approval", { ...v, count: 3 }), "FD x Sample Company ESOP: Issuance of Option Certificates for 3 Option Holders | Vesting 1 Dec 2026");
  assert.equal(esopSubject("payment", { ...v, count: 3 }), "FD x Sample Company ESOP: Payment for 3 Option Certificates | Vesting 1 Dec 2026");
  assert.equal(esopSubject("vested", v), "FD x Sample Company ESOP: Your Options Have Vested | Vesting 1 Dec 2026");
  assert.equal(esopSubject("sign", { ...v, count: 3 }), "FD x Sample Company ESOP: Please Sign 3 Option Certificates | Vesting 1 Dec 2026");
  assert.equal(esopSubject("sign", { ...v, count: 1 }), "FD x Sample Company ESOP: Please Sign Your Option Certificate | Vesting 1 Dec 2026");
  assert.equal(esopSubject("sign", { ...v, count: 1, reminder: true }), "Reminder: FD x Sample Company ESOP: Please Sign Your Option Certificate | Vesting 1 Dec 2026");
  assert.equal(esopSubject("signed", v), "FD x Sample Company ESOP: Signed Option Certificate | Vesting 1 Dec 2026");
  assert.equal(esopSubject("code", { ...v, code: "123456" }), "FD x Sample Company ESOP: Your Signing Code 123456 | Vesting 1 Dec 2026");
  assert.equal(esopSubject("code", v), "FD x Sample Company ESOP: Your Signing Code | Vesting 1 Dec 2026");
  assert.equal(esopSubject("payment", { ...v, count: 3, reminder: true }).startsWith("FD x "), true, "only a signing request is ever a reminder");
  /* the subject the approval email really uses is this one */
  const item: ApprovalItem = { ...base, holders, leavers: [], to_name: "Alex" };
  assert.equal(approvalEmail(item, LINK).subject, esopSubject("approval", { ...v, count: 2 }));
  /* a test label never reaches a subject; no name, the plain tag; no date, no dangling bar */
  assert.equal(esopTag("HitPay (TEST)"), "FD x HitPay ESOP");
  assert.equal(esopTag("  "), "Founders Doc ESOP");
  assert.equal(esopSubject("signed", { company: "Sample Company", vest_date_text: "" }), "FD x Sample Company ESOP: Signed Option Certificate");
  for (const k of ["approval", "payment", "vested", "sign", "signed", "code"] as const) assert.ok(!labelled(esopSubject(k, { ...v, count: 2 })));
});

test("signing emails: certificates get the vesting's line, everything else keeps FD Sign's own subject", () => {
  const src = (f: string) => readFileSync(join(process.cwd(), "src/lib/sign", f), "utf8");
  const notify = src("notify.ts");
  assert.match(notify, /mail\.subject\?\.trim\(\) \|\|/, "a ready subject wins; without one the usual subject stands");
  assert.match(notify, /subject: mail\.subject\?\.trim\(\) \|\| `Your FD Sign code: \$\{mail\.code\}`/, "0258: a certificate's code email takes the vesting's line; any other code keeps its own subject");
  assert.match(src("code.ts"), /certificateSubject\(envelopes, "code", false, code\)/);
  const lookup = src("esop-subject.ts");
  assert.match(lookup, /envelopes\.some\(\(e\) => !e\?\.esop_holder_id \|\| !e\.esop_tranche\)\) return null/, "only when every document is an option certificate");
  const service = src("service.ts");
  assert.match(service, /!sender \? await certificateSubject\(/, "never on people's own FD Sign requests");
  assert.match(service, /const signedSubject = sender \? null : await certificateSubject\(\[env\], "signed"\)/);
});

/* ── one Slack message for an approval (0257) ──────────────────────────────── */

test("the approval in Slack: who approved first and in bold, when, then what happens next", () => {
  const item = {
    ...base,
    contact_name: "Alex Tan",
    contact_email: "alex.tan@example.com",
    approved_by: "alex.tan@example.com (email)",
    approved_at: "2026-11-20T09:34:45.000Z",
    holders: [
      { name: "Jamie Lee", certificate_no: "48" },
      { name: "Sam Wong", certificate_no: "49" },
      { name: "Robin Lim", certificate_no: "50" },
    ],
  };
  const where = { origin: "https://foundersdoc.com", slug: "sample-company", ref: "B8-T2", approvedBy: "" };
  const t = approvedSlackText(item, where);
  const lines = t.split("\n");
  assert.equal(lines[0], ":white_check_mark: *Alex has approved* · Sample Company ESOP B8-T2");
  assert.equal(lines[1], ":clock3: Fri, 20 Nov 2026 at 5:34 pm SGT · from the approval email");
  assert.equal(lines[2], ":scroll: 3 option certificates (No. 48 to 50) · vesting 1 Dec 2026");
  assert.equal(lines[4], "*What happens next*");
  assert.match(lines[5], /^:one: \*Payment\.\* The payment email goes to Alex now\./);
  assert.match(lines[6], /<https:\/\/foundersdoc\.com\/admin\/sign\?ref=B8-T2\|Admin → Sign>$/);
  assert.equal(lines.length, 8, "one short message, nothing per holder");
  assert.ok(!/Jamie|Sam Wong|Robin/.test(t), "no option holder is named: the message is about the approval");
  assert.ok(!labelled(t));
  /* approved on the dashboard by someone else: said as it is, never dressed up as the client */
  const ours = approvedSlackText({ ...item, approved_by: "one@foundersdoc.com" }, where);
  assert.equal(ours.split("\n")[0], ":white_check_mark: *Approved by one@foundersdoc.com* · Sample Company ESOP B8-T2");
  assert.match(ours.split("\n")[1], /on the dashboard$/);
  /* the same words in a simulation: the inbox standing in for the contact reads as the contact */
  const sim = approvedSlackText({ ...item, simulation: true, contact_email: "inbox@foundersdoc.com", approved_by: "inbox@foundersdoc.com (email)" }, where);
  assert.equal(sim, t);
  assert.equal(certificateNumbers([{ certificate_no: "48" }]), "No. 48");
  assert.equal(certificateNumbers([{ certificate_no: "48" }, { certificate_no: "50" }]), "No. 48, 50");
  assert.equal(certificateNumbers([{ certificate_no: "48" }, { certificate_no: "" }]), "", "not all numbered yet: say nothing");
  assert.equal(sgTime("not a date", new Date("2026-12-01T00:05:00Z")), "Tue, 1 Dec 2026 at 8:05 am SGT");
});
