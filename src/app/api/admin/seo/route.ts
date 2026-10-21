import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { scanSite } from "@/lib/seo-audit/scan";
import { ingest, loadOverview, saveSettings, scanToPayload, setRecommendationStatus } from "@/lib/seo-agent/server";

/**
 * The SEO agent for Admin → SEO. Admins only.
 *
 *   GET                         settings, runs, findings, scored keywords,
 *                               recommendations
 *   POST {action:"settings"}    save the settings form
 *   POST {action:"status"}      approve / reject / mark done a recommendation
 *   POST {action:"save_scan"}   scan the website now and keep the result in the
 *                               history (needs SEO_INGEST_KEY on the server)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function guard(): Promise<NextResponse | null> {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return null;
}

export async function GET() {
  const blocked = await guard();
  if (blocked) return blocked;
  const overview = await loadOverview(await createClient());
  return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const blocked = await guard();
  if (blocked) return blocked;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const supabase = await createClient();
  const user = await getUser();

  switch (body?.action) {
    case "settings": {
      const { error } = await saveSettings(supabase, body.settings, user?.id ?? null);
      if (error) return NextResponse.json({ error: "Could not save the settings." }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "status": {
      const { error } = await setRecommendationStatus(supabase, String(body.id ?? ""), String(body.status ?? ""), String(body.note ?? ""), user?.id ?? null);
      if (error) return NextResponse.json({ error: "Could not update it." }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "save_scan": {
      const key = process.env.SEO_INGEST_KEY?.trim();
      if (!key) return NextResponse.json({ error: "Set SEO_INGEST_KEY in Vercel first (see SEO_AGENT.md)." }, { status: 400 });
      const report = await scanSite(req.nextUrl.origin);
      const { data, error } = await ingest(key, scanToPayload(report));
      if (error) return NextResponse.json({ error: /not allowed/.test(error.message) ? "SEO_INGEST_KEY does not match the key set in the database." : "Could not save the scan." }, { status: 400 });
      return NextResponse.json({ ok: true, score: report.score, ...(data ?? {}) });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
