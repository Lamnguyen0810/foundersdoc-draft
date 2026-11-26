"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfInfo } from "@/lib/sign/boxes";
import { assemble, attachmentPages, bestPage, findPages, insideText, pageOrder, placeText } from "@/lib/sign/supplements";
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
 *
 * 0300: every supplemental document shows its own pages in the strip (click one to see it large), and a document
 * can go INSIDE another one: drop it between the Constitution's pages and it goes there ("after page 3 of
 * “Constitution”"). Each one can be downloaded, or all of them together as the final PDF.
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
  /** where it goes: inside the main document (null) or inside another supplemental document (its key) */
  parent: string | null;
  /** pages of its parent before it (0 = at the start, all = at the end) */
  after: number;
  /** its text, to find a page inside it ("Schedule 1") */
  info: PdfInfo;
  /** how it was placed, for the audit trail: a page number, or the words on that page */
  words: string | null;
}
type Slide = { src: string; page: number };
type At = { parent: string | null; after: number };
const gid = (a: At) => `${a.parent ?? "main"}:${a.after}`;
/** a file name from a label: no characters Windows refuses */
const fileName = (s: string) => `${s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Document"}.pdf`;
/** hand the viewer a file to save */
export function saveFile(data: Blob | Uint8Array, name: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
let seq = 0;

export default function Supplements({ file, info, toPdf, onInserted }: { file: File; info: PdfInfo; toPdf: (f: File) => Promise<File | null>; onInserted: (f: File, lines: string[], pages: number) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  /* drag and hold (0298): while the mouse or finger is down, the block moves through the pages live; let go to place it */
  const [live, setLive] = useState<{ key: string; at: At } | null>(null);
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
  const where = (it: Item): At => (live && live.key === it.key ? live.at : { parent: it.parent, after: it.after });
  const byKey = (k: string | null) => (k ? (items.find((i) => i.key === k) ?? null) : null);
  const pagesOf = (k: string | null) => (k ? (byKey(k)?.pages ?? 0) : n);
  /* "after page 5" · "after page 3 of “Constitution”" */
  const placeLine = (it: Item, at: At = { parent: it.parent, after: it.after }, words = it.words) => {
    const parent = byKey(at.parent);
    if (!parent) return placeText(words ? { mode: "text", text: words, page: at.after } : at.after >= n ? { mode: "end" } : at.after === 0 ? { mode: "start" } : { mode: "page", page: at.after }, n);
    return insideText(words, at.after, parent.pages, parent.label || parent.file.name);
  };
  /* a document and the ones inside it (it cannot go inside those) */
  const family = (key: string) => {
    const out = new Set([key]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const i of items)
        if (i.parent && out.has(i.parent) && !out.has(i.key)) {
          out.add(i.key);
          grew = true;
        }
    }
    return out;
  };
  /* the final order, page by page: what the preview and the large view walk through */
  const slides = useMemo<Slide[]>(
    () => pageOrder(n, items.map((i) => ({ key: i.key, pages: i.pages, ...(live && live.key === i.key ? live.at : { parent: i.parent, after: i.after }) }))),
    [items, n, live],
  );

  /* the gap nearest the pointer: the point where a document would start (a gap's left edge, at mid-height).
     A little stickiness, so the pages moving aside never make it jump back and forth. */
  function nearest(x: number, y: number, current: string | null): At | null {
    const els = strip.current?.querySelectorAll<HTMLElement>("[data-gap]");
    if (!els?.length) return null;
    let best: { g: string; at: At; d: number } | null = null;
    let cur: number | null = null;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const g = el.dataset.gap!;
      const at: At = { parent: el.dataset.parent || null, after: Number(el.dataset.after) };
      const ax = r.left + 6;
      const ay = r.top + Math.min(r.height, 140) / 2;
      const d = Math.hypot((x - ax) * 1, (y - ay) * 1.6);
      if (g === current) cur = d;
      if (!best || d < best.d) best = { g, at, d };
    }
    if (best && current !== null && cur !== null && best.g !== current && cur - best.d < 24) return null;
    return best?.at ?? null;
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
      const cur = gid(liveRef.current?.key === it.key ? liveRef.current.at : { parent: it.parent, after: it.after });
      const g = nearest(ev.clientX, ev.clientY, cur);
      if (g !== null && gid(g) !== cur) {
        liveRef.current = { key: it.key, at: g };
        setLive({ key: it.key, at: g });
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
      /* a click (no drag): see its pages large */
      if (!pr.moved) return void setBig(slides.findIndex((x) => x.src === it.key));
      if (ev.type !== "pointercancel" && l?.key === it.key && gid(l.at) !== gid({ parent: it.parent, after: it.after })) putAt(it.key, l.at);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  /* the same with the keyboard: ← → move it one gap, Home / End to the start or the end */
  const keys = (e: React.KeyboardEvent<HTMLButtonElement>, it: Item) => {
    const max = pagesOf(it.parent);
    const to = e.key === "ArrowLeft" || e.key === "ArrowUp" ? it.after - 1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? it.after + 1 : e.key === "Home" ? 0 : e.key === "End" ? max : null;
    if (to === null) return;
    e.preventDefault();
    putAt(it.key, { parent: it.parent, after: Math.max(0, Math.min(max, to)) });
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
    const taken = new Set(items.filter((i) => !i.parent).map((i) => i.after));
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
          parent: null,
          after: cover ? cover.page : n,
          info: i,
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

  function putAt(key: string | null, at: At) {
    if (!key || (at.parent && family(key).has(at.parent))) return;
    set(key, { parent: at.parent, after: at.after, words: null });
    setFind((f) => ({ ...f, [key]: "" }));
  }
  /* the words are looked for in the main document first, then in the other supplemental documents */
  const search = (it: Item, words: string): { at: At; hits: number[]; in: string } | null => {
    const q = words.trim();
    if (q.length < 2) return null;
    const p = bestPage(info, q);
    if (p) return { at: { parent: null, after: p }, hits: findPages(info, q), in: "" };
    const mine = family(it.key);
    for (const o of items) {
      if (mine.has(o.key)) continue;
      const op = bestPage(o.info, q);
      if (op) return { at: { parent: o.key, after: op }, hits: findPages(o.info, q), in: o.label || o.file.name };
    }
    return null;
  };
  function byWords(it: Item, words: string) {
    setFind((f) => ({ ...f, [it.key]: words }));
    const hit = search(it, words);
    if (hit) set(it.key, { parent: hit.at.parent, after: hit.at.after, words: words.trim() });
  }
  function remove(it: Item) {
    void it.doc.destroy();
    /* the documents inside it stay where it was */
    setItems((l) => l.filter((x) => x.key !== it.key).map((x) => (x.parent === it.key ? { ...x, parent: it.parent, after: it.after, words: null } : x)));
    if (sel === it.key) setSel(null);
  }

  /* one PDF in the final order (for Insert, and for Download all) */
  const together = async () =>
    assemble(
      new Uint8Array(await file.arrayBuffer()),
      await Promise.all(items.map(async (it) => ({ key: it.key, name: it.label.trim() || it.file.name.replace(/\.pdf$/i, ""), bytes: new Uint8Array(await it.file.arrayBuffer()), parent: it.parent, after: it.after, words: it.words }))),
    );
  async function downloadAll() {
    setErr("");
    setBusy("download");
    try {
      const out = await together();
      saveFile(out.bytes, fileName(`${file.name.replace(/\.pdf$/i, "")} (with supplemental documents)`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The documents could not be put together.");
    } finally {
      setBusy("");
    }
  }

  async function insert() {
    setErr("");
    setBusy("insert");
    try {
      const out = await together();
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

  /* one gap between pages (of the main document, or of a supplemental one): the documents placed there come
     right after it, each a coloured tab followed by its own pages. While one is chosen, a "+" to put it here. */
  const gap = (parent: string | null, g: number, out: ReactNode[]) => {
    const here = items.filter((i) => gid(where(i)) === gid({ parent, after: g }));
    const chosen = sel ? family(sel) : null;
    const target = !!sel && !live && !(parent && chosen?.has(parent));
    const pages = pagesOf(parent);
    const label = parent ? insideText(null, g, pages, byKey(parent)?.label ?? "") : g === 0 ? "at the start" : g >= n ? "at the end" : `after page ${g}`;
    out.push(
      <div key={`g${gid({ parent, after: g })}`} data-gap={gid({ parent, after: g })} data-parent={parent ?? ""} data-after={g} className={`fds-gap ${here.length ? "has" : ""} ${target ? "target" : ""} ${live && gid(live.at) === gid({ parent, after: g }) ? "over" : ""}`}>
        {target && !here.some((i) => i.key === sel) && (
          <button type="button" className="fds-gap-put" onClick={() => (putAt(sel, { parent, after: g }), setSel(null))} aria-label={`Put it ${label}`} title={`Put it ${label}`}>
            <Ic n="plus" s={13} />
          </button>
        )}
      </div>,
    );
    for (const it of here) {
      out.push(
        <button
          key={`b${it.key}`}
          type="button"
          className={`fds-block ${sel === it.key ? "on" : ""} ${live?.key === it.key ? "lifting" : ""}`}
          style={{ ["--t" as string]: it.tone }}
          onPointerDown={(e) => down(e, it)}
          onKeyDown={(e) => keys(e, it)}
          aria-label={`${it.label}, ${placeLine(it)}. Drag it, or use the arrow keys, to move it. Click to see its pages`}
          title="Hold and drag to move it (between any pages, even inside another document). Click to see its pages"
        >
          <span className="grip" aria-hidden="true">⠿</span>
          <b>{it.label || it.file.name}</b>
          <small>
            {it.pages} {it.pages === 1 ? "page" : "pages"} · p{startOf(it.key)}–{startOf(it.key) + it.pages - 1}
          </small>
        </button>,
      );
      /* its own pages (not while it is being dragged: then only its tab moves) */
      if (live?.key !== it.key) run(it.key, out);
    }
  };
  /* a document's pages with the gaps between them, in order */
  const run = (src: string | null, out: ReactNode[]) => {
    const it = byKey(src);
    const pages = pagesOf(src);
    gap(src, 0, out);
    for (let p = 1; p <= pages; p++) {
      const cover = !it ? coverAt(p) : undefined;
      out.push(
        <button
          key={`p${src ?? "main"}:${p}`}
          type="button"
          role="listitem"
          className={`fds-pg ${it ? "sub" : ""}`}
          style={it ? { ["--t" as string]: it.tone } : undefined}
          onClick={() => setBig(slides.findIndex((x) => x.src === (src ?? "main") && x.page === p))}
          aria-label={it ? `${it.label}, its page ${p}` : `Page ${p}${cover ? `, ${cover.heading}` : ""}`}
        >
          <Thumb doc={it ? it.doc : mainDoc} page={p} w={70} />
          <i>{p}</i>
          {cover && <em>{cover.heading}</em>}
        </button>,
      );
      gap(src, p, out);
    }
  };
  const stripNodes = () => {
    const out: ReactNode[] = [];
    run(null, out);
    return out;
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
              const typed = (find[it.key] ?? "").trim();
              const hit = typed.length >= 2 ? search(it, typed) : null;
              return (
                <div key={it.key} className={`fds-supp-card ${sel === it.key ? "on" : ""}`} style={{ ["--t" as string]: it.tone }}>
                  <span className="dot" />
                  <div className="fds-supp-main">
                    <input className="fds-inp fds-supp-label" value={it.label} maxLength={120} aria-label="Label for this document" placeholder="Label, e.g. Restated Constitution" onChange={(e) => set(it.key, { label: e.target.value })} />
                    <small>
                      {it.file.name} · {it.pages} {it.pages === 1 ? "page" : "pages"} · <b className="fds-supp-ok">goes {placeLine(it)}</b>
                    </small>
                    <div className="fds-supp-where">
                      <button type="button" className={`fds-btn sm ${sel === it.key ? "ink" : ""}`} onClick={() => setSel(sel === it.key ? null : it.key)}>
                        {sel === it.key ? "Now click a + below" : "Choose on the pages"}
                      </button>
                      <span>or find the page that says</span>
                      <input className="fds-inp" value={find[it.key] ?? ""} maxLength={80} placeholder="e.g. Appendix B" aria-label="Words on the page" onChange={(e) => byWords(it, e.target.value)} />
                    </div>
                    {typed.length >= 2 && (
                      <small className={hit ? "fds-supp-ok" : "fds-supp-bad"}>
                        {hit
                          ? `Found on page${hit.hits.length > 1 ? "s" : ""} ${hit.hits.join(", ")}${hit.in ? ` of “${hit.in}”` : ""}: placed after page ${hit.at.after}${hit.hits.length > 1 ? " (its heading page)" : ""}`
                          : `“${typed}” is not in the document or the other supplemental documents. Check the spelling, or choose on the pages.`}
                      </small>
                    )}
                  </div>
                  <span className="ops">
                    <button className="fds-ico" aria-label={`See the pages of ${it.label}`} title="See its pages" onClick={() => setBig(slides.findIndex((x) => x.src === it.key))}>
                      <Ic n="eye" s={15} />
                    </button>
                    <button className="fds-ico" aria-label={`Download ${it.label}`} title="Download it" onClick={() => saveFile(it.file, fileName(it.label || it.file.name.replace(/\.pdf$/i, "")))}>
                      <Ic n="download" s={15} />
                    </button>
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
              <small>{live ? "Let go where it should go." : sel ? "Click a + to put it there, or hold the coloured tab and drag it." : "Hold a coloured tab and drag it between any pages, even inside another document. Click a page to see it large."}</small>
              <button type="button" className="fds-btn sm fds-supp-dl" disabled={!!busy} onClick={() => void downloadAll()}>
                <Ic n="download" s={14} /> {busy === "download" ? "Preparing…" : "Download all as one PDF"}
              </button>
            </div>
            <div ref={strip} className={`fds-strip ${live ? "dragging" : ""}`} role="list" aria-label="Pages of the final document">
              {stripNodes()}
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
          {live && byKey(live.key) && <small>{placeLine(byKey(live.key)!, live.at, null)}</small>}
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
