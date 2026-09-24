"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { draftToParagraphs, paragraphText } from "@/lib/contract/dom";
import { DEFAULT_LOOK, fontStack, type DocumentLook } from "@/lib/playbook";

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
  /** The face and size the page is set in — from the playbook. */
  look?: DocumentLook;
}

/**
 * The typefaces offered, and what each one really resolves to.
 *
 * Every one of these is on Windows and on a Mac without anybody installing
 * anything, and each carries its own fallbacks — a document that opens in Word
 * on one machine and in a browser on another must not change shape between
 * them. Aptos is Word's own default and falls back to Calibri where it is not
 * installed, which is what Word itself does.
 */
const FONTS: { label: string; css: string }[] = [
  { label: "Aptos", css: '"Aptos","Calibri","Segoe UI",Arial,sans-serif' },
  { label: "Calibri", css: '"Calibri","Segoe UI",Arial,sans-serif' },
  { label: "Arial", css: 'Arial,Helvetica,sans-serif' },
  { label: "Verdana", css: 'Verdana,Geneva,sans-serif' },
  { label: "Times New Roman", css: '"Times New Roman",Times,serif' },
  { label: "Cambria", css: 'Cambria,Georgia,"Times New Roman",serif' },
  { label: "Georgia", css: 'Georgia,"Times New Roman",serif' },
  { label: "Garamond", css: 'Garamond,Georgia,"Times New Roman",serif' },
  { label: "Book Antiqua", css: '"Book Antiqua",Georgia,"Times New Roman",serif' },
];

/** Points, because that is what a document is set in and what Word will show. */
const SIZES = ["9pt", "10pt", "10.5pt", "11pt", "11.5pt", "12pt", "13pt", "14pt"];

/* What the page is set in before anybody changes anything comes from the
   playbook — the `look` prop — not from a constant here. */

const A4_RATIO = 297 / 210;
/** Keep a heading with the paragraph beneath it rather than orphaning it. */
const KEEP_WITH_NEXT = /doc-section|doc-label|doc-notes-title/;

export default function DocumentEditor({
  text,
  onSave,
  savedHtml,
  onContentChange,
  look = DEFAULT_LOOK,
}: DocumentEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);

  /* The page is set in the playbook's face and size (globals.css reads the
     two variables). The toolbar's font and size menus start on the same
     values, so what the menu says is what the page is. */
  const lookStyle = {
    "--doc-font": fontStack(look.font),
    "--doc-size": `${look.sizePt}pt`,
  } as CSSProperties;
  const lookFont = FONTS.find((f) => f.label === look.font)?.label ?? FONTS[0].label;
  const lookSize = `${look.sizePt}pt`;

  const [pageCount, setPageCount] = useState(1);
  const [pageNow, setPageNow] = useState(1);
  const [words, setWords] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  /* What the two dropdowns show. Read back from the document at the caret, so
     they describe what is actually there rather than what was last clicked. */
  const [fontNow, setFontNow] = useState(lookFont);
  const [sizeNow, setSizeNow] = useState(lookSize);

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
      onContentChange?.(snapshot(), docText());
      if (statusT) clearTimeout(statusT);
      statusT = setTimeout(() => {
        countWords();
        markDirty();
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
  }, [
    countWords,
    markDirty,
    pushHist,
    paginate,
    save,
    undo,
    redo,
    onContentChange,
    snapshot,
    docText,
  ]);

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

  /* ── typeface and size ───────────────────────────────────────────────────
     Two rules, and they are the ones a word processor follows:

       · with text selected, the change applies to that text and nothing else;
       · with nothing selected, it applies to the whole document.

     The selection case goes through execCommand, which is the only thing that
     correctly splits a selection running across several paragraphs. Size has
     to be laundered: execCommand only speaks the seven legacy sizes, so the
     largest is applied as a marker and then rewritten to the real point size.

     The whole-document case sets the style on each paragraph itself — and has
     to say !important, because the stylesheet that makes the page look like
     Word declares the family and the size that way. Doing it on the elements
     rather than on their container is what makes the choice survive a save:
     the paragraphs are what gets stored. */
  const applyType = useCallback(
    (prop: "font-family" | "font-size", value: string) => {
      const pages = pagesRef.current;
      if (!pages) return;
      const sel = window.getSelection();
      const onSelection =
        !!sel && sel.rangeCount > 0 && !sel.isCollapsed && pages.contains(sel.anchorNode);

      if (onSelection) {
        document.execCommand("styleWithCSS", false, "true");
        if (prop === "font-family") {
          document.execCommand("fontName", false, value);
        } else {
          document.execCommand("fontSize", false, "7");
          pages
            .querySelectorAll<HTMLElement>('[style*="xxx-large"]')
            .forEach((el) => (el.style.fontSize = value));
        }
      } else {
        for (const el of flowItems()) el.style.setProperty(prop, value, "important");
      }
      pushHist();
      markDirty();
    },
    [flowItems, pushHist, markDirty],
  );

  /* What is set where the caret is.
     Read from the inline styles we ourselves write, never from the computed
     style: the pages are scaled with `zoom` to fit the pane, and a computed
     font-size read through a zoom reports the wrong number. */
  useEffect(() => {
    const read = () => {
      const pages = pagesRef.current;
      const sel = window.getSelection();
      if (!pages || !sel || !sel.rangeCount || !pages.contains(sel.anchorNode)) return;
      const node = sel.anchorNode;
      const start = (node?.nodeType === 3 ? node.parentElement : (node as HTMLElement | null)) ?? null;

      const near = (want: string): string | null => {
        let el: HTMLElement | null = start;
        while (el && pages.contains(el)) {
          const v = el.style.getPropertyValue(want);
          if (v) return v;
          el = el.parentElement;
        }
        return null;
      };

      const family = near("font-family");
      const first = (v: string) => v.replace(/["']/g, "").split(",")[0].trim().toLowerCase();
      const hit = family ? FONTS.find((f) => first(f.css) === first(family)) : null;
      setFontNow(hit ? hit.label : lookFont);

      const size = near("font-size");
      setSizeNow(size && SIZES.includes(size.trim()) ? size.trim() : lookSize);
    };
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, [lookFont, lookSize]);

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
            <Ico d={["M9 14 4 9l5-5", "M4 9h11a5 5 0 0 1 0 10h-4"]} />
          </Btn>
          <Btn cmd="redo" tip="Redo  Ctrl+Y" onRun={exec} disabled={!canRedo}>
            <Ico d={["m15 14 5-5-5-5", "M20 9H9a5 5 0 0 0 0 10h4"]} />
          </Btn>
          <span className="sep" />
          {/* Typeface and size, where a word processor puts them: before the
              bold and italic, after undo. Changing either with text selected
              changes that text; with nothing selected it changes the document. */}
          <select
            className="fd-tb-sel fd-tb-font"
            aria-label="Typeface"
            title="Typeface — applies to the selected text, or to the whole document"
            value={fontNow}
            onChange={(e) => {
              const pick = FONTS.find((f) => f.label === e.target.value);
              if (!pick) return;
              setFontNow(pick.label);
              applyType("font-family", pick.css);
            }}
          >
            {FONTS.map((f) => (
              <option key={f.label} value={f.label} style={{ fontFamily: f.css }}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className="fd-tb-sel fd-tb-size"
            aria-label="Font size"
            title="Size in points — applies to the selected text, or to the whole document"
            value={sizeNow}
            onChange={(e) => {
              setSizeNow(e.target.value);
              applyType("font-size", e.target.value);
            }}
          >
            {SIZES.map((sz) => (
              <option key={sz} value={sz}>
                {sz.replace("pt", "")}
              </option>
            ))}
          </select>
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
        <div className="wd-pages" ref={pagesRef} style={lookStyle} suppressHydrationWarning />
      </div>
    </>
  );
}

/* ── small presentational helpers ───────────────────────────────────────── */

/**
 * One icon, however many strokes it takes to draw.
 *
 * `d` used to be a single path, so an icon made of two strokes — the undo
 * arrow is an arc plus an arrowhead — was written as two <Ico> elements and
 * came out as TWO 16px pictures side by side in one button: a stray chevron
 * next to a stray arc, twice, at the left of the toolbar. Several paths in one
 * svg is what draws one arrow.
 */
function Ico({ d }: { d: string | string[] }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((one, k) => (
        <path key={k} d={one} />
      ))}
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
