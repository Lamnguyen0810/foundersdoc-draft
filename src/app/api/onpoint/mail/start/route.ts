import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { siteUrl } from "@/lib/billing/stripe";
import { adminConsentUrl, authorizeUrl, readLink } from "@/lib/onpoint/mailbox";

/**
 * GET /api/onpoint/mail/start?t=<link>[&admin=1] (0270, public: the link itself is the permission).
 * Sends the client to Microsoft to sign in, or their admin to approve the app for the company.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = siteUrl(req.nextUrl.origin);
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const link = readLink(t);
  if (!link) return NextResponse.redirect(`${origin}/onpoint/connect?err=link`, 303);
  const nonce = randomBytes(16).toString("base64url");
  const admin = req.nextUrl.searchParams.get("admin") === "1";
  const res = NextResponse.redirect(admin ? adminConsentUrl(t, nonce, origin) : authorizeUrl(t, link, nonce, origin), 303);
  res.cookies.set("op_ms_n", nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/onpoint/mail", maxAge: 20 * 60 });
  return res;
}
