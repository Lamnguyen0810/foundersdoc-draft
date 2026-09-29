/**
 * The employment questionnaire made concrete for the answers so far: which
 * questions are asked (show_if), their defaults, and which required ones
 * are still open. Pure — the same list on the client, which asks, and on
 * the server, which checks.
 */

import { EMPLOYMENT_QUESTIONNAIRE } from "./data/questionnaire";
import type { Answers } from "./types";

export type Condition =
  | { q: string; eq: unknown }
  | { q: string; in: readonly unknown[] }
  | { q: string; not_in: readonly unknown[] }
  | { q: string; has: unknown }
  | { q: string; lacks: unknown }
  | { all: readonly Condition[] }
  | { any: readonly Condition[] };

export type QuestionType = "jurisdiction" | "single_choice" | "multi_choice" | "date" | "free_text" | "free_text_list";

export interface Option {
  value: string;
  label: string;
  recommended?: boolean;
  exclusive?: boolean;
}

export interface Question {
  id: string;
  key: string;
  section: string;
  type: QuestionType;
  text: string;
  help?: string;
  placeholder?: string;
  required: boolean;
  options: Option[];
  /** E1b: "Same as employer" is offered. */
  allowSame: boolean;
  maxItems?: number;
  maxLength?: number;
  defaultValue?: unknown;
}

const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

export function evaluate(c: Condition | null | undefined, a: Answers): boolean {
  if (!c) return true;
  if ("all" in c) return c.all.every((x) => evaluate(x, a));
  if ("any" in c) return c.any.some((x) => evaluate(x, a));
  const v = a[c.q];
  if ("eq" in c) return v === c.eq;
  if ("in" in c) return c.in.includes(v);
  if ("not_in" in c) return !c.not_in.includes(empty(v) ? null : v);
  const vals = Array.isArray(v) ? v : empty(v) ? [] : [v];
  if ("has" in c) return vals.includes(c.has);
  if ("lacks" in c) return !vals.includes(c.lacks);
  return false;
}

type Raw = Record<string, unknown>;

function concrete(q: Raw): Question {
  return {
    id: q.id as string,
    key: q.key as string,
    section: (q.section as string) ?? "",
    type: (q.type as QuestionType) ?? "free_text",
    text: (q.text as string) ?? "",
    help: q.help as string | undefined,
    placeholder: q.placeholder as string | undefined,
    required: Boolean(q.required),
    options: ((q.options as Option[] | undefined) ?? []).map((o) => ({ ...o })),
    allowSame: Boolean(q.allow_same),
    maxItems: q.max_items as number | undefined,
    maxLength: q.max_length as number | undefined,
    defaultValue: Array.isArray(q.default) ? [...(q.default as unknown[])] : q.default,
  };
}

/** Every question, asked or not — for the admin list. */
export const ALL_QUESTIONS: Question[] = (EMPLOYMENT_QUESTIONNAIRE.questions as unknown as Raw[]).map(concrete);

/** The show_if of a question, for the admin list. */
export function showIf(id: string): Condition | undefined {
  const raw = (EMPLOYMENT_QUESTIONNAIRE.questions as unknown as Raw[]).find((q) => q.id === id);
  return raw?.show_if as Condition | undefined;
}

/** The questions for these answers, in the order they are asked. */
export function questionsFor(a: Answers): Question[] {
  return (EMPLOYMENT_QUESTIONNAIRE.questions as unknown as Raw[])
    .filter((q) => evaluate(q.show_if as Condition | undefined, a))
    .map(concrete);
}

/** Fill every unanswered visible question that has a default. The list is
 *  read again until it stops changing: a default can reveal a question. */
export function applyDefaults(a: Answers): Answers {
  const out: Answers = { ...a };
  for (let pass = 0; pass < 3; pass++) {
    for (const q of questionsFor(out)) {
      if (!empty(out[q.id])) continue;
      if (q.defaultValue !== undefined) out[q.id] = q.defaultValue;
    }
  }
  /* A hidden question's answer does not count. */
  const visible = new Set(questionsFor(out).map((q) => q.id));
  for (const k of Object.keys(out)) {
    const id = k.split("_")[0];
    if (/^(E\d+[a-z]?|M\d+)$/.test(id) && !visible.has(id)) delete out[k];
  }
  return out;
}

/** Required questions still unanswered. */
export function unanswered(a: Answers): Question[] {
  return questionsFor(a).filter((q) => q.required && empty(a[q.id]));
}

/** Where the employee works: E1b, or the employer's place when "same". */
export function workJurisdiction(a: Answers): string {
  const b = typeof a.E1b === "string" ? a.E1b.trim() : "";
  const e = typeof a.E1a === "string" ? a.E1a.trim() : "";
  return !b || b === "same" ? e : b;
}

/** The country of a jurisdiction answer: "California, United States" → "United States". */
export function countryOf(j: string): string {
  const parts = j.split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** The state or part: "California, United States" → "California"; "Singapore" → "Singapore". */
export function partOf(j: string): string {
  return j.split(",").map((s) => s.trim()).filter(Boolean)[0] ?? "";
}
