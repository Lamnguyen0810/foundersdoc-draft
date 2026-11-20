import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { wrongKeyAlarm } from "@/lib/esop/alarm";
import { sendHolderNotes } from "@/lib/esop/notes";
import { noteCcChoice } from "@/lib/esop/holder-note";

/**
 * POST /api/esop/zap/notes   { "company": "hitpay", "ref": "B8-T2", "dry": true }
 *
 * Sends each option holder of an approved vesting their "A Milestone Worth Celebrating" note
 * (0256), from the website, with Founders Doc and the client's contact on the CC line.
 * `Authorization: Bearer <company key>`, like the other /api/esop/zap routes; a wrong key gets a
 * 404 (and an alarm in Slack). "dry": true only shows who would be emailed. Once per vesting:
 * a second call answers "already_sent" and sends nothing.
 * 0260: "cc": "client" copies the client's contact only, "none" copies nobody (for one send);
 * left out, Founders Doc and the client's contact are copied as usual.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (key.length < 24) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { company?: unknown; ref?: unknown; dry?: unknown; cc?: unknown };
  const slug = String(body.company ?? "").toLowerCase();
  const ref = String(body.ref ?? "").toUpperCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !/^B\d{1,3}-T\d{1,2}$/.test(ref)) return NextResponse.json({ error: "Give \"company\" and \"ref\" (like B8-T2)." }, { status: 400 });

  /* a spelling that is not understood must not quietly copy everyone */
  if (body.cc !== undefined && !["all", "client", "none"].includes(String(body.cc))) return NextResponse.json({ error: 'For "cc" give "all", "client" or "none".' }, { status: 400 });
  const out = await sendHolderNotes(key, slug, ref, body.dry === true || body.dry === "true", noteCcChoice(body.cc));
  if (out.status === "not_allowed") {
    await wrongKeyAlarm(slug, "notes", ref);
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (out.status === "not_found") return NextResponse.json({ error: "That vesting was not found." }, { status: 404 });
  if (out.status === "not_approved") return NextResponse.json({ error: `${ref} is not approved yet, so no note is sent.` }, { status: 409 });
  if (out.status === "no_holders") return NextResponse.json({ error: "No option holder with an email address in this vesting." }, { status: 409 });
  if (out.status === "unavailable") return NextResponse.json({ error: "Could not record the send, so nothing was sent." }, { status: 503 });
  return NextResponse.json(out.status === "already_sent" ? { ok: true, notes: "already_sent" } : { ok: true, notes: out.status, ...out, status: undefined });
}
