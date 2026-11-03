import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * The HitPay Option Certificate, drawn like the issued ones (No. 18, No. 44):
 * A4 landscape, HitPay background (blue, triple border, watermark), Arial-
 * metric font with full accents (Liberation Sans), values underlined in the
 * body, signature lines labelled "Director" and "Option Holder" (FD Sign puts
 * the boxes on them). Values come from the ESOP dashboard / Letter of Grant.
 */
export interface CertificateData {
  certificateNo: number;
  companyName: string; // HITPAY PAYMENT SOLUTIONS PTE. LTD.
  companyRegNo: string;
  holderName: string; // full legal name, as in the Letter of Grant
  nationality: string; // "Vietnamese citizenship"
  idNo: string;
  options: number; // this tranche
  shareClass: string; // "Class B"
  grantDate: string; // "24 October 2023"
  directorName: string;
}

const W = 842;
const H = 595;
const INK = rgb(0, 0, 0);
const cache = new Map<string, Uint8Array>();

async function asset(rel: string, origin: string): Promise<Uint8Array | null> {
  const hit = cache.get(rel);
  if (hit) return hit;
  let bytes: Uint8Array | null = null;
  try {
    bytes = new Uint8Array(await readFile(path.join(process.cwd(), "public", rel)));
  } catch {
    try {
      const r = await fetch(`${origin}/${rel}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
    } catch {
      bytes = null;
    }
  }
  if (bytes) cache.set(rel, bytes);
  return bytes;
}

/** Fonts with full accents for signed copies (typed signatures, names in the audit trail). */
export async function signFonts(origin: string): Promise<{ regular: Uint8Array; bold: Uint8Array; script: Uint8Array } | null> {
  const [regular, bold, script] = await Promise.all([
    asset("esop/fonts/LiberationSans-Regular.ttf", origin),
    asset("esop/fonts/LiberationSans-Bold.ttf", origin),
    asset("esop/fonts/LiberationSerif-Italic.ttf", origin),
  ]);
  return regular && bold && script ? { regular, bold, script } : null;
}

type Run = { t: string; b?: boolean; i?: boolean; u?: boolean };
type Fonts = { r: PDFFont; b: PDFFont; i: PDFFont };

/** A paragraph of runs, wrapped to width; underlined runs stay whole. Justified except the last line. */
function para(page: PDFPage, fonts: Fonts, runs: Run[], x: number, top: number, width: number, size: number, lead: number): number {
  type Piece = { t: string; f: PDFFont; u: boolean; w: number; space: boolean };
  const pieces: Piece[] = [];
  for (const r of runs) {
    const f = r.b ? fonts.b : r.i ? fonts.i : fonts.r;
    if (r.u) {
      pieces.push({ t: r.t, f, u: true, w: f.widthOfTextAtSize(r.t, size) + 10, space: false });
      continue;
    }
    for (const part of r.t.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) pieces.push({ t: " ", f, u: false, w: f.widthOfTextAtSize(" ", size), space: true });
      else pieces.push({ t: part, f, u: false, w: f.widthOfTextAtSize(part, size), space: false });
    }
  }
  const lines: Piece[][] = [];
  let line: Piece[] = [];
  let lw = 0;
  for (const p of pieces) {
    if (p.space && !line.length) continue;
    if (!p.space && lw + p.w > width && line.length) {
      while (line.length && line[line.length - 1].space) line.pop();
      lines.push(line);
      line = [];
      lw = 0;
    }
    line.push(p);
    lw += p.w;
  }
  while (line.length && line[line.length - 1].space) line.pop();
  if (line.length) lines.push(line);

  let y = top;
  lines.forEach((ln, li) => {
    const used = ln.reduce((s, p) => s + p.w, 0);
    const gaps = ln.filter((p) => p.space).length;
    const extra = li < lines.length - 1 && gaps ? (width - used) / gaps : 0;
    let cx = x;
    for (const p of ln) {
      if (p.space) {
        cx += p.w + extra;
        continue;
      }
      const baseline = H - y;
      if (p.u) {
        page.drawText(p.t, { x: cx + 5, y: baseline + 1.2, size, font: p.f, color: INK });
        page.drawLine({ start: { x: cx, y: baseline - 1.5 }, end: { x: cx + p.w, y: baseline - 1.5 }, thickness: 0.6, color: INK });
      } else {
        page.drawText(p.t, { x: cx, y: baseline, size, font: p.f, color: INK });
      }
      cx += p.w;
    }
    y += lead;
  });
  return y;
}

const center = (page: PDFPage, text: string, font: PDFFont, size: number, top: number) =>
  page.drawText(text, { x: (W - font.widthOfTextAtSize(text, size)) / 2, y: H - top, size, font, color: INK });

export async function buildCertificatePdf(d: CertificateData, origin: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [fr, fb, fi, bg] = await Promise.all([
    asset("esop/fonts/LiberationSans-Regular.ttf", origin),
    asset("esop/fonts/LiberationSans-Bold.ttf", origin),
    asset("esop/fonts/LiberationSans-Italic.ttf", origin),
    asset("esop/hitpay-certificate-bg.jpg", origin),
  ]);
  if (!fr || !fb || !fi) throw new Error("certificate fonts missing");
  const fonts: Fonts = { r: await doc.embedFont(fr, { subset: true }), b: await doc.embedFont(fb, { subset: true }), i: await doc.embedFont(fi, { subset: true }) };
  doc.setTitle(`Option Certificate No. ${d.certificateNo} - ${d.holderName}`);
  doc.setAuthor(d.companyName);
  doc.setCreator("FD Sign by Founders Doc");
  const page = doc.addPage([W, H]);
  if (bg) page.drawImage(await doc.embedJpg(bg), { x: 0, y: 0, width: W, height: H });
  else page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.8, 0.92, 1) });

  /* certificate number, top right */
  const no = String(d.certificateNo).padStart(3, "0");
  const lab = "Option Certificate No.: ";
  const lw = fonts.b.widthOfTextAtSize(lab, 9);
  const nx = 752 - 30;
  page.drawText(lab, { x: nx - lw, y: H - 64, size: 9, font: fonts.b, color: INK });
  page.drawText(no, { x: nx + (30 - fonts.r.widthOfTextAtSize(no, 8)) / 2, y: H - 62, size: 8, font: fonts.r, color: INK });
  page.drawLine({ start: { x: nx, y: H - 66 }, end: { x: nx + 30, y: H - 66 }, thickness: 0.6, color: INK });

  /* company block */
  center(page, d.companyName.toUpperCase(), fonts.b, 10, 96);
  const company = "(the “";
  const cw = fonts.r.widthOfTextAtSize(company, 8) + fonts.b.widthOfTextAtSize("Company", 8) + fonts.r.widthOfTextAtSize("”)", 8);
  let cx = (W - cw) / 2;
  page.drawText(company, { x: cx, y: H - 107, size: 8, font: fonts.r, color: INK });
  cx += fonts.r.widthOfTextAtSize(company, 8);
  page.drawText("Company", { x: cx, y: H - 107, size: 8, font: fonts.b, color: INK });
  cx += fonts.b.widthOfTextAtSize("Company", 8);
  page.drawText("”)", { x: cx, y: H - 107, size: 8, font: fonts.r, color: INK });
  center(page, `(Company Registration Number: ${d.companyRegNo})`, fonts.r, 8, 118);
  center(page, "(Incorporated in the Republic of Singapore)", fonts.r, 8, 129);
  center(page, "OPTION CERTIFICATE", fonts.b, 10.5, 154);

  /* the certificate */
  const L = 96;
  const R = 736;
  const options = `${d.options.toLocaleString("en-US")} ${d.shareClass}`;
  para(
    page,
    fonts,
    [
      { t: "THIS IS TO CERTIFY", b: true },
      { t: " that " },
      { t: d.holderName, u: true },
      { t: " of " },
      { t: d.nationality, u: true },
      { t: " of " },
      { t: `Identification No.: ${d.idNo}`, u: true },
      { t: " is the Option Holder to acquire up to a maximum of " },
      { t: options, u: true },
      { t: " ESOP Shares in the capital of the Company, at the Exercise Price, subject to the exercise conditions (if any) contained herein. The Option was granted by the Company on " },
      { t: d.grantDate, u: true },
      { t: " under the Rules of the Employee Share Option Plan (as amended and restated from time to time). The Option is exercisable in whole or in part as specified in the Rules of the Employee Share Option Plan." },
    ],
    L,
    176,
    R - L,
    8.2,
    15.5,
  );

  /* exercise conditions, left */
  page.drawText("EXERCISE CONDITIONS", { x: L, y: H - 244, size: 8.2, font: fonts.b, color: INK });
  ["Payment of Exercise Price", "Occurrence of the Exercise Period, including but not limited to an Exit Event", "Any other conditions prescribed in the Employee Share Option Plan"].forEach((t, k) => {
    const y = H - 255 - k * 10.2;
    page.drawCircle({ x: L + 4, y: y + 2.5, size: 1.4, color: INK });
    page.drawText(t, { x: L + 16, y, size: 8.2, font: fonts.r, color: INK });
  });

  /* director, right */
  const SX = 515;
  page.drawText(d.companyName.toUpperCase(), { x: SX, y: H - 282, size: 8.2, font: fonts.b, color: INK });
  page.drawLine({ start: { x: SX, y: H - 317 }, end: { x: SX + 130, y: H - 317 }, thickness: 0.6, color: INK });
  page.drawText("Director", { x: SX, y: H - 326, size: 8.2, font: fonts.b, color: INK });
  page.drawText("Name:", { x: SX, y: H - 337, size: 8.2, font: fonts.b, color: INK });
  page.drawText(d.directorName, { x: SX + 28, y: H - 338, size: 8.2, font: fonts.r, color: INK });

  /* important notice */
  page.drawText("THIS CERTIFICATE IS IMPORTANT AND SHOULD BE KEPT IN A SAFE PLACE.", { x: L, y: H - 350, size: 10.5, font: fonts.b, color: INK });
  para(
    page,
    fonts,
    [
      { t: "This Certificate is issued as a matter of record only and is not a document of title. This Option is personal to the Option Holder named herein and may not be sold, transferred, pledged, charged or otherwise disposed of in any other manner. The terms set out herein are subject to the Rules of the Employee Share Option Plan (as amended and restated from time to time). " },
      { t: "All capitalised terms used but not defined herein shall have the meanings given to them in the Company’s Employee Share Option Plan.", i: true },
    ],
    L,
    370,
    R - L,
    7.8,
    11,
  );

  /* acknowledgement */
  page.drawText("Acknowledgement Portion", { x: L, y: H - 410, size: 8, font: fonts.b, color: INK });
  page.drawLine({ start: { x: L, y: H - 411.8 }, end: { x: L + fonts.b.widthOfTextAtSize("Acknowledgement Portion", 8), y: H - 411.8 }, thickness: 0.6, color: INK });
  para(
    page,
    fonts,
    [
      { t: "I/We hereby acknowledge receipt of this Option Certificate and that this document, together with the rules set out in the Employee Share Option Plan and the letter of grant issued by the Company to me/us constitutes the entire agreement between the Company and me/us, and supersedes all previous discussions, documents, and arrangements between me/us. I/We also confirm that we have no claims and/or waive any claims that we have or may have against the Company or its officers in respect of the foregoing as well as any transactions arising in connection with the foregoing documents." },
    ],
    L,
    426,
    R - L,
    7.8,
    11,
  );

  /* option holder, right */
  page.drawLine({ start: { x: SX, y: H - 494 }, end: { x: SX + 130, y: H - 494 }, thickness: 0.6, color: INK });
  page.drawText("Option Holder", { x: SX, y: H - 503, size: 8.2, font: fonts.b, color: INK });
  page.drawText("Name:", { x: SX, y: H - 514, size: 8.2, font: fonts.b, color: INK });
  page.drawText(d.holderName, { x: SX + 28, y: H - 515, size: 8.2, font: fonts.r, color: INK });

  return doc.save();
}
