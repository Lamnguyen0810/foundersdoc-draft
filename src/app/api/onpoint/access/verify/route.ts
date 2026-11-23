import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { clean, clearTries, countTry, okEmail } from "@/lib/onpoint/access";

/** POST /api/onpoint/access/verify { email, code }: Supabase checks the code and the session cookie is set (0267). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; code?: unknown };
  const email = clean(body.email);
  const code = String(body.code ?? "").replace(/\s+/g, "");
  if (!okEmail(email) || !/^\d{6,10}$/.test(code)) return NextResponse.json({ error: "Type the code from the email." }, { status: 400 });
  if (!countTry(email)) return NextResponse.json({ error: "Too many wrong codes. Ask for a new one." }, { status: 429 });
  const { data, error } = await (await createClient()).auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) return NextResponse.json({ error: "That code is wrong or has expired." }, { status: 400 });
  clearTries(email);
  return NextResponse.json({ ok: true, next: "/onpoint" });
}
