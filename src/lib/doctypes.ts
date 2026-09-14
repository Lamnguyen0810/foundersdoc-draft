/**
 * Document types: the typed view of doctypes.data.mjs, plus worked examples.
 *
 * WHERE THE DATA LIVES
 *   doctypes.data.mjs  — the definition (plain JS so the seed generator can read it)
 *   examples/          — the worked NDAs, baked into a module by build-examples.mjs
 *   this file          — types, and the examples attached
 *   Supabase doc_types — the runtime source once sprint 2.2 is deployed
 *
 * At runtime the app reads doc types from Supabase (see doctypes.server.ts) and
 * falls back to this file when Supabase is not configured. That is what lets a
 * lawyer tune a prompt without a deploy while the app still runs offline.
 *
 * ⚠️ FIELD KEYS ARE A CONTRACT. They are referenced as {{key}} in the system
 * prompt and saved into the `answers` JSON of every draft. Renaming a key later
 * orphans saved drafts. Choose them once.
 */

import { NDA_MUTUAL_STANDARD, NDA_SHORT_FORM } from "./examples/generated";
import { DOC_TYPE_DATA } from "./doctypes.data.mjs";

export type FieldType = "text" | "textarea" | "date" | "number" | "select";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Options are mandatory for select fields; the exact strings appear in the prompt. */
  options?: string[];
  help?: string;
  placeholder?: string;
  /** Prefilled because the answer is nearly always the same. Sprint 0.3: a question
   *  whose answer never changes belongs in settings, not on the form. */
  defaultValue?: string;
  /** Groups render as sections on the form, in the order the lawyer thinks. */
  group: string;
}

export interface Example {
  title: string;
  text: string;
}

export interface DocType {
  slug: string;
  label: string;
  description: string;
  fields: Field[];
  systemPrompt: string;
  /** Kept SEPARATE from the prompt text so that swapping in the firm's own
   *  examples changes nothing else. Never paste an example inline into a prompt. */
  examples: Example[];
}

/** Worked examples, keyed by doc type slug. Swap these for the firm's own sanitised
 *  documents at the end of sprint 2 — that is the moment the house voice arrives. */
export const EXAMPLES_BY_SLUG: Record<string, Example[]> = {
  nda: [
    { title: "Standard mutual NDA, Singapore law", text: NDA_MUTUAL_STANDARD },
    { title: "Short-form mutual NDA", text: NDA_SHORT_FORM },
  ],
};

type RawDocType = Omit<DocType, "examples">;

/** The built-in catalogue: used as the seed for Supabase, and as the fallback
 *  when Supabase is not configured. */
export const DOC_TYPES: DocType[] = (DOC_TYPE_DATA as RawDocType[]).map((d) => ({
  ...d,
  examples: EXAMPLES_BY_SLUG[d.slug] ?? [],
}));

export function getDocType(slug: string): DocType | undefined {
  return DOC_TYPES.find((d) => d.slug === slug);
}
