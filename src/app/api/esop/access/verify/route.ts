import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, isAdmin } from "@/lib/supabase/server";
import { afterSignIn, cleanEmail, countTry, isEmail } from "@/lib/esop/access";

/**
 * POST /api/esop/access/verify  { "email": "...", "code": "123456" }
 *
 * /esop/access, step 2 (0266): the code is checked by Supabase itself; if it is right, the session cookie
 * is set here and the answer says which dashboard to open. Five wrong codes and a new one must be asked for.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; code?: unknown };
  const email = cleanEmail(body.email);
  const code = String(body.code ?? "").replace(/\s+/g, "");
  if (!isEmail(email) || !/^\d{6,10}$/.test(code)) return NextResponse.json({ error: "Type the code from the email." }, { status: 400 });
  if (!countTry(email)) return NextResponse.json({ error: "Too many wrong codes. Ask for a new one." }, { status: 429 });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) return NextResponse.json({ error: "That code is wrong or has expired. Check the latest email, or ask for a new one." }, { status: 400 });

  const next = await afterSignIn(email, await isAdmin().catch(() => false));
  return NextResponse.json({ ok: true, next });
}
