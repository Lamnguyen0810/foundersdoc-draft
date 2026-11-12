import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { buildSignedPdf, pageCount, sha256 } from "./pdf";
import { autoFields } from "./place";
import { signFonts } from "./certificate";
import { notify } from "./notify";
import { signerStep, slack, what } from "./slack";
import type { Envelope, SignField, SignStore, Signer } from "./store";
import { cleanText, signerSize } from "./fields";

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

/** One person = same email AND same name (in a simulation several holders share one inbox but must not share a link). */
const person = (s: Pick<Signer, "email" | "name">) => `${s.email.toLowerCase()}|${s.name.trim().toLowerCase()}`;

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
  /** phone + channel (0222): the signing code by WhatsApp or SMS instead of email */
  signers: Array<{ name: string; email: string; role: string; phone?: string | null; channel?: "email" | "whatsapp" | "sms" }>;
  /** CC: get the signed copy when everyone has signed */
  cc?: string[];
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

/** Who to name as the sender in emails and on the signing page: the account holder for own requests (SQL 119), else Founders Doc. */
export async function senderOf(store: SignStore, envelopeId: string): Promise<{ name: string; email: string | null } | null> {
  const o = await store.ownerOf(envelopeId).catch(() => null);
  if (!o) return null;
  return { name: (o.owner_name || o.owner_email || "Someone").slice(0, 160), email: o.owner_email };
}

/** Give these signer rows a fresh token and mark them invited ("reminded" = the same, emailed again, same 30 days). */
async function invite(store: SignStore, rows: Signer[], titles: string[], origin: string, message: string | null, who: Who, reason: "invited" | "link" | "reminded"): Promise<SentLink> {
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
  const sender = await senderOf(store, first.envelope_id);
  const emailed =
    reason !== "link" ? await notify({ kind: "invite", to: first.email, name: first.name, role: first.role, link, documents: titles, message, ...(sender ? { sender } : {}), ...(reason === "reminded" ? { reminder: true } : {}) }) : false;
  return { name: first.name, email: first.email, role: first.role, documents: titles, link, emailed };
}

export async function createSend(
  store: SignStore,
  input: {
    docs: DocInput[];
    batch: boolean;
    message: string | null;
    createdBy: string;
    origin: string;
    who: Who;
    /** FD Sign for everyone: the account sending it (never set for Founders Doc / ESOP sends) */
    owner?: { id: string; email: string; name: string; folderId: string | null };
  },
): Promise<{ envelopeIds: string[]; links: SentLink[] }> {
  const batchId = input.batch && input.docs.length > 1 ? crypto.randomUUID() : null;
  const firsts: Array<{ row: Signer; title: string }> = [];
  const envelopeIds: string[] = [];
  try {
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
        ...(input.owner ? { owner_id: input.owner.id, owner_email: input.owner.email, owner_name: input.owner.name, folder_id: input.owner.folderId } : {}),
      });
      envelopeIds.push(id);
      await store.addEvent({ envelope_id: id, signer_id: null, event: "created", ip: input.who.ip, user_agent: input.who.ua, detail: input.createdBy });
      for (let i = 0; i < d.signers.length; i++) {
        const s = d.signers[i];
        const sid = await store.insertSigner({ envelope_id: id, position: i + 1, name: s.name, email: s.email.toLowerCase(), role: s.role });
        if (s.phone && s.channel && s.channel !== "email") await store.setSignerPhone(sid, s.phone, s.channel);
      }
      if (d.cc?.length) await store.addViewers(id, d.cc);
      await store.insertFields(id, d.fields.filter((f) => f.position >= 1 && f.position <= d.signers.length && f.page >= 1 && f.page <= pages));
      const rows = await store.signers(id);
      firsts.push({ row: rows[0], title: d.title });
    }
  } catch (e) {
    /* 0210: a save that fails half way (nothing emailed yet) must not leave a request that looks
       sent: mark what was created as cancelled, so "My documents" and the ESOP dashboard stay right */
    for (const id of envelopeIds) {
      await store.updateEnvelope(id, { status: "voided" }).catch(() => undefined);
      await store.addEvent({ envelope_id: id, signer_id: null, event: "voided", ip: input.who.ip, user_agent: input.who.ua, detail: "send failed, nothing was emailed" }).catch(() => undefined);
    }
    throw e;
  }
  /* First signers: one link per person (a batch groups the same email). */
  const groups = new Map<string, typeof firsts>();
  for (const f of firsts) {
    const k = batchId ? person(f.row) : f.row.id;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const links: SentLink[] = [];
  for (const g of groups.values()) {
    links.push(await invite(store, g.map((x) => x.row), g.map((x) => x.title), input.origin, input.message, input.who, "invited"));
  }
  for (const l of links)
    await slack(store, envelopeIds, `✍️ Sent for signing to *${l.name}* (${l.role}): ${what(l.documents)}${l.emailed ? "" : " · emails off, link to be sent by hand"}`);
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
  /** Who sent it: the account holder's name for own requests, null = Founders Doc */
  sender: string | null;
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
      await signerStep(store, env.id, me.position, "opened"); // 0221: own requests, no title or names
    }
  }
  const first = mine[0];
  const sender = docs.length ? (await senderOf(store, docs[0].envelopeId))?.name ?? null : null;
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
    sender,
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
  input: {
    token: string;
    kind: "draw" | "type";
    png: Uint8Array | null;
    typed: string | null;
    origin: string;
    who: Who;
    /** text / checkbox boxes (SQL 120): field id -> what they typed, or "yes" for a tick */
    values?: Record<string, string>;
    /** text boxes the signer resized on their side (11 Nov): field id -> { w, h }, fractions of the page */
    sizes?: Record<string, { w: number; h: number }>;
  },
): Promise<{ completed: string[] }> {
  if (!isTokenShape(input.token)) throw new SignError("This signing link is not valid.", 404);
  const mine = await store.signersByToken(hashToken(input.token));
  if (!mine.length) throw new SignError("This signing link is not valid.", 404);
  let open = mine.filter((m) => m.status === "invited");
  if (!open.length) throw new SignError("You have already signed.", 409);
  /* a cancelled document in a batch is skipped; the rest can still be signed */
  const live: Signer[] = [];
  for (const m of open) if ((await store.envelope(m.envelope_id))?.status === "sent") live.push(m);
  const by = (await senderOf(store, open[0].envelope_id))?.name ?? "Founders Doc";
  if (!live.length) throw new SignError(`This request was cancelled by ${by}.`, 409);
  open = live;
  if (open.some(isExpired)) throw new SignError(`This link has expired. Please reply to the email and ${by} can send you a new one.`, 410);
  for (const me of open) {
    const env = await store.envelope(me.envelope_id);
    if (!env || env.status !== "sent") throw new SignError("This document is no longer open for signing.", 409);
    const all = await store.signers(env.id);
    if (all.some((s) => s.position < me.position && s.status !== "signed")) throw new SignError("It is not your turn yet: an earlier signer still has to sign.", 409);
  }
  /* what this signer typed or ticked in their own boxes; a required one left empty stops the signing */
  const answers = new Map<string, Array<{ id: string; value: string; w?: number; h?: number }>>();
  let resized = 0;
  for (const me of open) {
    const asks = (await store.fields(me.envelope_id)).filter((f) => f.position === me.position && f.id && (f.kind === "text" || f.kind === "checkbox"));
    const rows: Array<{ id: string; value: string; w?: number; h?: number }> = [];
    for (const f of asks) {
      const raw = String(input.values?.[f.id!] ?? "");
      const value = f.kind === "checkbox" ? (raw === "yes" ? "yes" : "") : cleanText(raw);
      if (f.required !== false && !value)
        throw new SignError(f.kind === "checkbox" ? `Please tick “${f.label || "the box"}” before signing.` : `Please fill in “${f.label || "the text box"}” before signing.`, 400);
      const size = f.kind === "text" ? signerSize(f, input.sizes?.[f.id!]?.w, input.sizes?.[f.id!]?.h) : null;
      const changed = !!size && (Math.abs(size.w - f.w) > 0.001 || Math.abs(size.h - f.h) > 0.001);
      if (changed) resized++;
      rows.push({ id: f.id!, value, ...(changed && size ? size : {}) });
    }
    if (rows.length) answers.set(me.envelope_id, rows);
  }

  const at = new Date().toISOString();
  const completed: string[] = [];
  const toComplete: string[] = [];
  const nextGroups = new Map<string, { rows: Signer[]; titles: string[]; message: string | null }>();
  for (const me of open) {
    const a = answers.get(me.envelope_id);
    if (a) await store.setFieldValues(me.envelope_id, a);
    await store.updateSigner(me.id, {
      status: "signed",
      signed_at: at,
      signature_kind: input.kind,
      signature_png: input.kind === "draw" ? input.png : null,
      typed_name: input.kind === "type" ? input.typed : null,
      ip: input.who.ip,
      user_agent: input.who.ua,
    });
    await store.addEvent({ envelope_id: me.envelope_id, signer_id: me.id, event: "signed", ip: input.who.ip, user_agent: input.who.ua, detail: `${input.kind === "draw" ? "drawn signature" : "typed signature"}${resized ? ` · resized ${resized} text box${resized === 1 ? "" : "es"}` : ""}` });
    const env = (await store.envelope(me.envelope_id))!;
    const all = await store.signers(env.id);
    const next = all.find((s) => s.position > me.position && s.status === "waiting");
    if (next) {
      const k = person(next); // the same next person on several documents gets one link
      const g = nextGroups.get(k) ?? { rows: [], titles: [], message: env.message };
      g.rows.push(next);
      g.titles.push(env.title);
      nextGroups.set(k, g);
    } else if (all.every((s) => s.status === "signed" || s.id === me.id)) {
      toComplete.push(env.id);
    }
  }
  const signedTitles: string[] = [];
  for (const m of open) signedTitles.push((await store.envelope(m.envelope_id))?.title ?? "Document");
  await slack(store, open.map((m) => m.envelope_id), `✅ *${open[0].name}* (${open[0].role}) signed ${what(signedTitles)}`);
  for (const m of open) await signerStep(store, m.envelope_id, m.position, "signed"); // 0221
  /* finish the documents everyone has now signed (after the "signed" update, so Slack reads in order) */
  for (const id of toComplete) {
    await complete(store, id, input.origin, input.who, { token: input.token, ids: new Set(open.map((o) => o.id)) });
    completed.push(id);
  }
  for (const g of nextGroups.values()) {
    const sent = await invite(store, g.rows, g.titles, input.origin, g.message, input.who, "invited");
    await slack(store, g.rows.map((r) => r.envelope_id), `✍️ Next: sent for signing to *${sent.name}* (${sent.role}): ${what(sent.documents)}`);
  }
  return { completed };
}

async function complete(store: SignStore, envelopeId: string, origin: string, who: Who, current: { token: string; ids: Set<string> }) {
  const at = new Date().toISOString();
  await store.updateEnvelope(envelopeId, { status: "completed", completed_at: at });
  await signerStep(store, envelopeId, 0, "completed"); // 0221
  await store.addEvent({ envelope_id: envelopeId, signer_id: null, event: "completed", ip: who.ip, user_agent: who.ua, detail: null });
  const env = (await store.envelope(envelopeId))!;
  if (env.esop_holder_id) {
    try {
      const pdf = await signedPdf(store, envelopeId, { origin });
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
  const sender = await senderOf(store, envelopeId);
  for (const s of all) {
    let token = current.token;
    if (!current.ids.has(s.id)) {
      token = newToken();
      await store.updateSigner(s.id, { token_hash: hashToken(token) });
    }
    await notify({ kind: "completed", to: s.email, name: s.name, role: s.role, link: linkFor(origin, token), documents: [env.title], message: null, ...(sender ? { sender } : {}) });
  }
  /* own request: the sender gets it too when they were not a signer (their copy is in My documents) */
  if (sender?.email && !all.some((s) => s.email.toLowerCase() === sender.email!.toLowerCase())) {
    await notify({ kind: "completed", to: sender.email, name: sender.name, role: "Sender", link: `${origin}/fd-sign/d/${envelopeId}`, documents: [env.title], message: null, sender });
  }
  /* CC: a private link that downloads the signed copy (certificate only) */
  for (const v of await store.viewers(envelopeId)) {
    if (v.sent_at) continue;
    const token = newToken();
    await store.setViewerToken(v.id, hashToken(token));
    await notify({
      kind: "completed",
      to: v.email,
      name: v.email.split("@")[0],
      role: "Copy",
      link: `${origin}/api/sign/file?e=${envelopeId}&t=${token}&signed=1&doc=1&download=1`,
      documents: [env.title],
      message: null,
      ...(sender ? { sender } : {}),
    });
    await store.addEvent({ envelope_id: envelopeId, signer_id: null, event: "copy_sent", ip: null, user_agent: null, detail: v.email });
  }
  const filed = (await store.envelope(envelopeId))?.filed_document_id;
  const copies = (await store.viewers(envelopeId)).map((v) => v.email);
  await slack(
    store,
    [envelopeId],
    `📄 All parties signed: ${env.title} · <${origin}/api/sign/file?e=${envelopeId}&signed=1&doc=1|signed certificate> (FD admins)` +
      (filed ? " · filed on the ESOP dashboard" : "") +
      (copies.length ? ` · copy sent to ${copies.join(", ")}` : ""),
  );
}

/** The signed PDF (or the signing-so-far version), built from what is stored. */
export async function signedPdf(store: SignStore, envelopeId: string, opts: { audit?: boolean; origin?: string } = {}): Promise<Uint8Array | null> {
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
  return buildSignedPdf({ original, envelope: env, signers, pngs, events: await store.events(envelopeId), fields: await fieldsFor(store, envelopeId, signers), audit: opts.audit, fontBytes: opts.origin ? await signFonts(opts.origin).catch(() => null) : null });
}

/** Founders Doc cancels an open request: nobody can sign it any more; the links show "cancelled". */
export async function voidEnvelope(store: SignStore, envelopeId: string, who: Who, by: string): Promise<boolean> {
  const env = await store.envelope(envelopeId);
  if (!env || env.status !== "sent") return false;
  await store.updateEnvelope(envelopeId, { status: "voided" });
  await store.addEvent({ envelope_id: envelopeId, signer_id: null, event: "voided", ip: who.ip, user_agent: who.ua, detail: by });
  await slack(store, [envelopeId], `❌ Cancelled by ${by.split("@")[0]}: ${env.title}`);
  return true;
}

/** May this token see this envelope's files? */
export async function tokenCanSee(store: SignStore, token: string, envelopeId: string): Promise<boolean> {
  if (!isTokenShape(token)) return false;
  const h = hashToken(token);
  const mine = await store.signersByToken(h);
  if (mine.some((m) => m.envelope_id === envelopeId)) return true;
  return (await store.viewerEnvelopes(h)).includes(envelopeId);
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

/* ── FD Sign for everyone (SQL 119): the sender's own actions ─────────────────── */

/** Email the person whose turn it is again (a fresh link; their old one stops working). At most once an hour. */
export async function remind(store: SignStore, ownerId: string, envelopeId: string, origin: string, who: Who): Promise<SentLink> {
  const o = await store.ownerOf(envelopeId);
  const env = o?.owner_id === ownerId ? await store.envelope(envelopeId) : null;
  if (!env) throw new SignError("Not found.", 404);
  if (env.status !== "sent") throw new SignError("Only a request that is still open can be reminded.", 409);
  const last = (await store.events(envelopeId)).filter((e) => e.event === "reminded").pop();
  if (last && Date.now() - Date.parse(last.at) < 3_600_000) throw new SignError("A reminder went out less than an hour ago.", 429);
  const now = (await store.signers(envelopeId)).find((s) => s.status === "invited");
  if (!now) throw new SignError("Nobody is waiting to sign.", 409);
  if (isExpired(now)) throw new SignError("This request has expired. Cancel it and send it again.", 410);
  return invite(store, [now], [env.title], origin, env.message, who, "reminded");
}

/**
 * "Sign now" in My documents, for a signed-in person whose turn it is.
 *   - my own request (I uploaded it): straight to a fresh signing page (the email code is still asked);
 *   - someone else's request: a fresh signing link is emailed to me, so seeing the document
 *     still needs that inbox (an account alone never proves who owns an email address).
 */
export async function openForMe(store: SignStore, account: { id: string; email: string }, signerId: string, origin: string, who: Who): Promise<{ url: string } | { emailed: string }> {
  const mine = (await store.waitingFor(account.email)).find((w) => w.signer_id === signerId);
  if (!mine) throw new SignError("Not found.", 404);
  const all = await store.signers(mine.envelope_id);
  const me = all.find((s) => s.id === signerId);
  if (!me || me.status !== "invited") throw new SignError("Nothing to sign.", 409);
  if (all.some((s) => s.position < me.position && s.status !== "signed")) throw new SignError("It isn't your turn yet.", 409);
  if (isExpired(me)) throw new SignError("This request has expired. Ask the sender to send it again.", 410);
  const owner = await store.ownerOf(mine.envelope_id);
  if (owner?.owner_id === account.id) return { url: (await invite(store, [me], [mine.title], origin, null, who, "link")).link };
  const last = (await store.events(mine.envelope_id)).filter((e) => e.event === "reminded" && e.signer_id === me.id).pop();
  if (last && Date.now() - Date.parse(last.at) < 600_000) throw new SignError(`We emailed you a signing link a few minutes ago. Please check ${me.email}.`, 429);
  const env = await store.envelope(mine.envelope_id);
  await invite(store, [me], [mine.title], origin, env?.message ?? null, who, "reminded");
  return { emailed: me.email };
}
