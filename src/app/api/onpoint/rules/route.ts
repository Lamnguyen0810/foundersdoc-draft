import { NextRequest, NextResponse } from "next/server";
import { errorJson, guard, OpError } from "@/lib/onpoint/server";
import { addNote, deleteFlow, removeNote, restoreFlows, saveConnections, saveFlow, setTypePaused, testConnection, toggleFlow } from "@/lib/onpoint/rules";

/**
 * POST /api/onpoint/rules (0294): Rules & flows and the calendar notes, as in the approved mock-up.
 *   { action: "save", id?, name, trigger, types, days, actions, enabled }   staff and administrators
 *   { action: "toggle", id, on } · { action: "delete", id } · { action: "restore" }
 *   { action: "pause", type, paused }        a type's automatic client chase off / on
 *   { action: "connections", team_email?, monday_email?, slack?, zapier? }   administrators only
 *   { action: "test", kind }                 administrators only: a test message through one connection
 *   { action: "note", day, text } · { action: "unnote", id }   calendar notes
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const a = String(b.action ?? "");
    const admin = a === "connections" || a === "test";
    const m = await guard(admin ? "admin" : "edit");
    const id = String(b.id ?? "").slice(0, 60);
    switch (a) {
      case "save":
        return NextResponse.json({ ok: true, ...(await saveFlow(m, id || null, b)) });
      case "toggle":
        return NextResponse.json({ ok: true, ...(await toggleFlow(m, id, b.on === true)) });
      case "delete":
        return NextResponse.json({ ok: true, ...(await deleteFlow(m, id)) });
      case "restore":
        return NextResponse.json({ ok: true, ...(await restoreFlows(m)) });
      case "pause":
        return NextResponse.json({ ok: true, ...(await setTypePaused(m, String(b.type ?? ""), b.paused === true)) });
      case "connections":
        return NextResponse.json({ ok: true, ...(await saveConnections(m, b)) });
      case "test":
        return NextResponse.json({ ok: true, ...(await testConnection(m, String(b.kind ?? ""))) });
      case "note":
        return NextResponse.json({ ok: true, ...(await addNote(m, String(b.day ?? ""), String(b.text ?? ""))) });
      case "unnote":
        return NextResponse.json({ ok: true, ...(await removeNote(m, id)) });
      default:
        throw new OpError("Unknown action.");
    }
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
