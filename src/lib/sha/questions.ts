/**
 * The SHA questionnaire made concrete for the answers so far: which
 * questions are asked (show_if), their defaults, and which required ones
 * are still open. Pure — the same list on the client, which asks, and on
 * the server, which checks. The co-founder engine, for the SHA's list.
 */

import { SHA_QUESTIONNAIRE } from "./data/questionnaire";
import type { Answers } from "./types";

export type Condition =
  | { q: string; eq: unknown }
  | { q: string; in: readonly unknown[] }
  | { q: string; not_in: readonly unknown[] }
  | { q: string; has: unknown }
  | { q: string; lacks: unknown }
  | { all: readonly Condition[] }
  | { any: readonly Condition[] };

export type QuestionType = "single_choice" | "multi_choice" | "free_text" | "free_text_list";

export interface Option {
  value: string;
  label: string;
  recommended?: boolean;
  exclusive?: boolean;
}

/** A free-text answer that cannot be accepted: matched, the screen refuses
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
  maxItems?: number;
  maxLength?: number;
  defaultValue?: unknown;
  reject?: Reject[];
}

/** Question ids: S1 … S38, with a letter for a follow-up (S5a, S26e). */
export const QUESTION_ID = /^S\d+[a-z]?$/;

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
    maxItems: q.max_items as number | undefined,
    maxLength: q.max_length as number | undefined,
    defaultValue: Array.isArray(q.default) ? [...(q.default as unknown[])] : q.default,
    reject: q.reject as Reject[] | undefined,
  };
}

const RAW = SHA_QUESTIONNAIRE.questions as unknown as Raw[];

/** Why a free-text answer cannot be accepted, or null when it can. */
export function problemWith(q: Question, value: unknown): string | null {
  if (typeof value !== "string" || !q.reject?.length) return null;
  for (const r of q.reject) {
    if (new RegExp(r.pattern, "i").test(value)) return r.message;
  }
  return null;
}

/** Every question, asked or not — for the admin list. */
export const ALL_QUESTIONS: Question[] = RAW.map(concrete);

/** The show_if of a question, for the admin list. */
export function showIf(id: string): Condition | undefined {
  return RAW.find((q) => q.id === id)?.show_if as Condition | undefined;
}

/** The questions for these answers, in the order they are asked. */
export function questionsFor(a: Answers): Question[] {
  return RAW.filter((q) => evaluate(q.show_if as Condition | undefined, a)).map(concrete);
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
    if (QUESTION_ID.test(k) && !visible.has(k)) delete out[k];
  }
  return out;
}

/** Required questions still unanswered. */
export function unanswered(a: Answers): Question[] {
  return questionsFor(a).filter((q) => q.required && empty(a[q.id]));
}

/** How many shareholders S4 says there are (2 when not answered yet). */
export function shareholderCount(a: Answers): number {
  const n = Number(a.S4);
  return Number.isInteger(n) && n >= 2 && n <= 10 ? n : 2;
}

/** A multi-choice answer as a list. */
export function picks(a: Answers, id: string): string[] {
  const v = a[id];
  return Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : [];
}
