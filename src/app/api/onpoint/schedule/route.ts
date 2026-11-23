import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorJson, guard, OpError } from "@/lib/onpoint/server";
import { isType } from "@/lib/onpoint/types";

/** PUT /api/onpoint/schedule { type, lead_days }: the whole set of "days before" for one type, 1–180 each (0267). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  try {
    const m = await guard("edit");
    const b = (await req.json().catch(() => ({}))) as { type?: unknown; lead_days?: unknown };
    if (!isType(b.type)) throw new OpError("Choose which deadline this is for.");
    const raw = Array.isArray(b.lead_days) ? b.lead_days : [];
    if (raw.length > 12) throw new OpError("At most 12 reminders per type.");
    const days = [...new Set(raw.map(Number))].sort((x, y) => y - x);
    if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 180)) throw new OpError("Each must be a whole number of days from 1 to 180.");
    const r = await supabaseAdmin().from("onpoint_schedules").upsert({ workspace_id: m.ws.id, type: b.type, lead_days: days, updated_by: m.email, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,type" });
    if (r.error) throw new OpError(r.error.message, 500);
    return NextResponse.json({ ok: true, lead_days: days });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
