import "server-only";
import { stampId } from "./stamp";
import { laterBoxes, type LaterBox } from "./later";
import { createHash, randomBytes } from "node:crypto";
import { buildSignedPdf, pageCount, sha256 } from "./pdf";
import { autoFields } from "./place";
import { signFonts } from "./certificate";
import { notify } from "./notify";
import { certificateSubject } from "./esop-subject";
import { signerStep, slack, what } from "./slack";
import type { Envelope, SignField, SignStore, Signer } from "./store";
import { cleanText, signerSize } from "./fields";
import { statusMail, type StatusEvent } from "./controller";
import { sendEmail } from "./notify";
import { approversOf, approves, orderLine, parseOrder, type Order } from "./order";

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
  /** 0296: key controllers: a status email each time someone signs (who has signed, who hasn't) */
  controllers?: string[];
  /** 0296: supplemental documents inserted into the PDF before sending, for the audit trail */
  supplements?: string[];
  /** 0304: steps (same number = sign at the same time) and who only fills in (positions), and daily reminders */
  order?: Order;
  remindDaily?: boolean;
  fields: SignField[];
}

/** 0304: an envelope's signing order (from its "order" line in the audit trail; default one after another) */
export async function orderOf(store: SignStore, envelopeId: string, n: number): Promise<Order> {
  const line = (await store.events(envelopeId)).filter((e) => e.event === "order").pop();
  return parseOrder(line?.detail, n);
}
const stepOf = (o: Order, s: Signer) => o.steps[s.position - 1] ?? s.position;
/** a person who only fills in (no signature) */
export const fillsOnly = (o: Order, s: Pick<Signer, "position">) => o.fill.includes(s.position);
/** 0308: waiting for an approval first (their approvers have not all approved) */
const approvedBy = (o: Order, position: number, all: Signer[]) => approversOf(o, position).filter((a) => all.find((x) => x.position === a)?.status === "signed");
const held = (o: Order, s: Signer, all: Signer[]) => {
  const need = approversOf(o, s.position);
  if (!need.length) return false;
  const done = approvedBy(o, s.position, all).length;
  /* 0309: one approval is enough when the sender chose "any one of them" */
  return (o.anyOf ?? []).includes(s.position) ? done === 0 : done < need.length;
};
/** 0309: an approver no longer needed (another approver already approved, and one is enough): they hold nothing up */
export const needless = (o: Order, s: Signer, all: Signer[]) => {
  if (s.status === "signed") return false;
  const t = (o.approve ?? []).find(([a]) => a === s.position)?.[1];
  return t !== undefined && (o.anyOf ?? []).includes(t) && approvedBy(o, t, all).length > 0;
};

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
  /* 0257: option certificates carry the vesting's own subject line; anything else keeps FD Sign's */
  const subject = reason !== "link" && !sender ? await certificateSubject(await Promise.all(rows.map((r) => store.envelope(r.envelope_id))), "sign", reason === "reminded") : null;
  /* 0313: an approver's email says "to approve", someone who only fills in "to complete" */
  const ord = await orderOf(store, first.envelope_id, (await store.signers(first.envelope_id)).length);
  const asks = approves(ord, first.position) ? ("approve" as const) : fillsOnly(ord, first) ? ("complete" as const) : null;
  /* 0316: say who fills in boxes after everyone has signed (e.g. Founders Doc dating the resolutions) */
  const everyone = await store.signers(first.envelope_id);
  const later = laterBoxes({
    me: { position: first.position, step: stepOf(ord, first) },
    people: everyone.map((s) => ({ position: s.position, name: s.name, role: s.role, step: stepOf(ord, s), done: s.status === "signed", fillOnly: fillsOnly(ord, s), skip: needless(ord, s, everyone) })),
    fields: await fieldsFor(store, first.envelope_id, everyone),
  }).note;
  const emailed =
    reason !== "link"
      ? await notify({ kind: "invite", to: first.email, name: first.name, role: first.role, link, documents: titles, message, ...(sender ? { sender } : {}), ...(reason === "reminded" ? { reminder: true } : {}), ...(subject ? { subject } : {}), ...(asks ? { asks } : {}), ...(later ? { later } : {}) })
      : false;
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
    /** 0305: save it without sending (own requests only); send later with sendDraft */
    draft?: boolean;
  },
): Promise<{ envelopeIds: string[]; links: SentLink[] }> {
  const draft = !!input.draft && !!input.owner;
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
        ...(draft ? { status: "draft" as const } : {}),
      });
      envelopeIds.push(id);
      await store.addEvent({ envelope_id: id, signer_id: null, event: draft ? "drafted" : "created", ip: input.who.ip, user_agent: input.who.ua, detail: input.createdBy });
      for (let i = 0; i < d.signers.length; i++) {
        const s = d.signers[i];
        const sid = await store.insertSigner({ envelope_id: id, position: i + 1, name: s.name, email: s.email.toLowerCase(), role: s.role });
        if (s.phone && s.channel && s.channel !== "email") await store.setSignerPhone(sid, s.phone, s.channel);
      }
      if (d.cc?.length) await store.addViewers(id, d.cc);
      if (d.controllers?.length) {
        await store.addControllers(id, d.controllers);
        for (const c of d.controllers) await store.addEvent({ envelope_id: id, signer_id: null, event: "controller", ip: null, user_agent: null, detail: c });
      }
      for (const line of d.supplements ?? []) await store.addEvent({ envelope_id: id, signer_id: null, event: "supplement", ip: null, user_agent: null, detail: line.slice(0, 200) });
      const ol = d.order ? orderLine(d.order) : null;
      if (ol) await store.addEvent({ envelope_id: id, signer_id: null, event: "order", ip: null, user_agent: null, detail: ol });
      if (d.remindDaily) await store.addEvent({ envelope_id: id, signer_id: null, event: "remind_daily", ip: null, user_agent: null, detail: null });
      await store.insertFields(id, d.fields.filter((f) => f.position >= 1 && f.position <= d.signers.length && f.page >= 1 && f.page <= pages));
      const rows = await store.signers(id);
      /* 0304: everyone in the first step gets their link now (parallel signing) */
      const o = d.order ? parseOrder(orderLine(d.order), rows.length) : null;
      for (const r of rows) if ((o ? stepOf(o, r) : r.position) === 1 && !(o && held(o, r, rows))) firsts.push({ row: r, title: d.title });
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
  if (draft) return { envelopeIds, links: [] };
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

/**
 * 0305: send a saved draft (the sender's own). Its people, boxes, copies, key controllers, order and reminders
 * were all saved with it; now everyone in the first step gets their link. The date it was sent counts as its date.
 */
export async function sendDraft(store: SignStore, ownerId: string, envelopeId: string, origin: string, who: Who): Promise<SentLink[]> {
  const o = await store.ownerOf(envelopeId);
  const env = o?.owner_id === ownerId ? await store.envelope(envelopeId) : null;
  if (!env) throw new SignError("Not found.", 404);
  if (env.status !== "draft") throw new SignError("This one has already been sent.", 409);
  const all = await store.signers(envelopeId);
  const order = await orderOf(store, envelopeId, all.length);
  /* 0307: "Send now" pressed twice sends once */
  if (!(await store.claimEnvelope(envelopeId, "draft", { status: "sent", created_at: new Date().toISOString() }))) throw new SignError("This one has already been sent.", 409);
  await store.addEvent({ envelope_id: envelopeId, signer_id: null, event: "created", ip: who.ip, user_agent: who.ua, detail: "sent from a draft" });
  const links: SentLink[] = [];
  for (const s of all.filter((x) => stepOf(order, x) === 1 && !held(order, x, all))) links.push(await invite(store, [s], [env.title], origin, env.message, who, "invited"));
  for (const l of links) await slack(store, [envelopeId], `✍️ Sent for signing to *${l.name}* (${l.role}): ${what(l.documents)}`);
  return links;
}

/** 0305: throw a draft away (it was never sent: nobody was emailed) */
export async function discardDraft(store: SignStore, ownerId: string, envelopeId: string, who: Who): Promise<void> {
  const o = await store.ownerOf(envelopeId);
  const env = o?.owner_id === ownerId ? await store.envelope(envelopeId) : null;
  if (!env) throw new SignError("Not found.", 404);
  if (env.status !== "draft") throw new SignError("Only a draft can be discarded.", 409);
  await store.updateEnvelope(envelopeId, { status: "voided" });
  await store.addEvent({ envelope_id: envelopeId, signer_id: null, event: "voided", ip: who.ip, user_agent: who.ua, detail: "draft discarded, never sent" });
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
    /** 0316: boxes other people still fill in (grey placeholders, no values) */
    later: LaterBox[];
  }>;
  /** 0316: e.g. "Founders Doc (Cosec) will fill in the Day and Month boxes once everyone has signed." */
  laterNote: string | null;
  message: string | null;
  waitingFor: string | null;
  /** Who sent it: the account holder's name for own requests, null = Founders Doc */
  sender: string | null;
  /** 0304: this person only fills in their boxes (no signature) */
  fillOnly?: boolean;
  /** 0308: this person only approves (no boxes, no signature) */
  approveOnly?: boolean;
}

/** What a signing link shows. Null when the link is unknown. */
export async function viewForToken(store: SignStore, token: string, who: Who | null): Promise<SignView | null> {
  if (!isTokenShape(token)) return null;
  const mine = await store.signersByToken(hashToken(token));
  if (!mine.length) return null;
  const docs: SignView["documents"] = [];
  let waitingFor: string | null = null;
  let message: string | null = null;
  let fillOnly = false;
  let approveOnly = false;
  const notes: string[] = [];
  for (const me of mine) {
    const env = await store.envelope(me.envelope_id);
    if (!env) continue;
    message = message ?? env.message;
    const all = await store.signers(env.id);
    const o = await orderOf(store, env.id, all.length);
    if (fillsOnly(o, me) || approves(o, me.position)) fillOnly = true;
    if (approves(o, me.position)) approveOnly = true;
    const before = all.filter((s) => stepOf(o, s) < stepOf(o, me) && s.status !== "signed" && !needless(o, s, all));
    if (before.length && !waitingFor) waitingFor = `${before[0].name} (${before[0].role})`;
    docs.push({
      envelopeId: env.id,
      title: env.title,
      pages: env.page_count,
      status: env.status,
      signers: all.map((s) => ({ name: s.name, role: s.role, status: s.status, signedAt: s.signed_at, me: s.id === me.id })),
      ...(await (async () => {
        const fs = await fieldsFor(store, env.id, all);
        const l = laterBoxes({
          me: { position: me.position, step: stepOf(o, me) },
          people: all.map((s) => ({ position: s.position, name: s.name, role: s.role, step: stepOf(o, s), done: s.status === "signed", fillOnly: fillsOnly(o, s), skip: needless(o, s, all) })),
          fields: fs,
        });
        if (l.note && !notes.includes(l.note)) notes.push(l.note);
        return { fields: fs.filter((f) => f.position === me.position), later: l.boxes };
      })()),
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
    fillOnly,
    approveOnly,
    laterNote: voided || allSigned ? null : notes.join(" ") || null,
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
    /** "none": a person who only fills in (0304) */
    kind: "draw" | "type" | "none";
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
    const o = await orderOf(store, env.id, all.length);
    if (all.some((s) => stepOf(o, s) < stepOf(o, me) && s.status !== "signed" && !needless(o, s, all))) throw new SignError("It is not your turn yet: an earlier signer still has to sign.", 409);
    if ((input.kind === "none") !== (fillsOnly(o, me) || approves(o, me.position)))
      throw new SignError(input.kind === "none" ? "Please sign first." : approves(o, me.position) ? "This person only approves: no signature is needed." : "This person only fills in: no signature is needed.", 400);
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
    /* 0307: signed once only (a double click, or the same link open twice, can't sign twice) */
    const mine = await store.claimSigner(me.id, "invited", {
      status: "signed",
      signed_at: at,
      signature_kind: input.kind === "none" ? null : input.kind,
      signature_png: input.kind === "draw" ? input.png : null,
      typed_name: input.kind === "type" ? input.typed : null,
      ip: input.who.ip,
      user_agent: input.who.ua,
    });
    if (!mine) throw new SignError("You have already signed.", 409);
    const a = answers.get(me.envelope_id);
    if (a) await store.setFieldValues(me.envelope_id, a);
    const approving = input.kind === "none" && approves(await orderOf(store, me.envelope_id, (await store.signers(me.envelope_id)).length), me.position);
    await store.addEvent({ envelope_id: me.envelope_id, signer_id: me.id, event: approving ? "approved" : input.kind === "none" ? "filled" : "signed", ip: input.who.ip, user_agent: input.who.ua, detail: `${input.kind === "draw" ? "drawn signature" : input.kind === "type" ? "typed signature" : approving ? "approved, no signature needed" : "filled in, no signature needed"}${resized ? ` · resized ${resized} text box${resized === 1 ? "" : "es"}` : ""}` });
    const env = (await store.envelope(me.envelope_id))!;
    const all = await store.signers(env.id);
    const o = await orderOf(store, env.id, all.length);
    /* 0304: the next step starts when everyone in this step has signed (parallel signers wait for each other) */
    const sameStep = all.some((s) => s.id !== me.id && stepOf(o, s) === stepOf(o, me) && s.status !== "signed" && !needless(o, s, all));
    const later = all.filter((s) => s.status === "waiting" && stepOf(o, s) > stepOf(o, me));
    const nextStep = later.length ? Math.min(...later.map((s) => stepOf(o, s))) : null;
    const queue = (next: Signer) => {
      const k = person(next); // the same next person on several documents gets one link
      const g = nextGroups.get(k) ?? { rows: [], titles: [], message: env.message };
      g.rows.push(next);
      g.titles.push(env.title);
      nextGroups.set(k, g);
    };
    /* 0308: the last approval lets the person it was for sign (when their turn has come) */
    for (const [, t] of (o.approve ?? []).filter(([a]) => a === me.position)) {
      const target = all.find((x) => x.position === t);
      if (!target || target.status !== "waiting" || held(o, target, all)) continue;
      if (!all.every((x) => stepOf(o, x) >= stepOf(o, target) || x.status === "signed" || needless(o, x, all))) continue;
      if (await store.claimSigner(target.id, "waiting", { status: "invited" })) queue(target);
    }
    if (sameStep) {
      /* others at the same time still to sign */
    } else if (nextStep !== null) {
      for (const next of later.filter((s) => stepOf(o, s) === nextStep)) {
        /* 0308: someone still waiting for an approval is let in by the last approval instead */
        if (held(o, next, all)) continue;
        /* 0307: two people of a step signing at the same moment both see the step done; only one invites */
        if (!(await store.claimSigner(next.id, "waiting", { status: "invited" }))) continue;
        queue(next);
      }
    } else if (all.every((s) => s.status === "signed" || s.id === me.id || needless(o, s, all))) {
      /* 0307: and only one of them completes it (one set of signed copies) */
      if (await store.claimEnvelope(env.id, "sent", { status: "completed", completed_at: new Date().toISOString() })) toComplete.push(env.id);
    }
  }
  const signedTitles: string[] = [];
  for (const m of open) signedTitles.push((await store.envelope(m.envelope_id))?.title ?? "Document");
  await slack(store, open.map((m) => m.envelope_id), `✅ *${open[0].name}* (${open[0].role}) signed ${what(signedTitles)}`);
  for (const m of open) await signerStep(store, m.envelope_id, m.position, "signed"); // 0221
  /* 0296: the key controllers hear who has signed and who hasn't (the completed email follows for the last one) */
  for (const m of open) if (!toComplete.includes(m.envelope_id)) await tellControllers(store, m.envelope_id, { kind: "signed", name: m.name, role: m.role, did: input.kind !== "none" ? "signed" : approves(await orderOf(store, m.envelope_id, (await store.signers(m.envelope_id)).length), m.position) ? "approved" : "filled" }, m.email);
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
  /* 0257: the signed copy of an option certificate carries the vesting's own subject line */
  const signedSubject = sender ? null : await certificateSubject([env], "signed");
  const titled = signedSubject ? { subject: signedSubject } : {};
  for (const s of all) {
    let token = current.token;
    if (!current.ids.has(s.id)) {
      token = newToken();
      await store.updateSigner(s.id, { token_hash: hashToken(token) });
    }
    await notify({ kind: "completed", to: s.email, name: s.name, role: s.role, link: linkFor(origin, token), documents: [env.title], message: null, ...(sender ? { sender } : {}), ...titled });
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
      ...titled,
    });
    await store.addEvent({ envelope_id: envelopeId, signer_id: null, event: "copy_sent", ip: null, user_agent: null, detail: v.email });
  }
  await tellControllers(store, envelopeId, { kind: "completed" });
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
  const out = await buildSignedPdf({ original, envelope: env, signers, pngs, events: await store.events(envelopeId), fields: await fieldsFor(store, envelopeId, signers), audit: opts.audit, fontBytes: opts.origin ? await signFonts(opts.origin).catch(() => null) : null });
  /* 0316: the document ID on every page (ESOP certificates keep their own design) */
  return env.esop_holder_id ? out : stampId(out, envelopeId);
}

/** Founders Doc cancels an open request: nobody can sign it any more; the links show "cancelled". */
export async function voidEnvelope(store: SignStore, envelopeId: string, who: Who, by: string): Promise<boolean> {
  const env = await store.envelope(envelopeId);
  if (!env || env.status !== "sent") return false;
  await store.updateEnvelope(envelopeId, { status: "voided" });
  await store.addEvent({ envelope_id: envelopeId, signer_id: null, event: "voided", ip: who.ip, user_agent: who.ua, detail: by });
  await slack(store, [envelopeId], `❌ Cancelled by ${by.split("@")[0]}: ${env.title}`);
  await tellControllers(store, envelopeId, { kind: "voided" });
  return true;
}

/**
 * 0296: a status email to each key controller of this document: what just happened, and every signer with
 * signed / not signed yet. Names, roles and times only; never a link to the document. A failed email is logged,
 * never stops the signing.
 */
export async function tellControllers(store: SignStore, envelopeId: string, event: StatusEvent, signerEmail?: string): Promise<number> {
  const controllers = (await store.controllers(envelopeId).catch(() => [] as string[])).map((e) => e.toLowerCase());
  const sender = await senderOf(store, envelopeId);
  /* 0303: the sender hears after each signature too (not for their own signature; the completed email covers the last) */
  const own = sender?.email?.toLowerCase() ?? "";
  const toSender = event.kind === "signed" && !!own && own !== signerEmail?.toLowerCase() && !controllers.includes(own);
  if (!controllers.length && !toSender) return 0;
  const env = await store.envelope(envelopeId);
  if (!env) return 0;
  const signers = (await store.signers(envelopeId)).sort((a, b) => a.position - b.position);
  const ord = await orderOf(store, envelopeId, signers.length);
  const nameAt = (p: number) => signers.find((x) => x.position === p)?.name.split(/\s+/)[0] ?? `person ${p}`;
  const rows = signers.map((s) => ({
    name: s.name,
    role: s.role,
    status: s.status,
    signedAt: s.signed_at,
    does: approves(ord, s.position) ? ("approve" as const) : fillsOnly(ord, s) ? ("fill" as const) : ("sign" as const),
    heldFor: held(ord, s, signers) ? approversOf(ord, s.position).filter((a) => signers.find((x) => x.position === a)?.status !== "signed").map(nameAt) : [],
    step: stepOf(ord, s),
    notNeeded: needless(ord, s, signers)
      ? approvedBy(ord, (ord.approve ?? []).find(([a]) => a === s.position)![1], signers).map(nameAt).join(" and ")
      : undefined,
    /* 0317: for the signing register */
    invitedAt: s.status === "invited" ? s.invited_at : null,
    ...(() => {
      const t = (ord.approve ?? []).find(([a]) => a === s.position)?.[1];
      return t !== undefined ? { approvesFor: nameAt(t), anyOne: (ord.anyOf ?? []).includes(t) } : {};
    })(),
    afterApproval: approversOf(ord, s.position).length > 0,
  }));
  const sentAt = signers.map((s) => s.invited_at).filter((x): x is string => !!x).sort()[0] ?? null;
  const list: Array<{ email: string; to: "controller" | "sender" }> = [...controllers.map((email) => ({ email, to: "controller" as const })), ...(toSender ? [{ email: own, to: "sender" as const }] : [])];
  let sent = 0;
  for (const r of list) {
    const mail = statusMail({ title: env.title, signers: rows, event, from: sender?.name ?? null, to: r.to, sentAt });
    const ok = await sendEmail({ kind: "status_update", to: r.email, name: r.to === "sender" ? (sender?.name ?? "") : r.email.split("@")[0], subject: mail.subject, html: mail.html, text: mail.text, link: "" }).catch(() => false);
    if (ok) sent++;
  }
  if (sent < list.length) console.error(`[sign] status update: ${list.length - sent} of ${list.length} email(s) not sent`);
  return sent;
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
  /* 0304: everyone whose turn it is (several when they sign at the same time) */
  const everyone = await store.signers(envelopeId);
  const ord = await orderOf(store, envelopeId, everyone.length);
  const now = everyone.filter((s) => s.status === "invited" && !needless(ord, s, everyone));
  if (!now.length) throw new SignError("Nobody is waiting to sign.", 409);
  if (now.every(isExpired)) throw new SignError("This request has expired. Cancel it and send it again.", 410);
  const sent: SentLink[] = [];
  for (const s of now.filter((x) => !isExpired(x))) sent.push(await invite(store, [s], [env.title], origin, env.message, who, "reminded"));
  return { ...sent[0]!, name: sent.map((x) => x.name).join(", ") };
}

/**
 * 0304: daily reminders (the sender ticked "Remind daily until signed"): once a day, everyone whose turn it is
 * and who was not emailed in the last 20 hours gets a reminder (a fresh link, like the Remind button). Own
 * requests only. Returns how many people were reminded.
 */
export async function remindDaily(store: SignStore, origin: string): Promise<number> {
  let n = 0;
  for (const id of await store.dailyReminders()) {
    const env = await store.envelope(id);
    if (!env || env.status !== "sent") continue;
    const events = await store.events(id);
    const everyone = await store.signers(id);
    const ord = await orderOf(store, id, everyone.length);
    for (const s of everyone.filter((x) => x.status === "invited" && !isExpired(x) && !needless(ord, x, everyone))) {
      const last = events.filter((e) => e.signer_id === s.id && (e.event === "invited" || e.event === "reminded" || e.event === "link")).pop();
      if (last && Date.now() - Date.parse(last.at) < 20 * 3_600_000) continue;
      await invite(store, [s], [env.title], origin, env.message, { ip: null, ua: "daily reminder" }, "reminded");
      n++;
    }
  }
  return n;
}

/** What a round of Founders Doc reminders did (0250). Counts only: nobody is named. */
export interface OursReminded {
  /** people emailed again (one email covers every document waiting on the same person) */
  people: number;
  documents: number;
  /** of "people": the emails that really left (0 when emails are switched off) */
  emailed: number;
  /** why the others were left alone */
  skipped: { recent: number; early: number; expired: number; closed: number };
}

/**
 * The master dashboard's "Remind" (0250), Founders Doc admins: email the person whose turn it is
 * on Founders Doc's OWN requests again (ESOP certificates and the like).
 *
 * A person's own request is never reminded from here: it is theirs to chase (SQL 119), so one in
 * the list refuses the whole call. Like the sender's own reminder: a fresh link (the old one stops
 * working), the same 30 days, and at most one an hour. Only someone who has waited `minWaitMs`
 * is reminded, so the rule on the page ("more than 2 days") is the server's rule too.
 */
export async function remindOurs(store: SignStore, envelopeIds: string[], origin: string, who: Who, minWaitMs: number): Promise<OursReminded> {
  const out: OursReminded = { people: 0, documents: 0, emailed: 0, skipped: { recent: 0, early: 0, expired: 0, closed: 0 } };
  const ids = [...new Set(envelopeIds)];
  /* check every one first: nothing is sent if any of them is somebody's own */
  const envs = new Map<string, Envelope>();
  for (const id of ids) {
    const env = await store.envelope(id);
    if (!env) throw new SignError("Not found.", 404);
    if (await store.ownerOf(id)) throw new SignError("That request belongs to the person who sent it. Only they can remind their signers.", 403);
    envs.set(id, env);
  }
  const done = new Set<string>();
  for (const id of ids) {
    const env = envs.get(id)!;
    const now = env.status === "sent" ? (await store.signers(id)).find((s) => s.status === "invited") : undefined;
    if (!now) {
      out.skipped.closed++;
      continue;
    }
    if (done.has(now.id)) continue; /* already covered by the email for another of their documents */
    if (isExpired(now)) {
      out.skipped.expired++;
      continue;
    }
    if (!now.invited_at || Date.now() - Date.parse(now.invited_at) < minWaitMs) {
      out.skipped.early++;
      continue;
    }
    const last = (await store.events(id)).filter((e) => e.event === "reminded" && e.signer_id === now.id).pop();
    if (last && Date.now() - Date.parse(last.at) < 3_600_000) {
      out.skipped.recent++;
      continue;
    }
    /* the same person's other documents on the same link go in the same email, when they are ours and still open */
    const rows: Signer[] = [now];
    const titles: string[] = [env.title];
    if (now.token_hash) {
      for (const r of await store.signersByToken(now.token_hash)) {
        if (r.id === now.id || r.status !== "invited" || done.has(r.id)) continue;
        const other = envs.get(r.envelope_id) ?? (await store.envelope(r.envelope_id));
        if (!other || other.status !== "sent" || (await store.ownerOf(r.envelope_id))) continue;
        rows.push(r);
        titles.push(other.title);
      }
    }
    const sent = await invite(store, rows, titles, origin, env.message, who, "reminded");
    for (const r of rows) done.add(r.id);
    out.people++;
    out.documents += rows.length;
    if (sent.emailed) out.emailed++;
  }
  return out;
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
  /* 0309: by steps (signing at the same time), not only by position */
  const o = await orderOf(store, mine.envelope_id, all.length);
  if (all.some((s) => stepOf(o, s) < stepOf(o, me) && s.status !== "signed" && !needless(o, s, all))) throw new SignError("It isn't your turn yet.", 409);
  if (isExpired(me)) throw new SignError("This request has expired. Ask the sender to send it again.", 410);
  const owner = await store.ownerOf(mine.envelope_id);
  if (owner?.owner_id === account.id) return { url: (await invite(store, [me], [mine.title], origin, null, who, "link")).link };
  const last = (await store.events(mine.envelope_id)).filter((e) => e.event === "reminded" && e.signer_id === me.id).pop();
  if (last && Date.now() - Date.parse(last.at) < 600_000) throw new SignError(`We emailed you a signing link a few minutes ago. Please check ${me.email}.`, 429);
  const env = await store.envelope(mine.envelope_id);
  await invite(store, [me], [mine.title], origin, env?.message ?? null, who, "reminded");
  return { emailed: me.email };
}
