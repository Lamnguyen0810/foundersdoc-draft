import { NextResponse } from "next/server";
import { publishedCards } from "@/lib/blog/store";
import { categoryLabel, formatDate } from "@/lib/blog/render";

/**
 * The published posts, for the blog page's cards (public/resources.html
 * fetches this and adds a card for each). Public — it is the website — and
 * cached for a minute.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const posts = (await publishedCards()).map((p) => ({
    ...p,
    categoryLabel: categoryLabel(p.category),
    date: formatDate(p.published_at),
    href: `/resources/${p.slug}`,
  }));
  return NextResponse.json(
    { posts },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
