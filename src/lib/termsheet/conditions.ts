/**
 * The questionnaire's condition language, and the questions as they are
 * asked for one particular deal.
 *
 * The questionnaire is data (data/questionnaire.ts): twenty questions whose
 * wording, options and even type vary with the deal (Q1) and whose presence
 * depends on earlier answers (show_if). This file turns that data into a
 * flat list of concrete questions for the answers so far — the same list on
 * the client, which asks them, and on the server, which checks them.
 *
 * Nothing here touches the network or the document; it is pure, so it can
 * be tested in Node.
 */

import { QUESTIONNAIRE } from "./data/questionnaire";
import type { DealType } from "./data/map";

/* ── condition language ────────────────────────────────────────────────── */

export type Condition =
  | { q: string; eq: unknown }
  | { q: string; in: readonly unknown[] }
  | { q: string; not_in: readonly unknown[] }
  | { q: string; not_empty: boolean }
  | { q: string; not_in_only: readonly unknown[] }
  | { all: readonly Condition[] }
  | { any: readonly Condition[] };

/** The answers, keyed by question id. Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

export function evaluate(c: Condition | null | undefined, a: Answers): boolean {
  if (!c) return true;
  if ("all" in c) return c.all.every((x) => evaluate(x, a));
  if ("any" in c) return c.any.some((x) => evaluate(x, a));
  const v = a[c.q];
  const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  if ("eq" in c) return v === c.eq;
  if ("in" in c) return c.in.includes(v);
  if ("not_in" in c) return !c.not_in.includes(empty ? null : v);
  if ("not_empty" in c) return c.not_empty ? !empty : empty;
  if ("not_in_only" in c) {
    if (empty) return false;
    const vals = Array.isArray(v) ? v : [v];
    return !vals.every((x) => c.not_in_only.includes(x));
  }
  return false;
}

/* ── the questions, made concrete ───────────────────────────────────────── */

export type QuestionType =
  | "single_choice"
  | "multi_choice"
  | "free_text"
  | "free_text_list"
  | "period_or_date"
  | "date"
  | "country"
  | "state_list"
  | "amount"
  | "amount_with_choice"
  | "rate_and_period"
  | "yes_no"
  | "yes_no_period";

export interface Option {
  value: string;
  label: string;
  recommended?: boolean;
  exclusive?: boolean;
  needs_detail?: boolean;
  needs_amount?: boolean;
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
  allowOther: boolean;
  otherLabel?: string;
  allowDate: boolean;
  maxItems?: number;
  maxLength?: number;
  /** The default answer, once the rules have been applied to what is known. */
  defaultValue?: unknown;
}

type RawQuestion = (typeof QUESTIONNAIRE)["questions"][number];

function byDeal<T>(map: Record<string, T> | undefined, deal: string, fallback?: T): T | undefined {
  if (!map) return fallback;
  return (map as Record<string, T>)[deal] ?? (map as Record<string, T>).default ?? fallback;
}

/** A default rule: a literal, or a list of {when, value} / {else}. */
export function resolveDefault(d: unknown, a: Answers): unknown {
  if (d === null || d === undefined) return undefined;
  if (typeof d === "object" && d !== null && "rule" in d) {
    const rule = (d as { rule: unknown }).rule;
    if (!Array.isArray(rule)) return undefined; // a prose rule for the back end
    for (const r of rule as Array<{ when?: Condition; value?: unknown; else?: unknown }>) {
      if ("else" in r) return r.else;
      if (r.when && evaluate(r.when, a)) return r.value;
    }
    return undefined;
  }
  return d;
}

const ORDER = QUESTIONNAIRE.questions.map((q) => q.id);

/** The questions in the order they are asked. Q7a's state follow-up sits
 *  right after Q7a. Hidden questions are left out, not asked. */
export function questionsFor(a: Answers): Question[] {
  const deal = (typeof a.Q1 === "string" ? a.Q1 : "other") as DealType;
  const out: Question[] = [];

  for (const raw of QUESTIONNAIRE.questions as readonly RawQuestion[]) {
    const q = raw as unknown as Record<string, unknown>;
    if (!evaluate(q.show_if as Condition | undefined, a)) continue;
    out.push(concrete(q, deal, a));

    const follow = q.follow_up as Record<string, unknown> | undefined;
    if (follow && evaluate(follow.show_if as Condition | undefined, a)) {
      out.push(concrete({ ...follow, section: q.section }, deal, a));
    }
  }
  return out;
}

function concrete(q: Record<string, unknown>, deal: DealType, a: Answers): Question {
  const variant = byDeal(q.variants as Record<string, Record<string, unknown>> | undefined, deal);
  const pick = <T,>(key: string): T | undefined =>
    (variant?.[key] as T | undefined) ??
    (byDeal(q[`${key}_by_deal_type`] as Record<string, T> | undefined, deal) as T | undefined) ??
    (q[key] as T | undefined);

  let options = (pick<Option[]>("options") ?? []).slice();
  /* Q5's options follow the subject chosen in Q4, plus "suggest for me". */
  const bySubject = q.options_by_subject as Record<string, string[]> | undefined;
  if (bySubject) {
    const subj = typeof a.Q4 === "string" ? a.Q4 : "";
    options = (bySubject[subj] ?? []).map((s) => ({ value: s, label: s }));
    for (const x of (q.extra_options as Option[] | undefined) ?? []) options.push(x);
  }
  /* Q13's label names the parties by role. */
  const roles = rolesFor(deal);
  options = options.map((o) => ({
    ...o,
    label: o.label.replace(/\{party_1_role\}/g, roles[0]).replace(/\{party_2_role\}/g, roles[1]),
  }));

  const type = (pick<string>("type") ?? "free_text") as QuestionType;
  return {
    id: q.id as string,
    key: q.key as string,
    section: (q.section as string) ?? "",
    type,
    text: pick<string>("text") ?? "",
    help: pick<string>("help"),
    placeholder: pick<string>("placeholder"),
    required: Boolean(q.required),
    options,
    allowOther: Boolean(variant?.allow_other ?? q.allow_other),
    otherLabel: (variant?.other_label as string | undefined) ?? (q.other_label as string | undefined),
    allowDate: Boolean(q.allow_date),
    maxItems: q.max_items as number | undefined,
    maxLength: q.max_length as number | undefined,
    defaultValue: resolveDefault(q.default, a),
  };
}

export function rolesFor(deal: string): [string, string] {
  switch (deal) {
    case "investment": return ["Investor", "Company"];
    case "loan": return ["Lender", "Borrower"];
    case "acquisition": return ["Buyer", "Seller"];
    case "project": return ["Lead Party", "Partner"];
    default: return ["First Party", "Second Party"];
  }
}

/** Fill every unanswered visible question that has a default. Answered
 *  questions are left alone; hidden ones stay unanswered. */
export function applyDefaults(a: Answers): Answers {
  const out: Answers = { ...a };
  for (const q of questionsFor(out)) {
    if (out[q.id] !== undefined && out[q.id] !== null && out[q.id] !== "") continue;
    if (q.defaultValue !== undefined) out[q.id] = q.defaultValue;
    /* Q5 "suggest for me" and its default both mean: the usual agreements. */
    if (q.id === "Q5" && (out.Q5 === undefined || (Array.isArray(out.Q5) && out.Q5.includes("suggest")))) {
      out.Q5 = q.options.filter((o) => o.value !== "suggest").map((o) => o.value);
    }
  }
  return out;
}

/** Required questions still unanswered — the ones to ask before drafting. */
export function unanswered(a: Answers): Question[] {
  return questionsFor(a).filter((q) => {
    if (!q.required) return false;
    const v = a[q.id];
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  });
}

export const QUESTION_ORDER = ORDER;
