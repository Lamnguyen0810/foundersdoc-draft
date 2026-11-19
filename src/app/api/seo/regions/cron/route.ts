import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { AUTO, GscError, fetchRegionUploads, gscConfigured } from "@/lib/seo-regions/gsc";

/**
 * GET /api/seo/regions/cron, once a day (vercel.json, 00:30 UTC = 8:30am Singapore), with
 * `Authorization: Bearer <CRON_SECRET>`. 0248.
 *
 * Reads Search Console (lib/seo-regions/gsc.ts) and stores today's figures where the upload box stores its own
 * (supabase/134), so Admin → SEO shows each region without anyone exporting a file. A day already stored is
 * skipped, so a second run changes nothing. Not set up (no key in Vercel) = it answers "off" and does nothing.
 *
 * The secret-key client is right here: this is a server job with no signed-in user, and the table is closed to
 * everyone but Founders Doc admins.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!gscConfigured()) return NextResponse.json({ ok: true, off: "GSC_SERVICE_ACCOUNT_JSON is not set: nothing read." });
  if (!isAdminClientConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  try {
    const uploads = await fetchRegionUploads();
    const db = supabaseAdmin();
    const done = await db.from("seo_region_uploads").select("country").eq("uploaded_by", AUTO).eq("date_to", uploads[0].date_to);
    if (done.error) return NextResponse.json({ error: /seo_region_uploads|does not exist/i.test(done.error.message) ? "Run supabase/134_seo_regions.sql first." : "Could not read what is stored." }, { status: 503 });
    const have = new Set(((done.data ?? []) as Array<{ country: string | null }>).map((r) => r.country ?? ""));
    const fresh = uploads.filter((u) => !have.has(u.country ?? ""));
    if (fresh.length) {
      const saved = await db.from("seo_region_uploads").insert(fresh.map((u) => ({ ...u, uploaded_by: AUTO })));
      if (saved.error) {
        console.error("[seo regions cron] save failed:", saved.error.message);
        return NextResponse.json({ error: "Could not save." }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, period: `${uploads[0].date_from} to ${uploads[0].date_to}`, saved: fresh.length, already: uploads.length - fresh.length });
  } catch (e) {
    /* the message says what to fix (key not accepted, account not added in Search Console); it never holds the key */
    console.error("[seo regions cron] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof GscError ? e.message : "Search Console could not be read." }, { status: 502 });
  }
}
