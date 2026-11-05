import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * FD Sign storage (supabase/112). Two backends behind one interface:
 *   - Supabase, with the secret key (row-level security is on with no
 *     policies, so only the server can touch these tables);
 *   - memory, for the local preview without Supabase (nothing is kept).
 * Documents are small PDFs (certificates), kept as bytea next to their rows.
 */

export type EnvelopeStatus = "sent" | "completed" | "voided";
export type SignerStatus = "waiting" | "invited" | "signed";

export interface Envelope {
  id: string;
  title: string;
  file_name: string;
  original_sha256: string;
  page_count: number | null;
  message: string | null;
  batch_id: string | null;
  status: EnvelopeStatus;
  esop_holder_id: string | null;
  esop_tranche: number | null;
  filed_document_id: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Signer {
  id: string;
  envelope_id: string;
  position: number;
  name: string;
  email: string;
  role: string;
  token_hash: string | null;
  status: SignerStatus;
  invited_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signature_kind: "draw" | "type" | null;
  typed_name: string | null;
  ip: string | null;
  user_agent: string | null;
}

/** The email code for one signing link (SQL 114). */
export interface SignCode {
  token_hash: string;
  code_hash: string | null;
  expires_at: string | null;
  tries: number;
  sent_at: string | null;
  sends: number;
  window_start: string | null;
  session_hash: string | null;
  verified_at: string | null;
}

export interface SignEvent {
  id?: number;
  envelope_id: string;
  signer_id: string | null;
  event: string;
  at: string;
  ip: string | null;
  user_agent: string | null;
  detail: string | null;
}

/** A box on the page (113): fractions of the page from the top-left. */
export interface SignField {
  /** set once stored (sign_fields.id); boxes placed automatically have none */
  id?: string;
  position: number; // which signer
  /** initials / text / checkbox: SQL 120 */
  kind: "signature" | "date" | "name" | "initials" | "text" | "checkbox";
  page: number; // 1-based
  x: number;
  y: number;
  w: number;
  h: number;
  /** text / checkbox: what the box asks for (SQL 120) */
  label?: string | null;
  required?: boolean;
  /** what the signer typed or ticked ("yes" / "") when they signed */
  value?: string | null;
}

/** New field kinds that need SQL 120. */
export const NEW_FIELD_KINDS = new Set(["initials", "text", "checkbox"]);

export interface NewEnvelope {
  title: string;
  file_name: string;
  original: Uint8Array;
  original_sha256: string;
  page_count: number;
  message: string | null;
  batch_id: string | null;
  esop_holder_id: string | null;
  esop_tranche: number | null;
  created_by: string | null;
  /** FD Sign for everyone (SQL 119): the FD AI account that sent it. Never set for ESOP / Founders Doc requests. */
  owner_id?: string;
  owner_email?: string;
  owner_name?: string;
  folder_id?: string | null;
}

/** Who sent a request (SQL 119). Null for Founders Doc / ESOP requests. owner_id is null if that account was deleted later. */
export interface EnvelopeOwner {
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  folder_id: string | null;
}

export interface SignFolder {
  id: string;
  name: string;
  colour: string;
  created_at: string;
}

/** A request in someone's "My documents". */
export type OwnedEnvelope = Envelope & { folder_id: string | null; signers: Signer[] };

/** Someone else's request that is now waiting for this person to sign. */
export interface WaitingForMe {
  signer_id: string;
  envelope_id: string;
  title: string;
  from_name: string | null;
  from_email: string | null;
  invited_at: string | null;
  page_count: number | null;
}

export interface SignStore {
  kind: "supabase" | "memory";
  insertEnvelope(e: NewEnvelope): Promise<string>;
  insertSigner(s: Pick<Signer, "envelope_id" | "position" | "name" | "email" | "role">): Promise<string>;
  updateSigner(id: string, patch: Partial<Signer> & { signature_png?: Uint8Array | null }): Promise<void>;
  updateEnvelope(id: string, patch: Partial<Envelope>): Promise<void>;
  signersByToken(hash: string): Promise<Signer[]>;
  signers(envelopeId: string): Promise<Signer[]>;
  signaturePng(signerId: string): Promise<Uint8Array | null>;
  envelope(id: string): Promise<Envelope | null>;
  original(id: string): Promise<Uint8Array | null>;
  addEvent(e: Omit<SignEvent, "id" | "at"> & { at?: string }): Promise<void>;
  events(envelopeId: string): Promise<SignEvent[]>;
  recent(limit: number): Promise<Array<Envelope & { signers: Signer[] }>>;
  /** Put the signed PDF on the ESOP holder's row (Option certificates). Returns the document id. */
  fileToEsop(holderId: string, tranche: number | null, pdf: Uint8Array, fileName: string): Promise<string | null>;
  esopHolders(): Promise<Array<{ id: string; name: string; email: string | null; batch: number; status: string }>>;
  esopDirector(): Promise<string | null>;
  insertFields(envelopeId: string, fields: SignField[]): Promise<void>;
  fields(envelopeId: string): Promise<SignField[]>;
  /** Is public.sign_fields there (SQL 113 run)? */
  boxesReady(): Promise<boolean>;
  /** Is SQL 120 run (initials, text, checkbox, labels, values)? */
  fieldsV2Ready(): Promise<boolean>;
  /** Save what a signer typed or ticked in their text / checkbox boxes. */
  setFieldValues(envelopeId: string, rows: Array<{ id: string; value: string }>): Promise<void>;
  getCode(tokenHash: string): Promise<SignCode | null>;
  putCode(row: SignCode): Promise<void>;
  /** Is public.sign_codes there (SQL 114 run)? */
  codesReady(): Promise<boolean>;
  /** CC: people who get the signed copy (SQL 115). */
  addViewers(envelopeId: string, emails: string[]): Promise<void>;
  viewers(envelopeId: string): Promise<Array<{ id: string; email: string; sent_at: string | null }>>;
  setViewerToken(id: string, tokenHash: string): Promise<void>;
  viewerEnvelopes(tokenHash: string): Promise<string[]>;
  viewersReady(): Promise<boolean>;
  /* ── FD Sign for everyone (SQL 119). None of these touch ESOP rows (owner_id is null on those). ── */
  /** Is SQL 119 run? */
  ownersReady(): Promise<boolean>;
  ownerOf(envelopeId: string): Promise<EnvelopeOwner | null>;
  mine(ownerId: string, limit: number): Promise<OwnedEnvelope[]>;
  waitingFor(email: string): Promise<WaitingForMe[]>;
  sentSince(ownerId: string, sinceIso: string): Promise<number>;
  folders(ownerId: string): Promise<SignFolder[]>;
  addFolder(ownerId: string, name: string, colour: string): Promise<string>;
  deleteFolder(ownerId: string, folderId: string): Promise<void>;
  setFolder(ownerId: string, envelopeId: string, folderId: string | null): Promise<void>;
}

const ENV_COLS = "id, title, file_name, original_sha256, page_count, message, batch_id, status, esop_holder_id, esop_tranche, filed_document_id, created_by, created_at, completed_at";
const SIGNER_COLS = "id, envelope_id, position, name, email, role, token_hash, status, invited_at, viewed_at, signed_at, signature_kind, typed_name, ip, user_agent";

const toHex = (b: Uint8Array) => "\\x" + Buffer.from(b).toString("hex");
function fromHex(v: unknown): Uint8Array | null {
  if (typeof v !== "string" || !v) return null;
  if (v.startsWith("\\x")) return new Uint8Array(Buffer.from(v.slice(2), "hex"));
  return new Uint8Array(Buffer.from(v, "base64"));
}

function supabaseStore(): SignStore {
  const db = supabaseAdmin();
  const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return {
    kind: "supabase",
    async insertEnvelope(e) {
      const row = must(await db.from("sign_envelopes").insert({ ...e, original: toHex(e.original) }).select("id").single());
      return (row as { id: string }).id;
    },
    async insertSigner(s) {
      const row = must(await db.from("sign_signers").insert(s).select("id").single());
      return (row as { id: string }).id;
    },
    async updateSigner(id, patch) {
      const { signature_png, ...rest } = patch;
      const p: Record<string, unknown> = { ...rest };
      if (signature_png !== undefined) p.signature_png = signature_png ? toHex(signature_png) : null;
      must(await db.from("sign_signers").update(p).eq("id", id));
    },
    async updateEnvelope(id, patch) {
      must(await db.from("sign_envelopes").update(patch).eq("id", id));
    },
    async signersByToken(hash) {
      return (must(await db.from("sign_signers").select(SIGNER_COLS).eq("token_hash", hash)) ?? []) as Signer[];
    },
    async signers(envelopeId) {
      return (must(await db.from("sign_signers").select(SIGNER_COLS).eq("envelope_id", envelopeId).order("position")) ?? []) as Signer[];
    },
    async signaturePng(signerId) {
      const r = must(await db.from("sign_signers").select("signature_png").eq("id", signerId).maybeSingle());
      return fromHex((r as { signature_png?: unknown } | null)?.signature_png);
    },
    async envelope(id) {
      return (must(await db.from("sign_envelopes").select(ENV_COLS).eq("id", id).maybeSingle()) ?? null) as Envelope | null;
    },
    async original(id) {
      const r = must(await db.from("sign_envelopes").select("original").eq("id", id).maybeSingle());
      return fromHex((r as { original?: unknown } | null)?.original);
    },
    async addEvent(e) {
      must(await db.from("sign_events").insert(e));
    },
    async events(envelopeId) {
      return (must(await db.from("sign_events").select("*").eq("envelope_id", envelopeId).order("at").order("id")) ?? []) as SignEvent[];
    },
    async recent(limit) {
      /* the admin list shows Founders Doc requests only, never people's own (SQL 119); before 119 every row is Founders Doc's */
      let r = await db.from("sign_envelopes").select(ENV_COLS).is("owner_email", null).order("created_at", { ascending: false }).limit(limit);
      if (r.error && /owner_email/.test(r.error.message)) r = await db.from("sign_envelopes").select(ENV_COLS).order("created_at", { ascending: false }).limit(limit);
      const envs = (must(r) ?? []) as Envelope[];
      if (!envs.length) return [];
      const sig = (must(await db.from("sign_signers").select(SIGNER_COLS).in("envelope_id", envs.map((e) => e.id)).order("position")) ?? []) as Signer[];
      return envs.map((e) => ({ ...e, signers: sig.filter((s) => s.envelope_id === e.id) }));
    },
    async fileToEsop(holderId, tranche, pdf, fileName) {
      const h = must(await db.from("esop_holders").select("id, company_id").eq("id", holderId).maybeSingle()) as { id: string; company_id: string } | null;
      if (!h) return null;
      const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${h.company_id}/${h.id}/certificate-signed-${Date.now().toString(36)}-${safe}`;
      const up = await db.storage.from("esop-docs").upload(path, pdf, { contentType: "application/pdf", upsert: false });
      if (up.error) throw new Error(up.error.message);
      const row = must(
        await db
          .from("esop_documents")
          .insert({ company_id: h.company_id, holder_id: h.id, kind: "certificate", tranche, path, file_name: fileName.slice(0, 200), size_bytes: pdf.byteLength, uploaded_by: "FD Sign" })
          .select("id")
          .single(),
      );
      return (row as { id: string }).id;
    },
    async esopHolders() {
      const c = must(await db.from("esop_companies").select("id, email_override").eq("slug", "hitpay").maybeSingle()) as { id: string; email_override: string | null } | null;
      if (!c) return [];
      const rows = (must(await db.from("esop_holders").select("id, name, email, batch, status").eq("company_id", c.id).order("batch").order("name")) ?? []) as Array<{
        id: string;
        name: string;
        email: string | null;
        batch: number;
        status: string;
      }>;
      /* simulation: never hand a real holder's address to the send form */
      const sim = c.email_override?.trim() || null;
      return sim ? rows.map((r) => ({ ...r, email: sim })) : rows;
    },
    async insertFields(envelopeId, fields) {
      if (!fields.length) return;
      must(await db.from("sign_fields").insert(fields.map((f) => ({ ...f, envelope_id: envelopeId }))));
    },
    async fields(envelopeId) {
      let r: { data: unknown[] | null; error: { message: string } | null } = await db
        .from("sign_fields")
        .select("id, position, kind, page, x, y, w, h, label, required, value")
        .eq("envelope_id", envelopeId)
        .order("page");
      /* before SQL 120 the label / required / value columns aren't there: read the 113 columns exactly as before */
      if (r.error && /label|required|value/.test(r.error.message)) r = await db.from("sign_fields").select("id, position, kind, page, x, y, w, h").eq("envelope_id", envelopeId).order("page");
      if (r.error) {
        if (/sign_fields/.test(r.error.message)) return []; // 113 not run yet
        throw new Error(r.error.message);
      }
      return (r.data ?? []) as SignField[];
    },
    async boxesReady() {
      const r = await db.from("sign_fields").select("id").limit(1);
      return !r.error;
    },
    async fieldsV2Ready() {
      const r = await db.from("sign_fields").select("label, required, value").limit(1);
      return !r.error;
    },
    async setFieldValues(envelopeId, rows) {
      for (const row of rows) must(await db.from("sign_fields").update({ value: row.value }).eq("envelope_id", envelopeId).eq("id", row.id));
    },
    async getCode(tokenHash) {
      return (must(await db.from("sign_codes").select("*").eq("token_hash", tokenHash).maybeSingle()) as SignCode | null) ?? null;
    },
    async putCode(row) {
      must(await db.from("sign_codes").upsert(row, { onConflict: "token_hash" }));
    },
    async codesReady() {
      const r = await db.from("sign_codes").select("token_hash").limit(1);
      return !r.error;
    },
    async addViewers(envelopeId, emails) {
      if (!emails.length) return;
      must(await db.from("sign_viewers").upsert(emails.map((email) => ({ envelope_id: envelopeId, email })), { onConflict: "envelope_id,email", ignoreDuplicates: true }));
    },
    async viewers(envelopeId) {
      const r = await db.from("sign_viewers").select("id, email, sent_at").eq("envelope_id", envelopeId);
      if (r.error) {
        if (/sign_viewers/.test(r.error.message)) return []; // 115 not run yet
        throw new Error(r.error.message);
      }
      return (r.data ?? []) as Array<{ id: string; email: string; sent_at: string | null }>;
    },
    async setViewerToken(id, tokenHash) {
      must(await db.from("sign_viewers").update({ token_hash: tokenHash, sent_at: new Date().toISOString() }).eq("id", id));
    },
    async viewerEnvelopes(tokenHash) {
      const r = await db.from("sign_viewers").select("envelope_id").eq("token_hash", tokenHash);
      if (r.error) return [];
      return (r.data ?? []).map((x) => (x as { envelope_id: string }).envelope_id);
    },
    async viewersReady() {
      const r = await db.from("sign_viewers").select("id").limit(1);
      return !r.error;
    },
    async esopDirector() {
      const c = must(await db.from("esop_companies").select("director_name").eq("slug", "hitpay").maybeSingle()) as { director_name?: string | null } | null;
      return c?.director_name ?? null;
    },
    async ownersReady() {
      const a = await db.from("sign_envelopes").select("owner_id").limit(1);
      const b = await db.from("sign_folders").select("id").limit(1);
      return !a.error && !b.error;
    },
    async ownerOf(envelopeId) {
      const r = await db.from("sign_envelopes").select("owner_id, owner_email, owner_name, folder_id").eq("id", envelopeId).maybeSingle();
      if (r.error || !r.data) return null; // 119 not run yet = a Founders Doc request
      const o = r.data as EnvelopeOwner;
      /* owner_email is set on every own request and stays if the account is deleted */
      return o.owner_email ? o : null;
    },
    async mine(ownerId, limit) {
      const envs = (must(await db.from("sign_envelopes").select(`${ENV_COLS}, folder_id`).eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(limit)) ?? []) as Array<Envelope & { folder_id: string | null }>;
      if (!envs.length) return [];
      const sig = (must(await db.from("sign_signers").select(SIGNER_COLS).in("envelope_id", envs.map((e) => e.id)).order("position")) ?? []) as Signer[];
      return envs.map((e) => ({ ...e, signers: sig.filter((s) => s.envelope_id === e.id) }));
    },
    async waitingFor(email) {
      const rows = (must(await db.from("sign_signers").select("id, envelope_id, position, invited_at").eq("email", email.toLowerCase()).eq("status", "invited").limit(100)) ?? []) as Array<{
        id: string;
        envelope_id: string;
        position: number;
        invited_at: string | null;
      }>;
      if (!rows.length) return [];
      /* own requests only (owner set): ESOP certificates never show here */
      const envs = (must(await db.from("sign_envelopes").select("id, title, status, page_count, owner_id, owner_name, owner_email").in("id", [...new Set(rows.map((r) => r.envelope_id))]).not("owner_email", "is", null).eq("status", "sent")) ?? []) as Array<{
        id: string;
        title: string;
        page_count: number | null;
        owner_name: string | null;
        owner_email: string | null;
      }>;
      return rows
        .filter((r) => envs.some((e) => e.id === r.envelope_id))
        .map((r) => {
          const e = envs.find((x) => x.id === r.envelope_id)!;
          return { signer_id: r.id, envelope_id: e.id, title: e.title, from_name: e.owner_name, from_email: e.owner_email, invited_at: r.invited_at, page_count: e.page_count };
        });
    },
    async sentSince(ownerId, sinceIso) {
      const r = await db.from("sign_envelopes").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).gte("created_at", sinceIso);
      if (r.error) throw new Error(r.error.message);
      return r.count ?? 0;
    },
    async folders(ownerId) {
      return (must(await db.from("sign_folders").select("id, name, colour, created_at").eq("owner_id", ownerId).order("name")) ?? []) as SignFolder[];
    },
    async addFolder(ownerId, name, colour) {
      const r = await db.from("sign_folders").insert({ owner_id: ownerId, name, colour }).select("id").single();
      if (r.error) throw new Error(/duplicate|unique/i.test(r.error.message) ? "duplicate folder" : r.error.message);
      return (r.data as { id: string }).id;
    },
    async deleteFolder(ownerId, folderId) {
      must(await db.from("sign_folders").delete().eq("owner_id", ownerId).eq("id", folderId));
    },
    async setFolder(ownerId, envelopeId, folderId) {
      if (folderId) {
        const f = must(await db.from("sign_folders").select("id").eq("owner_id", ownerId).eq("id", folderId).maybeSingle());
        if (!f) throw new Error("no folder");
      }
      must(await db.from("sign_envelopes").update({ folder_id: folderId }).eq("owner_id", ownerId).eq("id", envelopeId));
    },
  };
}

/* ── memory (local preview only) ─────────────────────────────────────────── */

interface Mem {
  fld: Map<string, SignField[]>;
  codes: Map<string, SignCode>;
  view: Array<{ id: string; envelope_id: string; email: string; token_hash: string | null; sent_at: string | null }>;
  env: Map<string, Envelope & { original: Uint8Array; owner_id?: string; owner_email?: string; owner_name?: string; folder_id?: string | null }>;
  folders: Array<SignFolder & { owner_id: string }>;
  sig: Map<string, Signer & { png: Uint8Array | null }>;
  ev: SignEvent[];
}
const g = globalThis as unknown as { __fdsign?: Mem };

function memoryStore(): SignStore {
  const m: Mem = (g.__fdsign ??= { fld: new Map(), codes: new Map(), view: [], env: new Map(), sig: new Map(), ev: [] as SignEvent[], folders: [] });
  m.codes ??= new Map();
  m.view ??= [];
  m.folders ??= [];
  const now = () => new Date().toISOString();
  const strip = <T extends object>(o: T, k: string) => {
    const c = { ...o } as Record<string, unknown>;
    delete c[k];
    return c as unknown;
  };
  return {
    kind: "memory",
    async insertEnvelope(e) {
      const id = crypto.randomUUID();
      m.env.set(id, { ...e, id, status: "sent", filed_document_id: null, created_at: now(), completed_at: null });
      return id;
    },
    async insertSigner(s) {
      const id = crypto.randomUUID();
      m.sig.set(id, {
        ...s,
        id,
        token_hash: null,
        status: "waiting",
        invited_at: null,
        viewed_at: null,
        signed_at: null,
        signature_kind: null,
        typed_name: null,
        ip: null,
        user_agent: null,
        png: null,
      });
      return id;
    },
    async updateSigner(id, patch) {
      const s = m.sig.get(id);
      if (!s) return;
      const { signature_png, ...rest } = patch;
      Object.assign(s, rest);
      if (signature_png !== undefined) s.png = signature_png;
    },
    async updateEnvelope(id, patch) {
      const e = m.env.get(id);
      if (e) Object.assign(e, patch);
    },
    async signersByToken(hash) {
      return [...m.sig.values()].filter((s) => s.token_hash === hash).map((s) => strip(s, "png") as Signer);
    },
    async signers(envelopeId) {
      return [...m.sig.values()]
        .filter((s) => s.envelope_id === envelopeId)
        .sort((a, b) => a.position - b.position)
        .map((s) => strip(s, "png") as Signer);
    },
    async signaturePng(id) {
      return m.sig.get(id)?.png ?? null;
    },
    async envelope(id) {
      const e = m.env.get(id);
      if (!e) return null;
      /* same columns as Supabase's ENV_COLS: owner fields come from ownerOf() */
      const rest: Record<string, unknown> = { ...e };
      for (const k of ["original", "owner_id", "owner_email", "owner_name", "folder_id"]) delete rest[k];
      return rest as unknown as Envelope;
    },
    async original(id) {
      return m.env.get(id)?.original ?? null;
    },
    async addEvent(e) {
      m.ev.push({ ...e, id: m.ev.length + 1, at: e.at ?? now() });
    },
    async events(envelopeId) {
      return m.ev.filter((e) => e.envelope_id === envelopeId);
    },
    async recent(limit) {
      const envs = [...m.env.values()].filter((e) => !e.owner_id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
      return Promise.all(envs.map(async (e) => ({ ...(strip(e, "original") as Envelope), signers: await this.signers(e.id) })));
    },
    async fileToEsop() {
      return null;
    },
    async esopHolders() {
      return [
        { id: "00000000-0000-0000-0000-000000000001", name: "Test Holder A", email: "holder.a@example.com", batch: 99, status: "Active" },
        { id: "00000000-0000-0000-0000-000000000003", name: "Holder 1", email: "holder1@example.com", batch: 1, status: "Active" },
      ];
    },
    async esopDirector() {
      return "Aditya Haripurkar";
    },
    async insertFields(envelopeId, fields) {
      m.fld.set(envelopeId, [...(m.fld.get(envelopeId) ?? []), ...fields.map((f) => ({ ...f, id: crypto.randomUUID(), required: f.required ?? true, value: null }))]);
    },
    async fields(envelopeId) {
      return (m.fld.get(envelopeId) ?? []).map((f) => ({ ...f }));
    },
    async boxesReady() {
      return true;
    },
    async fieldsV2Ready() {
      return true;
    },
    async setFieldValues(envelopeId, rows) {
      for (const f of m.fld.get(envelopeId) ?? []) {
        const r = rows.find((x) => x.id === f.id);
        if (r) f.value = r.value;
      }
    },
    async getCode(tokenHash) {
      return m.codes.get(tokenHash) ?? null;
    },
    async putCode(row) {
      m.codes.set(row.token_hash, { ...row });
    },
    async codesReady() {
      return true;
    },
    async addViewers(envelopeId, emails) {
      for (const email of emails) if (!m.view.some((v) => v.envelope_id === envelopeId && v.email === email)) m.view.push({ id: crypto.randomUUID(), envelope_id: envelopeId, email, token_hash: null, sent_at: null });
    },
    async viewers(envelopeId) {
      return m.view.filter((v) => v.envelope_id === envelopeId).map(({ id, email, sent_at }) => ({ id, email, sent_at }));
    },
    async setViewerToken(id, tokenHash) {
      const v = m.view.find((x) => x.id === id);
      if (v) Object.assign(v, { token_hash: tokenHash, sent_at: new Date().toISOString() });
    },
    async viewerEnvelopes(tokenHash) {
      return m.view.filter((v) => v.token_hash === tokenHash).map((v) => v.envelope_id);
    },
    async viewersReady() {
      return true;
    },
    async ownersReady() {
      return true;
    },
    async ownerOf(id) {
      const e = m.env.get(id);
      return e?.owner_id ? { owner_id: e.owner_id, owner_email: e.owner_email ?? null, owner_name: e.owner_name ?? null, folder_id: e.folder_id ?? null } : null;
    },
    async mine(ownerId, limit) {
      const envs = [...m.env.values()].filter((e) => e.owner_id === ownerId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
      return Promise.all(envs.map(async (e) => ({ ...((await this.envelope(e.id)) as Envelope), folder_id: e.folder_id ?? null, signers: await this.signers(e.id) })));
    },
    async waitingFor(email) {
      const out: WaitingForMe[] = [];
      for (const s of m.sig.values()) {
        const e = m.env.get(s.envelope_id);
        if (s.email !== email.toLowerCase() || s.status !== "invited" || !e?.owner_id || e.status !== "sent") continue;
        out.push({ signer_id: s.id, envelope_id: e.id, title: e.title, from_name: e.owner_name ?? null, from_email: e.owner_email ?? null, invited_at: s.invited_at, page_count: e.page_count });
      }
      return out;
    },
    async sentSince(ownerId, sinceIso) {
      return [...m.env.values()].filter((e) => e.owner_id === ownerId && e.created_at >= sinceIso).length;
    },
    async folders(ownerId) {
      return m.folders
        .filter((f) => f.owner_id === ownerId)
        .map((f) => ({ id: f.id, name: f.name, colour: f.colour, created_at: f.created_at }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async addFolder(ownerId, name, colour) {
      if (m.folders.some((f) => f.owner_id === ownerId && f.name.trim().toLowerCase() === name.trim().toLowerCase())) throw new Error("duplicate folder");
      const id = crypto.randomUUID();
      m.folders.push({ id, owner_id: ownerId, name, colour, created_at: now() });
      return id;
    },
    async deleteFolder(ownerId, folderId) {
      m.folders = m.folders.filter((f) => !(f.owner_id === ownerId && f.id === folderId));
      for (const e of m.env.values()) if (e.owner_id === ownerId && e.folder_id === folderId) e.folder_id = null;
    },
    async setFolder(ownerId, envelopeId, folderId) {
      if (folderId && !m.folders.some((f) => f.owner_id === ownerId && f.id === folderId)) throw new Error("no folder");
      const e = m.env.get(envelopeId);
      if (e?.owner_id === ownerId) e.folder_id = folderId;
    },
  };
}

export type StoreProblem = "no-secret-key";

/** The store for this deployment, or why there is none. */
export function signStore(): SignStore | StoreProblem {
  if (!isSupabaseConfigured()) return memoryStore();
  if (!isAdminClientConfigured()) return "no-secret-key";
  return supabaseStore();
}
