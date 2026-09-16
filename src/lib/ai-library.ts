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
  /** Position within its document type; 1 is the firm's preferred example. */
  rank: number | null;
  redacted_at: string | null;
  redaction_count: number;
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

/* ── redaction ───────────────────────────────────────────────────────────────

   ── WHAT IT IS ─────────────────────────────────────────────────────────────
   The private details in a source — the parties' names, their numbers, who
   signed — replaced in the stored text by a placeholder that says what KIND
   of thing was there: [REDACTED COMPANY], [REDACTED EMAIL]. Gemini reads a
   placeholder as the shape of a clause without its content, which is all a
   worked example needs to teach. The viewer draws them as black bars.

   ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
   Complete on its own. Numbers, emails and company names follow patterns and
   are found; a person's name in running prose does not, and no pattern will
   find "John Tan agrees to" without also finding "Confidential Information".
   The one automatic way to catch those — asking a model to find the names —
   means sending the unredacted document to the model, which is the thing
   redaction exists to prevent. So the detector proposes, and a person who
   has read the document adds what it missed. That person can, now.

   ── WHERE THE ORIGINAL GOES ────────────────────────────────────────────────
   Nowhere. The redacted text replaces the row's text; there is no second
   column, no history table. FD chose this over an undo: a client's details
   that can be recovered from the database have not left the database.
   ─────────────────────────────────────────────────────────────────────────── */

export type RedactionKind = "uen" | "nric" | "email" | "phone" | "company" | "name" | "address" | "custom";

export interface Redaction {
  text: string;
  kind: RedactionKind;
}

export const REDACTION_LABEL: Record<RedactionKind, string> = {
  uen: "UEN",
  nric: "NRIC/FIN",
  email: "EMAIL",
  phone: "PHONE",
  company: "COMPANY",
  name: "NAME",
  address: "ADDRESS",
  custom: "TEXT",
};

/** The placeholder written into the text. `[REDACTED COMPANY]`, `[REDACTED EMAIL]`… */
export function placeholderFor(kind: RedactionKind): string {
  return `[REDACTED ${REDACTION_LABEL[kind]}]`;
}

/** Finds placeholders in stored text, so the viewer can draw them as bars. */
export const PLACEHOLDER_RE = /\[REDACTED(?: [A-Z/]+)?\]/g;

/* Capitalised words that start a sentence or a recital and are not part of a
   company's name, even when they sit right before one. */
const NOT_A_NAME = new Set([
  "BETWEEN", "AND", "BY", "THE", "THIS", "OF", "TO", "WITH", "FROM", "FOR", "OR", "IN", "AT", "ON",
  "Between", "And", "By", "The", "This", "Of", "To", "With", "From", "For", "Or", "In", "At", "On",
  "Whereas", "WHEREAS", "Now", "NOW", "Therefore", "THEREFORE", "Party", "PARTY", "Parties", "PARTIES",
  "Dear", "Re", "RE", "Subject",
]);

/* Corporate suffixes, in the two spellings contracts use: "Pte. Ltd." and
   "PTE. LTD.". Each is matched literally in either case. */
const SUFFIXES = [
  "Pte\\.?\\s*Ltd\\.?", "Private\\s+Limited", "Ltd\\.?", "Limited", "LLP", "LLC", "Inc\\.?", "Incorporated",
  "Corporation", "Corp\\.?", "Co\\.?,?\\s*Ltd\\.?", "GmbH", "Sdn\\.?\\s*Bhd\\.?", "Berhad", "PLC",
  "S\\.A\\.", "N\\.V\\.", "B\\.V\\.", "AG", "Holdings", "Group", "Partners", "Trust", "Foundation",
];
const suffixAlternation = SUFFIXES.flatMap((x) => [x, x.toUpperCase()]).join("|");
/* Up to six capitalised words, then a suffix, then a boundary. */
const COMPANY_RE = new RegExp(
  "\\b((?:[A-Z][A-Za-z0-9&'’.-]*[ \\t]+){1,6}(?:" + suffixAlternation + "))(?=[\\s.,;:)(\"'’]|$)",
  "g",
);

/* Defined terms every contract has. A one-word defined term NOT on this list
   is almost always a party's short name. */
const GENERIC_TERMS = new Set([
  "Agreement", "Party", "Parties", "Purpose", "Term", "Effective", "Recipient", "Discloser", "Disclosing",
  "Receiving", "Affiliate", "Affiliates", "Representatives", "Information", "Confidential", "Services",
  "Business", "Deliverables", "Fees", "Territory", "Products", "Software", "Data", "Personal", "Employer",
  "Employee", "Company", "Contractor", "Consultant", "Client", "Customer", "Supplier", "Vendor", "Licensor",
  "Licensee", "Lender", "Borrower", "Landlord", "Tenant", "Buyer", "Seller", "Investor", "Founder", "Founders",
  "Shares", "Board", "Directors", "Closing", "Completion", "Notice", "Dispute", "Law", "Laws", "Act", "Court",
  "Schedule", "Annex", "Exhibit", "Appendix", "Clause", "Section", "Warranties", "Losses", "Claims",
  "Documents", "Materials", "Work", "Project", "Site", "Premises", "Equipment", "Goods", "Price", "Interest",
]);

function trimLeadingNoise(name: string): string {
  const words = name.split(/\s+/);
  while (words.length > 1 && NOT_A_NAME.has(words[0].replace(/[.,:;()]/g, ""))) words.shift();
  return words.join(" ");
}

/**
 * What the detector proposes for a document. Each entry is a literal string
 * as it appears in the text; the same string appearing ten times is one
 * proposal, redacted everywhere at once — a party's name is private in every
 * clause, not just the first.
 */
export function proposeRedactions(text: string): Redaction[] {
  const found = new Map<string, Redaction>();
  const add = (kind: RedactionKind, raw: string) => {
    const t = raw.trim();
    if (t.length < 2) return;
    if (!found.has(t)) found.set(t, { text: t, kind });
  };
  const each = (re: RegExp, kind: RedactionKind, group = 0) => {
    for (const m of text.matchAll(re)) {
      const v = m[group];
      if (v) add(kind, kind === "company" || kind === "name" ? trimLeadingNoise(v) : v);
    }
  };

  each(/\b(?:\d{8,9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])\b/g, "uen");
  each(/\b[STFGM]\d{7}[A-Z]\b/g, "nric");
  each(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "email");
  each(/(?:\+65[\s-]?)?\b[3689]\d{3}[\s-]?\d{4}\b/g, "phone");

  /* A company is the capitalised words that run up to a corporate suffix:
     "MERIDIAN LOGISTICS PTE. LTD.", "Kestrel Analytics Pte Ltd", "Acme LLP".
     Up to six words, each starting with a capital, so the match stops at the
     first ordinary word — "between" or "and" — before the name. */
  each(COMPANY_RE, "company", 1);

  /* The short name a contract gives a party — MERIDIAN LOGISTICS PTE. LTD.
     ("Meridian") — is then used in every clause. Any one-word defined term
     in quotes is proposed, except the generic ones every contract defines. */
  for (const m of text.matchAll(/\(\s*["“]([A-Z][A-Za-z]{2,})["”]\s*\)/g)) {
    if (!GENERIC_TERMS.has(m[1])) add("company", m[1]);
  }

  /* A person's name where a document labels it: signature blocks, "Mr/Ms",
     "represented by". Two to five capitalised words after the label. */
  each(
    /(?:\bName|\bSigned\s+by|\bSignature|\bDirector|\bAuthori[sz]ed\s+Signatory|\bWitness(?:ed\s+by)?|\bAttention|\bAttn|\brepresented\s+by|\bc\/o)[ \t]*[:：]?[ \t]*((?:[A-Z][a-z'’-]+[ \t]+){1,4}[A-Z][a-z'’-]+)/g,
    "name",
    1,
  );
  each(/\b(?:Mr|Ms|Mrs|Mdm|Dr|Prof)\.?[ \t]+((?:[A-Z][a-z'’-]+[ \t]+){0,3}[A-Z][a-z'’-]+)/g, "name", 1);

  /* A Singapore address: a street line with a unit or a postcode. */
  each(/\b\d{1,4}[A-Z]?\s+(?:[A-Z][a-z]+\s+){1,4}(?:Road|Rd|Street|St|Avenue|Ave|Lane|Drive|Dr|Crescent|Cres|Way|Boulevard|Blvd|Place|Park|Link|Walk|View|Close|Terrace|Quay|Hill)\b[^\n]{0,40}?(?:#\d{1,3}-\d{1,4}|Singapore\s+\d{6})/g, "address");
  each(/\bSingapore\s+\d{6}\b/g, "address");

  /* Longest first, so "MERIDIAN LOGISTICS PTE. LTD." is replaced before
     "LOGISTICS PTE. LTD." could be. */
  return [...found.values()].sort((a, b) => b.text.length - a.text.length);
}

/**
 * Applies a redaction list to text: every occurrence of each string becomes
 * its placeholder. Returns the new text and how many replacements were made.
 * Pure — the server and the viewer's preview call the same function, so
 * what the reviewer sees before pressing Apply is what is written.
 */
export function applyRedactions(text: string, items: Redaction[]): { text: string; count: number } {
  let out = text;
  let count = 0;
  const ordered = [...items].filter((r) => r.text.trim().length >= 2).sort((a, b) => b.text.length - a.text.length);
  for (const r of ordered) {
    const escaped = r.text.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "g");
    out = out.replace(re, () => {
      count++;
      return placeholderFor(r.kind);
    });
  }
  return { text: out, count };
}
