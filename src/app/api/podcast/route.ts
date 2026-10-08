import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { VIDEO_CATEGORIES, VIDEO_SHELVES } from "@/lib/podcast/videos";

/**
 * The live videos added from the admin console (085), for the podcast page
 * (public/podcast.html fetches this and adds a slide and the cards for each).
 * Read as a visitor would — the public key, no cookie — so row-level
 * security returns live rows and nothing else. Cached for a minute.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAT_LABEL = Object.fromEntries(VIDEO_CATEGORIES.map((c) => [c.value, c.label]));
const SHELF_ID = Object.fromEntries(VIDEO_SHELVES.map((s) => [s.value, s.pageId]));

function niceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}`;
}

export async function GET() {
  const headers = { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" };
  if (!isSupabaseConfigured()) return NextResponse.json({ videos: [] }, { headers });
  const client = createClient(supabaseUrl()!, supabasePublishableKey()!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client
    .from("podcast_videos")
    .select("youtube_id,title,description,category,shelf,kind,published_on,featured")
    .eq("status", "live")
    .order("published_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (!/podcast_videos/.test(error.message)) console.error("[podcast] could not read videos:", error.message);
    return NextResponse.json({ videos: [] }, { headers });
  }
  const videos = (data ?? []).map((v) => ({
    id: v.youtube_id,
    title: v.title,
    desc: v.description,
    cat: v.category,
    catLabel: CAT_LABEL[v.category] ?? v.category,
    shelf: SHELF_ID[v.shelf] ?? null,
    kind: v.kind === "short" ? "Short" : "Video",
    date: v.published_on,
    dateLabel: niceDate(v.published_on),
    featured: Boolean(v.featured),
  }));
  return NextResponse.json({ videos }, { headers });
}
