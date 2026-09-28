import "server-only";
import { applyLinks, CATEGORIES, escapeHtml, type BlogLink } from "./html";

/**
 * A published post → the article page, in the site's own design.
 *
 * The design is not copied here. The page is built on one of the articles
 * already on the site (public/*.html): its head, styles, header, footer and
 * "Read next" are kept, and only the title, the metadata and the article
 * itself are replaced. So a post written in the admin console looks exactly
 * like the articles written by hand, and changes to that design reach both.
 */

export interface BlogPost {
  slug: string;
  title: string;
  deck: string;
  summary: string;
  category: string;
  cta: string;
  body_html: string;
  links: BlogLink[] | null;
  hero_url: string | null;
  hero_alt: string;
  hero_caption: string;
  read_minutes: number;
  published_at: string | null;
  updated_at?: string | null;
}

const SITE = "https://foundersdoc.com";

/* The article whose design and "Read next" suit the post. */
function templateFor(category: string): string {
  return category === "fundraising" ? "/what-is-a-term-sheet.html" : "/nda-vs-confidentiality-agreement.html";
}

const CTA: Record<string, { h: string; p: string; href: string } | null> = {
  nda: {
    h: "Draft your NDA in minutes",
    p: "FD AI asks a few plain-English questions and drafts a first NDA from Founders Doc’s own playbook, ready for you to review, edit and download as Word.",
    href: "/draft?type=nda",
  },
  term: {
    h: "Prepare your term sheet in minutes",
    p: "Founders Doc’s term sheet tool asks a short set of plain-English questions and prepares a clear term sheet built around the essential terms, with the binding and non-binding parts clearly separated.",
    href: "/draft?type=term",
  },
  draft: {
    h: "Draft your document with FD AI",
    p: "Choose the document you need, answer a few plain-English questions, and FD AI prepares a first draft from Founders Doc’s playbook.",
    href: "/draft",
  },
  none: null,
};

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Insights";
}

export function formatDate(iso: string | null): string {
  /* "25 Sep 2026", as the articles written by hand have it (not "Sept"). */
  const d = iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : new Date();
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}`;
}

function articleMain(post: BlogPost, readNext: string): string {
  const cat = categoryLabel(post.category);
  const linked = applyLinks(post.body_html, post.links ?? []).html.replace(
    /<table>([\s\S]*?)<\/table>/g,
    '<div class="table-wrap"><table>$1</table></div>',
  );
  const cta = CTA[post.cta] ?? null;
  const hero = post.hero_url
    ? `<figure class="lead">
              <span class="img"><img src="${escapeHtml(post.hero_url)}" alt="${escapeHtml(post.hero_alt)}" style="display:block;width:100%;height:100%;object-fit:cover" /></span>
              ${post.hero_caption ? `<figcaption>${escapeHtml(post.hero_caption)}</figcaption>` : ""}
            </figure>`
    : "";
  return `<main id="main">
      <article>
        <header class="post-hero">
          <div class="wrap"><div class="rd">
            <div>
              <a class="kicker" href="/resources">Insights for founders &middot; ${escapeHtml(cat)}</a>
              <h1>${escapeHtml(post.title)}</h1>
              ${post.deck ? `<p class="deck">${escapeHtml(post.deck)}</p>` : ""}
              <p class="meta"><span class="who">Founders Doc</span><span class="sep">&middot;</span><span>${formatDate(post.published_at)}</span><span class="sep">&middot;</span><span>${post.read_minutes} min read</span></p>
            </div>
            ${hero}
          </div></div>
        </header>

        <div class="wrap post-body"><div class="rd">
          <div class="main">
          ${post.summary ? `<aside class="summary"><span class="blob-tag">In brief</span><p>${escapeHtml(post.summary)}</p></aside>` : ""}
          <div class="prose">
            ${linked}
            <aside class="disclaimer"><p><b>Legal disclaimer.</b> This article is general information, not legal advice. Laws differ between countries, so speak to a lawyer about your specific situation.</p></aside>
          </div>
          ${
            cta
              ? `<div class="post-cta">
            <div>
              <h2>${escapeHtml(cta.h)}</h2>
              <p>${escapeHtml(cta.p)}</p>
            </div>
            <div class="acts">
              <a class="btn btn-gold" href="${cta.href}">Draft with FD AI</a>
              <a class="btn btn-white" href="/contact">Book a consultation</a>
            </div>
          </div>`
              : ""
          }
          </div>
        </div></div>
      </article>
      ${readNext}
    </main>`;
}

function jsonLd(post: BlogPost): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.deck || post.summary,
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at ?? post.published_at ?? undefined,
    image: post.hero_url ?? undefined,
    author: { "@type": "Organization", name: "Founders Doc" },
    publisher: { "@type": "Organization", name: "Founders Doc", url: SITE },
    mainEntityOfPage: `${SITE}/resources/${post.slug}`,
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function setMeta(html: string, attr: "name" | "property", key: string, value: string): string {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "i");
  if (re.test(html)) return html.replace(re, (_, a: string, b: string) => `${a}${escapeHtml(value)}${b}`);
  return html.replace("</head>", `<meta ${attr}="${key}" content="${escapeHtml(value)}" />\n</head>`);
}

/** The whole page. `origin` is where the site's own files are fetched from. */
export async function renderPost(post: BlogPost, origin: string): Promise<string> {
  let tpl = "";
  try {
    const res = await fetch(new URL(templateFor(post.category), origin), { next: { revalidate: 3600 } });
    if (res.ok) tpl = await res.text();
  } catch {
    tpl = "";
  }
  if (!/<main id="main">[\s\S]*<\/main>/.test(tpl)) return fallbackPage(post);

  const url = `${SITE}/resources/${post.slug}`;
  const description = post.deck || post.summary || post.title;
  const readNext = /<section class="next">[\s\S]*?<\/section>/.exec(tpl)?.[0] ?? "";

  let html = tpl
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(post.title)} — Founders Doc</title>`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>\s*/i, "")
    .replace(/<meta name="keywords"[^>]*>\s*/i, "")
    .replace(/<!-- Suggested slug:[^>]*-->\s*/i, "")
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, "");
  html = setMeta(html, "name", "description", description);
  html = setMeta(html, "property", "og:url", url);
  html = setMeta(html, "property", "og:title", post.title);
  html = setMeta(html, "property", "og:description", description);
  html = setMeta(html, "name", "twitter:title", post.title);
  html = setMeta(html, "name", "twitter:description", description);
  if (post.hero_url) {
    html = setMeta(html, "property", "og:image", post.hero_url);
    html = setMeta(html, "name", "twitter:image", post.hero_url);
  }
  html = html.replace("</head>", `<link rel="canonical" href="${url}" />\n${jsonLd(post)}\n</head>`);
  /* A function, so a "$" in the article is not read as a replacement pattern. */
  html = html.replace(/<main id="main">[\s\S]*<\/main>/, () => articleMain(post, readNext));
  return html;
}

function fallbackPage(post: BlogPost): string {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(post.title)} — Founders Doc</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.7;color:#1c1c1c}a{color:#b8860b}img{max-width:100%;border-radius:12px}</style>
</head><body><p><a href="/resources">← All articles</a></p><h1>${escapeHtml(post.title)}</h1>
${post.hero_url ? `<img src="${escapeHtml(post.hero_url)}" alt="${escapeHtml(post.hero_alt)}">` : ""}
${applyLinks(post.body_html, post.links ?? []).html}</body></html>`;
}

/** The blog's own "not found", in the same design where it can be. */
export async function renderMissing(origin: string): Promise<string> {
  try {
    const res = await fetch(new URL("/nda-vs-confidentiality-agreement.html", origin), { next: { revalidate: 3600 } });
    const tpl = res.ok ? await res.text() : "";
    if (/<main id="main">[\s\S]*<\/main>/.test(tpl)) {
      return tpl
        .replace(/<title>[\s\S]*?<\/title>/i, "<title>Article not found — Founders Doc</title>")
        .replace(/<main id="main">[\s\S]*<\/main>/, () =>
          `<main id="main"><div class="wrap" style="padding:120px 0 80px;text-align:center"><h1>We couldn’t find that article</h1><p style="margin-top:14px">It may have moved or been taken down.</p><p style="margin-top:24px"><a class="btn btn-gold" href="/resources">See all articles</a></p></div></main>`,
        );
    }
  } catch {
    /* fall through */
  }
  return `<!doctype html><title>Article not found — Founders Doc</title><p>We couldn’t find that article. <a href="/resources">See all articles</a></p>`;
}
