/**
 * Answers → loan agreement.
 *
 * Deterministic, as the other assemblers are: the same answers give the
 * same agreement from the wording in data/master.ts, with nothing
 * invented. No model is called.
 *
 * The Founders Doc master is the base; the answers pick the other
 * versions of a clause drawn from the reference loan agreements (one or
 * several Lenders, an individual or company Borrower, a connected company,
 * the interest model, how it is repaid, how strictly defaults are treated,
 * security). See data/questionnaire.ts. The level of detail (LN0) decides
 * what is asked; the simple version also leaves out SIMPLE_LEAVES_OUT.
 */

import type { Block } from "../contract/parse";
import { formatDate, joinAnd, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import { formatAmount, parseAmount } from "./amount";
import {
  AGREED, BETWEEN, COSTS_SPLIT, DEFINITIONS, EXECUTED, INTERPRETATION, LENDERS_SCHEDULE, MADE_ON, PARTIES_COLLECTIVE, PARTY_COMPANY, PARTY_INDIVIDUAL,
  RECITAL, SECTIONS, TITLE, WHEREAS, type MasterClause, type MasterSub,
} from "./data/master";
import { applyDefaults, capCurrencyOf, levelOf, type Level } from "./questions";
import type { Answers, Flag, LoanInput, Party } from "./types";

export interface Assembled {
  blocks: Block[];
  missing: string[];
  flags: Flag[];
  fields: Record<string, string>;
  included: string[];
}

const GAP = "[●]";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ", ").trim();

/** Fields that are meant to be empty sometimes. */
const MAY_BE_EMPTY = new Set([
  "lenders_desc", "jointly", "lender_being", "or_company", "co_advisers", "lar_notices", "and_security_doc", "and_security_costs",
  "or_security_doc", "and_return_pledge", "or_security", "as_per_interest", "save_default", "and_interest", "each_share", "not_competitor",
  "each_of", "costs_split",
]);

/** "8,000" → 8000; anything that is not a plain number → NaN. For rates and
 *  months; money is read by parseAmount (lib/loan/amount.ts). */
export function num(raw: string): number {
  const s = String(raw ?? "").replace(/[,\s%]/g, "").replace(/^(S\$|US\$|SGD|USD|\$)/i, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** "12, 18, 24" → [12, 18, 24]. */
export function tiersOf(raw: string): number[] {
  return (raw.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).slice(0, 3);
}

export const TIER_SETS: Record<string, number[]> = { "20_25_30": [20, 25, 30], "10_15_20": [10, 15, 20], "5_8_10": [5, 8, 10] };

const count = (n: number) => (Number.isInteger(n) && n > 0 && n < 1000 ? `${numberWords(n)} (${n})` : String(n));
const months = (n: number) => (Number.isFinite(n) && n > 0 ? `${count(n)} month${n === 1 ? "" : "s"}` : GAP);

/** 20 → "twenty per cent. (20%)"; 8.5 → "8.5 per cent. (8.5%)". */
export function pct(n: number): string {
  if (!Number.isFinite(n)) return GAP;
  return Number.isInteger(n) && n > 0 && n < 100 ? `${numberWords(n)} per cent. (${n}%)` : `${n} per cent. (${n}%)`;
}

/** "Working capital." → "working capital", keeping an acronym or a name. */
function asPhrase(s: string): string {
  const t = s.trim().replace(/[.;\s]+$/, "");
  if (!t) return "";
  return /^[A-Z][a-z]/.test(t) && !/^[A-Z][a-z]+ [A-Z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A date typed in figures, written out (0240): "31/12/25" → "31 December
 *  2025". Day first, as in Singapore; anything that is not a real date is
 *  left exactly as typed. */
export function spellDates(s: string): string {
  return s.replace(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})\b/g, (all, d: string, m: string, y: string) => {
    const day = Number(d), month = Number(m);
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return all;
    return `${day} ${MONTHS[month - 1]} ${year}`;
  });
}

/** What the user typed, by the field it goes into, after FD AI has put it
 *  into contract wording (lib/loan/tidy.ts). Absent: used as typed. */
export type Tidied = Partial<Record<"purpose" | "security_desc" | "pledged_shares" | "financial_periods" | "next_round" | "drawdown_date", string>>;

/** What the simple version leaves out (LN0): the master's boilerplate that a
 *  short agreement between people who know each other can do without. */
export const SIMPLE_LEAVES_OUT = ["confidentiality", "announcements", "liability", "assurances"];

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** A list with items dropped, re-lettered, its "; and" / "." endings moved. */
function relist(items: MasterSub[], original: MasterSub[] = items): MasterSub[] {
  const numbered = items.filter((s) => s.ref);
  if (numbered.length === 0) return items;
  const roman = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$/.test(numbered[0].ref ?? "");
  const all = original.filter((s) => s.ref);
  const origLast = all[all.length - 1].text.trim();
  const end = /,$/.test(origLast) ? "," : /;$/.test(origLast) ? ";" : ".";
  const conj = numbered.map((s) => /;\s*(and|or)\s*$/.exec(s.text.trim())?.[1]).find(Boolean) ?? "and";
  let i = 0;
  return items.map((s) => {
    if (!s.ref) return s;
    /* A lead-in to its own sub-list keeps its colon. */
    if (/:\s*$/.test(s.text)) {
      const ref = roman ? `(${ROMAN[i]})` : `(${String.fromCharCode(97 + i)})`;
      i += 1;
      return { ...s, ref };
    }
    const last = i === numbered.length - 1;
    const penult = i === numbered.length - 2;
    let text = s.text.replace(/\s*(;\s*(and|or)|;|,|\.)\s*$/, "");
    if (last) text += end;
    else if (penult) text += `; ${conj}`;
    else text += ";";
    const ref = roman ? `(${ROMAN[i]})` : `(${String.fromCharCode(97 + i)})`;
    i += 1;
    return { ...s, ref, text };
  });
}

/** Everything the answers decide, read once — shared with the checks. */
export function readAnswers(a: Answers) {
  const level: Level = levelOf(a);
  const lenderSide = str(a.LN1) !== "borrower";
  const several = str(a.LN2) === "several";
  const borrowerCompany = str(a.LN3) === "company";
  const companyDef = !borrowerCompany && str(a.LN4) === "yes";
  const connected = borrowerCompany || companyDef;
  const usd = str(a.LN5) === "USD";
  const principal = parseAmount(str(a.LN6));
  const termMonths = str(a.LN9) === "other" ? num(str(a.LN9a)) : num(str(a.LN9) || "12");
  const repay = str(a.LN10) || (lenderSide ? "maturity" : "demand");
  /* A draft saved before 0240 has LN12 (the usual answer was tiered then). */
  const model = str(a.LN12) || "annual";
  const tiers = model === "tiered" ? (str(a.LN12a) === "other" ? tiersOf(str(a.LN12b)) : TIER_SETS[str(a.LN12a) || "20_25_30"] ?? [20, 25, 30]) : [];
  const rate = model === "annual" ? num(str(a.LN12c)) : NaN;
  const flat = model === "flat" ? num(str(a.LN12e)) : NaN;
  const margin = model === "floating" ? num(str(a.LN12f)) : NaN;
  const defaultKind = model === "tiered" ? "tier" : str(a.LN13) || "none";
  const security = str(a.LN14) || "none";
  /* LN15: lenient (the master), balanced (the reference list, with grace for a
     technical error) or strict (no grace, and a material adverse change). */
  const defaults = str(a.LN15) === "strict" ? "strict" : str(a.LN15) === "balanced" ? "balanced" : "lenient";
  const strict = defaults !== "lenient";
  const coc = connected && str(a.LN16) !== "no";
  const cocPct = str(a.LN16) === "yes50" ? 50 : 75;
  const early = str(a.LN11) === "consent" ? "consent" : str(a.LN11) === "fee" ? "fee" : "free";
  const earlyFee = early === "fee" ? num(str(a.LN11a)) : NaN;
  const comfort = connected && str(a.LN17) !== "no";
  return { level, lenderSide, several, borrowerCompany, companyDef, connected, usd, principal, termMonths, repay, model, tiers, rate, flat, margin, defaultKind, security, defaults, strict, coc, cocPct, early, earlyFee, comfort };
}

export function assemble(input: LoanInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const { borrower, rep, company, bank } = input;
  const lenders = input.lenders.length ? input.lenders : [{ name: "", kind: "individual" } as Party];
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();
  const own: string[] = [];
  const fdUsed: string[] = [];

  const r = readAnswers(a);
  const { several, borrowerCompany, companyDef, connected, principal, termMonths, repay, model, tiers, security, strict, coc, comfort } = r;
  const cur = r.usd ? "US$" : "S$";
  const money = (n: number, sign = cur) => (Number.isFinite(n) ? `${sign}${formatAmount(n)}` : GAP);
  const tidy = input.tidy ?? {};
  /* What the user typed: FD AI's contract wording when there is one, else as typed (dates written out). */
  const typed = (k: keyof Tidied, raw: string) => str(tidy[k]) || spellDates(raw);
  const share = (p: number) => (Number.isFinite(principal) && Number.isFinite(p) ? money(Math.round(principal * p) / 100) : GAP);
  const allIndividual = lenders.every((l) => l.kind === "individual");
  const pledge = security === "pledge";
  const secured = security !== "none";
  const defaultInterest = model !== "tiered" && r.defaultKind !== "none";
  const assign = str(a.LN18) || (r.lenderSide ? "notice" : "consent");
  const costs = str(a.LN20) || "cap";
  const disputes = str(a.LN21) === "courts" ? "courts" : "siac";
  const earlyFree = r.early === "free";
  const purpose = asPhrase(typed("purpose", str(a.LN7)));
  if (purpose) own.push("the purpose");
  if (security === "other" && str(a.LN14a)) own.push("the security");
  if (pledge && str(a.LN14b)) own.push("the pledged shares");

  /* ── which version of each clause ──────────────────────────────────── */
  const keep = (when?: string): boolean => {
    switch (when) {
      case undefined: return true;
      case "several": return several;
      case "siac": return disputes === "siac";
      case "courts": return disputes === "courts";
      case "coc": return coc;
      case "company_def": return companyDef;
      case "comfort": return comfort;
      case "interest": return model !== "none";
      case "security": return secured;
      case "security_other": return security === "other";
      case "pledge": return pledge;
      case "purpose": return Boolean(purpose);
      case "conditions": return secured || borrowerCompany;
      case "borrower_company": return borrowerCompany;
      case "principal_first": return !r.lenderSide;
      case "interest_first": return r.lenderSide;
      case "assign_notice": return assign === "notice";
      case "assign_free": return assign === "free";
      case "assign_consent": return assign === "consent";
      case "assign_any": return assign !== "consent";
      case "tiered": return model === "tiered";
      case "floating": return model === "floating";
      case "annual": return model === "annual";
      case "flat": return model === "flat";
      case "interest_free": return model === "none";
      case "settle_end": return model === "tiered" || model === "flat" || (model === "annual" && str(a.LN12d) !== "quarterly" && repay !== "instalments");
      case "settle_quarterly": return model === "annual" && str(a.LN12d) === "quarterly" && repay !== "instalments";
      case "settle_instalments": return model === "annual" && repay === "instalments";
      case "settle_period": return model === "floating";
      case "default_interest": return defaultInterest;
      case "repay_demand": return repay === "demand";
      case "repay_maturity": return repay === "maturity";
      case "repay_instalments": return repay === "instalments";
      case "early_free": return earlyFree;
      case "early_fee": return r.early === "fee";
      case "early_consent": return r.early === "consent";
      case "repay_date": return r.early !== "consent" && (model === "tiered" || model === "annual" || model === "floating");
      case "lenient": return !strict;
      case "strict": return strict;
      case "grace_tech": return r.defaults === "balanced";
      case "no_grace": return r.defaults === "strict";
      case "mac": return r.defaults === "strict";
      case "co_any": return connected;
      case "announce_borrower": return !r.lenderSide;
      case "announce_mutual": return r.lenderSide;
      case "cap": return str(a.LN19) === "cap2x";
      case "costs_cap": return costs === "cap";
      case "costs_own": return costs === "own";
      case "costs_borrower": return costs === "borrower";
      default: return true;
    }
  };

  /* ── the fields ────────────────────────────────────────────────────── */
  if (!Number.isFinite(principal)) missing.add("principal amount");
  const co = borrowerCompany ? "the Borrower" : "the Company";
  const lar = several ? "the Lenders' Authorised Representative" : "the Lender";
  const theLenders = several ? "the Lenders" : "the Lender";
  const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const drawdown = str(a.LN8) || "days5";
  const drawdownDate = drawdown === "date" ? typed("drawdown_date", str(a.LN8a)) : "";
  if (drawdownDate) own.push("the drawdown date");

  const t = tiers.length === 3 ? tiers : [NaN, NaN, NaN];
  if (model === "tiered" && tiers.length !== 3) missing.add("interest tiers");
  if (model === "annual" && !Number.isFinite(r.rate)) missing.add("interest rate");
  if (model === "flat" && !Number.isFinite(r.flat)) missing.add("flat interest");
  if (model === "floating" && !Number.isFinite(r.margin)) missing.add("interest margin");
  if (r.early === "fee" && !Number.isFinite(r.earlyFee)) missing.add("early repayment fee");
  const defaultRate =
    r.defaultKind === "plus2" ? (model === "annual" && Number.isFinite(r.rate) ? r.rate + 2 : model === "annual" ? NaN : 2) : r.defaultKind === "fixed" ? num(str(a.LN13a)) : NaN;
  /* With a floating rate, "2% above the rate" follows the rate as it moves. */
  const floatingPlus2 = model === "floating" && r.defaultKind === "plus2";
  if (defaultInterest && !floatingPlus2 && !Number.isFinite(defaultRate)) missing.add("default interest rate");
  const capCur = capCurrencyOf(a) === "USD" ? "US$" : "S$";

  const freq = str(a.LN10a) === "quarterly" ? 3 : 1;
  const nInst = Number.isFinite(termMonths) && termMonths > 0 ? Math.max(1, Math.floor(termMonths / freq)) : NaN;
  const instAmount = Number.isFinite(principal) && Number.isFinite(nInst) ? money(Math.round((principal / nInst) * 100) / 100) : GAP;

  const coName = (p: Party) => {
    if (!str(p.name)) return GAP;
    return `${str(p.name)} (Registration Number ${str(p.id_no) || GAP}), a company incorporated in ${str(p.jurisdiction) || "Singapore"} with its registered office at ${oneLine(str(p.address)) || GAP}`;
  };
  if (companyDef && !str(company.name)) missing.add("the Company's name");

  const f: Record<string, string> = {
    date: formatDate(today),
    principal: money(principal),
    pay_order: model === "none" ? "first to any costs and expenses due under this Agreement, and thereafter to the Principal Amount" : r.lenderSide ? "first to any costs and expenses due under this Agreement, then to accrued Interest (if any), and thereafter to the Principal Amount" : "first to the Principal Amount, and thereafter to the accrued Interest (if any)",
    each_share: several ? ", each Lender advancing the amount set out against its name in Part 1 of Schedule 1" : "",
    cur,
    cur_name: r.usd ? "United States dollars" : "Singapore dollars",
    cur_country: r.usd ? "the United States of America" : "Singapore",
    bank: str(bank.bank) || GAP,
    account_name: str(bank.account_name) || GAP,
    account_no: str(bank.account_no) || GAP,
    swift: str(bank.swift) || GAP,
    bank_address: oneLine(str(bank.bank_address)) || GAP,
    company: coName(company),
    drawdown:
      drawdown === "signing"
        ? "the Effective Date"
        : drawdown === "date"
          ? drawdownDate || GAP
          : drawdown === "request"
            ? `the date falling five (5) Business Days after the date on which the Borrower gives ${lar} written notice asking for the Principal Amount to be advanced (such notice to be given no later than three (3) months after the Effective Date, failing which ${theLenders} shall no longer be obliged to advance it)`
            : "a date falling no later than five (5) Business Days after the Effective Date",
    term_words: months(termMonths),
    the_lenders: theLenders,
    The_lenders: cap1(theLenders),
    lar,
    Lar: cap1(lar),
    each_lender: several ? "each Lender" : "the Lender",
    Each_lender: several ? "Each Lender" : "The Lender",
    it_lender: several ? "it" : "the Lender",
    each_lender_obj: several ? "such Lender" : "the Lender",
    lender_poss: several ? "such Lender's" : "the Lender's",
    lenders_heading: several ? "Lenders'" : "Lender's",
    lenders_their: several ? "their" : "the Lender's",
    lenders_desc: allIndividual ? (several ? ", being individuals," : ", being an individual,") : "",
    lender_being: allIndividual ? ", being an individual," : "",
    have: several ? "have" : "has",
    agree: several ? "agree" : "agrees",
    reserve: several ? "reserve" : "reserves",
    are: several ? "are" : "is",
    co,
    not_competitor: connected ? ` (other than a person that carries on, or is an affiliate of a person that carries on, a business that competes with the principal business of ${co})` : "",
    co_poss: borrowerCompany ? "the Borrower's" : "the Company's",
    co_jurisdiction: (borrowerCompany ? str(borrower.jurisdiction) : str(company.jurisdiction)) || "Singapore",
    borrower_jurisdiction: str(borrower.jurisdiction) || "Singapore",
    reps_company_head: borrowerCompany ? "Financial Representations & Warranties" : "Company's Representations & Warranties",
    or_company: companyDef ? " or by the Company" : "",
    co_advisers: companyDef ? ", or of the Company and/or its officers in connection with any transaction relating to the Company and its subsidiaries" : "",
    financial_periods: typed("financial_periods", str(a.LN17a)).replace(/[.;\s]+$/, "") || GAP,
    next_round: typed("next_round", str(a.LN17b)).replace(/[.;\s]+$/, "") || "next",
    purpose,
    and_interest: model === "none" ? "" : " and the Interest accrued thereunder",
    t1_words: pct(t[0]), t2_words: pct(t[1]), t3_words: pct(t[2]),
    t1_amount: share(t[0]), t2_amount: share(t[1]), t3_amount: share(t[2]),
    rate_words: pct(r.rate),
    flat_words: pct(r.flat),
    flat_amount: share(r.flat),
    default_rate: floatingPlus2
      ? "the rate which is two per cent. (2%) per annum above the rate of Interest applying from time to time under {{clause:interest}} (Interest Rate)"
      : `the rate of ${pct(defaultRate)} per annum`,
    margin_words: pct(r.margin),
    benchmark: r.usd
      ? "the 3-month Term SOFR reference rate administered by CME Group Benchmark Administration Limited (or any person that takes over the administration of that rate)"
      : "the 3-month Compounded SORA (Singapore Overnight Rate Average) published by the Monetary Authority of Singapore (or any person that takes over the publication of that rate)",
    day_count: r.usd ? "360" : "365",
    early_fee_words: pct(r.earlyFee),
    coc_pct: pct(r.cocPct),
    coc_keep: r.cocPct === 50 ? "more than fifty per cent. (50%)" : "at least seventy-five per cent. (75%)",
    each_of: secured ? "each of " : "",
    any_security: secured ? "the Security Document" : "any security held for the Loan",
    save_default: defaultInterest ? ", save for default interest under {{clause:default_interest}} (Default Interest)" : "",
    as_per_interest: model === "tiered" ? " as determined in accordance with {{section:interest}} (Interest)" : "",
    instalment_count: Number.isFinite(nInst) ? count(nInst) : GAP,
    instalment_freq: freq === 3 ? "quarterly" : "monthly",
    instalment_first: freq === 3 ? "three (3) months" : "one (1) month",
    instalment_amount: instAmount,
    coc_when: repay === "demand" ? "in accordance with {{clause:repayment}} (Repayment)" : "within thirty (30) calendar days of such notice",
    or_security: secured ? " or the Security Document" : "",
    insolvency_steps: borrowerCompany ? "winding up, dissolution, judicial management or administration" : "bankruptcy",
    insolvency_officer: borrowerCompany ? "liquidator, judicial manager, receiver or similar officer" : "trustee in bankruptcy, receiver or similar officer",
    security_desc: asPhrase(typed("security_desc", str(a.LN14a))) || GAP,
    pledged_shares: asPhrase(typed("pledged_shares", str(a.LN14b))) || GAP,
    and_return_pledge: pledge ? ", and return the share certificate(s) and share transfer forms for the Pledged Shares" : "",
    lar_notices: several
      ? " Unless expressed to the contrary, a notice served on the Lenders' Authorised Representative shall be deemed a notice validly served on each of the Lenders, and a notice served by the Lenders' Authorised Representative shall be deemed a notice served on behalf of all the Lenders acting as a collective."
      : "",
    and_security_doc: secured ? " and the Security Document" : "",
    and_security_costs: secured ? " and the Security Document" : "",
    or_security_doc: secured ? " or the Security Document" : "",
    costs_cap: money(parseAmount(str(a.LN20a)), capCur),
    costs_cap_basis: str(a.LN20c) === "incl" ? "inclusive of goods and services tax and disbursements" : "exclusive of goods and services tax and disbursements",
    costs_split: several && costs === "cap" ? COSTS_SPLIT : "",
  };
  if (costs === "cap" && !Number.isFinite(parseAmount(str(a.LN20a)))) missing.add("legal costs cap");
  if (several && costs === "cap") fdUsed.push("costs (the Lenders' shares of the cap)");
  if (comfort && !str(a.LN17a)) missing.add("financial statements period");
  if (comfort && str(tidy.financial_periods)) own.push("the financial statements period");
  if (comfort && str(tidy.next_round)) own.push("the next round");

  /* ── which clauses ─────────────────────────────────────────────────── */
  const dropSub = new Set<string>();
  if (borrowerCompany) dropSub.add("c_incorporated");

  type Built = { id: string; heading: string; clauses: MasterClause[] };
  const built: Built[] = [];
  for (const sec of SECTIONS) {
    if (!keep(sec.when)) continue;
    const clauses = sec.clauses.filter((c) => keep(c.when) && !(r.level === "simple" && SIMPLE_LEAVES_OUT.includes(c.id)));
    if (clauses.length) built.push({ id: sec.id, heading: sec.heading, clauses });
    for (const c of clauses) {
      const name = c.text.match(/^\*\*(.+?)\.\*\*/)?.[1]?.toLowerCase() ?? c.id;
      if (c.fd) fdUsed.push(name);
      /* A new limb inside one of the master's clauses (0240) is listed too. */
      else if ((c.subs ?? []).some((x) => x.fd && keep(x.when))) fdUsed.push(`${name} (a new limb)`);
    }
  }
  const clauseNo: Record<string, string> = {};
  built.forEach((s, i) => {
    f[`section:${s.id}`] = `Clause ${i + 1}`;
    s.clauses.forEach((c, k) => (clauseNo[c.id] = `${i + 1}.${k + 1}`));
  });
  for (const [id, n] of Object.entries(clauseNo)) f[`clause:${id}`] = `Clause ${n}`;
  const assignId = ["assign_notice", "assign_free", "assign_consent"].find((id) => clauseNo[id]);
  if (assignId) f["clause:assign"] = `Clause ${clauseNo[assignId]}`;

  /* ── fill ──────────────────────────────────────────────────────────── */
  const fillOnce = (text: string, extra: Record<string, string> = {}) =>
    text.replace(/\{\{([\w:]+)\}\}/g, (_, k: string) => {
      const v = extra[k] ?? f[k];
      if (v === "" && MAY_BE_EMPTY.has(k)) return "";
      if (v === undefined || v === "") {
        if (k.startsWith("clause:") || k.startsWith("section:")) return "this Agreement";
        missing.add(k);
        return GAP;
      }
      return v;
    });
  const fill = (text: string, extra: Record<string, string> = {}) => {
    let out = fillOnce(text, extra);
    if (out.includes("{{")) out = fillOnce(out, extra);
    return out.replace(/\bClause (\d+(?:\.\d+)*) (and|or|to) Clause (\d+(?:\.\d+)*)/g, "Clauses $1 $2 $3");
  };

  /* ── the blocks ────────────────────────────────────────────────────── */
  const blocks: Block[] = [];
  const plain = (text: string, cont = false) => blocks.push({ kind: "plain", num: "", text, ...(cont ? { cont: true } : {}) });
  const sub = (n: string, text: string, level: 1 | 2 | 3 = 1) => blocks.push({ kind: "subclause", num: n, text, level });

  const partyText = (p: Party, label: string) => {
    const vals = {
      name: str(p.name) || GAP,
      id_no: str(p.id_no),
      nationality: str(p.nationality),
      jurisdiction: str(p.jurisdiction) || "Singapore",
      address: oneLine(str(p.address)),
    };
    if (!str(p.name)) missing.add(label.toLowerCase());
    return fill(p.kind === "individual" ? PARTY_INDIVIDUAL : PARTY_COMPANY, vals);
  };

  blocks.push({ kind: "title", num: "", text: TITLE });
  plain(fill(MADE_ON));
  plain(BETWEEN);
  blocks.push({ kind: "party", num: "(1)", text: `${partyText({ ...borrower, kind: borrowerCompany ? "company" : "individual" }, "Borrower")} (the "**Borrower**"); and` });
  if (several) blocks.push({ kind: "party", num: "(2)", text: `${LENDERS_SCHEDULE},` });
  else blocks.push({ kind: "party", num: "(2)", text: `${partyText(lenders[0], "Lender")} (the "**Lender**"),` });
  plain(PARTIES_COLLECTIVE);
  plain(`**${WHEREAS}**`);
  blocks.push({ kind: "recital", num: "(A)", text: fill(RECITAL) });
  plain(AGREED);

  const defs = DEFINITIONS.filter((d) => keep(d.when));
  const included: string[] = [];
  const prune = (list: MasterSub[]): MasterSub[] => {
    const kept = list.filter((s) => !(s.id && dropSub.has(s.id)) && keep(s.when));
    return kept.length === list.length ? kept : relist(kept, list);
  };
  const emit = (s: MasterSub, level: 1 | 2 | 3) => {
    const text = fill(s.text);
    if (s.ref) sub(s.ref, text, level);
    else if (text) plain(text, true);
    for (const x of prune(s.subs ?? [])) emit(x, Math.min(3, level + 1) as 1 | 2 | 3);
  };

  built.forEach((sec, si) => {
    blocks.push({ kind: "section", num: "", text: `${si + 1}. ${sec.heading}` });
    sec.clauses.forEach((c, ci) => {
      included.push(c.id);
      const n = `${si + 1}.${ci + 1}`;
      blocks.push({ kind: "clause", num: n, text: fill(c.text) });
      if (c.id === "definitions") {
        defs.forEach((d, i) => {
          const last = i === defs.length - 1;
          const penult = i === defs.length - 2;
          let text = fill(d.text).replace(/\s*(;\s*and|;|\.)\s*$/, "");
          text += last ? "." : penult ? "; and" : ";";
          plain(`"**${d.term}**" ${text}`, true);
        });
        return;
      }
      if (c.id === "interpretation") {
        INTERPRETATION.filter((x) => keep(x.when)).forEach((x, i) => sub(`(${String.fromCharCode(97 + i)})`, fill(x.text), 1));
        return;
      }
      for (const s of prune(c.subs ?? [])) emit(s, 1);
      if (c.tail) plain(fill(c.tail), true);
    });
  });

  /* ── signatures ────────────────────────────────────────────────────── */
  plain(EXECUTED);
  const line = "___________________________";
  const signFor = (p: Party, label: string, heading: string | null) => {
    const nm = str(p.name) || GAP;
    if (heading) plain(`**${heading}**`);
    if (p.kind === "individual") {
      blocks.push({ kind: "sign-head", num: "", text: `SIGNED by ${nm}` });
      for (const l of [line, `Name: ${nm}`, `Email: ${str(p.email) || GAP}`]) blocks.push({ kind: "sign", num: "", text: l });
    } else {
      blocks.push({ kind: "sign-head", num: "", text: `SIGNED by ${str(p.signatory_name) || GAP} for and on behalf of ${nm}` });
      for (const l of [line, `Name: ${str(p.signatory_name) || GAP}`, `Title: ${str(p.signatory_title) || GAP}`, `Email: ${str(p.email) || GAP}`])
        blocks.push({ kind: "sign", num: "", text: l });
    }
    if (!str(p.email)) missing.add(`${label}'s email`);
  };
  signFor({ ...borrower, kind: borrowerCompany ? "company" : "individual" }, "Borrower", "THE BORROWER");
  lenders.forEach((l, i) => signFor(l, several ? `Lender ${i + 1}` : "Lender", i === 0 ? (several ? "THE LENDERS" : "THE LENDER") : null));

  /* ── Schedule 1: the Lenders ───────────────────────────────────────── */
  if (several) {
    blocks.push({ kind: "section", num: "", text: "SCHEDULE 1" });
    plain("**PARTICULARS OF LENDERS**");
    plain("**Part 1 — The Lenders**");
    lenders.forEach((l, i) => {
      const nm = str(l.name) || GAP;
      const details =
        l.kind === "individual"
          ? `Citizenship: ${str(l.nationality) || GAP}; NRIC / Passport No.: ${str(l.id_no) || GAP}; Address: ${oneLine(str(l.address)) || GAP}; E-mail address: ${str(l.email) || GAP}`
          : `a company incorporated in ${str(l.jurisdiction) || "Singapore"} (Registration Number ${str(l.id_no) || GAP}); Registered office: ${oneLine(str(l.address)) || GAP}; E-mail address: ${str(l.email) || GAP}`;
      const amt = parseAmount(str(l.amount));
      blocks.push({ kind: "clause", num: `${i + 1}.`, text: `**${nm}** — ${details}; Amount advanced: ${Number.isFinite(amt) ? money(amt) : GAP}.` });
    });
    plain("**Part 2 — Lenders' Authorised Representative**");
    if (!str(rep.name)) missing.add("Lenders' Authorised Representative");
    blocks.push({
      kind: "clause",
      num: "",
      text: `**${str(rep.name) || GAP}** — Address: ${oneLine(str(rep.address)) || GAP}; E-mail address: ${str(rep.email) || GAP}.`,
    });
  }

  /* ── what the lawyer should know ───────────────────────────────────── */
  if (own.length) {
    const reworded = Object.values(tidy).some((v) => str(v));
    flags.push({
      level: "yellow",
      scenario: "LN21",
      title: "Your own wording",
      reason: reworded
        ? `What you typed has gone into the agreement, put into contract wording by FD AI: ${joinAnd(Array.from(new Set(own)))}. Check it still says what you meant, and have your lawyer check it.`
        : `Wording you typed has gone into the agreement as written: ${joinAnd(Array.from(new Set(own)))}. Have your lawyer check it.`,
    });
  }
  if (fdUsed.length) {
    flags.push({
      level: "green",
      scenario: "FD",
      title: "FD supplementary wording",
      reason: `Wording not in the master or the reference agreements, written in the master's style for the answers given: ${joinAnd(Array.from(new Set(fdUsed)))}. For FD review.`,
    });
  }

  return { blocks, missing: Array.from(missing), flags, fields: f, included };
}
