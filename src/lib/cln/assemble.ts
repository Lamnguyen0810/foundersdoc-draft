/**
 * Answers → convertible loan agreement.
 *
 * Deterministic, as the other assemblers are: the same answers give the
 * same agreement from the wording in data/master.ts, with nothing invented.
 * The master's square-bracketed choices are filled from the answers; its
 * Jurisdiction Rider fills the law-dependent entries (data/master.ts →
 * JURISDICTIONS). FD AI's only part is the review of the answers (server.ts).
 */

import type { Block } from "../contract/parse";
import { formatDate, joinAnd, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import {
  ACCEPTANCE, AGREED, BETWEEN, CALCULATION, DEFINITIONS, EXERCISE_NOTICE, INTERPRETATION, JURISDICTIONS, LIQUIDITY_PROVISO, MADE_ON,
  OTHER_JURISDICTION, PARTIES_COLLECTIVE, PARTY_COMPANY, PARTY_INVESTOR_COMPANY, PARTY_INVESTOR_INDIVIDUAL, RECITALS, SECTIONS, TITLE, WHEREAS,
  type Jurisdiction, type MasterClause, type MasterSub,
} from "./data/master";
import { applyDefaults } from "./questions";
import type { Answers, ClnInput, Flag, Party } from "./types";

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
/* The Jurisdiction Rider's entries: blank for "another law", and flagged
   once as a whole (checks.ts, CL2) rather than item by item. */
const RIDER_KEYS = new Set(["dp_law", "city", "exchange", "securities_law", "seat", "courts", "law"]);

const MAY_BE_EMPTY = new Set([
  "less_discount", "cofounders", "compounded", "and_interest_on_maturity", "mfn", "and_accrued_interest", "tp_under",
  "and_outstanding_interest", "together_with_interest", "times_discount",
]);

/** "250,000" → 250000; anything that is not a plain number → NaN. */
export function num(raw: string): number {
  const s = String(raw ?? "").replace(/[,\s%]/g, "").replace(/^(S\$|US\$|HK\$|SGD|USD|HKD|GBP|EUR|£|€|\$)/i, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const CURRENCIES: Record<string, { sym: string; name: string; country: string; unit: string; cents: string }> = {
  SGD: { sym: "S$", name: "Singapore dollars", country: "Singapore", unit: "Singapore dollars", cents: "cents" },
  USD: { sym: "US$", name: "United States dollars", country: "the United States of America", unit: "United States dollars", cents: "cents" },
  GBP: { sym: "£", name: "pounds sterling", country: "the United Kingdom", unit: "pounds sterling", cents: "pence" },
  HKD: { sym: "HK$", name: "Hong Kong dollars", country: "Hong Kong", unit: "Hong Kong dollars", cents: "cents" },
  EUR: { sym: "€", name: "euros", country: "the participating member states of the European Union", unit: "euros", cents: "cents" },
};

/** 250000 → "two hundred and fifty thousand". Whole numbers below a trillion. */
export function bigWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e12 || !Number.isInteger(n)) return String(n);
  if (n < 1000) return numberWords(n);
  const parts: string[] = [];
  const scales: [number, string][] = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
  let rest = n;
  for (const [size, name] of scales) {
    if (rest >= size) {
      parts.push(`${bigWords(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest) parts.push(rest < 100 ? `and ${numberWords(rest)}` : numberWords(rest));
  return parts.join(" ");
}

const count = (n: number) => (Number.isInteger(n) && n > 0 && n < 1000 ? `${numberWords(n)} (${n})` : String(n));

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

/** A list with items dropped, re-lettered, its "; and" / "." endings moved. */
function relist(items: MasterSub[], original: MasterSub[] = items): MasterSub[] {
  const numbered = items.filter((s) => s.ref);
  if (numbered.length === 0) return items;
  const all = original.filter((s) => s.ref);
  const origLast = all[all.length - 1].text.trim();
  const end = /,$/.test(origLast) ? "," : /;$/.test(origLast) ? ";" : ".";
  const conj = numbered.map((s) => /;\s*(and|or)\s*$/.exec(s.text.trim())?.[1]).find(Boolean) ?? "and";
  let i = 0;
  return items.map((s) => {
    if (!s.ref) return s;
    const last = i === numbered.length - 1;
    const penult = i === numbered.length - 2;
    let text = s.text.replace(/\s*(;\s*(and|or)|;|,|\.)\s*$/, "");
    if (last) text += end;
    else if (penult) text += `; ${conj}`;
    else text += ";";
    const ref = `(${String.fromCharCode(97 + i)})`;
    i += 1;
    return { ...s, ref, text };
  });
}

/** Everything the answers decide, read once — shared with the checks. */
export function readAnswers(a: Answers) {
  const companySide = str(a.CL1) !== "investor";
  const investorCompany = str(a.CL2) !== "individual";
  const lawKey = str(a.CL3) || "sg";
  const otherLaw = lawKey === "other" || !JURISDICTIONS[lawKey];
  const j: Jurisdiction = otherLaw ? { ...OTHER_JURISDICTION, law: str(a.CL3a) } : JURISDICTIONS[lawKey];
  const currency = CURRENCIES[str(a.CL4)] ? str(a.CL4) : "SGD";
  const principal = num(str(a.CL5));
  const purposeKind = str(a.CL6) || "general";
  const interest = str(a.CL7) || "simple";
  const rate = interest === "none" ? NaN : num(str(a.CL7a));
  const maturity = str(a.CL8) === "other" ? num(str(a.CL8a)) : num(str(a.CL8) || "2");
  const payDays = str(a.CL9) === "none" ? NaN : num(str(a.CL9) || (companySide ? "10" : "5"));
  const partialMultiple = str(a.CL10) === "multiple";
  const multiple = partialMultiple ? num(str(a.CL10a)) : NaN;
  const cap = num(str(a.CL11));
  const basis = str(a.CL12) === "pre" ? "pre-money" : "post-money";
  const discountKind = str(a.CL13) || (companySide ? "none" : "20");
  const discount = discountKind === "none" ? NaN : discountKind === "other" ? num(str(a.CL13a)) : num(discountKind);
  const qfe = str(a.CL14) === "down" ? "down" : "raise";
  const minRaise = qfe === "raise" ? num(str(a.CL14a)) : NaN;
  const esop = num(str(a.CL15) || "10");
  const auto = str(a.CL17) === "auto";
  const exercise = num(str(a.CL18) || "10");
  const mfn = (str(a.CL19) || (companySide ? "no" : "yes")) === "yes";
  const diluted = (str(a.CL20) || (companySide ? "excluding" : "including")) === "including" ? "including" : "excluding";
  const status = str(a.CL21) || "accredited";
  const disputes = str(a.CL22) === "courts" ? "courts" : "arbitration";
  return {
    companySide, investorCompany, lawKey, otherLaw, j, currency, principal, purposeKind, interest, rate, maturity, payDays, partialMultiple, multiple,
    cap, basis, discountKind, discount, qfe, minRaise, esop, auto, exercise, mfn, diluted, status, disputes,
  };
}

const STATUS_WORDS: Record<string, string> = {
  accredited: "an accredited investor",
  institutional: "an institutional investor",
  professional: "a sophisticated or professional investor",
};

export function assemble(input: ClnInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const company: Party = { ...input.company, kind: "company" };
  const investor = input.investor;
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();
  const own: string[] = [];
  const fdUsed: string[] = [];

  const r = readAnswers(a);
  const { j } = r;
  const cur = CURRENCIES[r.currency];
  const money = (n: number) =>
    Number.isFinite(n) ? `${cur.sym}${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}` : GAP;
  const words = (n: number) => {
    if (!Number.isFinite(n)) return GAP;
    const whole = Math.floor(n);
    const cents = Math.round((n - whole) * 100);
    return `${bigWords(whole)} ${cur.unit}${cents ? ` and ${numberWords(cents)} ${cur.cents}` : ""}`;
  };

  const purpose = r.purposeKind === "other" ? asPhrase(str(a.CL6a)) : r.purposeKind === "general" ? "working capital and general corporate purposes" : "";
  if (r.purposeKind === "other" && purpose) own.push("the purpose");
  if (r.otherLaw && str(a.CL3a)) own.push("the governing law");
  const cofounders = (Array.isArray(a.CL16) ? a.CL16 : []).map((x) => str(x)).filter(Boolean);
  if (cofounders.length) own.push("the co-founders' names");
  const interest = r.interest !== "none";

  /* ── which version of each clause ──────────────────────────────────── */
  const keep = (when?: string): boolean => {
    switch (when) {
      case undefined: return true;
      case "purpose": return Boolean(purpose);
      case "interest": return interest;
      case "interest_free": return !interest;
      case "pay_default": return Number.isFinite(r.payDays);
      case "multiple": return r.partialMultiple;
      case "auto": return r.auto;
      case "status": return r.status !== "none";
      case "arbitration": return r.disputes === "arbitration";
      case "courts": return r.disputes === "courts";
      default: return true;
    }
  };

  /* ── the fields ────────────────────────────────────────────────────── */
  if (!Number.isFinite(r.principal)) missing.add("principal amount");
  if (!Number.isFinite(r.cap)) missing.add("valuation cap");
  if (interest && !Number.isFinite(r.rate)) missing.add("interest rate");
  if (r.qfe === "raise" && !Number.isFinite(r.minRaise)) missing.add("minimum raise for a qualifying round");

  const discountWords = Number.isFinite(r.discount) ? pct(r.discount) : "";
  const coJur = str(company.jurisdiction) || j.law || GAP;
  const invJur = str(investor.jurisdiction) || coJur;

  const f: Record<string, string> = {
    date: formatDate(today),
    principal: money(r.principal),
    principal_words: words(r.principal),
    cur_name: cur.name,
    cur_country: cur.country,
    dp_law: j.dpLaw,
    city: j.city,
    basis: r.basis,
    cap: money(r.cap),
    less_discount: discountWords ? ` less a discount of ${discountWords}` : "",
    cofounders: cofounders.length ? `${joinAnd(cofounders)} or ` : "",
    maturity_words: Number.isFinite(r.maturity) && r.maturity > 0 ? `${count(r.maturity)} year${r.maturity === 1 ? "" : "s"}` : GAP,
    exchange: j.exchange,
    qfe_test:
      r.qfe === "down"
        ? `at a ${r.basis} valuation that is less than the Valuation Cap`
        : `raising aggregate gross proceeds of not less than ${money(r.minRaise)} in the Agreed Currency`,
    esop_words: pct(r.esop),
    rate_words: pct(r.rate),
    compounded: r.interest === "compound" ? ", compounded annually," : "",
    and_interest_on_maturity: interest ? " and all interest accrued in accordance with {{clause:interest}} (Interest)" : "",
    pay_days: Number.isFinite(r.payDays) ? count(r.payDays) : GAP,
    multiple: money(r.multiple),
    exercise_words: count(r.exercise),
    mfn: r.mfn ? ", provided that such documents are on terms no less favourable to the Investor than those agreed with the third-party investor(s) in any Qualified Equity Financing Event" : "",
    co_jurisdiction: coJur,
    investor_capacity: r.investorCompany ? `a corporation duly incorporated and validly existing under the laws of ${invJur}` : "an individual of full age and legal capacity",
    investor_status: STATUS_WORDS[r.status] ?? STATUS_WORDS.accredited,
    securities_law: j.securitiesLaw,
    and_accrued_interest: interest ? " and accrued interest" : "",
    and_outstanding_interest: interest ? " and the outstanding accrued interest on the Loan" : "",
    together_with_interest: interest ? " together with all interest accrued and unpaid" : "",
    times_discount: discountWords ? ` × (100% − ${r.discount}%)` : "",
    diluted: r.diluted,
    purpose,
    dpo_email: str(company.email) || GAP,
    co_name: str(company.name) || GAP,
    inv_name: str(investor.name) || GAP,
    co_address: oneLine(str(company.address)) || GAP,
    co_email: str(company.email) || GAP,
    co_attention: str(company.attention) || str(company.signatory_name) || GAP,
    inv_address: oneLine(str(investor.address)) || GAP,
    inv_email: str(investor.email) || GAP,
    inv_attention: str(investor.attention) || (r.investorCompany ? str(investor.signatory_name) : str(investor.name)) || GAP,
    tp_under: j.tpStatute ? `under ${j.tpStatute} or otherwise ` : r.otherLaw ? `under ${GAP} or otherwise ` : "",
    law: j.law || GAP,
    seat: j.seat,
    rules: j.rules,
    institution: j.institution,
    courts: j.courts || (j.law ? `the courts of ${j.law}` : ""),
  };
  if (!str(company.email)) missing.add("the Company's email");

  /* ── which clauses ─────────────────────────────────────────────────── */
  type Built = { id: string; heading: string; clauses: MasterClause[] };
  const built: Built[] = [];
  for (const sec of SECTIONS) {
    if (!keep(sec.when)) continue;
    const clauses = sec.clauses.filter((c) => keep(c.when));
    if (clauses.length) built.push({ id: sec.id, heading: sec.heading, clauses });
    for (const c of clauses) if (c.fd) fdUsed.push(c.text.match(/^\*\*(.+?)\.\*\*/)?.[1]?.toLowerCase() ?? c.id);
  }
  const clauseNo: Record<string, string> = {};
  built.forEach((s, i) => {
    f[`section:${s.id}`] = `Clause ${i + 1}`;
    s.clauses.forEach((c, k) => (clauseNo[c.id] = `${i + 1}.${k + 1}`));
  });
  for (const [id, n] of Object.entries(clauseNo)) f[`clause:${id}`] = `Clause ${n}`;

  /* ── fill ──────────────────────────────────────────────────────────── */
  const fillOnce = (text: string, extra: Record<string, string> = {}) =>
    text.replace(/\{\{([\w:]+)\}\}/g, (_, k: string) => {
      const v = extra[k] ?? f[k];
      if (v === "" && MAY_BE_EMPTY.has(k)) return "";
      if (v === undefined || v === "") {
        if (k.startsWith("clause:") || k.startsWith("section:")) return "this Agreement";
        if (RIDER_KEYS.has(k)) return GAP;
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

  const partyText = (p: Party, template: string, label: string) => {
    const vals = {
      name: str(p.name) || GAP,
      id_no: str(p.id_no),
      company_type: str(p.company_type) || "private company limited by shares",
      jurisdiction: str(p.jurisdiction) || (label === "Company" ? coJur : invJur),
      address: oneLine(str(p.address)),
    };
    if (!str(p.name)) missing.add(`the ${label}'s name`);
    return fill(template, vals);
  };

  blocks.push({ kind: "title", num: "", text: TITLE });
  plain(fill(MADE_ON));
  plain(BETWEEN);
  blocks.push({ kind: "party", num: "(1)", text: `${partyText(company, PARTY_COMPANY, "Company")} (the "**Company**"); and` });
  blocks.push({
    kind: "party",
    num: "(2)",
    text: `${partyText(investor, r.investorCompany ? PARTY_INVESTOR_COMPANY : PARTY_INVESTOR_INDIVIDUAL, "Investor")} (the "**Investor**"),`,
  });
  plain(PARTIES_COLLECTIVE);
  plain(`**${WHEREAS}**`);
  RECITALS.forEach((t, i) => blocks.push({ kind: "recital", num: `(${String.fromCharCode(65 + i)})`, text: fill(t) }));
  plain(AGREED);

  const included: string[] = [];
  const prune = (list: MasterSub[]): MasterSub[] => {
    const kept = list.filter((s) => keep(s.when));
    return kept.length === list.length ? kept : relist(kept, list);
  };
  const emit = (s: MasterSub, level: 1 | 2 | 3) => {
    const text = fill(s.text);
    if (s.ref) sub(s.ref, text, level);
    else if (text) plain(text, true);
    for (const x of prune(s.subs ?? [])) emit(x, Math.min(3, level + 1) as 1 | 2 | 3);
  };

  const defs = DEFINITIONS.filter((d) => keep(d.when));
  built.forEach((sec, si) => {
    blocks.push({ kind: "section", num: "", text: `${si + 1}. ${sec.heading}` });
    sec.clauses.forEach((c, ci) => {
      included.push(c.id);
      blocks.push({ kind: "clause", num: `${si + 1}.${ci + 1}`, text: fill(c.text) });
      if (c.id === "definitions") {
        defs.forEach((d, i) => {
          const last = i === defs.length - 1;
          let text = fill(d.text);
          if (!d.subs) text = text.replace(/\s*(;\s*and|;|\.)\s*$/, "") + (last ? "." : ";");
          plain(`"**${d.term}**" ${text}`, true);
          (d.subs ?? []).forEach((s, k) => sub(`(${String.fromCharCode(97 + k)})`, fill(s), 1));
          if (d.term === "Liquidity Event") plain(LIQUIDITY_PROVISO, true);
        });
        return;
      }
      if (c.id === "interpretation") {
        INTERPRETATION.forEach((x, i) => sub(`(${String.fromCharCode(97 + i)})`, fill(x), 1));
        return;
      }
      for (const s of prune(c.subs ?? [])) emit(s, 1);
      if (c.tail) plain(fill(c.tail), true);
    });
  });

  /* ── signatures ────────────────────────────────────────────────────── */
  plain(ACCEPTANCE);
  const line = "___________________________";
  const signFor = (p: Party, label: string, heading: string, individual: boolean) => {
    const nm = str(p.name) || GAP;
    plain(`**${heading}**`);
    if (individual) {
      blocks.push({ kind: "sign-head", num: "", text: `SIGNED by ${nm}` });
      for (const l of [line, `Name: ${nm}`, `Email: ${str(p.email) || GAP}`]) blocks.push({ kind: "sign", num: "", text: l });
    } else {
      /* As the master sets it: the line to sign on, then "For and on behalf of", the company, Name, Title, Email. */
      blocks.push({ kind: "sign", num: "", text: line });
      blocks.push({ kind: "sign-head", num: "", text: "For and on behalf of" });
      for (const l of [`**${nm}**`, `Name: ${str(p.signatory_name) || GAP}`, `Title: ${str(p.signatory_title) || GAP}`, `Email: ${str(p.email) || GAP}`])
        blocks.push({ kind: "sign", num: "", text: l });
      if (!str(p.signatory_name)) missing.add(`the ${label}'s signatory`);
    }
    if (!str(p.email)) missing.add(`the ${label}'s email`);
  };
  signFor(company, "Company", "THE COMPANY", false);
  signFor(investor, "Investor", "THE INVESTOR", !r.investorCompany);

  /* ── Schedule 1: the Exercise Notice ───────────────────────────────── */
  blocks.push({ kind: "section", num: "", text: "SCHEDULE 1" });
  plain("**EXERCISE NOTICE**");
  for (const l of EXERCISE_NOTICE) plain(fill(l));
  for (const l of [line, `For and on behalf of ${f.inv_name}`, "Name: _____________________", "Title: _____________________"])
    blocks.push({ kind: "sign", num: "", text: l });

  /* ── Schedule 2: the conversion calculation ────────────────────────── */
  blocks.push({ kind: "section", num: "", text: "SCHEDULE 2" });
  plain("**CONVERSION CALCULATION**");
  blocks.push({ kind: "clause", num: "1.", text: fill(CALCULATION.shares) });
  plain(fill(CALCULATION.sharesFormula), true);
  plain(fill(CALCULATION.sharesWhere), true);
  blocks.push({ kind: "clause", num: "2.", text: fill(CALCULATION.price) });
  sub("(a)", fill(CALCULATION.priceA), 1);
  sub("(b)", fill(CALCULATION.priceB), 1);
  plain(fill(CALCULATION.priceWhere), true);
  blocks.push({ kind: "clause", num: "3.", text: fill(CALCULATION.example) });
  const example: [string, string][] = [
    ["Principal Amount", money(r.principal)],
    ["Interest rate and period", interest && Number.isFinite(r.rate) ? `${r.rate}% per annum${r.interest === "compound" ? ", compounded annually" : ""}, for [●] days` : interest ? "[●]% per annum for [●] days" : "Not applicable (interest-free)"],
    ["Conversion Amount (principal plus accrued interest)", GAP],
    [`Valuation Cap (${r.basis})`, money(r.cap)],
    ["Fully Diluted Share Capital before Conversion", "[●] Shares"],
    ["Price under paragraph 2(a)", "[●] per Share"],
    ["Price under paragraph 2(b)(ii) (if applicable)", "[●] per Share"],
    ["Conversion Price (lower of the two)", "[●] per Share"],
    ["Number of Conversion Shares (rounded down)", "[●] Shares"],
    ["Investor's resulting shareholding", "[●]%"],
  ];
  for (const [k, v] of example) plain(`${k}: ${v}`, true);

  /* ── what the lawyer should know ───────────────────────────────────── */
  if (own.length) {
    flags.push({ level: "yellow", scenario: "CL21", title: "Your own wording", reason: `Wording you typed has gone into the agreement as written: ${joinAnd(Array.from(new Set(own)))}. Have your lawyer check it.` });
  }
  if (fdUsed.length) {
    flags.push({
      level: "green",
      scenario: "FD",
      title: "FD supplementary wording",
      reason: `Wording not in the master, written in its style for the answers given: ${joinAnd(Array.from(new Set(fdUsed)))}. For FD review.`,
    });
  }

  return { blocks, missing: Array.from(missing), flags, fields: f, included };
}
