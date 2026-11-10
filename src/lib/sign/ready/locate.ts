import type { Issue, Line, Mark } from "./rules";

/**
 * Signing-ready check (0204): put each finding on the page, so the report can
 * show the whole document with the problems marked where they are.
 *
 * Lines carry their box on the page (read.ts, from the PDF's text positions; a
 * Word file is first set as a PDF the same way FD Sign does). A finding is found
 * by its words: the line holding its exact hit (e.g. "[Party name]") that shares
 * most words with the quoted context, and the mark covers just those words. An AI
 * finding has only its quote, so the mark covers the line it is on. Findings about
 * the whole file (tracked changes, a password) have no mark. Pure, no server code.
 */

const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(norm(s).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

/* rough glyph widths (Helvetica/Arial, in ems), so a word inside a run is marked
   where it really sits rather than by character count */
function glyph(c: string): number {
  if (c === " ") return 0.28;
  if ("iljI.,;:'|!".includes(c)) return 0.25;
  if ("ftr[]()-/\\\"*".includes(c)) return 0.34;
  if ("mwMW".includes(c)) return c === c.toUpperCase() ? 0.9 : 0.83;
  if (/[A-Z]/.test(c)) return 0.69;
  if (/[0-9$]/.test(c)) return 0.56;
  return 0.52;
}
const span = (t: string) => [...t].reduce((n, c) => n + glyph(c), 0);

/** x on the page (fraction) of a character position in the line */
function xAt(line: Line, at: number): number {
  const r = line.rect!;
  const t = line.text;
  const segs = line.segs;
  if (segs?.length) {
    let g = segs[0];
    for (const s of segs) if (s.at <= at) g = s;
    const into = Math.min(Math.max(0, at - g.at), g.n);
    const whole = span(t.slice(g.at, g.at + g.n));
    return g.x + g.w * (whole ? span(t.slice(g.at, g.at + into)) / whole : 0);
  }
  const whole = span(t);
  return r.x + r.w * (whole ? span(t.slice(0, at)) / whole : 0);
}

function box(line: Line, at: number, len: number): Mark | undefined {
  if (!line.rect || !line.page) return undefined;
  const r = line.rect;
  if (at < 0) return { page: line.page, x: r.x, y: r.y, w: r.w, h: r.h };
  const x = xAt(line, at);
  const end = xAt(line, at + len);
  const w = Math.max(end - x, 0.02);
  return { page: line.page, x: Math.max(0, x - 0.002), y: r.y, w: Math.min(w + 0.004, 1 - x), h: r.h };
}

export function locate(issues: Issue[], lines: Line[]): Issue[] {
  const placed = lines.filter((l) => l.rect && l.page);
  if (!placed.length) return issues;
  const index = placed.map((l) => ({ l, t: norm(l.text), w: words(l.text) }));
  return issues.map((i) => {
    if (i.mark || !i.evidence) return i;
    const ctx = norm(i.evidence.replace(/^…|…$/g, ""));
    const cw = words(ctx);
    const hit = i.hit ? norm(i.hit) : "";
    let best: { l: Line; score: number; at: number } | null = null;
    for (const c of index) {
      const at = hit ? c.t.indexOf(hit) : -1;
      if (hit && at < 0) continue;
      let score = overlap(cw, c.w);
      if (!hit && c.t.length > 8 && ctx.includes(c.t.slice(0, Math.min(40, c.t.length)))) score += 50;
      if (!best || score > best.score) best = { l: c.l, score, at };
    }
    if (!best || (!hit && best.score < 3)) return i;
    const mark = box(best.l, best.at, hit ? hit.length : 0);
    return mark ? { ...i, mark } : i;
  });
}
