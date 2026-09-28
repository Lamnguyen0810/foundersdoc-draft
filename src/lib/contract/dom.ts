import { pairSignatures, parseDraft, splitPlaceholders, subclauseLevel, type Block } from "./parse";

/**
 * Blocks → DOM, for the editable document.
 *
 * Kept apart from parse.ts so the rules stay testable in Node and only this
 * half needs a browser. Every element here mirrors a class in the Ver_46
 * layer — `.doc-structured` hangs the number in the margin, `.placeholder`
 * draws the fill-in rule. Renaming one without the other silently loses the
 * formatting, so treat the class names as the contract they are.
 */

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
  "sign-head": "doc-sign doc-sign-head",
  sign: "doc-sign",
  "sign-row": "doc-sign-row",
  plain: "",
};

/** Numbered kinds hang their number in the margin. */
const STRUCTURED = new Set<Block["kind"]>(["party", "recital", "clause", "subclause"]);

function appendText(doc: Document, el: HTMLElement, text: string, inNote = false): void {
  for (const piece of splitPlaceholders(text)) {
    if ("note" in piece) {
      /* The playbook's FD Note: bold italic in square brackets, highlighted
         on a draft (R10.3, R10.4). Not editable as a gap — it is a note. */
      const span = doc.createElement("span");
      span.className = "fd-note";
      span.textContent = `[FD Note: ${piece.note}]`;
      el.appendChild(span);
      continue;
    }
    if ("text" in piece) {
      /* **bold** and _italic_, as the precedents have them. */
      if (piece.b || piece.i) {
        const wrap = doc.createElement(piece.b ? "b" : "i");
        if (piece.b && piece.i) {
          const inner = doc.createElement("i");
          inner.textContent = piece.text;
          wrap.appendChild(inner);
        } else {
          wrap.textContent = piece.text;
        }
        el.appendChild(wrap);
      } else {
        el.appendChild(doc.createTextNode(piece.text));
      }
      continue;
    }
    if (inNote) {
      // Inside a drafter's note a [[LABEL]] reads as a heading, not a gap.
      const label = piece.placeholder;
      el.appendChild(doc.createTextNode(label.charAt(0) + label.slice(1).toLowerCase() + ":"));
      continue;
    }
    /* An empty span, styled as a ruled gap. It is left EMPTY on purpose: the
       lawyer types into it, and an empty box is an unmistakable "not answered"
       in a way that grey placeholder words never are. */
    const span = doc.createElement("span");
    span.className = "placeholder";
    span.dataset.ph = piece.placeholder;
    span.title = piece.placeholder === "●" ? "Fill in" : `Fill in: ${piece.placeholder.toLowerCase()}`;
    el.appendChild(span);
  }
}

export function blocksToParagraphs(doc: Document, blocks: Block[]): HTMLElement[] {
  const out: HTMLElement[] = [];

  for (const b of blocks) {
    /* Signature blocks side by side: a row of columns, each a short run of
       lines under the rule it is signed on. */
    if (b.kind === "sign-row") {
      out.push(signRow(doc, b.cols ?? []));
      continue;
    }

    const p = doc.createElement("p");
    const cls = CLASS[b.kind];

    /* "1. CONFIDENTIALITY": the number and the heading as two parts, so the
       heading can be underlined and hung beside its number like the clauses. */
    const sec = b.kind === "section" ? /^(\d+\.)\s+([\s\S]+)$/.exec(b.text) : null;
    if (sec) {
      p.className = "doc-section doc-structured";
      const num = doc.createElement("span");
      num.className = "doc-num";
      num.textContent = sec[1];
      const body = doc.createElement("span");
      body.className = "doc-body";
      appendText(doc, body, sec[2]);
      p.append(num, body);
      out.push(p);
      continue;
    }

    if (STRUCTURED.has(b.kind) && b.num) {
      p.className = `${cls} doc-structured`.trim();
      if (b.kind === "subclause") {
        const level = b.level ?? subclauseLevel(b.num);
        if (level > 1) p.classList.add(`doc-level-${level}`);
      }
      const num = doc.createElement("span");
      num.className = "doc-num";
      num.textContent = b.num;

      const body = doc.createElement("span");
      body.className = "doc-body";

      /* A party's name used to be set in bold up to the first bracket. Not
         any more: emphasis is the firm's call, made in the playbook and shown
         in the precedents, and the app adds none of its own. */
      appendText(doc, body, b.text);

      p.appendChild(num);
      p.appendChild(body);
    } else {
      const classes = [cls, b.cont ? "doc-cont" : ""].filter(Boolean).join(" ");
      if (classes) p.className = classes;
      appendText(doc, p, b.text, b.kind === "note");
    }

    out.push(p);
  }

  /* Nothing is appended. The document is the document: the firm asked that
     no line of the app's own — no notice, no notes — sit inside it. The
     drafter's notes are shown beside the page instead (DraftReady), and the
     "AI-generated" reminder lives in the product, not in the file. */
  return out;
}

/** One row of signature blocks (at most two), as the page shows it. */
export function signRow(doc: Document, cols: string[][]): HTMLElement {
  const row = doc.createElement("div");
  row.className = "doc-sign-row";
  for (const lines of cols) {
    const col = doc.createElement("div");
    col.className = "doc-sign-col";
    for (const line of lines) {
      const p = doc.createElement("p");
      p.className = "doc-sign";
      appendText(doc, p, line);
      col.appendChild(p);
    }
    row.appendChild(col);
  }
  return row;
}

/**
 * A draft saved before the side-by-side layout, brought up to it as it opens:
 * a section heading split into its number and its words, and a run of stacked
 * signature lines ("SIGNED for and on behalf of X", "Signature:", "Name:" …)
 * set out as a row of blocks. Everything else is left exactly as saved.
 */
export function upgradeSaved(doc: Document, items: HTMLElement[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  let run: HTMLElement[] = [];
  const flushRun = () => {
    if (!run.length) return;
    /* Back to marked-up lines, through the same folding the parser uses. */
    const md = (el: HTMLElement) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".placeholder").forEach((ph) => {
        ph.replaceWith(doc.createTextNode((ph.textContent ?? "").trim() || "[●]"));
      });
      clone.querySelectorAll("b,strong").forEach((bEl) => bEl.replaceWith(doc.createTextNode(`**${bEl.textContent ?? ""}**`)));
      return (clone.textContent ?? "").trim();
    };
    const blocks: Block[] = run.map((el) => ({
      kind: el.classList.contains("doc-sign-head") ? "sign-head" : "sign",
      num: "",
      text: md(el),
    }));
    for (const b of pairSignatures(blocks)) {
      if (b.kind === "sign-row") out.push(signRow(doc, b.cols ?? []));
    }
    run = [];
  };

  for (const el of items) {
    if (el.tagName === "P" && el.classList.contains("doc-sign")) {
      run.push(el);
      continue;
    }
    flushRun();
    if (el.classList.contains("doc-section") && !el.querySelector(".doc-num")) {
      const m = /^(\d+\.)\s+([\s\S]+)$/.exec((el.textContent ?? "").trim());
      if (m) {
        const p = doc.createElement("p");
        p.className = "doc-section doc-structured";
        const num = doc.createElement("span");
        num.className = "doc-num";
        num.textContent = m[1];
        const body = doc.createElement("span");
        body.className = "doc-body";
        body.textContent = m[2];
        p.append(num, body);
        out.push(p);
        continue;
      }
    }
    out.push(el);
  }
  flushRun();
  return out;
}

export function draftToParagraphs(doc: Document, draft: string): HTMLElement[] {
  return blocksToParagraphs(doc, parseDraft(draft));
}

/**
 * The document back as plain text — for Copy, for Word export, and for the
 * word count. Empty placeholders become a visible blank rule so a gap in the
 * pasted text is still obviously a gap.
 */
export function paragraphText(p: HTMLElement): string {
  /* Signature blocks: each party's lines, one block after the other. */
  if (p.classList.contains("doc-sign-row")) {
    return Array.from(p.querySelectorAll<HTMLElement>(".doc-sign-col"))
      .map((col) => Array.from(col.querySelectorAll<HTMLElement>("p")).map((line) => paragraphText(line)).join("\n"))
      .join("\n\n");
  }
  const num = p.querySelector(":scope > .doc-num");
  const body = p.querySelector(":scope > .doc-body");

  const filled = (el: Element): string => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".placeholder").forEach((s) => {
      if (!s.textContent?.trim()) s.textContent = "____________";
    });
    return clone.textContent ?? "";
  };

  if (num && body) {
    const gap = p.classList.contains("doc-subclause") ? "\t" : " ";
    return (num.textContent ?? "") + gap + filled(body);
  }
  return filled(p);
}
