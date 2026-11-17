/**
 * Reading back what FD AI made of the user's typed phrases (0240) — the part
 * of lib/loan/tidy.ts that needs no model, so it can be tested on its own.
 * A rewrite is used only when it is plainly the same thing said better.
 */

import type { Tidied } from "./assemble";
import type { Answers } from "./types";

/** The typed answers, and the sentence each one is dropped into. */
export const SLOTS: { key: keyof Tidied; q: string; show: (a: Answers) => boolean; sentence: string }[] = [
  { key: "purpose", q: "LN7", show: () => true, sentence: "The Borrower shall apply the Principal Amount towards ___." },
  { key: "drawdown_date", q: "LN8a", show: (a) => a.LN8 === "date", sentence: "\"Drawdown Date\" refers to the date that the Loan is disbursed, being ___, or such other date agreed in writing." },
  { key: "security_desc", q: "LN14a", show: (a) => a.LN14 === "other", sentence: "The Loan shall be secured by ___, in a form agreed by the Lender (the \"Security Document\")." },
  { key: "pledged_shares", q: "LN14b", show: (a) => a.LN14 === "pledge", sentence: "The Loan shall be secured by a first-ranking pledge of ___ (the \"Pledged Shares\")." },
  { key: "financial_periods", q: "LN17a", show: () => true, sentence: "the financial statements relating to the Company, being the financial statements in respect of ___ (the \"Financial Statements\")" },
  { key: "next_round", q: "LN17b", show: () => true, sentence: "updates on the status of the Company's ___ financing" },
];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Every figure in the rewrite must have been typed (a two-digit year may be written in full). */
function figuresKept(typed: string, out: string): boolean {
  const have = new Set(typed.match(/\d+/g) ?? []);
  for (const n of out.match(/\d+/g) ?? []) {
    if (have.has(n)) continue;
    if (n.length === 4 && n.startsWith("20") && have.has(n.slice(2))) continue;
    /* "01" typed, "1" written (a date): the same number. */
    if ([...have].some((h) => Number(h) === Number(n))) continue;
    return false;
  }
  return true;
}

/** Most of the client's own words (of four letters or more) must still be there. */
function wordsKept(typed: string, out: string): boolean {
  const words = (typed.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w, i, all) => all.indexOf(w) === i);
  if (words.length === 0) return /[a-z0-9]/i.test(out);
  const low = out.toLowerCase();
  return words.filter((w) => low.includes(w)).length >= Math.ceil(words.length * 0.6);
}

/** A rewrite is used only if it is the same thing said better: about the
 *  same length, the client's words and figures still in it, one line. */
const acceptable = (typed: string, out: string) =>
  out.length >= Math.min(typed.length, 6) &&
  out.length <= Math.max(120, typed.length * 2 + 60) &&
  !/[\n{}]/.test(out) &&
  figuresKept(typed, out) &&
  wordsKept(typed, out);

/** The phrases worth sending: shown for these answers, and long enough to rewrite. */
export function slotsFor(answers: Answers) {
  return SLOTS.filter((s) => s.show(answers) && str(answers[s.q]).length >= 3);
}

/** The model's JSON, read defensively: anything doubtful is dropped, and the typed words stand. */
export function readTidy(raw: string, answers: Answers): Tidied {
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json.slice(json.indexOf("{"), json.lastIndexOf("}") + 1)) as Record<string, unknown>;
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  const tidy: Tidied = {};
  for (const s of slotsFor(answers)) {
    const typed = str(answers[s.q]);
    const out = str(parsed[s.key]).replace(/^["“]|["”]$/g, "").replace(/[.;\s]+$/, "");
    if (out && out !== typed && acceptable(typed, out)) tidy[s.key] = out;
  }
  return tidy;
}
