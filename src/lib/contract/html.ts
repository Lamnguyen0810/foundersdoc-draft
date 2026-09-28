/**
 * Blocks → the page's HTML, as a string, for the server.
 *
 * The same elements lib/contract/dom.ts builds in the browser (the class
 * names are the contract between the page, the stylesheet and the Word
 * export). Used by /api/export when it is sent the draft's text rather than
 * the page's HTML, so that both roads reach Word through one builder.
 */

import { splitPlaceholders, subclauseLevel, type Block } from "./parse";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(text: string): string {
  let out = "";
  for (const piece of splitPlaceholders(text)) {
    if ("note" in piece) out += `<span class="fd-note">[FD Note: ${esc(piece.note)}]</span>`;
    else if ("text" in piece) {
      const t = esc(piece.text);
      out += piece.b && piece.i ? `<b><i>${t}</i></b>` : piece.b ? `<b>${t}</b>` : piece.i ? `<i>${t}</i>` : t;
    } else out += `<span class="placeholder"></span>`;
  }
  return out;
}

const CLASS: Partial<Record<Block["kind"], string>> = {
  title: "doc-title",
  date: "doc-date",
  label: "doc-label",
  party: "doc-party",
  recital: "doc-recital",
  clause: "doc-clause",
  subclause: "doc-subclause",
  "notes-title": "doc-notes-title",
  note: "doc-note",
  "sign-head": "doc-sign doc-sign-head",
  sign: "doc-sign",
};

const numbered = (cls: string, num: string, body: string) =>
  `<p class="${cls} doc-structured"><span class="doc-num">${esc(num)}</span><span class="doc-body">${body}</span></p>`;

export function blocksToPageHtml(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.kind === "sign-row") {
      const cols = (b.cols ?? [])
        .map((lines) => `<div class="doc-sign-col">${lines.map((l) => `<p class="doc-sign">${inline(l)}</p>`).join("")}</div>`)
        .join("");
      parts.push(`<div class="doc-sign-row">${cols}</div>`);
      continue;
    }
    const sec = b.kind === "section" ? /^(\d+\.)\s+([\s\S]+)$/.exec(b.text) : null;
    if (sec) {
      parts.push(numbered("doc-section", sec[1], inline(sec[2])));
      continue;
    }
    const cls = CLASS[b.kind] ?? (b.kind === "section" ? "doc-section" : "");
    if (b.num && (b.kind === "party" || b.kind === "recital" || b.kind === "clause" || b.kind === "subclause")) {
      const level = b.kind === "subclause" ? (b.level ?? subclauseLevel(b.num)) : 1;
      parts.push(numbered(level > 1 ? `${cls} doc-level-${level}` : cls, b.num, inline(b.text)));
      continue;
    }
    const classes = [cls, b.cont ? "doc-cont" : ""].filter(Boolean).join(" ");
    parts.push(`<p${classes ? ` class="${classes}"` : ""}>${inline(b.text)}</p>`);
  }
  return parts.join("");
}
