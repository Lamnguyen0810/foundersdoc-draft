import { emptyStore } from "./test-guard";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { assemble, attachmentPages, bestPage, findPages, insertPdfs, insideText, pageOrder, placeText } from "./supplements";
import { statusLines, statusMail } from "./controller";
import { signStore, type SignStore } from "./store";
import { createSend, reissueLink, submitSignature, voidEnvelope } from "./service";
import { pdfLines } from "./pdfjs-node";

/* 0296 (Rachel): supplemental documents placed where they belong, and status updates for a key controller.
   Sample names only; the network is closed (test-guard), emails are caught below. */

async function pdf(label: string, pages: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) d.addPage([595, 842]).drawText(`${label} ${i + 1}`, { x: 60, y: 760, size: 12, font: f });
  return d.save();
}
/** the words on each page, to read the order back */
async function order(bytes: Uint8Array): Promise<string[]> {
  const lines = await pdfLines(bytes, 50);
  return lines.map((l) => l.text);
}

beforeEach(() => emptyStore());

test("supplements: each goes after its page of the main document, in the order given", async () => {
  const main = await pdf("Main", 4);
  const out = await insertPdfs(main, [
    { name: "Constitution", bytes: await pdf("Constitution", 2), place: { mode: "page", page: 2 } },
    { name: "Resolution", bytes: await pdf("Resolution", 1), place: { mode: "text", text: "Appendix B", page: 3 } },
    { name: "Schedule", bytes: await pdf("Schedule", 1), place: { mode: "end" } },
    { name: "Cover", bytes: await pdf("Cover", 1), place: { mode: "start" } },
    { name: "Annex", bytes: await pdf("Annex", 1), place: { mode: "page", page: 2 } },
  ]);
  assert.equal(out.pages, 10);
  assert.deepEqual(await order(out.bytes), ["Cover 1", "Main 1", "Main 2", "Constitution 1", "Constitution 2", "Annex 1", "Main 3", "Resolution 1", "Main 4", "Schedule 1"]);
  assert.deepEqual(out.lines, [
    "Constitution (2 pages) after page 2",
    "Resolution (1 page) after “Appendix B” (page 3)",
    "Schedule (1 page) at the end",
    "Cover (1 page) at the start",
    "Annex (1 page) after page 2",
  ]);
  await assert.rejects(insertPdfs(main, [{ name: "Lost", bytes: await pdf("Lost", 1), place: { mode: "text", text: "Appendix Z", page: null } }]), /Choose where “Lost” goes/);
  await assert.rejects(insertPdfs(main, [{ name: "Broken", bytes: new Uint8Array([1, 2, 3]), place: { mode: "end" } }]), /could not be read/);
});

test("supplements: a document inside a supplemental document (a schedule inside the Constitution)", async () => {
  const main = await pdf("Main", 3);
  const out = await assemble(main, [
    { key: "c", name: "Constitution", bytes: await pdf("Constitution", 3), parent: null, after: 2, words: "Appendix A" },
    { key: "s", name: "Schedule", bytes: await pdf("Schedule", 2), parent: "c", after: 1 },
    { key: "f", name: "Form", bytes: await pdf("Form", 1), parent: "s", after: 2 },
    { key: "r", name: "Resolution", bytes: await pdf("Resolution", 1), parent: null, after: 3 },
  ]);
  assert.equal(out.pages, 10);
  assert.deepEqual(await order(out.bytes), ["Main 1", "Main 2", "Constitution 1", "Schedule 1", "Schedule 2", "Form 1", "Constitution 2", "Constitution 3", "Main 3", "Resolution 1"]);
  assert.deepEqual(out.lines, [
    "Constitution (3 pages) after “Appendix A” (page 2)",
    "Schedule (2 pages) after page 1 of “Constitution”",
    "Form (1 page) at the end of “Schedule”",
    "Resolution (1 page) at the end",
  ]);
  assert.equal(insideText(null, 0, 5, "Constitution"), "at the start of “Constitution”");
  /* a loop (each inside the other) is never reached from the main document */
  await assert.rejects(
    assemble(main, [
      { key: "a", name: "A", bytes: await pdf("A", 1), parent: "b", after: 1 },
      { key: "b", name: "B", bytes: await pdf("B", 1), parent: "a", after: 1 },
    ]),
    /Choose where “A” goes/,
  );
  assert.deepEqual(
    pageOrder(2, [{ key: "x", parent: null, after: 1, pages: 1 }, { key: "y", parent: "x", after: 0, pages: 1 }]).map((o) => `${o.src}${o.page}`),
    ["main1", "y1", "x1", "main2"],
  );
});

test("supplements: find the page by its words, however they are spaced or cased", () => {
  const info = {
    pages: [{ w: 1, h: 1 }, { w: 1, h: 1 }, { w: 1, h: 1 }],
    texts: [
      { page: 1, str: "Contents: Appendix A, Appendix B", x: 0, y: 0.1, w: 0, h: 0.01 },
      { page: 2, str: "APPENDIX", x: 0.4, y: 0.08, w: 0, h: 0.012 },
      { page: 2, str: "A", x: 0.55, y: 0.081, w: 0, h: 0.012 },
      { page: 3, str: "Appendix  B — Share resolution", x: 0, y: 0.1, w: 0, h: 0.01 },
      { page: 3, str: "The shareholders resolve that the Appendix A form is adopted.", x: 0, y: 0.3, w: 0, h: 0.01 },
    ],
  };
  assert.deepEqual(findPages(info, "appendix a"), [1, 2, 3]);
  assert.deepEqual(findPages(info, "Appendix B"), [1, 3]);
  assert.deepEqual(findPages(info, "Appendix C"), []);
  assert.deepEqual(findPages(info, "a"), [], "too short to look for");
  assert.equal(bestPage(info, "Appendix A"), 2, "the heading page, not the contents line");
  assert.equal(bestPage(info, "Appendix B"), 3, "a heading that goes on: 'Appendix B — Share resolution'");
  assert.equal(bestPage(info, "Appendix C"), null);
  assert.deepEqual(attachmentPages(info), [{ page: 2, heading: "APPENDIX A" }, { page: 3, heading: "APPENDIX B" }], "the contents line on page 1 is not a cover page");
  assert.equal(placeText({ mode: "page", page: 3 }, 3), "at the end");
  assert.equal(placeText({ mode: "page", page: 0 }, 3), "at the start");
});

test("key controller: the status email says who has signed and who hasn't, with no link", () => {
  const signers = [
    { name: "Alex Tan", role: "Director", status: "signed" as const, signedAt: "2026-11-26T07:05:00.000Z" },
    { name: "Jamie Lee", role: "Shareholder", status: "invited" as const, signedAt: null },
    { name: "Sam Wong", role: "Witness", status: "waiting" as const, signedAt: null },
  ];
  assert.deepEqual(
    statusLines(signers).map((l) => l.text),
    ["Signed 26 Nov 2026, 3:05 pm", "Not signed yet: their turn now", "Not signed yet: signs after Jamie"],
  );
  const m = statusMail({ title: "Shareholders' Agreement <draft>", signers, event: { kind: "signed", name: "Alex Tan", role: "Director" }, from: "Example Consulting" });
  assert.equal(m.subject, "1 of 3 signed: Shareholders' Agreement <draft>");
  assert.match(m.text, /\[x\] Alex Tan \(Director\): Signed/);
  assert.match(m.text, /\[ \] Sam Wong \(Witness\): Not signed yet/);
  assert.ok(m.html.includes("Shareholders' Agreement &lt;draft&gt;"), "the title is escaped");
  assert.ok(!/href=/.test(m.html.replace(/<img[^>]*>/g, "")), "no link to the document");
  assert.equal(statusMail({ title: "X", signers, event: { kind: "completed" }, from: null }).subject, "All signed: X");
  assert.match(statusMail({ title: "X", signers, event: { kind: "voided" }, from: null }).text, /1 of 3 signed before it was cancelled/);
});

test("key controller: an email after each signature, then when all have signed; none for a document without one", async () => {
  const s = signStore() as SignStore;
  const sent: Array<{ to: string; subject: string; kind: string }> = [];
  const closed = globalThis.fetch;
  process.env.SIGN_HOOK_URL = "https://hooks.zapier.com/hooks/catch/0/test/";
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body ?? "{}")) as { to: string; subject: string; kind: string };
    sent.push({ to: b.to, subject: b.subject, kind: b.kind });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const signers = [
      { name: "Alex Tan", email: "alex.tan@example.com", role: "Director" },
      { name: "Jamie Lee", email: "jamie.lee@example.com", role: "Shareholder" },
    ];
    const fields = [1, 2].map((position) => ({ position, kind: "signature" as const, page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.05 }));
    const who = { ip: null, ua: null };
    const { envelopeIds, links } = await createSend(s, {
      docs: [{ title: "Shareholders' Agreement", fileName: "sha.pdf", bytes: await pdf("Main", 1), esopHolderId: null, esopTranche: null, signers, fields, controllers: ["cosec@example.com"], supplements: ["Constitution (2 pages) after page 1"] }],
      batch: false,
      message: null,
      createdBy: "test",
      origin: "http://localhost:3000",
      who,
      owner: { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", name: "Example Consulting", folderId: null },
    });
    const id = envelopeIds[0]!;
    assert.deepEqual(await s.controllers(id), ["cosec@example.com"]);
    const ev = (await s.events(id)).map((e) => `${e.event}:${e.detail ?? ""}`);
    assert.ok(ev.includes("controller:cosec@example.com") && ev.includes("supplement:Constitution (2 pages) after page 1"), "both are in the audit trail");

    const statuses = () => sent.filter((x) => x.kind === "status_update" && x.to === "cosec@example.com").map((x) => x.subject);
    await submitSignature(s, { token: links[0]!.link.split("/sign/")[1]!, kind: "type", png: null, typed: "Alex Tan", origin: "http://localhost:3000", who });
    assert.deepEqual(statuses(), ["1 of 2 signed: Shareholders' Agreement"]);
    const second = (await s.signers(id)).find((x) => x.position === 2)!;
    const l2 = (await reissueLink(s, second.id, "http://localhost:3000", who, id))!;
    await submitSignature(s, { token: l2.link.split("/sign/")[1]!, kind: "type", png: null, typed: "Jamie Lee", origin: "http://localhost:3000", who });
    assert.deepEqual(statuses(), ["1 of 2 signed: Shareholders' Agreement", "All signed: Shareholders' Agreement"], "the last signature sends 'all signed' only");

    /* cancelled: the controller hears; a document without a controller sends no status email */
    const two = await createSend(s, { docs: [{ title: "Loan Note", fileName: "n.pdf", bytes: await pdf("Note", 1), esopHolderId: null, esopTranche: null, signers, fields, controllers: ["cosec@example.com"] }], batch: false, message: null, createdBy: "test", origin: "http://localhost:3000", who });
    await voidEnvelope(s, two.envelopeIds[0]!, who, "owner@example.com");
    assert.equal(statuses().at(-1), "Cancelled: Loan Note");
    const before = sent.filter((x) => x.kind === "status_update").length;
    const three = await createSend(s, { docs: [{ title: "Plain", fileName: "p.pdf", bytes: await pdf("Plain", 1), esopHolderId: null, esopTranche: null, signers, fields }], batch: false, message: null, createdBy: "test", origin: "http://localhost:3000", who });
    await submitSignature(s, { token: three.links[0]!.link.split("/sign/")[1]!, kind: "type", png: null, typed: "Alex Tan", origin: "http://localhost:3000", who });
    assert.equal(sent.filter((x) => x.kind === "status_update").length, before);
  } finally {
    globalThis.fetch = closed;
    delete process.env.SIGN_HOOK_URL;
  }
});
