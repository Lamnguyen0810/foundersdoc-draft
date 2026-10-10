/**
 * What the back end can spot by rule, before the AI is asked anything. The
 * AI then looks for the jurisdiction-specific points only a reader of the
 * local law can see (ai.ts), and the assembler adds its own (assemble.ts:
 * the non-compete and California rules, which change the wording).
 *
 * Every flag is for the lawyer who reviews the contract before it is signed
 * — the person's own — and is listed beside the letter, never written in it.
 */

import { lawName } from "./assemble";
import { GDPR, builtInGuide, issuesFor, type LawGuide } from "./guide";
import { leaveFloor } from "./minimums";
import { applyDefaults, countryOf, problemWith, questionsFor, workJurisdiction } from "./questions";
import type { Answers, Flag, Job } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");


/** A few words for each flag, for the list the user sees. */
export const FLAG_TITLES: Record<string, string> = {
  EM1: "Employer and employee in different places",
  EM2: "Statutory protections",
  EM3: "Non-compete left out",
  EM4: "California restrictions",
  EM5: "Arbitration of employment claims",
  EM6: "Consent for employee data",
  EM7: "Company owns all work",
  EM8: "Fixed-term rules",
  EM9: "Senior employee non-compete",
  EM10: "Custom dismissal reasons",
  EM11: "Annual leave below the legal minimum",
  EM12: "Restriction too wide to enforce",
  EM13: "Work pass or visa",
};

export function titleFor(f: Flag): string {
  if (f.title) return f.title;
  if (f.scenario === "AI") return "Drafted by FD AI";
  if (f.scenario === "LAW") return "Local law";
  return FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export interface RuleChecks {
  flags: Flag[];
}

/** `guide` is the overview the person saw (FD AI's, merged over the firm's
 *  table); without one the built-in guide is used. */
export function ruleChecks(answersIn: Answers, job: Job, guide?: LawGuide | null): RuleChecks {
  const a = applyDefaults(answersIn);
  const flags: Flag[] = [];
  const employerRaw = str(a.E1a);
  const workRaw = workJurisdiction(a);
  const employer = lawName(employerRaw);
  const work = lawName(workRaw);
  const workCountry = countryOf(workRaw);

  if (workRaw && employerRaw && workRaw !== employerRaw) {
    const sameCountry = countryOf(employerRaw) === workCountry;
    flags.push({
      level: "yellow",
      scenario: "EM1",
      reason: sameCountry
        ? `The employer is in ${employer} and the employee works in ${work}. The contract uses the law of ${work}, where the employee works; check that state or part's own employment rules (pay, leave, notice) are met.`
        : `The employer is based in ${employer} and the employee works in ${work}. ${work}'s employment law will usually protect the employee whatever the contract says, so the contract uses it. Check whether the employer needs a local entity, an employer of record, or registration for payroll tax and social security in ${work}. Permanent establishment: an employee working in ${work} for a company based elsewhere can make the company taxable in ${work} (a "permanent establishment"), with corporate tax, registration and filing duties there. Get tax advice before the start date.`,
      user_message: sameCountry ? undefined : `The employee works in a different country from the employer, so I’ve used the law of ${work}, where they work. This set-up is unusual: it can make the company taxable in ${work} (“permanent establishment” risk) and you may need a local entity or an employer of record. Check both with your lawyer and tax adviser before the start date.`,
      field: "E1b",
    });
  }

  if (str(a.E2) !== "senior") {
    flags.push({
      level: "yellow",
      scenario: "EM2",
      reason: `The employee is treated as protected: minimum notice, leave, sick pay and dismissal protection under ${work || "local"} law apply whatever the contract says. Check the notice period, probation and leave in Table A meet the statutory minimums.`,
      field: "E2",
    });
  } else if (list(a.E6a).includes("compete") && !/\bcalifornia\b/i.test(workRaw)) {
    flags.push({
      level: "yellow",
      scenario: "EM9",
      reason: `A post-employment non-compete is included for a senior employee. How far it can be enforced varies greatly: some places require it to be paid for, some cap its length, and some do not enforce it at all. Check it is reasonable under ${work || "the governing"} law.`,
      field: "E6a",
    });
  }

  if (str(a.E10b) === "arbitration") {
    flags.push({
      level: "yellow",
      scenario: "EM5",
      reason: (guide ?? builtInGuide(a)).rules.arbitration === "limited"
        ? `Disputes go to arbitration, although in ${work} statutory employment claims (unfair dismissal, discrimination, unpaid wages) cannot be sent to arbitration. The clause applies only to the extent permitted by applicable law and keeps those claims open; local courts are the usual choice. Check the person wants to keep it.`
        : "Disputes go to arbitration. Many places do not let an employee's statutory claims (unfair dismissal, discrimination, unpaid wages) be sent to arbitration; the clause applies only to the extent permitted by applicable law and keeps those claims open, but check it is valid locally.",
      field: "E10b",
    });
  }

  if (str(a.E10a) !== "leave_out" && (GDPR.has(workCountry) || GDPR.has(work))) {
    flags.push({
      level: "yellow",
      scenario: "EM6",
      reason: `Under the GDPR (or the UK GDPR) consent is rarely a valid basis for handling an employee's data, because of the imbalance of power. The privacy clause is written subject to applicable data protection laws; an employee privacy notice is needed as well.`,
      field: "E10a",
    });
  }

  if (str(a.E8a) === "all") {
    flags.push({
      level: "yellow",
      scenario: "EM7",
      reason: "The Company is to own everything the employee creates during the employment, not only work-related material. Several places limit this by law (for example California Labor Code section 2870); check it is enforceable.",
      field: "E8a",
    });
  }

  if (str(a.E3a) === "fixed") {
    flags.push({
      level: "yellow",
      scenario: "EM8",
      reason: "A fixed-term contract: some places limit how long, or how often, a fixed term can run before the employee is treated as permanent, or require a reason for it. Check the local rules.",
      field: "E3a",
    });
  }

  const floor = leaveFloor(workRaw);
  const leaveDays = Number.parseInt(str(job.leave_days), 10);
  if (floor !== null && Number.isFinite(leaveDays) && leaveDays > 0 && leaveDays < floor) {
    flags.push({
      level: "yellow",
      scenario: "EM11",
      reason: `Table A gives ${leaveDays} days' annual leave, below the legal minimum in ${work} of ${floor} working days a year (on top of public holidays). The contract gives leave "or such greater entitlement as applicable law requires", so the statutory minimum applies anyway; better to change the figure to ${floor} or more before this goes out.`,
      field: "job",
    });
  }

  /* What the law guide found that the rules above have not already said. */
  const covered = new Set(flags.map((f) => f.field));
  for (const i of issuesFor(guide ?? builtInGuide(a), a, job)) {
    if (covered.has(i.field)) continue;
    if (i.field === "E6a" && /\bcalifornia\b/i.test(workRaw)) continue; /* the assembler handles California */
    flags.push({ level: "yellow", scenario: i.field === "E1c" ? "EM13" : "LAW", title: i.title, reason: i.message, field: i.field });
  }

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) {
      flags.push({ level: "red", scenario: "EM12", reason: `${q.text} \u2014 "${str(a[q.id])}". ${why}`, field: q.id });
    }
  }

  return { flags };
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}
