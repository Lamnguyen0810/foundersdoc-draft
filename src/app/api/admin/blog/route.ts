import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  applyLinks,
  CATEGORIES,
  CTAS,
  cleanHtml,
  readMinutes,
  RESERVED_SLUGS,
  type BlogLink,
} from "@/lib/blog/html";

/**
 * Blog posts from the admin console (055).
 *
 *   POST    save a post: publish it (live within a minute) or keep it as a draft
 *   PATCH   { id, status } — publish or take down
 *   DELETE  ?id= — remove it for good
 *
 * The body is cleaned again here whatever the browser sent, and the links
 * are checked against it, so what goes live is what the preview showed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(): Promise<NextResponse | null> {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return null;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function missingTable(message: string): boolean {
  return /blog_posts/.test(message) && /does not exist|schema cache/i.test(message);
}

export async function POST(req: NextRequest) {
  const blocked = await guard();
  if (blocked) return blocked;

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = str(b.id, 60) || null;
  const title = str(b.title, 200);
  const slug = str(b.slug, 90).toLowerCase();
  const status = b.status === "draft" ? "draft" : "published";
  const category = CATEGORIES.some((c) => c.id === b.category) ? (b.category as string) : "contracts";
  const cta = CTAS.some((c) => c.id === b.cta) ? (b.cta as string) : "nda";
  const body = cleanHtml(typeof b.body === "string" ? b.body.slice(0, 400_000) : "");
  const heroUrl = str(b.heroUrl, 600);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(b.publishedAt, 10)) ? str(b.publishedAt, 10) : null;

  if (title.length < 3) return NextResponse.json({ error: "Give the article a title." }, { status: 400 });
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: "The web address may use only lower-case letters, numbers and hyphens." }, { status: 400 });
  }
  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json({ error: "That web address is already used by an article on the site. Choose another." }, { status: 400 });
  }
  if (!body) return NextResponse.json({ error: "The article has no text. Upload the article file first." }, { status: 400 });
  if (heroUrl && !/^https:\/\//.test(heroUrl)) return NextResponse.json({ error: "The photo address is not valid." }, { status: 400 });

  const links: BlogLink[] = (Array.isArray(b.links) ? b.links : [])
    .slice(0, 60)
    .map((l) => l as Record<string, unknown>)
    .map((l) => ({
      phrase: str(l.phrase, 120),
      href: str(l.href, 500),
      mode: (l.mode === "all" ? "all" : "first") as BlogLink["mode"],
    }))
    .filter((l) => l.phrase.length >= 2 && /^(https?:\/\/|\/|mailto:)/.test(l.href));
  const { missing } = applyLinks(body, links);

  const row = {
    slug,
    title,
    deck: str(b.deck, 400),
    summary: str(b.summary, 800),
    category,
    cta,
    body_html: body,
    links,
    hero_url: heroUrl || null,
    hero_alt: str(b.heroAlt, 300),
    hero_caption: str(b.heroCaption, 300),
    read_minutes: readMinutes(body),
    source_name: str(b.sourceName, 200),
    status,
    published_at: status === "published" ? (date ?? new Date().toISOString().slice(0, 10)) : date,
  };

  const supabase = await createClient();
  const user = await getUser();
  const res = id
    ? await supabase.from("blog_posts").update(row).eq("id", id).select("id,slug,status").maybeSingle()
    : await supabase.from("blog_posts").insert({ ...row, created_by: user?.id ?? null }).select("id,slug,status").maybeSingle();
  if (res.error) {
    if (missingTable(res.error.message)) {
      return NextResponse.json({ error: "Run supabase/055_blog_posts.sql in Supabase first." }, { status: 400 });
    }
    if (/duplicate key|unique/i.test(res.error.message)) {
      return NextResponse.json({ error: "Another post already uses that web address. Choose another." }, { status: 400 });
    }
    console.error("[blog] save failed:", res.error.message);
    return NextResponse.json({ error: `Could not save: ${res.error.message}` }, { status: 500 });
  }
  if (!res.data) return NextResponse.json({ error: "That post no longer exists." }, { status: 404 });
  return NextResponse.json({ ok: true, id: res.data.id, slug: res.data.slug, status: res.data.status, missing });
}

export async function PATCH(req: NextRequest) {
  const blocked = await guard();
  if (blocked) return blocked;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = str(b.id, 60);
  const status = b.status === "published" ? "published" : "draft";
  if (!id) return NextResponse.json({ error: "Which post?" }, { status: 400 });
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "published") {
    const { data } = await supabase.from("blog_posts").select("published_at").eq("id", id).maybeSingle();
    if (!data?.published_at) patch.published_at = new Date().toISOString().slice(0, 10);
  }
  const { error } = await supabase.from("blog_posts").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const blocked = await guard();
  if (blocked) return blocked;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Which post?" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
