import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { getWeeklyReport } from "@/lib/weekly-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(req: NextRequest): boolean {
  const expected = process.env.ANALYTICS_REPORT_SECRET?.trim();
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isAdminClientConfigured()) {
    return NextResponse.json({ error: "Analytics are not configured." }, { status: 503 });
  }

  try {
    const report = await getWeeklyReport(supabaseAdmin());
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[weekly analytics] report failed", error);
    return NextResponse.json({ error: "The weekly report could not be prepared." }, { status: 500 });
  }
}
