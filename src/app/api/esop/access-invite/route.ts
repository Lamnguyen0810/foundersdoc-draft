import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser, isAdmin } from "@/lib/supabase/server";
import { sendInvite } from "@/lib/esop/access";

/**
 * POST /api/esop/access-invite  { "company": "hitpay", "email": "director@client.com" }
 *
 * Settings → Access → "Email access" (0264, 0266): Founders Doc admins email a person who is already on
 * that dashboard an invitation. Its button opens the sign-in page; it does not sign anyone in by itself.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Only Founders Doc can send this." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { company?: unknown; email?: unknown };
  const slug = String(body.company ?? "").toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const out = await sendInvite(String(body.email ?? ""), req.nextUrl.origin, slug);
  const say: Record<string, [number, string]> = {
    sent: [200, "Invitation emailed."],
    not_member: [409, "Add them under Access first, then send the invitation."],
    too_soon: [429, "Please wait a moment and try again."],
    bad_email: [400, "Check the email address."],
    unavailable: [503, "SUPABASE_SECRET_KEY is not set."],
    failed: [502, "Could not send it just now. Please try again."],
  };
  const [status, message] = say[out];
  return NextResponse.json(out === "sent" ? { ok: true, message } : { error: message }, { status });
}
