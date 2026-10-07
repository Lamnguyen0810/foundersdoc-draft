/**
 * Answers → contractor agreement.
 *
 * Deterministic, as the employment assembler is: the same answers give the
 * same letter, every time, from the firm's master (data/master.ts), with
 * nothing invented. No model is called: the contractor agreement is pure
 * assembly plus the rules in checks.ts.
 *
 * Two switches decide what goes in:
 *   the version   Basic / Standard / Complex (C0) — the Master Menu's three
 *                 columns; a clause is in when its tier is at or below it
 *   the answers   each question switches or fills the clause it belongs to
 *
 * What comes out:
 *   blocks    the letter, as the document editor draws it
 *   missing   fields nothing could fill — shown as [●] and reported
 *   flags     what a lawyer should look at
 *   included  the clause ids that went in (for tests and the admin view)
 */

import type { Block } from "../contract/parse";
import { ARBITRATION, REGISTRATION_LABEL, THIRD_PARTY_RIGHTS_STATUTE } from "../termsheet/data/map";
import { formatDate, joinAnd, normaliseMoney, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import {
  ACCEPTANCE, ACCEPTANCE_SIGN, AGREED, ARBITRATION_TEXT, CLOSING, CONFIDENTIALITY_PERIOD, COURTS_TEXT, HEADER,
  IP_LICENCE_TEXT, NON_EXCLUSIVE_TEXT, NO_NOTICE_TEXT, PAY_IN_LIEU_TAIL, SECTIONS, TERM_TEXT, TIERS,
  type MasterClause, type MasterSub, type Tier,
} from "./data/master";
import { applyDefaults, countryOf, lawJurisdiction, partOf, workJurisdiction } from "./questions";
import type { Answers, ContractorInput, Engagement, Flag } from "./types";

export interface Assembled {
  blocks: Block[];
  missing: string[];
  flags: Flag[];
  fields: Record<string, string>;
  included: string[];
  tier: Tier;
}

const GAP = "[●]";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** "thirty (30) days'" — the possessive the master uses before "notice". */
function daysPossessive(n: number): string {
  return `${numberWords(n)} (${n}) days'`;
}

/** "six (6) months". */
function months(n: number): string {
  return `${numberWords(n)} (${n}) month${n === 1 ? "" : "s"}`;
}

/** The version chosen, clamped to one that exists. */
export function tierOf(a: Answers): Tier {
  const v = str(a.C0);
  return (TIERS as string[]).includes(v) ? (v as Tier) : "standard";
}

/** True when a clause of this tier is in the chosen version. */
export function inTier(clause: Tier, chosen: Tier): boolean {
  return TIERS.indexOf(clause) <= TIERS.indexOf(chosen);
}

/** Fields that are meant to be empty sometimes. */
const MAY_BE_EMPTY = new Set<string>(["pay_in_lieu", "benefits_sentence", "confidentiality_period"]);

/** Fill {{fields}}; anything unknown becomes a gap and is reported. */
function fill(text: string, f: Record<string, string>, missing: Set<string>): string {
  return text.replace(/\{\{([\w:]+)\}\}/g, (_, k: string) => {
    const v = f[k];
    if (v === "" && MAY_BE_EMPTY.has(k)) return "";
    if (v === undefined || v === "") {
      missing.add(k);
      return GAP;
    }
    return v;
  });
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** Re-letter a run of items after some were dropped, and put the joining
 *  word ("; and" / "; or") before the last one. Unnumbered lines keep their
 *  place. */
function relist(items: MasterSub[], conj: "and" | "or"): MasterSub[] {
  const numbered = items.filter((s) => s.ref);
  if (numbered.length === 0) return items;
  const roman = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$/.test(numbered[0].ref ?? "");
  const letters = /^\([a-z]\)$/.test(numbered[0].ref ?? "") && !roman;
  const capital = /^\([A-Z]\)$/.test(numbered[0].ref ?? "");
  let i = 0;
  return items.map((s) => {
    if (!s.ref) return s;
    const last = i === numbered.length - 1;
    const penult = i === numbered.length - 2;
    let text = s.text.replace(/\s*(;\s*(and\/or|and|or)|;|,)\s*$/, "");
    const endsWithPeriod = /\.$/.test(text);
    if (last) text = endsWithPeriod ? text : `${text}${/,$/.test(s.text.trim()) ? "," : "."}`;
    else if (penult) text += `; ${conj}`;
    else text += ";";
    const ref = roman ? `(${ROMAN[i]})` : capital ? `(${String.fromCharCode(65 + i)})` : letters ? `(${String.fromCharCode(97 + i)})` : s.ref;
    i += 1;
    return { ...s, ref, text };
  });
}

/**
 * A jurisdiction as a contract names it: "England and Wales" (a part of the
 * United Kingdom is a legal system of its own), "California, United States",
 * "Singapore".
 */
export function lawName(j: string): string {
  const part = partOf(j);
  const country = countryOf(j);
  if (!part) return "";
  if (country === "United Kingdom" && part !== country) return part;
  return j;
}

/** The fee, the way each basis reads in the head and in 3.1. */
function feeWords(e: Engagement): { basis: string; period: string; payable: string } {
  const terms = str(e.payment_terms);
  switch (e.fee_basis) {
    case "hour":
      return { basis: "per hour", period: "for each hour of the Services performed during the Term", payable: terms ? `monthly in arrears against your invoice, ${terms}` : "monthly in arrears against your invoice" };
    case "day":
      return { basis: "per day", period: "for each day of the Services performed during the Term", payable: terms ? `monthly in arrears against your invoice, ${terms}` : "monthly in arrears against your invoice" };
    case "project":
      return { basis: "for the Services", period: "for the completion of the Services", payable: terms || "on completion of the Services against your invoice" };
    case "milestone":
      return { basis: "in instalments, by milestone", period: "in instalments on the completion of each milestone of the Services", payable: terms || "on the completion of each milestone against your invoice" };
    default:
      return { basis: "per month", period: "for each month during the Term", payable: terms ? `at the end of each month, ${terms}` : "at the end of each month" };
  }
}

/** 1.1A: the schedule and the place, in one phrase, or nothing. */
function performancePhrase(e: Engagement): string {
  const when = str(e.schedule);
  const where = str(e.location);
  const parts: string[] = [];
  if (when) parts.push(/^(flexible|flexibly|at your discretion|own hours)$/i.test(when) ? "at such times as you consider appropriate" : `on the following basis: ${when.replace(/\.$/, "")}`);
  if (where) parts.push(/^(remote|remotely|anywhere|own premises|from home)$/i.test(where) ? "from such location as you consider appropriate" : `at ${where.replace(/\.$/, "")}`);
  return parts.join(" and ");
}

export function assemble(input: ContractorInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const { company, contractor, engagement } = input;
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();
  const tier = tierOf(a);

  const lawRaw = lawJurisdiction(a);
  const workRaw = workJurisdiction(a);
  const law = lawName(lawRaw);
  const lawPart = partOf(lawRaw);
  const lawCountry = countryOf(lawRaw);
  const crossBorder = Boolean(workRaw) && countryOf(workRaw) !== lawCountry;

  /* ── the choices ────────────────────────────────────────────────────── */
  const isCompany = str(a.C2) === "company";
  const exclusive = str(a.C4) === "exclusive";
  const represent = str(a.C5) !== "no";
  const reimburse = str(a.C6) === "company";
  const assignIp = str(a.C7) !== "retain";
  const termKind = (["until_complete", "fixed", "until_terminated"] as const).find((k) => k === str(a.C8a)) ?? "until_terminated";
  const ending = str(a.C9a) || "notice";
  const noticeDays = Number(str(a.C9b) || "30");
  const grounds = list(a.C10);
  const remedies = list(a.C11);
  const continuing = list(a.C12);
  const restrictions = str(a.C13a) === "yes";
  const restrictedMonths = Number(str(a.C13b) || "6");
  const probation = str(a.C14) === "yes";
  const confidentiality = str(a.C15) || "forever";
  const dataClause = str(a.C16) !== "no";

  /* ── the fields ─────────────────────────────────────────────────────── */
  const money = normaliseMoney(str(engagement.fee));
  const start = parseDate(str(engagement.start_date));
  const end = parseDate(str(a.C8b));
  const fee = feeWords(engagement);
  const arb = ARBITRATION[lawPart] ?? ARBITRATION[lawCountry] ?? ARBITRATION.default;
  const statute = THIRD_PARTY_RIGHTS_STATUTE[lawPart] ?? THIRD_PARTY_RIGHTS_STATUTE[lawCountry];
  const benefits = str(engagement.benefits);
  const performance = performancePhrase(engagement);
  const contractorSignatory = str(contractor.signatory_name);

  const f: Record<string, string> = {
    date: formatDate(today),
    contractor_name: str(contractor.name),
    contractor_salutation: isCompany && contractorSignatory ? contractorSignatory : str(contractor.name),
    contractor_address: str(contractor.address).replace(/\s*\n\s*/g, ", "),
    contractor_id_label: isCompany ? "Registration No." : "Passport No.",
    contractor_id_no: isCompany ? str(contractor.reg_no) : str(contractor.id_no),
    contractor_email: str(contractor.email),
    acceptor: isCompany
      ? `${contractorSignatory || GAP}, for and on behalf of ${str(contractor.name) || GAP} (Registration No. ${str(contractor.reg_no) || GAP})`
      : `${str(contractor.name) || GAP}, of Passport No. ${str(contractor.id_no) || GAP}`,
    acceptor_name: isCompany ? contractorSignatory : str(contractor.name),
    company_name: str(company.name),
    COMPANY_NAME: str(company.name).toUpperCase(),
    registration_label: REGISTRATION_LABEL[lawPart] ?? REGISTRATION_LABEL[lawCountry] ?? REGISTRATION_LABEL.default,
    company_reg_no: str(company.reg_no),
    company_jurisdiction: law,
    signatory_name: str(company.signatory_name),
    signatory_designation: str(company.signatory_designation),
    signatory_email: str(company.signatory_email),
    law,
    law_country: lawCountry,
    governing_law: law,
    services: str(engagement.services).replace(/\s*\n\s*/g, " ").replace(/\.$/, ""),
    fee: money ? money.text : str(engagement.fee),
    fee_basis: fee.basis,
    fee_period: fee.period,
    fee_payable: fee.payable,
    currency: money?.currency ?? "",
    benefits_sentence: benefits && !/^(none|no|n\/a|-)$/i.test(benefits) ? ` In addition, you shall be entitled to ${benefits.replace(/\.$/, "")}.` : "",
    performance,
    commencement_date: start ? formatDate(start) : "",
    end_date: end ? formatDate(end) : "",
    notice_period: daysPossessive(noticeDays),
    pay_in_lieu: ending === "pay_in_lieu" ? PAY_IN_LIEU_TAIL.replace("{{notice_period}}", daysPossessive(noticeDays)) : "",
    restricted_months: months(restrictedMonths),
    restricted_territory: str(a.C13c),
    confidentiality_period: (CONFIDENTIALITY_PERIOD[confidentiality] ?? CONFIDENTIALITY_PERIOD.forever).text,
    third_party_statute: statute ?? `the applicable contracts (rights of third parties) legislation of ${law || GAP}`,
    arbitral_institution: arb.institution,
    arbitral_short: arb.institution.replace(/^the\s+/i, "").split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join(""),
    arbitration_seat: arb.seat.replace(/\{\{governing_law\}\}/g, law || GAP),
  };
  if (!f.contractor_address) missing.add("contractor_address");
  if (crossBorder && arb.review && law) {
    flags.push({ level: "yellow", scenario: "CT12", title: "Arbitration seat", reason: `No arbitration centre is set for ${law}, so the ICC is used with the seat in ${law}; confirm the institution and name a city.`, field: "C1a" });
  }

  /* ── which clauses, and in what words ───────────────────────────────── */
  const drop = new Set<string>();
  const dropSub = new Set<string>();
  const replace: Record<string, string> = {};

  if (!performance) drop.add("performance");
  if (!exclusive) replace.exclusivity = NON_EXCLUSIVE_TEXT;
  if (!represent) drop.add("representation");
  if (!reimburse) dropSub.add("expenses_reimbursed");
  if (!f.currency) drop.add("bank_account");
  if (!assignIp) {
    replace.ip_ownership = IP_LICENCE_TEXT;
    drop.add("ip_assignment");
    drop.add("ip_obligations");
    drop.add("moral_rights");
  }
  replace.term = TERM_TEXT[termKind].text;
  if (!probation) drop.add("initial_period");
  if (ending === "none") replace.termination = NO_NOTICE_TEXT;
  const GROUND_SUBS: Record<string, string[]> = {
    serious_breach: ["br_serious_breach"],
    misconduct: ["br_misconduct", "br_neglect"],
    incapacity: ["br_incapacity"],
    criminal: ["br_criminal"],
    assignment: ["br_assignment"],
    confidentiality: ["br_confidentiality"],
    insolvency: ["br_insolvency"],
  };
  for (const [g, ids] of Object.entries(GROUND_SUBS)) if (!grounds.includes(g)) ids.forEach((id) => dropSub.add(id));
  const REMEDY_SUBS: Record<string, string> = { terminate: "rm_terminate", damages: "rm_damages", replace: "rm_replace" };
  for (const [r, id] of Object.entries(REMEDY_SUBS)) if (!remedies.includes(r)) dropSub.add(id);
  if (grounds.length === 0 || remedies.length === 0) drop.add("breach");
  if (!continuing.includes("no_data")) dropSub.add("co_no_data");
  if (!continuing.includes("no_disparagement")) dropSub.add("co_no_disparagement");
  if (continuing.length === 0) drop.add("continuing_obligations");
  if (!restrictions) drop.add("restrictive_covenants");
  if (confidentiality === "none") drop.add("confidentiality");
  if (!dataClause) drop.add("data_protection");

  /* ── the sections, numbered ─────────────────────────────────────────── */
  type Built = { id: string; heading: string; clauses: MasterClause[] };
  const built: Built[] = [];
  for (const sec of SECTIONS) {
    const clauses = sec.clauses.filter((c) => inTier(c.tier, tier) && !drop.has(c.id));
    if (clauses.length === 0) continue;
    built.push({ id: sec.id, heading: sec.heading, clauses });
  }
  const clauseNo: Record<string, string> = {};
  built.forEach((s, i) => s.clauses.forEach((c, k) => (clauseNo[c.id] = `${i + 1}.${k + 1}`)));
  for (const [id, n] of Object.entries(clauseNo)) f[`clause:${id}`] = `Clause ${n}`;

  /* 5.2 "Subject to Clauses 5.1 (Term) and 5.3 (Breach of Agreement)": only
     the clauses that are in. */
  const subjectTo = [clauseNo.term ? `${clauseNo.term} (Term)` : "", clauseNo.breach ? `${clauseNo.breach} (Breach of Agreement)` : ""].filter(Boolean);
  f.termination_subject =
    subjectTo.length === 2 ? `Clauses ${subjectTo[0]} and ${subjectTo[1]}` : subjectTo.length === 1 ? `Clause ${subjectTo[0]}` : "the other provisions of this Agreement";

  /* 8.13: the courts at home, arbitration across a border. */
  f.dispute_resolution = fill(crossBorder ? ARBITRATION_TEXT : COURTS_TEXT, f, missing);

  /* ── the blocks ─────────────────────────────────────────────────────── */
  const blocks: Block[] = [];
  const plain = (text: string, cont = false) => blocks.push({ kind: "plain", num: "", text, ...(cont ? { cont: true } : {}) });

  for (const line of HEADER) plain(fill(line, f, missing));
  plain(AGREED);

  const included: string[] = [];
  const emit = (s: MasterSub, level: 1 | 2 | 3) => {
    if (s.ref) blocks.push({ kind: "subclause", num: s.ref, text: fill(s.text, f, missing), level });
    else plain(fill(s.text, f, missing), true);
    for (const t of s.subs ?? []) emit(t, Math.min(3, level + 1) as 1 | 2 | 3);
  };

  built.forEach((sec, si) => {
    blocks.push({ kind: "section", num: "", text: `${si + 1}. ${sec.heading}` });
    sec.clauses.forEach((c, ci) => {
      included.push(c.id);
      const text = replace[c.id] ?? c.text;
      let subs: MasterSub[] = (c.subs ?? []).filter((s) => !(s.id && dropSub.has(s.id)));
      if (c.id === "obligations") subs = relist(subs, "and");
      if (c.id === "continuing_obligations") subs = relist(subs, "and");
      if (c.id === "breach") {
        const cut = subs.findIndex((s) => !s.ref);
        const groundsSubs = relist(subs.slice(0, cut), "or");
        const remedySubs = relist(subs.slice(cut + 1), "and");
        subs = [...groundsSubs, subs[cut], ...remedySubs];
      }
      blocks.push({ kind: "clause", num: `${si + 1}.${ci + 1}`, text: fill(text, f, missing) });
      for (const s of subs) emit(s, 1);
    });
  });

  for (const line of CLOSING) plain(fill(line, f, missing));
  for (const line of ACCEPTANCE) plain(fill(line, f, missing));
  for (const line of ACCEPTANCE_SIGN) plain(fill(line, f, missing));

  /* The supplementary wording that went in, for the lawyer. */
  const fdIn = built.flatMap((s) => s.clauses).filter((c) => c.fd || (replace[c.id] && c.id !== "term") || (c.id === "term" && TERM_TEXT[termKind].fd));
  const fdPeriod = CONFIDENTIALITY_PERIOD[confidentiality]?.fd && clauseNo.confidentiality;
  if (fdIn.length || fdPeriod || (clauseNo.dispute_resolution && !crossBorder)) {
    const names = [
      ...fdIn.map((c) => `${f[`clause:${c.id}`]} (${c.id === "exclusivity" ? "Non-Exclusivity" : c.id === "ip_ownership" ? "Licence of IP" : c.id === "termination" ? "Termination without notice" : c.title})`),
      ...(fdPeriod ? [`${f["clause:confidentiality"]} (Confidentiality period)`] : []),
      ...(clauseNo.dispute_resolution && !crossBorder ? [`${f["clause:dispute_resolution"]} (Courts, not arbitration)`] : []),
    ];
    flags.push({
      level: "green",
      scenario: "FD",
      title: "FD supplementary wording",
      reason: `Wording not in the master, written in its style for the answers given: ${joinAnd(names)}. For FD review.`,
    });
  }

  return { blocks, missing: Array.from(missing), flags, fields: f, included, tier };
}
