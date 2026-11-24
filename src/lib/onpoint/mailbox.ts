import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { okSecret, seal, sign, unseal, verify } from "./seal";
import { OpError } from "./server";

/**
 * Sending from the client's own Microsoft 365 mailbox (0270), with no Zapier and no shared password.
 *
 * 1. Founders Doc makes a connect link for the expected address (valid 7 days).
 * 2. The client opens it, signs in to Microsoft themselves (password, MFA) and approves "Send mail as you".
 *    Only work / school accounts are accepted (the "organizations" endpoint); a personal Outlook.com
 *    account cannot connect. If the company blocks apps, their admin approves once from the same page.
 * 3. The signed-in account must be the address the link was made for; then the refresh token is kept,
 *    encrypted. Reminders are sent with Microsoft Graph /me/sendMail and appear in the client's Sent items.
 *
 * Vercel settings: ONPOINT_MS_CLIENT_ID, ONPOINT_MS_CLIENT_SECRET (an app registered once in Microsoft Entra,
 * multi-tenant, redirect https://foundersdoc.com/api/onpoint/mail/callback, delegated Mail.Send + User.Read)
 * and ONPOINT_TOKEN_KEY (32+ random characters).
 */

const AUTH = "https://login.microsoftonline.com/organizations";
const SCOPES = "offline_access openid profile email https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read";
const LINK_DAYS = 7;

export interface MsConfig {
  clientId: string;
  clientSecret: string;
  key: string;
}
export function msConfig(): MsConfig | null {
  const clientId = process.env.ONPOINT_MS_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.ONPOINT_MS_CLIENT_SECRET?.trim() ?? "";
  const key = process.env.ONPOINT_TOKEN_KEY?.trim() ?? "";
  return clientId && clientSecret && okSecret(key) ? { clientId, clientSecret, key } : null;
}
const need = (): MsConfig => {
  const c = msConfig();
  if (!c) throw new OpError("Microsoft sending is not set up yet (ONPOINT_MS_CLIENT_ID, ONPOINT_MS_CLIENT_SECRET, ONPOINT_TOKEN_KEY).", 503);
  return c;
};
export const redirectUri = (origin: string) => `${origin}/api/onpoint/mail/callback`;

const db = () => supabaseAdmin();

/* ── links ─────────────────────────────────────────────────────────────── */

export interface LinkPayload extends Record<string, unknown> {
  k: "connect";
  w: string;
  e: string;
  x: number;
}
export function makeConnectLink(wsId: string, email: string, origin: string) {
  const c = need();
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new OpError("Type the email address that will send the reminders.");
  const x = Date.now() + LINK_DAYS * 86_400_000;
  return { url: `${origin}/onpoint/connect?t=${sign({ k: "connect", w: wsId, e, x } satisfies LinkPayload, c.key)}`, expires: new Date(x).toISOString() };
}
export function readLink(t: string | null | undefined): LinkPayload | null {
  const c = msConfig();
  if (!c) return null;
  const p = verify<LinkPayload>(t, c.key);
  return p && p.k === "connect" && typeof p.w === "string" && typeof p.e === "string" ? p : null;
}

/** where the client signs in; state ties the answer to this link and this browser (nonce cookie) */
export function authorizeUrl(t: string, link: LinkPayload, nonce: string, origin: string) {
  const c = need();
  const state = sign({ k: "state", t, n: nonce, x: Date.now() + 20 * 60_000 }, c.key);
  const q = new URLSearchParams({ client_id: c.clientId, response_type: "code", redirect_uri: redirectUri(origin), response_mode: "query", scope: SCOPES, state, prompt: "select_account", login_hint: link.e });
  return `${AUTH}/oauth2/v2.0/authorize?${q}`;
}
/** for a company that blocks apps: its admin approves once for everyone in the company */
export function adminConsentUrl(t: string, nonce: string, origin: string) {
  const c = need();
  const state = sign({ k: "state", t, n: nonce, x: Date.now() + 60 * 60_000, admin: true }, c.key);
  const q = new URLSearchParams({ client_id: c.clientId, scope: "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read", redirect_uri: redirectUri(origin), state });
  return `${AUTH}/v2.0/adminconsent?${q}`;
}
export function readState(state: string | null) {
  const c = msConfig();
  if (!c) return null;
  const p = verify<{ k: string; t: string; n: string; admin?: boolean }>(state, c.key);
  return p && p.k === "state" ? p : null;
}

/* ── tokens ────────────────────────────────────────────────────────────── */

interface TokenAnswer {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
async function tokenCall(body: Record<string, string>): Promise<TokenAnswer> {
  const res = await fetch(`${AUTH}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(15_000) });
  return (await res.json().catch(() => ({ error: `http_${res.status}` }))) as TokenAnswer;
}

/** finish the sign-in: check it is the right mailbox, keep the token (encrypted) */
export async function connect(link: LinkPayload, code: string, origin: string): Promise<{ address: string }> {
  const c = need();
  const tok = await tokenCall({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri(origin), scope: SCOPES });
  if (!tok.access_token || !tok.refresh_token) throw new OpError(`Microsoft did not finish the sign-in (${tok.error ?? "no token"}). Please try again.`, 502);
  const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName", { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(15_000) });
  const who = (await me.json().catch(() => ({}))) as { mail?: string | null; userPrincipalName?: string | null; displayName?: string | null };
  const addrs = [who.mail, who.userPrincipalName].map((a) => (a ?? "").trim().toLowerCase()).filter(Boolean);
  if (!addrs.includes(link.e)) throw new OpError(`This link is for ${link.e}, but you signed in as ${addrs[0] ?? "another account"}. Please sign in with ${link.e}.`, 403);
  const r = await db()
    .from("onpoint_workspaces")
    .update({
      mail_provider: "microsoft",
      mail_address: link.e,
      mail_name: (who.displayName ?? "").slice(0, 160) || null,
      mail_token_enc: seal(tok.refresh_token, c.key),
      mail_connected_at: new Date().toISOString(),
      mail_error: null,
      sender_email: link.e,
      updated_at: new Date().toISOString(),
    })
    .eq("id", link.w);
  if (r.error) throw new OpError(r.error.message, 500);
  cache.delete(link.w);
  return { address: link.e };
}

export async function disconnect(wsId: string) {
  const r = await db().from("onpoint_workspaces").update({ mail_provider: null, mail_token_enc: null, mail_error: null, mail_connected_at: null, updated_at: new Date().toISOString() }).eq("id", wsId);
  if (r.error) throw new OpError(r.error.message, 500);
  cache.delete(wsId);
}

export interface MailboxStatus {
  configured: boolean;
  connected: boolean;
  address: string | null;
  name: string | null;
  connected_at: string | null;
  error: string | null;
}
interface MailRow {
  mail_provider: string | null;
  mail_address: string | null;
  mail_name: string | null;
  mail_token_enc: string | null;
  mail_connected_at: string | null;
  mail_error: string | null;
}
async function row(wsId: string): Promise<MailRow | null> {
  const r = await db().from("onpoint_workspaces").select("mail_provider, mail_address, mail_name, mail_token_enc, mail_connected_at, mail_error").eq("id", wsId).maybeSingle();
  if (r.error) throw new OpError(r.error.message, 500);
  return r.data as MailRow | null;
}
export async function mailboxStatus(wsId: string): Promise<MailboxStatus> {
  const m = await row(wsId);
  return { configured: !!msConfig(), connected: !!(m?.mail_provider && m.mail_token_enc), address: m?.mail_address ?? null, name: m?.mail_name ?? null, connected_at: m?.mail_connected_at ?? null, error: m?.mail_error ?? null };
}

/* ── sending ───────────────────────────────────────────────────────────── */

const cache = new Map<string, { token: string; until: number }>();

async function accessToken(wsId: string): Promise<string> {
  const hit = cache.get(wsId);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  const c = need();
  const m = await row(wsId);
  const refresh = m?.mail_token_enc ? unseal(m.mail_token_enc, c.key) : null;
  if (!refresh) throw new OpError("The mailbox is not connected. Send a new connect link.", 409);
  const tok = await tokenCall({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: refresh, scope: SCOPES });
  if (!tok.access_token) {
    const why = tok.error === "invalid_grant" ? "The mailbox connection has expired or was revoked: send a new connect link." : `Microsoft refused the mailbox (${tok.error ?? "unknown"}).`;
    await db().from("onpoint_workspaces").update({ mail_error: why }).eq("id", wsId);
    throw new OpError(why, 409);
  }
  /* Microsoft may hand back a new refresh token; keep the newest */
  if (tok.refresh_token && tok.refresh_token !== refresh) await db().from("onpoint_workspaces").update({ mail_token_enc: seal(tok.refresh_token, c.key), mail_error: null }).eq("id", wsId);
  cache.set(wsId, { token: tok.access_token, until: Date.now() + (tok.expires_in ?? 3000) * 1000 });
  return tok.access_token;
}

/** true when this workspace sends through a connected mailbox (otherwise the Zapier hook is used) */
export async function usesMailbox(wsId: string): Promise<boolean> {
  if (!msConfig()) return false;
  const m = await row(wsId);
  return !!(m?.mail_provider === "microsoft" && m.mail_token_enc);
}

/** a picture carried inside the email (cid:), so mail apps show it without "Show content" (0272) */
export interface InlineImage {
  cid: string;
  name: string;
  contentType: string;
  base64: string;
}

export async function sendFromMailbox(wsId: string, mail: { to: string; subject: string; html: string; inline?: InlineImage | null }): Promise<{ ok: boolean; error: string | null }> {
  try {
    const token = await accessToken(wsId);
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: mail.subject,
          body: { contentType: "HTML", content: mail.html },
          toRecipients: [{ emailAddress: { address: mail.to } }],
          ...(mail.inline
            ? { attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name: mail.inline.name, contentType: mail.inline.contentType, contentBytes: mail.inline.base64, isInline: true, contentId: mail.inline.cid }] }
            : {}),
        },
        saveToSentItems: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 202) return { ok: true, error: null };
    const j = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    if (res.status === 401) cache.delete(wsId);
    return { ok: false, error: `Microsoft did not send it (${j.error?.code ?? res.status}).` };
  } catch (e) {
    return { ok: false, error: e instanceof OpError ? e.message : "Microsoft could not be reached." };
  }
}
