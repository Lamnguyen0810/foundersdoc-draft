/**
 * The AI source library — the worked examples Gemini reads when it drafts.
 *
 * Shapes shared by the admin page, the API routes and the client component,
 * plus the one piece of logic worth keeping in one place: the privacy scan
 * that runs on upload.
 */

export type SourceStatus = "needs_review" | "reviewed" | "processing" | "ready";
export type SourcePrivacy = "pending" | "clear" | "redacted" | "needs_redaction";

export interface SourceRow {
  id: string;
  folder_id: string | null;
  doc_type_slug: string;
  title: string;
  filename: string;
  file_ext: string;
  jurisdiction: string;
  version: string | null;
  privacy: SourcePrivacy;
  privacy_flags: Record<string, number>;
  status: SourceStatus;
  permitted: boolean;
  note: string | null;
  bytes: number;
  uploaded_by_email: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FolderRow {
  id: string;
  name: string;
}

/**
 * What the upload scan looks for.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Everything that reaches "ready" is sent to Gemini in full on every draft. On
 * a free-tier key that text may be used for training. A real client agreement
 * therefore has to be redacted before it is approved, and the person doing the
 * approving needs to know what is in it.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 * A decision. It counts things that LOOK like Singapore UENs, NRIC/FIN numbers,
 * email addresses and phone numbers, and shows those counts on the review
 * dialog. The privacy judgement is still recorded by a person; the constraint
 * in the database is what stops an unreviewed source becoming ready, not this.
 *
 * The patterns are deliberately loose — a false positive costs a glance, a
 * miss costs a client's details — and they are not a substitute for reading
 * the document.
 */
export function scanPrivacy(text: string): Record<string, number> {
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const flags: Record<string, number> = {
    /* UEN: 8 digits + letter (businesses), 9 digits + letter (companies),
       or the T/S/R + 2 digits + 2 letters + 4 digits + letter form. */
    uen: count(/\b(?:\d{8,9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])\b/g),
    /* NRIC / FIN: S, T, F, G or M, seven digits, a letter. */
    nric: count(/\b[STFGM]\d{7}[A-Z]\b/g),
    email: count(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
    /* Singapore mobile / landline, with or without +65 and spacing. */
    phone: count(/(?:\+65[\s-]?)?\b[3689]\d{3}[\s-]?\d{4}\b/g),
  };
  for (const k of Object.keys(flags)) if (flags[k] === 0) delete flags[k];
  return flags;
}

/** "1 UEN, 2 emails" — for the review dialog and the table's tooltip. */
export function describeFlags(flags: Record<string, number>): string {
  const names: Record<string, [string, string]> = {
    uen: ["UEN", "UENs"],
    nric: ["NRIC/FIN", "NRIC/FINs"],
    email: ["email address", "email addresses"],
    phone: ["phone number", "phone numbers"],
  };
  const parts = Object.entries(flags)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${names[k]?.[n === 1 ? 0 : 1] ?? k}`);
  return parts.length ? parts.join(", ") : "nothing sensitive found";
}

export const JURISDICTIONS = ["Singapore", "United Kingdom", "United States", "Other"] as const;
