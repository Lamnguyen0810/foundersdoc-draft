import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorJson, guard, OpError } from "@/lib/onpoint/server";

/** PATCH /api/onpoint/client { id, contact_name, contact_email } and/or { id, notes } (0285): a client's recipient or notes. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const m = await guard("edit");
    const b = (await req.json().catch(() => ({}))) as { id?: unknown; contact_name?: unknown; contact_email?: unknown; notes?: unknown };
    const id = String(b.id ?? "");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("contact_email" in b || "contact_name" in b) {
      const name = String(b.contact_name ?? "").replace(/\s+/g, " ").trim().slice(0, 160) || null;
      const email = String(b.contact_email ?? "").trim().toLowerCase() || null;
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new OpError("Check the email address.");
      patch.contact_name = name;
      patch.contact_email = email;
    }
    /* 0285: notes on the client page */
    if ("notes" in b) patch.notes = String(b.notes ?? "").trim().slice(0, 4000) || null;
    const r = await supabaseAdmin().from("onpoint_clients").update(patch).eq("workspace_id", m.ws.id).eq("id", id).select("id").maybeSingle();
    if (r.error) throw new OpError(/notes/.test(r.error.message) ? "Notes need supabase/142_onpoint_client_notes_addon.sql first." : r.error.message, 500);
    if (!r.data) throw new OpError("That client is no longer there.", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
