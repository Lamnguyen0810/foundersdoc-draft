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

/**
 * A step on the form: the group its questions share, and the words the user
 * sees at the top of it. Stored on the document type in step order, so the
 * order of steps is a fact the admin sets, not an accident of which question
 * happened to come first.
 */
export interface Group {
  /** Matches Field.group. */
  name: string;
  /** Short name in the progress list — "Who's involved". */
  title: string;
  /** What the assistant asks when the step opens. */
  question: string;
}

export interface DocType {
  slug: string;
  label: string;
  description: string;
  fields: Field[];
  /** Step order and wording. Absent on rows saved before it existed: then
   *  the steps are the groups in order of first appearance, with the wording
   *  in DEFAULT_GROUP_TEXT or, failing that, the group's own name. */
  groups?: Group[];
  systemPrompt: string;
  /** Kept SEPARATE from the prompt text so that swapping in the firm's own
   *  examples changes nothing else. Never paste an example inline into a prompt. */
  examples: Example[];
  /** The firm's rules — firm-wide first, then this type's own — as saved in
   *  the admin console (supabase/044). Read before the examples and told to
   *  win over them. Absent when nothing is live. */
  playbook?: { title: string; text: string }[];
  /** Corrections the firm made to earlier drafts, as rules (supabase/045).
   *  Read after the playbook, with the same authority. */
  lessons?: string[];
  /** How this document is made (supabase/048). "chat": a model drafts it
   *  from the playbook and samples — the NDA. "assembly": the answers are
   *  put into the firm's master by rule and the model drafts named fields
   *  only — the term sheet. Absent means "chat". */
  engine?: "chat" | "assembly";
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

/* The wording each step had before it was editable. Still the fallback for a
   group with no stored title or question, so a new group named "Payment" reads
   "Payment" until somebody writes something better. */
export const DEFAULT_GROUP_TEXT: Record<string, { title: string; question: string }> = {
  "The shape of it": {
    title: "Direction",
    question: "Which direction are we going — mutual, or one-way?",
  },
  Parties: {
    title: "Who’s involved",
    question: "Who are the parties? Just provide each person’s or organisation’s name.",
  },
  "The deal": {
    title: "The deal",
    question: "What’s the deal about, and what will be shared?",
  },
  Terms: {
    title: "How long and how strict",
    question:
      "How long should confidentiality last, and how strict should it be? I’ve set sensible Singapore defaults — change only what you need.",
  },
  "Anything else": {
    title: "Anything else",
    question: "Anything else you’d like included?",
  },
};

export interface Step {
  group: Group;
  fields: Field[];
}

/**
 * The form's steps, in the order the user meets them. ONE function, used by
 * the drafting screen and by the admin editor, so what the admin sees as
 * step 3 is what the user gets as step 3 — that was not true when each
 * side grouped the questions its own way.
 *
 * Stored groups set the order; a question whose group is not listed (an
 * older row, a typo) still appears, in a step appended at the end, rather
 * than vanishing from the form.
 */
export function stepsFor(docType: Pick<DocType, "fields" | "groups">): Step[] {
  const byName = new Map<string, Field[]>();
  const firstSeen: string[] = [];
  for (const f of docType.fields) {
    if (!byName.has(f.group)) {
      byName.set(f.group, []);
      firstSeen.push(f.group);
    }
    byName.get(f.group)!.push(f);
  }
  const listed = docType.groups ?? [];
  const names = [...listed.map((g) => g.name), ...firstSeen.filter((n) => !listed.some((g) => g.name === n))];
  return names.map((name) => {
    const stored = listed.find((g) => g.name === name);
    const fallback = DEFAULT_GROUP_TEXT[name] ?? { title: name, question: name };
    return {
      group: {
        name,
        title: stored?.title?.trim() || fallback.title,
        question: stored?.question?.trim() || fallback.question,
      },
      fields: byName.get(name) ?? [],
    };
  });
}
