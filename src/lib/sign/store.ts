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
  position: number; // which signer
  kind: "signature" | "date" | "name";
  page: number; // 1-based
  x: number;
  y: number;
  w: number;
  h: number;
}

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
      const envs = (must(await db.from("sign_envelopes").select(ENV_COLS).order("created_at", { ascending: false }).limit(limit)) ?? []) as Envelope[];
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
      const r = await db.from("sign_fields").select("position, kind, page, x, y, w, h").eq("envelope_id", envelopeId).order("page");
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
  };
}

/* ── memory (local preview only) ─────────────────────────────────────────── */

interface Mem {
  fld: Map<string, SignField[]>;
  codes: Map<string, SignCode>;
  view: Array<{ id: string; envelope_id: string; email: string; token_hash: string | null; sent_at: string | null }>;
  env: Map<string, Envelope & { original: Uint8Array }>;
  sig: Map<string, Signer & { png: Uint8Array | null }>;
  ev: SignEvent[];
}
const g = globalThis as unknown as { __fdsign?: Mem };

function memoryStore(): SignStore {
  const m: Mem = (g.__fdsign ??= { fld: new Map(), codes: new Map(), view: [], env: new Map(), sig: new Map(), ev: [] as SignEvent[] });
  m.codes ??= new Map();
  m.view ??= [];
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
      return e ? (strip(e, "original") as Envelope) : null;
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
      const envs = [...m.env.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
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
      m.fld.set(envelopeId, [...(m.fld.get(envelopeId) ?? []), ...fields]);
    },
    async fields(envelopeId) {
      return m.fld.get(envelopeId) ?? [];
    },
    async boxesReady() {
      return true;
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
  };
}

export type StoreProblem = "no-secret-key";

/** The store for this deployment, or why there is none. */
export function signStore(): SignStore | StoreProblem {
  if (!isSupabaseConfigured()) return memoryStore();
  if (!isAdminClientConfigured()) return "no-secret-key";
  return supabaseStore();
}
