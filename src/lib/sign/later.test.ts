import { emptyStore } from "./test-guard";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, degrees } from "pdf-lib";
import { laterBoxes } from "./later";
import { idLine, stampId } from "./stamp";
import { pdfLines } from "./pdfjs-node";
import { signStore, type SignStore } from "./store";
import { createSend, signedPdf, submitSignature, viewForToken } from "./service";

/* 0316 (Rachel): a document ID on every page, and the signer sees who fills in the date later. Sample names only. */

beforeEach(() => emptyStore());

test("later boxes: other people's date and text boxes, with a note when they come last", () => {
  const people = [
    { position: 1, name: "Alex Tan", role: "President", step: 1, done: false, fillOnly: false, skip: false },
    { position: 2, name: "Pat Ng", role: "Founders Doc", step: 2, done: false, fillOnly: true, skip: false },
  ];
  const fields = [
    { position: 1, kind: "signature" as const, page: 2, x: 0.1, y: 0.2, w: 0.3, h: 0.05 },
    { position: 2, kind: "text" as const, page: 2, x: 0.3, y: 0.1, w: 0.08, h: 0.02, label: "Day" },
    { position: 2, kind: "text" as const, page: 2, x: 0.45, y: 0.1, w: 0.12, h: 0.02, label: "Month" },
    { position: 2, kind: "signature" as const, page: 3, x: 0.1, y: 0.2, w: 0.3, h: 0.05 },
  ];
  const a = laterBoxes({ me: { position: 1, step: 1 }, people, fields });
  assert.deepEqual(
    a.boxes.map((b) => [b.label, b.atEnd]),
    [
      ["Day", true],
      ["Month", true],
    ],
    "only the other person's boxes, not signatures",
  );
  /* 0318 (Rachel): nobody is named */
  assert.equal(a.note, "The Day and Month will be filled in by the system once everyone has signed.");
  assert.ok(!JSON.stringify(a).includes("Pat"), "no name in the boxes or the note");
  assert.equal(laterBoxes({ me: { position: 2, step: 2 }, people, fields }).boxes.length, 0, "the person filling in sees their own boxes only");
  const done = people.map((p) => (p.position === 2 ? { ...p, done: true } : p));
  assert.equal(laterBoxes({ me: { position: 1, step: 1 }, people: done, fields }).boxes.length, 0, "nothing once filled in");
  const same = people.map((p) => ({ ...p, step: 1 }));
  const b = laterBoxes({ me: { position: 1, step: 1 }, people: same, fields });
  assert.equal(b.boxes.length, 2, "at the same time: shown");
  assert.equal(b.note, null, "but no 'once everyone has signed' note");
});

test("the document ID is on every page, also on turned pages", async () => {
  const d = await PDFDocument.create();
  d.addPage([595, 842]);
  d.addPage([612, 792]).setRotation(degrees(90));
  const id = "0f8c2a3e-1111-4222-8333-444455556666";
  const out = await stampId(await d.save(), id);
  const lines = await pdfLines(out);
  assert.equal(lines.filter((l) => l.text.includes(idLine(id))).length, 2, idLine(id));
  assert.equal((await PDFDocument.load(out)).getPageCount(), 2, "no page added");
});

test("the signer sees the date boxes filled in later, the email says so, and the signed copy has the ID on every page", async () => {
  const s = signStore() as SignStore;
  const sent: Array<{ to: string; kind: string; later?: string; html?: string; link?: string }> = [];
  const closed = globalThis.fetch;
  process.env.SIGN_HOOK_URL = "https://hooks.zapier.com/hooks/catch/0/test/";
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const d = await PDFDocument.create();
    d.addPage([595, 842]);
    d.addPage([595, 842]);
    const who = { ip: null, ua: null };
    const { envelopeIds, links } = await createSend(s, {
      docs: [
        {
          title: "Member's Resolutions",
          fileName: "m.pdf",
          bytes: await d.save(),
          esopHolderId: null,
          esopTranche: null,
          signers: [
            { name: "Alex Tan", email: "alex@example.com", role: "President" },
            { name: "Pat Ng", email: "pat@example.com", role: "Founders Doc" },
          ],
          fields: [
            { position: 1, kind: "signature" as const, page: 2, x: 0.1, y: 0.2, w: 0.3, h: 0.05 },
            { position: 2, kind: "text" as const, page: 1, x: 0.3, y: 0.9, w: 0.08, h: 0.02, label: "Day", required: true },
            { position: 2, kind: "text" as const, page: 1, x: 0.45, y: 0.9, w: 0.12, h: 0.02, label: "Month", required: true },
          ],
          order: { steps: [1, 2], fill: [2] },
        },
      ],
      batch: false,
      message: null,
      createdBy: "test",
      origin: "http://localhost:3000",
      who,
      owner: { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", name: "Example Consulting", folderId: null },
    });
    const id = envelopeIds[0]!;
    const alex = links[0]!.link.split("/sign/")[1]!;
    const v = (await viewForToken(s, alex, null))!;
    assert.deepEqual(v.documents[0]!.later.map((b) => `${b.label}/${b.atEnd}`), ["Day/true", "Month/true"]);
    assert.equal(v.laterNote, "The Day and Month will be filled in by the system once everyone has signed.");
    assert.ok(!JSON.stringify(v.documents[0]!.later).includes("Pat"), "no names in the boxes");
    const inv = sent.find((x) => x.to === "alex@example.com" && x.kind === "invite")!;
    assert.ok(inv.html?.includes("The Day and Month will be filled in by the system once everyone has signed."), "the signing email says the dates come at the end");
    assert.ok(!inv.html?.includes("Pat Ng"), "without naming the person who dates it");
    assert.equal(inv.later, undefined, "the note is in the email body, not a loose field");

    await submitSignature(s, { token: alex, kind: "type", png: null, typed: "Alex Tan", origin: "http://localhost:3000", who });
    const patInv = sent.filter((x) => x.to === "pat@example.com" && x.kind === "invite").pop()!;
    assert.ok(!patInv.html?.includes("once everyone has signed"), "the person dating it gets no such note");

    const pdf = (await signedPdf(s, id))!;
    const pages = await pdfLines(pdf, 10);
    const count = (await PDFDocument.load(pdf)).getPageCount();
    assert.equal(new Set(pages.filter((p) => p.text.includes(idLine(id))).map((p) => p.page)).size, count, "every page, the audit trail page too");
  } finally {
    globalThis.fetch = closed;
    delete process.env.SIGN_HOOK_URL;
  }
});
