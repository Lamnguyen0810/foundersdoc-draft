import "server-only";

/**
 * The SEO scanner: reads our own website the way Google's crawler does and
 * says what to fix. Free — it only fetches our own pages.
 *
 *   1. Reads sitemap.xml for the list of pages, plus robots.txt and llms.txt.
 *   2. Opens every page (a few at a time) and checks it (checks.ts).
 *   3. Checks across pages: duplicate titles and descriptions, pages nothing
 *      links to, links of ours that lead nowhere.
 *   4. Looks for gaps: documents FD AI drafts that have no guide article, and
 *      searches people make that we have no page for.
 *
 * It runs when the SEO tab in the admin console is opened, and again on
 * "Scan again". Nothing is stored; nothing on the site is changed.
 */

import { STATIC_ARTICLES } from "@/lib/blog/html";
import { TEMPLATES } from "@/lib/templates/data";
import { publishedCards } from "@/lib/blog/store";
import { draftHref } from "@/lib/doc-links";
import { loadDocTypes } from "@/lib/doctypes.server";
import { checkPage, checkSite, normalPath, readPage, scoreOf, type Finding, type PageResult } from "./checks";

export interface Opportunity {
  kind: "guide" | "country-page";
  title: string;
  why: string;
  action: string;
  link?: string;
}

export interface ScanReport {
  scannedAt: string;
  origin: string;
  score: number;
  counts: { pages: number; problem: number; improve: number; idea: number };
  site: Finding[];
  pages: PageResult[];
  opportunities: Opportunity[];
  truncated: boolean;
}

const MAX_PAGES = 120;
const TIMEOUT_MS = 12_000;
const UA = "FD-AI-SEO-Scanner/1.0 (+https://foundersdoc.com)";

async function get(url: string, redirect: RequestRedirect = "manual") {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect, headers: { "user-agent": UA, accept: "text/html,application/xml,text/plain" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    const text = res.status >= 300 && res.status < 400 ? "" : await res.text();
    return { status: res.status, location: res.headers.get("location") ?? "", text, ms: Date.now() - t0 };
  } catch {
    return { status: 0, location: "", text: "", ms: Date.now() - t0 };
  }
}

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/** The sitemap's addresses, moved onto the origin being scanned (so a preview scans itself). */
function sitemapUrls(xml: string, origin: string): string[] {
  const urls = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&"));
      urls.add(new URL(u.pathname + u.search, origin).toString());
    } catch {
      /* skip */
    }
  }
  return Array.from(urls);
}

/* Words that show an article is about a document. */
const DOC_WORDS: Record<string, string[]> = {
  nda: ["nda", "non-disclosure", "confidentiality"],
  term: ["term sheet"],
  employment: ["employment"],
  contractor: ["contractor", "freelance"],
  cofounder: ["co-founder", "cofounder"],
  sha: ["shareholders"],
  spa: ["share purchase"],
  ssa: ["share subscription"],
  ia: ["investment agreement"],
  services: ["services agreement"],
  loan: ["loan agreement"],
  cln: ["convertible"],
  ipaa: ["ip assignment", "intellectual property"],
  jva: ["joint venture"],
};

export async function scanSite(origin: string): Promise<ScanReport> {
  const site: Finding[] = [];
  const siteFinding = (level: Finding["level"], code: string, what: string, fix: string) => site.push({ level, code, what, fix, url: "" });

  /* 1. The lists Google reads first. */
  const [sitemap, robots, llms] = await Promise.all([get(`${origin}/sitemap.xml`, "follow"), get(`${origin}/robots.txt`, "follow"), get(`${origin}/llms.txt`, "follow")]);
  if (sitemap.status !== 200) siteFinding("problem", "sitemap", "The sitemap (the list of our pages for Google) could not be read.", "Check https://foundersdoc.com/sitemap.xml opens; it is made by src/app/sitemap.ts.");
  if (robots.status !== 200) siteFinding("problem", "robots", "robots.txt (the rules for search engines) could not be read.", "Check https://foundersdoc.com/robots.txt opens; it is made by src/app/robots.ts.");
  else {
    if (/^\s*disallow:\s*\/\s*$/im.test(robots.text) && /user-agent:\s*\*/i.test(robots.text)) siteFinding("problem", "robots-block", "robots.txt blocks search engines from the whole site.", "Remove the 'Disallow: /' line for all search engines.");
    if (!/sitemap:/i.test(robots.text)) siteFinding("idea", "robots-sitemap", "robots.txt does not point to the sitemap.", "Add a 'Sitemap: https://foundersdoc.com/sitemap.xml' line.");
  }
  if (llms.status !== 200) siteFinding("idea", "llms", "llms.txt (the summary for AI assistants such as ChatGPT) could not be read.", "Check https://foundersdoc.com/llms.txt opens.");

  let urls = sitemapUrls(sitemap.text, origin);
  if (!urls.length) urls = [`${origin}/`, `${origin}/draft`];
  const truncated = urls.length > MAX_PAGES;
  urls = urls.slice(0, MAX_PAGES);

  /* 2. Every page, six at a time. */
  const facts = await inBatches(urls, 6, async (url) => {
    const r = await get(url);
    return readPage({ url, origin, status: r.status, location: r.location, ms: r.ms, html: r.text });
  });
  const pages: PageResult[] = facts.map((f) => {
    const findings = checkPage(f);
    return { ...f, findings, score: scoreOf(findings) };
  });

  /* 3. Across pages. */
  const across = checkSite(facts);
  for (const f of across) {
    const page = f.url ? pages.find((p) => p.url === f.url) : undefined;
    if (page) {
      page.findings.push(f);
      page.score = scoreOf(page.findings);
    } else site.push(f);
  }

  /* Links of ours that lead nowhere (checked once each, at most 60). */
  const known = new Set(pages.map((p) => p.path));
  const targets = new Set<string>();
  for (const p of pages) for (const l of p.internalLinks) if (!known.has(l) && !/^\/(api|auth|login|signup|billing|history|usage|settings|admin|_next)(\/|$)/.test(l)) targets.add(l);
  const checked = await inBatches(Array.from(targets).slice(0, 60), 6, async (path) => ({ path, r: await get(new URL(path, origin).toString(), "follow") }));
  for (const { path, r } of checked) {
    if (r.status === 404 || r.status >= 500 || r.status === 0) {
      const from = pages.filter((p) => p.internalLinks.includes(path)).map((p) => p.path);
      siteFinding("problem", "broken-link", `A link to ${path} leads to ${r.status ? `an error (${r.status})` : "nothing (it did not load)"}. It is on: ${from.slice(0, 5).join(", ")}${from.length > 5 ? "…" : ""}.`, "Fix or remove the link, or put the page back.");
    }
  }

  /* 4. Gaps: what people search for that we have no page for. */
  const opportunities: Opportunity[] = [];
  try {
    const [{ docTypes }, cards] = await Promise.all([loadDocTypes(), publishedCards().catch(() => [])]);
    /* A guide = a blog article or a template page (lib/templates) about the document. */
    const titles = [...STATIC_ARTICLES.map((a) => a.title), ...cards.map((c) => c.title), ...TEMPLATES.map((t) => t.name)].map((t) => t.toLowerCase());
    for (const d of docTypes.filter((x) => x.slug !== "cofounder")) {
      const words = DOC_WORDS[d.slug] ?? [d.label.toLowerCase()];
      const guides = titles.filter((t) => words.some((w) => t.includes(w))).length;
      if (guides === 0) {
        opportunities.push({
          kind: "guide",
          title: `Write a guide: "What is ${/^[aeiou]/i.test(d.label) ? "an" : "a"} ${d.label}?"`,
          why: `We draft the ${d.label} but have no article explaining it. People search for what a document is before they draft one.`,
          action: `A short plain-English article (what it is, when you need one, what goes in it, common questions) with a "Draft it free" link. Add it in the Blog tab.`,
          link: draftHref(d.slug),
        });
      }
    }
    const pagePaths = Array.from(known);
    if (!pagePaths.some((p) => p.startsWith("/templates/"))) {
      opportunities.push({
        kind: "country-page",
        title: "Add pages for each document in each country",
        why: 'People search "NDA template Singapore" or "employment contract UK". We have no page for these searches, so Google shows other sites.',
        action: "One page per document and country (e.g. /templates/nda/singapore) with the local law details FD AI already holds and a \"Draft it free\" button. About 70 pages.",
      });
    }
  } catch {
    /* the gaps are a bonus; the scan stands without them */
  }

  const all = [...site, ...pages.flatMap((p) => p.findings)];
  const counts = {
    pages: pages.length,
    problem: all.filter((f) => f.level === "problem").length,
    improve: all.filter((f) => f.level === "improve").length,
    idea: all.filter((f) => f.level === "idea").length,
  };
  const pageAvg = pages.length ? pages.reduce((s, p) => s + p.score, 0) / pages.length : 0;
  /* Site-wide findings count once per kind (ten broken links are one job), at most 30 points. */
  const kinds = new Map<string, Finding["level"]>();
  for (const f of site) kinds.set(f.code, f.level);
  const sitePenalty = Math.min(30, Array.from(kinds.values()).reduce((s, l) => s + (l === "problem" ? 8 : l === "improve" ? 3 : 0), 0));
  const score = Math.max(0, Math.round(pageAvg - sitePenalty));

  pages.sort((a, b) => a.score - b.score || a.path.localeCompare(b.path));
  return { scannedAt: new Date().toISOString(), origin, score, counts, site, pages, opportunities, truncated };
}

export { normalPath };
