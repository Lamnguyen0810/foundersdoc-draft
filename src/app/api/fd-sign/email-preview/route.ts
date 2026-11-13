import { NextRequest, NextResponse } from "next/server";
import { digestFrequency, senderDigest } from "@/lib/sign/digest";
import { allowance } from "@/lib/sign/allowance";
import { SIGN_PLANS } from "@/lib/billing/sign-plans";
import { ctx } from "../common";

/**
 * GET /api/fd-sign/email-preview[?f=daily]  (0236): your own status email as it would look today, in the
 * browser, nothing sent. For checking the email before the first one goes out.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  const a = await allowance(c.me, c.store);
  /* ?f=daily|weekly to see either; otherwise the sender's own setting (weekly when off) */
  const q = req.nextUrl.searchParams.get("f");
  const saved = await digestFrequency(c.me.id).catch(() => "weekly" as const);
  const f = q === "daily" || q === "weekly" ? q : saved === "daily" ? "daily" : "weekly";
  const mail = await senderDigest(c.store, { id: c.me.id, name: c.me.name }, f, a.live ? SIGN_PLANS[a.tier].label : "FD Sign", req.nextUrl.origin);
  const html = mail?.html ?? `<p style="font-family:Arial;padding:24px">Nothing to report: no documents waiting for signatures, nothing completed this week.</p>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
