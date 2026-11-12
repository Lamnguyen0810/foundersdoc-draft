import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { activity } from "@/lib/sign/slack";
import { isQuietAccount } from "@/lib/quiet";

/**
 * GET /api/fd-sign/stalled, once a day (vercel.json, 02:00 UTC = 10am Singapore),
 * with `Authorization: Bearer <CRON_SECRET>`. 0221.
 *
 * "Flag anyone who stops partway": every signer whose turn came more than 2 days ago and
 * who still hasn't signed, as one Slack summary in FD_SIGN_SLACK_CHANNEL, so someone can
 * follow up or send a reminder. People's own requests show only the sender's name and the
 * signer's place (signer 1 of 2), never the title or the signer; Founders Doc's own
 * requests show the title.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS = 2;

function authorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Row = { envelope_id: string; position: number; invited_at: string; viewed_at: string | null };
type Env = { id: string; title: string; status: string; owner_email: string | null; owner_name: string | null };

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isAdminClientConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  const db = supabaseAdmin();
  const before = new Date(Date.now() - DAYS * 86_400_000).toISOString();

  const s = await db.from("sign_signers").select("envelope_id, position, invited_at, viewed_at").eq("status", "invited").lt("invited_at", before).order("invited_at").limit(200);
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: 500 });
  const rows = (s.data ?? []) as Row[];
  if (!rows.length) return NextResponse.json({ ok: true, stalled: 0 });

  const ids = [...new Set(rows.map((r) => r.envelope_id))];
  const e = await db.from("sign_envelopes").select("id, title, status, owner_email, owner_name").in("id", ids);
  if (e.error) return NextResponse.json({ error: e.error.message }, { status: 500 });
  const envs = new Map(((e.data ?? []) as Env[]).map((x) => [x.id, x]));
  const counts = new Map<string, number>();
  for (const id of ids) {
    const c = await db.from("sign_signers").select("id", { count: "exact", head: true }).eq("envelope_id", id);
    counts.set(id, c.count ?? 0);
  }

  const lines: string[] = [];
  for (const r of rows) {
    const env = envs.get(r.envelope_id);
    if (!env || env.status !== "sent" || isQuietAccount(env.owner_email)) continue;
    const days = Math.floor((Date.now() - Date.parse(r.invited_at)) / 86_400_000);
    const n = counts.get(r.envelope_id) ?? 1;
    const of = n > 1 ? `signer ${r.position} of ${n}` : "the signer";
    const where = r.viewed_at ? "opened, not signed" : "not opened";
    const whose = env.owner_email ? `${(env.owner_name || env.owner_email.split("@")[0]).slice(0, 80)}'s request` : `Founders Doc: ${env.title.slice(0, 80)}`;
    lines.push(`• ${whose} · ${of} · ${where} · ${days} days`);
  }
  if (!lines.length) return NextResponse.json({ ok: true, stalled: 0 });
  const shown = lines.slice(0, 15);
  await activity(`⏸ FD Sign · waiting more than ${DAYS} days (${lines.length}):\n${shown.join("\n")}${lines.length > shown.length ? `\n…and ${lines.length - shown.length} more` : ""}`);
  return NextResponse.json({ ok: true, stalled: lines.length });
}
