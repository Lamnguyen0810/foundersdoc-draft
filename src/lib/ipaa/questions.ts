/**
 * The IP assignment agreement questionnaire made concrete for the answers so
 * far: which questions are asked (show_if), their defaults, and which
 * required ones are still open. Pure — the same list on the client, which
 * asks, and on the server, which checks. The loan agreement engine: a
 * default can follow an earlier answer (default_by), the level of detail
 * (IP0) decides which questions are asked, and a question not asked at the
 * level takes its usual answer, or the one the level sets (fixed). One
 * addition: a question, or one of its options, can read differently for each
 * side (text_by, label_by), so each pathway hears the FD Lite wording.
 */

import { IPAA_QUESTIONNAIRE } from "./data/questionnaire";
import type { Answers } from "./types";

export type Condition =
  | { q: string; eq: unknown }
  | { q: string; in: readonly unknown[] }
  | { q: string; not_in: readonly unknown[] }
  | { q: string; has: unknown }
  | { q: string; lacks: unknown }
  | { all: readonly Condition[] }
  | { any: readonly Condition[] };

export type QuestionType = "single_choice" | "multi_choice" | "free_text" | "free_text_list" | "scale";

export interface Option {
  value: string;
  label: string;
  /** The label for a side other than the usual one: { creator: "…" }. */
  label_by?: Record<string, string>;
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

/** The level of detail (IP0): the FD Lite menu's Basic, Standard and Complex. */
export type Level = "basic" | "standard" | "complex";
export const LEVELS: Level[] = ["basic", "standard", "complex"];

/** Question ids: IP0 … IP18, with a letter for a follow-up (IP2a, IP16b). */
export const QUESTION_ID = /^IP\d+[a-z]?$/;

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

/** A default that follows an earlier answer: { q: "IP1", map: { creator: "x", recipient: "y" } }. */
type DefaultBy = { q: string; map: Record<string, unknown> };

/** The wording that follows an earlier answer — the side. */
function textFor(q: Raw, a: Answers): string {
  const by = q.text_by as { q: string; map: Record<string, string> } | undefined;
  const key = by ? a[by.q] : undefined;
  return (typeof key === "string" && by?.map[key]) || ((q.text as string) ?? "");
}

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
  const side = typeof a.IP1 === "string" ? a.IP1 : "";
  const options = ((q.options as Option[] | undefined) ?? []).map((o) => {
    const label = (side && o.label_by?.[side]) || o.label;
    return q.default_by ? { ...o, label, recommended: Array.isArray(d) ? false : o.value === d } : { ...o, label };
  });
  return {
    id: q.id as string,
    key: q.key as string,
    section: (q.section as string) ?? "",
    type: (q.type as QuestionType) ?? "free_text",
    text: textFor(q, a),
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

const RAW = IPAA_QUESTIONNAIRE.questions as unknown as Raw[];

/** The level chosen; Standard until one is. */
export function levelOf(a: Answers): Level {
  const v = a.IP0;
  return typeof v === "string" && (LEVELS as string[]).includes(v) ? (v as Level) : "standard";
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
    const full: Answers = { ...a, IP0: level, ...out };
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

/** Every question, asked or not — for the admin list (as the recipient hears it). */
export const ALL_QUESTIONS: Question[] = RAW.map((q) => concrete(q, { IP1: "recipient" }));

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
  const full: Answers = { ...a, IP0: level, ...fixedAnswers(a) };
  return RAW.filter((q) => askedAt(q, level) && evaluate(q.show_if as Condition | undefined, full)).map((q) => concrete(q, full));
}

/** Fill every unanswered visible question that has a default. The list is
 *  read again until it stops changing: a default can reveal a question. */
export function applyDefaults(a: Answers): Answers {
  const out: Answers = { ...a };
  if (empty(out.IP0)) out.IP0 = levelOf(a);
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
