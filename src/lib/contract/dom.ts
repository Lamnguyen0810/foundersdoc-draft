import { parseDraft, splitPartyName, splitPlaceholders, type Block } from "./parse";

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
  plain: "",
};

/** Numbered kinds hang their number in the margin. */
const STRUCTURED = new Set<Block["kind"]>(["party", "recital", "clause", "subclause"]);

function appendText(doc: Document, el: HTMLElement, text: string, inNote = false): void {
  for (const piece of splitPlaceholders(text)) {
    if ("text" in piece) {
      el.appendChild(doc.createTextNode(piece.text));
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
    span.title = `Fill in: ${piece.placeholder.toLowerCase()}`;
    el.appendChild(span);
  }
}

export function blocksToParagraphs(doc: Document, blocks: Block[]): HTMLElement[] {
  const out: HTMLElement[] = [];

  for (const b of blocks) {
    const p = doc.createElement("p");
    const cls = CLASS[b.kind];

    if (STRUCTURED.has(b.kind) && b.num) {
      p.className = `${cls} doc-structured`.trim();
      const num = doc.createElement("span");
      num.className = "doc-num";
      num.textContent = b.num;

      const body = doc.createElement("span");
      body.className = "doc-body";

      // A party's defined name is bold up to the first bracket or comma.
      const named = b.kind === "party" ? splitPartyName(b.text) : null;
      if (named) {
        const strong = doc.createElement("b");
        strong.textContent = named.name;
        body.appendChild(strong);
        appendText(doc, body, named.rest);
      } else {
        appendText(doc, body, b.text);
      }

      p.appendChild(num);
      p.appendChild(body);
    } else {
      if (cls) p.className = cls;
      appendText(doc, p, b.text, b.kind === "note");
    }

    out.push(p);
  }

  /* Always last, never editable: whatever the lawyer does to the document, it
     should not be possible to delete the line that says it came from a model. */
  const foot = doc.createElement("p");
  foot.className = "doc-end-note";
  foot.contentEditable = "false";
  foot.textContent = "AI-generated first draft · Review before external use";
  out.push(foot);

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
