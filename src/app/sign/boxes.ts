import type { PdfInfo, PdfText } from "./PdfPages";

/* Signature boxes: where each signer signs, on the line. Positions are page
   fractions from the top-left (same as public.sign_fields). */

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
function findLabel(info: PdfInfo, signer: { name: string; role: string }, first: boolean, taken: Set<PdfText>): PdfText | null {
  const role = norm(signer.role);
  const name = norm(signer.name);
  const tries: Array<(t: string) => boolean> = [];
  if (role) tries.push((t) => t === role, (t) => t.startsWith(role) && t.length < role.length + 25);
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
export function autoPlace(info: PdfInfo, signers: Array<{ name: string; role: string }>): Box[] {
  const out: Box[] = [];
  const taken = new Set<PdfText>();
  const last = info.pages.length;
  let spare = 0;
  signers.forEach((s, i) => {
    const position = i + 1;
    const label = findLabel(info, s, i === 0, taken);
    if (label) {
      taken.add(label);
      const pg = info.pages[label.page - 1];
      const { w, h } = sized("signature", pg);
      out.push(clamp({ id: boxId(), position, kind: "signature", page: label.page, x: label.x - 0.004, y: label.y - h - 4 / pg.h, w, h }));
    } else {
      const pg = info.pages[last - 1] ?? { w: 595, h: 842 };
      const { w, h } = sized("signature", pg);
      out.push(clamp({ id: boxId(), position, kind: "signature", page: last, x: 1 - w - 0.07, y: 1 - 0.08 - (h + 0.03) * (spare + 1), w, h }));
      spare++;
    }
  });
  return out;
}
