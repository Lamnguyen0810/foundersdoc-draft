import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentTemplates, errorJson, guard, OpError } from "@/lib/onpoint/server";
import { isType } from "@/lib/onpoint/types";
import { unknownTokens } from "@/lib/onpoint/templates";

/**
 * PUT /api/onpoint/template { type, subject, body, version }: save a new version of one type's template.
 * `version` is the one the editor started from: if someone saved a newer one meanwhile, nothing is overwritten (0267).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  try {
    const m = await guard("edit");
    const b = (await req.json().catch(() => ({}))) as { type?: unknown; subject?: unknown; body?: unknown; version?: unknown };
    if (!isType(b.type)) throw new OpError("Choose which deadline this template is for.");
    const subject = String(b.subject ?? "").replace(/\s+/g, " ").trim();
    const body = String(b.body ?? "").replace(/\r\n/g, "\n").trim();
    if (!subject || !body) throw new OpError("The subject and the body cannot be empty.");
    if (subject.length > 300 || body.length > 8000) throw new OpError("That is too long (subject up to 300, body up to 8,000 characters).");
    const bad = unknownTokens(subject + body);
    if (bad.length) throw new OpError(`Unsupported: ${bad.join(", ")}. Use only the tokens shown.`);
    const cur = (await currentTemplates(m.ws.id))[b.type];
    if (Number(b.version) !== cur.version) throw new OpError("Someone saved this template meanwhile. Reload to see their version.", 409);
    if (cur.subject === subject && cur.body === body) return NextResponse.json({ ok: true, version: cur.version });
    const r = await supabaseAdmin().from("onpoint_templates").insert({ workspace_id: m.ws.id, type: b.type, version: cur.version + 1, subject, body, created_by: m.email }).select("version").single();
    if (r.error) throw new OpError(/duplicate|23505/.test(r.error.message) ? "Someone saved this template meanwhile. Reload." : r.error.message, /duplicate|23505/.test(r.error.message) ? 409 : 500);
    return NextResponse.json({ ok: true, version: (r.data as { version: number }).version });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
