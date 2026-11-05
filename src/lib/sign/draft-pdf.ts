import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { parseDraft, splitPlaceholders, type Block } from "@/lib/contract/parse";
import { splitNotes } from "@/lib/prompt";
import { pdfText } from "./pdf";

/**
 * An FD AI draft as a PDF to sign (0190): the draft's own text (as saved, the
 * drafter's notes and FD Notes left out), typeset on A4 in the house look
 * (Arial-like, 10pt), numbered clauses hanging, signature blocks side by side
 * with a rule to sign above, page numbers at the foot.
 *
 * It also says where each signature block's boxes go, so the Fields step can
 * put party 1's signature on block 1, party 2's on block 2 (fractions of the
 * page from the top-left, like sign_fields).
 */

export interface DraftBox {
  kind: "signature" | "name" | "date" | "text";
  /** text: what it asks for ("Title") */
  label?: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface DraftBlock {
  /** "For and on behalf of NORTHWIND LABS PTE. LTD." */
  head: string;
  boxes: DraftBox[];
}
export interface DraftPdf {
  pdf: Uint8Array;
  pages: number;
  blocks: DraftBlock[];
  /** [●] gaps still to fill in, and FD Notes left out */
  blanks: number;
  notes: number;
}

const W = 595.28, H = 841.89; // A4
const ML = 72, MR = 64, MT = 72, MB = 72;
const CW = W - ML - MR;
const SIZE = 10, LEAD = 14.2;
const INK = rgb(0.08, 0.08, 0.08), GREY = rgb(0.45, 0.45, 0.45);
const GAP_TEXT = "_______________";

type Run = { t: string; bold: boolean };

export async function draftPdf(input: { title: string; text: string; fonts: { regular: Uint8Array; bold: Uint8Array } | null }): Promise<DraftPdf> {
  const { body } = splitNotes(input.text ?? "");
  const blocks = parseDraft(body);
  const doc = await PDFDocument.create();
  doc.setTitle(input.title || "Document");
  doc.setProducer("FD Sign by Founders Doc");
  let reg: PDFFont, bold: PDFFont;
  if (input.fonts) {
    doc.registerFontkit(fontkit);
    reg = await doc.embedFont(input.fonts.regular, { subset: true });
    bold = await doc.embedFont(input.fonts.bold, { subset: true });
  } else {
    reg = await doc.embedFont(StandardFonts.Helvetica);
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  }
  const T = input.fonts ? (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f]/g, "") : pdfText;

  let blanks = 0, notes = 0;
  const runsOf = (text: string, allBold = false): Run[] => {
    const out: Run[] = [];
    for (const p of splitPlaceholders(text)) {
      if ("note" in p) notes++;
      else if ("placeholder" in p) {
        blanks++;
        out.push({ t: GAP_TEXT, bold: false });
      } else out.push({ t: T(p.text.replace(/\*\*/g, "")), bold: allBold || !!p.b });
    }
    return out;
  };

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - MT;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - MT;
  };
  const need = (h: number) => {
    if (y - h < MB) newPage();
  };

  /** Wrap runs to a width; returns lines of words with their fonts. A word knows whether a space comes
   *  before it, so a bold term in quotes ("Parties") stays joined to its quotes. */
  const lay = (runs: Run[], width: number, size: number) => {
    type Word = { t: string; f: PDFFont; w: number; gap: boolean };
    const lines: Word[][] = [[]];
    let lw = 0;
    let gap = false;
    const space = reg.widthOfTextAtSize(" ", size);
    for (const r of runs) {
      const f = r.bold ? bold : reg;
      for (const part of r.t.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          gap = true;
          continue;
        }
        const w = f.widthOfTextAtSize(part, size);
        const cur = lines[lines.length - 1];
        const add = cur.length && gap ? space : 0;
        if (cur.length && gap && lw + add + w > width) {
          lines.push([]);
          lw = 0;
          lines[lines.length - 1].push({ t: part, f, w, gap: false });
          lw = w;
        } else {
          cur.push({ t: part, f, w, gap: cur.length > 0 && gap });
          lw += add + w;
        }
        gap = false;
      }
    }
    return lines.filter((l, i) => l.length || i === 0);
  };
  /** Draw a paragraph at x with a width; moves y down. */
  const para = (runs: Run[], x: number, width: number, o: { size?: number; center?: boolean; justify?: boolean; after?: number } = {}) => {
    const size = o.size ?? SIZE;
    const lead = size * 1.42;
    const lines = lay(runs, width, size);
    const space = reg.widthOfTextAtSize(" ", size);
    lines.forEach((ln, i) => {
      need(lead);
      const words = ln.reduce((a, w) => a + w.w, 0);
      const gaps = ln.filter((w) => w.gap).length;
      const last = i === lines.length - 1;
      const sp = o.justify && !last && gaps > 0 ? (width - words) / gaps : space;
      let cx = o.center ? x + (width - (words + space * gaps)) / 2 : x;
      for (const w of ln) {
        if (w.gap) cx += sp;
        page.drawText(w.t, { x: cx, y: y - size, size, font: w.f, color: INK });
        cx += w.w;
      }
      y -= lead;
    });
    y -= o.after ?? 6;
  };
  /** A numbered paragraph: the number hangs, the text wraps beside it. */
  const numbered = (num: string, runs: Run[], indent: number, hang: number, o: { bold?: boolean; before?: number } = {}) => {
    y -= o.before ?? 0;
    need(LEAD * 2);
    const top = y;
    page.drawText(T(num), { x: ML + indent, y: y - SIZE, size: SIZE, font: o.bold ? bold : reg, color: INK });
    y = top;
    para(runs, ML + indent + hang, CW - indent - hang, { justify: true });
  };

  const out: DraftBlock[] = [];
  for (const b of blocks as Block[]) {
    switch (b.kind) {
      case "title":
        y -= 4;
        para(runsOf(b.text, true), ML, CW, { size: 14, center: true, after: 16 });
        break;
      case "date":
      case "label":
        para(runsOf(b.text, b.kind === "label"), ML, CW, { after: 8 });
        break;
      case "party":
      case "recital":
        if (b.num) numbered(b.num, runsOf(b.text), 0, 30);
        else para(runsOf(b.text), ML, CW, { justify: true });
        break;
      case "section":
        y -= 8;
        need(LEAD * 3);
        if (b.num) numbered(b.num, runsOf(b.text, true), 0, 30, { bold: true });
        else {
          const m = /^(\d+\.)\s+([\s\S]+)$/.exec(b.text);
          if (m) numbered(m[1], runsOf(m[2], true), 0, 30, { bold: true });
          else para(runsOf(b.text, true), ML, CW);
        }
        break;
      case "clause":
        if (b.num) numbered(b.num, runsOf(b.text), 0, 30);
        else para(runsOf(b.text), ML + 30, CW - 30, { justify: true });
        break;
      case "subclause": {
        const lvl = b.level ?? 1;
        numbered(b.num, runsOf(b.text), 30 + (lvl - 1) * 26, 26);
        break;
      }
      case "notes-title":
      case "note":
        break; // drafter's notes never go on the signed document
      case "sign-head":
      case "sign":
        /* a signature line the pairing left on its own */
        para(runsOf(b.text, b.kind === "sign-head"), ML, CW);
        break;
      case "sign-row": {
        const cols = b.cols ?? [];
        const gap = 28;
        const cw = (CW - gap) / 2;
        const rows = Math.max(...cols.map((c) => c.length), 1);
        y -= 10;
        need(56 + rows * LEAD + 10);
        const rule = y - 50; // sign above this line
        cols.forEach((lines, ci) => {
          const x = ML + ci * (cw + gap);
          page.drawLine({ start: { x, y: rule }, end: { x: x + cw, y: rule }, thickness: 0.75, color: INK });
          const pageNo = doc.getPageCount();
          const boxes: DraftBox[] = [{ kind: "signature", page: pageNo, x: x / W, y: (H - rule + 2 - 44) / H, w: (cw * 0.9) / W, h: 42 / H }];
          let ly = rule - 4;
          /* "For and on behalf of NORTHWIND LABS PTE. LTD.": the lines before Name / Title */
          const head = lines
            .map((l) => l.replace(/\*\*/g, "").trim())
            .filter((l) => !/^(Name|Title|Date)\s*:/i.test(l))
            .slice(0, 2)
            .join(" ");
          for (const line of lines) {
            const bare = line.replace(/\*\*/g, "").trim();
            const label = /^(Name|Title|Date)\s*:\s*(\[●\]|_{3,})?\s*$/i.exec(bare);
            if (label?.[2]) {
              const lab = `${label[1]}: `;
              page.drawText(T(lab), { x, y: ly - SIZE, size: SIZE, font: reg, color: INK });
              const lx = x + reg.widthOfTextAtSize(lab, SIZE);
              page.drawLine({ start: { x: lx, y: ly - SIZE - 2 }, end: { x: x + cw, y: ly - SIZE - 2 }, thickness: 0.5, color: GREY });
              /* the signer fills these in when they sign: name and date by themselves, title as a text box */
              const k = label[1].toLowerCase();
              const at = { page: pageNo, x: lx / W, y: (H - (ly - SIZE - 5) - 16) / H, w: (x + cw - lx) / W, h: 16 / H };
              boxes.push(k === "title" ? { kind: "text", label: "Title", ...at } : { kind: k as "name" | "date", ...at });
              ly -= LEAD;
              continue;
            }
            const runs = runsOf(line);
            for (const ln of lay(runs, cw, SIZE)) {
              let cx = x;
              for (const w of ln) {
                if (w.gap) cx += reg.widthOfTextAtSize(" ", SIZE);
                page.drawText(w.t, { x: cx, y: ly - SIZE, size: SIZE, font: w.f, color: INK });
                cx += w.w;
              }
              ly -= LEAD;
            }
          }
          out.push({ head: head.slice(0, 160), boxes });
        });
        y = rule - 4 - rows * LEAD - 14;
        break;
      }
      default:
        para(runsOf(b.text), b.cont ? ML + 30 : ML, b.cont ? CW - 30 : CW, { justify: true });
    }
  }

  /* page numbers, as on screen */
  const n = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    const t = `Page ${i + 1} of ${n}`;
    p.drawText(t, { x: (W - reg.widthOfTextAtSize(t, 8)) / 2, y: 36, size: 8, font: reg, color: GREY });
  });
  /* blanks: gaps in the text itself (the signature blocks' Name / Title / Date lines get boxes instead) */
  return { pdf: await doc.save(), pages: n, blocks: out, blanks, notes };
}
