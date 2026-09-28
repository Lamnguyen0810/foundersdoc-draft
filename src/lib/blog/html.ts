/**
 * Blog articles written in the admin console: the text half.
 *
 * Pure string functions, no DOM and no server imports, so the admin preview
 * (in the browser) and the published page (on the server) run exactly the
 * same code: what the admin sees with the links in yellow is what goes live.
 *
 *   markdownToHtml  a .md or .txt article → HTML
 *   cleanHtml       any HTML (from Word via mammoth, or from Markdown) → the
 *                   small set of tags an article may use, nothing else
 *   splitArticle    the first heading becomes the title, the first
 *                   paragraph the summary under it
 *   applyLinks      the admin's chosen phrases → links, in text only
 *   suggestLinks    phrases worth linking that the article already uses
 */

export type LinkMode = "first" | "all";

export interface BlogLink {
  /** The words in the article, as the admin selected them. */
  phrase: string;
  href: string;
  /** Link the first time the words appear, or every time. */
  mode: LinkMode;
}

/** Where a link can go without typing a web address. */
export const LINK_TARGETS: { href: string; label: string }[] = [
  { href: "/draft?type=nda", label: "NDA generator" },
  { href: "/draft?type=term", label: "Term sheet generator" },
  { href: "/draft", label: "Choose a document (FD AI)" },
  { href: "/contact", label: "Book a consultation" },
  { href: "/fd-consult", label: "FD Consult" },
  { href: "/resources", label: "Blog home" },
];

export const CATEGORIES: { id: string; label: string }[] = [
  { id: "contracts", label: "Contracts" },
  { id: "fundraising", label: "Fundraising" },
  { id: "company", label: "Company setup" },
  { id: "hiring", label: "Hiring" },
  { id: "ai", label: "AI & law" },
];

export const CTAS: { id: string; label: string }[] = [
  { id: "nda", label: "Draft an NDA with FD AI" },
  { id: "term", label: "Draft a term sheet with FD AI" },
  { id: "draft", label: "Choose a document with FD AI" },
  { id: "none", label: "No call to action" },
];

/* Articles already on the site as files (next.config.ts RESOURCE_ARTICLES).
   A new post may not take one of their addresses, and they can be linked to. */
export const STATIC_ARTICLES: { slug: string; title: string }[] = [
  { slug: "what-is-a-term-sheet", title: "What Is a Term Sheet?" },
  { slug: "is-a-term-sheet-legally-binding", title: "Is a Term Sheet Legally Binding?" },
  { slug: "term-sheet-checklist", title: "Term Sheet Checklist" },
  { slug: "term-sheet-mistakes", title: "12 Common Term Sheet Mistakes" },
  { slug: "can-breaching-an-nda-be-expensive", title: "Can Breaching an NDA Be Expensive?" },
  { slug: "before-you-sign-an-nda", title: "Before You Sign an NDA" },
  { slug: "nda-vs-confidentiality-agreement", title: "NDA vs Confidentiality Agreement" },
];
export const RESERVED_SLUGS = new Set([...STATIC_ARTICLES.map((a) => a.slug), "all"]);

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, "&");
}

export function slugify(s: string): string {
  return decodeEntities(s)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function readMinutes(html: string): number {
  const words = textOf(html).split(" ").filter(Boolean).length;
  return Math.min(120, Math.max(1, Math.round(words / 220)));
}

/* ── Markdown ─────────────────────────────────────────────────────────── */

/**
 * The block of settings some writers put at the top of a Markdown file
 * (between two "---" lines): slug, meta_description, image_alt_text… Read,
 * and taken off the article.
 */
export function frontMatter(md: string): { data: Record<string, string>; rest: string } {
  const m = /^\uFEFF?---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(md);
  if (!m) return { data: {}, rest: md };
  const data: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv && kv[2].trim()) data[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { data, rest: md.slice(m[0].length) };
}

function safeHref(raw: string): string | null {
  /* Writers often link other articles as /blog/<slug>; on this site they
     live at /resources/<slug>/. */
  const href = raw.trim().replace(/^\/blog\/([a-z0-9-]+)\/?$/i, "/resources/$1/");
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(href) && !/^\/\//.test(href)) return href;
  return null;
}

function inline(md: string): string {
  let s = escapeHtml(md);
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, text: string, url: string) => {
    const href = safeHref(decodeEntities(url));
    return href ? `<a href="${escapeHtml(href)}">${text}</a>` : text;
  });
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a?: string, b?: string) => `<strong>${a ?? b}</strong>`);
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  return s;
}

/** Markdown (or plain text) → HTML. Headings, paragraphs, lists, quotes,
 *  tables, rules, bold, italics and links: what an article needs. */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" ").trim())}</p>`);
    para = [];
  };

  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(t);
    if (h) {
      flush();
      const level = Math.min(4, h[1].length);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flush();
      out.push("<hr>");
      continue;
    }
    if (/^>\s?/.test(t)) {
      flush();
      const q: string[] = [];
      while (k < lines.length && /^\s*>\s?/.test(lines[k])) q.push(lines[k++].replace(/^\s*>\s?/, ""));
      k--;
      out.push(`<blockquote><p>${inline(q.join(" "))}</p></blockquote>`);
      continue;
    }
    if (/^\|.*\|$/.test(t) && k + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[k + 1].trim())) {
      flush();
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => inline(c.trim()));
      const head = cells(t);
      k += 2;
      const body: string[][] = [];
      while (k < lines.length && /^\|.*\|$/.test(lines[k].trim())) body.push(cells(lines[k++]));
      k--;
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }
    const ul = /^[-*+•]\s+/;
    const ol = /^\d+[.)]\s+/;
    if (ul.test(t) || ol.test(t)) {
      flush();
      const ordered = ol.test(t);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (k < lines.length) {
        const lt = lines[k].trim();
        if (re.test(lt)) items.push(lt.replace(re, ""));
        else if (lt && items.length && /^\s{2,}/.test(lines[k])) items[items.length - 1] += ` ${lt}`;
        else break;
        k++;
      }
      k--;
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</${tag}>`);
      continue;
    }
    para.push(t);
  }
  flush();
  return out.join("\n");
}

/* ── Cleaning ─────────────────────────────────────────────────────────── */

const RENAME: Record<string, string> = { b: "strong", i: "em", h1: "h2", h5: "h4", h6: "h4" };
const ALLOWED = new Set([
  "p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "a", "br", "hr",
  "blockquote", "table", "thead", "tbody", "tr", "th", "td",
]);
const VOID = new Set(["br", "hr"]);

/**
 * Any HTML → an article's HTML. Scripts, styles, images, classes and
 * inline styles go; the structure stays. Links keep a safe href and nothing
 * else. Headings get ids so they can be linked to.
 */
export function cleanHtml(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|iframe|object|embed|svg|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed)\b[^>]*\/?>/gi, "");

  const out: string[] = [];
  const open: string[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|(<)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[4] !== undefined || m[5] !== undefined) {
      const text = m[4] ?? "&lt;";
      out.push(escapeHtml(decodeEntities(text)));
      continue;
    }
    const closing = m[1] === "/";
    const raw = m[2].toLowerCase();
    const tag = RENAME[raw] ?? raw;
    if (!ALLOWED.has(tag)) continue;
    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at === -1) continue;
      while (open.length > at) out.push(`</${open.pop()}>`);
      continue;
    }
    if (VOID.has(tag)) {
      out.push(`<${tag}>`);
      continue;
    }
    let attrs = "";
    if (tag === "a") {
      const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
      const safe = href ? safeHref(decodeEntities(href[2] ?? href[3] ?? href[4] ?? "")) : null;
      if (!safe) {
        open.push("__drop_a");
        continue;
      }
      attrs = ` href="${escapeHtml(safe)}"`;
    }
    if (tag === "th" || tag === "td") {
      const span = /\b(colspan|rowspan)\s*=\s*["']?(\d{1,2})/gi;
      let sm: RegExpExecArray | null;
      while ((sm = span.exec(m[3]))) attrs += ` ${sm[1].toLowerCase()}="${sm[2]}"`;
    }
    out.push(`<${tag}${attrs}>`);
    open.push(tag);
  }
  while (open.length) {
    const t = open.pop()!;
    if (t !== "__drop_a") out.push(`</${t}>`);
  }
  s = out.join("");
  /* An <a> with no safe href was opened as "__drop_a": its closing tag was
     never written, and neither was the opening one. */
  s = s.replace(/<\/__drop_a>/g, "");

  /* Empty paragraphs and list items from Word. */
  s = s.replace(/<(p|li|h2|h3|h4)>(\s|&nbsp;|<br>)*<\/\1>/g, "");
  return addHeadingIds(s.replace(/\n{3,}/g, "\n\n").trim());
}

export function addHeadingIds(html: string): string {
  const used = new Set<string>();
  return html.replace(/<(h2|h3)>([\s\S]*?)<\/\1>/g, (_, tag: string, inner: string) => {
    let id = slugify(textOf(inner)) || "section";
    let n = 2;
    const base = id;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return `<${tag} id="${id}">${inner}</${tag}>`;
  });
}

/**
 * The title is the article's first heading; they come out of the body so
 * they are not shown twice. A first paragraph that opens in bold is the
 * "In brief" box, as on the articles already on the site; otherwise a short
 * first paragraph is the summary under the title.
 */
export function splitArticle(html: string): { title: string; deck: string; summary: string; body: string } {
  let body = html.trim();
  let title = "";
  const h = /^\s*<(h2|h3)[^>]*>([\s\S]*?)<\/\1>/.exec(body);
  if (h) {
    title = textOf(h[2]);
    body = body.slice(h[0].length).trim();
  } else {
    /* Word documents often open with a bold line rather than a heading. */
    const p = /^\s*<p>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/.exec(body);
    if (p && textOf(p[1]).length <= 160) {
      title = textOf(p[1]);
      body = body.slice(p[0].length).trim();
    }
  }
  let deck = "";
  let summary = "";
  const first = /^\s*<p>([\s\S]*?)<\/p>/.exec(body);
  if (first) {
    const t = textOf(first[1]);
    if (/^\s*<strong>/.test(first[1]) && t.length >= 40 && t.length <= 800) {
      summary = t;
      body = body.slice(first[0].length).trim();
    } else if (t.length >= 30 && t.length <= 320) {
      deck = t;
      body = body.slice(first[0].length).trim();
    }
  }
  return { title, deck, summary, body };
}

/* ── Links ────────────────────────────────────────────────────────────── */

function phrasePattern(phrase: string): string {
  return escapeHtml(phrase.trim())
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/['’]|&#39;/g, "(?:'|’|&#39;|&#x27;)")
    .replace(/\s+/g, "\\s+");
}

/**
 * Turns the chosen phrases into links, in running text only: never inside a
 * heading, never inside a link that is already there. Longer phrases win
 * where two overlap ("non-disclosure agreement" before "agreement").
 * Returns the HTML and the phrases that were not found, so the admin can be
 * told rather than left wondering why a link is missing.
 */
export function applyLinks(html: string, links: BlogLink[]): { html: string; missing: string[] } {
  const valid = links
    .filter((l) => l.phrase.trim().length >= 2 && safeHref(l.href))
    .sort((a, b) => b.phrase.trim().length - a.phrase.trim().length);
  if (!valid.length) return { html, missing: [] };

  const pattern = new RegExp(
    /* Whole words only, and not half of a hyphenated word: "binding" is not
       linked inside "non-binding". */
    `(?<![A-Za-z0-9-])(${valid.map((l) => phrasePattern(l.phrase)).join("|")})(?![A-Za-z0-9]|-[A-Za-z0-9])`,
    "gi",
  );
  const matchers = valid.map((l) => new RegExp(`^${phrasePattern(l.phrase)}$`, "i"));
  const used = valid.map(() => 0);

  let inLink = 0;
  let inHeading = 0;
  const parts = html.split(/(<[^>]+>)/g);
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    if (!part) continue;
    if (part.startsWith("<")) {
      if (/^<a\b/i.test(part)) inLink++;
      else if (/^<\/a>/i.test(part)) inLink = Math.max(0, inLink - 1);
      else if (/^<h[1-6]\b/i.test(part)) inHeading++;
      else if (/^<\/h[1-6]>/i.test(part)) inHeading = Math.max(0, inHeading - 1);
      continue;
    }
    if (inLink || inHeading) continue;
    parts[k] = part.replace(pattern, (match: string) => {
      const i = matchers.findIndex((r) => r.test(match));
      if (i === -1) return match;
      if (valid[i].mode === "first" && used[i] > 0) return match;
      used[i]++;
      return `<a href="${escapeHtml(valid[i].href)}">${match}</a>`;
    });
  }
  return {
    html: parts.join(""),
    missing: valid.filter((_, i) => used[i] === 0).map((l) => l.phrase),
  };
}

/** Phrases the article already uses that the site links as a rule. */
export function suggestLinks(html: string): BlogLink[] {
  const rules: { phrase: string; href: string }[] = [
    { phrase: "non-disclosure agreement", href: "/draft?type=nda" },
    { phrase: "NDA", href: "/draft?type=nda" },
    { phrase: "confidentiality agreement", href: "/draft?type=nda" },
    { phrase: "term sheet", href: "/draft?type=term" },
    { phrase: "heads of terms", href: "/draft?type=term" },
    { phrase: "letter of intent", href: "/draft?type=term" },
    { phrase: "FD AI", href: "/draft" },
    { phrase: "consultation", href: "/contact" },
  ];
  /* Only what would actually be linked: in running text, not in a heading. */
  return rules
    .map((r) => ({ ...r, mode: "first" as LinkMode }))
    .filter((r) => applyLinks(html, [r]).missing.length === 0);
}
