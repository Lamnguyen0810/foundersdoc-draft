import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE,
  COOKIE_SECONDS,
  authorizeUrl,
  encodeHandshake,
  isGoogleConfigured,
  randomToken,
  safeNext,
  siteOrigin,
  type Intent,
} from "@/lib/auth/google";

/**
 * Step one of "Continue with Google": leave for Google.
 *
 * The button links here with two things: which screen it was on (`intent`)
 * and where to land afterwards (`next`). Both go into a cookie, along with
 * a random `state` (so the callback can tell it is answering THIS press and
 * not a link somebody pasted) and a random `nonce` (so the ID token Google
 * returns can be tied to this browser). Then the browser is sent to Google's
 * account chooser, with a redirect URI on THIS site — which is the whole
 * point; see lib/auth/google.ts.
 *
 * ── WHY /auth AND NOT /api ──────────────────────────────────────────────────
 * The person is not signed in yet. Everything under /auth is public in the
 * middleware; /api is not.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = siteOrigin(req.headers, req.nextUrl.origin);

  if (!isGoogleConfigured()) {
    console.error("[auth/google] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.");
    return NextResponse.redirect(`${origin}/login?error=google`);
  }

  const q = req.nextUrl.searchParams;
  const intent: Intent = q.get("intent") === "sign-up" ? "sign-up" : "sign-in";
  const handshake = {
    state: randomToken(),
    nonce: randomToken(),
    intent,
    next: safeNext(q.get("next")),
  };

  const res = NextResponse.redirect(authorizeUrl(origin, handshake));
  res.cookies.set(COOKIE, encodeHandshake(handshake), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/auth/google",
    maxAge: COOKIE_SECONDS,
  });
  return res;
}
