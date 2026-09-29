/**
 * Answers → employment agreement.
 *
 * Deterministic, as the term sheet's assembler is: the same answers give the
 * same letter, every time, from the firm's master (data/master.ts), with
 * nothing invented. The AI's only contribution is the custom dismissal
 * reasons in `ai`, and those are checked here before they are used.
 *
 * What comes out:
 *   blocks    the letter, as the document editor draws it
 *   missing   fields nothing could fill — shown as [●] and reported
 *   flags     what a lawyer should look at
 *   included  the clause ids that went in (for tests and the admin view)
 */

import type { Block } from "../contract/parse";
import { ARBITRATION, REGISTRATION_LABEL, THIRD_PARTY_RIGHTS_STATUTE } from "../termsheet/data/map";
import { numbersAreFromAnswers } from "../termsheet/assemble";
import { formatDate, joinAnd, normaliseMoney, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import {
  ACCEPTANCE, ACCEPTANCE_SIGN, AGREED, ARBITRATION_TEXT, CLOSING, CONFIDENTIALITY_PERIOD, FIXED_TERM_SENTENCE, HEADER,
  IP_SCOPE, PERMANENT_SENTENCE, SECTIONS, TABLE_A, TABLE_A_NOTE, TABLE_A_TITLE, TABLE_TEXT, type MasterClause, type MasterSub,
} from "./data/master";
import { applyDefaults, countryOf, partOf, workJurisdiction } from "./questions";
import type { AiFields, Answers, EmploymentInput, Flag } from "./types";

export interface Assembled {
  blocks: Block[];
  missing: string[];
  flags: Flag[];
  fields: Record<string, string>;
  included: string[];
  /** The dismissal reasons as they went in, custom list only. */
  dismissalGrounds: string[];
}

const GAP = "[●]";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "three (3) months", "one (1) week". */
function words(n: number, unit: string): string {
  return `${numberWords(n)} (${n}) ${unit}${n === 1 ? "" : "s"}`;
}

const PERIOD: Record<string, string> = {
  "1w": words(1, "week"),
  "1m": words(1, "month"),
  "3m": words(3, "month"),
  "6m": words(6, "month"),
};

export const STATUTORY_NOTICE = "the minimum period of notice required by the Employment Act";

/** Fields that are meant to be empty sometimes: " or salary in lieu …". */
const MAY_BE_EMPTY = new Set(["in_lieu"]);

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

/** Re-letter a list after items were dropped, and put the joining word
 *  ("; and" / "; or") before the last one. */
function relist(items: MasterSub[], conj: "and" | "or" | "and/or" | null): MasterSub[] {
  const numbered = items.filter((s) => s.ref);
  const tail = items.filter((s) => !s.ref);
  const roman = numbered.length > 0 && /^\((i|ii|iii|iv|v)\)$/.test(numbered[0].ref ?? "");
  const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
  const out = numbered.map((s, i) => {
    let text = s.text.replace(/\s*(;\s*(and\/or|and|or)|;|\.|,)\s*$/, "");
    const last = i === numbered.length - 1;
    if (conj === null) text = s.text;
    else if (last) text += tail.length ? (/[,;]$/.test(s.text.trim()) ? s.text.trim().slice(-1) : ",") : ".";
    else if (i === numbered.length - 2) text += `; ${conj}`;
    else text += ";";
    return { ...s, ref: `(${roman ? ROMAN[i] : String.fromCharCode(97 + i)})`, text };
  });
  return [...out, ...tail];
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

export function assemble(input: EmploymentInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const { employer, employee, job } = input;
  const ai: AiFields = input.ai ?? {};
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();

  const employerPlace = lawName(str(a.E1a));
  const law = lawName(workJurisdiction(a));
  const lawPart = partOf(law);
  const lawCountry = countryOf(law);
  const employerPart = partOf(employerPlace);
  const employerCountry = countryOf(employerPlace);

  /* ── the choices ────────────────────────────────────────────────────── */
  const protectedStaff = str(a.E2) !== "senior";
  const fixed = str(a.E3a) === "fixed";
  const probation = str(a.E3c) || "3m";
  let restrictions = list(a.E6a).filter((x) => x !== "none");
  const california = /\bcalifornia\b/i.test(law);
  if (california && restrictions.length) {
    flags.push({
      level: "yellow",
      scenario: "EM4",
      title: "California restrictions",
      reason: `California law (Business and Professions Code section 16600) makes post-employment non-competes, and in practice client and staff non-solicits, void for employees working there, so ${joinAnd(restrictions.map((r) => RESTRICTION_NAME[r]))} ${restrictions.length === 1 ? "was" : "were"} left out. Confidentiality and trade-secret protection stay in.`,
      user_message: "I left the after-leaving restrictions out: California does not enforce them against employees. Confidentiality still protects your trade secrets.",
      field: "E6a",
    });
    restrictions = [];
  }
  if (restrictions.includes("compete") && protectedStaff) {
    restrictions = restrictions.filter((r) => r !== "compete");
    flags.push({
      level: "green",
      scenario: "EM3",
      title: "Non-compete left out",
      reason: "The non-compete was left out because the employee is not a senior manager or executive; courts rarely enforce one against other staff.",
      user_message:
        restrictions.length > 0
          ? "I left the non-compete out: courts rarely enforce one against staff who aren’t senior managers. The no-poaching restrictions stay in."
          : "I left the non-compete out: courts rarely enforce one against staff who aren’t senior managers.",
      field: "E6a",
    });
  }
  const months = Number(str(a.E6b) || "6");

  /* ── the fields ─────────────────────────────────────────────────────── */
  const money = normaliseMoney(str(job.salary));
  const leaveDays = Number.parseInt(str(job.leave_days), 10);
  const start = parseDate(str(job.start_date));
  const end = parseDate(str(a.E3b));
  const arb = ARBITRATION[lawPart] ?? ARBITRATION[lawCountry] ?? ARBITRATION.default;
  const statute = THIRD_PARTY_RIGHTS_STATUTE[lawPart] ?? THIRD_PARTY_RIGHTS_STATUTE[lawCountry];

  const f: Record<string, string> = {
    date: formatDate(today),
    employee_name: str(employee.name),
    employee_address: str(employee.address).replace(/\s*\n\s*/g, ", "),
    employee_id_no: str(employee.id_no),
    employee_email: str(employee.email),
    company_name: str(employer.name),
    COMPANY_NAME: str(employer.name).toUpperCase(),
    registration_label: REGISTRATION_LABEL[employerPart] ?? REGISTRATION_LABEL[employerCountry] ?? REGISTRATION_LABEL.default,
    company_reg_no: str(employer.reg_no),
    company_jurisdiction: employerPlace,
    signatory_name: str(employer.signatory_name),
    signatory_designation: str(employer.signatory_designation),
    signatory_email: str(employer.signatory_email),
    law,
    governing_law: law,
    position: str(job.position),
    salary: money ? money.text : str(job.salary),
    salary_period: job.salary_period === "year" ? "year" : "month",
    pay_day: str(job.pay_day),
    work_location: str(job.work_location),
    commencement_date: start ? formatDate(start) : "",
    end_date: end ? formatDate(end) : "",
    probation_period: cap(PERIOD[probation] ?? ""),
    probation_notice:
      str(a.E3d) === "statutory" ? STATUTORY_NOTICE : str(a.E3d) === "same" ? "the same as the Termination Notice Period" : PERIOD["1w"],
    working_hours: str(job.working_hours),
    annual_leave: `${Number.isFinite(leaveDays) && leaveDays > 0 ? cap(`${numberWords(leaveDays)} (${leaveDays})`) : GAP} calendar days' annual leave for every twelve (12) months of continuous service for the Company`,
    restricted_months: words(months, "month"),
    notice_period: str(a.E4a) === "statutory" ? cap(STATUTORY_NOTICE) : cap(PERIOD[str(a.E4a)] ?? PERIOD["1m"]),
    in_lieu: str(a.E4b) === "not_allowed" ? "" : " or salary in lieu of the said notice",
    confidentiality_period: (CONFIDENTIALITY_PERIOD[str(a.E7)] ?? CONFIDENTIALITY_PERIOD.indefinite).text,
    ip_scope: (IP_SCOPE[str(a.E8a)] ?? IP_SCOPE.work_related).own,
    ip_assign_scope: (IP_SCOPE[str(a.E8a)] ?? IP_SCOPE.work_related).assign,
    contributions_heading: lawCountry === "Singapore" ? "CPF" : "Statutory Contributions",
    third_party_statute: statute ?? `the applicable contracts (rights of third parties) legislation of ${law || GAP}`,
    arbitral_institution: arb.institution,
    arbitration_seat: arb.seat.replace(/\{\{governing_law\}\}/g, law || GAP),
    industry: str(a.E6d),
    territory: str(a.E6c),
  };
  if (!f.employee_address) missing.add("employee_address");
  if (str(a.E10b) === "arbitration" && arb.review && law) {
    flags.push({ level: "yellow", scenario: "EM5", title: "Arbitration seat", reason: `No arbitration centre is set for ${law}, so the ICC is used with the seat in ${law}; confirm the institution and name a city.`, field: "E10b" });
  }

  /* ── which clauses, and in what words ───────────────────────────────── */
  const drop = new Set<string>();
  const dropSub = new Set<string>();
  const replace: Record<string, string> = {};
  const replaceSub: Record<string, string> = {};

  if (probation === "none") drop.add("probation");
  if (str(a.M1) !== "yes") drop.add("leaver");
  if (str(a.E5) === "no") drop.add("garden_leave");
  if (str(a.E8b) === "no") drop.add("moral_rights");
  if (str(a.M3) === "no") drop.add("variation");
  if (str(a.M2) === "yes") drop.add("third_parties");
  else drop.add("third_parties_group");

  /* Outside work (E9). */
  const outside = str(a.E9) || "shares";
  if (outside !== "shares") {
    replaceSub.competitor_shares = "acquire, own or retain any interest in any competitor of the Company and/or the Group.";
  }
  if (outside === "exclusive") {
    replaceSub.external_roles =
      "During the Term, your principal commitment shall be to the Company pursuant to this Agreement. You shall not undertake any other role, appointment and/or employment, including but not limited to the following:";
    replace.undertakings = "**Undertakings During Employment.** During the Term, you shall not at any time, directly or indirectly:";
  }

  /* After leaving (E6). */
  const conflictsIn = restrictions.length > 0;
  if (!conflictsIn) {
    for (const c of SECTIONS.find((s) => s.id === "conflicts")!.clauses) drop.add(c.id);
  } else {
    if (!restrictions.includes("staff")) {
      dropSub.add("no_poach_staff");
      dropSub.add("def_restricted_person");
    }
    if (!restrictions.includes("clients")) dropSub.add("no_poach_clients");
    if (!restrictions.includes("compete")) dropSub.add("no_compete");
  }

  /* Instant dismissal (E4c/E4d). */
  const custom = str(a.E4c) === "custom";
  let dismissalGrounds: string[] = [];
  if (custom) {
    const typed = list(a.E4d);
    const corpus = typed.join(" ");
    const fromAi = (ai.dismissal_grounds ?? []).map(str).filter(Boolean);
    const aiOk = fromAi.length === typed.length && fromAi.every((g) => numbersAreFromAnswers(g, corpus));
    if (fromAi.length && !aiOk) {
      flags.push({ level: "green", scenario: "AI", reason: "The reworded dismissal reasons did not match the list typed in, so your own words are used.", field: "E4d" });
    }
    dismissalGrounds = (aiOk ? fromAi : typed).map((g) => g.replace(/[.;,]+\s*$/, "").replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()));
    if (aiOk && fromAi.length) {
      flags.push({ level: "green", scenario: "AI", reason: "The custom reasons for instant dismissal were put into the contract's wording by the AI — please confirm them.", field: "E4d" });
    }
  }

  /* ── the sections, numbered ─────────────────────────────────────────── */
  type Built = { id: string; heading: string; clauses: MasterClause[] };
  const built: Built[] = [];
  for (const sec of SECTIONS) {
    if (sec.id === "privacy" && str(a.E10a) === "leave_out") continue;
    const clauses = sec.clauses.filter((c) => !drop.has(c.id));
    if (clauses.length === 0) continue;
    built.push({ id: sec.id, heading: sec.heading, clauses });
  }
  const secNo: Record<string, number> = {};
  const clauseNo: Record<string, string> = {};
  built.forEach((s, i) => {
    secNo[s.id] = i + 1;
    s.clauses.forEach((c, k) => (clauseNo[c.id] = `${i + 1}.${k + 1}`));
  });
  const secRef = (id: string, name: string) => (secNo[id] ? `Clause ${secNo[id]} (${name})` : "");
  f.breach_clauses = joinAnd([secRef("duties", "Employee Duties and Conduct"), secRef("confidentiality", "Confidentiality"), secRef("conflicts", "Conflicts of Interest")].filter(Boolean));
  f.leaver_breach = [secRef("confidentiality", "Confidentiality"), secRef("conflicts", "Conflicts of Interest")].filter(Boolean).join(" or ");
  f.group_clauses = joinAnd([secRef("confidentiality", "Confidentiality"), secRef("conflicts", "Conflicts of Interest"), secRef("ip", "Intellectual Property")].filter(Boolean));
  for (const [id, n] of Object.entries(clauseNo)) f[`clause:${id}`] = `Clause ${n}`;

  /* Table A, lettered after what is left out. */
  const rows = TABLE_A.filter((r) => {
    if (r.id === "fixed_term") return fixed;
    if (r.id === "restricted_period") return conflictsIn;
    return true;
  });
  rows.forEach((r, i) => (f[`item:${r.id}`] = `item (${String.fromCharCode(97 + i)})`));

  /* ── the blocks ─────────────────────────────────────────────────────── */
  const blocks: Block[] = [];
  const plain = (text: string, cont = false) => blocks.push({ kind: "plain", num: "", text, ...(cont ? { cont: true } : {}) });

  for (const line of HEADER) plain(fill(line, f, missing));

  plain(TABLE_A_TITLE);
  plain(TABLE_A_NOTE);
  rows.forEach((r, i) => {
    const key = r.id === "probation" && probation === "none" ? "probation_none" : r.id;
    const ref = clauseNo[r.clause] ? ` (Clause ${clauseNo[r.clause]})` : "";
    blocks.push({
      kind: "subclause",
      num: `(${String.fromCharCode(97 + i)})`,
      text: `**${r.item}:** ${fill(TABLE_TEXT[key], f, missing)}${ref}`,
      level: 1,
    });
  });
  plain(AGREED);

  const included: string[] = [];
  built.forEach((sec, si) => {
    blocks.push({ kind: "section", num: "", text: `${si + 1}. ${sec.heading}` });
    sec.clauses.forEach((c, ci) => {
      included.push(c.id);
      let text = c.text;
      if (c.id === "term") text = text.replace(PERMANENT_SENTENCE, fixed ? FIXED_TERM_SENTENCE : PERMANENT_SENTENCE);
      if (replace[c.id]) text = replace[c.id];

      let subs: MasterSub[] = (c.subs ?? []).filter((s) => !(s.id && dropSub.has(s.id))).map((s) => (s.id && replaceSub[s.id] ? { ...s, text: replaceSub[s.id] } : s));
      if (c.id === "summary_dismissal" && custom) {
        const atLaw = subs.find((s) => s.id === "sd_at_law")!;
        subs = [...dismissalGrounds.map((g) => ({ ref: "(x)", text: `${g};` })), atLaw];
      }
      if (c.id === "law_disputes" && str(a.E10b) === "arbitration") {
        subs = subs.map((s) => (s.id === "courts" ? { ...s, text: ARBITRATION_TEXT } : s));
      }
      if (["restrictive_covenants", "summary_dismissal", "rc_definitions", "undertakings"].includes(c.id)) {
        const conj = c.id === "summary_dismissal" ? "or" : c.id === "undertakings" ? "and/or" : "and";
        subs = relist(subs, conj);
      }

      blocks.push({ kind: "clause", num: `${si + 1}.${ci + 1}`, text: fill(text, f, missing) });
      for (const s of subs) {
        if (s.ref) blocks.push({ kind: "subclause", num: s.ref, text: fill(s.text, f, missing), level: 1 });
        else plain(fill(s.text, f, missing), true);
        for (const t of s.subs ?? []) blocks.push({ kind: "subclause", num: t.ref ?? "", text: fill(t.text, f, missing), level: 2 });
      }
    });
  });

  for (const line of CLOSING) plain(fill(line, f, missing));
  for (const line of ACCEPTANCE) plain(fill(line, f, missing));
  for (const line of ACCEPTANCE_SIGN) plain(fill(line, f, missing));

  return { blocks, missing: Array.from(missing), flags, fields: f, included, dismissalGrounds };
}

export const RESTRICTION_NAME: Record<string, string> = {
  compete: "the non-compete",
  clients: "the client non-solicit",
  staff: "the staff non-solicit",
};
