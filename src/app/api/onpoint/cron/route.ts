import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { dailyRun } from "@/lib/onpoint/server";
import { teamNotice } from "@/lib/sign/slack";

/**
 * GET /api/onpoint/cron: the daily automatic reminders (Vercel Cron, Authorization: Bearer <CRON_SECRET>).
 * Sends only while OnPoint's "Automatic sending" is on; each reminder at most once per lead time (0267).
 * 0282: payment reminders on the days set on Payments, then filing reminders if they are shown.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!expected || expected.length !== supplied.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const out = await dailyRun();
  const channel = process.env.ONPOINT_SLACK_CHANNEL?.trim();
  if (channel && !out.off && out.due) await teamNotice(`📬 OnPoint daily reminders: ${out.sent} sent (payments ${out.payments.sent}, filing ${out.filing.sent})${out.failed ? ` · ${out.failed} FAILED` : ""}${out.skipped ? ` · ${out.skipped} skipped (no email, or already sent)` : ""}`, channel).catch(() => false);
  return NextResponse.json({ ok: true, ...out });
}
