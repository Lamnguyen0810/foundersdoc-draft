/**
 * The contractor questionnaire made concrete for the answers so far: which
 * questions are asked (show_if), their defaults, and which required ones
 * are still open. Pure — the same list on the client, which asks, and on
 * the server, which checks. The employment engine, for a different list.
 */

import { CONTRACTOR_QUESTIONNAIRE } from "./data/questionnaire";
import type { Answers } from "./types";

export type Condition =
  | { q: string; eq: unknown }
  | { q: string; in: readonly unknown[] }
  | { q: string; not_in: readonly unknown[] }
  | { q: string; has: unknown }
  | { q: string; lacks: unknown }
  | { all: readonly Condition[] }
  | { any: readonly Condition[] };

export type QuestionType = "jurisdiction" | "single_choice" | "multi_choice" | "date" | "free_text" | "free_text_list" | "scale";

export interface Option {
  value: string;
  label: string;
  recommended?: boolean;
  exclusive?: boolean;
}

/** A free-text answer the law would not accept: matched, the screen refuses
 *  it and shows the message. Pattern is a case-insensitive regular expression. */
export interface Reject {
  pattern: string;
  message: string;
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
  /** C1b: "Same as the Company" is offered. */
  allowSame: boolean;
  maxItems?: number;
  maxLength?: number;
  defaultValue?: unknown;
  reject?: Reject[];
  /** Not asked when the employee works in one of these places; the
   *  default answer applies. */
  notForWorkIn?: string[];
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
    reject: q.reject as Reject[] | undefined,
    notForWorkIn: q.not_for_work_in as string[] | undefined,
  };
}

/** True when the question is not for the place the employee works. */
function offLimits(q: Raw, a: Answers): boolean {
  const places = q.not_for_work_in as string[] | undefined;
  if (!places?.length) return false;
  const work = workJurisdiction(a);
  if (!work) return false;
  return places.includes(work) || places.includes(countryOf(work)) || places.includes(partOf(work));
}

/** Why a free-text answer cannot be accepted, or null when it can. */
export function problemWith(q: Question, value: unknown): string | null {
  if (typeof value !== "string" || !q.reject?.length) return null;
  for (const r of q.reject) {
    if (new RegExp(r.pattern, "i").test(value)) return r.message;
  }
  return null;
}

/** Every question, asked or not — for the admin list. */
export const ALL_QUESTIONS: Question[] = (CONTRACTOR_QUESTIONNAIRE.questions as unknown as Raw[]).map(concrete);

/** The show_if of a question, for the admin list. */
export function showIf(id: string): Condition | undefined {
  const raw = (CONTRACTOR_QUESTIONNAIRE.questions as unknown as Raw[]).find((q) => q.id === id);
  return raw?.show_if as Condition | undefined;
}

/** The questions for these answers, in the order they are asked. */
export function questionsFor(a: Answers): Question[] {
  return (CONTRACTOR_QUESTIONNAIRE.questions as unknown as Raw[])
    .filter((q) => evaluate(q.show_if as Condition | undefined, a) && !offLimits(q, a))
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
    if (/^C\d+[a-z]?$/.test(id) && !visible.has(id)) delete out[k];
  }
  return out;
}

/** Required questions still unanswered. */
export function unanswered(a: Answers): Question[] {
  return questionsFor(a).filter((q) => q.required && empty(a[q.id]));
}

/** Where the Contractor is based: C1b, or the Company's place when "same". */
export function workJurisdiction(a: Answers): string {
  const b = typeof a.C1b === "string" ? a.C1b.trim() : "";
  const e = typeof a.C1a === "string" ? a.C1a.trim() : "";
  return !b || b === "same" ? e : b;
}

/** The governing law: where the Company is based. */
export function lawJurisdiction(a: Answers): string {
  return typeof a.C1a === "string" ? a.C1a.trim() : "";
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
