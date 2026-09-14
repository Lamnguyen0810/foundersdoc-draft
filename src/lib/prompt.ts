/**
 * Prompt assembly: turning form answers into the two strings the adapter takes.
 *
 * Kept out of the API route so it can be read, reviewed and (later) unit tested
 * without running a server. When a draft comes out wrong, this file and
 * doctypes.ts are the first two places to look — almost never the model.
 */

import type { DocType, Field } from "./doctypes";

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

export function buildSystem(docType: DocType): string {
  if (docType.examples.length === 0) return docType.systemPrompt;

  const examples = docType.examples
    .map(
      (ex, i) =>
        `--- WORKED EXAMPLE ${i + 1}: ${ex.title} ---\n${ex.text}\n--- END WORKED EXAMPLE ${i + 1} ---`,
    )
    .join("\n\n");

  return [
    docType.systemPrompt,
    "",
    "WORKED EXAMPLES",
    "The documents below show the structure, register and level of detail expected.",
    "Follow their shape and tone. Do NOT copy their facts, parties or figures — those",
    "come only from THE FACTS section of the user message.",
    "",
    examples,
  ].join("\n");
}

export function buildUser(
  docType: DocType,
  answers: Answers,
  sourceText?: string,
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

/** Splits the model output into the document body and the drafter's notes. */
export function splitNotes(text: string): { body: string; notes: string | null } {
  const idx = text.lastIndexOf("\n---");
  if (idx === -1) return { body: text, notes: null };
  const after = text.slice(idx + 4);
  if (!/DRAFTER'S NOTES/i.test(after)) return { body: text, notes: null };
  return { body: text.slice(0, idx).trimEnd(), notes: after.trim() };
}
