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
  /** Body size in points. Headings are the same size, bold; the title two points larger. */
  sizePt: number;
  /** Where the choice came from, for the panel to say so. */
  source: "playbook" | "default";
}

export const DEFAULT_LOOK: DocumentLook = { font: "Times New Roman", sizePt: 12, source: "default" };

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
 * Read the look out of the live playbooks: the document type's own text is
 * read before the firm-wide one, so a type may set its own face. The first
 * known typeface named wins; a point size on the same line, or within the
 * same sentence, goes with it. A size named anywhere ("body text 11pt") is
 * used when no size sits by the face.
 */
export function documentLook(texts: (string | null | undefined)[]): DocumentLook {
  const fontRe = new RegExp(`\\b(${KNOWN_FONTS.map((f) => f.replace(/ /g, "\\s+")).join("|")})\\b`, "i");
  const sizeRe = /\b(\d{1,2}(?:\.5)?)\s*(?:-?\s*)?(?:pt\b|point)/i;
  for (const raw of texts) {
    if (!raw) continue;
    const lines = raw.split(/\n+/);
    for (const line of lines) {
      const fm = fontRe.exec(line);
      if (!fm) continue;
      const font = KNOWN_FONTS.find((f) => f.toLowerCase() === fm[1].replace(/\s+/g, " ").toLowerCase()) ?? fm[1];
      const sm = sizeRe.exec(line) ?? sizeRe.exec(raw);
      const sizePt = sm ? Math.min(16, Math.max(8, Number(sm[1]))) : DEFAULT_LOOK.sizePt;
      return { font, sizePt, source: "playbook" };
    }
  }
  return DEFAULT_LOOK;
}
