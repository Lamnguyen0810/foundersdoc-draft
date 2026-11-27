import { emptyStore } from "./test-guard";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { cleanSteps, orderLine, orderText, parseOrder, stepsFrom } from "./order";
import { signStore, type SignStore } from "./store";
import { createSend, remindDaily, submitSignature, viewForToken } from "./service";

/* 0304 (Rachel's envelopes): directors sign at the same time, then the cosec only fills in the date. Sample names only. */

beforeEach(() => emptyStore());

test("order: steps from 'same time' ticks, checked, and kept as one audit line", () => {
  assert.deepEqual(stepsFrom([false, true, true, true, false]), [1, 1, 1, 1, 2]);
  assert.deepEqual(cleanSteps([1, 1, 2, 3], 4), [1, 1, 2, 3]);
  assert.equal(cleanSteps([1, 3], 2), null, "no skipping");
  assert.equal(cleanSteps([2, 2], 2), null, "starts at 1");
  assert.equal(cleanSteps([1, 1], 3), null, "one per signer");
  assert.equal(orderLine({ steps: [1, 2, 3], fill: [] }), null, "the default needs no line");
  const line = orderLine({ steps: [1, 1, 1, 1, 2], fill: [5] })!;
  assert.equal(line, "steps 1-1-1-1-2 · fill-in 5");
  assert.deepEqual(parseOrder(line, 5), { steps: [1, 1, 1, 1, 2], fill: [5] });
  assert.deepEqual(parseOrder(null, 3), { steps: [1, 2, 3], fill: [] });
  assert.equal(orderText({ steps: [1, 1, 2], fill: [3] }, ["Alex", "Jamie", "Sam"]), "Alex, Jamie (at the same time), then Sam. Fill in only, no signature: Sam");
});

async function pdf(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.addPage([595, 842]);
  return d.save();
}

test("parallel directors, then a person who only fills in; daily reminders", async () => {
  const s = signStore() as SignStore;
  const sent: Array<{ to: string; kind: string; link?: string }> = [];
  const closed = globalThis.fetch;
  process.env.SIGN_HOOK_URL = "https://hooks.zapier.com/hooks/catch/0/test/";
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body ?? "{}")) as { to: string; kind: string; link?: string };
    sent.push({ to: b.to, kind: b.kind, link: b.link });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const names = ["Alex Tan", "Jamie Lee", "Sam Wong", "Chris Lim", "Pat Ng"];
    const signers = names.map((n, i) => ({ name: n, email: `${n.split(" ")[0]!.toLowerCase()}@example.com`, role: i < 4 ? "Director" : "Company secretary" }));
    const fields = [
      ...[1, 2, 3, 4].map((position) => ({ position, kind: "signature" as const, page: 1, x: 0.1, y: 0.1 * position, w: 0.3, h: 0.05 })),
      { position: 5, kind: "text" as const, page: 1, x: 0.5, y: 0.9, w: 0.2, h: 0.03, label: "Date", required: true },
    ];
    const who = { ip: null, ua: null };
    const owner = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", name: "Example Consulting", folderId: null };
    const { envelopeIds, links } = await createSend(s, {
      docs: [{ title: "Directors' Resolutions", fileName: "d.pdf", bytes: await pdf(), esopHolderId: null, esopTranche: null, signers, fields, order: { steps: [1, 1, 1, 1, 2], fill: [5] }, remindDaily: true }],
      batch: false,
      message: null,
      createdBy: "test",
      origin: "http://localhost:3000",
      who,
      owner,
    });
    const id = envelopeIds[0]!;
    assert.deepEqual(links.map((l) => l.name), names.slice(0, 4), "all four directors get their link at once");
    const tok = (name: string) => links.find((l) => l.name === name)!.link.split("/sign/")[1]!;
    assert.equal((await viewForToken(s, tok("Chris Lim"), null))!.state, "ready", "the fourth director need not wait");

    await submitSignature(s, { token: tok("Sam Wong"), kind: "type", png: null, typed: "Sam Wong", origin: "http://localhost:3000", who });
    await submitSignature(s, { token: tok("Alex Tan"), kind: "type", png: null, typed: "Alex Tan", origin: "http://localhost:3000", who });
    assert.ok(!sent.some((x) => x.to === "pat@example.com"), "the cosec waits for every director");
    await assert.rejects(submitSignature(s, { token: tok("Jamie Lee"), kind: "none", png: null, typed: null, origin: "http://localhost:3000", who }), /Please sign first/);
    await submitSignature(s, { token: tok("Jamie Lee"), kind: "type", png: null, typed: "Jamie Lee", origin: "http://localhost:3000", who });
    await submitSignature(s, { token: tok("Chris Lim"), kind: "type", png: null, typed: "Chris Lim", origin: "http://localhost:3000", who });

    const invite = sent.filter((x) => x.to === "pat@example.com" && x.link?.includes("/sign/")).pop();
    assert.ok(invite, "then the cosec is invited");
    const pat = invite!.link!.split("/sign/")[1]!;
    const view = (await viewForToken(s, pat, null))!;
    assert.equal(view.fillOnly, true);
    await assert.rejects(submitSignature(s, { token: pat, kind: "type", png: null, typed: "Pat Ng", origin: "http://localhost:3000", who }), /only fills in/);
    const fid = view.documents[0]!.fields[0]!.id!;
    await submitSignature(s, { token: pat, kind: "none", png: null, typed: null, values: { [fid]: "27 November 2026" }, origin: "http://localhost:3000", who });
    assert.equal((await s.envelope(id))!.status, "completed");
    const events = (await s.events(id)).map((e) => e.event);
    assert.ok(events.includes("order") && events.includes("filled") && events.includes("remind_daily"));

    /* daily reminders: only for open requests, and not twice within a day */
    const two = await createSend(s, { docs: [{ title: "Loan Note", fileName: "n.pdf", bytes: await pdf(), esopHolderId: null, esopTranche: null, signers: signers.slice(0, 1), fields: fields.slice(0, 1), remindDaily: true }], batch: false, message: null, createdBy: "test", origin: "http://localhost:3000", who, owner });
    assert.equal(await remindDaily(s, "http://localhost:3000"), 0, "just invited: not yet");
    const ev = (await s.events(two.envelopeIds[0]!)).find((e) => e.event === "invited")!;
    (ev as { at: string }).at = new Date(Date.now() - 25 * 3_600_000).toISOString();
    assert.equal(await remindDaily(s, "http://localhost:3000"), 1, "a day later: reminded (the completed request is skipped)");
    assert.equal(await remindDaily(s, "http://localhost:3000"), 0, "and not again the same day");
  } finally {
    globalThis.fetch = closed;
    delete process.env.SIGN_HOOK_URL;
  }
});
