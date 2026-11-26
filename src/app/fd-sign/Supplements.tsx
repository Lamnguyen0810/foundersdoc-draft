"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfInfo } from "@/lib/sign/boxes";
import { attachmentPages, bestPage, findPages, insertPdfs, placeText, type Place } from "@/lib/sign/supplements";
import { openPdf, readPdf } from "../sign/PdfPages";
import { Ic } from "./ui";

/**
 * Supplemental documents (0296 · 0298 visual): attach other documents and SEE where each goes. The main
 * document's pages are laid out as small pages with a gap between each; every supplemental document is a coloured
 * block sitting in its gap, so the strip is the preview of the final order. Hold a block and drag it: it moves
 * through the pages live, and goes where you let go. Or click it then a "+", use the arrow keys, or type the
 * words on the page (e.g. "Appendix B"). A newly added one goes to the
 * next appendix cover page found ("APPENDIX A", "Annex 1" …), else to the end. Click any page to see it large.
 * "Insert" then makes one PDF in the browser, which goes through Fields like any upload.
 */

const MAX = 10 * 1024 * 1024;
const TONES = ["#2f6fdb", "#1f9d6b", "#c2410c", "#7c3aed", "#be185d", "#0e7490", "#b8862b", "#4d7c0f"];
interface Item {
  key: string;
  file: File;
  label: string;
  pages: number;
  doc: PDFDocumentProxy;
  tone: string;
  /** pages of the main document before it (0 = at the start, n = at the end) */
  after: number;
  /** how it was placed, for the audit trail: a page number, or the words on that page */
  words: string | null;
}
type Slide = { src: "main"; page: number } | { src: string; page: number };
let seq = 0;

export default function Supplements({ file, info, toPdf, onInserted }: { file: File; info: PdfInfo; toPdf: (f: File) => Promise<File | null>; onInserted: (f: File, lines: string[], pages: number) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  /* drag and hold (0298): while the mouse or finger is down, the block moves through the pages live; let go to place it */
  const [live, setLive] = useState<{ key: string; gap: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string; tone: string } | null>(null);
  const press = useRef<{ key: string; x: number; y: number; moved: boolean; id: number } | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [find, setFind] = useState<Record<string, string>>({});
  const [big, setBig] = useState<number | null>(null);
  const [mainDoc, setMainDoc] = useState<PDFDocumentProxy | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const n = info.pages.length;
  const covers = useMemo(() => attachmentPages(info), [info]);

  useEffect(() => {
    let alive = true;
    let d: PDFDocumentProxy | null = null;
    void openPdf(file).then((x) => {
      d = x;
      if (alive) setMainDoc(x);
      else void x.destroy();
    });
    return () => {
      alive = false;
      void d?.destroy();
    };
  }, [file]);
  useEffect(() => () => items.forEach((i) => void i.doc.destroy()), []); // eslint-disable-line react-hooks/exhaustive-deps -- on leaving only

  const set = (k: string, patch: Partial<Item>) => setItems((l) => l.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  /* where a document is shown: while it is being dragged, where it would land */
  const at = (it: Item) => (live && live.key === it.key ? live.gap : it.after);
  const placeOf = (it: Item): Place => (it.words ? { mode: "text", text: it.words, page: it.after } : it.after >= n ? { mode: "end" } : it.after === 0 ? { mode: "start" } : { mode: "page", page: it.after });
  /* the final order, page by page: what the preview and the large view walk through */
  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    const put = (g: number) => items.filter((i) => (live && live.key === i.key ? live.gap : i.after) === g).forEach((i) => Array.from({ length: i.pages }, (_, k) => out.push({ src: i.key, page: k + 1 })));
    put(0);
    for (let p = 1; p <= n; p++) {
      out.push({ src: "main", page: p });
      put(p);
    }
    return out;
  }, [items, n, live]);

  /* the gap nearest the pointer: the point where a document would start (a gap's left edge, at mid-height).
     A little stickiness, so the pages moving aside never make it jump back and forth. */
  function nearest(x: number, y: number, current: number | null): number | null {
    const els = strip.current?.querySelectorAll<HTMLElement>("[data-gap]");
    if (!els?.length) return null;
    let best: { g: number; d: number } | null = null;
    let cur: number | null = null;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const g = Number(el.dataset.gap);
      const ax = r.left + 6;
      const ay = r.top + Math.min(r.height, 140) / 2;
      const d = Math.hypot((x - ax) * 1, (y - ay) * 1.6);
      if (g === current) cur = d;
      if (!best || d < best.d) best = { g, d };
    }
    if (best && current !== null && cur !== null && best.g !== current && cur - best.d < 24) return current;
    return best?.g ?? null;
  }
  /* near the top or bottom of the strip (or the window) while dragging: scroll, so far pages can be reached */
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const tick = () => {
      const pt = pointer.current;
      const el = strip.current;
      if (pt && el) {
        const r = el.getBoundingClientRect();
        if (pt.y < r.top + 36 && el.scrollTop > 0) el.scrollTop -= 10;
        else if (pt.y > r.bottom - 36 && el.scrollTop < el.scrollHeight - el.clientHeight) el.scrollTop += 10;
        if (pt.y < 60) window.scrollBy(0, -10);
        else if (pt.y > window.innerHeight - 60) window.scrollBy(0, 10);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live]);
  /* the block moves to another gap while it is held (React mounts it again there), so the pointer is followed on
     the window, not on the block */
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  const down = (e: React.PointerEvent<HTMLButtonElement>, it: Item) => {
    if (e.button !== 0) return;
    e.preventDefault();
    press.current = { key: it.key, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    const onMove = (ev: PointerEvent) => {
      const pr = press.current;
      if (!pr || ev.pointerId !== pr.id) return;
      if (!pr.moved && Math.hypot(ev.clientX - pr.x, ev.clientY - pr.y) < 6) return;
      pr.moved = true;
      pointer.current = { x: ev.clientX, y: ev.clientY };
      setGhost({ x: ev.clientX, y: ev.clientY, label: it.label || it.file.name, tone: it.tone });
      const cur = liveRef.current?.key === it.key ? liveRef.current.gap : it.after;
      const g = nearest(ev.clientX, ev.clientY, cur);
      if (g !== null && g !== liveRef.current?.gap) {
        liveRef.current = { key: it.key, gap: g };
        setLive({ key: it.key, gap: g });
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (press.current && ev.pointerId !== press.current.id) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const pr = press.current;
      press.current = null;
      pointer.current = null;
      setGhost(null);
      const l = liveRef.current;
      liveRef.current = null;
      setLive(null);
      if (!pr) return;
      if (!pr.moved) return void setSel((x) => (x === it.key ? null : it.key));
      if (ev.type !== "pointercancel" && l?.key === it.key && l.gap !== it.after) putAt(it.key, l.gap);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  /* the same with the keyboard: ← → move it one gap, Home / End to the start or the end */
  const keys = (e: React.KeyboardEvent<HTMLButtonElement>, it: Item) => {
    const to = e.key === "ArrowLeft" || e.key === "ArrowUp" ? it.after - 1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? it.after + 1 : e.key === "Home" ? 0 : e.key === "End" ? n : null;
    if (to === null) return;
    e.preventDefault();
    putAt(it.key, Math.max(0, Math.min(n, to)));
  };
  /* where each block starts in the final document ("pages 6–29") */
  const startOf = (key: string) => slides.findIndex((x) => x.src === key) + 1;
  /* the large view: Esc closes, the arrow keys turn the page */
  useEffect(() => {
    if (big === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBig(null);
      if (e.key === "ArrowRight") setBig((b) => (b === null ? b : Math.min(b + 1, slides.length - 1)));
      if (e.key === "ArrowLeft") setBig((b) => (b === null ? b : Math.max(b - 1, 0)));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [big, slides.length]);

  async function add(list: FileList | null) {
    setErr("");
    const taken = new Set(items.map((i) => i.after));
    const fresh: Item[] = [];
    for (const raw of [...(list ?? [])].slice(0, 5)) {
      let f: File | null = raw;
      if (f.size > MAX) {
        setErr(`${f.name} is over 10 MB.`);
        continue;
      }
      setBusy(f.name);
      const head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
      if (head[0] === 0x50 && head[1] === 0x4b && /\.docx$/i.test(f.name)) f = await toPdf(f);
      if (!f) continue;
      try {
        const doc = await openPdf(f);
        const i = await readPdf(doc);
        /* the next appendix cover page still free, else the end */
        const cover = covers.find((c) => !taken.has(c.page) && !fresh.some((x) => x.after === c.page));
        fresh.push({
          key: `s${Date.now().toString(36)}${seq++}`,
          file: f,
          label: f.name.replace(/\.(pdf|docx)$/i, "").replace(/_+/g, " ").trim().slice(0, 120),
          pages: i.pages.length,
          doc,
          tone: TONES[(items.length + fresh.length) % TONES.length]!,
          after: cover ? cover.page : n,
          words: cover ? cover.heading : null,
        });
      } catch {
        setErr(`${f.name} could not be opened. Upload a PDF or Word file (.docx); if it has a password, remove it first.`);
      }
    }
    setBusy("");
    if (fresh.length) {
      setItems((l) => [...l, ...fresh].slice(0, 10));
    }
    if (input.current) input.current.value = "";
  }

  function putAt(key: string | null, gap: number) {
    if (!key) return;
    set(key, { after: gap, words: null });
    setFind((f) => ({ ...f, [key]: "" }));
  }
  function byWords(it: Item, words: string) {
    setFind((f) => ({ ...f, [it.key]: words }));
    const p = words.trim().length >= 2 ? bestPage(info, words) : null;
    if (p) set(it.key, { after: p, words: words.trim() });
  }
  function remove(it: Item) {
    void it.doc.destroy();
    setItems((l) => l.filter((x) => x.key !== it.key));
    if (sel === it.key) setSel(null);
  }

  async function insert() {
    setErr("");
    setBusy("insert");
    try {
      const out = await insertPdfs(
        new Uint8Array(await file.arrayBuffer()),
        await Promise.all(items.map(async (it) => ({ name: it.label.trim() || it.file.name.replace(/\.pdf$/i, ""), bytes: new Uint8Array(await it.file.arrayBuffer()), place: placeOf(it) }))),
      );
      const merged = new File([out.bytes as BlobPart], file.name, { type: "application/pdf" });
      if (merged.size > MAX) throw new Error("Together the documents are over 10 MB. Please make the files smaller and try again.");
      onInserted(merged, out.lines, out.pages);
      items.forEach((i) => void i.doc.destroy());
      setItems([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The documents could not be put together.");
    } finally {
      setBusy("");
    }
  }

  const docOf = (s: Slide) => (s.src === "main" ? mainDoc : (items.find((i) => i.key === s.src)?.doc ?? null));
  const itemOf = (s: Slide) => (s.src === "main" ? null : (items.find((i) => i.key === s.src) ?? null));
  const coverAt = (p: number) => covers.find((c) => c.page === p);

  /* one gap between pages: shows the documents placed there; while one is chosen, a "+" to put it here */
  const gap = (g: number) => {
    const here = items.filter((i) => at(i) === g);
    const target = !!sel && !live;
    return (
      <div key={`g${g}`} data-gap={g} className={`fds-gap ${here.length ? "has" : ""} ${target ? "target" : ""} ${live?.gap === g ? "over" : ""}`}>
        {here.map((it) => (
          <button
            key={it.key}
            type="button"
            className={`fds-block ${sel === it.key ? "on" : ""} ${live?.key === it.key ? "lifting" : ""}`}
            style={{ ["--t" as string]: it.tone }}
            onPointerDown={(e) => down(e, it)}
            onKeyDown={(e) => keys(e, it)}
            aria-label={`${it.label}, ${placeText(placeOf(it), n)}. Drag it, or use the arrow keys, to move it`}
            title="Hold and drag to move it; let go where it should go"
          >
            <Thumb doc={it.doc} page={1} w={62} />
            <span>
              <b>{it.label || it.file.name}</b>
              <small>
                {it.pages} {it.pages === 1 ? "page" : "pages"} · p{startOf(it.key)}–{startOf(it.key) + it.pages - 1}
              </small>
            </span>
          </button>
        ))}
        {target && !here.some((i) => i.key === sel) && (
          <button
            type="button"
            className="fds-gap-put"
            onClick={() => (putAt(sel, g), setSel(null))}
            aria-label={g === 0 ? "Put it at the start" : g >= n ? "Put it at the end" : `Put it after page ${g}`}
            title={g === 0 ? "Put it at the start" : g >= n ? "Put it at the end" : `Put it after page ${g}`}
          >
            <Ic n="plus" s={13} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fds-supp">
      <div className="fds-supp-h">
        <span>
          <b>Supplemental documents</b>
          <small>Attach the Constitution, a share resolution or any other document, and put each one exactly where it belongs. The strip below is a preview of the final document.</small>
        </span>
        <button className="fds-btn sm" disabled={!!busy || items.length >= 10} onClick={() => input.current?.click()}>
          <Ic n="plus" s={14} /> Add a document
        </button>
        <input ref={input} type="file" multiple hidden accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => void add(e.target.files)} />
      </div>
      {busy && busy !== "insert" && <p className="fds-muted">Reading {busy}…</p>}

      {items.length > 0 && (
        <>
          <div className="fds-supp-list">
            {items.map((it) => {
              const hits = findPages(info, find[it.key] ?? "");
              const typed = (find[it.key] ?? "").trim();
              return (
                <div key={it.key} className={`fds-supp-card ${sel === it.key ? "on" : ""}`} style={{ ["--t" as string]: it.tone }}>
                  <span className="dot" />
                  <div className="fds-supp-main">
                    <input className="fds-inp fds-supp-label" value={it.label} maxLength={120} aria-label="Label for this document" placeholder="Label, e.g. Restated Constitution" onChange={(e) => set(it.key, { label: e.target.value })} />
                    <small>
                      {it.file.name} · {it.pages} {it.pages === 1 ? "page" : "pages"} · <b className="fds-supp-ok">goes {placeText(placeOf(it), n)}</b>
                    </small>
                    <div className="fds-supp-where">
                      <button type="button" className={`fds-btn sm ${sel === it.key ? "ink" : ""}`} onClick={() => setSel(sel === it.key ? null : it.key)}>
                        {sel === it.key ? "Now click a + below" : "Choose on the pages"}
                      </button>
                      <span>or find the page that says</span>
                      <input className="fds-inp" value={find[it.key] ?? ""} maxLength={80} placeholder="e.g. Appendix B" aria-label="Words on the page" onChange={(e) => byWords(it, e.target.value)} />
                    </div>
                    {typed.length >= 2 && <small className={hits.length ? "fds-supp-ok" : "fds-supp-bad"}>{hits.length ? `Found on page${hits.length > 1 ? "s" : ""} ${hits.join(", ")}: placed after page ${bestPage(info, typed)}${hits.length > 1 ? " (its heading page)" : ""}` : `“${typed}” is not in the document. Check the spelling, or choose on the pages.`}</small>}
                  </div>
                  <span className="ops">
                    <button className="fds-ico" aria-label={`Remove ${it.label}`} onClick={() => remove(it)}>
                      <Ic n="x" s={15} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="fds-supp-preview">
            <div className="fds-supp-ph">
              <b>Preview: {slides.length} pages</b>
              <small>{live ? "Let go where it should go." : sel ? "Click a + to put it there, or hold the coloured block and drag it." : "Hold a coloured block and drag it between the pages; let go where it should go. Click a page to see it large."}</small>
            </div>
            <div ref={strip} className={`fds-strip ${live ? "dragging" : ""}`} role="list" aria-label="Pages of the final document">
              {gap(0)}
              {Array.from({ length: n }, (_, i) => i + 1).map((p) => (
                <span key={p} style={{ display: "contents" }}>
                  <button type="button" role="listitem" className="fds-pg" onClick={() => setBig(slides.findIndex((x) => x.src === "main" && x.page === p))} aria-label={`Page ${p}${coverAt(p) ? `, ${coverAt(p)!.heading}` : ""}`}>
                    <Thumb doc={mainDoc} page={p} w={70} />
                    <i>{p}</i>
                    {coverAt(p) && <em>{coverAt(p)!.heading}</em>}
                  </button>
                  {gap(p)}
                </span>
              ))}
            </div>
          </div>

          <div className="fds-supp-go">
            <button className="fds-btn ink" disabled={!!busy} onClick={() => void insert()}>
              {busy === "insert" ? "Putting them together…" : `Insert ${items.length === 1 ? "it" : `all ${items.length}`} into the document`}
            </button>
            <small>You can place signature boxes on the new pages in step 3, so they can be signed too. Restore original undoes this.</small>
          </div>
        </>
      )}
      {err && <div className="fds-err">{err}</div>}
      {ghost && (
        <div className="fds-ghost" style={{ left: ghost.x + 12, top: ghost.y + 12, ["--t" as string]: ghost.tone }} aria-hidden="true">
          {ghost.label}
          {live && <small>{placeText({ mode: live.gap >= n ? "end" : live.gap === 0 ? "start" : "page", page: live.gap } as Place, n)}</small>}
        </div>
      )}

      {big !== null && slides[big] && (
        <div className="fds-big" role="dialog" aria-modal="true" aria-label="Page preview" onClick={() => setBig(null)}>
          <div className="fds-big-box" onClick={(e) => e.stopPropagation()}>
            <div className="fds-big-h">
              <b>
                Page {big + 1} of {slides.length}
                {itemOf(slides[big]!) ? ` · ${itemOf(slides[big]!)!.label} (its page ${slides[big]!.page})` : ` · your document, page ${slides[big]!.page}`}
              </b>
              <button className="fds-ico" aria-label="Close" onClick={() => setBig(null)}>
                <Ic n="x" s={16} />
              </button>
            </div>
            <div className="fds-big-page" style={itemOf(slides[big]!) ? { boxShadow: `0 0 0 3px ${itemOf(slides[big]!)!.tone}` } : undefined}>
              <Thumb doc={docOf(slides[big]!)} page={slides[big]!.page} w={520} />
            </div>
            <div className="fds-big-f">
              <button className="fds-btn sm" disabled={big === 0} onClick={() => setBig(big - 1)}>
                ← Previous
              </button>
              <button className="fds-btn sm" disabled={big >= slides.length - 1} onClick={() => setBig(big + 1)}>
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** one page drawn small (or large), on a canvas */
function Thumb({ doc, page, w }: { doc: PDFDocumentProxy | null; page: number; w: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    void doc.getPage(page).then((p) => {
      const c = ref.current;
      if (!alive || !c) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: (w / p.getViewport({ scale: 1 }).width) * ratio });
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
  }, [doc, page, w]);
  return <canvas ref={ref} className="fds-thumbc" style={{ width: w }} aria-hidden="true" />;
}
