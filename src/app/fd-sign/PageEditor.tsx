"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { openPdf } from "../sign/PdfPages";
import { Ic } from "./ui";

/* FD Sign (0214): "Edit document", a small Word-like editor for the page itself,
   before anything is sent. Lam (11 Nov): "edit document function like Microsoft
   Word: add page, remove, type, font, size". Works on any PDF (a Word file is
   already a PDF by this step):
     · Add text anywhere: font (sans / serif / mono), size, bold, italic, colour
     · White-out: cover words, then type over them
     · Pages: add a blank page, rotate, move up / down, remove
   The words already in a PDF can't be re-flowed in a browser, so changes are
   drawn on top and burned into a new PDF (pdf-lib) when "Use this version" is
   pressed. Nothing is uploaded until the request is sent, and the file as first
   uploaded can be restored. */

type Rot = 0 | 90 | 180 | 270;
type Font = "sans" | "serif" | "mono";
type Tool = "select" | "text" | "white";

interface Pg {
  id: string;
  /** page index in the uploaded PDF (0-based), or null for a new blank page */
  src: number | null;
  /** rotation added here, clockwise */
  rot: Rot;
}
interface SrcInfo {
  /** the page as pdf.js shows it with no extra rotation */
  w: number;
  h: number;
  /** the page's own /Rotate */
  base: number;
}
interface Item {
  id: string;
  pg: string;
  kind: "text" | "white";
  /** box on the page as shown, fractions from the top-left */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  font: Font;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
}
export interface EditSummary {
  texts: number;
  whiteouts: number;
  removed: number;
  added: number;
  rotated: number;
  moved: boolean;
}

const FAMILY: Record<Font, string> = { sans: "Helvetica, Arial, sans-serif", serif: "'Times New Roman', Times, serif", mono: "'Courier New', Courier, monospace" };
const FONT_LABEL: Record<Font, string> = { sans: "Sans (Helvetica)", serif: "Serif (Times)", mono: "Mono (Courier)" };
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32];
const COLOURS = [
  { v: "#111111", n: "Black" },
  { v: "#1d4ed8", n: "Blue" },
  { v: "#b42323", n: "Red" },
  { v: "#0f7a4d", n: "Green" },
];
const LINE = 1.25;
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** How a page is shown: its size after rotation, and the total rotation for pdf.js. */
function shown(pg: Pg, src: SrcInfo[], blank: { w: number; h: number }) {
  const base = pg.src === null ? 0 : src[pg.src].base;
  const size = pg.src === null ? blank : { w: src[pg.src].w, h: src[pg.src].h };
  /* src sizes are with the page's own rotation; the extra rotation swaps when odd */
  const swap = pg.rot % 180 !== 0;
  return { w: swap ? size.h : size.w, h: swap ? size.w : size.h, total: (base + pg.rot) % 360 };
}

function Canvas({ doc, src, rotation, width }: { doc: PDFDocumentProxy; src: number; rotation: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    void doc.getPage(src + 1).then((p) => {
      const c = ref.current;
      if (!alive || !c || width <= 0) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const one = p.getViewport({ scale: 1, rotation });
      const vp = p.getViewport({ scale: (width / one.width) * ratio, rotation });
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
  }, [doc, src, rotation, width]);
  return <canvas ref={ref} />;
}

/** Lines of text that fit in a width (same rule when drawing the PDF). */
function wrap(text: string, fits: (s: string) => boolean): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (!line || fits(next)) line = next;
      else {
        out.push(line.trimEnd());
        line = word.trimStart();
        while (line && !fits(line)) {
          /* one long word: break it */
          let k = line.length - 1;
          while (k > 1 && !fits(line.slice(0, k))) k--;
          out.push(line.slice(0, k));
          line = line.slice(k);
        }
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export default function PageEditor({ file, onDone, onClose }: { file: File; onDone: (f: File, s: EditSummary) => void; onClose: () => void }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [src, setSrc] = useState<SrcInfo[]>([]);
  const [pages, setPages] = useState<Pg[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<string | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [style, setStyle] = useState<Pick<Item, "font" | "size" | "bold" | "italic" | "color">>({ font: "sans", size: 11, bold: false, italic: false, color: "#111111" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [width, setWidth] = useState(0);
  const main = useRef<HTMLDivElement>(null);
  /* the text box just placed, to put the cursor in it when it appears */
  const fresh = useRef<string | null>(null);
  const drag = useRef<{ id: string; mode: "move" | "size" | "draw"; px: number; py: number; ox: number; oy: number; ow: number; oh: number; rect: DOMRect } | null>(null);

  /* open the PDF and read each page's size */
  useEffect(() => {
    let alive = true;
    let d: PDFDocumentProxy | null = null;
    openPdf(file)
      .then(async (x) => {
        d = x;
        const info: SrcInfo[] = [];
        for (let i = 1; i <= x.numPages; i++) {
          const p = await x.getPage(i);
          const v = p.getViewport({ scale: 1 });
          info.push({ w: v.width, h: v.height, base: p.rotate });
        }
        if (!alive) return;
        setDoc(x);
        setSrc(info);
        const pgs = info.map((_, i) => ({ id: uid(), src: i, rot: 0 as Rot }));
        setPages(pgs);
        setCur(pgs[0]?.id ?? null);
      })
      .catch(() => alive && setErr("This PDF could not be opened here."));
    return () => {
      alive = false;
      void d?.destroy();
    };
  }, [file]);

  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const fit = () => setWidth(Math.max(200, Math.min(820, Math.floor(el.clientWidth) - (el.clientWidth < 600 ? 16 : 32))));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [doc]);

  const blank = useMemo(() => (src[0] ? { w: src[0].w, h: src[0].h } : { w: 595.28, h: 841.89 }), [src]);
  const selected = items.find((i) => i.id === sel) ?? null;

  /* the toolbar style follows the selected text box, and changes it */
  function setStyleAll(patch: Partial<typeof style>) {
    setStyle((s) => ({ ...s, ...patch }));
    if (selected?.kind === "text") setItems((l) => l.map((i) => (i.id === selected.id ? { ...i, ...patch } : i)));
  }
  function pickItem(i: Item) {
    setSel(i.id);
    setCur(i.pg);
    if (i.kind === "text") setStyle({ font: i.font, size: i.size, bold: i.bold, italic: i.italic, color: i.color });
  }
  const remove = (id: string) => {
    setItems((l) => l.filter((i) => i.id !== id));
    if (sel === id) setSel(null);
  };

  /* keyboard: Delete removes a selected white-out (text boxes keep their own keys) */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!selected || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(selected.id);
      }
      if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  /* pointer: place text, draw white-out, move and resize */
  function onPageDown(e: RPointerEvent<HTMLDivElement>, pg: Pg, h: number) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = clamp((e.clientX - rect.left) / rect.width);
    const fy = clamp((e.clientY - rect.top) / rect.height);
    setCur(pg.id);
    if (tool === "text") {
      const lineH = (style.size * LINE) / h;
      const it: Item = { id: uid(), pg: pg.id, kind: "text", x: fx, y: clamp(fy - lineH / 2), w: Math.min(0.4, 1 - fx), h: lineH * 1.35, text: "", ...style };
      /* keep the click from moving focus to the page, then put the cursor in the new box */
      e.preventDefault();
      setItems((l) => [...l, it]);
      setSel(it.id);
      setTool("select");
      fresh.current = it.id;
      return;
    }
    if (tool === "white") {
      const it: Item = { id: uid(), pg: pg.id, kind: "white", x: fx, y: fy, w: 0.001, h: 0.001, text: "", ...style };
      setItems((l) => [...l, it]);
      setSel(it.id);
      drag.current = { id: it.id, mode: "draw", px: e.clientX, py: e.clientY, ox: fx, oy: fy, ow: 0, oh: 0, rect };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    setSel(null);
  }
  function startDrag(e: RPointerEvent, it: Item, mode: "move" | "size") {
    e.stopPropagation();
    e.preventDefault();
    const pageEl = (e.currentTarget as HTMLElement).closest(".fpe-over") as HTMLElement | null;
    if (!pageEl) return;
    pickItem(it);
    drag.current = { id: it.id, mode, px: e.clientX, py: e.clientY, ox: it.x, oy: it.y, ow: it.w, oh: it.h, rect: pageEl.getBoundingClientRect() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: RPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.px) / d.rect.width;
    const dy = (e.clientY - d.py) / d.rect.height;
    setItems((l) =>
      l.map((i) => {
        if (i.id !== d.id) return i;
        if (d.mode === "move") return { ...i, x: clamp(d.ox + dx, 0, 1 - i.w), y: clamp(d.oy + dy, 0, 1 - i.h) };
        if (d.mode === "size") return { ...i, w: clamp(d.ow + dx, 0.02, 1 - i.x), h: clamp(d.oh + dy, 0.01, 1 - i.y) };
        /* draw: from the press point to here, any direction */
        const x2 = clamp(d.ox + dx), y2 = clamp(d.oy + dy);
        return { ...i, x: Math.min(d.ox, x2), y: Math.min(d.oy, y2), w: Math.abs(x2 - d.ox), h: Math.abs(y2 - d.oy) };
      }),
    );
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "draw") {
      setItems((l) => l.map((i) => (i.id === d.id && (i.w < 0.01 || i.h < 0.006) ? { ...i, w: Math.max(i.w, 0.15), h: Math.max(i.h, 0.025) } : i)));
      setTool("select");
    }
  }

  /* pages */
  const curIdx = Math.max(0, pages.findIndex((p) => p.id === cur));
  function movePage(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= pages.length) return;
    setPages((l) => {
      const n = [...l];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }
  const rotate = (id: string) => setPages((l) => l.map((p) => (p.id === id ? { ...p, rot: (((p.rot + 90) % 360) as Rot) } : p)));
  function dropPage(id: string) {
    if (pages.length < 2) return;
    setPages((l) => l.filter((p) => p.id !== id));
    setItems((l) => l.filter((i) => i.pg !== id));
    if (cur === id) setCur(null);
  }
  function addBlank() {
    const pg: Pg = { id: uid(), src: null, rot: 0 };
    setPages((l) => [...l.slice(0, curIdx + 1), pg, ...l.slice(curIdx + 1)]);
    setCur(pg.id);
    requestAnimationFrame(() => document.getElementById(`fpe-p-${pg.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  const goTo = (id: string) => {
    setCur(id);
    document.getElementById(`fpe-p-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const summary = (): EditSummary => {
    const kept = items.filter((i) => i.kind === "white" || i.text.trim());
    const srcLeft = pages.filter((p) => p.src !== null).map((p) => p.src as number);
    return {
      texts: kept.filter((i) => i.kind === "text").length,
      whiteouts: kept.filter((i) => i.kind === "white").length,
      removed: src.length - srcLeft.length,
      added: pages.filter((p) => p.src === null).length,
      rotated: pages.filter((p) => p.rot).length,
      moved: srcLeft.some((v, k) => k > 0 && v < srcLeft[k - 1]),
    };
  };

  /* burn everything into a new PDF */
  async function done() {
    const s = summary();
    if (!s.texts && !s.whiteouts && !s.removed && !s.added && !s.rotated && !s.moved) return onClose();
    setBusy(true);
    setErr("");
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
      /* edited in place: pages keep their own content, links and fonts (a copy would repeat
         every font on every page), and only what was added is drawn on top */
      const out = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
      const original = out;
      const orig = out.getPages();
      const firstRot = orig.map((pp) => pp.getRotation().angle);
      for (let k = out.getPageCount() - 1; k >= 0; k--) out.removePage(k);
      const cache = new Map<string, Awaited<ReturnType<typeof out.embedFont>>>();
      const NAMES: Record<Font, string[]> = {
        sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
        serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
        mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
      };
      const fontOf = async (i: Item) => {
        const name = NAMES[i.font][(i.bold ? 1 : 0) + (i.italic ? 2 : 0)];
        if (!cache.has(name)) cache.set(name, await out.embedFont(name));
        return cache.get(name)!;
      };
      const hex = (c: string) => rgb(parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255);

      for (const pg of pages) {
        const view = shown(pg, src, blank);
        let page;
        let total = 0;
        if (pg.src === null) page = out.addPage([view.w, view.h]);
        else {
          page = out.addPage(orig[pg.src]);
          total = (((firstRot[pg.src] + pg.rot) % 360) + 360) % 360;
          page.setRotation(degrees(total));
        }
        /* the page as shown (D wide, E tall, from the top-left) → the page's own space */
        const box = page.getCropBox();
        const w = box.width, h = box.height;
        const D = total % 180 ? h : w, E = total % 180 ? w : h;
        const at = (dx: number, dy: number): [number, number] =>
          total === 90 ? [box.x + dy, box.y + dx] : total === 180 ? [box.x + w - dx, box.y + dy] : total === 270 ? [box.x + w - dy, box.y + h - dx] : [box.x + dx, box.y + h - dy];
        for (const it of items.filter((i) => i.pg === pg.id)) {
          if (it.kind === "white") {
            const a1 = at(it.x * D, it.y * E), a2 = at((it.x + it.w) * D, (it.y + it.h) * E);
            page.drawRectangle({ x: Math.min(a1[0], a2[0]), y: Math.min(a1[1], a2[1]), width: Math.abs(a2[0] - a1[0]), height: Math.abs(a2[1] - a1[1]), color: rgb(1, 1, 1) });
            continue;
          }
          if (!it.text.trim()) continue;
          const f = await fontOf(it);
          /* only characters the font can write (the standard PDF fonts are Latin-1) */
          const safe = [...it.text]
            .map((ch) => {
              if (ch === "\n") return ch;
              try {
                f.encodeText(ch);
                return ch;
              } catch {
                return /[‘’]/.test(ch) ? "'" : /[“”]/.test(ch) ? '"' : /[–—]/.test(ch) ? "-" : "?";
              }
            })
            .join("");
          const lines = wrap(safe, (t) => f.widthOfTextAtSize(t, it.size) <= it.w * D);
          let dy = it.y * E + it.size * 0.95;
          for (const line of lines) {
            if (line) {
              const [x, y] = at(it.x * D + 1, dy);
              page.drawText(line, { x, y, size: it.size, font: f, color: hex(it.color), rotate: degrees(total) });
            }
            dy += it.size * LINE;
          }
        }
      }
      out.setTitle(original.getTitle() ?? file.name.replace(/\.pdf$/i, ""));
      const bytes = await out.save();
      onDone(new File([bytes.buffer as ArrayBuffer], file.name.replace(/\.pdf$/i, "") + ".pdf", { type: "application/pdf" }), s);
    } catch (e) {
      setErr(/encrypt/i.test(e instanceof Error ? e.message : "") ? "This PDF is password-protected, so it can't be edited here. Remove the password first." : "The changes could not be saved. Please try again.");
      setBusy(false);
    }
  }

  const textSel = selected?.kind === "text";
  return (
    <div className="fpe" role="dialog" aria-modal="true" aria-label="Edit document" onPointerMove={onMove} onPointerUp={onUp}>
      <header className="fpe-top">
        <div className="fpe-t">
          <b>Edit document</b>
          <small>{file.name}</small>
        </div>
        <div className="fpe-tools" role="toolbar" aria-label="Editing tools">
          <div className="fpe-grp">
            <button className={tool === "select" ? "on" : ""} onClick={() => setTool("select")} title="Select, move and resize">
              <Ic n="chev" s={15} /> Select
            </button>
            <button className={tool === "text" ? "on" : ""} onClick={() => (setTool("text"), setSel(null))} title="Click on a page to type">
              <Ic n="type" s={15} /> Add text
            </button>
            <button className={tool === "white" ? "on" : ""} onClick={() => (setTool("white"), setSel(null))} title="Drag over words to cover them">
              <Ic n="box" s={15} /> White-out
            </button>
          </div>
          <div className={`fpe-grp ${textSel || tool === "text" ? "" : "dim"}`} aria-label="Text style">
            <select value={style.font} onChange={(e) => setStyleAll({ font: e.target.value as Font })} aria-label="Font">
              {(Object.keys(FONT_LABEL) as Font[]).map((f) => (
                <option key={f} value={f}>
                  {FONT_LABEL[f]}
                </option>
              ))}
            </select>
            <select value={style.size} onChange={(e) => setStyleAll({ size: Number(e.target.value) })} aria-label="Size">
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} pt
                </option>
              ))}
            </select>
            <button className={`sq ${style.bold ? "on" : ""}`} onClick={() => setStyleAll({ bold: !style.bold })} aria-pressed={style.bold} title="Bold">
              <b>B</b>
            </button>
            <button className={`sq ${style.italic ? "on" : ""}`} onClick={() => setStyleAll({ italic: !style.italic })} aria-pressed={style.italic} title="Italic">
              <i>I</i>
            </button>
            {COLOURS.map((c) => (
              <button key={c.v} className={`dot ${style.color === c.v ? "on" : ""}`} style={{ ["--c" as string]: c.v }} onClick={() => setStyleAll({ color: c.v })} title={c.n} aria-label={c.n} />
            ))}
          </div>
          {selected && (
            <button className="fpe-del" onClick={() => remove(selected.id)} title="Delete (Del)">
              <Ic n="x" s={14} /> Delete {selected.kind === "white" ? "white-out" : "text"}
            </button>
          )}
        </div>
        <div className="fpe-act">
          <button className="fds-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="fds-btn ink" onClick={() => void done()} disabled={busy || !doc}>
            {busy ? "Saving…" : "Use this version"}
          </button>
        </div>
      </header>
      {err && <div className="fds-err fpe-err">{err}</div>}

      <div className="fpe-body">
        <aside className="fpe-strip" aria-label="Pages">
          {doc &&
            pages.map((pg, i) => {
              const v = shown(pg, src, blank);
              return (
                <div key={pg.id} className={`fpe-th ${pg.id === cur ? "on" : ""}`}>
                  <button className="fpe-thimg" style={{ aspectRatio: `${v.w} / ${v.h}` }} onClick={() => goTo(pg.id)} aria-label={`Go to page ${i + 1}`}>
                    {pg.src !== null ? <Canvas doc={doc} src={pg.src} rotation={v.total} width={84} /> : <span className="blank">Blank</span>}
                  </button>
                  <span className="n">{i + 1}</span>
                  <div className="fpe-thact">
                    <button onClick={() => movePage(i, -1)} disabled={i === 0} title="Move up" aria-label={`Move page ${i + 1} up`}>
                      ↑
                    </button>
                    <button onClick={() => movePage(i, 1)} disabled={i === pages.length - 1} title="Move down" aria-label={`Move page ${i + 1} down`}>
                      ↓
                    </button>
                    <button onClick={() => rotate(pg.id)} title="Rotate" aria-label={`Rotate page ${i + 1}`}>
                      ⟳
                    </button>
                    <button onClick={() => dropPage(pg.id)} disabled={pages.length < 2} title="Remove page" aria-label={`Remove page ${i + 1}`}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          {doc && (
            <button className="fpe-add" onClick={addBlank}>
              <Ic n="plus" s={14} /> Blank page
            </button>
          )}
        </aside>

        <main ref={main} className={`fpe-main tool-${tool}`}>
          {!doc && !err && <p className="fds-muted">Loading the document…</p>}
          {doc &&
            width > 0 &&
            pages.map((pg, i) => {
              const v = shown(pg, src, blank);
              const scale = width / v.w;
              return (
                <section key={pg.id} id={`fpe-p-${pg.id}`} className={`fpe-page ${pg.id === cur ? "on" : ""}`} style={{ width, aspectRatio: `${v.w} / ${v.h}` }}>
                  {pg.src !== null && <Canvas doc={doc} src={pg.src} rotation={v.total} width={width} />}
                  <div className="fpe-over" onPointerDown={(e) => onPageDown(e, pg, v.h)}>
                    {items
                      .filter((it) => it.pg === pg.id)
                      .map((it) => (
                        <div
                          key={it.id}
                          className={`fpe-it ${it.kind} ${it.id === sel ? "on" : ""}`}
                          style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${it.w * 100}%`, height: `${it.h * 100}%` }}
                          onPointerDown={(e) => (it.kind === "white" ? startDrag(e, it, "move") : (e.stopPropagation(), pickItem(it)))}
                        >
                          {it.kind === "text" && (
                            <>
                              <textarea
                                id={`fpe-t-${it.id}`}
                                /* focused as soon as it appears, so the first letters typed aren't lost */
                                ref={(el) => {
                                  if (el && fresh.current === it.id) {
                                    fresh.current = null;
                                    el.focus();
                                  }
                                }}
                                value={it.text}
                                placeholder="Type here"
                                spellCheck
                                onFocus={() => pickItem(it)}
                                onChange={(e) => {
                                  /* the box grows with the text, like typing in Word */
                                  const ta = e.target;
                                  const pageH = ta.closest(".fpe-over")?.getBoundingClientRect().height ?? 0;
                                  const need = pageH ? ta.scrollHeight / pageH : 0;
                                  setItems((l) => l.map((x) => (x.id === it.id ? { ...x, text: ta.value, h: Math.min(1 - x.y, Math.max(x.h, need)) } : x)));
                                }}
                                style={{ fontFamily: FAMILY[it.font], fontSize: it.size * scale, lineHeight: LINE, fontWeight: it.bold ? 700 : 400, fontStyle: it.italic ? "italic" : "normal", color: it.color }}
                              />
                              <span className="grip" onPointerDown={(e) => startDrag(e, it, "move")} title="Drag to move" aria-hidden>
                                ⠿
                              </span>
                            </>
                          )}
                          <span className="size" onPointerDown={(e) => startDrag(e, it, "size")} aria-hidden />
                        </div>
                      ))}
                  </div>
                  <span className="fpe-no">
                    {i + 1} / {pages.length}
                    {pg.src === null ? " · new" : ""}
                  </span>
                </section>
              );
            })}
        </main>
      </div>
      <footer className="fpe-foot">
        {tool === "text" ? "Click on a page where the text should go." : tool === "white" ? "Drag over the words to cover. Then use Add text to type over them." : "Click a box to change it. Drag ⠿ to move, the corner to resize. Changes are added to a new copy; your original file stays as it is."}
      </footer>
    </div>
  );
}
