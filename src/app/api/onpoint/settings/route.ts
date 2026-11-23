import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorJson, guard, OpError } from "@/lib/onpoint/server";

/**
 * PATCH /api/onpoint/settings { test_inbox, auto_send, sender_name, sender_email }: Founders Doc only.
 * test_inbox set = every reminder goes there; empty = live, to the clients (0267).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function PATCH(req: NextRequest) {
  try {
    const m = await guard("admin");
    if (!m.founder) throw new OpError("Only Founders Doc can change how emails are sent.", 403);
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("test_inbox" in b) {
      const t = String(b.test_inbox ?? "").trim().toLowerCase();
      if (t && (!EMAIL.test(t) || !t.endsWith("@foundersdoc.com"))) throw new OpError("The test inbox must be a @foundersdoc.com address, or empty to go live.");
      patch.test_inbox = t || null;
    }
    if ("auto_send" in b) patch.auto_send = b.auto_send === true;
    if ("sender_name" in b) patch.sender_name = String(b.sender_name ?? "").trim().slice(0, 120) || "OnPoint Consulting";
    if ("sender_email" in b) {
      const e = String(b.sender_email ?? "").trim().toLowerCase();
      if (e && !EMAIL.test(e)) throw new OpError("Check the sender's email.");
      patch.sender_email = e || null;
    }
    const r = await supabaseAdmin().from("onpoint_workspaces").update(patch).eq("id", m.ws.id);
    if (r.error) throw new OpError(r.error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
