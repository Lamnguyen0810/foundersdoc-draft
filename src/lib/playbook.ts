/**
 * The playbook: the firm's drafting rules, as the dashboard and the drafter
 * both see them. Storage is supabase/044_playbook.sql.
 */

/** A saved version, as the dashboard lists it. `content` is only carried for
 *  the live one and for a version the person opens. */
export interface PlaybookVersion {
  id: string;
  scope: string;
  version: number;
  filename: string | null;
  note: string | null;
  live: boolean;
  saved_by_email: string | null;
  created_at: string;
  chars: number;
}

/** What drafting reads: one block per live playbook that applies, firm-wide first. */
export interface PlaybookBlock {
  scope: string;
  title: string;
  text: string;
}

/** The firm-wide scope, which applies to every document type. */
export const FIRM_WIDE = "*";

/** The longest playbook the prompt will carry. Rules are short by nature; a
 *  200-page manual is not a playbook, it is a reference the model would
 *  drown in — and the model's context is not free. */
export const MAX_PLAYBOOK_CHARS = 60_000;

export const PLAYBOOK_COLUMNS =
  "id,scope,version,filename,note,live,saved_by_email,created_at,chars";

/* ── THE DOCUMENT'S LOOK ─────────────────────────────────────────────────────
   The playbook is the only authority on how a document reads, and the firm
   wants that to include how it is SET: the typeface and size of the page on
   screen and of the Word file. A text playbook cannot style a document, so
   the app reads the choice out of it — a line such as

       Font: Times New Roman, 12pt
       Body text is set in Arial 11 point

   — and sets the page accordingly. Nothing stated: a plain default, in
   black, with no rule under the title and no colour anywhere. */

export interface DocumentLook {
  /** A typeface Word has on every machine. */
  font: string;
  /** Body size in points. Headings are the same size, bold; the title is
   *  `titlePt`, or two points larger when the playbook names none. */
  sizePt: number;
  titlePt: number;
  /** Body text justified (else left). */
  justify: boolean;
  /** Line spacing as a multiple of single. */
  lineSpacing: number;
  /** Paragraph spacing, in points. */
  spaceAfterPt: number;
  headingBeforePt: number;
  headingAfterPt: number;
  /** Where the choice came from, for the panel to say so. */
  source: "playbook" | "default";
}

export const DEFAULT_LOOK: DocumentLook = {
  font: "Times New Roman",
  sizePt: 12,
  titlePt: 14,
  justify: false,
  lineSpacing: 1.24,
  spaceAfterPt: 8,
  headingBeforePt: 12,
  headingAfterPt: 2,
  source: "default",
};

/** Typefaces the page and Word both have without installing anything. */
export const KNOWN_FONTS = [
  "Times New Roman",
  "Arial",
  "Calibri",
  "Cambria",
  "Aptos",
  "Georgia",
  "Garamond",
  "Book Antiqua",
  "Verdana",
  "Tahoma",
  "Helvetica",
  "Century Gothic",
] as const;

/** CSS fallbacks for each, so the screen degrades the way Word does. */
export function fontStack(font: string): string {
  switch (font) {
    case "Times New Roman":
      return '"Times New Roman",Times,"Liberation Serif",serif';
    case "Arial":
    case "Helvetica":
      return `"${font}",Arial,Helvetica,"Liberation Sans",sans-serif`;
    case "Calibri":
      return '"Calibri","Carlito","Segoe UI",Arial,sans-serif';
    case "Cambria":
      return '"Cambria","Caladea",Georgia,"Times New Roman",serif';
    case "Aptos":
      return '"Aptos","Calibri","Carlito","Segoe UI",Arial,sans-serif';
    case "Georgia":
    case "Garamond":
    case "Book Antiqua":
      return `"${font}",Georgia,"Times New Roman",serif`;
    default:
      return `"${font}",Arial,sans-serif`;
  }
}

/**
 * Read the look out of the live playbooks.
 *
 * Two shapes are understood, and a playbook may use either:
 *
 *   · a machine-readable block of `key: value` lines — the kind a firm
 *     writes for exactly this purpose:
 *         font: Arial
 *         body_size_pt: 10
 *         title_size_pt: 12
 *         line_spacing: 1.15 (multiple)
 *         space_after_pt: 8
 *         heading_space_before_pt: 12
 *         heading_space_after_pt: 6
 *         alignment_body: justified
 *   · prose — "All FD documents use Arial", "Body text … 10 pt", "Body text
 *     is justified".
 *
 * The document type's own text is read before the firm-wide one, so a type
 * may set its own face. Anything not stated keeps the default.
 */
export function documentLook(texts: (string | null | undefined)[]): DocumentLook {
  const look: DocumentLook = { ...DEFAULT_LOOK };
  let found = false;
  const fontRe = new RegExp(`\\b(${KNOWN_FONTS.map((f) => f.replace(/ /g, "\\s+")).join("|")})\\b`, "i");
  const num = (re: RegExp, raw: string): number | null => {
    const m = re.exec(raw);
    return m ? Number(m[1]) : null;
  };
  const clampPt = (n: number) => Math.min(16, Math.max(8, n));

  for (const raw of texts) {
    if (!raw) continue;

    /* Typeface: the first known face named, anywhere. */
    if (!found) {
      const fm = fontRe.exec(raw);
      if (fm) {
        look.font = KNOWN_FONTS.find((f) => f.toLowerCase() === fm[1].replace(/\s+/g, " ").toLowerCase()) ?? fm[1];
        found = true;
      }
    }

    /* Body size: the key, or "Body text … 10 pt", or a size on the font's line. */
    const body =
      num(/\bbody_size_pt\s*[:=]\s*(\d{1,2}(?:\.5)?)/i, raw) ??
      num(/\bbody text\b[^\n]{0,80}?\b(\d{1,2}(?:\.5)?)\s*(?:pt\b|point)/i, raw) ??
      (() => {
        const line = raw.split(/\n+/).find((l) => fontRe.test(l));
        return line ? num(/\b(\d{1,2}(?:\.5)?)\s*(?:pt\b|point)/i, line) : null;
      })();
    if (body !== null && look.source === "default") {
      look.sizePt = clampPt(body);
      look.titlePt = clampPt(body + 2);
    }
    const title = num(/\btitle_size_pt\s*[:=]\s*(\d{1,2}(?:\.5)?)/i, raw) ?? num(/\bdocument title\b[^\n]{0,80}?\b(\d{1,2}(?:\.5)?)\s*(?:pt\b|point)/i, raw);
    if (title !== null && look.source === "default") look.titlePt = clampPt(title);

    const ls = num(/\bline_spacing\s*[:=]\s*(\d(?:\.\d{1,2})?)/i, raw) ?? num(/\bline spacing is\s*\**\s*(\d(?:\.\d{1,2})?)/i, raw);
    if (ls !== null && ls >= 1 && ls <= 2 && look.source === "default") look.lineSpacing = ls;

    const after = num(/\bspace_after_pt\s*[:=]\s*(\d{1,2})/i, raw) ?? num(/\b(\d{1,2})\s*pt after\b/i, raw);
    if (after !== null && look.source === "default") look.spaceAfterPt = Math.min(24, after);
    const hb = num(/\bheading_space_before_pt\s*[:=]\s*(\d{1,2})/i, raw) ?? num(/\bheadings take\s*\**\s*(\d{1,2})\s*pt before/i, raw);
    if (hb !== null && look.source === "default") look.headingBeforePt = Math.min(36, hb);
    const ha = num(/\bheading_space_after_pt\s*[:=]\s*(\d{1,2})/i, raw) ?? num(/\bheadings take[^\n]{0,40}?and\s*\**\s*(\d{1,2})\s*pt after/i, raw);
    if (ha !== null && look.source === "default") look.headingAfterPt = Math.min(36, ha);

    if (/\balignment_body\s*[:=]\s*justif/i.test(raw) || /\bbody text is\s*\**\s*justified/i.test(raw)) {
      if (look.source === "default") look.justify = true;
    }

    if (found || body !== null) {
      look.source = "playbook";
    }
  }
  return look;
}
