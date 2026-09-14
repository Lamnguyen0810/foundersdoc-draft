"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { draftToParagraphs, paragraphText } from "@/lib/contract/dom";

/**
 * The editable document: A4 pages, a formatting toolbar, and a save state.
 *
 * ── WHY THE PAGES ARE BUILT BY HAND AND NOT RENDERED BY REACT ───────────────
 * The pages are `contentEditable`. The browser rewrites that DOM as the person
 * types — splitting text nodes, inserting <br>, moving the caret — and React's
 * reconciler assumes it owns what it rendered. Put the two together and you get
 * the classic contentEditable bug: the caret jumps to the start of the document
 * on every keystroke, because React "restored" its own idea of the children.
 *
 * So React owns the toolbar and the status line, and the page container is a
 * ref that React renders once and never touches again. The imperative code
 * below is not a shortcut; it is the thing that makes editing work.
 *
 * Pagination, page-break rules and the zoom-to-fit are ported from the Ver_46
 * design and kept deliberately close to it.
 */

export interface DocumentEditorProps {
  /** The generated draft, as plain text. */
  text: string;
  /** Called when the person saves. `html` is what to store; `plain` for export. */
  onSave?: (html: string, plain: string) => Promise<void> | void;
  /** Previously saved HTML, if this draft has been edited before. */
  savedHtml?: string | null;
  /** Keeps the parent in sync with the exact content currently shown in the editor. */
  onContentChange?: (html: string, plain: string) => void;
}

const A4_RATIO = 297 / 210;
/** Keep a heading with the paragraph beneath it rather than orphaning it. */
const KEEP_WITH_NEXT = /doc-section|doc-label|doc-notes-title/;

export default function DocumentEditor({
  text,
  onSave,
  savedHtml,
  onContentChange,
}: DocumentEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);

  const [pageCount, setPageCount] = useState(1);
  const [pageNow, setPageNow] = useState(1);
  const [words, setWords] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // History and the last-saved snapshot live in refs: changing them must not
  // re-render, or every keystroke would rebuild the toolbar.
  const hist = useRef<string[]>([]);
  const hIdx = useRef(-1);
  const savedSnap = useRef<string | null>(null);
  const histTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── reading the document ─────────────────────────────────────────────── */

  const flowItems = useCallback((): HTMLElement[] => {
    const pages = pagesRef.current;
    if (!pages) return [];
    return Array.from(pages.querySelectorAll<HTMLElement>(".wd-page > *:not(.wd-ftr)"));
  }, []);

  const snapshot = useCallback(
    () => flowItems().map((p) => p.outerHTML).join(""),
    [flowItems],
  );

  const docText = useCallback(
    () =>
      flowItems()
        .filter((p) => !p.classList.contains("doc-end-note"))
        .map(paragraphText)
        .join("\n\n"),
    [flowItems],
  );

  /* ── pagination ───────────────────────────────────────────────────────── */

  const newPage = useCallback((): HTMLElement => {
    const pages = pagesRef.current!;
    const pg = document.createElement("article");
    pg.className = "sheet wd-page";
    pg.contentEditable = "true";
    pg.spellcheck = false;
    pg.setAttribute("aria-label", "Generated legal document");

    const ftr = document.createElement("div");
    ftr.className = "wd-ftr";
    ftr.contentEditable = "false";
    ftr.setAttribute("aria-hidden", "true");
    pg.appendChild(ftr);

    pages.appendChild(pg);
    // A4 proportions, derived from the rendered width so it holds at any zoom.
    pg.style.setProperty("height", `${Math.round(pg.offsetWidth * A4_RATIO)}px`, "important");
    return pg;
  }, []);

  const fitPage = useCallback(() => {
    const sc = scrollRef.current;
    const pages = pagesRef.current;
    const pg = pages?.querySelector<HTMLElement>(".wd-page");
    if (!sc || !pages || !pg) return;
    const cs = getComputedStyle(sc);
    const avail =
      sc.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    // Shrink to fit a narrow panel rather than scrolling sideways — nobody
    // reads a contract by panning left and right.
    const z = Math.max(60, Math.min(100, Math.floor((avail / pg.offsetWidth) * 100)));
    pages.style.zoom = z === 100 ? "" : String(z / 100);
  }, []);

  const countWords = useCallback(() => {
    const m = docText().match(/[A-Za-z0-9À-ɏ'’.-]+/g);
    setWords(m ? m.length : 0);
  }, [docText]);

  const paginate = useCallback(
    (items?: HTMLElement[]) => {
      const pages = pagesRef.current;
      const sc = scrollRef.current;
      if (!pages || !sc) return;

      const list = items ?? flowItems();
      if (!list.length) return;

      if (!sc.offsetWidth) {
        // Not laid out yet (hidden tab, first paint). Put everything on one
        // page so nothing is lost, and let the resize observer come back.
        if (!pages.children.length) {
          const p0 = document.createElement("article");
          p0.className = "sheet wd-page";
          p0.contentEditable = "true";
          list.forEach((p) => p0.appendChild(p));
          pages.appendChild(p0);
        }
        return;
      }

      pages.style.zoom = "";
      pages.innerHTML = "";

      let pg = newPage();
      const limit = pg.clientHeight - (parseFloat(getComputedStyle(pg).paddingBottom) || 0);

      for (const p of list) {
        pg.appendChild(p);
        if (p.offsetTop + p.offsetHeight > limit && pg.children.length > 2) {
          const prev = p.previousElementSibling as HTMLElement | null;
          // Don't leave a heading stranded at the foot of a page.
          const keep = Boolean(prev && KEEP_WITH_NEXT.test(prev.className) && pg.children.length > 3);
          pg = newPage();
          if (keep && prev) pg.appendChild(prev);
          pg.appendChild(p);
        }
      }

      const sheets = Array.from(pages.querySelectorAll<HTMLElement>(".wd-page"));
      sheets.forEach((s, k) => {
        const f = s.querySelector(".wd-ftr");
        if (f) f.textContent = `Page ${k + 1} of ${sheets.length}`;
      });
      setPageCount(sheets.length || 1);
      fitPage();
      countWords();
    },
    [flowItems, newPage, fitPage, countWords],
  );

  /* ── history ──────────────────────────────────────────────────────────── */

  const syncUndo = useCallback(() => {
    setCanUndo(hIdx.current > 0);
    setCanRedo(hIdx.current < hist.current.length - 1);
  }, []);

  const markDirty = useCallback(() => {
    setDirty(savedSnap.current !== null && snapshot() !== savedSnap.current);
  }, [snapshot]);

  const pushHist = useCallback(() => {
    if (histTimer.current) {
      clearTimeout(histTimer.current);
      histTimer.current = null;
    }
    const s = snapshot();
    if (hist.current[hIdx.current] === s) return;
    hist.current = hist.current.slice(0, hIdx.current + 1);
    hist.current.push(s);
    if (hist.current.length > 100) hist.current.shift();
    hIdx.current = hist.current.length - 1;
    syncUndo();
  }, [snapshot, syncUndo]);

  const restore = useCallback(
    (html: string) => {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      paginate(Array.from(tmp.children) as HTMLElement[]);
      syncUndo();
      markDirty();
    },
    [paginate, syncUndo, markDirty],
  );

  const undo = useCallback(() => {
    pushHist();
    if (hIdx.current > 0) {
      hIdx.current -= 1;
      restore(hist.current[hIdx.current]);
    }
  }, [pushHist, restore]);

  const redo = useCallback(() => {
    pushHist();
    if (hIdx.current < hist.current.length - 1) {
      hIdx.current += 1;
      restore(hist.current[hIdx.current]);
    }
  }, [pushHist, restore]);

  /* ── saving ───────────────────────────────────────────────────────────── */

  const save = useCallback(async () => {
    if (saving) return;
    pushHist();
    const html = snapshot();
    setSaving(true);
    try {
      await onSave?.(html, docText());
      savedSnap.current = html;
      setSavedAt(new Date());
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [saving, pushHist, snapshot, docText, onSave]);

  /* ── build once, on mount ─────────────────────────────────────────────── */

  useEffect(() => {
    const pages = pagesRef.current;
    if (!pages) return;

    let items: HTMLElement[];
    if (savedHtml) {
      const tmp = document.createElement("div");
      tmp.innerHTML = savedHtml;
      items = Array.from(tmp.children) as HTMLElement[];
    } else {
      items = draftToParagraphs(document, text);
    }

    pages.innerHTML = "";
    paginate(items);

    const first = flowItems().map((p) => p.outerHTML).join("");
    hist.current = [first];
    hIdx.current = 0;
    savedSnap.current = first;
    syncUndo();
    setDirty(false);
    onContentChange?.(first, docText());
    // Built from `text` once. Re-running on every render would throw away
    // whatever the person has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, savedHtml, onContentChange, docText]);

  /* ── live status ──────────────────────────────────────────────────────── */

  useEffect(() => {
    const sc = scrollRef.current;
    const pages = pagesRef.current;
    if (!sc || !pages) return;

    let statusT: ReturnType<typeof setTimeout> | null = null;

    const currentPage = () => {
      const sheets = Array.from(pages.querySelectorAll<HTMLElement>(".wd-page"));
      const line = sc.getBoundingClientRect().top + sc.clientHeight * 0.35;
      let cur = 1;
      sheets.forEach((s, k) => {
        if (s.getBoundingClientRect().top <= line) cur = k + 1;
      });
      return cur;
    };

    const onScroll = () => setPageNow(currentPage());

    const onInput = () => {
      if (statusT) clearTimeout(statusT);
      statusT = setTimeout(() => {
        countWords();
        markDirty();
        onContentChange?.(snapshot(), docText());
      }, 250);
      if (histTimer.current) clearTimeout(histTimer.current);
      histTimer.current = setTimeout(pushHist, 600);
    };

    /* Re-flow only when the page is left, not on every keystroke: repaginating
       mid-sentence moves the text under the caret, which is maddening. */
    const onFocusOut = (e: FocusEvent) => {
      if (e.relatedTarget && pages.contains(e.relatedTarget as Node)) return;
      const overflowing = Array.from(pages.querySelectorAll<HTMLElement>(".wd-page")).some((pg) => {
        const last = pg.lastElementChild as HTMLElement | null;
        if (!last || last.classList.contains("wd-ftr")) return false;
        const pad = parseFloat(getComputedStyle(pg).paddingBottom) || 0;
        return last.offsetTop + last.offsetHeight > pg.clientHeight - pad + 1;
      });
      if (overflowing) paginate();
    };

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void save();
      } else if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };

    let resizeT: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeT) clearTimeout(resizeT);
      resizeT = setTimeout(() => paginate(), 180);
    };

    sc.addEventListener("scroll", onScroll, { passive: true });
    pages.addEventListener("input", onInput);
    pages.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      sc.removeEventListener("scroll", onScroll);
      pages.removeEventListener("input", onInput);
      pages.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      if (statusT) clearTimeout(statusT);
      if (resizeT) clearTimeout(resizeT);
    };
  }, [countWords, markDirty, pushHist, paginate, save, undo, redo]);

  /* ── toolbar commands ─────────────────────────────────────────────────── */

  const exec = useCallback(
    (cmd: string) => {
      if (cmd === "undo") return undo();
      if (cmd === "redo") return redo();

      const sel = window.getSelection();
      const pages = pagesRef.current;
      if (!pages || !sel || !sel.rangeCount || !pages.contains(sel.anchorNode)) return;

      if (cmd === "blank") {
        // A fill-in gap the lawyer can tab through, same markup the generator uses.
        const span = document.createElement("span");
        span.className = "placeholder";
        span.dataset.ph = "FILL IN";
        span.title = "Fill in";
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(span);
        range.setStartAfter(span);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else if (cmd === "clear") {
        document.execCommand("removeFormat");
      } else {
        document.execCommand(cmd);
      }
      pushHist();
      markDirty();
    },
    [undo, redo, pushHist, markDirty],
  );

  const stateLabel = dirty
    ? "Unsaved changes"
    : savedAt
      ? `Saved ${savedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
      : "All changes saved";

  return (
    <>
      <div className="gen-tools fd-tb">
        <div className="gen-tools-left" role="toolbar" aria-label="Edit document">
          <Btn cmd="undo" tip="Undo  Ctrl+Z" onRun={exec} disabled={!canUndo}>
            <Ico d="M9 14 4 9l5-5" /><Ico d="M4 9h11a5 5 0 0 1 0 10h-4" join />
          </Btn>
          <Btn cmd="redo" tip="Redo  Ctrl+Y" onRun={exec} disabled={!canRedo}>
            <Ico d="m15 14 5-5-5-5" /><Ico d="M20 9H9a5 5 0 0 0 0 10h4" join />
          </Btn>
          <span className="sep" />
          <Btn cmd="bold" tip="Bold  Ctrl+B" onRun={exec}><b>B</b></Btn>
          <Btn cmd="italic" tip="Italic  Ctrl+I" onRun={exec}><i>I</i></Btn>
          <Btn cmd="underline" tip="Underline  Ctrl+U" onRun={exec}><u>U</u></Btn>
          <span className="sep" />
          <Btn cmd="blank" tip="Insert a fill-in blank" onRun={exec} wide>
            <Ico d="M4 17h16M6 13h5" />
            <span className="lbl">Blank</span>
          </Btn>
          <Btn cmd="clear" tip="Clear formatting" onRun={exec}>
            <Ico d="m7 17 9-9M5 21h14M9 5l10 10" />
          </Btn>
        </div>

        <div className="gen-tools-right">
          <span className="pg">
            Page {Math.min(pageNow, pageCount)} of {pageCount}
          </span>
          <span className="sep sep-wc" />
          <span className="wc">{words.toLocaleString("en-GB")} words</span>
          <span className="sep" />
          <span className="fd-save-state" data-state={dirty ? "dirty" : "saved"} aria-live="polite">
            <i />
            <span>{stateLabel}</span>
          </span>
          <button
            type="button"
            className={`fd-save${dirty ? " is-dirty" : ""}`}
            data-tip="Save  Ctrl+S"
            onClick={() => void save()}
            disabled={saving}
          >
            <Ico d="M5 4h11l3 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 4v5h7V4M8 20v-6h8v6" />
            <span>{saving ? "Saving…" : "Save"}</span>
          </button>
        </div>
      </div>

      <div className="dscroll" ref={scrollRef}>
        {/* React renders this div and then never touches its children again —
            everything inside is built and owned by the effects above. */}
        <div className="wd-pages" ref={pagesRef} suppressHydrationWarning />
      </div>
    </>
  );
}

/* ── small presentational helpers ───────────────────────────────────────── */

function Ico({ d, join }: { d: string; join?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin={join ? "round" : "round"}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function Btn({
  cmd,
  tip,
  onRun,
  children,
  disabled,
  wide,
}: {
  cmd: string;
  tip: string;
  onRun: (cmd: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={`fd-tb-btn${wide ? " wide" : ""}`}
      data-cmd={cmd}
      data-tip={tip}
      aria-label={tip.replace(/\s{2}.*$/, "")}
      disabled={disabled}
      // The caret must stay in the document, or execCommand has nothing to act on.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onRun(cmd)}
    >
      {children}
    </button>
  );
}
