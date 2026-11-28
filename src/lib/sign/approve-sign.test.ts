import { emptyStore } from "./test-guard";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { orderLine, orderText, parseOrder, type Order } from "./order";
import { signStore, type SignStore } from "./store";
import { createSend, submitSignature, viewForToken } from "./service";

/* 0319: one person can approve AND sign (Nathan approves before Lin, and signs himself). Sample names only. */

beforeEach(() => emptyStore());

const order: Order = { steps: [1, 1, 1, 1, 1, 1, 2], fill: [7], approve: [[5, 2], [6, 2]], anyOf: [2], signs: [6] };

test("approve and sign: kept in the order line and read back", () => {
  const line = orderLine(order)!;
  assert.equal(line, "steps 1-1-1-1-1-1-2 · fill-in 7 · approve 5>2,6>2 · any 2 · also-sign 6");
  assert.deepEqual(parseOrder(line, 7), order);
  assert.match(orderText(order, ["A", "Lin", "C", "D", "Legal", "Nathan", "FD"]), /Nathan approves before Lin, and signs/);
  assert.equal(parseOrder("approve 5>2 · also-sign 3", 7).signs, undefined, "only an approver can 'also sign'");
});

async function setUp() {
  const s = signStore() as SignStore;
  const sent: Array<{ to: string; kind: string; link?: string; html?: string; heading?: string; button?: string }> = [];
  process.env.SIGN_HOOK_URL = "https://hooks.zapier.com/hooks/catch/0/test/";
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const d = await PDFDocument.create();
  d.addPage([595, 842]);
  const names = ["Alex Tan", "Lin Chen", "Yong Lee", "David Ong", "Legal Team", "Nathan Ho", "Founders Doc"];
  const roles = ["Director", "Director", "Director", "Director", "Approver", "Approver", "Administrator"];
  const r = await createSend(s, {
    docs: [
      {
        title: "Directors' Resolutions",
        fileName: "d.pdf",
        bytes: await d.save(),
        esopHolderId: null,
        esopTranche: null,
        signers: names.map((n, i) => ({ name: n, email: `${n.split(" ")[0]!.toLowerCase()}@example.com`, role: roles[i]! })),
        fields: [
          ...[1, 2, 3, 4, 6].map((position) => ({ position, kind: "signature" as const, page: 1, x: 0.1, y: 0.1 * position, w: 0.3, h: 0.05 })),
          { position: 7, kind: "text" as const, page: 1, x: 0.5, y: 0.9, w: 0.1, h: 0.02, label: "Day", required: true },
        ],
        order,
      },
    ],
    batch: false,
    message: null,
    createdBy: "test",
    origin: "http://localhost:3000",
    who: { ip: null, ua: null },
    owner: { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", name: "Example Consulting", folderId: null },
  });
  const who = { ip: null, ua: null };
  const link = (email: string) => sent.filter((x) => x.to === email && x.kind === "invite").pop()?.link?.split("/sign/")[1];
  const sign = (email: string, kind: "type" | "none" = "type") =>
    submitSignature(s, { token: link(email)!, kind, png: null, typed: kind === "type" ? email : null, origin: "http://localhost:3000", who });
  return { s, r, sent, link, sign, id: r.envelopeIds[0]! };
}

test("Nathan approves and signs in one go: Lin is released, and the other approver is no longer needed", async () => {
  const closed = globalThis.fetch;
  try {
    const { s, sent, link, sign, id } = await setUp();
    assert.ok(link("nathan@example.com"), "Nathan is emailed straight away");
    assert.ok(!link("lin@example.com"), "Lin waits for an approval");
    const inv = sent.find((x) => x.to === "nathan@example.com" && x.kind === "invite")!;
    assert.match(String(inv.heading), /to approve and sign/);
    assert.equal(inv.button, "Review, approve & sign");
    const v = (await viewForToken(s, link("nathan@example.com")!, null))!;
    assert.equal(v.approveOnly, false, "he signs, so he is not 'approve only'");
    assert.equal(v.fillOnly, false);
    assert.equal(v.approvesFor, "Lin Chen");
    await assert.rejects(sign("nathan@example.com", "none"), /Please sign first/);
    await sign("nathan@example.com");
    assert.ok(link("lin@example.com"), "his signature released Lin");
    const ev = (await s.events(id)).filter((e) => e.event === "approved" || e.event === "signed").map((e) => `${e.event}:${e.detail}`);
    assert.ok(ev.some((x) => x.startsWith("approved:approved by signing, before Lin Chen signs")), "the approval is in the audit trail");
    assert.ok(ev.some((x) => x.startsWith("signed:")), "and the signature");
    const status = sent.filter((x) => x.kind === "status" || /has approved and signed/.test(String(x.html ?? ""))).map((x) => String(x.html ?? ""));
    assert.ok(status.some((h) => h.includes("Nathan Ho (Approver) has approved and signed")), "the key controller email says both");
    /* the rest sign; Legal is no longer needed, so the dating starts without them */
    for (const e of ["alex@example.com", "lin@example.com", "yong@example.com", "david@example.com"]) await sign(e);
    assert.ok(link("founders@example.com"), "the dating starts: Legal's approval was not needed");
  } finally {
    globalThis.fetch = closed;
    delete process.env.SIGN_HOOK_URL;
  }
});

test("Legal approves first: Lin is released, but Nathan still has to sign", async () => {
  const closed = globalThis.fetch;
  try {
    const { sent, link, sign } = await setUp();
    await sign("legal@example.com", "none");
    assert.ok(link("lin@example.com"), "one approval was enough for Lin");
    for (const e of ["alex@example.com", "lin@example.com", "yong@example.com", "david@example.com"]) await sign(e);
    assert.ok(!link("founders@example.com"), "the dating waits: Nathan has not signed yet");
    await sign("nathan@example.com");
    assert.ok(link("founders@example.com"), "now everyone has signed");
    assert.ok(sent.length > 0);
  } finally {
    globalThis.fetch = closed;
    delete process.env.SIGN_HOOK_URL;
  }
});
