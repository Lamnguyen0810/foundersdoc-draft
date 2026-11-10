import "server-only";
import JSZip from "jszip";
import { getDocumentProxy } from "unpdf";
import type { Line, ReadDoc } from "./rules";

/**
 * FD Sign signing-ready check (0201): read an uploaded PDF or Word file into
 * lines (with page or paragraph numbers) plus the mark-up the rules look for.
 * Nothing is stored: the bytes are read in memory and dropped.
 */

export class ReadError extends Error {}

const latin = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 65536) s += String.fromCharCode(...b.subarray(i, Math.min(b.length, i + 65536)));
  return s;
};

export function sniff(b: Uint8Array): "pdf" | "docx" | "doc" | "unknown" {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  if (b[0] === 0x50 && b[1] === 0x4b) return "docx";
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "doc";
  return "unknown";
}

/* ── PDF ──────────────────────────────────────────────────────────────── */

async function readPdf(bytes: Uint8Array): Promise<ReadDoc> {
  const raw = latin(bytes.subarray(0, Math.min(bytes.length, 20 * 1024 * 1024)));
  const encryptedFlag = /\/Encrypt\b/.test(raw);
  const digitallySigned = /\/ByteRange\s*\[/.test(raw) && /\/Type\s*\/Sig\b|\/SubFilter\s*\/(?:adbe|ETSI)/.test(raw);
  const embedded = (raw.match(/\/EmbeddedFile\b/g) ?? []).length;

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (/Password/i.test(name) || encryptedFlag)
      return { kind: "pdf", pages: null, lines: [], margins: [], meta: { encrypted: true, hasText: false, digitallySigned } };
    throw new ReadError("This PDF could not be opened. It may be damaged; export it again and retry.");
  }
  const lines: Line[] = [];
  const margins: ReadDoc["margins"] = [];
  let chars = 0;
  let pdfComments = 0;
  let pdfHighlights = 0;
  const pages = pdf.numPages;
  for (let p = 1; p <= Math.min(pages, 300); p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    let cur = "";
    let lastY: number | null = null;
    const pageLines: string[] = [];
    for (const it of tc.items as Array<{ str?: string; hasEOL?: boolean; transform?: number[] }>) {
      if (typeof it.str !== "string") continue;
      const y = it.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && cur.trim()) {
        pageLines.push(cur);
        cur = "";
      }
      cur += it.str;
      if (y !== null) lastY = y;
      if (it.hasEOL) {
        pageLines.push(cur);
        cur = "";
        lastY = null;
      }
    }
    if (cur.trim()) pageLines.push(cur);
    const kept = pageLines.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    kept.forEach((text, i) => {
      chars += text.length;
      lines.push({ text, page: p, para: i + 1 });
    });
    if (kept.length) {
      margins.push({ text: kept[0], where: `Page ${p}` });
      if (kept.length > 1) margins.push({ text: kept[kept.length - 1], where: `Page ${p}` });
    }
    try {
      for (const a of (await page.getAnnotations()) as Array<{ subtype?: string }>) {
        if (a.subtype === "Text" || a.subtype === "FreeText" || a.subtype === "Popup") pdfComments++;
        if (a.subtype === "Highlight" || a.subtype === "StrikeOut" || a.subtype === "Underline" || a.subtype === "Squiggly") pdfHighlights++;
      }
    } catch {
      /* annotations are a bonus */
    }
    page.cleanup();
  }
  void (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  return {
    kind: "pdf",
    pages,
    lines,
    margins,
    meta: { encrypted: encryptedFlag, digitallySigned, hasText: chars >= Math.max(40, pages * 15), embedded, pdfComments, pdfHighlights },
  };
}

/* ── Word (.docx) ─────────────────────────────────────────────────────── */

const xmlText = (x: string) =>
  x
    .replace(/<w:tab\/>/g, " ")
    .replace(/<w:br[^>]*\/>/g, " ")
    .replace(/<w:delText[^>]*>[\s\S]*?<\/w:delText>/g, "")
    .replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

async function readDocx(bytes: Uint8Array): Promise<ReadDoc> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ReadError("This Word file could not be opened. Save it again as .docx and retry.");
  }
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) {
    if (zip.file("EncryptedPackage")) return { kind: "docx", pages: null, lines: [], margins: [], meta: { encrypted: true, hasText: false } };
    throw new ReadError("This doesn't look like a Word document (.docx).");
  }
  const count = (re: RegExp) => (docXml.match(re) ?? []).length;
  const body = docXml.replace(/^[\s\S]*?<w:body>/, "").replace(/<w:sectPr[\s\S]*$/, "");
  const lines: Line[] = [];
  let para = 0;
  let chars = 0;
  for (const p of body.split(/<\/w:p>/)) {
    const text = xmlText(p);
    para++;
    if (!text) continue;
    chars += text.length;
    lines.push({ text, page: null, para });
  }
  const margins: ReadDoc["margins"] = [];
  let watermark: string | null = null;
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    const x = (await zip.file(name)?.async("string")) ?? "";
    const wm = /<v:textpath[^>]*\bstring="([^"]{2,60})"/.exec(x) ?? /<w14:textOutline[\s\S]*?<w:t>([^<]{2,40})<\/w:t>/.exec(x);
    if (wm && /draft|confidential|not for|subject to|sample|copy/i.test(wm[1])) watermark = wm[1];
    const t = xmlText(x);
    if (t) margins.push({ text: t, where: name.includes("header") ? "Header" : "Footer" });
  }
  const commentsXml = (await zip.file("word/comments.xml")?.async("string")) ?? "";
  return {
    kind: "docx",
    pages: null,
    lines,
    margins,
    meta: {
      hasText: chars >= 40,
      trackedChanges: count(/<w:(?:ins|del|moveFrom|moveTo)\b[^>]*w:author=/g),
      comments: (commentsXml.match(/<w:comment\b/g) ?? []).length,
      highlights: count(/<w:highlight\b/g),
      hidden: count(/<w:vanish\s*\/>/g),
      colouredRuns: count(/<w:color w:val="(?!000000|auto|FFFFFF)[0-9A-Fa-f]{6}"/g),
      placeholderControls: count(/<w:showingPlcHdr\s*\/>/g),
      macros: Boolean(zip.file("word/vbaProject.bin")),
      embedded: Object.keys(zip.files).filter((n) => /^word\/embeddings\//.test(n)).length,
      watermark,
    },
  };
}

export async function readFile(bytes: Uint8Array): Promise<ReadDoc> {
  const k = sniff(bytes);
  if (k === "pdf") return readPdf(bytes);
  if (k === "docx") return readDocx(bytes);
  if (k === "doc") throw new ReadError("This is the old Word format (.doc). In Word choose File → Save as → .docx or PDF, then upload that.");
  throw new ReadError("Please upload a PDF or a Word file (.docx).");
}
