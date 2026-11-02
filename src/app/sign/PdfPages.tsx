"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/* The PDF drawn page by page (pdf.js, in the browser), each page with an
   overlay on top for the signature boxes. Box positions are fractions of the
   page (0–1, from the top-left), so they stay put at any zoom or screen size. */

type PdfJs = typeof import("pdfjs-dist");
let lib: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  if (!lib) {
    lib = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return m;
    });
  }
  return lib;
}

/** A line of text on a page, in page fractions (top-left origin). */
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

export async function openPdf(src: Blob | string): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  if (typeof src === "string") return m.getDocument({ url: src, withCredentials: true }).promise;
  return m.getDocument({ data: new Uint8Array(await src.arrayBuffer()) }).promise;
}

/** Page sizes and every piece of text with its position (for auto-placing boxes). */
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
      /* viewport handles rotation; convert the baseline point */
      const [vx, vy] = vp.convertToViewportPoint(e, f);
      texts.push({ page: p, str: it.str.trim(), x: vx / vp.width, y: (vy - size) / vp.height, w: it.width / vp.width, h: size / vp.height });
    }
  }
  return { pages, texts };
}

export default function PdfPages({
  src,
  overlay,
  onInfo,
  className,
}: {
  src: Blob | string;
  overlay?: (page: number) => ReactNode;
  onInfo?: (info: PdfInfo) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{ src: Blob | string; doc: PDFDocumentProxy | null; sizes: Array<{ w: number; h: number }>; err: string } | null>(null);
  const [width, setWidth] = useState(0);
  const infoCb = useRef(onInfo);
  useEffect(() => {
    infoCb.current = onInfo;
  }, [onInfo]);
  const mine = loaded?.src === src ? loaded : null;
  const doc = mine?.doc ?? null;
  const sizes = mine?.sizes ?? [];
  const err = mine?.err ?? "";

  useEffect(() => {
    let alive = true;
    let loaded: PDFDocumentProxy | null = null;
    openPdf(src)
      .then(async (d) => {
        loaded = d;
        const info = await readPdf(d);
        if (!alive) return;
        setLoaded({ src, doc: d, sizes: info.pages, err: "" });
        infoCb.current?.(info);
      })
      .catch(() => alive && setLoaded({ src, doc: null, sizes: [], err: "This PDF could not be shown here. Use Download to read it." }));
    return () => {
      alive = false;
      void loaded?.destroy();
    };
  }, [src]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className={`fs-pages ${className ?? ""}`}>
      {err && <p className="fs-err">{err}</p>}
      {!doc && !err && <div className="fs-pages-wait">Loading the document…</div>}
      {doc &&
        width > 0 &&
        sizes.map((s, i) => (
          <div key={i} className="fs-page" style={{ aspectRatio: `${s.w} / ${s.h}` }} data-page={i + 1}>
            <PageCanvas doc={doc} page={i + 1} width={width} />
            <div className="fs-page-over">{overlay?.(i + 1)}</div>
            <span className="fs-page-no">
              {i + 1} / {sizes.length}
            </span>
          </div>
        ))}
    </div>
  );
}

function PageCanvas({ doc, page, width }: { doc: PDFDocumentProxy; page: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let alive = true;
    void doc.getPage(page).then((p) => {
      const c = ref.current;
      if (!alive || !c) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: (width / p.getViewport({ scale: 1 }).width) * ratio });
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      task = p.render({ canvasContext: ctx, viewport: vp });
      task.promise.catch(() => undefined);
    });
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [doc, page, width]);
  return <canvas ref={ref} />;
}
