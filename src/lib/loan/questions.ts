/**
 * The loan agreement questionnaire made concrete for the answers so far:
 * which questions are asked (show_if), their defaults, and which required
 * ones are still open. Pure — the same list on the client, which asks, and
 * on the server, which checks. The investment agreement engine, with one
 * addition: a default can depend on an earlier answer (default_by), so the
 * usual answer leans to the side the user is on — and another: the level of
 * detail (LN0) decides which questions are asked. A question not asked at
 * the level takes its usual answer, or the one the level sets (fixed).
 */

import { LOAN_QUESTIONNAIRE } from "./data/questionnaire";
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

/** The level of detail (LN0). */
export type Level = "simple" | "standard" | "comprehensive";
export const LEVELS: Level[] = ["simple", "standard", "comprehensive"];

/** Question ids: LN0 … LN21, with a letter for a follow-up (LN8a, LN12b). */
export const QUESTION_ID = /^LN\d+[a-z]?$/;

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

/** A default that follows an earlier answer: { q: "LN1", map: { lender: "x", borrower: "y" } }. */
type DefaultBy = { q: string; map: Record<string, unknown> };

function defaultFor(q: Raw, a: Answers): unknown {
  const by = q.default_by as DefaultBy | undefined;
  if (by) {
    const key = a[by.q];
    if (typeof key === "string" && key in by.map) return by.map[key];
  }
  return q.default;
}

function concrete(q: Raw, a: Answers): Question {
  const d = defaultFor(q, a);
  /* The recommended option is the usual answer for this side. */
  const options = ((q.options as Option[] | undefined) ?? []).map((o) =>
    q.default_by ? { ...o, recommended: o.value === d } : { ...o },
  );
  return {
    id: q.id as string,
    key: q.key as string,
    section: (q.section as string) ?? "",
    type: (q.type as QuestionType) ?? "free_text",
    text: (q.text as string) ?? "",
    help: q.help as string | undefined,
    placeholder: q.placeholder as string | undefined,
    required: Boolean(q.required),
    options,
    maxItems: q.max_items as number | undefined,
    maxLength: q.max_length as number | undefined,
    defaultValue: Array.isArray(d) ? [...(d as unknown[])] : d,
    reject: q.reject as Reject[] | undefined,
  };
}

const RAW = LOAN_QUESTIONNAIRE.questions as unknown as Raw[];

/** The level chosen. A draft saved before levels existed asked every
 *  question, so answers without a level are read as comprehensive. */
export function levelOf(a: Answers): Level {
  const v = a.LN0;
  if (typeof v === "string" && (LEVELS as string[]).includes(v)) return v as Level;
  const older = Object.keys(a).some((k) => k !== "LN0" && QUESTION_ID.test(k) && !empty(a[k]));
  return older ? "comprehensive" : "standard";
}

const askedAt = (q: Raw, level: Level) => {
  const at = q.asked_at as readonly string[] | undefined;
  return !at || at.includes(level);
};

/** The answers the level sets without asking: the level's own answer
 *  (fixed), else the usual answer. Read again until it stops changing: a
 *  set answer can reveal or hide another question. */
export function fixedAnswers(a: Answers): Answers {
  const level = levelOf(a);
  let out: Answers = {};
  for (let pass = 0; pass < 3; pass++) {
    const full: Answers = { ...a, LN0: level, ...out };
    const next: Answers = {};
    for (const q of RAW) {
      if (askedAt(q, level) || !evaluate(q.show_if as Condition | undefined, full)) continue;
      const fixed = (q.fixed as Record<string, unknown> | undefined)?.[level];
      const v = fixed !== undefined ? fixed : defaultFor(q, full);
      if (v !== undefined) next[q.id as string] = v;
    }
    out = next;
  }
  return out;
}

/** The answers with what the level sets filled in — the screen keeps these
 *  so the parties box and the summary follow the level. */
export function withFixed(a: Answers): Answers {
  return { ...a, ...fixedAnswers(a) };
}

/** At which levels a question is asked, and what the level sets — for the admin list. */
export function levelsOf(id: string): { asked: Level[]; fixed: Partial<Record<Level, unknown>> } {
  const q = RAW.find((x) => x.id === id);
  const at = q?.asked_at as readonly Level[] | undefined;
  return { asked: at ? [...at] : [...LEVELS], fixed: { ...((q?.fixed as Partial<Record<Level, unknown>> | undefined) ?? {}) } };
}

/** Why a free-text answer cannot be accepted, or null when it can. */
export function problemWith(q: Question, value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || !q.reject?.length) return null;
  for (const r of q.reject) {
    if (new RegExp(r.pattern, "i").test(value)) return r.message;
  }
  return null;
}

/** Every question, asked or not — for the admin list (defaults as for the lender). */
export const ALL_QUESTIONS: Question[] = RAW.map((q) => concrete(q, {}));

/** The show_if of a question, for the admin list. */
export function showIf(id: string): Condition | undefined {
  return RAW.find((q) => q.id === id)?.show_if as Condition | undefined;
}

/** The side-dependent defaults of a question, for the admin list. */
export function defaultsBy(id: string): DefaultBy | undefined {
  return RAW.find((q) => q.id === id)?.default_by as DefaultBy | undefined;
}

/** The questions for these answers, in the order they are asked. */
export function questionsFor(a: Answers): Question[] {
  const level = levelOf(a);
  const full: Answers = { ...a, LN0: level, ...fixedAnswers(a) };
  return RAW.filter((q) => askedAt(q, level) && evaluate(q.show_if as Condition | undefined, full)).map((q) => concrete(q, full));
}

/** Fill every unanswered visible question that has a default. The list is
 *  read again until it stops changing: a default can reveal a question. */
export function applyDefaults(a: Answers): Answers {
  const out: Answers = { ...a };
  if (empty(out.LN0)) out.LN0 = levelOf(a);
  for (let pass = 0; pass < 3; pass++) {
    for (const q of questionsFor(out)) {
      if (!empty(out[q.id])) continue;
      if (q.defaultValue !== undefined) out[q.id] = q.defaultValue;
    }
    /* What the level sets replaces any earlier answer to a question it does not ask. */
    Object.assign(out, fixedAnswers(out));
  }
  /* A hidden question's answer does not count. */
  const visible = new Set([...questionsFor(out).map((q) => q.id), ...Object.keys(fixedAnswers(out))]);
  for (const k of Object.keys(out)) {
    if (QUESTION_ID.test(k) && !visible.has(k)) delete out[k];
  }
  return out;
}

/** Required questions still unanswered. */
export function unanswered(a: Answers): Question[] {
  return questionsFor(a).filter((q) => q.required && empty(a[q.id]));
}

/** A multi-choice answer as a list. */
export function picks(a: Answers, id: string): string[] {
  const v = a[id];
  return Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : [];
}
