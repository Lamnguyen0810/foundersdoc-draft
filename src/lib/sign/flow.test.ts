import { network, slackLines, emptyStore } from "./test-guard";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { signStore, type SignField, type SignStore } from "./store";
import { LINK_DAYS, SignError, createSend, hashToken, isTokenShape, reissueLink, remind, signedPdf, submitSignature, tokenCanSee, viewForToken, voidEnvelope, type DocInput } from "./service";
import { codeRequired, isVerified, sendCode, verifyCode, CODE_COOKIE } from "./code";
import { pageCount, sha256 } from "./pdf";
import { POST as codeRoute } from "@/app/api/sign/code/route";
import { POST as verifyRoute } from "@/app/api/sign/verify/route";
import { POST as submitRoute } from "@/app/api/sign/submit/route";
import { GET as fileRoute } from "@/app/api/sign/file/route";

/**
 * FD Sign, end to end (0243): send → open → code → sign → signed copy, and the rules in between.
 * Everything runs against the in-memory store with the network closed (test-guard.ts): no email,
 * no Slack line and no code can leave the machine. Names are samples.
 *
 * Run: npm run test:sign
 */

const ORIGIN = "http://localhost:3000";
const WHO = { ip: "203.0.113.7", ua: "test-browser" };
const OWNER = { id: "11111111-1111-4111-8111-111111111111", email: "alex.tan@example.com", name: "Alex Tan", folderId: null };
const ALEX = { name: "Alex Tan", email: "alex.tan@example.com", role: "Director" };
const JAMIE = { name: "Jamie Lee", email: "Jamie.Lee@example.com", role: "Consultant" };
const TITLE = "Consultancy Agreement";
const DAY = 86_400_000;

async function pdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]).drawText(`Consultancy Agreement, page ${i + 1}`, { x: 60, y: 760, size: 12, font });
  return doc.save();
}

const box = (position: number, kind: SignField["kind"], y: number, more: Partial<SignField> = {}): SignField => ({ position, kind, page: 1, x: 0.1 + (position - 1) * 0.4, y, w: 0.3, h: 0.05, ...more });

async function doc(more: Partial<DocInput> = {}): Promise<DocInput> {
  return {
    title: TITLE,
    fileName: "Consultancy_Agreement.pdf",
    bytes: await pdf(),
    esopHolderId: null,
    esopTranche: null,
    signers: [ALEX, JAMIE],
    fields: [box(1, "signature", 0.8), box(2, "signature", 0.8), box(2, "text", 0.7, { label: "Job title" })],
    ...more,
  };
}

const store = (): SignStore => {
  const s = signStore();
  assert.notEqual(s, "no-secret-key");
  return s as SignStore;
};
const tokenOf = (link: string) => link.split("/sign/")[1];
const send = async (s: SignStore, docs: DocInput[], opts: { batch?: boolean; own?: boolean } = {}) =>
  createSend(s, { docs, batch: opts.batch ?? false, message: "Please review and sign.", createdBy: "test", origin: ORIGIN, who: WHO, ...(opts.own === false ? {} : { owner: OWNER }) });
const sign = (s: SignStore, token: string, values?: Record<string, string>) => submitSignature(s, { token, kind: "type", png: null, typed: "Signed Name", origin: ORIGIN, who: WHO, values });
const fails = (status: number, words: RegExp) => (e: unknown) => e instanceof SignError && e.status === status && words.test(e.message);
/** The next signer's link: only its fingerprint is stored, so a test asks for a fresh one, as the sender can from Sent. */
async function linkFor(s: SignStore, envelopeId: string, position: number): Promise<string> {
  const who = (await s.signers(envelopeId)).find((x) => x.position === position)!;
  const l = await reissueLink(s, who.id, ORIGIN, WHO, envelopeId);
  assert.ok(l, "that signer has no open link");
  return tokenOf(l.link);
}

beforeEach(() => emptyStore());

test("sending: the first signer is invited, the second waits, and only the link's fingerprint is kept", async () => {
  const s = store();
  const input = await doc();
  const { envelopeIds, links } = await send(s, [input]);
  assert.equal(envelopeIds.length, 1);
  assert.equal(links.length, 1);
  const token = tokenOf(links[0].link);
  assert.ok(isTokenShape(token));
  const env = (await s.envelope(envelopeIds[0]))!;
  assert.equal(env.status, "sent");
  assert.equal(env.original_sha256, sha256(input.bytes));
  const [first, second] = await s.signers(env.id);
  assert.deepEqual([first.status, second.status], ["invited", "waiting"]);
  assert.equal(first.token_hash, hashToken(token));
  assert.equal(second.token_hash, null);
  assert.equal(second.email, "jamie.lee@example.com", "emails are stored in lower case");
  assert.ok(!JSON.stringify(await s.signers(env.id)).includes(token), "the link itself is never stored");
  assert.equal(links[0].emailed, false, "no email can go out in a test");
});

test("the whole flow: open, code, sign in order, completed, signed copy with its audit trail", async () => {
  const s = store();
  const input = await doc();
  const { envelopeIds, links } = await send(s, [input]);
  const id = envelopeIds[0];
  const t1 = tokenOf(links[0].link);

  /* signer 1 opens the link: sees their own box only */
  const view = (await viewForToken(s, t1, WHO))!;
  assert.equal(view.state, "ready");
  assert.equal(view.sender, "Alex Tan");
  assert.deepEqual(view.documents[0].fields.map((f) => `${f.position}:${f.kind}`), ["1:signature"]);

  /* the code: asked for, confirmed, then the signature */
  assert.equal(codeRequired(s), true);
  const { devCode, channel, to } = await sendCode(s, t1, ORIGIN, WHO);
  assert.equal(channel, "email");
  assert.equal(to, "a******@example.com", "the address is masked on the signing page");
  assert.match(devCode!, /^\d{6}$/);
  const secret = await verifyCode(s, t1, devCode!, WHO);
  assert.equal(await isVerified(s, t1, secret), true);
  assert.deepEqual((await sign(s, t1)).completed, []);

  /* signer 1 is done; signer 2 is now invited */
  const mid = await s.signers(id);
  assert.deepEqual(mid.map((x) => x.status), ["signed", "invited"]);
  assert.equal((await viewForToken(s, t1, WHO))!.state, "signed");
  await assert.rejects(sign(s, t1), fails(409, /already signed/));

  /* signer 2: a required text box must be filled in before signing */
  const t2 = await linkFor(s, id, 2);
  const jobTitle = (await s.fields(id)).find((f) => f.kind === "text")!;
  await assert.rejects(sign(s, t2), fails(400, /fill in .Job title./));
  assert.deepEqual((await sign(s, t2, { [jobTitle.id!]: "  Senior   Consultant " })).completed, [id]);

  const env = (await s.envelope(id))!;
  assert.equal(env.status, "completed");
  assert.ok(env.completed_at);
  assert.equal((await s.fields(id)).find((f) => f.kind === "text")!.value, "Senior Consultant");

  /* the audit trail has every step, in order */
  const steps = (await s.events(id)).map((e) => e.event);
  const order = ["created", "invited", "viewed", "code_sent", "code_verified", "signed", "completed"];
  let at = -1;
  for (const step of order) {
    const next = steps.indexOf(step, at + 1);
    assert.ok(next > at, `"${step}" is missing or out of order in ${steps.join(", ")}`);
    at = next;
  }
  const signedSteps = (await s.events(id)).filter((e) => e.event === "signed");
  assert.equal(signedSteps.length, 2);
  assert.ok(signedSteps.every((e) => e.ip === WHO.ip && e.user_agent === WHO.ua));

  /* the signed copy: a PDF with the audit trail page after the document; without it on request */
  const withAudit = (await signedPdf(s, id))!;
  const docOnly = (await signedPdf(s, id, { audit: false }))!;
  assert.equal(Buffer.from(withAudit.slice(0, 5)).toString(), "%PDF-");
  assert.equal(await pageCount(docOnly), 1);
  assert.ok((await pageCount(withAudit)) > 1);
  assert.deepEqual(new Uint8Array((await s.original(id))!), input.bytes, "the original file is kept unchanged");
});

test("signing order: the second signer cannot sign before the first", async () => {
  const s = store();
  const { envelopeIds } = await send(s, [await doc()]);
  const second = (await s.signers(envelopeIds[0]))[1];
  assert.equal(await reissueLink(s, second.id, ORIGIN, WHO, envelopeIds[0]), null, "no link is issued before their turn");
  /* even with a link in hand, the turn is checked */
  const token = "t".repeat(43);
  await s.updateSigner(second.id, { token_hash: hashToken(token), status: "invited", invited_at: new Date().toISOString() });
  assert.equal((await viewForToken(s, token, null))!.state, "waiting");
  await assert.rejects(sign(s, token), fails(409, /not your turn/));
});

test("links: unknown or malformed links show nothing, and a new link stops the old one", async () => {
  const s = store();
  const { envelopeIds, links } = await send(s, [await doc()]);
  const old = tokenOf(links[0].link);
  assert.equal(await viewForToken(s, "short", WHO), null);
  assert.equal(await viewForToken(s, "x".repeat(43), WHO), null);
  await assert.rejects(sign(s, "x".repeat(43)), fails(404, /not valid/));
  const fresh = await linkFor(s, envelopeIds[0], 1);
  assert.notEqual(fresh, old);
  assert.equal(await viewForToken(s, old, WHO), null, "the old link no longer opens");
  assert.equal((await viewForToken(s, fresh, WHO))!.state, "ready");
});

test("a link expires after 30 days", async (t) => {
  const s = store();
  const { links } = await send(s, [await doc()]);
  const token = tokenOf(links[0].link);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + (LINK_DAYS + 1) * DAY });
  assert.equal((await viewForToken(s, token, null))!.state, "expired");
  await assert.rejects(sign(s, token), fails(410, /expired/));
});

test("a cancelled request cannot be signed", async () => {
  const s = store();
  const { envelopeIds, links } = await send(s, [await doc()]);
  const token = tokenOf(links[0].link);
  assert.equal(await voidEnvelope(s, envelopeIds[0], WHO, "alex.tan@example.com"), true);
  assert.equal((await viewForToken(s, token, null))!.state, "voided");
  await assert.rejects(sign(s, token), fails(409, /cancelled by Alex Tan/));
  await assert.rejects(sendCode(s, token, ORIGIN, WHO), fails(409, /nothing left to sign/));
  assert.equal(await voidEnvelope(s, envelopeIds[0], WHO, "alex.tan@example.com"), false, "it can only be cancelled once");
});

test("the code: wrong tries are counted, five lock it, and a code works once", async () => {
  const s = store();
  const { links } = await send(s, [await doc()]);
  const token = tokenOf(links[0].link);
  await assert.rejects(verifyCode(s, token, "123456", WHO), fails(400, /ask for a code first/));
  const { devCode } = await sendCode(s, token, ORIGIN, WHO);
  const wrong = devCode === "000000" ? "111111" : "000000";
  await assert.rejects(verifyCode(s, token, wrong, WHO), fails(400, /4 tries left/));
  await assert.rejects(sendCode(s, token, ORIGIN, WHO), fails(429, /wait 30 seconds/));
  /* the right code still works after one wrong try, and only once */
  const secret = await verifyCode(s, token, ` ${devCode!.slice(0, 3)} ${devCode!.slice(3)} `, WHO);
  assert.equal(await isVerified(s, token, secret), true);
  assert.equal(await isVerified(s, token, "another-browser"), false);
  assert.equal(await isVerified(s, token, undefined), false);
  await assert.rejects(verifyCode(s, token, devCode!, WHO), fails(400, /ask for a code first/));
});

test("the code: five wrong tries lock it, it lasts 10 minutes, and the confirmation lasts 30", async (t) => {
  const s = store();
  const { envelopeIds, links } = await send(s, [await doc()]);
  const token = tokenOf(links[0].link);
  const start = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const first = (await sendCode(s, token, ORIGIN, WHO)).devCode!;
  const wrong = first === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i++) await assert.rejects(verifyCode(s, token, wrong, WHO), fails(400, /isn't right/));
  await assert.rejects(verifyCode(s, token, wrong, WHO), fails(400, /Too many wrong tries/));
  await assert.rejects(verifyCode(s, token, first, WHO), fails(429, /Too many wrong tries/));
  assert.ok((await s.events(envelopeIds[0])).some((e) => e.event === "code_locked"));

  /* a new code after the 30-second wait; left for 11 minutes, it has expired */
  t.mock.timers.setTime(start + 31_000);
  const second = (await sendCode(s, token, ORIGIN, WHO)).devCode!;
  t.mock.timers.setTime(start + 31_000 + 11 * 60_000);
  await assert.rejects(verifyCode(s, token, second, WHO), fails(410, /expired/));

  /* confirmed in time, the browser may sign for 30 minutes */
  const third = (await sendCode(s, token, ORIGIN, WHO)).devCode!;
  const secret = await verifyCode(s, token, third, WHO);
  assert.equal(await isVerified(s, token, secret), true);
  t.mock.timers.setTime(Date.now() + 31 * 60_000);
  assert.equal(await isVerified(s, token, secret), false);
});

test("the code: at most five an hour", async (t) => {
  const s = store();
  const { links } = await send(s, [await doc()]);
  const token = tokenOf(links[0].link);
  const start = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now: start });
  for (let i = 0; i < 5; i++) {
    t.mock.timers.setTime(start + i * 40_000);
    await sendCode(s, token, ORIGIN, WHO);
  }
  t.mock.timers.setTime(start + 5 * 40_000);
  await assert.rejects(sendCode(s, token, ORIGIN, WHO), fails(429, /Too many codes/));
  t.mock.timers.setTime(start + 61 * 60_000);
  assert.match((await sendCode(s, token, ORIGIN, WHO)).devCode!, /^\d{6}$/);
});

test("a batch: several documents for the same first signer share one link and are signed once", async () => {
  const s = store();
  const one = await doc({ title: "Option Certificate A", signers: [ALEX, JAMIE], fields: [box(1, "signature", 0.8), box(2, "signature", 0.8)] });
  const two = await doc({ title: "Option Certificate B", signers: [ALEX, { name: "Sam Wong", email: "sam.wong@example.com", role: "Option Holder" }], fields: [box(1, "signature", 0.8), box(2, "signature", 0.8)] });
  const { envelopeIds, links } = await send(s, [one, two], { batch: true });
  assert.equal(envelopeIds.length, 2);
  assert.equal(links.length, 1, "one link for both documents");
  assert.deepEqual(links[0].documents, ["Option Certificate A", "Option Certificate B"]);
  const token = tokenOf(links[0].link);
  assert.equal((await viewForToken(s, token, WHO))!.documents.length, 2);
  await sign(s, token);
  for (const id of envelopeIds) assert.deepEqual((await s.signers(id)).map((x) => x.status), ["signed", "invited"]);
  /* each second signer has their own link, and cannot see the other's document */
  const tA = await linkFor(s, envelopeIds[0], 2);
  assert.equal(await tokenCanSee(s, tA, envelopeIds[0]), true);
  assert.equal(await tokenCanSee(s, tA, envelopeIds[1]), false);
  assert.deepEqual((await sign(s, tA)).completed, [envelopeIds[0]]);
  assert.equal((await s.envelope(envelopeIds[1]))!.status, "sent");
});

test("a failed send leaves nothing that looks sent", async () => {
  const s = store();
  const good = await doc();
  const bad = await doc({ title: "Not a PDF", bytes: new TextEncoder().encode("this is not a PDF") });
  await assert.rejects(send(s, [good, bad]));
  const left = await s.mine(OWNER.id, 10);
  assert.ok(left.length >= 1);
  assert.ok(left.every((e) => e.status === "voided"), "what was created before the failure is marked cancelled");
});

test("reminders: the sender only, a fresh link, and at most one an hour", async (t) => {
  const s = store();
  const { envelopeIds, links } = await send(s, [await doc()]);
  const id = envelopeIds[0];
  const old = tokenOf(links[0].link);
  await assert.rejects(remind(s, "22222222-2222-4222-8222-222222222222", id, ORIGIN, WHO), fails(404, /Not found/));
  const start = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const again = await remind(s, OWNER.id, id, ORIGIN, WHO);
  assert.notEqual(tokenOf(again.link), old);
  assert.equal(await viewForToken(s, old, null), null);
  await assert.rejects(remind(s, OWNER.id, id, ORIGIN, WHO), fails(429, /less than an hour ago/));
  t.mock.timers.setTime(start + 61 * 60_000);
  assert.ok(await remind(s, OWNER.id, id, ORIGIN, WHO));
});

test("privacy: Slack lines about someone's own request never carry the title, the file, or a signer's name or email", async () => {
  const s = store();
  const input = await doc();
  const { envelopeIds, links } = await send(s, [input]);
  const t1 = tokenOf(links[0].link);
  await viewForToken(s, t1, WHO);
  await verifyCode(s, t1, (await sendCode(s, t1, ORIGIN, WHO)).devCode!, WHO);
  await sign(s, t1);
  const t2 = await linkFor(s, envelopeIds[0], 2);
  await viewForToken(s, t2, WHO);
  const jobTitle = (await s.fields(envelopeIds[0])).find((f) => f.kind === "text")!;
  await sign(s, t2, { [jobTitle.id!]: "Consultant" });

  assert.equal(slackLines.filter((l) => l.channel === "esop").length, 0, "own requests are never posted to the Founders Doc channel");
  const lines = slackLines.filter((l) => l.channel === "activity").map((l) => l.text);
  assert.ok(lines.some((l) => /opened it/.test(l)) && lines.some((l) => /confirmed their signing code/.test(l)) && lines.some((l) => /completed/.test(l)), lines.join(" | "));
  for (const line of lines) {
    /* the sender's own account name is allowed; nothing about the document or the other signer is */
    for (const secret of [TITLE, input.fileName, "Jamie", "Lee", "jamie.lee@example.com", "alex.tan@example.com", "Consultant"]) assert.ok(!line.toLowerCase().includes(secret.toLowerCase()), `"${secret}" appears in: ${line}`);
  }
});

test("the signing pages' own routes: no code, no signature; the right browser signs; the file needs the link", async () => {
  const s = store();
  const { envelopeIds, links } = await send(s, [await doc({ signers: [ALEX], fields: [box(1, "signature", 0.8)] })]);
  const id = envelopeIds[0];
  const token = tokenOf(links[0].link);
  const post = (path: string, body: unknown, cookie?: string) =>
    new NextRequest(`${ORIGIN}${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "user-agent": "test-browser", ...(cookie ? { cookie } : {}) } });
  const signature = { token, consent: true, kind: "type", typed: "Alex Tan" };

  /* straight to signing, without the code: refused */
  const early = await submitRoute(post("/api/sign/submit", signature));
  assert.equal(early.status, 401);
  assert.equal((await early.json()).needCode, true);

  /* without ticking the consent box: refused */
  assert.equal((await submitRoute(post("/api/sign/submit", { ...signature, consent: false }))).status, 400);

  /* ask for the code, confirm it: the browser gets a private cookie */
  const asked = await (await codeRoute(post("/api/sign/code", { token }))).json();
  assert.match(asked.devCode, /^\d{6}$/);
  const confirmed = await verifyRoute(post("/api/sign/verify", { token, code: asked.devCode }));
  assert.equal(confirmed.status, 200);
  const cookie = confirmed.cookies.get(CODE_COOKIE)!;
  assert.ok(cookie.value.length > 20);
  assert.equal(cookie.httpOnly, true);

  /* another browser (no cookie, or the wrong one) still cannot sign */
  assert.equal((await submitRoute(post("/api/sign/submit", signature, `${CODE_COOKIE}=someone-else`))).status, 401);

  /* the browser that confirmed the code signs */
  const done = await submitRoute(post("/api/sign/submit", signature, `${CODE_COOKIE}=${cookie.value}`));
  assert.equal(done.status, 200);
  assert.deepEqual(await done.json(), { ok: true, completed: true });
  assert.equal((await s.envelope(id))!.status, "completed");

  /* the signed copy: with the link, a PDF; with someone else's link or none, nothing */
  const file = (t: string) => fileRoute(new NextRequest(`${ORIGIN}/api/sign/file?e=${id}&t=${t}&signed=1`));
  const ok = await file(token);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "application/pdf");
  assert.match(ok.headers.get("content-disposition") ?? "", /Signed - Consultancy Agreement \(with audit trail\)\.pdf/);
  assert.equal(Buffer.from((await ok.arrayBuffer()).slice(0, 5)).toString(), "%PDF-");
  assert.equal((await file("x".repeat(43))).status, 404);
});

test("nothing left the machine", () => {
  /* the only requests a test run makes are for the signed copy's fonts, from its own address; all are refused */
  assert.deepEqual(network.filter((u) => !u.startsWith(ORIGIN)), []);
});
