import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorJson, guard, OpError } from "@/lib/onpoint/server";

/** PATCH /api/onpoint/deadline { id, status }: mark a deadline done, waived, not applicable, or active again (0267). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OK = ["active", "completed", "waived", "not_applicable"];

export async function PATCH(req: NextRequest) {
  try {
    const m = await guard("edit");
    const b = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown };
    const status = String(b.status ?? "");
    if (!OK.includes(status)) throw new OpError("Bad status.");
    const r = await supabaseAdmin()
      .from("onpoint_deadlines")
      .update({ status, done_on: status === "completed" ? new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10) : null })
      .eq("workspace_id", m.ws.id)
      .eq("id", String(b.id ?? ""))
      .select("id")
      .maybeSingle();
    if (r.error) throw new OpError(r.error.message, 500);
    if (!r.data) throw new OpError("That deadline is no longer there.", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
