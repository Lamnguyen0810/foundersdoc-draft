import "server-only";

/** pdf.js on the server (no worker thread: the worker module runs in-process). */
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let lib: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  if (!lib) {
    lib = (async () => {
      const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
      return import("pdfjs-dist/legacy/build/pdf.mjs");
    })();
  }
  return lib;
}

export async function openPdfNode(bytes: Uint8Array) {
  const m = await pdfjs();
  return m.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
}

/** The text of a PDF as lines, top to bottom (items on the same baseline joined left to right). */
export async function pdfLines(bytes: Uint8Array, maxPages = 6): Promise<Array<{ page: number; text: string }>> {
  const doc = await openPdfNode(bytes);
  const out: Array<{ page: number; text: string }> = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items: Array<{ x: number; y: number; w: number; s: string }> = [];
      for (const it of tc.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const t = it.transform as number[];
        items.push({ x: t[4], y: t[5], w: it.width, s: it.str });
      }
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const rows: Array<typeof items> = [];
      for (const it of items) {
        const row = rows.find((r) => Math.abs(r[0].y - it.y) < 2.5);
        if (row) row.push(it);
        else rows.push([it]);
      }
      rows.sort((a, b) => b[0].y - a[0].y);
      for (const r of rows) {
        r.sort((a, b) => a.x - b.x);
        let text = "";
        let end = -1e9;
        for (const it of r) {
          text += (text && it.x - end > 1.5 ? " " : "") + it.s;
          end = it.x + it.w;
        }
        /* drop private-use glyphs (Symbol-font bullets) */
        out.push({ page: p, text: text.replace(/[\uE000-\uF8FF]/g, "").replace(/\s+/g, " ").trim() });
      }
    }
  } finally {
    void doc.destroy();
  }
  return out;
}
