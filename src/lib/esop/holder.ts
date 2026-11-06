import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/sign/notify";
import type { EsopBatch, EsopDocument, EsopHolder } from "./vesting";
import { DEMO_BATCHES, DEMO_COMPANY, DEMO_DOCUMENTS, DEMO_HOLDERS } from "@/app/esop/demo";

/**
 * "My share options" (124): each option holder's own, read-only page.
 *
 *   link     a private link by email; only the sha-256 of its key is stored. 90 days.
 *   code     the first time in a browser, a 6-digit code to the holder's own email
 *            (10 minutes, 5 tries, a new one at most every 30 s and 5 an hour)
 *   browser  after the code, a secret cookie; that browser is trusted for 30 days
 *
 * The holder is always found from the link, never from anything typed into the
 * page, so nobody can reach another holder's record. Only while the company has
 * Holder access switched on (123). Without Supabase (local preview) everything is
 * kept in memory and the code is returned, for testing.
 */

export const LINK_DAYS = 90;
export const TRUST_DAYS = 30;
const CODE_MINUTES = 10;
const TRIES = 5;
const RESEND_SECONDS = 30;
const SENDS_PER_HOUR = 5;
const REQUEST_MINUTES = 10;

export const cookieName = (linkId: string) => `fd_mo_${linkId.replace(/-/g, "").slice(0, 12)}`;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const isTokenShape = (t: string) => /^[A-Za-z0-9_-]{40,64}$/.test(t);
export const maskEmail = (email: string) => {
  const [u, d] = email.split("@");
  return `${u.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(u.length - 1, 6)))}@${d ?? ""}`;
};

export class HolderError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface Who {
  ip: string | null;
  ua: string | null;
}

export interface HolderLink {
  id: string;
  company_id: string;
  holder_id: string;
  token_hash: string;
  created_at: string;
  created_by: string | null;
  expires_at: string;
  revoked_at: string | null;
  code_hash: string | null;
  code_expires: string | null;
  code_tries: number;
  code_sent_at: string | null;
  code_sends: number;
  code_window: string | null;
}

export interface HolderCompany {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  share_class: string | null;
  holder_access: boolean;
  email_override: string | null;
}

export interface HolderRecord {
  company: HolderCompany;
  holder: EsopHolder;
  batches: EsopBatch[];
  documents: EsopDocument[];
}

type Event = "link_sent" | "code_sent" | "code_verified" | "code_wrong" | "opened" | "download" | "link_requested";

interface Store {
  kind: "memory" | "supabase";
  linkByHash(hash: string): Promise<HolderLink | null>;
  createLink(l: Omit<HolderLink, "id" | "created_at">): Promise<HolderLink>;
  updateLink(id: string, patch: Partial<HolderLink>): Promise<void>;
  addDevice(linkId: string, secretHash: string): Promise<void>;
  hasDevice(linkId: string, secretHash: string, sinceIso: string): Promise<boolean>;
  log(e: { link_id: string | null; holder_id: string; company_id: string; event: Event; ip: string | null; user_agent: string | null; detail?: string | null }): Promise<void>;
  record(holderId: string): Promise<HolderRecord | null>;
  holdersByEmail(email: string): Promise<string[]>;
  linkSince(holderId: string, sinceIso: string): Promise<boolean>;
  fileUrl(d: EsopDocument): Promise<string | null>;
}

/* ── stores ──────────────────────────────────────────────────────────── */

type Mem = { links: HolderLink[]; devices: Array<{ link_id: string; secret_hash: string; verified_at: string }>; log: unknown[] };
const mem = (): Mem => {
  const g = globalThis as unknown as { __fdMyOptions?: Mem };
  g.__fdMyOptions ??= { links: [], devices: [], log: [] };
  return g.__fdMyOptions;
};

function memoryStore(): Store {
  const company: HolderCompany = { id: DEMO_COMPANY.id, slug: DEMO_COMPANY.slug, name: DEMO_COMPANY.name, logo_url: DEMO_COMPANY.logo_url, share_class: "Class B", holder_access: true, email_override: null };
  return {
    kind: "memory",
    async linkByHash(h) {
      return mem().links.find((l) => l.token_hash === h) ?? null;
    },
    async createLink(l) {
      const row: HolderLink = { ...l, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      mem().links.push(row);
      return row;
    },
    async updateLink(id, patch) {
      const l = mem().links.find((x) => x.id === id);
      if (l) Object.assign(l, patch);
    },
    async addDevice(link_id, secret_hash) {
      mem().devices.push({ link_id, secret_hash, verified_at: new Date().toISOString() });
    },
    async hasDevice(link_id, secret_hash, since) {
      return mem().devices.some((d) => d.link_id === link_id && d.secret_hash === secret_hash && d.verified_at >= since);
    },
    async log(e) {
      mem().log.push({ ...e, at: new Date().toISOString() });
    },
    async record(holderId) {
      const holder = DEMO_HOLDERS.find((h) => h.id === holderId);
      if (!holder) return null;
      return { company, holder, batches: DEMO_BATCHES, documents: DEMO_DOCUMENTS.filter((d) => d.holder_id === holderId) };
    },
    async holdersByEmail(email) {
      return DEMO_HOLDERS.filter((h) => (h.email ?? "").trim().toLowerCase() === email).map((h) => h.id);
    },
    async linkSince(holderId, since) {
      return mem().links.some((l) => l.holder_id === holderId && l.created_at >= since);
    },
    async fileUrl(d) {
      return d.url ?? null;
    },
  };
}

function supabaseStore(): Store {
  const db = supabaseAdmin();
  const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return {
    kind: "supabase",
    async linkByHash(h) {
      return must(await db.from("esop_holder_links").select("*").eq("token_hash", h).maybeSingle()) as HolderLink | null;
    },
    async createLink(l) {
      return must(await db.from("esop_holder_links").insert(l).select("*").single()) as HolderLink;
    },
    async updateLink(id, patch) {
      must(await db.from("esop_holder_links").update(patch).eq("id", id));
    },
    async addDevice(link_id, secret_hash) {
      must(await db.from("esop_holder_devices").insert({ link_id, secret_hash }));
    },
    async hasDevice(link_id, secret_hash, since) {
      const r = must(await db.from("esop_holder_devices").select("link_id").eq("link_id", link_id).eq("secret_hash", secret_hash).gte("verified_at", since).limit(1)) as unknown[];
      return (r ?? []).length > 0;
    },
    async log(e) {
      await db.from("esop_holder_opens").insert({ ...e, detail: e.detail ?? null });
    },
    async record(holderId) {
      const holder = must(await db.from("esop_holders").select("*").eq("id", holderId).maybeSingle()) as EsopHolder & { company_id: string } | null;
      if (!holder) return null;
      const company = must(await db.from("esop_companies").select("id, slug, name, logo_url, share_class, holder_access, email_override").eq("id", holder.company_id).maybeSingle()) as HolderCompany | null;
      if (!company) return null;
      const [b, d] = await Promise.all([
        db.from("esop_batches").select("batch, vesting_start, tranches, note").eq("company_id", company.id).eq("batch", holder.batch),
        db.from("esop_documents").select("*").eq("holder_id", holder.id).order("uploaded_at"),
      ]);
      return { company, holder, batches: (b.data ?? []) as EsopBatch[], documents: (d.data ?? []) as EsopDocument[] };
    },
    async holdersByEmail(email) {
      const hs = must(await db.from("esop_holders").select("id, email, company_id").ilike("email", email)) as Array<{ id: string; email: string | null; company_id: string }>;
      const mine = (hs ?? []).filter((h) => (h.email ?? "").trim().toLowerCase() === email);
      if (!mine.length) return [];
      const cs = must(await db.from("esop_companies").select("id").in("id", [...new Set(mine.map((h) => h.company_id))]).eq("holder_access", true)) as Array<{ id: string }>;
      const on = new Set((cs ?? []).map((c) => c.id));
      return mine.filter((h) => on.has(h.company_id)).map((h) => h.id);
    },
    async linkSince(holderId, since) {
      const r = must(await db.from("esop_holder_links").select("id").eq("holder_id", holderId).gte("created_at", since).limit(1)) as unknown[];
      return (r ?? []).length > 0;
    },
    async fileUrl(d) {
      if (d.url) return d.url;
      if (!d.path) return null;
      const { data } = await db.storage.from("esop-docs").createSignedUrl(d.path, 60);
      return data?.signedUrl ?? null;
    },
  };
}

export function holderStore(): Store | null {
  if (!isSupabaseConfigured()) return memoryStore();
  return isAdminClientConfigured() ? supabaseStore() : null;
}

/* ── emails ──────────────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const plainCompany = (n: string) => n.replace(/\s*\(TEST\)\s*$/i, "");

function frame(heading: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Inter,Arial,sans-serif;color:#161616">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e9e9e9;border-radius:10px">
<tr><td style="background:#0f0f0f;padding:16px 24px;border-radius:10px 10px 0 0"><span style="color:#ffffff;font-size:11px;letter-spacing:3px;text-transform:uppercase">Founders Doc</span></td></tr>
<tr><td style="padding:24px"><div style="font-size:22px;font-weight:600;margin:0 0 10px">${heading}</div>${body}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #f0f0f0;font-size:11px;color:#9a9a9a">This link is private to you. Do not forward it. If you did not expect this email, you can ignore it.</td></tr>
</table></td></tr></table></body></html>`;
}

function linkEmail(company: string, name: string, url: string) {
  const subject = `Your ${company} share options`;
  const html = frame(
    `Your ${esc(company)} share options`,
    `<p style="font-size:14px;line-height:1.6;margin:0 0 16px">Hi ${esc(name)}, you can now see your share options online: what has vested, your next vesting date and your documents.</p>
<p style="margin:0 0 16px"><a href="${esc(url)}" style="display:inline-block;background:#f3bf4b;color:#0f0f0f;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:6px">View my share options</a></p>
<p style="font-size:12px;color:#666;line-height:1.5;margin:0">The first time you open it on a device, we will email you a 6-digit code to confirm it is you. The link works for ${LINK_DAYS} days; you can ask for a new one at foundersdoc.com/my-options.</p>`,
  );
  const text = `Hi ${name}, you can now see your ${company} share options online: ${url}\n\nThe first time you open it on a device, we will email you a 6-digit code. The link works for ${LINK_DAYS} days; ask for a new one at foundersdoc.com/my-options.`;
  return { subject, html, text };
}

function codeEmail(company: string, code: string) {
  const subject = `${code} is your code for your ${company} share options`;
  const html = frame(
    "Your code",
    `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">Type this code on the page to see your ${esc(company)} share options:</p>
<div style="font-size:30px;font-weight:700;letter-spacing:8px;margin:0 0 12px">${esc(code)}</div>
<p style="font-size:12px;color:#666;margin:0">It works for ${CODE_MINUTES} minutes. If you did not ask for it, ignore this email.</p>`,
  );
  return { subject, html, text: `Your code: ${code} (works for ${CODE_MINUTES} minutes).` };
}

/* ── the steps ───────────────────────────────────────────────────────── */

async function linkFor(store: Store, token: string) {
  if (!isTokenShape(token)) throw new HolderError("This link is not valid.", 404);
  const link = await store.linkByHash(sha(token));
  if (!link || link.revoked_at) throw new HolderError("This link is not valid.", 404);
  if (Date.parse(link.expires_at) < Date.now()) throw new HolderError("This link has expired. Ask for a new one below.", 410);
  return link;
}

/** Make a private link for one holder and email it to them (a simulation sends to its own address). */
export async function issueLink(store: Store, holderId: string, origin: string, by: string, who: Who): Promise<{ to: string; devLink?: string }> {
  const rec = await store.record(holderId);
  if (!rec) throw new HolderError("Holder not found.", 404);
  if (!rec.company.holder_access) throw new HolderError("Holder access is off for this company. Switch it on in Settings first.", 409);
  const email = (rec.holder.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HolderError(`${rec.holder.name} has no email address on the dashboard.`, 400);
  const token = randomBytes(32).toString("base64url");
  const link = await store.createLink({
    company_id: rec.company.id,
    holder_id: holderId,
    token_hash: sha(token),
    created_by: by.slice(0, 200),
    expires_at: new Date(Date.now() + LINK_DAYS * 86400_000).toISOString(),
    revoked_at: null,
    code_hash: null,
    code_expires: null,
    code_tries: 0,
    code_sent_at: null,
    code_sends: 0,
    code_window: null,
  });
  const url = `${origin}/my-options/${token}`;
  const to = rec.company.email_override?.trim() || email;
  await store.log({ link_id: link.id, holder_id: holderId, company_id: rec.company.id, event: "link_sent", ip: who.ip, user_agent: who.ua, detail: maskEmail(to) });
  if (store.kind === "memory") return { to: maskEmail(to), devLink: url };
  const mail = linkEmail(plainCompany(rec.company.name), (rec.holder.legal_name?.trim() || rec.holder.name).split(/\s+/)[0], url);
  const ok = await sendEmail({ kind: "esop_holder_link", to, name: rec.holder.name, subject: mail.subject, html: mail.html, text: mail.text, link: url });
  if (!ok) throw new HolderError("The link was made but the email could not be sent. Check SIGN_HOOK_URL.", 502);
  return { to: maskEmail(to) };
}

/** "Send me my link": only to an address already on a holder's row, and the answer is the same either way. */
export async function requestLink(store: Store, emailIn: string, origin: string, who: Who): Promise<{ devLinks?: string[] }> {
  const email = emailIn.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new HolderError("Check the email address.", 400);
  const ids = await store.holdersByEmail(email);
  const since = new Date(Date.now() - REQUEST_MINUTES * 60_000).toISOString();
  const devLinks: string[] = [];
  for (const id of ids.slice(0, 5)) {
    if (await store.linkSince(id, since)) continue; // one link per 10 minutes is plenty
    try {
      const out = await issueLink(store, id, origin, "holder (Send me my link)", who);
      if (out.devLink) devLinks.push(out.devLink);
    } catch (e) {
      console.error("[my-options] request failed:", e);
    }
  }
  return store.kind === "memory" ? { devLinks } : {};
}

export type PageState =
  | { state: "invalid"; message: string }
  | { state: "off"; company: string }
  | { state: "code"; linkId: string; to: string; company: string }
  | { state: "ok"; linkId: string; record: HolderRecord };

/** What the page shows for this link and this browser. */
export async function openPage(store: Store, token: string, readSecret: (linkId: string) => string | undefined, who: Who, log = true): Promise<PageState> {
  let link: HolderLink;
  try {
    link = await linkFor(store, token);
  } catch (e) {
    return { state: "invalid", message: e instanceof HolderError ? e.message : "This link is not valid." };
  }
  const rec = await store.record(link.holder_id);
  if (!rec) return { state: "invalid", message: "This link is not valid." };
  if (!rec.company.holder_access) return { state: "off", company: plainCompany(rec.company.name) };
  const since = new Date(Date.now() - TRUST_DAYS * 86400_000).toISOString();
  const secret = readSecret(link.id);
  const trusted = !!secret && /^[A-Za-z0-9_-]{40,64}$/.test(secret) && (await store.hasDevice(link.id, sha(secret), since));
  if (!trusted) return { state: "code", linkId: link.id, to: maskEmail(rec.company.email_override?.trim() || rec.holder.email || ""), company: plainCompany(rec.company.name) };
  if (log) await store.log({ link_id: link.id, holder_id: link.holder_id, company_id: link.company_id, event: "opened", ip: who.ip, user_agent: who.ua });
  return { state: "ok", linkId: link.id, record: rec };
}

export async function sendHolderCode(store: Store, token: string, who: Who): Promise<{ to: string; devCode?: string }> {
  const link = await linkFor(store, token);
  const rec = await store.record(link.holder_id);
  if (!rec || !rec.company.holder_access) throw new HolderError("This page is not available.", 409);
  const now = Date.now();
  if (link.code_sent_at && now - Date.parse(link.code_sent_at) < RESEND_SECONDS * 1000) throw new HolderError(`Please wait ${RESEND_SECONDS} seconds before asking for another code.`, 429);
  const windowOpen = !!link.code_window && now - Date.parse(link.code_window) < 3600_000;
  const sends = windowOpen ? link.code_sends : 0;
  if (sends >= SENDS_PER_HOUR) throw new HolderError("Too many codes asked for. Please try again in an hour.", 429);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await store.updateLink(link.id, {
    code_hash: sha(`${link.token_hash}:${code}`),
    code_expires: new Date(now + CODE_MINUTES * 60_000).toISOString(),
    code_tries: 0,
    code_sent_at: new Date(now).toISOString(),
    code_sends: sends + 1,
    code_window: windowOpen ? link.code_window : new Date(now).toISOString(),
  });
  const to = rec.company.email_override?.trim() || (rec.holder.email ?? "").trim();
  await store.log({ link_id: link.id, holder_id: link.holder_id, company_id: link.company_id, event: "code_sent", ip: who.ip, user_agent: who.ua, detail: maskEmail(to) });
  if (store.kind === "memory") return { to: maskEmail(to), devCode: code };
  const mail = codeEmail(plainCompany(rec.company.name), code);
  const ok = await sendEmail({ kind: "esop_holder_code", to, name: rec.holder.name, subject: mail.subject, html: mail.html, text: mail.text, link: "" });
  if (!ok) throw new HolderError("We couldn't send the code just now. Please try again in a minute.", 502);
  return { to: maskEmail(to) };
}

/** Check the code; returns the browser secret for the cookie. */
export async function verifyHolderCode(store: Store, token: string, code: string, who: Who): Promise<{ linkId: string; secret: string }> {
  const link = await linkFor(store, token);
  if (!link.code_hash || !link.code_expires) throw new HolderError("Please ask for a code first.", 400);
  if (Date.parse(link.code_expires) < Date.now()) throw new HolderError("That code has expired. Please ask for a new one.", 410);
  if (link.code_tries >= TRIES) throw new HolderError("Too many wrong tries. Please ask for a new code.", 429);
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6 || !same(sha(`${link.token_hash}:${clean}`), link.code_hash)) {
    const tries = link.code_tries + 1;
    await store.updateLink(link.id, { code_tries: tries });
    await store.log({ link_id: link.id, holder_id: link.holder_id, company_id: link.company_id, event: "code_wrong", ip: who.ip, user_agent: who.ua });
    throw new HolderError(tries >= TRIES ? "Too many wrong tries. Please ask for a new code." : `That code isn't right. ${TRIES - tries} ${TRIES - tries === 1 ? "try" : "tries"} left.`, 400);
  }
  const secret = randomBytes(32).toString("base64url");
  await store.updateLink(link.id, { code_hash: null, code_tries: 0 });
  await store.addDevice(link.id, sha(secret));
  await store.log({ link_id: link.id, holder_id: link.holder_id, company_id: link.company_id, event: "code_verified", ip: who.ip, user_agent: who.ua });
  return { linkId: link.id, secret };
}

/** A short-lived address for one of the holder's own files. */
export async function holderFile(store: Store, token: string, readSecret: (linkId: string) => string | undefined, docId: string, who: Who): Promise<string> {
  const page = await openPage(store, token, readSecret, who, false);
  if (page.state !== "ok") throw new HolderError("Please open your page first.", 403);
  const d = page.record.documents.find((x) => x.id === docId && x.holder_id === page.record.holder.id);
  if (!d) throw new HolderError("File not found.", 404);
  const url = await store.fileUrl(d);
  if (!url) throw new HolderError("This file is not available to download yet.", 404);
  await store.log({ link_id: page.linkId, holder_id: page.record.holder.id, company_id: page.record.company.id, event: "download", ip: who.ip, user_agent: who.ua, detail: d.file_name.slice(0, 120) });
  return url;
}
