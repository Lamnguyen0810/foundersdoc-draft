import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { record } from "@/lib/esop/zap";

/**
 * POST /api/esop/zap/record — Zapier writes back to the ESOP dashboard.
 *
 * `Authorization: Bearer <company key>` and JSON, one of:
 *   { "company": "hitpay", "action": "approved", "ref": "B99-T1", "invoice_no": "INV-0042", "approved_by": "<Slack member ID>" }
 *   { "company": "hitpay", "action": "certificate", "holder_id": "…", "tranche": 1, "url": "https://docs.google.com/…", "number": "HITPAY-B99-T1-001" }
 * "approved" stops the same Ref running twice (first_time is false the second
 * time: put a Filter on it). "certificate" puts the link in the holder's
 * Option certificates cell. Checked in the database (supabase/106).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (key.length < 24) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const raw = await req.text();
  if (raw.length > 5000) return NextResponse.json({ error: "Too large." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
  }
  const slug = String(body.company ?? "").toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return NextResponse.json({ error: "Give \"company\"." }, { status: 400 });
  const { company: _ignored, ...payload } = body;
  void _ignored;

  const { data, error } = await record(key, slug, payload);
  if (error) {
    const m = error.message ?? "";
    if (/not allowed/.test(m)) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (/bad payload/.test(m)) return NextResponse.json({ error: "Bad payload." }, { status: 400 });
    console.error("[esop record] failed:", m);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
  return NextResponse.json(data ?? { ok: true });
}
