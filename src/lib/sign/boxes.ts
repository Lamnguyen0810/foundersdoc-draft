import type { PDFDocumentProxy } from "pdfjs-dist";

/* Signature boxes: where each signer signs, on the line. Positions are page
   fractions from the top-left (same as public.sign_fields). Pure code: used by
   the admin page, the signer's page and the server (old envelopes with no
   boxes get them placed the same way). */

/** A piece of text on a page, in page fractions (top-left origin). */
export interface PdfText {
  page: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PdfInfo {
  pages: Array<{ w: number; h: number }>;
  texts: PdfText[];
}

/** Page sizes and every piece of text with its position (pdf.js document, browser or server). */
export async function readPdf(doc: PDFDocumentProxy): Promise<PdfInfo> {
  const pages: PdfInfo["pages"] = [];
  const texts: PdfText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ w: vp.width, h: vp.height });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [a, b, , , e, f] = it.transform as number[];
      const size = it.height || Math.hypot(a, b) || 10;
      const [vx, vy] = vp.convertToViewportPoint(e, f);
      texts.push({ page: p, str: it.str.trim(), x: vx / vp.width, y: (vy - size) / vp.height, w: it.width / vp.width, h: size / vp.height });
    }
  }
  return { pages, texts };
}

export type BoxKind = "signature" | "date" | "name";
export interface Box {
  id: string;
  position: number; // 1 = first signer (Director), 2+ = the others in order
  kind: BoxKind;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const COLOURS = ["#b8862b", "#2f6fdb", "#1f9d6b", "#c2410c", "#7c3aed", "#be185d", "#0e7490", "#4d7c0f"];
export const colour = (position: number) => COLOURS[(position - 1) % COLOURS.length];

let seq = 0;
export const boxId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Default box size in points, turned into page fractions. */
export function sized(kind: BoxKind, page: { w: number; h: number }) {
  const pt = kind === "signature" ? { w: 190, h: 44 } : { w: 120, h: 18 };
  return { w: Math.min(pt.w / page.w, 0.9), h: Math.min(pt.h / page.h, 0.3) };
}

export const clamp = (b: Box): Box => {
  const w = Math.min(Math.max(b.w, 0.02), 1);
  const h = Math.min(Math.max(b.h, 0.01), 1);
  return { ...b, w, h, x: Math.min(Math.max(b.x, 0), 1 - w), y: Math.min(Math.max(b.y, 0), 1 - h) };
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** The label printed under a signer's line ("Director", "Option Holder", their name). */
function findLabel(info: PdfInfo, signer: { name: string; role: string }, first: boolean, taken: Set<PdfText>, preferName = false): PdfText | null {
  const role = norm(signer.role);
  const name = norm(signer.name);
  const tries: Array<(t: string) => boolean> = [];
  if (role) tries.push((t) => t === role, (t) => t.startsWith(role) && t.length < role.length + 25);
  /* FD Sign for everyone: the person's own name beats the generic "Director" / "Signed by" lines */
  if (preferName && name.length > 3) tries.push((t) => t.includes(name) && t.length < name.length + 30);
  if (first) tries.push((t) => /^(director|for and on behalf|authori[sz]ed signatory|signed by)/.test(t));
  if (name.length > 3) tries.push((t) => t.includes(name) && t.length < name.length + 30);
  if (!first) tries.push((t) => /^(option holder|holder|employee|grantee|recipient)\b/.test(t));
  for (const ok of tries) {
    /* the last match wins: signature blocks sit at the end of a document */
    const hits = info.texts.filter((t) => !taken.has(t) && ok(norm(t.str)));
    if (hits.length) return hits[hits.length - 1];
  }
  return null;
}

/**
 * Place one signature box per signer, sitting on the line just above the label
 * that names them ("Director", "Option Holder"). Anyone without a label gets a
 * box in the bottom-right of the last page, stacked upwards.
 */
export function autoPlace(info: PdfInfo, signers: Array<{ name: string; role: string }>, opts: { everyone?: boolean } = {}): Box[] {
  const out: Box[] = [];
  const taken = new Set<PdfText>();
  const last = info.pages.length;
  let spare = 0;
  signers.forEach((s, i) => {
    const position = i + 1;
    const label = findLabel(info, s, i === 0, taken, opts.everyone);
    /* FD Sign for everyone: a "_______" line under the label (within a few lines, same column) is where they sign */
    const rule =
      label && opts.everyone
        ? info.texts
            .filter((t) => t.page === label.page && /^_{5,}$/.test(t.str) && t.y > label.y && t.y - label.y < 0.12 && Math.abs(t.x - label.x) < 0.12 && !taken.has(t))
            .sort((a, b) => a.y - b.y)[0]
        : undefined;
    if (rule) {
      taken.add(rule);
      if (label) taken.add(label);
      const pg = info.pages[rule.page - 1];
      const size = sized("signature", pg);
      const bottom = rule.y + rule.h * 0.75;
      const above = info.texts.filter((t) => t.page === rule.page && t !== rule && t.y + t.h <= bottom && t.x < rule.x + size.w && t.x + t.w > rule.x);
      const ceiling = above.length ? Math.max(...above.map((t) => t.y + t.h)) + 2 / pg.h : 0;
      const h = Math.max(Math.min(size.h, bottom - ceiling), 20 / pg.h);
      out.push(clamp({ id: boxId(), position, kind: "signature", page: rule.page, x: rule.x, y: bottom - h, w: Math.max(size.w * 0.8, rule.w), h }));
    } else if (label) {
      taken.add(label);
      const pg = info.pages[label.page - 1];
      const size = sized("signature", pg);
      const x = label.x - 0.004;
      const bottom = label.y - 4 / pg.h; // just above the label = on the signature line
      /* don't cover text printed above the line (e.g. the company name): fit the box under it */
      const above = info.texts.filter((t) => t.page === label.page && t.y + t.h <= bottom && t.x < x + size.w && t.x + t.w > x);
      const ceiling = above.length ? Math.max(...above.map((t) => t.y + t.h)) + 3 / pg.h : 0;
      const h = Math.max(Math.min(size.h, bottom - ceiling), 20 / pg.h);
      out.push(clamp({ id: boxId(), position, kind: "signature", page: label.page, x, y: bottom - h, w: size.w, h }));
    } else {
      const pg = info.pages[last - 1] ?? { w: 595, h: 842 };
      const { w, h } = sized("signature", pg);
      out.push(clamp({ id: boxId(), position, kind: "signature", page: last, x: 1 - w - 0.07, y: 1 - 0.08 - (h + 0.03) * (spare + 1), w, h }));
      spare++;
    }
  });
  return out;
}
