import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { sendAccess } from "@/lib/esop/access";

/**
 * POST /api/esop/access  { "email": "director@client.com" }
 *
 * The public /esop/access page (0264): someone on an ESOP dashboard types their email and gets a
 * new one-press sign-in link, sent to that address only. The answer is the same whether or not the
 * address is on a dashboard, so the page tells nobody who our clients are.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const perIp = new Map<string, number[]>();
const IP_LIMIT = 10; // an hour

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const recent = (perIp.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= IP_LIMIT) return NextResponse.json({ error: "Too many tries. Please try again in an hour." }, { status: 429 });
  perIp.set(ip, [...recent, now]);
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const out = await sendAccess(String(body.email ?? ""), req.nextUrl.origin);
  if (out === "bad_email") return NextResponse.json({ error: "Check the email address." }, { status: 400 });
  if (out === "unavailable" || out === "failed") console.error("[esop access] not sent:", out);
  /* sent, not on a dashboard, or too soon: the same words */
  return NextResponse.json({ ok: true, message: "If this email has access to an ESOP dashboard, a sign-in link is on its way. It can take a minute." });
}
