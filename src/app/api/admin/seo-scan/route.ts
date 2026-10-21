import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { scanSite } from "@/lib/seo-audit/scan";

/**
 * GET /api/admin/seo-scan — the SEO scanner, for the admin console's SEO tab.
 *
 * Reads our own website (every page in the sitemap) and returns what to fix.
 * Admins only. Free: it fetches nothing but our own pages, and stores nothing.
 * `?origin=` is ignored on purpose: it always scans the site it runs on.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (isSupabaseConfigured() && !(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const report = await scanSite(req.nextUrl.origin);
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[seo-scan] failed", err);
    return NextResponse.json({ error: "The scan could not finish. Try again in a minute." }, { status: 500 });
  }
}
