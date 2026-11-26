import { PDFDocument } from "pdf-lib";
import type { PdfInfo } from "./boxes";

/**
 * Supplemental documents (0296, Rachel): attach other PDFs to the main document and choose WHERE each goes,
 * not only at the end: "after page 5", or "after the page that says Appendix B". The result is one PDF, so the
 * signers can get boxes on the supplemental pages too, and the signed copy comes out in the right order.
 * Pure (pdf-lib, no network): runs in the browser before the Fields step, and in tests.
 */

export type Place = { mode: "end" } | { mode: "start" } | { mode: "page"; page: number } | { mode: "text"; text: string; page: number | null };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** every page whose text contains the words (case, spaces and curly quotes ignored), e.g. "Appendix B" */
export function findPages(info: Pick<PdfInfo, "texts" | "pages">, words: string): number[] {
  const q = norm(words);
  if (q.length < 2) return [];
  const byPage = new Map<number, string>();
  for (const t of info.texts) byPage.set(t.page, `${byPage.get(t.page) ?? ""} ${t.str}`);
  const out: number[] = [];
  for (let p = 1; p <= info.pages.length; p++) if (norm(byPage.get(p) ?? "").includes(q)) out.push(p);
  return out;
}

/**
 * The page the words are a HEADING on: a line that is just those words, or starts with them (e.g. "APPENDIX A" or
 * "Appendix B: Shareholder's Resolutions"). A resolution usually names "Appendix A" in its text on page 1 too
 * ("attached hereto as Appendix A"), and the cover page that says only "APPENDIX A" comes later: that is where
 * the attachment goes. No heading: the last page that mentions the words.
 */
export function bestPage(info: Pick<PdfInfo, "texts" | "pages">, words: string): number | null {
  const all = findPages(info, words);
  if (!all.length) return null;
  const q = norm(words);
  for (const p of all)
    if (
      linesOf(info, p).some((l) => {
        const t = norm(l);
        return t === q || (t.startsWith(q) && t.length <= q.length + 40 && !/[a-z]/.test(t.charAt(q.length)));
      })
    )
      return p;
  return all[all.length - 1]!;
}

/** a page's text as lines, top to bottom (pieces on the same baseline joined) */
export function linesOf(info: Pick<PdfInfo, "texts">, page: number): string[] {
  const items = info.texts.filter((t) => t.page === page).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Array<{ y: number; h: number; text: string }> = [];
  for (const t of items) {
    const l = lines.find((x) => Math.abs(x.y - t.y) < Math.max(t.h, x.h, 0.004) * 0.6);
    if (l) l.text += ` ${t.str}`;
    else lines.push({ y: t.y, h: t.h, text: t.str });
  }
  return lines.map((l) => l.text.replace(/\s+/g, " ").trim());
}

/**
 * The attachment cover pages of a document, in order: a page with a heading line like "APPENDIX A", "Annex 1",
 * "Schedule 2: Terms" or "Exhibit B" (not a sentence that mentions one). A newly added supplemental document is
 * suggested for the first one still free, so the Constitution lands on Appendix A and the resolution on Appendix B.
 */
export function attachmentPages(info: Pick<PdfInfo, "texts" | "pages">): Array<{ page: number; heading: string }> {
  const out: Array<{ page: number; heading: string }> = [];
  const seen = new Set<string>();
  for (let p = 1; p <= info.pages.length; p++) {
    for (const l of linesOf(info, p).slice(0, 6)) {
      const m = l.match(/^(appendix|annex|annexure|schedule|exhibit|attachment|enclosure)\s+([A-Z]{1,2}|\d{1,2}|[IVX]{1,4})\b(?![a-z])/i);
      if (!m || l.length > 80) continue;
      const heading = `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}`;
      if (seen.has(heading)) continue;
      seen.add(heading);
      out.push({ page: p, heading });
      break;
    }
  }
  return out;
}

/** how many pages of the main document come before the inserted one (0 = at the start); null = cannot be placed yet */
export function afterPage(place: Place, pages: number): number | null {
  if (place.mode === "end") return pages;
  if (place.mode === "start") return 0;
  const p = place.page;
  if (p === null || !Number.isInteger(p) || p < 0 || p > pages) return null;
  return p;
}

/** "after page 5" · "after “Appendix B” (page 9)" · "at the end" */
export function placeText(place: Place, pages: number): string {
  if (place.mode === "end") return "at the end";
  if (place.mode === "start") return "at the start";
  if (place.mode === "page") return place.page >= pages ? "at the end" : place.page === 0 ? "at the start" : `after page ${place.page}`;
  return place.page ? `after “${place.text.trim()}” (page ${place.page})` : `after “${place.text.trim()}” (not found)`;
}

/** where a document goes inside another supplemental document: "after page 3 of “Constitution”" (0300) */
export function insideText(words: string | null, after: number, pages: number, parent: string): string {
  const of = `“${parent.trim() || "the document"}”`;
  if (words?.trim()) return `after “${words.trim()}” (page ${after} of ${of})`;
  if (after <= 0) return `at the start of ${of}`;
  if (after >= pages) return `at the end of ${of}`;
  return `after page ${after} of ${of}`;
}

export interface Insert {
  name: string;
  bytes: Uint8Array;
  place: Place;
}

/**
 * A supplemental document, placed after a page of the main document (parent null) or after a page of another
 * supplemental document (parent = its key): a document inside a document, e.g. a schedule inside the Constitution
 * (0300). Page numbers are the parent's own, so moving one never moves where another goes.
 */
export interface Part {
  key: string;
  name: string;
  bytes: Uint8Array;
  parent: string | null;
  /** pages of the parent before it (0 = at its start) */
  after: number;
  /** the words it was placed by ("Appendix A"), for the audit trail */
  words?: string | null;
}

/** the final order, page by page: [source, page] where source is "main" or a part's key */
export function pageOrder(mainPages: number, parts: Array<Pick<Part, "key" | "parent" | "after"> & { pages: number }>): Array<{ src: string; page: number }> {
  const out: Array<{ src: string; page: number }> = [];
  const seen = new Set<string>();
  const walk = (src: string, parent: string | null, pages: number) => {
    const put = (g: number) => {
      for (const p of parts)
        if (p.parent === parent && Math.min(Math.max(p.after, 0), pages) === g && !seen.has(p.key)) {
          seen.add(p.key);
          walk(p.key, p.key, p.pages);
        }
    };
    put(0);
    for (let i = 1; i <= pages; i++) {
      out.push({ src, page: i });
      put(i);
    }
  };
  walk("main", null, mainPages);
  return out;
}

/** The main PDF with every part in its place, parts inside parts too. Returns the PDF and a line per part. */
export async function assemble(main: Uint8Array, parts: Part[]): Promise<{ bytes: Uint8Array; pages: number; lines: string[] }> {
  const base = await PDFDocument.load(main);
  const n = base.getPageCount();
  const docs = new Map<string, PDFDocument>([["main", base]]);
  for (const it of parts) {
    try {
      docs.set(it.key, await PDFDocument.load(it.bytes));
    } catch {
      throw new Error(`“${it.name}” could not be read. If it has a password, remove it and try again.`);
    }
  }
  const pagesOf = (key: string | null) => docs.get(key ?? "main")!.getPageCount();
  const nameOf = (key: string) => parts.find((x) => x.key === key)?.name ?? "";
  const lines: string[] = [];
  for (const it of parts) {
    if (it.parent !== null && (!docs.has(it.parent) || it.parent === it.key)) throw new Error(`Choose where “${it.name}” goes.`);
    const pp = pagesOf(it.parent);
    if (!Number.isInteger(it.after) || it.after < 0 || it.after > pp) throw new Error(`Choose where “${it.name}” goes.`);
    const k = pagesOf(it.key);
    const where =
      it.parent === null
        ? placeText(it.words?.trim() ? { mode: "text", text: it.words, page: it.after } : it.after >= n ? { mode: "end" } : it.after === 0 ? { mode: "start" } : { mode: "page", page: it.after }, n)
        : insideText(it.words ?? null, it.after, pp, nameOf(it.parent));
    lines.push(`${it.name} (${k} ${k === 1 ? "page" : "pages"}) ${where}`);
  }
  const order = pageOrder(
    n,
    parts.map((p) => ({ key: p.key, parent: p.parent, after: p.after, pages: pagesOf(p.key) })),
  );
  const placed = new Set(order.map((o) => o.src));
  const lost = parts.find((p) => !placed.has(p.key) && pagesOf(p.key) > 0);
  /* a document inside itself (a loop) is never reached from the main document */
  if (lost) throw new Error(`Choose where “${lost.name}” goes.`);
  const out = await PDFDocument.create();
  const copied = new Map<string, Awaited<ReturnType<PDFDocument["copyPages"]>>>();
  for (const [key, d] of docs) copied.set(key, await out.copyPages(d, d.getPageIndices()));
  for (const o of order) out.addPage(copied.get(o.src)![o.page - 1]!);
  const bytes = await out.save();
  return { bytes, pages: out.getPageCount(), lines };
}

/**
 * The main PDF with each supplemental PDF inserted after its page of the MAIN document (page numbers are read on
 * the document as uploaded, so adding one never moves where the next goes). Two at the same place keep their order.
 * Returns the new PDF, and a line per document for the audit trail.
 */
export async function insertPdfs(main: Uint8Array, items: Insert[]): Promise<{ bytes: Uint8Array; pages: number; lines: string[] }> {
  const n = (await PDFDocument.load(main)).getPageCount();
  const parts: Part[] = items.map((it, i) => {
    const at = afterPage(it.place, n);
    if (at === null) throw new Error(`Choose where “${it.name}” goes.`);
    return { key: `p${i}`, name: it.name, bytes: it.bytes, parent: null, after: at, words: it.place.mode === "text" ? it.place.text : null };
  });
  return assemble(main, parts);
}
