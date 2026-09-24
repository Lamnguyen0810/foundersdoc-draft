/**
 * Turning a generated draft into contract structure.
 *
 * The model returns plain text. A contract read as plain text is a wall; read
 * with numbering hung in the margin, defined terms in bold and gaps shown as
 * gaps, it is a document a lawyer can scan. This is the function that knows the
 * difference.
 *
 * ── WHY A PURE FUNCTION AND NOT DOM BUILDING ────────────────────────────────
 * The designer's file does this by creating elements as it goes, which works
 * but can only be checked by looking at it. Parsing to a plain list of blocks
 * first means the rules can be tested — "does a sub-clause split correctly",
 * "is a placeholder recognised mid-sentence" — in a few milliseconds, with no
 * browser. The DOM building is then a dumb translation of this output.
 *
 * The classification rules and their ORDER are taken from the Ver_46 design
 * exactly. Order matters: a heading like "3. CONFIDENTIALITY" must be tested
 * before the "3.1 ..." clause rule, or it is mis-filed.
 */

export type BlockKind =
  | "title"
  | "date"
  | "label"
  | "party"
  | "recital"
  | "section"
  | "clause"
  | "subclause"
  | "notes-title"
  | "note"
  | "plain";

export interface Block {
  kind: BlockKind;
  /** The hanging number: "(1)", "(A)", "3.1", "(a)". Empty for unnumbered blocks. */
  num: string;
  /** The text of the block, placeholders still written as [[LIKE THIS]]. */
  text: string;
}

/**
 * Collapse the wrapping the model emits, leaving blank-line breaks alone
 * (those have already separated the blocks by the time this runs).
 *
 * The design's version was `\n\s+` — a newline followed by whitespace — which
 * only collapses a line break when the NEXT LINE IS INDENTED. Real model output
 * wraps at column zero, so the newline survived, `.*$` stopped dead at it, and
 * every rule below silently failed to match: a numbered party clause came out
 * as an unformatted paragraph. Matching any newline with whatever surrounds it
 * is what was meant.
 */
function flatten(raw: string): string {
  return raw.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function parseDraft(draft: string): Block[] {
  const out: Block[] = [];
  const push = (kind: BlockKind, text: string, num = "") => out.push({ kind, num, text });

  const blocks = draft.trim().split(/\n\s*\n/);

  blocks.forEach((b, idx) => {
    const raw = b.replace(/\r/g, "");
    const t = flatten(raw);
    if (!t) return;

    // The first block is always the document's title.
    if (idx === 0) return push("title", t);

    if (/^THIS AGREEMENT\b/.test(t)) return push("date", t);
    if (/^(BETWEEN|WHEREAS|IT IS AGREED)/.test(t)) return push("label", t);

    // (1) Acme Pte Ltd (UEN …), a company incorporated in …
    let m = t.match(/^(\(\d+\))\s*(.*)$/);
    if (m) return push("party", m[2], m[1]);

    // (A) The Parties wish to …
    m = t.match(/^(\([A-Z]\))\s*(.*)$/);
    if (m) return push("recital", m[2], m[1]);

    // A numbered HEADING — "3. CONFIDENTIALITY" — must be caught before 3.1.
    if (/^\d+\.\s{1,}/.test(t) && /^[\d.]+\s+[A-Z][A-Z\s&'-]+$/.test(t)) {
      const sm = t.match(/^(\d+\.)\s+(.*)$/)!;
      /* As written. This used to title-case the heading ("3. CONFIDENTIALITY"
         → "3. Confidentiality"), which was the app's taste over the firm's:
         the playbook and the precedents decide whether headings are capitals. */
      return push("section", `${sm[1]} ${sm[2].trim()}`);
    }

    // 3.1 The Recipient shall …
    m = t.match(/^(\d+\.\d+)\s+(.*)$/);
    if (m) return push("clause", m[2], m[1]);

    /* A run of sub-clauses arrives as ONE block with single newlines between
       them, so it is split here rather than by the blank-line pass above. */
    if (/^\s*\([a-z]\)/.test(raw)) {
      raw
        .trim()
        .split(/\n\s*(?=\([a-z]\))/g)
        .forEach((x) => {
          const sx = flatten(x);
          const sm = sx.match(/^(\([a-z]\))\s*(.*)$/);
          if (sm) push("subclause", sm[2], sm[1]);
          else push("plain", sx);
        });
      return;
    }

    if (/DRAFTER'S NOTES/.test(t)) return push("notes-title", "Drafter’s notes");

    /* Drafter's notes arrive as a run of bullets separated by single newlines,
       so — exactly like sub-clauses — they are one block and must be split, or
       four separate notes render as one long paragraph. The design collapsed
       them; each note is a point the lawyer has to act on and deserves its own
       line. */
    if (/^•/.test(raw.trim())) {
      raw
        .trim()
        .split(/\n\s*(?=•)/g)
        .forEach((x) => {
          const sx = flatten(x).replace(/^•\s*/, "");
          if (sx) push("note", sx);
        });
      return;
    }

    push("plain", t);
  });

  return out;
}

/** A run of text split into literal parts and [[PLACEHOLDER]] parts. */
export type Piece = { text: string } | { placeholder: string };

export function splitPlaceholders(text: string): Piece[] {
  return text
    .split(/(\[\[[^\]]+\]\])/g)
    .filter((p) => p !== "")
    .map((part) => {
      const m = part.match(/^\[\[([^\]]+)\]\]$/);
      return m ? { placeholder: m[1] } : { text: part };
    });
}

/** In a party line, the name up to the first "(" or "," is the defined term. */
export function splitPartyName(text: string): { name: string; rest: string } | null {
  const m = text.match(/^(.+?)(\s\(|,)(.*)$/);
  return m ? { name: m[1], rest: m[2] + m[3] } : null;
}
