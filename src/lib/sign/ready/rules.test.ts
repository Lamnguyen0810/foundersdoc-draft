import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, type ReadDoc } from "./rules";

/**
 * The signing-ready check (0243): what must stop a document, what is only a warning, and what is
 * a normal signing blank. Sample text only. Run: npm run test:sign
 */

const CLEAN = [
  "CONSULTANCY AGREEMENT",
  "This Agreement is made between Sample Company Pte. Ltd. (the Company) and Example Consulting Pte. Ltd. (the Consultant).",
  "1. Services",
  "The Consultant will provide the services described in this Agreement with reasonable skill and care.",
  "2. Fees",
  "The Company will pay the Consultant S$5,000 a month, within 30 days of each invoice.",
  "3. Confidentiality",
  "Each party will keep the other party's confidential information private and use it only for this Agreement.",
  "4. Intellectual property",
  "The Consultant assigns to the Company all rights in the work created under this Agreement.",
  "5. Termination",
  "Either party may end this Agreement by giving the other thirty (30) days' written notice.",
  "6. Governing law",
  "This Agreement is governed by the laws of Singapore.",
  "Signed for and on behalf of Sample Company Pte. Ltd.",
  "Signature: ____________________",
  "Name: Alex Tan",
  "Title: Director",
  "Signed for and on behalf of Example Consulting Pte. Ltd.",
  "Signature: ____________________",
  "Name: Jamie Lee",
  "Title: Consultant",
];

function doc(lines: string[] = CLEAN, meta: Partial<ReadDoc["meta"]> = {}): ReadDoc {
  return { kind: "pdf", pages: 1, lines: lines.map((text, i) => ({ text, page: 1, para: i + 1 })), margins: [], meta: { hasText: true, ...meta } };
}
/** the clean agreement with one clause's wording changed */
const withClause = (text: string) => doc(CLEAN.map((l, i) => (i === 5 ? text : l)));
const codes = (d: ReadDoc) => detect(d).issues.filter((i) => i.severity !== "expected").map((i) => i.code);

test("a finished agreement is ready, and the blank signature lines are signing fields, not gaps", () => {
  const r = detect(doc());
  assert.equal(r.verdict, "ready");
  assert.deepEqual(r.issues.filter((i) => i.severity === "blocker" || i.severity === "warning"), []);
  assert.equal(r.expectedBlanks, 2);
});

test("a placeholder, a blank or a note to draft in a clause stops it", () => {
  for (const [text, code] of [
    ["The Company will pay the Consultant [AMOUNT] a month.", "PH-001"],
    ["The Company will pay the Consultant ____________ a month.", "PH-002"],
    ["The Company will pay the Consultant a fee, TBC.", "PH-003"],
    ["The Company will pay the Consultant S$[***] a month.", "PH-006"],
  ] as const) {
    const r = detect(withClause(text));
    assert.equal(r.verdict, "not_ready", text);
    assert.ok(r.issues.some((i) => i.code === code && i.severity === "blocker"), `${code} for: ${text} (got ${r.issues.map((i) => i.code).join(", ")})`);
  }
});

test("bracketed sub-clause labels, case citations and defined terms are not placeholders", () => {
  const r = detect(withClause('As held in [2020] SGCA 3, the fee in clause [a] is payable by the [the "Company"].'));
  assert.ok(!r.issues.some((i) => i.code === "PH-001"), r.issues.map((i) => `${i.code} ${i.evidence}`).join(" | "));
});

test("tracked changes, comments and hidden text stop it; highlights only warn", () => {
  assert.equal(detect(doc(CLEAN, { trackedChanges: 3 })).verdict, "not_ready");
  assert.ok(codes(doc(CLEAN, { trackedChanges: 3 })).includes("AN-001"));
  assert.ok(codes(doc(CLEAN, { comments: 1 })).includes("AN-002"));
  assert.ok(codes(doc(CLEAN, { hidden: 1 })).includes("AN-008"));
  const hl = detect(doc(CLEAN, { highlights: 2 }));
  assert.equal(hl.verdict, "ready_with_ack");
  assert.equal(hl.counts.blocker, 0);
});

test("a locked or already-signed file cannot be checked; a scan can still be sent, with a warning", () => {
  assert.equal(detect(doc(CLEAN, { encrypted: true })).verdict, "cannot_process");
  assert.equal(detect(doc(CLEAN, { digitallySigned: true })).verdict, "cannot_process");
  const scan = detect(doc([], { hasText: false }));
  assert.equal(scan.verdict, "ready_with_ack");
  assert.ok(scan.issues.some((i) => i.code === "TE-003" && i.severity === "warning"));
});

test("a deed is flagged as possibly not signable electronically, with advice to check with a lawyer", () => {
  for (const text of ["This Agreement is executed as a deed by the parties.", "SIGNED, SEALED AND DELIVERED by the Consultant.", "This deed poll is made by the Consultant."]) {
    const r = detect(withClause(text));
    assert.equal(r.verdict, "not_signable_here", text);
    const deed = r.issues.find((i) => i.code === "SG-005");
    assert.ok(deed, text);
    assert.equal(deed.severity, "blocker");
    assert.match(deed.action, /witness/i);
    assert.match(deed.action, /lawyer/i);
  }
  /* the word on its own, as in "title deed" or "deed of adherence" mentioned in passing, is not enough */
  assert.ok(!codes(withClause("The Consultant will sign a deed of adherence if asked.")).includes("SG-005"));
});

test("wording that asks for ink, a notary or a will is flagged the same way", () => {
  for (const text of ["This Agreement must be signed in wet ink.", "The signature must be notarised by a notary public.", "This is the last will and testament of the Consultant."]) {
    const r = detect(withClause(text));
    assert.equal(r.verdict, "not_signable_here", `${text} (got ${r.issues.map((i) => i.code).join(", ")})`);
  }
});

test("a schedule that is mentioned but missing stops it", () => {
  const r = detect(withClause("The services are set out in Schedule 1."));
  assert.equal(r.verdict, "not_ready");
  assert.ok(r.issues.some((i) => i.code === "ST-001"));
});

test('"DRAFT" in the header counts once, however many pages carry it', () => {
  const d = doc();
  d.margins = [1, 2, 3].map((p) => ({ text: "DRAFT - not for signature", where: `Page ${p}` }));
  const r = detect(d);
  assert.equal(r.verdict, "not_ready");
  assert.equal(r.issues.filter((i) => i.code === "AN-006").length, 1);
});
