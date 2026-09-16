/**
 * Save the order of one document type's sources.
 *
 * The body is the type and its ids in the order the admin wants; the
 * database function gives each its position in one statement, admin only.
 * Rank 1 is the firm's preferred example — the first Gemini reads, and the
 * one it is told to prefer when the examples differ.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { orders?: { slug: string; ids: string[] }[] } | null;
  const orders = (body?.orders ?? []).filter(
    (o) => o && typeof o.slug === "string" && Array.isArray(o.ids) && o.ids.every((id) => UUID.test(id)),
  );
  if (orders.length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const supabase = await createClient();
  let saved = 0;
  for (const o of orders) {
    const { data, error } = await supabase.rpc("ai_sources_reorder", { p_slug: o.slug, p_ids: o.ids });
    if (error) {
      const missing = /ai_sources_reorder/.test(error.message);
      return NextResponse.json(
        { error: missing ? "The ranking function is missing — run supabase/016_rank_and_redaction.sql." : "Could not save the order." },
        { status: 400 },
      );
    }
    saved += Number(data ?? 0);
  }
  return NextResponse.json({ ok: true, saved });
}
