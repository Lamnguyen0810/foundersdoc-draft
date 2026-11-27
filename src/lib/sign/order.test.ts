import { emptyStore } from "./test-guard";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { cleanApprovals, cleanSteps, orderLine, orderText, parseOrder, stepsFrom } from "./order";
import { signStore, type SignStore } from "./store";
import { createSend, discardDraft, remindDaily, sendDraft, submitSignature, viewForToken } from "./service";
import { allowance } from "./allowance";

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
      /* 0306: filled in already by the sender */
      { position: 1, kind: "text" as const, page: 1, x: 0.5, y: 0.1, w: 0.2, h: 0.03, label: "Designation", required: true, value: "President" },
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
    assert.equal((await viewForToken(s, tok("Alex Tan"), null))!.documents[0]!.fields.find((f) => f.kind === "text")?.value, "President", "a pre-filled box reaches the signer");

    await submitSignature(s, { token: tok("Sam Wong"), kind: "type", png: null, typed: "Sam Wong", origin: "http://localhost:3000", who });
    const pre = (await viewForToken(s, tok("Alex Tan"), null))!.documents[0]!.fields.find((f) => f.kind === "text")!;
    await submitSignature(s, { token: tok("Alex Tan"), kind: "type", png: null, typed: "Alex Tan", values: { [pre.id!]: "President" }, origin: "http://localhost:3000", who });
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

test("a draft: saved with everything, nobody emailed, not counted; then sent, or discarded", async () => {
  const s = signStore() as SignStore;
  const sent: string[] = [];
  const closed = globalThis.fetch;
  process.env.SIGN_HOOK_URL = "https://hooks.zapier.com/hooks/catch/0/test/";
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    sent.push((JSON.parse(String(init?.body ?? "{}")) as { to: string }).to);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const owner = { id: "22222222-2222-4222-8222-222222222222", email: "owner@example.com", name: "Example Consulting", folderId: null };
    const signers = [
      { name: "Alex Tan", email: "alex@example.com", role: "Director" },
      { name: "Jamie Lee", email: "jamie@example.com", role: "Director" },
    ];
    const fields = [1, 2].map((position) => ({ position, kind: "signature" as const, page: 1, x: 0.1, y: 0.2 * position, w: 0.3, h: 0.05 }));
    const who = { ip: null, ua: null };
    const me = { id: owner.id, email: owner.email, name: owner.name, confirmed: true };
    const used = (await allowance(me, s)).used;
    const d = await createSend(s, { docs: [{ title: "Members' Resolutions", fileName: "m.pdf", bytes: await pdf(), esopHolderId: null, esopTranche: null, signers, fields, cc: ["copy@example.com"], order: { steps: [1, 1], fill: [] } }], batch: false, message: null, createdBy: "test", origin: "http://localhost:3000", who, owner, draft: true });
    const id = d.envelopeIds[0]!;
    assert.equal(d.links.length, 0);
    assert.equal((await s.envelope(id))!.status, "draft");
    assert.deepEqual(sent, [], "nobody is emailed");
    assert.equal((await allowance(me, s)).used, used, "a draft is not counted");
    await assert.rejects(sendDraft(s, "33333333-3333-4333-8333-333333333333", id, "http://localhost:3000", who), /Not found/, "only its sender");
    const links = await sendDraft(s, owner.id, id, "http://localhost:3000", who);
    assert.deepEqual(links.map((l) => l.name), ["Alex Tan", "Jamie Lee"], "sent as saved: both at the same time");
    assert.equal((await s.envelope(id))!.status, "sent");
    assert.deepEqual((await s.viewers(id)).map((v) => v.email), ["copy@example.com"]);
    await assert.rejects(sendDraft(s, owner.id, id, "http://localhost:3000", who), /already been sent/);

    const other = await createSend(s, { docs: [{ title: "Old", fileName: "o.pdf", bytes: await pdf(), esopHolderId: null, esopTranche: null, signers, fields }], batch: false, message: null, createdBy: "test", origin: "http://localhost:3000", who, owner, draft: true });
    await discardDraft(s, owner.id, other.envelopeIds[0]!, who);
    assert.equal((await s.envelope(other.envelopeIds[0]!))!.status, "voided");
  } finally {
    globalThis.fetch = closed;
    delete process.env.SIGN_HOOK_URL;
  }
});

test("0307: directors signing at the same moment: the next person is invited once, the request completes once", async () => {
  const s = signStore() as SignStore;
  const sent: Array<{ to: string; kind: string; link?: string }> = [];
  const closed = globalThis.fetch;
  process.env.SIGN_HOOK_URL = "https://hooks.zapier.com/hooks/catch/0/test/";
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((r) => setTimeout(r, Math.random() * 5)); /* emails take a moment: the calls interleave */
    const b = JSON.parse(String(init?.body ?? "{}")) as { to: string; kind: string; link?: string };
    sent.push({ to: b.to, kind: b.kind, link: b.link });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const names = ["Alex Tan", "Jamie Lee", "Sam Wong", "Chris Lim", "Pat Ng"];
    const signers = names.map((n, i) => ({ name: n, email: `${n.split(" ")[0]!.toLowerCase()}@example.com`, role: i < 4 ? "Director" : "Company secretary" }));
    const fields = [
      ...[1, 2, 3, 4].map((position) => ({ position, kind: "signature" as const, page: 1, x: 0.1, y: 0.1 * position, w: 0.3, h: 0.05 })),
      { position: 5, kind: "text" as const, page: 1, x: 0.5, y: 0.9, w: 0.2, h: 0.03, label: "Day", required: true },
    ];
    const who = { ip: null, ua: null };
    const owner = { id: "44444444-4444-4444-8444-444444444444", email: "owner@example.com", name: "Example Consulting", folderId: null };
    const { envelopeIds, links } = await createSend(s, { docs: [{ title: "Directors' Resolutions", fileName: "d.pdf", bytes: await pdf(), esopHolderId: null, esopTranche: null, signers, fields, order: { steps: [1, 1, 1, 1, 2], fill: [5] } }], batch: false, message: null, createdBy: "test", origin: "http://localhost:3000", who, owner });
    const tok = (name: string) => links.find((l) => l.name === name)!.link.split("/sign/")[1]!;
    /* all four at once, and Alex presses twice */
    const results = await Promise.allSettled([...names.slice(0, 4), "Alex Tan"].map((n) => submitSignature(s, { token: tok(n), kind: "type", png: null, typed: n, origin: "http://localhost:3000", who })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 4, "each director signs once");
    assert.match(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason), /already signed/);
    const invites = sent.filter((x) => x.to === "pat@example.com" && x.link?.includes("/sign/"));
    assert.equal(invites.length, 1, "Pat is invited once");
    const signed = (await s.events(envelopeIds[0]!)).filter((e) => e.event === "signed").length;
    assert.equal(signed, 4);

    /* the last two of a step sign together, with nobody after them: one completion, one set of signed copies */
    const two = await createSend(s, { docs: [{ title: "Note", fileName: "n.pdf", bytes: await pdf(), esopHolderId: null, esopTranche: null, signers: signers.slice(0, 2), fields: fields.slice(0, 2), order: { steps: [1, 1], fill: [] } }], batch: false, message: null, createdBy: "test", origin: "http://localhost:3000", who, owner });
    const t2 = (name: string) => two.links.find((l) => l.name === name)!.link.split("/sign/")[1]!;
    const before = sent.filter((x) => x.kind === "completed").length;
    await Promise.all(["Alex Tan", "Jamie Lee"].map((n) => submitSignature(s, { token: t2(n), kind: "type", png: null, typed: n, origin: "http://localhost:3000", who })));
    assert.equal((await s.envelope(two.envelopeIds[0]!))!.status, "completed");
    assert.equal((await s.events(two.envelopeIds[0]!)).filter((e) => e.event === "completed").length, 1, "completed once");
    assert.equal(sent.filter((x) => x.kind === "completed").length - before, 3, "signed copies once: 2 signers and the sender");
  } finally {
    globalThis.fetch = closed;
    delete process.env.SIGN_HOOK_URL;
  }
});

test("0308: two approvers approve before one director; the other directors are not held up", async () => {
  const s = signStore() as SignStore;
  const sent: Array<{ to: string; kind: string; link?: string; subject?: string; text?: string }> = [];
  const closed = globalThis.fetch;
  process.env.SIGN_HOOK_URL = "https://hooks.zapier.com/hooks/catch/0/test/";
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body ?? "{}")) as { to: string; kind: string; link?: string });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const people = [
      ["Alex Tan", "Director"],
      ["Jamie Lee", "Director"],
      ["Sam Wong", "Director"],
      ["Chris Lim", "Director"],
      ["Legal Team", "Approver"],
      ["Nat Ong", "Approver"],
      ["Pat Ng", "Company secretary"],
    ];
    const signers = people.map(([n, role]) => ({ name: n!, email: `${n!.split(" ")[0]!.toLowerCase()}@example.com`, role: role! }));
    const fields = [
      ...[1, 2, 3, 4].map((position) => ({ position, kind: "signature" as const, page: 1, x: 0.1, y: 0.1 * position, w: 0.3, h: 0.05 })),
      { position: 7, kind: "text" as const, page: 1, x: 0.5, y: 0.9, w: 0.2, h: 0.03, label: "Day", required: true },
    ];
    const who = { ip: null, ua: null };
    const owner = { id: "55555555-5555-4555-8555-555555555555", email: "owner@example.com", name: "Example Consulting", folderId: null };
    const { envelopeIds, links } = await createSend(s, {
      docs: [{ title: "Directors' Resolutions", fileName: "d.pdf", bytes: await pdf(), esopHolderId: null, esopTranche: null, signers, fields, controllers: ["keith@example.com"], order: { steps: [1, 1, 1, 1, 1, 1, 2], fill: [7], approve: [[5, 2], [6, 2]] } }],
      batch: false,
      message: null,
      createdBy: "test",
      origin: "http://localhost:3000",
      who,
      owner,
    });
    const id = envelopeIds[0]!;
    assert.deepEqual(links.map((l) => l.name), ["Alex Tan", "Sam Wong", "Chris Lim", "Legal Team", "Nat Ong"], "Jamie waits for the approvals; the others start now");
    const tok = (name: string) => links.find((l) => l.name === name)!.link.split("/sign/")[1]!;
    const legalView = (await viewForToken(s, tok("Legal Team"), null))!;
    assert.equal(legalView.approveOnly, true);
    assert.equal(legalView.state, "ready");
    await assert.rejects(submitSignature(s, { token: tok("Legal Team"), kind: "type", png: null, typed: "Legal", origin: "http://localhost:3000", who }), /only approves/);

    for (const n of ["Alex Tan", "Sam Wong", "Chris Lim"]) await submitSignature(s, { token: tok(n), kind: "type", png: null, typed: n, origin: "http://localhost:3000", who });
    await submitSignature(s, { token: tok("Legal Team"), kind: "none", png: null, typed: null, origin: "http://localhost:3000", who });
    assert.ok(!sent.some((x) => x.to === "jamie@example.com"), "one approval is not enough");
    const status = sent.filter((x) => x.to === "keith@example.com").pop()!;
    assert.match(String(status.text), /Legal Team \(Approver\): Approved/);
    assert.match(String(status.text), /Jamie Lee \(Director\): Not signed yet: waiting for approval by Nat/);

    await submitSignature(s, { token: tok("Nat Ong"), kind: "none", png: null, typed: null, origin: "http://localhost:3000", who });
    const jamie = sent.filter((x) => x.to === "jamie@example.com" && x.link?.includes("/sign/"));
    assert.equal(jamie.length, 1, "the last approval lets Jamie sign");
    assert.ok(!sent.some((x) => x.to === "pat@example.com"), "the cosec waits for Jamie");
    await submitSignature(s, { token: jamie[0]!.link!.split("/sign/")[1]!, kind: "type", png: null, typed: "Jamie Lee", origin: "http://localhost:3000", who });
    assert.ok(sent.some((x) => x.to === "pat@example.com" && x.link?.includes("/sign/")), "then the cosec");
    assert.equal((await s.events(id)).filter((e) => e.event === "approved").length, 2);
    assert.deepEqual(cleanApprovals([[5, 2]], [1, 1, 1, 1, 1], []), [[5, 2]]);
    assert.equal(cleanApprovals([[5, 2]], [1, 2, 3, 4, 5], []), null, "an approver comes before the person they approve for");
    assert.equal(cleanApprovals([[1, 1]], [1], []), null);
  } finally {
    globalThis.fetch = closed;
    delete process.env.SIGN_HOOK_URL;
  }
});
