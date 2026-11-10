import { NextRequest, NextResponse } from "next/server";
import { signAccount } from "@/lib/sign/account";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/fd-sign/check/decision { checkId, decision: "acknowledged" | "sent_anyway", reason? }
 *
 * The signing-ready check's audit trail (0201, SQL 125): the person accepted the
 * warnings, or chose to send despite the problems found, with their reason.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const me = await signAccount();
  if (!me) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = ((await req.json().catch(() => ({}))) ?? {}) as { checkId?: unknown; decision?: unknown; reason?: unknown };
  const decision = b.decision === "sent_anyway" ? "sent_anyway" : b.decision === "acknowledged" ? "acknowledged" : null;
  const reason = typeof b.reason === "string" ? b.reason.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  if (!decision) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  if (decision === "sent_anyway" && reason.length < 5) return NextResponse.json({ error: "Please say why you are sending it anyway." }, { status: 400 });
  if (typeof b.checkId !== "string" || !UUID.test(b.checkId) || !isAdminClientConfigured()) return NextResponse.json({ ok: true, logged: false });
  const r = await supabaseAdmin()
    .from("sign_checks")
    .update({ decision, decision_reason: reason || null, decided_at: new Date().toISOString() })
    .eq("id", b.checkId)
    .eq("owner_id", me.id);
  if (r.error) console.error("[fd-sign check] decision not logged:", r.error.message);
  return NextResponse.json({ ok: true, logged: !r.error });
}
