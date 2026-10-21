/**
 * The SEO scanner's rules: what a page of ours should have for Google to
 * understand it, and what to do when it does not. Pure — HTML in, findings
 * out — so the same rules run in the admin console and in tests.
 *
 * Every finding says, in plain English, what is wrong and how to fix it.
 * Three levels:
 *   problem  Google may not show the page properly (missing title, an error,
 *            a page told not to appear in Google);
 *   improve  it works, but it could do better in Google (title too long,
 *            no description, images without a description);
 *   idea     a small extra that can help.
 *
 * Free: it reads our own pages, as Google's crawler does. No outside service.
 */

export type Level = "problem" | "improve" | "idea";

export interface Finding {
  level: Level;
  code: string;
  /** What is wrong, in plain English. */
  what: string;
  /** How to fix it. */
  fix: string;
  /** The page it is about; empty for the whole site. */
  url: string;
}

export interface PageFacts {
  url: string;
  path: string;
  status: number;
  /** Where a redirect pointed, if the page redirected. */
  location: string;
  ms: number;
  bytes: number;
  title: string;
  description: string;
  h1: string[];
  canonical: string;
  noindex: boolean;
  lang: string;
  ogTitle: boolean;
  ogDescription: boolean;
  jsonLd: { count: number; invalid: number; types: string[] };
  imagesWithoutAlt: number;
  images: number;
  words: number;
  internalLinks: string[];
}

export interface PageResult extends PageFacts {
  score: number;
  findings: Finding[];
}

/* ── reading a page ──────────────────────────────────────────────────── */

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function attr(tag: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : "";
}

function metaContent(html: string, key: string, by: "name" | "property" = "name"): string | null {
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (attr(m[0], by).toLowerCase() === key) return attr(m[0], "content");
  }
  return null;
}

/** The facts about one page that the rules need. */
export function readPage(input: { url: string; origin: string; status: number; location?: string; ms: number; html: string }): PageFacts {
  const { url, origin, status, ms, html } = input;
  const u = new URL(url);
  const head = html.slice(0, Math.max(html.toLowerCase().indexOf("</head>"), 0) || html.length);

  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "");
  const description = metaContent(head, "description") ?? "";
  const robots = (metaContent(head, "robots") ?? "").toLowerCase();
  const canonicalTag = /<link\b[^>]*rel\s*=\s*["']?canonical["']?[^>]*>/i.exec(head)?.[0] ?? "";
  const lang = attr(/<html\b[^>]*>/i.exec(html)?.[0] ?? "", "lang");

  const h1: string[] = [];
  for (const m of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) h1.push(decode(m[1].replace(/<[^>]+>/g, " ")));

  let ldCount = 0;
  let ldInvalid = 0;
  const types = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    ldCount += 1;
    try {
      const data = JSON.parse(m[1]);
      const visit = (x: unknown) => {
        if (Array.isArray(x)) return x.forEach(visit);
        if (x && typeof x === "object") {
          const t = (x as Record<string, unknown>)["@type"];
          if (typeof t === "string") types.add(t);
          const g = (x as Record<string, unknown>)["@graph"];
          if (g) visit(g);
        }
      };
      visit(data);
    } catch {
      ldInvalid += 1;
    }
  }

  let images = 0;
  let imagesWithoutAlt = 0;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    images += 1;
    if (!/\balt\s*=/i.test(m[0])) imagesWithoutAlt += 1;
  }

  const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const words = decode(body).split(" ").filter((w) => /[a-z]/i.test(w)).length;

  const internal = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    try {
      const t = new URL(href, url);
      const site = new URL(origin);
      if (t.host !== site.host && t.host !== "foundersdoc.com" && t.host !== "www.foundersdoc.com") continue;
      internal.add(normalPath(t.pathname) + (t.search || ""));
    } catch {
      /* not a link */
    }
  }

  return {
    url,
    path: normalPath(u.pathname) + (u.search || ""),
    status,
    location: input.location ?? "",
    ms,
    bytes: html.length,
    title,
    description,
    h1,
    canonical: attr(canonicalTag, "href"),
    noindex: /noindex/.test(robots),
    lang,
    ogTitle: Boolean(metaContent(head, "og:title", "property")),
    ogDescription: Boolean(metaContent(head, "og:description", "property")),
    jsonLd: { count: ldCount, invalid: ldInvalid, types: Array.from(types) },
    imagesWithoutAlt,
    images,
    words,
    internalLinks: Array.from(internal),
  };
}

export function normalPath(p: string): string {
  const s = p.replace(/\.html$/, "").replace(/\/index$/, "/");
  return s.length > 1 ? s.replace(/\/+$/, "") : "/";
}

/* ── the rules for one page ──────────────────────────────────────────── */

/** Pages whose words are drawn in the browser (the drafting screen), so a low word count is expected. */
const APP_PAGE = /^\/(draft|pricing|signup|login)(\/|\?|$)/;

export function checkPage(p: PageFacts): Finding[] {
  const out: Finding[] = [];
  const add = (level: Level, code: string, what: string, fix: string) => out.push({ level, code, what, fix, url: p.url });

  if (p.status >= 400 || p.status === 0) {
    add("problem", "status", p.status ? `The page answers with an error (${p.status}), so Google cannot show it.` : "The page did not load in time.", "Open the page to check it works. If it was removed on purpose, take it out of the sitemap.");
    return out;
  }
  if (p.status >= 300) {
    add("improve", "redirect", `The page in the sitemap redirects to ${p.location || "another address"}.`, "List the final address in the sitemap instead, so Google does not have to follow the redirect.");
    return out;
  }
  if (p.noindex) add("problem", "noindex", "The page tells Google not to show it in search results (noindex), but it is listed in our sitemap.", "Remove the noindex tag, or take the page out of the sitemap if it should stay hidden.");

  if (!p.title) add("problem", "title-missing", "The page has no title, which is the blue headline Google shows.", "Add a title of 30–60 characters that says what the page offers, with the main search words first.");
  else if (p.title.length > 65) add("improve", "title-long", `The title is ${p.title.length} characters; Google cuts it off at about 60, so the end is hidden: "${p.title}".`, "Shorten it to 60 characters or fewer. Keep the main words at the start and the brand at the end.");
  else if (p.title.length < 25) add("improve", "title-short", `The title is only ${p.title.length} characters: "${p.title}".`, "Make it more descriptive (30–60 characters), e.g. what the page helps someone do.");

  if (!p.description) add("improve", "desc-missing", "The page has no description, the two lines Google shows under the title. Google will pick some text itself.", "Add a description of 70–155 characters that sums up the page and invites the click.");
  else if (p.description.length > 160) add("improve", "desc-long", `The description is ${p.description.length} characters; Google shows about 155.`, "Trim it to 155 characters or fewer, keeping the key point at the start.");
  else if (p.description.length < 70) add("improve", "desc-short", `The description is only ${p.description.length} characters.`, "Expand it to 70–155 characters so it says clearly what the reader gets.");

  if (p.h1.length === 0 && !APP_PAGE.test(p.path)) add("improve", "h1-missing", "The page has no main heading (H1), which tells Google what the page is about.", "Add one clear main heading at the top of the page.");
  else if (p.h1.length > 1) add("idea", "h1-many", `The page has ${p.h1.length} main headings (H1).`, "Keep one main heading and make the others sub-headings (H2).");

  if (!p.canonical) add("improve", "canonical-missing", "The page does not say which address is the main one (canonical), so Google may count copies separately.", "Add a canonical link pointing to the page's own clean address.");

  if (!p.ogTitle || !p.ogDescription) add("idea", "og-missing", "The page has no preview text for when it is shared on LinkedIn, WhatsApp or Slack.", "Add Open Graph title and description tags (they can match the page title and description).");

  if (p.jsonLd.invalid > 0) add("problem", "jsonld-invalid", "The page's structured data (the hidden summary for Google) is broken and cannot be read.", "Fix the JSON in the structured data block; Google's Rich Results Test shows where it breaks.");
  else if (p.jsonLd.count === 0 && (p.path === "/" || p.path.startsWith("/draft") || p.path === "/pricing")) add("idea", "jsonld-missing", "This key page has no structured data (the hidden summary that tells Google what we offer).", "Add structured data describing FD AI and its prices.");

  if (p.imagesWithoutAlt > 0) add("improve", "img-alt", `${p.imagesWithoutAlt} of ${p.images} images have no description (alt text), so Google and screen readers cannot tell what they show.`, "Add a short alt text to each image describing it, or alt=\"\" for purely decorative ones.");

  if (!p.lang) add("idea", "lang-missing", "The page does not say what language it is in.", "Add lang=\"en\" to the page's <html> tag.");

  if (!APP_PAGE.test(p.path) && p.words < 300) add("idea", "thin", `The page has only about ${p.words} words of text. Short pages often rank below fuller ones.`, "Add useful text people look for: a plain-English explanation, common questions with answers, an example.");

  if (p.ms > 3000) add("improve", "slow", `The page took ${(p.ms / 1000).toFixed(1)} seconds to answer. Slow pages rank lower and lose visitors.`, "Check what makes it slow (large images, heavy scripts, slow database calls).");
  if (p.bytes > 1_500_000) add("idea", "heavy", `The page is ${(p.bytes / 1_000_000).toFixed(1)} MB of HTML.`, "Move large inline styles, scripts or images out of the page so it loads faster on phones.");

  return out;
}

/** 100 minus 15 a problem, 5 an improvement, 1 an idea; never below 0. */
export function scoreOf(findings: Finding[]): number {
  const pts = findings.reduce((s, f) => s + (f.level === "problem" ? 15 : f.level === "improve" ? 5 : 1), 0);
  return Math.max(0, 100 - pts);
}

/* ── the rules across the whole site ─────────────────────────────────── */

export function checkSite(pages: PageFacts[]): Finding[] {
  const out: Finding[] = [];
  const ok = pages.filter((p) => p.status >= 200 && p.status < 300);

  const dupes = (key: (p: PageFacts) => string, label: string, code: string) => {
    const by = new Map<string, PageFacts[]>();
    for (const p of ok) {
      const k = key(p).toLowerCase();
      if (!k) continue;
      by.set(k, [...(by.get(k) ?? []), p]);
    }
    for (const [, list] of by) {
      if (list.length < 2) continue;
      out.push({
        level: "improve",
        code,
        what: `${list.length} pages share the same ${label}: ${list.map((p) => p.path).join(", ")}.`,
        fix: `Give each page its own ${label}, so Google can tell them apart and show the right one.`,
        url: "",
      });
    }
  };
  dupes((p) => p.title, "title", "dup-title");
  dupes((p) => p.description, "description", "dup-desc");

  /* Pages nothing else links to: Google finds them only through the sitemap. */
  const linked = new Set<string>();
  for (const p of ok) for (const l of p.internalLinks) if (l.split("?")[0] !== p.path.split("?")[0]) linked.add(l);
  const linkedPaths = new Set(Array.from(linked).map((l) => l.split("?")[0]));
  for (const p of ok) {
    if (p.path === "/") continue;
    if (!linked.has(p.path) && !linkedPaths.has(p.path.split("?")[0])) {
      out.push({
        level: "idea",
        code: "orphan",
        what: `No other page of ours links to ${p.path}, so visitors and Google rarely find it.`,
        fix: "Link to it from a related page (a blog article, the document list or the footer).",
        url: p.url,
      });
    }
  }
  return out;
}
