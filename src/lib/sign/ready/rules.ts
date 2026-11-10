/**
 * FD Sign "signing-ready" check (0201): the rules.
 *
 * Rachel, 6 Nov 2026: people sometimes upload documents that are not ready to be
 * signed, so FD Sign checks them first, as a separate tab. The checks follow the
 * Execution-Readiness Playbook (#fdai-signing, 30 Jul 2026), Stage 1 Detection:
 *
 *   PH  placeholders, blanks, merge syntax, optional wording left in
 *   AN  tracked changes, comments, notes to draft, highlights, DRAFT marks, hidden text
 *   ST  missing schedules, cross-references, signature blocks
 *   TE  password, existing digital signature, no text layer, macros
 *   SG  wet-ink only, deeds, notarisation, excluded documents, initialling, seals
 *
 * Two design rules from the playbook:
 *   1. Zones first. A blank line is a blocker in a clause but a signing field in a
 *      signature block: blanks there are "expected" and never raised as blockers.
 *   2. Nothing here changes the document. The check reports; people fix.
 *
 * Pure functions, no server code: easy to test (scratchpad tests) and to reuse.
 * Supports legal workflows; it is a checklist, not legal advice.
 */

export const DETECTOR_VERSION = "2026.11.1";

export type Severity = "blocker" | "warning" | "advisory" | "expected";
export type Category = "placeholder" | "annotation" | "structure" | "file" | "signability" | "ai";

export interface Issue {
  code: string;
  category: Category;
  severity: Severity;
  title: string;
  /** the words found, as they are in the document (short) */
  evidence?: string;
  /** "Page 3" / "Paragraph 41" / "Whole file" */
  where: string;
  /** reading order, for sorting */
  order: number;
  action: string;
  source: "rules" | "ai";
  /** the exact words that triggered it, to mark them on the page (0204) */
  hit?: string;
  /** where to draw the mark on the preview: page (1-based) and a box in fractions of the page, from the top-left (0204) */
  mark?: Mark;
}

export interface Mark {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Line {
  text: string;
  /** PDF page (1-based), or null for Word */
  page: number | null;
  /** Word paragraph (1-based), or line number in a PDF page */
  para: number;
  /** PDF only: the line's box on its page, in fractions from the top-left (0204) */
  rect?: { x: number; y: number; w: number; h: number };
  /** PDF only: where each text run starts in `text` and on the page (fractions), to mark single words (0204) */
  segs?: Array<{ at: number; n: number; x: number; w: number }>;
}

export interface ReadDoc {
  kind: "pdf" | "docx";
  pages: number | null;
  lines: Line[];
  /** text from Word headers/footers, or the first and last line of each PDF page */
  margins: Array<{ text: string; where: string }>;
  meta: {
    encrypted?: boolean;
    digitallySigned?: boolean;
    hasText: boolean;
    trackedChanges?: number;
    comments?: number;
    highlights?: number;
    hidden?: number;
    colouredRuns?: number;
    placeholderControls?: number;
    macros?: boolean;
    embedded?: number;
    watermark?: string | null;
    pdfComments?: number;
    pdfHighlights?: number;
  };
}

export type Verdict = "ready" | "ready_with_ack" | "not_ready" | "not_signable_here" | "cannot_process";

export interface Report {
  verdict: Verdict;
  issues: Issue[];
  counts: Record<Severity, number>;
  expectedBlanks: number;
  detector: string;
}

const where = (l: Line) => (l.page ? `Page ${l.page}` : `Paragraph ${l.para}`);
const order = (l: Line, i: number) => (l.page ?? 0) * 100000 + i;

/** A short piece of the line around the match, so the user can find it. */
export function snippet(text: string, index: number, len: number, room = 60): string {
  const a = Math.max(0, index - room);
  const b = Math.min(text.length, index + len + room);
  return `${a > 0 ? "…" : ""}${text.slice(a, b).replace(/\s+/g, " ").trim()}${b < text.length ? "…" : ""}`;
}

/* ── zones ─────────────────────────────────────────────────────────────── */

const SIG_START = /(IN WITNESS WHEREOF|EXECUTED (?:BY|AS|ON BEHALF)|SIGNED (?:BY|for and on behalf|on behalf)|SIGNATURE PAGE|EXECUTION PAGE|AS WITNESS(?:ED)?|SIGNATORIES)/i;
const SCHEDULE_HEAD = /^\s*(SCHEDULE|ANNEX|APPENDIX|EXHIBIT|ANNEXURE)\s+([0-9]+|[A-Z])\b/i;
/** "Name: ____", "Signature ......", "Date:" lines: blanks here are signing fields */
const FIELD_LABEL = /^\s*(?:\(?[a-z0-9]\)\s*)?(signature|signed|sign|name|full name|title|designation|position|date|dated|witness|nric|passport|id no|address|company|for and on behalf of|by|in the presence of|director|authorised signatory)\b[^\n]{0,30}(?:_{3,}|\.{4,}|…{2,}|:\s*$)/i;
const TOC_LINE = /\.{4,}\s*\d+\s*$/;
/** "This Agreement is dated ____" / "made on the ___ day of ___": the date is often filled in at signing (playbook: Expected) */
const DATE_BLANK = /\b(?:is dated|dated(?: as of)?|made on|entered into on|day of|effective (?:date|as of))\b[^\n]{0,20}(?:_{3,}|\.{4,})/i;

export function zones(lines: Line[]): ("sig" | "body")[] {
  const out: ("sig" | "body")[] = lines.map(() => "body");
  const from = Math.floor(lines.length * 0.4);
  let inSig = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    if (!inSig && i >= from && SIG_START.test(t)) inSig = true;
    else if (inSig && SCHEDULE_HEAD.test(t) && t.trim().length < 90) inSig = false;
    if (inSig) out[i] = "sig";
  }
  return out;
}

/* ── the rules ─────────────────────────────────────────────────────────── */

/** bracket contents that are NOT placeholders: years, citations, sub-clause labels, editorial marks */
function bracketIsFine(inner: string, after: string): boolean {
  const s = inner.trim();
  if (!s) return false; /* [ ] is a blank */
  if (/^\d{4}$/.test(s) && /^\s*[A-Z0-9]/.test(after)) return true; /* [2019] UKSC 1, [2020] SGCA 3 */
  if (/^(sic|emphasis added|emphasis ours|sic\.|original emphasis)$/i.test(s)) return true;
  if (/^([a-z]{1,2}|[ivxlc]{1,5}|\d{1,3}(\.\d{1,3})*)$/i.test(s) && !/^(x+|tbc|tbd)$/i.test(s)) return true; /* (a) [1] [iv] 2.1 */
  if (/^the\s+["“]?[A-Z]/.test(s) && s.length < 40) return true; /* [the "Company"] bracketed defined term */
  if (/^["“][^"”]+["”]$/.test(s)) return true; /* ["Company"] */
  return false;
}
function bracketIsPlaceholder(inner: string): boolean {
  const s = inner.trim();
  if (!s) return true;
  if (/^[●•■□*…·.\-_x]+$/i.test(s)) return true; /* [●] [***] [...] [___] [xxx] */
  if (/\b(insert|enter|name of|date of|amount|address|number|tbc|tbd|tba|details|company name|party name|to be (?:confirmed|agreed|inserted|completed))\b/i.test(s)) return true;
  if (/^[A-Z][A-Z0-9 &/'’.,-]{2,40}$/.test(s) && /[A-Z]{3,}/.test(s) && !/^(SGD|USD|GBP|EUR|NRIC|UEN|ACRA|IRAS|MOM|ETA|SIAC|ICC|LCIA)$/.test(s)) return true; /* [PARTY NAME] [DATE] */
  if (/^(option|alternative)\s*[a-z0-9]\b/i.test(s)) return true;
  if (/^(name|date|amount|address|price|fee|sum|number|figure|percentage|term|period)$/i.test(s)) return true;
  if (s.length <= 40 && /\b(name|date|address|amount|number|price|fee|figure|signatory|title|designation|email|nric|passport|uen)s?\b/i.test(s) && !/^the\s/i.test(s)) return true; /* [Recipient name] [date of signing] */
  return false;
}

interface Rule {
  code: string;
  category: Category;
  severity: Severity;
  re: RegExp;
  title: (m: RegExpExecArray) => string;
  action: string;
  /** only outside the signature zone */
  bodyOnly?: boolean;
  /** skip the hit when this returns true */
  skip?: (m: RegExpExecArray, line: string) => boolean;
  /** a blocker only in the title area (first lines); a mention further down is a warning */
  titleBlocker?: boolean;
}

const RULES: Rule[] = [
  {
    code: "PH-003",
    category: "placeholder",
    severity: "blocker",
    re: /\b(TBD|TBC|TBA|XXX+|X{3,})\b|\?{3,}/g,
    title: (m) => `"${m[0]}" left in the document`,
    action: "Replace it with the agreed wording or figure.",
  },
  {
    code: "PH-004",
    category: "placeholder",
    severity: "blocker",
    re: /\{\{[^}\n]{1,60}\}\}|<<[^>\n]{1,60}>>|\$\{[^}\n]{1,60}\}|%%[A-Za-z_][A-Za-z0-9_]{0,40}%%|«[^»\n]{1,60}»/g,
    title: (m) => `Mail-merge field not filled in: ${m[0]}`,
    action: "Fill in the field, or remove it.",
  },
  {
    code: "PH-006",
    category: "placeholder",
    severity: "blocker",
    re: /(?:S\$|US\$|SGD|USD|GBP|EUR|RM|HK\$|A\$|£|€|\$)\s?(?:\[[^\]\n]{0,20}\]|_{2,}|\.{3,}|…)|\[\s*\]\s*(?:per cent|percent|%)/gi,
    title: () => "An amount is left blank",
    action: "Put in the agreed amount.",
  },
  {
    code: "PH-007",
    category: "placeholder",
    severity: "blocker",
    re: /Error!\s*(?:Reference source not found|Bookmark not defined|No text of specified style)|\{\s*REF\s+_Ref\w*/gi,
    title: () => "Broken cross-reference (Word field error)",
    action: "In Word, update the fields (Ctrl+A, then F9) and fix the reference.",
  },
  {
    code: "PH-008",
    category: "placeholder",
    severity: "blocker",
    re: /\[\s*Option\s+[A-Z0-9]\s*\]|\bdelete (?:as|whichever is) (?:applicable|appropriate|not applicable)\b|\*\s*delete\b|\[\s*(?:select|choose)[^\]\n]{0,40}\]/gi,
    title: () => "Optional wording not chosen yet",
    action: "Keep the option that applies and delete the rest.",
  },
  {
    code: "AN-005",
    category: "annotation",
    severity: "blocker",
    re: /\b(?:NTD|N\.T\.D\.)\b\s*:?|\bNote to (?:draft|client|drafter|FD|lawyer)s?\b|\bDrafting note\b|\b(?:FD|Lawyer'?s?|Client)\s+(?:note|comment)\s*:|\[\s*(?:Note|Comment|Query)\s*:/gi,
    title: () => "Note to draft left in",
    action: "Delete the note once the point is settled.",
  },
  {
    code: "AN-006",
    category: "annotation",
    severity: "blocker",
    re: /\b(SUBJECT TO CONTRACT|NOT FOR EXECUTION|FOR DISCUSSION(?: PURPOSES)?(?: ONLY)?|DRAFT FOR (?:DISCUSSION|COMMENT|REVIEW))\b/g,
    title: (m) => `Marked "${m[1]}"`,
    action: "Remove the mark only if everyone agrees this is the final version.",
  },
  {
    code: "SG-004",
    category: "signability",
    severity: "blocker",
    re: /\bwet[- ]ink\b|\bmanuscript signatures?\b|\b(?:in|with) (?:original|handwritten|wet) (?:ink|signatures?)\b|\bsigned in (?:ink|hard ?copy)\b/gi,
    title: () => "Says it must be signed in ink",
    action: "This document asks for a handwritten signature. Change that clause, or sign it on paper.",
  },
  {
    code: "SG-005",
    category: "signability",
    severity: "blocker",
    re: /\bexecuted (?:and delivered )?as a deed\b|\bsigned,? sealed and delivered\b|\bdeed poll\b/gi,
    title: () => "Looks like a deed",
    action: "Deeds may need a witness and special formalities. Check with a lawyer before signing electronically.",
  },
  {
    code: "SG-006",
    category: "signability",
    severity: "blocker",
    titleBlocker: true,
    re: /\bnotar(?:y public|ised|ized|isation|ization)\b|\bapostill(?:e|ed)\b|\bcommissioner for oaths\b|\bsworn (?:before|at)\b|\bstatutory declaration\b/gi,
    title: () => "Needs a notary or a sworn signature",
    action: "This must be signed in front of a notary or commissioner. FD Sign can't do that part.",
  },
  {
    code: "SG-007",
    category: "signability",
    severity: "blocker",
    titleBlocker: true,
    re: /\blast will\b|\bwill and testament\b|\btestamentary\b|\b(?:lasting )?power of attorney\b|\bnegotiable instrument\b|\bbill of exchange\b|\bpromissory note\b|\bdocument of title\b|\bbill of lading\b|\bdeclaration of trust\b/gi,
    title: (m) => `A kind of document that may not be signable electronically (${m[0]})`,
    action: "Singapore's Electronic Transactions Act excludes some documents. Check with a lawyer before using an e-signature.",
  },
  {
    code: "SG-009",
    category: "signability",
    severity: "warning",
    re: /\b(?:each|every) page (?:shall|must|is to|to) be initial(?:l)?ed\b|\binitial(?:l)?ed on (?:each|every) page\b/gi,
    title: () => "Every page must be initialled",
    action: "Add an Initials box on each page in the Fields step.",
  },
  {
    code: "SG-010",
    category: "signability",
    severity: "warning",
    re: /\btwo directors\b|\ba director and (?:the |a )?(?:company )?secretary\b|\bduly authori[sz]ed (?:officer|signator(?:y|ies))\b/gi,
    title: () => "Needs a particular signatory (e.g. two directors)",
    action: "Make sure the right people are added as signers.",
  },
  {
    code: "SG-011",
    category: "signability",
    severity: "warning",
    re: /\bcommon seal\b|\bcompany seal\b|\bseal (?:is|was) (?:hereto )?affixed\b/gi,
    title: () => "Asks for a company seal",
    action: "A seal can't be applied electronically. Check whether the company still uses one.",
  },
  {
    code: "PH-005",
    category: "placeholder",
    severity: "advisory",
    re: /\band\/or\b/gi,
    title: () => '"and/or" used',
    action: 'Check that "and/or" is intended. It is common, but it can be unclear.',
    bodyOnly: true,
  },
];

export function detect(doc: ReadDoc): Report {
  const issues: Issue[] = [];
  let expectedBlanks = 0;
  const push = (i: Issue) => issues.push(i);
  const fileWide = { where: "Whole file", order: -1, source: "rules" as const };

  /* D: file and technical blockers first (they stop everything else) */
  if (doc.meta.encrypted)
    push({ ...fileWide, code: "TE-001", category: "file", severity: "blocker", title: "The file is password-protected or locked", action: "Save or export it again without a password or restrictions, then check it again." });
  if (doc.meta.digitallySigned)
    push({ ...fileWide, code: "TE-004", category: "file", severity: "blocker", title: "The PDF already has a digital signature", action: "Signing it again would break that signature. Use the unsigned version, or ask whoever signed it." });
  if (!doc.meta.hasText && !doc.meta.encrypted)
    push({ ...fileWide, code: "TE-003", category: "file", severity: "warning", title: "No text could be read (it looks like a scan)", action: "The check can't read a scanned page. Use the original Word or PDF file if you have it; you can still send a scan for signing." });
  if (doc.meta.macros) push({ ...fileWide, code: "TE-008", category: "file", severity: "warning", title: "The Word file contains macros", action: "Save it as a normal .docx (or PDF) without macros." });
  if (doc.meta.embedded) push({ ...fileWide, code: "TE-009", category: "file", severity: "advisory", title: `${doc.meta.embedded} embedded file${doc.meta.embedded === 1 ? "" : "s"} or object${doc.meta.embedded === 1 ? "" : "s"}`, action: "Check that anything embedded is meant to be part of what is signed." });

  /* B: Word mark-up and PDF comments */
  const n = (k: number | undefined) => k ?? 0;
  if (n(doc.meta.trackedChanges))
    push({ ...fileWide, code: "AN-001", category: "annotation", severity: "blocker", title: `${doc.meta.trackedChanges} tracked change${doc.meta.trackedChanges === 1 ? "" : "s"} not accepted`, action: "In Word: Review → Accept all changes (once everyone has agreed them), then save again." });
  const comments = n(doc.meta.comments) + n(doc.meta.pdfComments);
  if (comments)
    push({ ...fileWide, code: "AN-002", category: "annotation", severity: "blocker", title: `${comments} comment${comments === 1 ? "" : "s"} left in the file`, action: "Delete the comments (Word: Review → Delete all comments), then save again." });
  if (n(doc.meta.hidden))
    push({ ...fileWide, code: "AN-008", category: "annotation", severity: "blocker", title: "Hidden text in the document", action: "Show hidden text in Word (Ctrl+Shift+8), check it, and delete it or make it visible." });
  const hl = n(doc.meta.highlights) + n(doc.meta.pdfHighlights);
  if (hl) push({ ...fileWide, code: "AN-003", category: "annotation", severity: "warning", title: `${hl} highlighted passage${hl === 1 ? "" : "s"}`, action: "Highlights usually mean a point still open. Clear them once settled." });
  if (n(doc.meta.placeholderControls))
    push({ ...fileWide, code: "PH-005", category: "placeholder", severity: "warning", title: `${doc.meta.placeholderControls} Word form field${doc.meta.placeholderControls === 1 ? "" : "s"} still showing its placeholder`, action: "Fill in or remove the form fields." });
  if (n(doc.meta.colouredRuns) >= 5)
    push({ ...fileWide, code: "AN-004", category: "annotation", severity: "advisory", title: "Some text is in colour", action: "Coloured text is often mark-up. Check it is meant to be there." });
  if (doc.meta.watermark)
    push({ ...fileWide, code: "AN-006", category: "annotation", severity: "blocker", evidence: doc.meta.watermark, title: `Watermark "${doc.meta.watermark}"`, action: "Remove the watermark once this is the final version." });

  /* headers and footers: DRAFT marks and version numbers (the same header on every page is one issue) */
  const byText = new Map<string, string[]>();
  for (const m of doc.margins) byText.set(m.text, [...(byText.get(m.text) ?? []), m.where]);
  const margins = [...byText].map(([text, wh]) => ({ text, where: wh.length > 1 ? `${wh[0]} and ${wh.length - 1} more` : wh[0] }));
  for (const m of margins) {
    const d = /\bDRAFT\b|\bDraft\b(?!ed|ing|s?man)/.exec(m.text);
    if (d)
      push({ code: "AN-006", category: "annotation", severity: "blocker", where: m.where, order: -0.5, source: "rules", evidence: snippet(m.text, d.index, d[0].length, 40), hit: d[0], title: '"Draft" in the header or footer', action: "Remove it once this is the final version." });
    const v = /\b(v\d+(?:\.\d+)+|Draft\s+\d+|Version\s+\d+(?:\.\d+)?|Rev(?:ision)?\.?\s*\d+)\b/i.exec(m.text);
    if (v)
      push({ code: "AN-007", category: "annotation", severity: "warning", where: m.where, order: -0.4, source: "rules", evidence: snippet(m.text, v.index, v[0].length, 40), hit: v[0], title: `Version mark "${v[0]}" in the header or footer`, action: "Check this is the latest version, then remove the version mark if you like." });
  }

  /* A, B, E: line by line, with zones */
  const z = zones(doc.lines);
  const scheduleRefs = new Map<string, { line: Line; i: number; label: string }>();
  const scheduleHeads = new Set<string>();
  let clauseMax = 0;
  const clauseRefs: Array<{ n: number; line: Line; i: number; m: string }> = [];
  let sawGoverningLaw = false;
  let sawSigBlock = false;

  doc.lines.forEach((line, i) => {
    const t = line.text;
    if (!t.trim()) return;
    const sig = z[i] === "sig";
    if (sig || FIELD_LABEL.test(t) || /for and on behalf of/i.test(t)) sawSigBlock = sawSigBlock || /signature|signed|for and on behalf|director|authori[sz]ed/i.test(t);
    if (/\bgoverned by\b|\bgoverning law\b|\blaws of\b/i.test(t)) sawGoverningLaw = true;

    /* schedules: referred to, and headed */
    const head = SCHEDULE_HEAD.exec(t);
    if (head && t.trim().length < 90) scheduleHeads.add(`${head[1].toLowerCase()} ${head[2].toUpperCase()}`);
    for (const r of t.matchAll(/\b(Schedule|Annex|Appendix|Exhibit|Annexure)\s+([0-9]+|[A-Z])\b/g)) {
      const k = `${r[1].toLowerCase()} ${r[2].toUpperCase()}`;
      if (!scheduleRefs.has(k)) scheduleRefs.set(k, { line, i, label: `${r[1]} ${r[2]}` });
    }
    /* clause numbering: headings like "12. Governing law" / "12 GOVERNING LAW" */
    const ch = /^\s*(\d{1,2})(?:\.|\s)\s*[A-Z][A-Za-z ,&'’-]{2,60}$/.exec(t);
    if (ch) clauseMax = Math.max(clauseMax, Number(ch[1]));
    for (const r of t.matchAll(/\b[Cc]lause\s+(\d{1,2})(?:\.\d+)*/g)) clauseRefs.push({ n: Number(r[1]), line, i, m: r[0] });

    /* PH-001 placeholders in [brackets] */
    for (const m of t.matchAll(/\[([^\]\n]{0,60})\]/g)) {
      const inner = m[1];
      const after = t.slice((m.index ?? 0) + m[0].length);
      if (bracketIsFine(inner, after) || !bracketIsPlaceholder(inner)) continue;
      if (/^\s*(?:option|alternative|select|choose)\b/i.test(inner)) continue; /* PH-008 reports these */
      if (/(?:S\$|US\$|SGD|USD|GBP|EUR|RM|HK\$|A\$|£|€|\$)\s?$/i.test(t.slice(Math.max(0, (m.index ?? 0) - 5), m.index ?? 0))) continue; /* PH-006 reports S$[***] */
      if (sig && /^\s*(?:name|title|date|designation|position)?\s*$/i.test(inner)) {
        expectedBlanks++;
        continue;
      }
      push({ code: "PH-001", category: "placeholder", severity: "blocker", where: where(line), order: order(line, i), source: "rules", evidence: snippet(t, m.index ?? 0, m[0].length), hit: m[0], title: `Placeholder not filled in: ${m[0].length > 40 ? `${m[0].slice(0, 40)}…]` : m[0]}`, action: "Fill in the details, or delete the brackets if the text is final." });
    }

    /* PH-002 blanks: a signing field in a signature block, a gap anywhere else */
    const blank = /_{4,}|\.{8,}|…{3,}/.exec(t);
    if (blank && !TOC_LINE.test(t)) {
      if (sig || FIELD_LABEL.test(t) || DATE_BLANK.test(t)) expectedBlanks++;
      else push({ code: "PH-002", category: "placeholder", severity: "blocker", where: where(line), order: order(line, i), source: "rules", evidence: snippet(t, blank.index, blank[0].length), hit: blank[0], title: "Blank left to fill in", action: "Fill in the blank. If it is meant for a handwritten entry, add a Text box for it in FD Sign instead." });
    }

    for (const r of RULES) {
      if (r.bodyOnly && sig) continue;
      r.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = r.re.exec(t))) {
        if (r.skip?.(m, t)) continue;
        const mention = r.titleBlocker && i > 8;
        push({
          code: r.code,
          category: r.category,
          severity: mention ? "warning" : r.severity,
          where: where(line),
          order: order(line, i),
          source: "rules",
          evidence: snippet(t, m.index, m[0].length),
          hit: m[0],
          title: mention ? `Mentions ${m[0]}: check whether it applies to this document` : r.title(m),
          action: r.action,
        });
        if (!r.re.global) break;
      }
    }
  });

  /* C: structure */
  for (const [k, ref] of scheduleRefs)
    if (!scheduleHeads.has(k) && scheduleHeads.size + scheduleRefs.size > 0 && doc.meta.hasText)
      push({ code: "ST-001", category: "structure", severity: "blocker", where: where(ref.line), order: order(ref.line, ref.i), source: "rules", evidence: snippet(ref.line.text, ref.line.text.indexOf(ref.label), ref.label.length), hit: ref.label, title: `${ref.label} is mentioned but not in the document`, action: `Attach ${ref.label}, or correct the reference.` });
  if (clauseMax >= 3)
    for (const c of clauseRefs.filter((c) => c.n > clauseMax).slice(0, 3))
      push({ code: "ST-006", category: "structure", severity: "warning", where: where(c.line), order: order(c.line, c.i), source: "rules", evidence: snippet(c.line.text, c.line.text.indexOf(c.m), c.m.length), hit: c.m, title: `"${c.m}" points to a clause that doesn't exist (the last is ${clauseMax})`, action: "Fix the cross-reference." });
  if (doc.meta.hasText && !sawSigBlock && doc.lines.length > 15)
    push({ ...fileWide, code: "ST-003", category: "structure", severity: "warning", title: "No signature block found", action: "Add a signature block for each party, or FD Sign will put the signatures on its record page at the end." });
  if (doc.meta.hasText && !sawGoverningLaw && doc.lines.length > 30)
    push({ ...fileWide, code: "SG-008", category: "signability", severity: "advisory", title: "No governing law clause found", action: "Most contracts say which country's law applies. Check whether this one should." });

  return finish(issues, expectedBlanks);
}

/** Dedupe, cap repeats, sort in reading order, count, and give the verdict. */
export function finish(all: Issue[], expectedBlanks: number): Report {
  const seen = new Set<string>();
  const perCode = new Map<string, number>();
  const issues: Issue[] = [];
  const extra = new Map<string, Issue & { more: number }>();
  for (const i of [...all].sort((a, b) => a.order - b.order)) {
    /* a mark repeated on every page (a header) counts once */
    const key = i.code === "AN-006" || i.code === "AN-007" ? `${i.code}|${i.title}` : `${i.code}|${i.where}|${i.evidence ?? i.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = (perCode.get(i.code) ?? 0) + 1;
    perCode.set(i.code, c);
    if (c <= 6) issues.push(i);
    else {
      const e = extra.get(i.code) ?? { ...i, more: 0 };
      e.more++;
      extra.set(i.code, e);
    }
  }
  for (const e of extra.values())
    issues.push({ ...e, where: "More", order: e.order + 0.1, evidence: undefined, title: `${e.more} more like this (${e.code})`, action: e.action });
  issues.sort((a, b) => a.order - b.order);
  const counts: Record<Severity, number> = { blocker: 0, warning: 0, advisory: 0, expected: expectedBlanks };
  for (const i of issues) if (i.severity !== "expected") counts[i.severity]++;
  return { verdict: verdictOf(issues), issues, counts, expectedBlanks, detector: DETECTOR_VERSION };
}

export function verdictOf(issues: Issue[]): Verdict {
  const codes = new Set(issues.filter((i) => i.severity === "blocker").map((i) => i.code));
  if (["TE-001", "TE-004", "TE-010"].some((c) => codes.has(c))) return "cannot_process";
  if (["SG-004", "SG-005", "SG-006", "SG-007"].some((c) => codes.has(c))) return "not_signable_here";
  if (issues.some((i) => i.severity === "blocker")) return "not_ready";
  if (issues.some((i) => i.severity === "warning")) return "ready_with_ack";
  return "ready";
}

export const VERDICT_TEXT: Record<Verdict, { title: string; text: string }> = {
  ready: { title: "Ready to sign", text: "We found nothing that should stop this being signed." },
  ready_with_ack: { title: "Ready, with a few things to check", text: "Nothing blocks signing, but look at the points below and tick each one you are happy with." },
  not_ready: { title: "Not ready to sign yet", text: "Fix the points marked Must fix, then check the new version again." },
  not_signable_here: { title: "May not be signable electronically", text: "This document seems to need a handwritten, witnessed or notarised signature. Check with a lawyer first." },
  cannot_process: { title: "We can't check this file", text: "The file is locked or already signed. Fix the point below and upload it again." },
};
