import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Google sign-in, done by this server rather than by Supabase.
 *
 * ── WHY NOT signInWithOAuth ─────────────────────────────────────────────────
 * Supabase's own Google flow sends the browser to Google with a redirect URI
 * on *.supabase.co. Google then shows "Sign in to oxax….supabase.co" on its
 * consent screen, and will not show "Founders Doc" instead until the app is
 * verified — which it refuses to do for a redirect domain the firm does not
 * own. Supabase's answer to that is a paid custom domain.
 *
 * So the handshake with Google happens here, on foundersdoc.com, and only
 * the RESULT — Google's signed ID token — is handed to Supabase, which
 * creates or loads the account exactly as it always did. Every user, session
 * and row stays in Supabase; Google's screen names our domain; verification
 * is free.
 *
 * ── WHAT THIS FILE HOLDS ────────────────────────────────────────────────────
 * The pieces both routes share: the cookie that carries state across the
 * round trip, the URL to send people to, the exchange of a code for tokens,
 * and a reading of the ID token's claims. It never touches Supabase; the
 * callback route does that.
 *
 * ── ON TRUSTING THE ID TOKEN ────────────────────────────────────────────────
 * The token is read here WITHOUT checking its signature, and that is
 * deliberate: it arrives straight from Google's token endpoint over TLS in a
 * server-to-server call authenticated with our client secret, which is the
 * one case where OpenID Connect says signature validation may be skipped
 * (Core 3.1.3.7, note 6). What IS checked is that the audience is our client
 * and the nonce is the one this browser was sent out with. Supabase then
 * verifies the signature itself before it will sign anybody in — so a token
 * that somehow lied here would still open no account.
 */

export const COOKIE = "fdai_google";
/* Long enough for Google's "choose an account" screen and a slow network;
   short enough that a stale cookie describes nothing. */
export const COOKIE_SECONDS = 10 * 60;

export type Intent = "sign-in" | "sign-up";

export interface Handshake {
  state: string;
  /** The RAW nonce. Google is given its SHA-256; Supabase is given this. */
  nonce: string;
  intent: Intent;
  next: string;
}

export interface GoogleClaims {
  iss: string;
  aud: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  nonce?: string;
  exp: number;
}

export function isGoogleConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

export function clientId(): string {
  return process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
}

function clientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
}

export function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

/** What Google is told as the nonce: the hash, never the raw value. */
export function hashNonce(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** A path on this site, or the default. Never a full URL — an open redirect
 *  on the end of a sign-in is how a sign-in page ends up on somebody else's
 *  domain. */
export function safeNext(raw: string | null | undefined, fallback = "/draft"): string {
  const v = (raw ?? "").trim();
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}

export function encodeHandshake(h: Handshake): string {
  return Buffer.from(JSON.stringify(h), "utf8").toString("base64url");
}

export function decodeHandshake(raw: string | undefined): Handshake | null {
  if (!raw) return null;
  try {
    const h = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Handshake>;
    if (typeof h.state !== "string" || typeof h.nonce !== "string") return null;
    return {
      state: h.state,
      nonce: h.nonce,
      intent: h.intent === "sign-up" ? "sign-up" : "sign-in",
      next: safeNext(h.next),
    };
  } catch {
    return null;
  }
}

/**
 * This site's origin, for the redirect URI.
 *
 * NEXT_PUBLIC_SITE_URL when set (it is, in production — the billing code
 * needs it too); otherwise the host the request arrived on, read from the
 * proxy headers Vercel sets, because `req.nextUrl.origin` behind a proxy can
 * name the internal host rather than the public one. Google compares the
 * redirect URI byte for byte, so this must be the address in the Cloud
 * console, not a near miss.
 */
export function siteOrigin(headers: Headers, fallback: string): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  if (raw) {
    try {
      return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
    } catch {
      /* fall through to the request */
    }
  }
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : fallback;
}

/** Where Google sends the browser back. Always on this site. */
export function redirectUri(origin: string): string {
  return `${origin}/auth/google/callback`;
}

/** The URL that opens Google's account chooser. */
export function authorizeUrl(origin: string, h: Handshake): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state: h.state,
    nonce: hashNonce(h.nonce),
    /* Always show the chooser. Somebody with two Google accounts should not
       be signed in as whichever one Google last saw, and "no account for
       that login" is a message people answer by picking a different login. */
    prompt: "select_account",
    access_type: "online",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

/** Swap Google's one-time code for tokens. Returns the ID token, or null. */
export async function exchangeCode(origin: string, code: string): Promise<string | null> {
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("[auth/google] token exchange failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
  return typeof json?.id_token === "string" ? json.id_token : null;
}

/** The claims inside the ID token. See "ON TRUSTING THE ID TOKEN" above. */
export function readClaims(idToken: string): GoogleClaims | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Partial<GoogleClaims>;
    if (typeof c.iss !== "string" || typeof c.aud !== "string" || typeof c.sub !== "string") return null;
    if (typeof c.exp !== "number") return null;
    return c as GoogleClaims;
  } catch {
    return null;
  }
}

/** The checks that matter before the token is acted on. */
export function claimsAreOurs(c: GoogleClaims, rawNonce: string): boolean {
  const issuerOk = c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com";
  const audienceOk = c.aud === clientId();
  const nonceOk = c.nonce === hashNonce(rawNonce);
  const fresh = c.exp * 1000 > Date.now() - 60_000;
  return issuerOk && audienceOk && nonceOk && fresh;
}
