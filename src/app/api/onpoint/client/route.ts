import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorJson, guard, OpError } from "@/lib/onpoint/server";

/** PATCH /api/onpoint/client { id, contact_name, contact_email }: a client's recipient, typed in the app (0267). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const m = await guard("edit");
    const b = (await req.json().catch(() => ({}))) as { id?: unknown; contact_name?: unknown; contact_email?: unknown };
    const id = String(b.id ?? "");
    const name = String(b.contact_name ?? "").replace(/\s+/g, " ").trim().slice(0, 160) || null;
    const email = String(b.contact_email ?? "").trim().toLowerCase() || null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new OpError("Check the email address.");
    const r = await supabaseAdmin().from("onpoint_clients").update({ contact_name: name, contact_email: email, updated_at: new Date().toISOString() }).eq("workspace_id", m.ws.id).eq("id", id).select("id").maybeSingle();
    if (r.error) throw new OpError(r.error.message, 500);
    if (!r.data) throw new OpError("That client is no longer there.", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
