import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_SHELF, VIDEO_CATEGORIES, VIDEO_SHELVES, youtubeId } from "@/lib/podcast/videos";

/**
 * Videos on /podcast, from the admin console (085).
 *
 *   GET     ?url=   look a YouTube link up: its id, title and thumbnail
 *                   (YouTube's oEmbed, which needs no key)
 *   POST    save a video — new, or an edit by id. Live within a minute.
 *   PATCH   { id, status | featured }
 *   DELETE  ?id=    remove it for good
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(): Promise<NextResponse | null> {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const missingTable = (m: string) => /podcast_videos/.test(m) && /does not exist|schema cache/i.test(m);

export async function GET(req: NextRequest) {
  const blocked = await guard();
  if (blocked) return blocked;
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const id = youtubeId(url);
  if (!id) return NextResponse.json({ error: "That does not look like a YouTube link. Paste the link from the address bar or the Share button." }, { status: 400 });
  let title = "";
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) title = str(((await res.json()) as { title?: string }).title, 200);
    else if (res.status === 404 || res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: "YouTube says this video is private, unlisted-with-embedding-off, or does not exist. Make it public (or unlisted) first." }, { status: 404 });
    }
  } catch {
    /* YouTube was slow; the admin can type the title */
  }
  return NextResponse.json({ id, title, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${id}` });
}

export async function POST(req: NextRequest) {
  const blocked = await guard();
  if (blocked) return blocked;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = str(body.id, 40) || null;
  const ytId = youtubeId(str(body.url, 300)) ?? youtubeId(str(body.youtubeId, 20));
  const title = str(body.title, 200);
  const description = str(body.description, 600);
  const category = VIDEO_CATEGORIES.some((c) => c.value === body.category) ? (body.category as string) : "general";
  const shelf = VIDEO_SHELVES.some((s) => s.value === body.shelf) ? (body.shelf as string) : (DEFAULT_SHELF[category] ?? "general");
  const kind = body.kind === "short" ? "short" : "video";
  const publishedOn = /^\d{4}-\d{2}-\d{2}$/.test(str(body.publishedOn, 10)) ? str(body.publishedOn, 10) : new Date().toISOString().slice(0, 10);
  const featured = body.featured !== false;
  const status = body.status === "hidden" ? "hidden" : "live";
  if (!ytId) return NextResponse.json({ error: "A YouTube link is needed." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "A title is needed." }, { status: 400 });

  const supabase = await createClient();
  const user = await getUser();
  const row = { youtube_id: ytId, title, description, category, shelf, kind, published_on: publishedOn, featured, status };
  const q = id
    ? await supabase.from("podcast_videos").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("podcast_videos").insert({ ...row, created_by: user?.id ?? null }).select("id").maybeSingle();
  if (q.error) {
    if (missingTable(q.error.message)) return NextResponse.json({ error: "The videos table is missing. Run supabase/085_podcast_videos.sql in the Supabase SQL editor." }, { status: 503 });
    if (/youtube_id/.test(q.error.message) && /duplicate|unique/i.test(q.error.message)) return NextResponse.json({ error: "That video is already on the page. Edit it in the list below." }, { status: 409 });
    return NextResponse.json({ error: q.error.message }, { status: 500 });
  }
  return NextResponse.json({ id: q.data?.id ?? id, youtubeId: ytId });
}

export async function PATCH(req: NextRequest) {
  const blocked = await guard();
  if (blocked) return blocked;
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string; featured?: boolean };
  const id = str(body.id, 40);
  if (!id) return NextResponse.json({ error: "Which video?" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.status === "live" || body.status === "hidden") patch.status = body.status;
  if (typeof body.featured === "boolean") patch.featured = body.featured;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("podcast_videos").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const blocked = await guard();
  if (blocked) return blocked;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which video?" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("podcast_videos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
