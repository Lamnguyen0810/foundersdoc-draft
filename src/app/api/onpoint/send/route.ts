import { NextRequest, NextResponse } from "next/server";
import { errorJson, guard, OpError, sendReminder } from "@/lib/onpoint/server";

/**
 * POST /api/onpoint/send { deadline_id, request_id } or { deadline_ids: [...], confirm_count, request_id }:
 * Send now, one reminder or a confirmed handful. Each is checked again here and recorded once (0267).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const m = await guard("edit");
    const b = (await req.json().catch(() => ({}))) as { deadline_id?: unknown; deadline_ids?: unknown; confirm_count?: unknown; request_id?: unknown };
    const rid = String(b.request_id ?? "").slice(0, 60);
    if (Array.isArray(b.deadline_ids)) {
      const ids = [...new Set(b.deadline_ids.map(String))].slice(0, 50);
      if (Number(b.confirm_count) !== ids.length) throw new OpError("The number of reminders changed. Please check and confirm again.", 409);
      const results = [];
      for (const id of ids) results.push({ id, ...(await sendReminder(m.ws, id, "MANUAL", m.email, { requestId: `${rid}:${id}` })) });
      return NextResponse.json({ ok: results.every((r) => r.status === "sent"), results });
    }
    const r = await sendReminder(m.ws, String(b.deadline_id ?? ""), "MANUAL", m.email, { requestId: rid });
    return NextResponse.json({ ok: r.status === "sent", ...r }, { status: r.status === "sent" ? 202 : r.status === "duplicate" ? 200 : r.status === "blocked" ? 409 : 502 });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
