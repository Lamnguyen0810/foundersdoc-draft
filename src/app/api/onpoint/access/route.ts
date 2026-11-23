import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { clean, okEmail, sendCode } from "@/lib/onpoint/access";

/** POST /api/onpoint/access { email }: a sign-in code, only to an OnPoint member; the same answer either way (0267). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const perIp = new Map<string, number[]>();

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const recent = (perIp.get(ip) ?? []).filter((t) => Date.now() - t < 3_600_000);
  if (recent.length >= 10) return NextResponse.json({ error: "Too many tries. Please try again in an hour." }, { status: 429 });
  perIp.set(ip, [...recent, Date.now()]);
  const email = clean(((await req.json().catch(() => ({}))) as { email?: unknown }).email);
  if (!okEmail(email)) return NextResponse.json({ error: "Check the email address." }, { status: 400 });
  const out = await sendCode(email).catch(() => "failed" as const);
  if (out === "failed") console.error("[onpoint access] code not sent");
  return NextResponse.json({ ok: true, message: "If this email has access to OnPoint Workflows, a 6-digit code is on its way." });
}
