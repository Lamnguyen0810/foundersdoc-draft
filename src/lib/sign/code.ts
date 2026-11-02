import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hashToken, isTokenShape, SignError, type Who } from "./service";
import { isHookConfigured, notify } from "./notify";
import type { SignCode, SignStore } from "./store";

/**
 * Email code before signing (SQL 114). The signer asks for a 6-digit code,
 * it is emailed (same Zap as the invites), they type it in. The browser that
 * confirmed it gets a secret cookie; the signature is only accepted from that
 * browser, within 30 minutes. Only fingerprints are stored.
 *   - a code lasts 10 minutes and allows 5 tries; it can be used once
 *   - a new code at most every 30 seconds, 5 an hour
 */

export const CODE_COOKIE = "fd_sign_s";
const CODE_MINUTES = 10;
const TRIES = 5;
const RESEND_SECONDS = 30;
const SENDS_PER_HOUR = 5;
export const VERIFIED_MINUTES = 30;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const codeHash = (tokenHash: string, code: string) => sha(`${tokenHash}:${code}`);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Codes are needed whenever emails can deliver them (or in the local preview when switched on for testing). */
export function codeRequired(store: SignStore): boolean {
  if (store.kind === "memory") return process.env.SIGN_CODE_PREVIEW === "1";
  return isHookConfigured();
}

/** j***@gmail.com */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain ?? ""}`;
}

const blank = (tokenHash: string): SignCode => ({
  token_hash: tokenHash,
  code_hash: null,
  expires_at: null,
  tries: 0,
  sent_at: null,
  sends: 0,
  window_start: null,
  session_hash: null,
  verified_at: null,
});

async function rowsFor(store: SignStore, token: string) {
  if (!isTokenShape(token)) throw new SignError("This signing link is not valid.", 404);
  const tokenHash = hashToken(token);
  const rows = await store.signersByToken(tokenHash);
  if (!rows.length) throw new SignError("This signing link is not valid.", 404);
  return { tokenHash, rows };
}

/** Email a new code. In the local preview the code is returned so it can be tested without email. */
export async function sendCode(store: SignStore, token: string, origin: string, who: Who): Promise<{ to: string; devCode?: string }> {
  const { tokenHash, rows } = await rowsFor(store, token);
  const open = [];
  for (const r of rows) if (r.status === "invited" && (await store.envelope(r.envelope_id))?.status === "sent") open.push(r);
  if (!open.length) throw new SignError("There is nothing left to sign on this link.", 409);
  const now = Date.now();
  const row = (await store.getCode(tokenHash)) ?? blank(tokenHash);
  if (row.sent_at && now - Date.parse(row.sent_at) < RESEND_SECONDS * 1000) throw new SignError(`Please wait ${RESEND_SECONDS} seconds before asking for another code.`, 429);
  const windowOpen = row.window_start && now - Date.parse(row.window_start) < 3600_000;
  const sends = windowOpen ? row.sends : 0;
  if (sends >= SENDS_PER_HOUR) throw new SignError("Too many codes asked for. Please try again in an hour, or reply to the email for help.", 429);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await store.putCode({
    ...row,
    code_hash: codeHash(tokenHash, code),
    expires_at: new Date(now + CODE_MINUTES * 60_000).toISOString(),
    tries: 0,
    sent_at: new Date(now).toISOString(),
    sends: sends + 1,
    window_start: windowOpen ? row.window_start : new Date(now).toISOString(),
    session_hash: null,
    verified_at: null,
  });
  const me = open[0];
  const titles: string[] = [];
  for (const r of open) titles.push((await store.envelope(r.envelope_id))?.title ?? "Document");
  for (const r of open) await store.addEvent({ envelope_id: r.envelope_id, signer_id: r.id, event: "code_sent", ip: who.ip, user_agent: who.ua, detail: maskEmail(me.email) });
  if (store.kind === "memory") return { to: maskEmail(me.email), devCode: code };
  const ok = await notify({ kind: "code", to: me.email, name: me.name, role: me.role, link: `${origin}/sign/${token}`, documents: titles, message: null, code });
  if (!ok) throw new SignError("We couldn't send the code just now. Please try again in a minute.", 502);
  return { to: maskEmail(me.email) };
}

/** Check a code. Returns the browser secret to keep in a cookie. */
export async function verifyCode(store: SignStore, token: string, code: string, who: Who): Promise<string> {
  const { tokenHash, rows } = await rowsFor(store, token);
  const row = await store.getCode(tokenHash);
  if (!row?.code_hash || !row.expires_at) throw new SignError("Please ask for a code first.", 400);
  if (Date.parse(row.expires_at) < Date.now()) throw new SignError("That code has expired. Please ask for a new one.", 410);
  if (row.tries >= TRIES) throw new SignError("Too many wrong tries. Please ask for a new code.", 429);
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6 || !same(codeHash(tokenHash, clean), row.code_hash)) {
    const tries = row.tries + 1;
    await store.putCode({ ...row, tries });
    if (tries >= TRIES) for (const r of rows.filter((x) => x.status === "invited")) await store.addEvent({ envelope_id: r.envelope_id, signer_id: r.id, event: "code_locked", ip: who.ip, user_agent: who.ua, detail: `${TRIES} wrong codes` });
    throw new SignError(tries >= TRIES ? "Too many wrong tries. Please ask for a new code." : `That code isn't right. ${TRIES - tries} ${TRIES - tries === 1 ? "try" : "tries"} left.`, 400);
  }
  const secret = randomBytes(32).toString("base64url");
  await store.putCode({ ...row, code_hash: null, tries: 0, session_hash: sha(secret), verified_at: new Date().toISOString() });
  for (const r of rows.filter((x) => x.status === "invited")) await store.addEvent({ envelope_id: r.envelope_id, signer_id: r.id, event: "code_verified", ip: who.ip, user_agent: who.ua, detail: maskEmail(r.email) });
  return secret;
}

/** Has this browser confirmed the code for this link in the last 30 minutes? */
export async function isVerified(store: SignStore, token: string, secret: string | undefined): Promise<boolean> {
  if (!secret || !isTokenShape(token)) return false;
  const row = await store.getCode(hashToken(token)).catch(() => null);
  if (!row?.session_hash || !row.verified_at) return false;
  if (Date.now() - Date.parse(row.verified_at) > VERIFIED_MINUTES * 60_000) return false;
  return same(sha(secret), row.session_hash);
}
