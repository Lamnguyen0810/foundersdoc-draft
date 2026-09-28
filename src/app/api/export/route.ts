import { NextRequest } from "next/server";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  LineRuleType,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  UnderlineType,
  WidthType,
} from "docx";
import { splitNotes } from "@/lib/prompt";
import { parseDraft, splitPlaceholders } from "@/lib/contract/parse";
import { blocksToPageHtml } from "@/lib/contract/html";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import * as S from "@/lib/doc-style";
import { DEFAULT_LOOK, KNOWN_FONTS, documentLook, type DocumentLook } from "@/lib/playbook";

/* ── THE FACE AND SIZE, PER REQUEST ──────────────────────────────────────────
   The playbook names the typeface and body size (lib/playbook.ts); every run
   below is set in it. It is a module variable rather than a parameter
   threaded through a dozen builders because the whole build between the two
   awaits in POST is synchronous: it is set, used, and nothing else can run
   in between. Title = body + 2pt bold; headings = body bold. No colour. */
let LOOK: DocumentLook = DEFAULT_LOOK;
const bodySize = () => S.pt(LOOK.sizePt);
const titleSize = () => S.pt(LOOK.titlePt);
/* Spacing and alignment, from the same place. */
const bodyLine = () => S.lines(LOOK.lineSpacing);
const paraAfter = () => S.tw(LOOK.spaceAfterPt);
const headBefore = () => S.tw(LOOK.headingBeforePt);
const headAfter = () => S.tw(LOOK.headingAfterPt);
const bodyAlign = () => (LOOK.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT);

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The Word file, built to look like the screen.
 *
 * ── WHAT THIS USED TO BE ────────────────────────────────────────────────────
 * A second, unrelated design. The preview was Cambria 10.5pt, flush left, with
 * a blue Calibri title over a blue rule; the download was Times New Roman
 * 11pt, justified, black throughout, indented clauses, and — on every page —
 * a FoundersDoc letterhead with a placeholder address, a "subject to review"
 * footer and page numbers that the screen never showed. A lawyer who had
 * spent ten minutes getting the document right on screen opened the download
 * and found a different document.
 *
 * ── WHAT IT IS NOW ──────────────────────────────────────────────────────────
 * A translation of the preview's stylesheet, rule by rule. Every size, colour,
 * gap and indent comes from src/lib/doc-style.ts, which mirrors the
 * `.wd-pages .sheet` rules in globals.css and says which one each number came
 * from. There is no header and no footer, because there is none on screen.
 * If the firm wants a letterhead, it belongs in the preview first, so that
 * what is seen is what is sent.
 *
 * ── WHAT IS TAKEN FROM THE SCREEN ───────────────────────────────────────────
 * The browser sends the preview's own HTML — the same <p class="doc-…">
 * elements the lawyer edited — so the download carries their edits, their
 * bold, and the blanks they left. Each class maps to one paragraph shape
 * below. Anything without a class is a body paragraph.
 */

const run = (
  text: string,
  o: { b?: boolean; i?: boolean; u?: boolean; size?: number; color?: string; font?: string; hl?: boolean } = {},
) =>
  new TextRun({
    text,
    bold: o.b,
    italics: o.i,
    /* An FD Note on a draft is highlighted yellow (playbook R10.4). */
    highlight: o.hl ? "yellow" : undefined,
    underline: o.u ? { type: UnderlineType.SINGLE } : undefined,
    font: LOOK.font,
    size: o.size ?? bodySize(),
    color: S.INK,
  });

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, "\u00A0")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

type Style = { size?: number; color?: string; font?: string; b?: boolean; u?: boolean };

/**
 * Inline HTML → Word runs. Understands <b>/<strong>, <i>/<em>, <u>, <br>, and
 * the preview's fill-in blanks.
 *
 * A blank is `<span class="placeholder">` — empty when nobody has typed into
 * it, which on screen is a ruled gap. Word has no ruled gap, so it becomes
 * underlined non-breaking spaces of the same width; text the lawyer typed
 * into it comes through underlined, exactly as it sits on the line on screen.
 */
function runsFromHtml(fragment: string, style: Style = {}, blankWidth: number = S.PLACEHOLDER_WIDTH): TextRun[] {
  const runs: TextRun[] = [];
  const tokens = fragment
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/(<span\b[^>]*class=["'][^"']*\b(?:placeholder|fd-note)\b[^"']*["'][^>]*>[\s\S]*?<\/span>|<\/?(?:strong|b|em|i|u)\b[^>]*>)/gi);

  let bold = 0;
  let italics = 0;
  let underline = 0;

  for (const token of tokens) {
    if (!token) continue;

    if (/^<span\b[^>]*\bfd-note\b/i.test(token)) {
      const note = decodeHtml(token.replace(/^<span\b[^>]*>/i, "").replace(/<\/span>$/i, "").replace(/<[^>]+>/g, "")).trim();
      if (note) runs.push(run(note, { ...style, b: true, i: true, hl: true }));
      continue;
    }

    if (/^<span\b[^>]*\bplaceholder\b/i.test(token)) {
      const typed = decodeHtml(token.replace(/^<span\b[^>]*>/i, "").replace(/<\/span>$/i, "").replace(/<[^>]+>/g, "")).trim();
      /* An empty blank is a row of underscores, not underlined spaces: Word
         does not underline spaces at the end of a line, so a blank that ends
         a paragraph ("Name: ____") vanished in the download. */
      runs.push(
        run(typed || "_".repeat(blankWidth), {
          ...style,
          u: Boolean(typed),
          b: style.b || bold > 0,
          i: italics > 0,
        }),
      );
      continue;
    }

    const tag = /^<(\/?)(strong|b|em|i|u)\b/i.exec(token);
    if (tag) {
      const delta = tag[1] ? -1 : 1;
      const name = tag[2].toLowerCase();
      if (name === "strong" || name === "b") bold = Math.max(0, bold + delta);
      if (name === "em" || name === "i") italics = Math.max(0, italics + delta);
      if (name === "u") underline = Math.max(0, underline + delta);
      continue;
    }

    const value = decodeHtml(token.replace(/<[^>]+>/g, ""));
    if (!value) continue;
    runs.push(run(value, { ...style, b: style.b || bold > 0, i: italics > 0, u: style.u || underline > 0 }));
  }
  return runs;
}

/**
 * The two halves of a numbered paragraph, or null when it is not one.
 *
 * The body span is the paragraph's LAST child and may itself contain spans —
 * every fill-in blank is one — so it cannot be matched lazily to the first
 * closing tag: that stops at the first blank and silently drops the rest of
 * the sentence. It runs from its opening tag to the fragment's final </span>.
 */
function splitNumbered(fragment: string): { num: string; body: string } | null {
  const num = /<span\b[^>]*class=["'][^"']*\bdoc-num\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(fragment);
  const open = /<span\b[^>]*class=["'][^"']*\bdoc-body\b[^"']*["'][^>]*>/i.exec(fragment);
  if (!num || !open) return null;
  const after = fragment.slice(open.index + open[0].length);
  const body = after.replace(/<\/span>\s*$/i, "");
  return { num: decodeHtml(num[1].replace(/<[^>]+>/g, "")).trim(), body };
}

/**
 * Line spacing as the screen has it. CSS line-height 1.24 means 1.24 × the
 * font size; Word's "multiple" means 1.24 × the FONT'S OWN line height, which
 * for Times New Roman is already ~1.15 × its size — so every line in the
 * download was about 15% taller than on screen, and the same text ran to an
 * extra page. "At least" size × multiple is the CSS rule exactly, and still
 * lets a larger run (the title) take the room it needs.
 */
const single = (line: number, sizePt: number = LOOK.sizePt) => ({
  line: Math.round((line / 240) * sizePt * 20),
  lineRule: LineRuleType.AT_LEAST,
});

function paragraphsFromHtml(html: string): Paragraph[] {
  const out: Paragraph[] = [];
  const all = Array.from(html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)).map((x) => ({
    cls: /class=["']([^"']*)["']/i.exec(x[1])?.[1] ?? "",
    fragment: x[2],
  }));

  for (let k = 0; k < all.length; k++) {
    const { cls, fragment } = all[k];
    const has = (name: string) => new RegExp(`(?:^|\\s)${name}(?:\\s|$)`).test(cls);
    const nextCls = all[k + 1]?.cls ?? "";

    /* ── signature blocks: each line its own paragraph, the block kept on
       one page (keepNext down to its last line), the head with air above,
       as .doc-sign / .doc-sign-head on screen. A blank to sign on is wider
       than a blank in a sentence. */
    if (has("doc-sign")) {
      const head = has("doc-sign-head");
      const nextIsLine = /(?:^|\s)doc-sign(?:\s|$)/.test(nextCls) && !/(?:^|\s)doc-sign-head(?:\s|$)/.test(nextCls);
      out.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          keepNext: nextIsLine,
          keepLines: true,
          spacing: { before: head ? S.SIGN.headBefore : 0, after: head ? S.SIGN.headAfter : S.SIGN.after, ...single(bodyLine()) },
          children: runsFromHtml(fragment, {}, S.SIGN.blank),
        }),
      );
      continue;
    }

    // ── the title: Calibri, blue, centred, a rule beneath
    if (has("doc-title")) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: S.TITLE_STYLE.after, ...single(S.TITLE_STYLE.line, LOOK.titlePt) },
          children: runsFromHtml(fragment, { size: titleSize(), b: true }),
        }),
      );
      continue;
    }

    if (has("doc-date")) {
      out.push(new Paragraph({ alignment: bodyAlign(), spacing: { after: S.DATE_AFTER, ...single(bodyLine()) }, children: runsFromHtml(fragment) }));
      continue;
    }

    // ── "Parties", "Background": bold body font, a little air either side
    if (has("doc-label")) {
      out.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: S.LABEL.before, after: S.LABEL.after, ...single(bodyLine()) },
          children: runsFromHtml(fragment, { b: true }),
        }),
      );
      continue;
    }

    // ── "1. Definitions": Calibri, blue, bold
    if (has("doc-section")) {
      const parts = splitNumbered(fragment);
      const text = parts ? `${parts.num} ${parts.body}` : fragment;
      out.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: headBefore(), after: headAfter(), ...single(bodyLine()) },
          children: runsFromHtml(text, { size: bodySize(), b: true }),
        }),
      );
      continue;
    }

    // ── (a) sub-clauses: number in the margin, body hanging beside it
    if (has("doc-subclause")) {
      const parts = splitNumbered(fragment);
      /* (a) at the first step, (ii) one further, (A) one further again. */
      const step = has("doc-level-3") ? 2 : has("doc-level-2") ? 1 : 0;
      const left = S.SUBCLAUSE.left + step * S.SUBCLAUSE.hanging;
      out.push(
        new Paragraph({
          alignment: bodyAlign(),
          spacing: { after: S.SUBCLAUSE.after, ...single(bodyLine()) },
          indent: { left, hanging: S.SUBCLAUSE.hanging },
          tabStops: [{ type: TabStopType.LEFT, position: left }],
          children: parts
            ? [run(`${parts.num}\t`), ...runsFromHtml(parts.body)]
            : runsFromHtml(fragment),
        }),
      );
      continue;
    }

    // ── parties, recitals, clauses: number inline, flush left
    if (has("doc-party") || has("doc-recital") || has("doc-clause")) {
      const parts = splitNumbered(fragment);
      out.push(
        new Paragraph({
          alignment: bodyAlign(),
          spacing: { after: paraAfter(), ...single(bodyLine()) },
          children: parts ? [run(`${parts.num} `), ...runsFromHtml(parts.body)] : runsFromHtml(fragment),
        }),
      );
      continue;
    }

    // ── "Drafter's notes": small Calibri heading over a grey rule
    if (has("doc-notes-title")) {
      out.push(
        new Paragraph({
          spacing: { before: S.NOTES_TITLE.before, after: S.NOTES_TITLE.after, ...single(bodyLine()) },
          border: {
            top: {
              style: BorderStyle.SINGLE,
              size: S.NOTES_TITLE.border.size,
              color: S.NOTES_TITLE.border.color,
              space: S.NOTES_TITLE.border.space,
            },
          },
          children: runsFromHtml(fragment, { size: S.NOTES_TITLE.size, color: S.HEAD, font: S.HEAD_FONT, b: true }),
        }),
      );
      continue;
    }

    // ── each note: smaller, muted, a bullet hung in the margin
    if (has("doc-note")) {
      out.push(
        new Paragraph({
          spacing: { after: S.NOTE.after, ...single(S.NOTE.line, 9.5) },
          indent: { left: S.NOTE.hanging, hanging: S.NOTE.hanging },
          tabStops: [{ type: TabStopType.LEFT, position: S.NOTE.hanging }],
          children: [
            run("•\t", { size: S.NOTE.size, color: S.MUTED }),
            ...runsFromHtml(fragment, { size: S.NOTE.size, color: S.MUTED }),
          ],
        }),
      );
      continue;
    }

    // ── the line that says a model wrote it: small, grey, centred, last
    if (has("doc-end-note")) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: S.END_NOTE_STYLE.before, after: 0, ...single(bodyLine()) },
          children: runsFromHtml(fragment, { size: S.END_NOTE_STYLE.size, color: S.END_NOTE, font: S.HEAD_FONT }),
        }),
      );
      continue;
    }

    // ── anything else is a body paragraph
    const children = runsFromHtml(fragment);
    if (children.length) {
      out.push(new Paragraph({ alignment: bodyAlign(), spacing: { after: paraAfter(), ...single(bodyLine()) }, children }));
    }
  }
  return out;
}

/**
 * Plain text → paragraphs, for the rare caller with no HTML. The same
 * typography as the HTML path, recognising the shapes the model is told to
 * produce: "1. HEADING", "1.1", "(a)", and signature lines.
 */
/** Plain text with the model's **bold** and _italic_ marks, as runs. */
function runsFromMarks(text: string, style: { b?: boolean; size?: number } = {}): TextRun[] {
  const runs: TextRun[] = [];
  for (const piece of splitPlaceholders(text)) {
    if ("note" in piece) {
      runs.push(run(`[FD Note: ${piece.note}]`, { ...style, b: true, i: true, hl: true }));
    } else if ("placeholder" in piece) {
      runs.push(run("_".repeat(S.PLACEHOLDER_WIDTH), style));
    } else {
      runs.push(run(piece.text, { ...style, b: style.b || piece.b, i: piece.i }));
    }
  }
  return runs;
}

function paragraphsFromText(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const bare = line.replace(/\*\*/g, "");
    const heading = /^\d+\.\s+[A-Z][A-Z0-9 ,;'&\-/()]{2,}$/.test(bare) || /^[A-Z][A-Z0-9 ,;'&\-/()]{4,}$/.test(bare);
    const lettered = /^\([a-z0-9ivx]+\)\s/.test(bare);

    if (heading) {
      out.push(
        new Paragraph({
          spacing: { before: headBefore(), after: headAfter(), ...single(bodyLine()) },
          children: runsFromMarks(line.replace(/\*\*/g, ""), { b: true, size: bodySize() }),
        }),
      );
    } else if (lettered) {
      const [, num, body] = /^(\([a-z0-9ivx]+\))\s+([\s\S]*)$/.exec(line) ?? [line, "", line];
      out.push(
        new Paragraph({
          alignment: bodyAlign(),
          spacing: { after: S.SUBCLAUSE.after, ...single(bodyLine()) },
          indent: { left: S.SUBCLAUSE.left, hanging: S.SUBCLAUSE.hanging },
          tabStops: [{ type: TabStopType.LEFT, position: S.SUBCLAUSE.left }],
          children: [run(`${num}\t`), ...runsFromMarks(body)],
        }),
      );
    } else {
      out.push(new Paragraph({ alignment: bodyAlign(), spacing: { after: paraAfter(), ...single(bodyLine()) }, children: runsFromMarks(line) }));
    }
  }
  return out;
}


/* ── THE FORMAL LAYOUT (0049) ────────────────────────────────────────────────
   The firm's contract layout — the HitPay one-way NDA template — as the page
   sets it under `.wd-pages.fd-formal`. Numbers hang in a half-inch column
   with the text beside them; headings are bold with the words underlined;
   every paragraph is followed by a blank line's worth of space; the parties
   sign side by side. The title and the opening line are as they were. Every number is in
   lib/doc-style.ts (FORMAL) beside the CSS rule it copies. */

type FormalItem = { kind: "p"; cls: string; fragment: string } | { kind: "sign"; cols: string[][] };

/** The page's HTML as its flow items: paragraphs, and rows of signatures. */
function formalItems(html: string): FormalItem[] {
  const items: FormalItem[] = [];
  const re =
    /<div\b[^>]*\bdoc-sign-row\b[^>]*>((?:\s*<div\b[^>]*\bdoc-sign-col\b[^>]*>[\s\S]*?<\/div>)*)\s*<\/div>|<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      const cols = Array.from(m[1].matchAll(/<div\b[^>]*\bdoc-sign-col\b[^>]*>([\s\S]*?)<\/div>/gi)).map((c) =>
        Array.from(c[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)).map((x) => x[1]),
      );
      items.push({ kind: "sign", cols });
    } else {
      items.push({ kind: "p", cls: /class=["']([^"']*)["']/i.exec(m[2] ?? "")?.[1] ?? "", fragment: m[3] ?? "" });
    }
  }
  return items;
}

/** A row of signature blocks: a borderless table, two columns and a gap. */
function signTable(cols: string[][]): Table {
  const text = S.FORMAL.page.width - S.FORMAL.page.margin.left - S.FORMAL.page.margin.right;
  const colW = Math.floor((text - S.FORMAL.signGap) / 2);
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cell = (lines: string[] | undefined, width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      borders: { top: none, bottom: none, left: none, right: none },
      children: (lines?.length ? lines : [""]).map(
        (line, k, all) =>
          new Paragraph({
            alignment: AlignmentType.LEFT,
            keepNext: k < all.length - 1,
            keepLines: true,
            spacing: { before: k === 0 && lines?.length ? S.FORMAL.signRoom : 0, after: 0, ...single(bodyLine()) },
            border:
              k === 0 && lines?.length
                ? { top: { style: BorderStyle.SINGLE, size: S.FORMAL.signRule.size, color: S.INK, space: S.FORMAL.signRule.space } }
                : undefined,
            children: runsFromHtml(line, {}, S.SIGN.blank - 6),
          }),
      ),
    });
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: colW * 2 + S.FORMAL.signGap, type: WidthType.DXA },
    columnWidths: [colW, S.FORMAL.signGap, colW],
    borders: TableBorders.NONE,
    rows: [new TableRow({ cantSplit: true, children: [cell(cols[0], colW), cell([], S.FORMAL.signGap), cell(cols[1], colW)] })],
  });
}

function formalFromHtml(html: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const step = S.FORMAL.step;
  const body = { alignment: bodyAlign(), spacing: { after: paraAfter(), ...single(bodyLine()) } };

  for (const item of formalItems(html)) {
    if (item.kind === "sign") {
      out.push(signTable(item.cols));
      /* Space after the row, as the page has it. */
      out.push(new Paragraph({ spacing: { after: 0, ...single(bodyLine()) }, children: [] }));
      continue;
    }
    const { cls, fragment } = item;
    const has = (name: string) => new RegExp(`(?:^|\\s)${name}(?:\\s|$)`).test(cls);

    /* The title as it always was: centred, bold, two points larger. */
    if (has("doc-title")) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: S.TITLE_STYLE.after, ...single(S.TITLE_STYLE.line, LOOK.titlePt) },
          children: runsFromHtml(fragment, { size: titleSize(), b: true }),
        }),
      );
      continue;
    }

    if (has("doc-label")) {
      out.push(
        new Paragraph({
          ...body,
          alignment: AlignmentType.LEFT,
          keepNext: true,
          spacing: { ...body.spacing, before: headBefore() },
          children: runsFromHtml(fragment, { b: true }),
        }),
      );
      continue;
    }

    if (has("doc-section")) {
      const parts = splitNumbered(fragment) ?? (() => {
        const m = /^\s*(\d+\.)\s+([\s\S]*)$/.exec(fragment);
        return m ? { num: m[1], body: m[2] } : null;
      })();
      out.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          keepNext: true,
          spacing: { before: headBefore(), after: headAfter(), ...single(bodyLine()) },
          indent: parts ? { left: step, hanging: step } : undefined,
          tabStops: parts ? [{ type: TabStopType.LEFT, position: step }] : undefined,
          children: parts
            ? [run(`${parts.num}\t`, { b: true }), ...runsFromHtml(parts.body, { b: true, u: true })]
            : runsFromHtml(fragment, { b: true }),
        }),
      );
      continue;
    }

    const parts = splitNumbered(fragment);
    if (parts && (has("doc-party") || has("doc-recital") || has("doc-clause") || has("doc-subclause"))) {
      const level = has("doc-subclause") ? (has("doc-level-3") ? 3 : has("doc-level-2") ? 2 : 1) : 0;
      const left = step * (level + 1);
      out.push(
        new Paragraph({
          ...body,
          indent: { left, hanging: step },
          tabStops: [{ type: TabStopType.LEFT, position: left }],
          children: [run(`${parts.num}\t`), ...runsFromHtml(parts.body)],
        }),
      );
      continue;
    }

    /* Stacked signature lines from a page saved before the side-by-side
       layout and not reopened since: kept as lines. */
    if (has("doc-sign")) {
      out.push(new Paragraph({ alignment: AlignmentType.LEFT, keepNext: true, spacing: { after: 0, ...single(bodyLine()) }, children: runsFromHtml(fragment, {}, S.SIGN.blank) }));
      continue;
    }

    const children = runsFromHtml(fragment);
    if (!children.length) continue;
    out.push(new Paragraph({ ...body, indent: has("doc-cont") ? { left: step } : undefined, children }));
  }
  return out;
}


/** The page's look, checked: a known face, sizes and gaps within reason. */
function pageLook(raw: Partial<DocumentLook> | undefined): DocumentLook {
  if (!raw || typeof raw !== "object") return DEFAULT_LOOK;
  const n = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  return {
    font: (KNOWN_FONTS as readonly string[]).includes(String(raw.font)) ? String(raw.font) : DEFAULT_LOOK.font,
    sizePt: n(raw.sizePt, 8, 16, DEFAULT_LOOK.sizePt),
    titlePt: n(raw.titlePt, 8, 16, DEFAULT_LOOK.titlePt),
    justify: typeof raw.justify === "boolean" ? raw.justify : DEFAULT_LOOK.justify,
    lineSpacing: n(raw.lineSpacing, 1, 2, DEFAULT_LOOK.lineSpacing),
    spaceAfterPt: n(raw.spaceAfterPt, 0, 24, DEFAULT_LOOK.spaceAfterPt),
    headingBeforePt: n(raw.headingBeforePt, 0, 36, DEFAULT_LOOK.headingBeforePt),
    headingAfterPt: n(raw.headingAfterPt, 0, 36, DEFAULT_LOOK.headingAfterPt),
    layout: raw.layout === "formal" ? "formal" : "letter",
    source: "default",
  };
}

function safeName(s: string): string {
  return (
    s
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "draft"
  );
}

export async function POST(req: NextRequest) {
  if (isSupabaseConfigured() && !(await getUser())) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  let body: {
    text?: string;
    html?: string;
    title?: string;
    fileName?: string;
    includeNotes?: boolean;
    docTypeSlug?: string;
    /** The saved draft being downloaded, for the Slack line (059). */
    draftId?: string;
    /** "formal": the firm's contract layout (0049), as the NDA's page sets it. */
    layout?: string;
    /** The look the page was set in — used only where the playbook cannot be
     *  read here, so the file still matches the screen. */
    look?: Partial<DocumentLook>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "There is nothing to export." }, { status: 400 });

  /* The face and size come from the live playbook for this document type
     (firm-wide first, then the type's own — documentLook reads the type's
     text first so a type may set its own). Missing playbook, or 044 not run:
     the default. Never a reason to refuse the download. */
  /* The page's own look when it sends one — it was read from the same
     playbook when the page opened, and the file must match the screen the
     person is looking at. Otherwise the playbook, read here. */
  LOOK = pageLook(body.look);
  if (!body.look && isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const slug = typeof body.docTypeSlug === "string" && /^[a-z0-9_-]{1,64}$/.test(body.docTypeSlug) ? body.docTypeSlug : "*";
      const { data } = await supabase.rpc("playbook_for", { p_slug: slug });
      const rows = ((data ?? []) as { scope: string; text: string }[]);
      LOOK = documentLook([
        ...rows.filter((r) => r.scope !== "*").map((r) => r.text),
        ...rows.filter((r) => r.scope === "*").map((r) => r.text),
      ]);
    } catch {
      /* default look */
    }
  }

  /* The layout is the playbook's (`layout: formal`); the page says which it
     used, which only matters where the playbook could not be read. */
  const formal = LOOK.layout === "formal" || body.layout === "formal";
  const html = (body.html ?? "").trim();
  let children: (Paragraph | Table)[];

  if (formal) {
    /* The page's HTML, or — sent only the text — the same HTML built from
       it, so there is one road to Word for this layout. */
    children = formalFromHtml(html || blocksToPageHtml(parseDraft(splitNotes(text).body)));
  } else if (html) {
    /* The screen, verbatim — notes and the end line included, because they
       are on the screen. The lawyer decides what to delete before sending, and
       does it in the one place they are already looking. */
    children = paragraphsFromHtml(html);
  } else {
    // No HTML: the older callers, which still choose whether notes travel.
    const { body: documentBody, notes } = splitNotes(text);
    children = paragraphsFromText(documentBody);
    if (body.includeNotes && notes) {
      children.push(
        new Paragraph({
          spacing: { before: S.NOTES_TITLE.before, after: S.NOTES_TITLE.after },
          children: [run("Drafter's notes", { b: true, size: S.NOTES_TITLE.size, color: S.HEAD, font: S.HEAD_FONT })],
        }),
        ...paragraphsFromText(notes),
      );
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: LOOK.font, size: bodySize(), color: S.INK },
          /* keepLines: a paragraph is never split across two pages, which
             is how the screen paginates (DocumentEditor moves a whole
             paragraph to the next page). Without it Word broke pages in
             different places and the download read differently. */
          paragraph: { alignment: bodyAlign(), keepLines: true, spacing: { after: paraAfter(), ...single(bodyLine()) } },
        },
      },
      /* The footer's own style, so the page numbers Word fills in take the
         footer's size and colour rather than the body's. */
      paragraphStyles: [
        {
          id: "FdFooter",
          name: "FD Footer",
          basedOn: "Normal",
          run: formal
            ? { font: LOOK.font, size: S.FORMAL.footer.size, color: S.FORMAL.footer.color }
            : { font: S.FOOTER.font, size: S.FOOTER.size, color: S.END_NOTE },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: formal
            ? { size: { width: S.FORMAL.page.width, height: S.FORMAL.page.height }, margin: { ...S.FORMAL.page.margin, footer: S.FORMAL.footer.distance } }
            : { size: { width: S.PAGE.width, height: S.PAGE.height }, margin: { ...S.PAGE.margin, footer: S.FOOTER.distance } },
        },
        /* "Page 2 of 6", centred, small and grey, as .wd-ftr sets it at the
           foot of every page on screen. Word fills the numbers in itself. */
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                style: "FdFooter",
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: [
                  formal
                    ? new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: LOOK.font, size: S.FORMAL.footer.size, color: S.FORMAL.footer.color })
                    : new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: S.FOOTER.font, size: S.FOOTER.size, color: S.END_NOTE }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  /* ── SLACK HEARS ABOUT THE DOWNLOAD (059) ─────────────────────────────
     Announced from here, on the server, for the exact draft downloaded.
     It used to hang off an analytics event the browser sent after the file
     arrived — which an ad blocker, a closed tab or a flaky network could
     stop — and the database then had to guess which draft it was. Best
     effort: the file goes out whatever Slack does. Before 059 the RPC does
     not exist and the old trigger still announces, so nothing is lost. */
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const draftId =
        typeof body.draftId === "string" && /^[0-9a-f-]{36}$/i.test(body.draftId) ? body.draftId : null;
      const slug =
        typeof body.docTypeSlug === "string" && /^[a-z0-9_-]{1,64}$/.test(body.docTypeSlug) ? body.docTypeSlug : null;
      const { error } = await supabase.rpc("announce_draft_download", { p_draft: draftId, p_slug: slug });
      if (error && !/announce_draft_download|does not exist|schema cache/i.test(error.message)) {
        console.error("[export] could not announce the download:", error.message);
      }
    } catch (err) {
      console.error("[export] could not announce the download:", err);
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  const requestedName = body.fileName?.replace(/\.docx$/i, "");
  const filename = requestedName
    ? `${safeName(requestedName)}.docx`
    : `${safeName(body.title ?? "draft")}-${date}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
