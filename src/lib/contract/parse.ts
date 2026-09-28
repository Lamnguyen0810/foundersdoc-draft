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
  /** "SIGNED for and on behalf of X" — the first line of a signature block. */
  | "sign-head"
  /** "Signature:", "Name:", "Title:", "Date:" — the lines beneath it. */
  | "sign"
  | "plain";

export interface Block {
  kind: BlockKind;
  /** The hanging number: "(1)", "(A)", "3.1", "(a)". Empty for unnumbered blocks. */
  num: string;
  /** The text of the block, placeholders still written as [[LIKE THIS]]. */
  text: string;
  /** Sub-clauses only: how deep the number sits — (a) 1, (ii) 2, (A) 3. */
  level?: 1 | 2 | 3;
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
/* ── SIGNATURE BLOCKS ────────────────────────────────────────────────────
   Each line of a signature block is a line of its own, even when the model
   wrote the block with single newlines — flatten() would otherwise run
   "SIGNED for and on behalf of X Signature: Name: Title:" into one sentence. */
const SIGN_HEAD = /^(?:SIGNED|Signed|EXECUTED|Executed)\b.*\b(?:for and on behalf of|by)\b|^for and on behalf of\b/i;
const SIGN_LINE =
  /^(?:Signed by\b|(?:Signature|Name|Title|Designation|Position|Date|In the presence of|Witness)\s*:|\[?\s*(?:Director|Authori[sz]ed signatory)\b|_{3,}\s*$|\[●\]\s*$)/i;

function signLines(raw: string): string[] | null {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const bare = (l: string) => l.replace(/\*\*/g, "");
  if (!lines.length) return null;
  const first = bare(lines[0]);
  if (SIGN_HEAD.test(first) || lines.every((l) => SIGN_LINE.test(bare(l)))) return lines;
  return null;
}

/**
 * One short block per party: "SIGNED for and on behalf of X", then
 * Signature, Name, Title, Date. The firm's precedents sign with "Signed by
 * ____ / for and on behalf of X / ____ / [Director / Authorised signatory] /
 * Name: / Title:", which asks for the signatory twice; the firm asked for
 * that to go. This folds the old shape into the new one, so a draft written
 * either way reads the same on screen and in Word.
 */
function tidySignatures(blocks: Block[]): Block[] {
  const out: Block[] = [];
  const isRule = (t: string) => /^(?:_{3,}|\[●\])$/.test(t.replace(/\*\*/g, "").trim());
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.kind !== "sign" && b.kind !== "sign-head") {
      out.push(b);
      continue;
    }
    const bare = b.text.replace(/\*\*/g, "").trim();
    /* "Signed by ____" followed by "for and on behalf of X": one head. */
    if (/^Signed by\b/i.test(bare)) {
      const next = blocks[k + 1];
      const nextBare = next ? next.text.replace(/\*\*/g, "").trim() : "";
      if (next && /^for and on behalf of\b/i.test(nextBare)) {
        out.push({ kind: "sign-head", num: "", text: `SIGNED ${next.text.trim()}` });
        out.push({ kind: "sign", num: "", text: "Signature: [●]" });
        k += 1;
        continue;
      }
      /* "Signed by" on its own is the signature line. */
      out.push({ kind: "sign", num: "", text: "Signature: [●]" });
      continue;
    }
    /* A bare rule or a capacity line under the head says nothing the
       Signature and Title lines do not. */
    if (isRule(b.text) || /^\[?\s*(?:Director|Authori[sz]ed signatory)\b[^\]]*\]?\s*$/i.test(bare)) continue;
    /* A second Name/Title in the same block is the duplicate. */
    const label = /^(Signature|Name|Title|Date)\s*:/i.exec(bare)?.[1]?.toLowerCase();
    if (label) {
      let seen = false;
      for (let j = out.length - 1; j >= 0 && (out[j].kind === "sign" || out[j].kind === "sign-head"); j--) {
        if (out[j].kind === "sign-head") break;
        if (new RegExp(`^${label}\\s*:`, "i").test(out[j].text.replace(/\*\*/g, "").trim())) seen = true;
      }
      if (seen) continue;
    }
    out.push(b);
  }
  return out;
}

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

    /* ── THE MARKS ──────────────────────────────────────────────────────
       The model writes **bold** and _italic_ where the firm's precedents
       have them (lib/extract.ts, lib/prompt.ts). The shape rules below look
       at the words, so a block that BEGINS with a mark — "**1. DEFINITIONS**",
       "**(1)** Acme" — is classified on the bare text and its number taken
       from there; the marks stay in the text for the renderer. A heading is
       bold by its class already, so its own marks are dropped. */
    const bare = t.replace(/\*\*/g, "").replace(/(?<!\w)_(?=\S)|(?<=\S)_(?!\w)/g, "");
    const afterNum = (num: string): string => {
      const esc = num.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!/^\*\*/.test(t)) return t.replace(new RegExp(`^${esc}\\s*`), "");
      const rest = t.replace(new RegExp(`^\\*\\*\\s*${esc}\\s*`), "");
      /* "**(1)** Acme" — the mark closed right after the number: drop it.
         "**(2) Kestrel Ltd** (…)" — it closes after the name: reopen it. */
      return rest.startsWith("**") ? rest.slice(2).trim() : `**${rest}`;
    };

    // The first block is always the document's title.
    if (idx === 0) return push("title", bare);

    const sign = signLines(raw);
    if (sign) {
      for (const line of sign) {
        const lb = line.replace(/\*\*/g, "");
        /* A row of underscores is a blank to sign or fill in: shown as the
           same ruled gap as every other blank. */
        push(SIGN_HEAD.test(lb) && !/^Signed by\b/i.test(lb) ? "sign-head" : "sign", line.replace(/_{3,}/g, "[●]"));
      }
      return;
    }

    if (/^THIS AGREEMENT\b/.test(bare)) return push("date", t);
    /* A short line in capitals with no number — PARTIES, BACKGROUND, AGREED
       TERMS, SCHEDULE 1 — is a label: bold, its own line, not a clause. */
    if (/^(BETWEEN|WHEREAS|IT IS AGREED)/.test(bare) || (/^[A-Z][A-Z\s&'’:-]{1,48}$/.test(bare) && bare.split(/\s+/).length <= 5)) {
      return push("label", t);
    }

    // (1) Acme Pte Ltd (UEN …), a company incorporated in …
    let m = bare.match(/^(\(\d+\))\s*(.*)$/);
    if (m) return push("party", afterNum(m[1]), m[1]);

    /* (A) The Parties wish to … — a recital, unless the document is already
       into its numbered clauses, where "(A)" is the third level of a list. */
    m = bare.match(/^(\([A-Z]\))\s*(.*)$/);
    if (m) {
      const last = out[out.length - 1];
      const inClauses = last && (last.kind === "clause" || last.kind === "subclause");
      if (inClauses) return out.push({ kind: "subclause", num: m[1], text: afterNum(m[1]), level: 3 });
      return push("recital", afterNum(m[1]), m[1]);
    }

    // A numbered HEADING — "3. CONFIDENTIALITY" — must be caught before 3.1.
    if (/^\d+\.\s{1,}/.test(bare) && /^[\d.]+\s+[A-Z][A-Z\s&'’,;:/()-]+$/.test(bare)) {
      const sm = bare.match(/^(\d+\.)\s+(.*)$/)!;
      /* As written. This used to title-case the heading ("3. CONFIDENTIALITY"
         → "3. Confidentiality"), which was the app's taste over the firm's:
         the playbook and the precedents decide whether headings are capitals. */
      return push("section", `${sm[1]} ${sm[2].trim()}`);
    }

    // 3.1 The Recipient shall …
    m = bare.match(/^(\d+\.\d+)\s+(.*)$/);
    if (m) return push("clause", afterNum(m[1]), m[1]);

    /* A run of sub-clauses arrives as ONE block with single newlines between
       them, so it is split here rather than by the blank-line pass above. */
    /* Three depths, as the numbering hierarchies of most playbooks go:
       (a) letters, then (i) (ii) (iii) romans, then (A) capitals. A lone
       "(i)" is a letter — it is the ninth item of a lettered list far more
       often than the first of a roman one, and the difference is an indent. */
    if (/^\s*(?:\*\*)?\((?:[a-z]|[ivx]{2,5}|[A-Z])\)/.test(raw)) {
      raw
        .trim()
        .split(/\n\s*(?=(?:\*\*)?\((?:[a-z]|[ivx]{2,5}|[A-Z])\))/g)
        .forEach((x, k, items) => {
          const sx = flatten(x);
          const sm = sx.match(/^(?:\*\*\s*)?(\((?:[a-z]|[ivx]{2,5}|[A-Z])\))(?:\s*\*\*)?\s*(.*)$/);
          if (!sm) return push("plain", sx);
          /* "(i)" is roman when "(ii)" follows it, or when it does not follow
             "(h)" — as the ninth letter it can only come after the eighth. */
          const prev = k > 0 ? items[k - 1] : (out[out.length - 1]?.kind === "subclause" ? out[out.length - 1].num : "");
          const roman =
            sm[1] === "(i)" &&
            (/^\s*(?:\*\*)?\(ii\)/.test(items[k + 1] ?? "") || !/\(h\)/.test(prev));
          out.push({ kind: "subclause", num: sm[1], text: sm[2], level: roman ? 2 : subclauseLevel(sm[1]) });
        });
      return;
    }

    if (/DRAFTER[’'‘`]?S\s+NOTES?/i.test(t)) return push("notes-title", "Drafter’s notes");

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

  return tidySignatures(out);
}

/** A run of text split into literal parts, marked (bold/italic) parts and
 *  [[PLACEHOLDER]] parts. */
export type Piece =
  | { text: string; b?: boolean; i?: boolean }
  | { placeholder: string }
  /** An [FD Note: …] — the playbook's in-text note for the reviewing lawyer. */
  | { note: string };

/** The playbook's in-text note, with or without the bold-italic marks the
 *  playbook wraps it in (R10.3): **_[FD Note: …]_** */
const NOTE = /(\*{0,2}_?\[\s*FD Note:[^\]]*\]_?\*{0,2})/gi;
/** A gap: the playbook's "[●]", or the older "[[TO CONFIRM: …]]". */
const GAP = /(\[\[[^\]]+\]\]|\[●\])/g;
/** **bold** and _italic_. An underscore inside a word is not a mark. */
const MARK = /(\*\*[^*]+\*\*|(?<!\w)_[^_\n]+_(?!\w))/g;

export function splitPlaceholders(text: string): Piece[] {
  const out: Piece[] = [];
  const gaps = (run: string, b?: boolean, i?: boolean) => {
    for (const part of run.split(GAP)) {
      if (part === "") continue;
      const m = part.match(/^\[\[([^\]]+)\]\]$/);
      if (m) out.push({ placeholder: m[1] });
      else if (part === "[●]") out.push({ placeholder: "●" });
      else out.push(b || i ? { text: part, b, i } : { text: part });
    }
  };
  for (const chunk of text.split(NOTE)) {
    if (chunk === "") continue;
    const n = chunk.match(/^\*{0,2}_?\[\s*FD Note:\s*([^\]]*)\]_?\*{0,2}$/i);
    if (n) {
      out.push({ note: n[1].trim() });
      continue;
    }
    /* Marks first, then gaps inside each run, so "**[●] PTE. LTD.**" is one
       bold run with a gap in it rather than two stray asterisks. */
    for (const run of chunk.split(MARK)) {
      if (run === "") continue;
      if (/^\*\*[^*]+\*\*$/.test(run)) gaps(run.slice(2, -2), true);
      else if (/^_[^_\n]+_$/.test(run)) gaps(run.slice(1, -1), undefined, true);
      else gaps(run);
    }
  }
  return out;
}

/** In a party line, the name up to the first "(" or "," is the defined term. */
export function splitPartyName(text: string): { name: string; rest: string } | null {
  const m = text.match(/^(.+?)(\s\(|,)(.*)$/);
  return m ? { name: m[1], rest: m[2] + m[3] } : null;
}

/** How deep a sub-clause number sits: (a) 1, (ii) 2, (A) 3. */
export function subclauseLevel(num: string): 1 | 2 | 3 {
  if (/^\([ivx]{2,5}\)$/.test(num)) return 2;
  if (/^\([A-Z]\)$/.test(num)) return 3;
  return 1;
}
