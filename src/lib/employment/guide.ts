/**
 * The employment law guide — Rachel's "special feature" for the employment
 * contract (#fdai-draft-employment, 10 Oct 2026):
 *
 *   "The first question we ask is where the entity is based and the
 *    nationality of the person hiring, then we use AI to give them an
 *    overview of the employment law regulations. When they answer something
 *    like leave, the system prompts them that it does not comply."
 *
 * So, after "where" (E1a, E1b) and the employee's nationality (E1c), the
 * screen shows an overview of the rules where the employee works, and every
 * later answer is checked against it. A choice that does not comply is not
 * refused: the person is told why and chooses to change it or keep it, and
 * the contract stays "subject to applicable laws" either way (Rachel: A, B
 * and C — leave, arbitration, privacy consent).
 *
 * Two sources, one shape:
 *   - built in (this file): the firm's own table — the leave minimums
 *     (minimums.ts), where the GDPR applies, where arbitration of employment
 *     claims and non-competes are limited, and work passes. Always there,
 *     also for visitors who have not signed up;
 *   - FD AI (guide-ai.ts, signed-in only): a fuller overview of the place,
 *     merged over the built-in one. Where both give a figure, the firm's
 *     table wins.
 *
 * Shared by the screen and the server: no server-only imports here.
 */

import { leaveFloor } from "./minimums";
import { countryOf, partOf, workJurisdiction } from "./questions";
import type { Answers, Job } from "./types";

export type Arbitration = "allowed" | "limited" | "unknown";
export type Consent = "valid" | "not_valid" | "unknown";
export type NonCompete = "enforceable" | "paid" | "limited" | "not_enforceable" | "unknown";

export interface GuideRules {
  /** Paid annual leave the law guarantees, working days a year. */
  min_leave_days: number | null;
  /** The longest probation the law allows, in months. */
  max_probation_months: number | null;
  /** Whether employment claims can go to private arbitration. */
  arbitration: Arbitration;
  /** Whether consent is a valid basis for handling an employee's data. */
  consent: Consent;
  /** How a post-employment non-compete is treated. */
  non_compete: NonCompete;
  /** True when the employee is likely to need a work pass or visa. */
  work_pass: boolean | null;
}

export interface GuidePoint {
  topic: string;
  text: string;
}

export interface LawGuide {
  /** E1a|E1b|E1c, so the screen knows when to fetch a new one. */
  key: string;
  /** Where the employee works, as the user picked it. */
  place: string;
  nationality: string;
  summary: string;
  points: GuidePoint[];
  rules: GuideRules;
  source: "ai" | "built_in";
}

/** Where the GDPR (or the UK's version of it) applies. */
export const GDPR = new Set([
  "United Kingdom", "England and Wales", "Scotland", "Northern Ireland", "Ireland", "Germany", "France", "Netherlands", "Belgium",
  "Luxembourg", "Spain", "Portugal", "Italy", "Austria", "Denmark", "Sweden", "Finland", "Poland", "Czech Republic", "Greece",
  "Romania", "Hungary", "Estonia", "Latvia", "Lithuania", "Slovakia", "Slovenia", "Croatia", "Bulgaria", "Cyprus", "Malta",
  "Norway", "Iceland", "Liechtenstein",
]);

/** Free movement for work: the EU, the EEA and Switzerland. */
const FREE_MOVEMENT = new Set([
  "Ireland", "Germany", "France", "Netherlands", "Belgium", "Luxembourg", "Spain", "Portugal", "Italy", "Austria", "Denmark",
  "Sweden", "Finland", "Poland", "Czech Republic", "Greece", "Romania", "Hungary", "Estonia", "Latvia", "Lithuania", "Slovakia",
  "Slovenia", "Croatia", "Bulgaria", "Cyprus", "Malta", "Norway", "Iceland", "Liechtenstein", "Switzerland",
]);

const UK = new Set(["United Kingdom", "England and Wales", "Scotland", "Northern Ireland"]);

/** Statutory employment claims cannot be sent to arbitration. */
const ARBITRATION_LIMITED = new Set([...UK, "Ireland", "Germany", "France", "Netherlands", "Belgium", "Spain", "Italy", "Australia", "New Zealand"]);

/** A non-compete is void, or close to it. */
const NON_COMPETE_VOID = new Set(["California", "North Dakota", "Minnesota", "Oklahoma"]);
/** A non-compete must be paid for during the restriction. */
const NON_COMPETE_PAID = new Set(["Germany", "France", "Italy", "Spain", "Portugal", "Belgium", "Austria", "Netherlands", "Poland"]);

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function guideKey(a: Answers): string {
  return [str(a.E1a), workJurisdiction(a), str(a.E1c)].join("|");
}

const inSet = (set: Set<string>, place: string) => set.has(place) || set.has(partOf(place)) || set.has(countryOf(place));

/** The firm's own rules for a place: no model, always available. */
export function builtInRules(work: string, nationality: string): GuideRules {
  const country = countryOf(work);
  const pass = nationality && country ? nationality !== country && !(FREE_MOVEMENT.has(nationality) && FREE_MOVEMENT.has(country)) : null;
  return {
    min_leave_days: work ? leaveFloor(work) : null,
    max_probation_months: null,
    arbitration: inSet(ARBITRATION_LIMITED, work) ? "limited" : "unknown",
    consent: inSet(GDPR, work) ? "not_valid" : "unknown",
    non_compete: inSet(NON_COMPETE_VOID, work) ? "not_enforceable" : inSet(NON_COMPETE_PAID, work) ? "paid" : UK.has(partOf(work)) || UK.has(country) ? "limited" : "unknown",
    work_pass: pass,
  };
}

/** The built-in guide: the points the firm's table can make, in plain words. */
export function builtInGuide(a: Answers): LawGuide {
  const work = workJurisdiction(a);
  const nationality = str(a.E1c);
  const rules = builtInRules(work, nationality);
  const place = work.split(",")[0] || "the place the employee works";
  return {
    key: guideKey(a),
    place: work,
    nationality,
    summary: `The main rules in ${place} that FD AI will check your answers against. Whatever the contract says, the employee keeps the rights the law of ${place} gives them, so the contract is written subject to applicable laws.`,
    points: pointsFor(rules, place, nationality, work),
    rules,
    source: "built_in",
  };
}

function pointsFor(r: GuideRules, place: string, nationality: string, work: string): GuidePoint[] {
  const out: GuidePoint[] = [];
  if (r.min_leave_days !== null) out.push({ topic: "Annual leave", text: `At least ${r.min_leave_days} working days of paid annual leave a year, on top of public holidays.` });
  else out.push({ topic: "Annual leave", text: `${place} has no minimum in FD AI's table; any statutory minimum still applies.` });
  if (r.arbitration === "limited") out.push({ topic: "Disputes", text: `Statutory employment claims (unfair dismissal, discrimination, unpaid wages) cannot be sent to private arbitration in ${place}; they go to the employment tribunal or labour court.` });
  if (r.consent === "not_valid") out.push({ topic: "Employee data", text: `Under ${UK.has(countryOf(work)) ? "the UK GDPR" : "the GDPR"}, consent is rarely a valid basis for handling an employee's data. An employee privacy notice is needed instead.` });
  if (r.non_compete === "not_enforceable") out.push({ topic: "Non-compete", text: `A post-employment non-compete is not enforceable in ${place}.` });
  if (r.non_compete === "paid") out.push({ topic: "Non-compete", text: `A post-employment non-compete must usually be paid for during the restriction in ${place}, and is capped in length.` });
  if (r.non_compete === "limited") out.push({ topic: "Non-compete", text: `A non-compete is enforced in ${place} only if it is no wider than needed to protect the business — usually a few months, for senior staff.` });
  if (r.work_pass) out.push({ topic: "Right to work", text: `A national of ${nationality} usually needs a work pass or visa to work in ${countryOf(work) || place}. Make sure it is in place before the start date.` });
  return out;
}

/* ── merging FD AI's guide over the built-in one ──────────────────────── */

const ARB: Arbitration[] = ["allowed", "limited", "unknown"];
const CONSENT: Consent[] = ["valid", "not_valid", "unknown"];
const NC: NonCompete[] = ["enforceable", "paid", "limited", "not_enforceable", "unknown"];

/** A guide from anywhere (the model, the browser), made safe and merged over
 *  the firm's table: the table's figures and findings win. */
export function mergeGuide(base: LawGuide, raw: unknown, source: LawGuide["source"]): LawGuide {
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const rr = (r.rules && typeof r.rules === "object" ? r.rules : {}) as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v) : null);
  const pick = <T extends string>(v: unknown, list: T[]): T => (list.includes(v as T) ? (v as T) : ("unknown" as T));
  const b = base.rules;
  const rules: GuideRules = {
    min_leave_days: b.min_leave_days ?? num(rr.min_leave_days, 40),
    max_probation_months: b.max_probation_months ?? num(rr.max_probation_months, 24),
    arbitration: b.arbitration !== "unknown" ? b.arbitration : pick(rr.arbitration, ARB),
    consent: b.consent !== "unknown" ? b.consent : pick(rr.consent, CONSENT),
    non_compete: b.non_compete !== "unknown" ? b.non_compete : pick(rr.non_compete, NC),
    work_pass: b.work_pass ?? (typeof rr.work_pass === "boolean" ? rr.work_pass : null),
  };
  const points: GuidePoint[] = Array.isArray(r.points)
    ? (r.points as Record<string, unknown>[])
        .map((p) => ({ topic: str(p?.topic).slice(0, 40), text: str(p?.text).slice(0, 360) }))
        .filter((p) => p.topic && p.text)
        .slice(0, 10)
    : [];
  return {
    ...base,
    summary: str(r.summary).slice(0, 600) || base.summary,
    points: points.length ? points : base.points,
    rules,
    source: points.length ? source : base.source,
  };
}

/* ── checking the answers against it ──────────────────────────────────── */

export interface Issue {
  /** The question (E3c …) or "job". */
  field: string;
  title: string;
  message: string;
}

const PROBATION_MONTHS: Record<string, number> = { "3m": 3, "6m": 6 };

/** What does not comply, for one answer — the prompt the screen shows when
 *  it is picked. Null when nothing is wrong (or nothing is known). */
export function issueFor(g: LawGuide | null, field: string, value: unknown): Issue | null {
  if (!g) return null;
  const place = g.place.split(",")[0] || "the place the employee works";
  const r = g.rules;
  if (field === "E3c") {
    const m = PROBATION_MONTHS[str(value)];
    if (m && r.max_probation_months !== null && m > r.max_probation_months)
      return { field, title: "Probation longer than the law allows", message: `Probation in ${place} can last at most ${r.max_probation_months} month${r.max_probation_months === 1 ? "" : "s"}. A longer period will not be enforced; the statutory limit applies.` };
  }
  if (field === "E6a" && Array.isArray(value) && value.includes("compete")) {
    if (r.non_compete === "not_enforceable")
      return { field, title: "Non-compete not enforceable", message: `A non-compete is not enforceable in ${place}. If you keep it, the contract still includes it, but a court will not uphold it.` };
    if (r.non_compete === "paid")
      return { field, title: "Non-compete must be paid for", message: `In ${place} a non-compete usually has to be paid for while it runs (often around half of the salary), or it is not binding. Check this with your lawyer before you keep it.` };
  }
  if (field === "E10a" && str(value) === "include" && r.consent === "not_valid")
    return { field, title: "Consent is not a valid basis here", message: `Under the data protection law of ${place}, an employee's consent is rarely valid, because of the imbalance of power. The clause is written subject to applicable data protection laws, and you will also need an employee privacy notice.` };
  if (field === "E10b" && str(value) === "arbitration" && r.arbitration === "limited")
    return { field, title: "Arbitration is limited here", message: `In ${place}, statutory employment claims (unfair dismissal, discrimination, unpaid wages) cannot be sent to private arbitration — they go to the employment tribunal or labour court. The clause keeps those claims open and applies only so far as the law allows; local courts are the usual choice.` };
  return null;
}

/** The annual leave check: the prompt under the box. */
export function leaveIssue(g: LawGuide | null, job: Job): Issue | null {
  const floor = g?.rules.min_leave_days ?? null;
  const days = Number.parseInt(str(job.leave_days), 10);
  if (floor === null || !Number.isFinite(days) || days <= 0 || days >= floor) return null;
  const place = (g?.place ?? "").split(",")[0] || "the place the employee works";
  return {
    field: "job",
    title: "Annual leave below the legal minimum",
    message: `${days} days is below the legal minimum in ${place} of ${floor} working days a year, on top of public holidays. The contract gives leave subject to applicable laws, so the employee is still entitled to ${floor}; we recommend entering ${floor} or more.`,
  };
}

/** Every answer that does not comply — for the flags beside the letter. */
export function issuesFor(g: LawGuide | null, a: Answers, job: Job): Issue[] {
  const out: Issue[] = [];
  for (const id of ["E3c", "E6a", "E10a", "E10b"]) {
    const i = issueFor(g, id, a[id]);
    if (i) out.push(i);
  }
  const leave = leaveIssue(g, job);
  if (leave) out.push(leave);
  if (g?.rules.work_pass)
    out.push({ field: "E1c", title: "Work pass or visa", message: `A national of ${g.nationality} working in ${countryOf(g.place) || g.place} usually needs a work pass or visa. Confirm it before the start date and consider making the offer conditional on it.` });
  return out;
}

/** The list of countries for the nationality question: the jurisdiction
 *  list's countries, without its states and parts. */
export function countriesFrom(options: string[]): string[] {
  const seen = new Set<string>();
  for (const o of options) {
    const c = o.split("›")[0].trim();
    if (c) seen.add(c);
  }
  return [...seen].sort((x, y) => x.localeCompare(y, "en-GB"));
}
