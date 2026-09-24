/**
 * Blocks → the document's HTML, and → plain text.
 *
 * The same paragraphs lib/contract/dom.ts builds in the browser, written as
 * a string so the server can build them too (the term sheet is assembled
 * server-side and saved ready to open). The class names are the contract
 * the editor, the stylesheet and the Word export all share — see dom.ts.
 */

import { splitPlaceholders, subclauseLevel, type Block } from "../contract/parse";

const CLASS: Record<Block["kind"], string> = {
  title: "doc-title",
  date: "doc-date",
  label: "doc-label",
  party: "doc-party",
  recital: "doc-recital",
  section: "doc-section",
  clause: "doc-clause",
  subclause: "doc-subclause",
  "notes-title": "doc-notes-title",
  note: "doc-note",
  plain: "",
};

const STRUCTURED = new Set<Block["kind"]>(["party", "recital", "clause", "subclause"]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(text: string): string {
  let out = "";
  for (const piece of splitPlaceholders(text)) {
    if ("note" in piece) {
      out += `<span class="fd-note">[FD Note: ${esc(piece.note)}]</span>`;
    } else if ("text" in piece) {
      const t = esc(piece.text);
      out += piece.b && piece.i ? `<b><i>${t}</i></b>` : piece.b ? `<b>${t}</b>` : piece.i ? `<i>${t}</i>` : t;
    } else {
      const ph = piece.placeholder;
      const title = ph === "●" ? "Fill in" : `Fill in: ${ph.toLowerCase()}`;
      out += `<span class="placeholder" data-ph="${esc(ph)}" title="${esc(title)}"></span>`;
    }
  }
  return out;
}

export function blocksToHtml(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    const cls = CLASS[b.kind];
    if (STRUCTURED.has(b.kind) && b.num) {
      const classes = [cls, "doc-structured"];
      if (b.kind === "subclause") {
        const level = b.level ?? subclauseLevel(b.num);
        if (level > 1) classes.push(`doc-level-${level}`);
      }
      parts.push(
        `<p class="${classes.join(" ")}"><span class="doc-num">${esc(b.num)}</span><span class="doc-body">${inline(b.text)}</span></p>`,
      );
    } else {
      parts.push(`<p${cls ? ` class="${cls}"` : ""}>${inline(b.text)}</p>`);
    }
  }
  return parts.join("");
}

/** The letter as text: one blank line between paragraphs, marks kept so the
 *  same text reads back through the parser with its bold intact. */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "subclause" && b.num) return `${b.num} ${b.text}`;
      if (b.kind === "clause" && b.num) return `${b.num} ${b.text}`;
      return b.text;
    })
    .join("\n\n");
}

/** The words of the document, for the word count and the Slack line. */
export function wordCount(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + b.text.replace(/\*\*|_/g, "").split(/\s+/).filter(Boolean).length, 0);
}
