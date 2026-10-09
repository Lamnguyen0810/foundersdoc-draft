/**
 * Answers → share subscription agreement.
 *
 * Deterministic, as the SHA and SPA assemblers are: the same answers give
 * the same agreement from the wording in data/master.ts, with nothing
 * invented. No model is called.
 *
 * The version (SS1) decides which sections exist — Basic: subscription,
 * completion, confidentiality, general; Standard: + resolutions and the
 * limited warranties; Complex: + conditions, fundamental warranties, caps,
 * undertakings, a capitalisation schedule and up to five investors.
 *
 * The master is written for several investors and founders and for the
 * Company and the Founders as warrantors; it is read in the singular, or
 * with the Company as the only warrantor, at the end (reword()).
 */

import type { Block } from "../contract/parse";
import { formatDate, joinAnd, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import {
  AGREED, COMPANY_PARTY, COMPANY_PARTY_TO_BE, DEFINITIONS, EXECUTED, FOUNDERS_COLLECTIVE, INTERPRETATION_RULES,
  INVESTORS_COLLECTIVE, MADE_ON, PARTIES_COLLECTIVE, PARTY_COMPANY_INVESTOR, PARTY_INDIVIDUAL, RECITAL_A, RECITAL_A_TO_BE,
  RECITAL_B, RECITAL_C, SECTIONS, TITLE, WARRANTIES, WHEREAS, type Definition, type MasterClause, type MasterSub,
} from "./data/master";
import { applyDefaults, founderCount, investorCount, picks } from "./questions";
import type { Answers, Flag, Investor, SsaInput } from "./types";

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
const MAY_BE_EMPTY = new Set(["and_founders", "certificate_warranties", "at_completion", "sha_conf"]);

/** "50,000" → 50000; anything that is not a plain number → NaN. */
export function num(raw: string): number {
  const s = String(raw ?? "").replace(/[,\s]/g, "").replace(/^(S\$|US\$|SGD|USD|\$)/i, "").replace(/shares?$/i, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const count = (n: number) => (Number.isInteger(n) && n > 0 && n < 1000 ? `${numberWords(n)} (${n})` : String(n));
const pct = (n: number) => (Number.isFinite(n) && n > 0 ? `${Number.isInteger(n) && n < 1000 ? numberWords(n) : n} per cent. (${n}%)` : GAP);
function period(months: number): string {
  if (!Number.isFinite(months) || months <= 0) return GAP;
  return months % 12 === 0 ? `${count(months / 12)} year${months === 12 ? "" : "s"}` : `${count(months)} month${months === 1 ? "" : "s"}`;
}
const money = (n: number) => (Number.isFinite(n) ? `S$${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}` : GAP);

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

function relist(items: MasterSub[]): MasterSub[] {
  const numbered = items.filter((s) => s.ref);
  if (numbered.length === 0) return items;
  const roman = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$/.test(numbered[0].ref ?? "");
  let i = 0;
  return items.map((s) => {
    if (!s.ref) return s;
    const last = i === numbered.length - 1;
    const penult = i === numbered.length - 2;
    const trailingComma = /,\s*$/.test(s.text.trim());
    let text = s.text.replace(/\s*(;\s*(and|or)|;|,|\.)\s*$/, "");
    if (last) text = `${text}${trailingComma ? "," : "."}`;
    else if (penult) text += "; and";
    else text += ";";
    const ref = roman ? `(${ROMAN[i]})` : `(${String.fromCharCode(97 + i)})`;
    i += 1;
    return { ...s, ref, text };
  });
}

/* ── rewording: one warrantor, one investor, one founder ──────────────── */

const COMPANY_ONLY: [RegExp, string][] = [
  [/\bThe Warrantors (jointly and severally |severally and not jointly )?warrant\b/g, "The Company warrants"],
  [/\bso far as the Warrantors are aware\b/g, "so far as the Company is aware"],
  [/\bthe actual knowledge of the Warrantors and such knowledge which the Warrantors would have had if they had made\b/g, "the actual knowledge of the Company and such knowledge which the Company would have had if it had made"],
  [/\bknown to any of the Warrantors\b/g, "known to the Company"],
  [/\bEach Warrantor has\b/g, "The Company has"],
  [/\bany Warrantor is\b/g, "the Company is"],
  [/\b(any|a) Warrantor\b/g, "the Company"],
  [/\bthe Warrantors\b/g, "the Company"],
  [/\bThe Warrantors\b/g, "The Company"],
];

const ONE_INVESTOR: [RegExp, string][] = [
  [/\bThe Investors have agreed\b/g, "The Investor has agreed"],
  [/\beach of the Investors\b/g, "the Investor"],
  [/\bEach Investor\b/g, "The Investor"],
  [/\beach Investor\b/g, "the Investor"],
  [/\bsuch Investor's\b/g, "the Investor's"],
  [/\bsuch Investor\b/g, "the Investor"],
  [/\bAn Investor\b/g, "The Investor"],
  [/\b(an|any) Investor\b/g, "the Investor"],
  [/\bInvestors'/g, "Investor's"],
  [/\bInvestors\b/g, "Investor"],
];

const ONE_FOUNDER: [RegExp, string][] = [
  [/\bNo Founder has been\b/g, "The Founder has not been"],
  [/\beach of the Founders\b/g, "the Founder"],
  [/\bEach Founder\b/g, "The Founder"],
  [/\beach Founder\b/g, "the Founder"],
  [/\bany Founder\b/g, "the Founder"],
  [/\bthe Company and the Founders\b/g, "the Company and the Founder"],
  [/\bFounders\b/g, "Founder"],
];

const apply = (t: string, rules: [RegExp, string][]) => rules.reduce((acc, [re, to]) => acc.replace(re, to), t);

export function assemble(input: SsaInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const { company } = input;
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();
  const own: string[] = [];
  const fdUsed: string[] = [];

  const version = str(a.SS1) || "standard";
  const basic = version === "basic";
  const complex = version === "complex";
  const investors = input.investors.slice(0, investorCount(a)).filter((x) => str(x.name));
  const founders = input.founders.slice(0, founderCount(a)).filter((x) => str(x.name));
  const nInv = Math.max(1, investors.length);
  const nFdr = founders.length;
  const hasFounders = founderCount(a) > 0;
  const preference = str(a.SS5) === "preference";
  const conditional = complex && str(a.SS6) === "yes";
  const conds = conditional ? picks(a, "SS6a") : [];
  const warranties = !basic;
  const companyOnly = !hasFounders || str(a.SS10) === "company";
  const joint = str(a.SS10a) !== "several";
  const keys = complex ? picks(a, "SS11c") : version === "standard" ? picks(a, "SS11") : [];
  const caps = complex && str(a.SS12) !== "no";
  const actions = complex ? picks(a, "SS7c") : version === "standard" ? picks(a, "SS7") : [];
  const invActions = picks(a, "SS9").filter((x) => x !== "none");
  const convert = str(a.SS8) === "convert";
  const iu = complex ? picks(a, "SS13").filter((x) => x !== "none") : [];
  const cu = complex ? picks(a, "SS14").filter((x) => x !== "none") : [];
  const fu = complex && hasFounders ? picks(a, "SS15").filter((x) => x !== "none") : [];
  const representative = complex && nInv > 1 && str(a.SS4a) === "yes";
  const sha = conds.includes("sha") || invActions.includes("sha");

  /* ── the numbers ───────────────────────────────────────────────────── */
  const shares = investors.map((x) => num(str(x.shares)));
  const amounts = investors.map((x) => num(str(x.amount)));
  const totalShares = shares.length && shares.every(Number.isFinite) ? shares.reduce((s, v) => s + v, 0) : NaN;
  const totalAmount = amounts.length && amounts.every(Number.isFinite) ? amounts.reduce((s, v) => s + v, 0) : NaN;
  investors.forEach((x, i) => {
    if (!Number.isFinite(shares[i])) missing.add(`shares for ${str(x.name)}`);
    if (!Number.isFinite(amounts[i])) missing.add(`amount for ${str(x.name)}`);
  });
  const issued = num(str(company.issued_shares));

  /* ── the fields ────────────────────────────────────────────────────── */
  const shareWord = preference ? "Preference Shares" : "Ordinary Shares";
  const f: Record<string, string> = {
    date: formatDate(today),
    company_name: str(company.name),
    company_reg_no: str(company.reg_no),
    company_address: oneLine(str(company.address)),
    business: str(company.business).replace(/\.$/, ""),
    issued_capital: str(company.issued_capital),
    issued_shares: Number.isFinite(issued) ? issued.toLocaleString("en-GB") : str(company.issued_shares),
    total_shares: Number.isFinite(totalShares) ? totalShares.toLocaleString("en-GB") : "",
    share_word: shareWord,
    account_name: str(company.account_name),
    bank_name: str(company.bank_name),
    account_no: str(company.account_no),
    representative: str(input.representative),
    condition_other: str(a.SS6b).replace(/\.$/, ""),
    and_founders: hasFounders ? " and the Founders" : "",
    warrantors: companyOnly ? "the Company" : "the Company and each of the Founders",
    sha_conf: sha ? ", the Shareholders' Agreement" : "",
    certificate_warranties: warranties ? " and that the Warranties remain true, accurate and not misleading at Completion" : "",
    at_completion: conditional ? " and will be true, accurate and not misleading at Completion" : "",
  };
  if (f.condition_other) own.push("condition");
  f.share_rights_text = preference
    ? "**Rights.** The Subscription Shares shall be Preference Shares having the rights and restrictions set out in the Constitution, which the Company shall procure is amended, if necessary, to set out such rights on or before Completion."
    : "**Ranking.** The Subscription Shares shall be Ordinary Shares and shall rank pari passu in all respects with the existing Ordinary Shares.";
  if (preference) fdUsed.push("preference share rights");
  f.waiver_by =
    nInv === 1 ? "The Investors" : representative ? "The Investors' Representative (on behalf of the Investors)" : "Investors who are to subscribe for a majority of the Subscription Shares";
  f.completion_text = conditional
    ? "**Completion.** Completion shall take place on the date falling five (5) Business Days after the date on which the last of the Conditions is satisfied (or waived), or on such other date as the Parties may agree in writing."
    : "**Completion.** Completion shall take place on the date of this Agreement.";
  f.warrant_lead = companyOnly ? "The Company warrants" : `The Warrantors ${joint ? "jointly and severally" : "severally and not jointly"} warrant`;
  const capPct = str(a.SS12a) === "other" ? Number(str(a.SS12b)) : Number(str(a.SS12a) || "100");
  const months = str(a.SS12c) === "other" ? Number(str(a.SS12d)) : Number(str(a.SS12c) || "36");
  f.cap_pct = pct(capPct);
  f.time_cap = period(months);

  /* ── which clauses ─────────────────────────────────────────────────── */
  const drop = new Set<string>();
  const dropSection = new Set<string>();
  const dropSub = new Set<string>();

  if (!hasFounders) drop.add("founder_waiver");
  if (nInv <= 1) drop.add("several");
  else fdUsed.push("several obligations of the investors");
  if (!representative) drop.add("representative");
  else fdUsed.push("investors' representative");

  if (!conditional) dropSection.add("conditions");
  else {
    fdUsed.push("conditions");
    const map: Record<string, string> = {
      shareholder_approval: "cp_shareholder_approval", board_approval: "cp_board_approval", sha: "cp_sha", constitution: "cp_constitution",
      no_mac: "cp_no_mac", esop: "cp_esop", employment: "cp_employment", ip: "cp_ip", other: "cp_other",
    };
    for (const [k, id] of Object.entries(map)) if (!conds.includes(k) || (k === "other" && !f.condition_other)) dropSub.add(id);
    if (!hasFounders) dropSub.add("cp_employment");
  }

  dropSub.add(convert ? "ia_pay" : "ia_convert");
  if (convert) fdUsed.push("SAFE / loan conversion");
  if (!invActions.includes("authority")) dropSub.add("ia_authority");
  else fdUsed.push("evidence of the investor's authority");
  if (!invActions.includes("sha")) dropSub.add("ia_sha");
  if (!invActions.includes("safe_letter")) dropSub.add("ia_safe");
  else fdUsed.push("SAFE conversion letter");

  if (!actions.includes("board")) dropSub.add("co_board");
  if (!actions.includes("members")) dropSub.add("co_members");
  if (!actions.includes("satisfaction") || !conditional) dropSub.add("co_satisfaction");
  else fdUsed.push("evidence of the conditions");
  if (!actions.includes("certificate") || !conditional) dropSub.add("co_certificate");
  else fdUsed.push("completion certificate");

  if (!warranties || keys.length === 0) {
    dropSection.add("warranties");
    dropSection.add("limitations");
  } else {
    if (companyOnly) drop.add("w_contribution");
    if (!complex) drop.add("w_awareness");
  }
  if (!caps) dropSection.add("limitations");

  if (!complex || (iu.length === 0 && cu.length === 0 && fu.length === 0)) dropSection.add("undertakings");
  else {
    const iuMap: Record<string, string> = { no_transfer: "iu_no_transfer", rofo: "iu_rofo", esop: "iu_esop", fundraising: "iu_fundraising", exit: "iu_exit" };
    for (const [k, id] of Object.entries(iuMap)) if (!iu.includes(k)) dropSub.add(id);
    if (!iu.length) drop.add("investor_undertakings");
    const cuMap: Record<string, string> = { budget: "cu_budget", quarterly: "cu_quarterly", monthly: "cu_monthly", updates: "cu_updates" };
    for (const [k, id] of Object.entries(cuMap)) if (!cu.includes(k)) dropSub.add(id);
    if (!cu.length) drop.add("company_undertakings");
    const fuMap: Record<string, string> = { reputation: "fu_reputation", conflict: "fu_conflict", non_compete: "fu_non_compete", vesting: "fu_vesting" };
    for (const [k, id] of Object.entries(fuMap)) if (!fu.includes(k)) dropSub.add(id);
    if (!fu.length) drop.add("founder_undertakings");
    fdUsed.push("undertakings");
  }

  /* ── the sections, numbered ────────────────────────────────────────── */
  type Built = { id: string; heading: string; clauses: MasterClause[] };
  const built: Built[] = [];
  for (const sec of SECTIONS) {
    if (dropSection.has(sec.id)) continue;
    const clauses = sec.clauses.filter((c) => !drop.has(c.id));
    if (clauses.length) built.push({ id: sec.id, heading: sec.heading, clauses });
  }
  const clauseNo: Record<string, string> = {};
  built.forEach((s, i) => {
    f[`section:${s.id}`] = `Clause ${i + 1}`;
    s.clauses.forEach((c, k) => (clauseNo[c.id] = `${i + 1}.${k + 1}`));
  });
  for (const [id, n] of Object.entries(clauseNo)) f[`clause:${id}`] = `Clause ${n}`;

  /* ── fill and reword ───────────────────────────────────────────────── */
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
  const reword = (t: string) => {
    let out = t;
    if (companyOnly) out = apply(out, COMPANY_ONLY);
    if (nInv === 1) out = apply(out, ONE_INVESTOR);
    if (nFdr === 1) out = apply(out, ONE_FOUNDER);
    return out;
  };
  const fill = (text: string, extra: Record<string, string> = {}) => {
    let t = fillOnce(text, extra);
    if (t.includes("{{")) t = fillOnce(t, extra);
    t = t.replace(/\bClause (\d+(?:\.\d+)*) (and|to) Clause (\d+(?:\.\d+)*)/g, "Clauses $1 $2 $3");
    return reword(t);
  };

  /* ── the blocks ────────────────────────────────────────────────────── */
  const blocks: Block[] = [];
  const plain = (text: string, cont = false) => blocks.push({ kind: "plain", num: "", text, ...(cont ? { cont: true } : {}) });
  const sub = (n: string, text: string, level: 1 | 2 | 3 = 1) => blocks.push({ kind: "subclause", num: n, text, level });

  blocks.push({ kind: "title", num: "", text: TITLE });
  plain(fill(MADE_ON));
  let p = 0;
  const investorLine = (x: Investor) =>
    fill(x.kind === "company" ? PARTY_COMPANY_INVESTOR : PARTY_INDIVIDUAL, { name: str(x.name), id_no: str(x.id_no), jurisdiction: str(x.jurisdiction) || "Singapore", address: oneLine(str(x.address)) });
  if (investors.length === 0) {
    missing.add("investor");
    blocks.push({ kind: "party", num: `(${++p})`, text: `${GAP} (the "**Investor**");` });
  } else if (investors.length === 1) {
    blocks.push({ kind: "party", num: `(${++p})`, text: `${investorLine(investors[0])} (the "**Investor**");` });
  } else {
    investors.forEach((x) => blocks.push({ kind: "party", num: `(${++p})`, text: `${investorLine(x)};` }));
    plain(INVESTORS_COLLECTIVE);
  }
  if (!hasFounders) {
    const lastBlock = blocks[blocks.length - 1];
    lastBlock.text = lastBlock.text.replace(/;$/, "; and");
  }
  if (founders.length === 1) {
    const x = founders[0];
    blocks.push({ kind: "party", num: `(${++p})`, text: `${fill(PARTY_INDIVIDUAL, { name: str(x.name), id_no: str(x.id_no), address: oneLine(str(x.address)) })} (the "**Founder**"); and` });
  } else if (founders.length > 1) {
    founders.forEach((x) => blocks.push({ kind: "party", num: `(${++p})`, text: `${fill(PARTY_INDIVIDUAL, { name: str(x.name), id_no: str(x.id_no), address: oneLine(str(x.address)) })};` }));
    plain(`${FOUNDERS_COLLECTIVE.replace(/;$/, "; and")}`);
  } else if (hasFounders) {
    missing.add("founder");
    blocks.push({ kind: "party", num: `(${++p})`, text: `${GAP} (the "**Founder**"); and` });
  }
  const toBe = str(a.SS2) === "by_signing";
  blocks.push({ kind: "party", num: `(${++p})`, text: fill(toBe ? COMPANY_PARTY_TO_BE : COMPANY_PARTY) });
  plain(PARTIES_COLLECTIVE);
  plain(`**${WHEREAS}**`);
  blocks.push({ kind: "recital", num: "(A)", text: fill(toBe ? RECITAL_A_TO_BE : RECITAL_A) });
  blocks.push({ kind: "recital", num: "(B)", text: fill(RECITAL_B) });
  blocks.push({ kind: "recital", num: "(C)", text: fill(RECITAL_C) });
  plain(AGREED);

  const defsFor = (): Definition[] =>
    DEFINITIONS.filter((d) => {
      switch (d.when) {
        case undefined: return true;
        case "warranties": return Boolean(clauseNo.w_give) && !(companyOnly && d.term === "Warrantors");
        case "conditions": return conditional;
        case "constitution": return conds.includes("constitution");
        case "sha": return sha;
        case "ip": return conds.includes("ip");
        case "representative": return representative;
        case "preference": return preference;
        case "complex_warranties": return complex;
      }
    });

  const included: string[] = [];
  const emit = (s: MasterSub, level: 1 | 2 | 3) => {
    const text = fill(s.text);
    if (s.ref) sub(s.ref, text, level);
    else if (text) plain(text, true);
    for (const t of s.subs ?? []) emit(t, Math.min(3, level + 1) as 1 | 2 | 3);
  };
  const prune = (list: MasterSub[]): MasterSub[] => {
    const kept = list.filter((s) => !(s.id && dropSub.has(s.id)));
    return kept.length === list.length ? kept : relist(kept);
  };

  built.forEach((sec, si) => {
    blocks.push({ kind: "section", num: "", text: `${si + 1}. ${sec.heading}` });
    sec.clauses.forEach((c, ci) => {
      included.push(c.id);
      const kept = prune(c.subs ?? []);
      /* One item left of a list: it reads as one sentence. */
      if (kept.length === 1 && kept[0].ref && !kept[0].subs && /:\s*$/.test(c.text) && !c.tail) {
        const joined = `${c.text.replace(/:\s*$/, "")} ${kept[0].text.replace(/\s*(;\s*(and|or)|;)\s*$/, ".").replace(/,\s*$/, ".")}`;
        blocks.push({ kind: "clause", num: `${si + 1}.${ci + 1}`, text: fill(joined) });
        return;
      }
      blocks.push({ kind: "clause", num: `${si + 1}.${ci + 1}`, text: fill(c.text) });
      if (c.id === "definitions") {
        const defs = defsFor();
        defs.forEach((d, i) => {
          const last = i === defs.length - 1;
          const penult = i === defs.length - 2;
          const term = reword(d.term);
          let text = fill(d.text).replace(/\s*(;\s*and|;|\.)\s*$/, "");
          text += last ? "." : penult ? "; and" : ";";
          plain(`"**${term}**" ${text}`, true);
        });
        return;
      }
      if (c.id === "rules") {
        INTERPRETATION_RULES.forEach((r, i) => sub(`(${String.fromCharCode(97 + i)})`, r, 1));
        return;
      }
      for (const s of kept) emit(s, 1);
      if (c.tail) plain(fill(c.tail), true);
      if (c.id === "notices") {
        plain("**The Company**", true);
        plain(`Address: ${f.company_address || GAP}`, true);
        plain(`Attention: ${str(company.signatory_name) || GAP}`, true);
        plain(`E-mail: ${str(company.signatory_email) || GAP}`, true);
        plain(reword(`**${hasFounders ? "Each Investor and each Founder" : "Each Investor"}**: at the address or e-mail address set out against its name in Schedule 1.`), true);
        if (!str(company.signatory_email)) missing.add("Company's notice e-mail");
      }
    });
  });

  /* Signature page. */
  plain(EXECUTED);
  const signLines = (head: string, lines: string[]) => {
    blocks.push({ kind: "sign-head", num: "", text: head });
    for (const l of lines) blocks.push({ kind: "sign", num: "", text: l });
  };
  plain("**THE COMPANY**");
  signLines(`SIGNED by ${str(company.signatory_name) || GAP} for and on behalf of ${f.company_name || GAP}`, ["___________________________", `Name: ${str(company.signatory_name) || GAP}`, `Title: ${str(company.signatory_title) || GAP}`]);
  if (founders.length) {
    plain(founders.length === 1 ? "**THE FOUNDER**" : "**THE FOUNDERS**");
    founders.forEach((x) => signLines(`SIGNED by ${str(x.name)}`, ["___________________________", `Name: ${str(x.name)}`]));
  }
  plain(investors.length > 1 ? "**THE INVESTORS**" : "**THE INVESTOR**");
  investors.forEach((x) =>
    x.kind === "company"
      ? signLines(`SIGNED by ${str(x.signatory_name) || GAP} for and on behalf of ${str(x.name)}`, ["___________________________", `Name: ${str(x.signatory_name) || GAP}`, `Title: ${str(x.signatory_title) || GAP}`])
      : signLines(`SIGNED by ${str(x.name)}`, ["___________________________", `Name: ${str(x.name)}`]),
  );

  /* Schedule 1. */
  const schedule = (n: number, title: string) => {
    blocks.push({ kind: "section", num: "", text: `SCHEDULE ${n}` });
    plain(`**${title}**`);
  };
  schedule(1, founders.length ? "PARTICULARS OF THE INVESTORS AND THE FOUNDERS" : "PARTICULARS OF THE INVESTORS");
  plain(nInv === 1 ? "**Part 1 — The Investor**" : "**Part 1 — The Investors**");
  investors.forEach((x, i) => {
    sub(`${i + 1}.`, `**${str(x.name)}** — address: ${oneLine(str(x.address)) || GAP}; e-mail: ${str(x.email) || GAP}; Subscription Shares: ${Number.isFinite(shares[i]) ? shares[i].toLocaleString("en-GB") : GAP}; Subscription Consideration: ${money(amounts[i])}.`, 1);
    if (!str(x.email)) missing.add(`e-mail of ${str(x.name)}`);
  });
  plain(`Total: ${f.total_shares || GAP} Subscription Shares for an aggregate Subscription Consideration of ${money(totalAmount)}${Number.isFinite(totalAmount) && Number.isFinite(totalShares) && totalShares > 0 ? ` (S$${(Math.round((totalAmount / totalShares) * 10000) / 10000).toString()} per share)` : ""}.`, true);
  if (founders.length) {
    plain(founders.length === 1 ? "**Part 2 — The Founder**" : "**Part 2 — The Founders**");
    founders.forEach((x, i) => sub(`${i + 1}.`, `**${str(x.name)}** — address: ${oneLine(str(x.address)) || GAP}; e-mail: ${str(x.email) || GAP}.`, 1));
  }

  /* Schedule 2. */
  schedule(2, "PARTICULARS OF THE COMPANY");
  const row = (k: string, v: string) => plain(`${k}: ${v || GAP}`, true);
  row("Name", f.company_name);
  row("Registration number", toBe ? "to be confirmed on incorporation" : f.company_reg_no);
  row("Registered office", f.company_address);
  row("Issued and paid-up share capital", [f.issued_capital, f.issued_shares ? `${f.issued_shares} Ordinary Shares` : ""].filter(Boolean).join(", comprising "));
  row("Business", f.business);
  if (!f.issued_capital) missing.add("issued_capital");

  /* Schedule 3. */
  let next = 3;
  if (clauseNo.w_give) {
    schedule(next++, "WARRANTIES");
    let n = 0;
    for (const g of WARRANTIES) {
      if (!keys.includes(g.key)) continue;
      n += 1;
      blocks.push({ kind: "clause", num: `${n}.`, text: `**${g.heading}**` });
      g.items.forEach((t, k) => sub(`${n}.${k + 1}`, fill(t), 1));
    }
    if (keys.includes("anti_corruption")) fdUsed.push("anti-bribery warranty (second paragraph)");
  }

  /* Capitalisation (Complex). */
  if (complex) {
    schedule(next++, "CAPITALISATION");
    plain("To be completed by the Parties before signing.");
    const table = (title: string, after: boolean) => {
      plain(`**${title}**`);
      founders.forEach((x, i) => sub(`${i + 1}.`, `${str(x.name)}: ${GAP} Ordinary Shares (${GAP}%)`, 1));
      sub(`${founders.length + 1}.`, `[Other shareholders]: ${GAP} Ordinary Shares (${GAP}%)`, 1);
      if (after) investors.forEach((x, i) => sub(`${founders.length + 2 + i}.`, `${str(x.name)}: ${Number.isFinite(shares[i]) ? shares[i].toLocaleString("en-GB") : GAP} ${shareWord} (${GAP}%)`, 1));
      const total = after ? (Number.isFinite(issued) && Number.isFinite(totalShares) ? (issued + totalShares).toLocaleString("en-GB") : GAP) : f.issued_shares || GAP;
      plain(`Total: ${total} Shares (100%)`, true);
    };
    table("Part 1 — Immediately before Completion", false);
    table("Part 2 — Immediately after Completion", true);
  }

  /* ── what the lawyer should know ───────────────────────────────────── */
  if (own.length) {
    flags.push({ level: "yellow", scenario: "SS21", title: "Your own wording", reason: `Wording you typed has gone into the agreement as written: ${joinAnd(Array.from(new Set(own)))}. Have your lawyer check it reads as a clause.` });
  }
  if (fdUsed.length) {
    flags.push({
      level: "green",
      scenario: "FD",
      title: "FD supplementary wording",
      reason: `Wording not in the VIMA model, written in its style for the answers given: ${joinAnd(Array.from(new Set(fdUsed)))}. For FD review.`,
    });
  }

  return { blocks, missing: Array.from(missing), flags, fields: f, included };
}
