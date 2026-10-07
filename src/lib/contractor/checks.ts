/**
 * What the back end can spot by rule, before any master is read. Every flag
 * is for the lawyer who reviews the agreement before it is signed — the
 * person's own — and is listed beside the draft, never written in it.
 *
 * The big one for a contractor is the one employment law cares about most:
 * is this person really a contractor, or an employee in all but name? The
 * answers that point the wrong way (exclusive, fixed hours, fixed place,
 * probation, benefits) are each flagged, and together flagged red.
 */

import { applyDefaults, countryOf, lawJurisdiction, partOf, problemWith, questionsFor, workJurisdiction } from "./questions";
import type { Answers, Engagement, Flag } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);

/** Where the GDPR (or the UK's version of it) applies. */
const GDPR = new Set([
  "United Kingdom", "England and Wales", "Scotland", "Northern Ireland", "Ireland", "Germany", "France", "Netherlands", "Belgium",
  "Luxembourg", "Spain", "Portugal", "Italy", "Austria", "Denmark", "Sweden", "Finland", "Poland", "Czech Republic", "Greece",
  "Romania", "Hungary", "Estonia", "Latvia", "Lithuania", "Slovakia", "Slovenia", "Croatia", "Bulgaria", "Cyprus", "Malta",
  "Norway", "Iceland", "Liechtenstein",
]);

/** "England and Wales, United Kingdom" → "England and Wales"; otherwise the whole answer. */
export function lawName(j: string): string {
  const part = partOf(j);
  const country = countryOf(j);
  if (!part) return "";
  if (country === "United Kingdom" && part !== country) return part;
  return j;
}

/** A few words for each flag, for the list the user sees. */
export const FLAG_TITLES: Record<string, string> = {
  CT1: "Company and Contractor in different places",
  CT2: "Looks like employment, not contracting",
  CT3: "Exclusive contractor",
  CT4: "Probation for a contractor",
  CT5: "Restrictions after the engagement",
  CT6: "Consent for the Contractor's data",
  CT7: "Contractor is a company",
  CT8: "No confidentiality",
  CT9: "No notice either way",
  CT10: "Restriction too wide to enforce",
  CT11: "Master agreement pending",
  CT12: "Arbitration seat",
  FD: "FD supplementary wording",
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

export function ruleChecks(answersIn: Answers, engagement: Engagement): RuleChecks {
  const a = applyDefaults(answersIn);
  const flags: Flag[] = [];
  const lawRaw = lawJurisdiction(a);
  const workRaw = workJurisdiction(a);
  const law = lawName(lawRaw);
  const work = lawName(workRaw);
  const workCountry = countryOf(workRaw);

  if (workRaw && lawRaw && workRaw !== lawRaw) {
    const sameCountry = countryOf(lawRaw) === workCountry;
    flags.push({
      level: "yellow",
      scenario: "CT1",
      reason: sameCountry
        ? `The Company is in ${law} and the Contractor in ${work}. The Agreement uses the law of ${law}; check ${work}'s own rules on contractors and withholding tax.`
        : `The Company is based in ${law} and the Contractor in ${work}. The Agreement uses the law of ${law}, but ${work}'s rules on who counts as an employee, on withholding tax and on work permits apply to the Contractor whatever it says. Permanent establishment: a contractor working in ${work} for a company based elsewhere can, in some cases, make the Company taxable there. Get tax advice before the start date.`,
      user_message: sameCountry
        ? undefined
        : `The Contractor is in a different country from the Company, so I’ve used the Company’s law (${law}). Worth checking with your lawyer and tax adviser how ${work} treats a contractor working there for a foreign company.`,
      field: "C1b",
    });
  }

  /* Employee in all but name? */
  const signs: string[] = [];
  if (str(a.C4) === "exclusive") signs.push("works only for the Company");
  if (str(a.C14) === "yes") signs.push("has a probation period");
  if (/\b(fixed|9|office hours|full[- ]time)\b/i.test(str(engagement.schedule))) signs.push("keeps fixed hours");
  if (str(engagement.location) && !/\b(remote|anywhere|own)\b/i.test(str(engagement.location))) signs.push("must work at the Company's premises");
  if (str(engagement.benefits) && !/^(none|no|n\/a|-)$/i.test(str(engagement.benefits))) signs.push("gets benefits beyond the fee");
  if (engagement.fee_basis === "month") signs.push("is paid a fixed monthly amount");
  if (signs.length >= 3) {
    flags.push({
      level: "red",
      scenario: "CT2",
      reason: `The Contractor ${signs.join(", ")}. Taken together these are the marks of an employee, whatever the Agreement is called. In ${work || "most places"} a court or tax authority looks at the reality, not the label: the Company could owe employee rights, contributions and back taxes. Reconsider the answers, or hire as an employee.`,
      user_message: `Several answers make this look like employment rather than contracting (the Contractor ${signs.slice(0, 3).join(", ")}). A court or tax office looks at the reality, not the label, so this needs a lawyer’s view before it is signed.`,
      field: "C4",
    });
  } else {
    if (str(a.C4) === "exclusive") {
      flags.push({
        level: "yellow",
        scenario: "CT3",
        reason: "An exclusive contractor is one step closer to an employee. Make sure the other marks of independence are real: own hours, own tools, paid for results, free to decline work.",
        field: "C4",
      });
    }
    if (str(a.C14) === "yes") {
      flags.push({
        level: "yellow",
        scenario: "CT4",
        reason: "Probation is an employment concept. For a contractor the same purpose is served by a short initial term with a short notice period; a 'probation' clause can be read as evidence of employment.",
        field: "C14",
      });
    }
  }

  if (str(a.C13a) === "yes") {
    flags.push({
      level: "yellow",
      scenario: "CT5",
      reason: `A non-compete and non-solicit after the engagement. Courts enforce these against contractors even less readily than against employees; they must protect a real interest and go no further than needed in time (${str(a.C13b) || "6"} months here), place and scope. Check under ${law || "the governing"} law.`,
      field: "C13a",
    });
  }

  if (str(a.C16) !== "no" && (GDPR.has(workCountry) || GDPR.has(work) || GDPR.has(countryOf(lawRaw)) || GDPR.has(law))) {
    flags.push({
      level: "yellow",
      scenario: "CT6",
      reason: "Under the GDPR (or the UK GDPR) consent is rarely the right basis for handling a contractor's personal data; performance of the contract and legal obligation usually are. The data clause should not rely on consent alone; a privacy notice is usually needed as well.",
      field: "C16",
    });
  }

  if (str(a.C2) === "company") {
    flags.push({
      level: "yellow",
      scenario: "CT7",
      reason: "The Contractor is a company. The obligations that only make sense for a person (confidentiality, IP, restrictions) should bind the individual who does the work as well, usually through a clause requiring the contractor company to procure it. Check the master covers this.",
      field: "C2",
    });
  }

  if (str(a.C15) === "none") {
    flags.push({
      level: "yellow",
      scenario: "CT8",
      reason: "No confidentiality obligation at all. Anything the Contractor learns about the business can be used or shared freely once the Agreement ends. Few companies mean this; check it is intended.",
      field: "C15",
    });
  } else if (str(a.C0) === "basic") {
    flags.push({
      level: "yellow",
      scenario: "CT8",
      reason: "The Basic version has no confidentiality clause (the Master Menu leaves it to Standard and Complex). If the Contractor will see anything confidential, choose Standard, or sign an NDA alongside.",
      user_message: "The Basic version has no confidentiality clause. If the Contractor will see anything confidential, choose Standard instead, or sign an NDA with them as well.",
      field: "C0",
    });
  }

  if (str(a.C9a) === "none") {
    flags.push({
      level: "yellow",
      scenario: "CT9",
      reason: "Either side can walk away at any moment with no notice and no payment. Fine for a very short engagement; for anything longer the Company may want notice from the Contractor at least.",
      field: "C9a",
    });
  }

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) {
      flags.push({ level: "red", scenario: "CT10", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
    }
  }

  return { flags };
}

export { list };
