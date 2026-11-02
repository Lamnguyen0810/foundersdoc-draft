import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { buildSignedPdf, pageCount, sha256 } from "./pdf";
import { autoFields } from "./place";
import { notify } from "./notify";
import type { Envelope, SignField, SignStore, Signer } from "./store";

/**
 * FD Sign rules, in one place:
 *   - signers sign in order (position 1, then 2, …); a link only works when
 *     it is that person's turn;
 *   - a batch: several documents, same first signer (e.g. the Director) ->
 *     ONE link for all of them, signed once;
 *   - when the last person signs, the envelope completes, the signed PDF is
 *     built, filed on the ESOP holder's row if linked, and everyone gets a
 *     link to download it.
 * Tokens: 32 random bytes, sent once; only their SHA-256 is stored.
 */

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
export const isTokenShape = (t: string) => /^[A-Za-z0-9_-]{40,60}$/.test(t);

/** A signing link stops working this many days after it was sent (a new one can be issued from Sent). */
export const LINK_DAYS = 30;
export const isExpired = (s: Pick<Signer, "status" | "invited_at">) =>
  s.status === "invited" && !!s.invited_at && Date.now() - Date.parse(s.invited_at) > LINK_DAYS * 86_400_000;

export interface DocInput {
  title: string;
  fileName: string;
  bytes: Uint8Array;
  esopHolderId: string | null;
  esopTranche: number | null;
  signers: Array<{ name: string; email: string; role: string }>;
  fields: SignField[];
}

export interface Who {
  ip: string | null;
  ua: string | null;
}

export interface SentLink {
  name: string;
  email: string;
  role: string;
  documents: string[];
  link: string;
  emailed: boolean;
}

const linkFor = (origin: string, token: string) => `${origin}/sign/${token}`;

/** Give these signer rows a fresh token and mark them invited. */
async function invite(store: SignStore, rows: Signer[], titles: string[], origin: string, message: string | null, who: Who, reason: "invited" | "link"): Promise<SentLink> {
  const token = newToken();
  const hash = hashToken(token);
  const at = new Date().toISOString();
  for (const r of rows) {
    /* a re-issued link starts a fresh 30 days */
    await store.updateSigner(r.id, { token_hash: hash, status: "invited", invited_at: reason === "link" ? at : (r.invited_at ?? at) });
    await store.addEvent({ envelope_id: r.envelope_id, signer_id: r.id, event: reason, ip: who.ip, user_agent: who.ua, detail: r.email });
  }
  const first = rows[0];
  const link = linkFor(origin, token);
  const emailed = reason === "invited" ? await notify({ kind: "invite", to: first.email, name: first.name, role: first.role, link, documents: titles, message }) : false;
  return { name: first.name, email: first.email, role: first.role, documents: titles, link, emailed };
}

export async function createSend(
  store: SignStore,
  input: { docs: DocInput[]; batch: boolean; message: string | null; createdBy: string; origin: string; who: Who },
): Promise<{ envelopeIds: string[]; links: SentLink[] }> {
  const batchId = input.batch && input.docs.length > 1 ? crypto.randomUUID() : null;
  const firsts: Array<{ row: Signer; title: string }> = [];
  const envelopeIds: string[] = [];
  for (const d of input.docs) {
    const pages = await pageCount(d.bytes);
    const id = await store.insertEnvelope({
      title: d.title,
      file_name: d.fileName,
      original: d.bytes,
      original_sha256: sha256(d.bytes),
      page_count: pages,
      message: input.message,
      batch_id: batchId,
      esop_holder_id: d.esopHolderId,
      esop_tranche: d.esopTranche,
      created_by: input.createdBy,
    });
    envelopeIds.push(id);
    await store.addEvent({ envelope_id: id, signer_id: null, event: "created", ip: input.who.ip, user_agent: input.who.ua, detail: input.createdBy });
    for (let i = 0; i < d.signers.length; i++) {
      const s = d.signers[i];
      await store.insertSigner({ envelope_id: id, position: i + 1, name: s.name, email: s.email.toLowerCase(), role: s.role });
    }
    await store.insertFields(id, d.fields.filter((f) => f.position >= 1 && f.position <= d.signers.length && f.page >= 1 && f.page <= pages));
    const rows = await store.signers(id);
    firsts.push({ row: rows[0], title: d.title });
  }
  /* First signers: one link per person (a batch groups the same email). */
  const groups = new Map<string, typeof firsts>();
  for (const f of firsts) {
    const k = batchId ? f.row.email : f.row.id;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const links: SentLink[] = [];
  for (const g of groups.values()) {
    links.push(await invite(store, g.map((x) => x.row), g.map((x) => x.title), input.origin, input.message, input.who, "invited"));
  }
  return { envelopeIds, links };
}

/** The boxes stored for a document, or (none stored) boxes placed automatically on its signature lines. */
async function fieldsFor(store: SignStore, envelopeId: string, signers: Signer[]): Promise<SignField[]> {
  const stored = await store.fields(envelopeId);
  if (stored.length) return stored;
  const original = await store.original(envelopeId);
  if (!original) return [];
  const ordered = [...signers].sort((a, b) => a.position - b.position);
  return autoFields(envelopeId, original, ordered.map((s) => ({ name: s.name, role: s.role })));
}

export interface SignView {
  signerName: string;
  signerRole: string;
  signerEmail: string;
  state: "ready" | "waiting" | "signed" | "voided" | "expired";
  documents: Array<{
    envelopeId: string;
    title: string;
    pages: number | null;
    status: Envelope["status"];
    signers: Array<{ name: string; role: string; status: Signer["status"]; signedAt: string | null; me: boolean }>;
    /** Where THIS signer signs on this document. */
    fields: SignField[];
  }>;
  message: string | null;
  waitingFor: string | null;
}

/** What a signing link shows. Null when the link is unknown. */
export async function viewForToken(store: SignStore, token: string, who: Who | null): Promise<SignView | null> {
  if (!isTokenShape(token)) return null;
  const mine = await store.signersByToken(hashToken(token));
  if (!mine.length) return null;
  const docs: SignView["documents"] = [];
  let waitingFor: string | null = null;
  let message: string | null = null;
  for (const me of mine) {
    const env = await store.envelope(me.envelope_id);
    if (!env) continue;
    message = message ?? env.message;
    const all = await store.signers(env.id);
    const before = all.filter((s) => s.position < me.position && s.status !== "signed");
    if (before.length && !waitingFor) waitingFor = `${before[0].name} (${before[0].role})`;
    docs.push({
      envelopeId: env.id,
      title: env.title,
      pages: env.page_count,
      status: env.status,
      signers: all.map((s) => ({ name: s.name, role: s.role, status: s.status, signedAt: s.signed_at, me: s.id === me.id })),
      fields: (await fieldsFor(store, env.id, all)).filter((f) => f.position === me.position),
    });
    if (who && !me.viewed_at && me.status !== "signed") {
      await store.updateSigner(me.id, { viewed_at: new Date().toISOString() });
      await store.addEvent({ envelope_id: env.id, signer_id: me.id, event: "viewed", ip: who.ip, user_agent: who.ua, detail: null });
    }
  }
  const first = mine[0];
  const voided = docs.every((d) => d.status === "voided");
  /* in a batch, a cancelled document drops out of the list (unless all are cancelled) */
  const gone = new Set(docs.filter((d) => d.status === "voided").map((d) => d.envelopeId));
  if (!voided) for (let i = docs.length - 1; i >= 0; i--) if (docs[i].status === "voided") docs.splice(i, 1);
  const live = mine.filter((m) => voided || !gone.has(m.envelope_id));
  const allSigned = live.every((m) => m.status === "signed");
  return {
    signerName: first.name,
    signerRole: first.role,
    signerEmail: first.email,
    state: voided ? "voided" : allSigned ? "signed" : waitingFor ? "waiting" : live.some(isExpired) ? "expired" : "ready",
    documents: docs,
    message,
    waitingFor,
  };
}

export class SignError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** A signer signs every document on their link. */
export async function submitSignature(
  store: SignStore,
  input: { token: string; kind: "draw" | "type"; png: Uint8Array | null; typed: string | null; origin: string; who: Who },
): Promise<{ completed: string[] }> {
  if (!isTokenShape(input.token)) throw new SignError("This signing link is not valid.", 404);
  const mine = await store.signersByToken(hashToken(input.token));
  if (!mine.length) throw new SignError("This signing link is not valid.", 404);
  let open = mine.filter((m) => m.status === "invited");
  if (!open.length) throw new SignError("You have already signed.", 409);
  /* a cancelled document in a batch is skipped; the rest can still be signed */
  const live: Signer[] = [];
  for (const m of open) if ((await store.envelope(m.envelope_id))?.status === "sent") live.push(m);
  if (!live.length) throw new SignError("This request was cancelled by Founders Doc.", 409);
  open = live;
  if (open.some(isExpired)) throw new SignError("This link has expired. Please reply to the email and Founders Doc will send you a new one.", 410);
  for (const me of open) {
    const env = await store.envelope(me.envelope_id);
    if (!env || env.status !== "sent") throw new SignError("This document is no longer open for signing.", 409);
    const all = await store.signers(env.id);
    if (all.some((s) => s.position < me.position && s.status !== "signed")) throw new SignError("It is not your turn yet: an earlier signer still has to sign.", 409);
  }
  const at = new Date().toISOString();
  const completed: string[] = [];
  const nextGroups = new Map<string, { rows: Signer[]; titles: string[]; message: string | null }>();
  for (const me of open) {
    await store.updateSigner(me.id, {
      status: "signed",
      signed_at: at,
      signature_kind: input.kind,
      signature_png: input.kind === "draw" ? input.png : null,
      typed_name: input.kind === "type" ? input.typed : null,
      ip: input.who.ip,
      user_agent: input.who.ua,
    });
    await store.addEvent({ envelope_id: me.envelope_id, signer_id: me.id, event: "signed", ip: input.who.ip, user_agent: input.who.ua, detail: input.kind === "draw" ? "drawn signature" : "typed signature" });
    const env = (await store.envelope(me.envelope_id))!;
    const all = await store.signers(env.id);
    const next = all.find((s) => s.position > me.position && s.status === "waiting");
    if (next) {
      const k = next.email; // the same next person on several documents gets one link
      const g = nextGroups.get(k) ?? { rows: [], titles: [], message: env.message };
      g.rows.push(next);
      g.titles.push(env.title);
      nextGroups.set(k, g);
    } else if (all.every((s) => s.status === "signed" || s.id === me.id)) {
      await complete(store, env.id, input.origin, input.who, { token: input.token, ids: new Set(open.map((o) => o.id)) });
      completed.push(env.id);
    }
  }
  for (const g of nextGroups.values()) await invite(store, g.rows, g.titles, input.origin, g.message, input.who, "invited");
  return { completed };
}

async function complete(store: SignStore, envelopeId: string, origin: string, who: Who, current: { token: string; ids: Set<string> }) {
  const at = new Date().toISOString();
  await store.updateEnvelope(envelopeId, { status: "completed", completed_at: at });
  await store.addEvent({ envelope_id: envelopeId, signer_id: null, event: "completed", ip: who.ip, user_agent: who.ua, detail: null });
  const env = (await store.envelope(envelopeId))!;
  if (env.esop_holder_id) {
    try {
      const pdf = await signedPdf(store, envelopeId);
      if (pdf) {
        const docId = await store.fileToEsop(env.esop_holder_id, env.esop_tranche, pdf, `Signed - ${env.title}.pdf`);
        if (docId) {
          await store.updateEnvelope(envelopeId, { filed_document_id: docId });
          await store.addEvent({ envelope_id: envelopeId, signer_id: null, event: "filed", ip: null, user_agent: null, detail: "ESOP dashboard" });
        }
      }
    } catch (e) {
      console.error("[sign] filing on the ESOP dashboard failed:", e);
    }
  }
  /* Everyone gets a link that now downloads the signed copy: the person who
     just signed keeps theirs (they are looking at it), the others get a fresh
     one (only the hash of the old one was kept). */
  const all = await store.signers(envelopeId);
  for (const s of all) {
    let token = current.token;
    if (!current.ids.has(s.id)) {
      token = newToken();
      await store.updateSigner(s.id, { token_hash: hashToken(token) });
    }
    await notify({ kind: "completed", to: s.email, name: s.name, role: s.role, link: linkFor(origin, token), documents: [env.title], message: null });
  }
}

/** The signed PDF (or the signing-so-far version), built from what is stored. */
export async function signedPdf(store: SignStore, envelopeId: string, opts: { audit?: boolean } = {}): Promise<Uint8Array | null> {
  const env = await store.envelope(envelopeId);
  const original = env ? await store.original(envelopeId) : null;
  if (!env || !original) return null;
  const signers = await store.signers(envelopeId);
  const pngs = new Map<string, Uint8Array>();
  for (const s of signers) {
    if (s.signature_kind === "draw") {
      const p = await store.signaturePng(s.id);
      if (p) pngs.set(s.id, p);
    }
  }
  return buildSignedPdf({ original, envelope: env, signers, pngs, events: await store.events(envelopeId), fields: await fieldsFor(store, envelopeId, signers), audit: opts.audit });
}

/** Founders Doc cancels an open request: nobody can sign it any more; the links show "cancelled". */
export async function voidEnvelope(store: SignStore, envelopeId: string, who: Who, by: string): Promise<boolean> {
  const env = await store.envelope(envelopeId);
  if (!env || env.status !== "sent") return false;
  await store.updateEnvelope(envelopeId, { status: "voided" });
  await store.addEvent({ envelope_id: envelopeId, signer_id: null, event: "voided", ip: who.ip, user_agent: who.ua, detail: by });
  return true;
}

/** May this token see this envelope's files? */
export async function tokenCanSee(store: SignStore, token: string, envelopeId: string): Promise<boolean> {
  if (!isTokenShape(token)) return false;
  const mine = await store.signersByToken(hashToken(token));
  return mine.some((m) => m.envelope_id === envelopeId);
}

/** A new link for someone whose email went astray (admin). Same person's batch rows move together. */
export async function reissueLink(store: SignStore, signerId: string, origin: string, who: Who, envelopeId: string): Promise<SentLink | null> {
  const all = await store.signers(envelopeId);
  const s = all.find((x) => x.id === signerId);
  if (!s || s.status !== "invited") return null;
  const rows = s.token_hash ? (await store.signersByToken(s.token_hash)).filter((r) => r.status === "invited") : [s];
  const titles: string[] = [];
  for (const r of rows) titles.push((await store.envelope(r.envelope_id))?.title ?? "Document");
  return invite(store, rows, titles, origin, null, who, "link");
}
