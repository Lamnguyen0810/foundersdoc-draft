import { NextRequest } from "next/server";
import { publishedPost } from "@/lib/blog/store";
import { renderMissing, renderPost } from "@/lib/blog/render";

/**
 * /resources/<slug> for articles published from the admin console (055).
 *
 * The articles written as files are served first, by the rewrites in
 * next.config.ts, so this only ever sees addresses that are not one of them.
 * A post goes live, or is taken down, within a minute: the page is cached at
 * the edge for 60 seconds and no deploy is involved.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const origin = req.nextUrl.origin;
  const post = await publishedPost(slug.toLowerCase());
  if (!post) {
    return new Response(await renderMissing(origin), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, s-maxage=30" },
    });
  }
  return new Response(await renderPost(post, origin), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
