import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import type { CountryRow, QueryRow, RegionUpload } from "@/lib/seo-regions/figures";
import { gscConfigured } from "@/lib/seo-regions/gsc";

/**
 * /api/seo/regions (0247): the Search Console exports uploaded on Admin → SEO.
 *   GET   the last uploads, newest first
 *   POST  one export, already read in the browser (lib/seo-regions/figures.ts readExport): countries and searches with their counts
 * Founders Doc admins only: checked here, and again by row-level security (supabase/134). Runs with the admin's
 * own session, never the secret key. Without Supabase (the local preview) uploads are kept in memory.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = "id, uploaded_at, uploaded_by, date_from, date_to, country, countries, queries";
const preview = globalThis as unknown as { __seoRegions?: RegionUpload[] };

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, 1e12) : 0);
const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Only what the table holds, with every number checked: nothing else from the request is stored. */
function clean(body: unknown): RegionUpload | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const list = (v: unknown, most: number) => (Array.isArray(v) ? (v.slice(0, most) as Array<Record<string, unknown>>) : []);
  const countries: CountryRow[] = list(b.countries, 300)
    .map((r) => ({ country: text(r?.country, 80), clicks: count(r?.clicks), impressions: count(r?.impressions), position: count(r?.position) }))
    .filter((r) => r.country);
  const queries: QueryRow[] = list(b.queries, 1000)
    .map((r) => ({ query: text(r?.query, 200), clicks: count(r?.clicks), impressions: count(r?.impressions), position: count(r?.position) }))
    .filter((r) => r.query);
  if (!countries.length && !queries.length) return null;
  return { date_from: day(b.date_from), date_to: day(b.date_to), country: text(b.country, 80) || null, countries, queries };
}

async function admin(): Promise<{ email: string } | null> {
  if (!isSupabaseConfigured()) return { email: "Preview" };
  const user = await getUser();
  if (!user || !(await isAdmin())) return null;
  return { email: user.email ?? "admin" };
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSupabaseConfigured()) return NextResponse.json({ ready: true, preview: true, auto: gscConfigured(), uploads: preview.__seoRegions ?? [] });
  const supabase = await createClient();
  const { data, error } = await supabase.from("seo_region_uploads").select(COLUMNS).order("uploaded_at", { ascending: false }).limit(60);
  if (error) {
    if (/seo_region_uploads|does not exist|schema cache/i.test(error.message)) return NextResponse.json({ ready: false, auto: gscConfigured(), uploads: [] });
    console.error("[seo regions] read failed:", error.message);
    return NextResponse.json({ error: "Could not read the uploads." }, { status: 500 });
  }
  /* auto = the key that lets the site read Search Console each morning is in Vercel (0248) */
  return NextResponse.json({ ready: true, auto: gscConfigured(), uploads: data ?? [] });
}

export async function POST(req: NextRequest) {
  const me = await admin();
  if (!me) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 400_000) return NextResponse.json({ error: "That export is too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const upload = clean(body);
  if (!upload) return NextResponse.json({ error: "The export has no countries or searches in it." }, { status: 400 });
  if (!isSupabaseConfigured()) {
    const row = { ...upload, id: crypto.randomUUID(), uploaded_at: new Date().toISOString(), uploaded_by: me.email };
    preview.__seoRegions = [row, ...(preview.__seoRegions ?? [])].slice(0, 24);
    return NextResponse.json({ ok: true, upload: row });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("seo_region_uploads").insert({ ...upload, uploaded_by: me.email }).select(COLUMNS).single();
  if (error) {
    if (/seo_region_uploads|does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Not ready yet: run supabase/134_seo_regions.sql in Supabase first." }, { status: 503 });
    console.error("[seo regions] save failed:", error.message);
    return NextResponse.json({ error: "Could not save the export." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, upload: data });
}
