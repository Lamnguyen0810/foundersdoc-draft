import { NextRequest } from "next/server";
import {
  AlignmentType,
  BorderStyle,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
  UnderlineType,
} from "docx";
import { splitNotes } from "@/lib/prompt";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import * as S from "@/lib/doc-style";

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
  o: { b?: boolean; i?: boolean; u?: boolean; size?: number; color?: string; font?: string } = {},
) =>
  new TextRun({
    text,
    bold: o.b,
    italics: o.i,
    underline: o.u ? { type: UnderlineType.SINGLE } : undefined,
    font: o.font ?? S.BODY_FONT,
    size: o.size ?? S.pt(S.BODY_PT),
    color: o.color ?? S.INK,
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

type Style = { size?: number; color?: string; font?: string; b?: boolean };

/**
 * Inline HTML → Word runs. Understands <b>/<strong>, <i>/<em>, <u>, <br>, and
 * the preview's fill-in blanks.
 *
 * A blank is `<span class="placeholder">` — empty when nobody has typed into
 * it, which on screen is a ruled gap. Word has no ruled gap, so it becomes
 * underlined non-breaking spaces of the same width; text the lawyer typed
 * into it comes through underlined, exactly as it sits on the line on screen.
 */
function runsFromHtml(fragment: string, style: Style = {}): TextRun[] {
  const runs: TextRun[] = [];
  const tokens = fragment
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/(<span\b[^>]*class=["'][^"']*\bplaceholder\b[^"']*["'][^>]*>[\s\S]*?<\/span>|<\/?(?:strong|b|em|i|u)\b[^>]*>)/gi);

  let bold = 0;
  let italics = 0;
  let underline = 0;

  for (const token of tokens) {
    if (!token) continue;

    if (/^<span\b[^>]*\bplaceholder\b/i.test(token)) {
      const typed = decodeHtml(token.replace(/^<span\b[^>]*>/i, "").replace(/<\/span>$/i, "").replace(/<[^>]+>/g, "")).trim();
      runs.push(
        run(typed || "\u00A0".repeat(S.PLACEHOLDER_WIDTH), {
          ...style,
          u: true,
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
    runs.push(run(value, { ...style, b: style.b || bold > 0, i: italics > 0, u: underline > 0 }));
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

const single = (line: number) => ({ line, lineRule: LineRuleType.AUTO });

function paragraphsFromHtml(html: string): Paragraph[] {
  const out: Paragraph[] = [];
  const pattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(html))) {
    const cls = /class=["']([^"']*)["']/i.exec(m[1])?.[1] ?? "";
    const has = (name: string) => new RegExp(`\\b${name}\\b`).test(cls);
    const fragment = m[2];

    // ── the title: Calibri, blue, centred, a rule beneath
    if (has("doc-title")) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: S.TITLE_STYLE.after, ...single(S.TITLE_STYLE.line) },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: S.TITLE_STYLE.border.size,
              color: S.TITLE_STYLE.border.color,
              space: S.TITLE_STYLE.border.space,
            },
          },
          children: runsFromHtml(fragment, { size: S.TITLE_STYLE.size, color: S.TITLE, font: S.HEAD_FONT, b: true }),
        }),
      );
      continue;
    }

    if (has("doc-date")) {
      out.push(new Paragraph({ spacing: { after: S.DATE_AFTER, ...single(S.BODY_LINE) }, children: runsFromHtml(fragment) }));
      continue;
    }

    // ── "Parties", "Background": bold body font, a little air either side
    if (has("doc-label")) {
      out.push(
        new Paragraph({
          spacing: { before: S.LABEL.before, after: S.LABEL.after, ...single(S.BODY_LINE) },
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
          spacing: { before: S.SECTION.before, after: S.SECTION.after, ...single(S.SECTION.line) },
          children: runsFromHtml(text, { size: S.SECTION.size, color: S.HEAD, font: S.HEAD_FONT, b: true }),
        }),
      );
      continue;
    }

    // ── (a) sub-clauses: number in the margin, body hanging beside it
    if (has("doc-subclause")) {
      const parts = splitNumbered(fragment);
      out.push(
        new Paragraph({
          spacing: { after: S.SUBCLAUSE.after, ...single(S.BODY_LINE) },
          indent: { left: S.SUBCLAUSE.left, hanging: S.SUBCLAUSE.hanging },
          tabStops: [{ type: TabStopType.LEFT, position: S.SUBCLAUSE.left }],
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
          spacing: { after: S.CLAUSE_AFTER, ...single(S.BODY_LINE) },
          children: parts ? [run(`${parts.num} `), ...runsFromHtml(parts.body)] : runsFromHtml(fragment),
        }),
      );
      continue;
    }

    // ── "Drafter's notes": small Calibri heading over a grey rule
    if (has("doc-notes-title")) {
      out.push(
        new Paragraph({
          spacing: { before: S.NOTES_TITLE.before, after: S.NOTES_TITLE.after, ...single(S.BODY_LINE) },
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
          spacing: { after: S.NOTE.after, ...single(S.NOTE.line) },
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
          spacing: { before: S.END_NOTE_STYLE.before, after: 0, ...single(S.BODY_LINE) },
          children: runsFromHtml(fragment, { size: S.END_NOTE_STYLE.size, color: S.END_NOTE, font: S.HEAD_FONT }),
        }),
      );
      continue;
    }

    // ── anything else is a body paragraph
    const children = runsFromHtml(fragment);
    if (children.length) {
      out.push(new Paragraph({ spacing: { after: S.PARA_AFTER, ...single(S.BODY_LINE) }, children }));
    }
  }
  return out;
}

/**
 * Plain text → paragraphs, for the rare caller with no HTML. The same
 * typography as the HTML path, recognising the shapes the model is told to
 * produce: "1. HEADING", "1.1", "(a)", and signature lines.
 */
function paragraphsFromText(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const heading = /^\d+\.\s+[A-Z][A-Z0-9 ,;'&\-/()]{2,}$/.test(line) || /^[A-Z][A-Z0-9 ,;'&\-/()]{4,}$/.test(line);
    const lettered = /^\([a-z0-9ivx]+\)\s/.test(line);

    if (heading) {
      out.push(
        new Paragraph({
          spacing: { before: S.SECTION.before, after: S.SECTION.after, ...single(S.SECTION.line) },
          children: [run(line, { b: true, size: S.SECTION.size, color: S.HEAD, font: S.HEAD_FONT })],
        }),
      );
    } else if (lettered) {
      const [, num, body] = /^(\([a-z0-9ivx]+\))\s+([\s\S]*)$/.exec(line) ?? [line, "", line];
      out.push(
        new Paragraph({
          spacing: { after: S.SUBCLAUSE.after, ...single(S.BODY_LINE) },
          indent: { left: S.SUBCLAUSE.left, hanging: S.SUBCLAUSE.hanging },
          tabStops: [{ type: TabStopType.LEFT, position: S.SUBCLAUSE.left }],
          children: [run(`${num}\t`), run(body)],
        }),
      );
    } else {
      out.push(new Paragraph({ spacing: { after: S.PARA_AFTER, ...single(S.BODY_LINE) }, children: [run(line)] }));
    }
  }
  return out;
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

  let body: { text?: string; html?: string; title?: string; fileName?: string; includeNotes?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "There is nothing to export." }, { status: 400 });

  const html = (body.html ?? "").trim();
  let children: Paragraph[];

  if (html) {
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
          run: { font: S.BODY_FONT, size: S.pt(S.BODY_PT), color: S.INK },
          paragraph: { spacing: { after: S.PARA_AFTER, ...single(S.BODY_LINE) } },
        },
      },
    },
    sections: [
      {
        properties: { page: { size: { width: S.PAGE.width, height: S.PAGE.height }, margin: S.PAGE.margin } },
        // No header, no footer: there is none on the screen.
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
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
