import type { MetadataRoute } from "next";
import { draftHref } from "@/lib/doc-links";
import { STATIC_ARTICLES } from "@/lib/blog/html";
import { publishedCards } from "@/lib/blog/store";
import { loadDocTypes } from "@/lib/doctypes.server";
import { PUBLIC_PAGES, SITE } from "@/lib/seo";
import { templatePaths } from "@/lib/templates/data";

/**
 * /sitemap.xml — every public page: the marketing site, the blog (the
 * articles written as files and the ones published from Admin), /draft and
 * each live document's own link, and the template pages (lib/templates). Rebuilt at most once an hour, so a new
 * document or blog post shows up without a deploy.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [docs, posts] = await Promise.all([
    loadDocTypes()
      .then((r) => r.docTypes)
      .catch(() => []),
    publishedCards().catch(() => []),
  ]);
  const page = (path: string, priority: number, lastModified?: string | null): MetadataRoute.Sitemap[number] => ({
    url: `${SITE}${path}`,
    ...(lastModified ? { lastModified } : {}),
    priority,
  });
  const fromFiles = new Set(STATIC_ARTICLES.map((a) => a.slug));
  return [
    ...PUBLIC_PAGES.map((p) => page(p ? `/${p}` : "", p ? 0.6 : 1)),
    page("/draft", 0.9),
    ...docs.map((d) => page(draftHref(d.slug), d.slug === "nda" ? 0.9 : 0.8)),
    ...templatePaths().map((p) => page(p, p.split("/").length > 3 ? 0.8 : 0.7)),
    ...STATIC_ARTICLES.map((a) => page(`/resources/${a.slug}`, 0.7)),
    ...posts.filter((p) => !fromFiles.has(p.slug)).map((p) => page(`/resources/${p.slug}`, 0.7, p.published_at)),
  ];
}
