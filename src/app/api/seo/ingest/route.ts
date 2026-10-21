import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ingest } from "@/lib/seo-agent/server";

/**
 * POST /api/seo/ingest — where automated SEO research sends its findings.
 *
 * `Authorization: Bearer <SEO key>` and a JSON body: { source, status,
 * summary, limitations, stats, findings[], keywords[], recommendations[] }
 * (see SEO_AGENT.md). The database function seo_ingest checks the key,
 * validates every field, skips repeats and caps volume (104). No session,
 * so it is a public path in middleware; without the right key it answers 404.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (key.length < 24) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: "Too large." }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });

  const { data, error } = await ingest(key, payload);
  if (error) {
    const m = error.message ?? "";
    if (/not allowed/.test(m)) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (/too many runs/.test(m)) return NextResponse.json({ error: "Too many runs today." }, { status: 429 });
    if (/bad payload/.test(m)) return NextResponse.json({ error: "Bad payload." }, { status: 400 });
    console.error("[seo ingest] failed:", m);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data ?? {}) });
}
