import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Small signing and sealing helpers for OnPoint's mailbox connection (0270). Pure, so they can be tested.
 * The secret is ONPOINT_TOKEN_KEY (32+ random characters, set once on Vercel); separate keys are derived
 * for signing links and for encrypting the Microsoft token, so one can never be mistaken for the other.
 */

const b64u = (b: Buffer) => b.toString("base64url");
const derive = (secret: string, use: string) => createHash("sha256").update(`onpoint:${use}:${secret}`).digest();

export function okSecret(secret: string | undefined | null): secret is string {
  return typeof secret === "string" && secret.trim().length >= 32;
}

/** "payload.signature": the payload is readable JSON, the signature stops anyone changing it */
export function sign(payload: Record<string, unknown>, secret: string): string {
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = b64u(createHmac("sha256", derive(secret, "sign")).update(body).digest());
  return `${body}.${sig}`;
}

export function verify<T extends Record<string, unknown>>(token: string | null | undefined, secret: string, now = Date.now()): T | null {
  if (!token || token.length > 4000) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = createHmac("sha256", derive(secret, "sign")).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { x?: number };
    if (typeof p.x === "number" && p.x < now) return null;
    return p;
  } catch {
    return null;
  }
}

/** AES-256-GCM: "v1.iv.tag.ciphertext" */
export function seal(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", derive(secret, "seal"), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", b64u(iv), b64u(c.getAuthTag()), b64u(enc)].join(".");
}

export function unseal(sealed: string, secret: string): string | null {
  const [v, iv, tag, enc] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !enc) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", derive(secret, "seal"), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** the Microsoft account must be the one the link was made for */
export function sameMailbox(expected: string, got: Array<string | null | undefined>): boolean {
  const e = expected.trim().toLowerCase();
  return !!e && got.some((g) => (g ?? "").trim().toLowerCase() === e);
}
