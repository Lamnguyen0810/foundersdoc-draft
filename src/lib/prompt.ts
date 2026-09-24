/**
 * Prompt assembly: turning form answers into the two strings the adapter takes.
 *
 * Kept out of the API route so it can be read, reviewed and (later) unit tested
 * without running a server. When a draft comes out wrong, this file and
 * doctypes.ts are the first two places to look — almost never the model.
 */

import type { DocType, Field } from "./doctypes";
import type { DraftingStyle } from "./settings";

export type Answers = Record<string, string>;

/** Truncation guard so a huge pasted source cannot blow the context window or the bill. */
const MAX_SOURCE_CHARS = 60_000;

/** The marker DraftChat writes into an answer the user chose to skip. It is deliberately
 *  distinct from an empty string: "" means "not reached yet", SKIPPED means "asked, and
 *  the user said not now" — the model is told to place a [[TO CONFIRM]] for the latter. */
export const SKIPPED = "__fd_skipped__";

function formatField(field: Field, value: string): string {
  const raw = value.trim();
  if (raw === SKIPPED) return `${field.label}: (skipped — not answered)`;
  return `${field.label}: ${raw === "" ? "(not provided)" : raw}`;
}

/**
 * How the document should read.
 *
 * Style is not detail. Detail decides how much ground the document covers;
 * style decides the register it covers it in, and neither is allowed to change
 * the commercial position. That last sentence is in the instruction itself,
 * because "write it in plain English" is exactly the kind of request a model
 * will happily satisfy by quietly dropping a protection.
 */
const STYLE_INSTRUCTION: Record<DraftingStyle, string | null> = {
  standard_legal: null, // the house prompt already describes this register
  plain_english: [
    "REGISTER",
    "Write in plain English. Short sentences. Everyday words where a legal term",
    "adds nothing — \"before\" not \"prior to\", \"under\" not \"pursuant to\", \"if\" not",
    "\"in the event that\". Keep defined terms, party names, cross-references and",
    "clause numbering exactly as they would otherwise be.",
    "",
    "This changes the wording ONLY. Every obligation, exception, limit and remedy",
    "that would appear in the formal version must appear in this one, with the",
    "same legal effect. Do not drop a protection because it is hard to say simply.",
  ].join("\n"),
};

/**
 * The firm's rules, as a block of the system prompt.
 *
 * ── WHY THE PLAYBOOK COMES BEFORE THE EXAMPLES ─────────────────────────────
 * Examples are persuasive: a model shown three NDAs that survive for two
 * years will write a fourth that does, however the rule reads. So the rules
 * are stated first, told in so many words that they beat the examples, and
 * the examples section repeats it. Rules are also told to stay invisible —
 * a playbook says "always use 'shall'", and the failure mode is a draft
 * with a paragraph explaining that it always uses "shall".
 */
export function playbookBlock(docType: DocType): string | null {
  const rules = (docType.playbook ?? []).filter((r) => r.text.trim().length > 0);
  if (rules.length === 0) return null;
  const body = rules
    .map((r) => `--- ${r.title.toUpperCase()} ---\n${r.text.trim()}\n--- END ${r.title.toUpperCase()} ---`)
    .join("\n\n");
  return [
    "THE FIRM'S PLAYBOOK",
    "The rules below are how this firm drafts, and they are the ONLY authority on",
    "style and structure. They outrank the house style and the clause order given",
    "above, the worked examples below, and any general drafting habit: wherever",
    "two instructions about wording, numbering, defined terms, tone, order or",
    "layout differ, the playbook wins. Apply every rule that bears on this",
    "document.",
    "",
    "The playbook does not override the guardrails: the facts still come only",
    "from THE FACTS; a missing fact is still a [[TO CONFIRM: ...]] placeholder,",
    "never a guess; the hard rules, the treatment of skipped answers, the",
    "required comprehensiveness and the output format (including DRAFTER'S",
    "NOTES) still apply as written.",
    "",
    "Never quote, mention or explain the playbook in the draft — it shows in",
    "what you write, not in what you say about it.",
    "",
    body,
  ].join("\n");
}

/**
 * The built-in prompt carries a "House style" line of its own. With a
 * playbook live that line is a second voice on the same subject, and two
 * voices is how a model ends up choosing. It is pointed at the playbook
 * instead. Matched loosely, so a prompt edited in the database still works;
 * an unrecognised prompt is left alone and the playbook's own precedence
 * statement does the job.
 */
function deferHouseStyle(systemPrompt: string): string {
  return systemPrompt.replace(
    /^(\s*-\s*House style:)[\s\S]*?(?=\n\s*-\s|\n\s*\n)/m,
    "$1 as set out in THE FIRM'S PLAYBOOK below, which governs wording, numbering, defined terms, tone and layout.",
  );
}

export function buildSystem(docType: DocType, style: DraftingStyle = "standard_legal"): string {
  const register = STYLE_INSTRUCTION[style];
  const playbook = playbookBlock(docType);
  const base = playbook ? deferHouseStyle(docType.systemPrompt) : docType.systemPrompt;
  const head = [base, ...(register ? ["", register] : []), ...(playbook ? ["", playbook] : [])].join("\n");
  if (docType.examples.length === 0) {
    return head;
  }

  /* The examples arrive in the order the firm ranked them — best first — and
     the model is told so: when two examples handle a clause differently, the
     earlier one is the house style. */
  const examples = docType.examples
    .map(
      (ex, i) =>
        `--- WORKED EXAMPLE ${i + 1}${i === 0 ? " (PREFERRED STYLE)" : ""}: ${ex.title} ---\n${ex.text}\n--- END WORKED EXAMPLE ${i + 1} ---`,
    )
    .join("\n\n");

  return [
    head,
    "",
    "WORKED EXAMPLES",
    "The documents below show the structure, register and level of detail expected.",
    "They are in order of preference: Example 1 is the firm's preferred style, and",
    "where examples differ, follow the earlier one. Follow their shape and tone.",
    ...(playbook
      ? ["Where an example and THE FIRM'S PLAYBOOK above differ, the playbook wins."]
      : []),
    "Do NOT copy their facts, parties or figures — those come only from THE FACTS",
    "section of the user message. A placeholder such as [REDACTED COMPANY] marks",
    "where a detail was removed; treat it as the kind of thing named, never as text",
    "to reproduce.",
    "",
    examples,
  ].join("\n");
}

/** How much of one of their own documents is worth showing as a style guide. */
const MAX_REFERENCE_CHARS = 8_000;

export interface PastDraft {
  title: string;
  text: string;
}

export function buildUser(
  docType: DocType,
  answers: Answers,
  sourceText?: string,
  /**
   * One of the person's own finished documents of this type, when they have
   * asked FD AI to use their past work.
   *
   * It is a STYLE reference and nothing else. The wording below is deliberately
   * blunt about that, because the failure mode is specific and expensive: a
   * model given a previous NDA will cheerfully carry last month's counterparty,
   * term or governing law into this month's document, and the result reads
   * perfectly while naming the wrong company.
   */
  pastDraft?: PastDraft | null,
): string {
  const parts: string[] = ["THE FACTS", ""];

  for (const field of docType.fields) {
    parts.push(formatField(field, answers[field.key] ?? ""));
  }

  if (sourceText && sourceText.trim() !== "") {
    const trimmed = sourceText.trim();
    const truncated = trimmed.length > MAX_SOURCE_CHARS;
    parts.push(
      "",
      "--- SOURCE DOCUMENT ---",
      truncated ? trimmed.slice(0, MAX_SOURCE_CHARS) : trimmed,
      "--- END SOURCE DOCUMENT ---",
    );
    if (truncated) {
      parts.push(
        "",
        "NOTE: the source document was truncated. Say so in DRAFTER'S NOTES and flag",
        "anything you could not verify because of the truncation.",
      );
    }
  }

  if (pastDraft && pastDraft.text.trim() !== "") {
    const trimmed = pastDraft.text.trim().slice(0, MAX_REFERENCE_CHARS);
    parts.push(
      "",
      "--- THE USER'S OWN EARLIER DOCUMENT (STYLE REFERENCE ONLY) ---",
      trimmed,
      "--- END STYLE REFERENCE ---",
      "",
      "The document above is one this user drafted before. Follow its house style:",
      "clause order, headings, numbering, and how it words standard provisions.",
      "",
      "TAKE NO FACT FROM IT. Every party, date, sum, term, jurisdiction and defined",
      "commercial term comes from THE FACTS above and from nowhere else. If a detail",
      "appears in the earlier document and not in THE FACTS, it is NOT a fact about",
      "this matter — leave the placeholder and flag it in DRAFTER'S NOTES.",
    );
  }

  parts.push("", "Draft the document now.");
  return parts.join("\n");
}

/** Validates required fields before spending a request. */
export function missingRequired(docType: DocType, answers: Answers): string[] {
  return docType.fields
    .filter((f) => f.required && (answers[f.key] ?? "").trim() === "")
    .map((f) => f.label);
}

/** Questions the user skipped, by label. Surfaced in the UI so nobody sends a draft
 *  without knowing which answers are still outstanding. */
export function skippedFields(docType: DocType, answers: Answers): string[] {
  return docType.fields
    .filter((f) => (answers[f.key] ?? "").trim() === SKIPPED)
    .map((f) => f.label);
}

/**
 * Splits the model output into the document body and the drafter's notes.
 *
 * The prompt asks for a "---" line and then "DRAFTER'S NOTES:". Models take
 * liberties with both: a typographic apostrophe (DRAFTER’S), a heading in
 * bold or with a colon missing, a "---" of a different length or none at
 * all. The heading is the thing looked for — the LAST line that says
 * drafter's notes, however it is punctuated — and any rule line just above
 * it goes with the notes rather than staying on the document.
 */
const NOTES_HEADING = /^[\s*#_-]*DRAFTER[’'‘`]?S\s+NOTES?\b/im;

export function splitNotes(text: string): { body: string; notes: string | null } {
  let at = -1;
  const re = new RegExp(NOTES_HEADING.source, "gim");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) at = m.index;
  if (at === -1) return { body: text, notes: null };
  let body = text.slice(0, at).trimEnd();
  body = body.replace(/\n[\s*_-]{3,}\s*$/, "").trimEnd();
  const notes = text.slice(at).replace(/^[\s*#_-]+/, "").trim();
  return { body, notes };
}
