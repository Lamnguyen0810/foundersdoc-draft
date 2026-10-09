/**
 * Answers → investment agreement.
 *
 * Deterministic, as the SSA and SPA assemblers are: the same answers give
 * the same agreement from the wording in data/master.ts, with nothing
 * invented. No model is called.
 *
 * The shape (IA1) decides the structure — simple: the company and one
 * investor, the company's warranties in the body and investor undertakings
 * (sample A); lead: the company, the founders and the lead investor,
 * conditions, a board seat, Schedule 4 warranties and founder caps
 * (sample B). The master is written for "the Investor" and several
 * founders; it is read as "the Lead Investor", in the singular, or with
 * the Company as the only warrantor at the end (reword()).
 */

import type { Block } from "../contract/parse";
import { formatDate, joinAnd, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import {
  AGREED, BETWEEN, COMPANY_PARTY, DEFINITIONS, EXECUTED, FOUNDERS_PARTY, INTERPRETATION, INVESTOR_COMPANY, INVESTOR_INDIVIDUAL,
  LIQUIDITY_EVENT, MADE_ON, PARTIES_COLLECTIVE, PREF_TERMS, RECITAL_CAPITAL, RECITAL_INCORPORATED, RECITAL_LEAD, RECITAL_SAFE,
  RECITAL_SUBSCRIPTION, SECTIONS, TITLE, WARRANTIES, WHEREAS, type Definition, type MasterClause, type MasterSub,
} from "./data/master";
import { applyDefaults, founderCount, picks } from "./questions";
import type { Answers, Flag, IaInput } from "./types";

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
const MAY_BE_EMPTY = new Set(["safe_date", "sha_and", "td_docs", "led_by", "subject_to_sha", "including_lead", "further_docs"]);

/** "50,000" → 50000; anything that is not a plain number → NaN. */
export function num(raw: string): number {
  const s = String(raw ?? "").replace(/[,\s]/g, "").replace(/^(S\$|US\$|SGD|USD|\$)/i, "").replace(/shares?$/i, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const count = (n: number) => (Number.isInteger(n) && n > 0 && n < 1000 ? `${numberWords(n)} (${n})` : String(n));
const months = (n: number) => (Number.isFinite(n) && n > 0 ? `${count(n)} month${n === 1 ? "" : "s"}` : GAP);

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

function relist(items: MasterSub[]): MasterSub[] {
  const numbered = items.filter((s) => s.ref);
  if (numbered.length === 0) return items;
  const roman = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$/.test(numbered[0].ref ?? "");
  /* The list keeps its own ending (a nested list ends in ";") and its own "and" / "or". */
  const origLast = numbered[numbered.length - 1].text.trim();
  const end = /,$/.test(origLast) ? "," : /;$/.test(origLast) ? ";" : ".";
  const conj = numbered.map((s) => /;\s*(and|or)\s*$/.exec(s.text.trim())?.[1]).find(Boolean) ?? "and";
  let i = 0;
  return items.map((s) => {
    if (!s.ref) return s;
    const last = i === numbered.length - 1;
    const penult = i === numbered.length - 2;
    const trailingColon = /:\s*$/.test(s.text.trim());
    let text = s.text.replace(/\s*(;\s*(and|or)|;|,|\.)\s*$/, "");
    if (trailingColon) text = s.text;
    else if (last) text += end;
    else if (penult) text += `; ${conj}`;
    else text += ";";
    const ref = roman ? `(${ROMAN[i]})` : `(${String.fromCharCode(97 + i)})`;
    i += 1;
    return { ...s, ref, text };
  });
}

/* ── rewording: the lead investor, one founder, one warrantor ──────────── */

const LEAD: [RegExp, string][] = [[/(?<!Lead )\bInvestor\b/g, "Lead Investor"]];

const COMPANY_ONLY: [RegExp, string][] = [
  [/\bso far as the Warrantors are aware\b/g, "so far as the Company is aware"],
  [/\bthe Warrantors' awareness\b/g, "the Company's awareness"],
  [/\bthe Warrantors\b/g, "the Company"],
  [/\bThe Warrantors\b/g, "The Company"],
];

const ONE_FOUNDER: [RegExp, string][] = [
  [/\beach of the Founders\b/g, "the Founder"],
  [/\bEach Founder's\b/g, "The Founder's"],
  [/\bEach Founder\b/g, "The Founder"],
  [/\beach Founder\b/g, "the Founder"],
  [/\bsuch Founder\b/g, "the Founder"],
  [/\bany Founder\b/g, "the Founder"],
  [/\bFounders\b/g, "Founder"],
];

const apply = (t: string, rules: [RegExp, string][]) => rules.reduce((acc, [re, to]) => acc.replace(re, to), t);

export function assemble(input: IaInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const { company, investor } = input;
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();
  const own: string[] = [];
  const fdUsed: string[] = [];

  const lead = str(a.IA1) === "lead";
  const simple = !lead;
  const founders = lead ? input.founders.slice(0, founderCount(a)).filter((x) => str(x.name)) : [];
  const nFdr = lead ? Math.max(founders.length, founderCount(a)) : 0;
  const usd = str(a.IA2) === "USD";
  const cur = usd ? "US$" : "S$";
  const preference = str(a.IA3) === "preference";
  const typedClass = str(a.IA3a) === "other";
  const klass = preference ? (typedClass ? str(a.IA3b) : str(a.IA3a) || "Seed Preference Shares") : "Ordinary Shares";
  if (preference && typedClass && klass) own.push("the class name");
  const lp = str(a.IA16) !== "none";
  const voting = str(a.IA17) !== "non_voting";
  const conversion = str(a.IA18) || "convertible";
  const conds = lead ? picks(a, "IA5").filter((x) => x !== "none") : [];
  const conditional = conds.length > 0;
  const sha = str(a.IA6) !== "no";
  const constitution = str(a.IA7) !== "no";
  const boardSeat = lead && str(a.IA8) !== "no";
  const invDocs = picks(a, "IA9").filter((x) => x !== "none");
  const safe = simple && str(a.IA10) === "yes";
  const round = simple && str(a.IA11) === "yes";
  const companyOnly = simple || str(a.IA12) === "company" || nFdr === 0;
  const joint = lead && !companyOnly && str(a.IA12a) === "joint";
  const und = (simple ? picks(a, "IA15") : picks(a, "IA15l")).filter((x) => x !== "none");
  const individual = investor.kind !== "company";

  /* ── the numbers ───────────────────────────────────────────────────── */
  const shares = num(str(investor.shares));
  const amount = num(str(investor.amount));
  if (!Number.isFinite(shares)) missing.add("number of Subscription Shares");
  if (!Number.isFinite(amount)) missing.add("Investment Amount");
  const fmt = (n: number, dp = 2) => (Number.isFinite(n) ? `${cur}${n.toLocaleString("en-GB", { maximumFractionDigits: dp })}` : GAP);
  const price = Number.isFinite(shares) && Number.isFinite(amount) && shares > 0 ? amount / shares : NaN;
  const issued = num(str(company.issued_shares));
  const capRaw = str(a.IA14) === "other" ? num(str(a.IA14a)) : num(str(a.IA14) || "150000");

  /* ── recitals ──────────────────────────────────────────────────────── */
  const recitals: string[] = [RECITAL_INCORPORATED, RECITAL_CAPITAL, RECITAL_SUBSCRIPTION];
  if (safe) recitals.push(RECITAL_SAFE);
  if (round) recitals.push(RECITAL_LEAD);
  const letter = (i: number) => `(${String.fromCharCode(65 + i)})`;

  /* ── the fields ────────────────────────────────────────────────────── */
  const safeDate = str(a.IA10a);
  const leadName = str(a.IA11a);
  const docs = [sha ? "the Shareholders' Agreement" : "", safe ? "the Investor SAFE Conversion Notice" : ""].filter(Boolean);
  const f: Record<string, string> = {
    date: formatDate(today),
    company_name: str(company.name),
    company_reg_no: str(company.reg_no),
    company_address: oneLine(str(company.address)),
    issued_capital: str(company.issued_capital),
    issued_shares: Number.isFinite(issued) ? issued.toLocaleString("en-GB") : str(company.issued_shares),
    amount: fmt(amount),
    shares: Number.isFinite(shares) ? shares.toLocaleString("en-GB") : "",
    price: Number.isFinite(price) ? `${cur}${(Math.round(price * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "",
    share_word: klass,
    class: klass,
    class_lower: klass.toLowerCase().replace(/\bseries ([a-z])\b/g, (_, l: string) => `Series ${l.toUpperCase()}`),
    class_title: klass.replace(/ Shares$/, " Share"),
    class_singular: klass.replace(/Shares$/, "Share"),
    class_holder: klass.replace(/ Shares$/, " Shareholder"),
    pref_schedule: simple ? "1" : "5",
    account_name: str(company.account_name),
    bank_name: str(company.bank_name),
    account_no: str(company.account_no),
    swift: str(company.swift),
    safe_date: safeDate ? `on ${safeDate} ` : "",
    lead_name: leadName,
    subscription_recital: letter(2),
    safe_recital: letter(3),
    lead_recital: letter(safe ? 4 : 3),
    sha_approver: lead ? "the Company and the Investor" : "the Board",
    sha_and: sha ? " and the Shareholders' Agreement" : "",
    td_docs: docs.length ? `, ${docs.join(", ")}` : "",
    longstop: months(Number(str(a.IA5a) || "2")),
    claims_period: months(Number(lead ? str(a.IA13l) || "18" : str(a.IA13) || "12")),
    claim_parties: lead ? "the Warrantors" : "the Company",
    claim_word: lead ? "Claim" : "claim",
    founder_cap: fmt(capRaw, 0),
    warranty_heading: "Warranties",
    warranty_lead: companyOnly ? "The Company represents and warrants" : `The Warrantors ${joint ? "jointly and severally" : "severally"} represent and warrant`,
    warrantors: companyOnly ? "the Company" : "the Company and each of the Founders",
    docs_list: docs.join(", "),
    led_by: round && sha ? ", the negotiation of which will be led by the Company and the Lead Investor" : "",
    transfer_exception: "save for a transfer permitted under paragraph (b) below",
    transfer_rule: sha
      ? "the Subscription Shares shall only be transferred in accordance with the terms of the Shareholders' Agreement."
      : "the Subscription Shares shall only be transferred with the prior written approval of the Board.",
    subject_to_sha: sha ? ", subject to the terms of the Shareholders' Agreement" : "",
    including_lead: round ? ", including but not limited to the Lead Investor" : "",
    further_docs: docs.length ? `, including but not limited to ${docs.join(" and/or ")}` : "",
    transfer_subject: sha ? "Subject to the Shareholders' Agreement, " : "",
    liquidity_def: `means any of the following: ${LIQUIDITY_EVENT.map((t, i) => `(${String.fromCharCode(97 + i)}) ${t}`).join(" ").replace(/;$/, ";")}`,
  };
  if (round && !leadName) missing.add("lead investor's name");
  if (!sha) fdUsed.push("transfers with Board approval (no shareholders' agreement)");
  if (individual) fdUsed.push("individual investor");
  if (!preference) fdUsed.push("ordinary shares");

  const completionDate = simple && str(a.IA4) === "date" ? str(a.IA4a) : "";
  if (conditional) {
    f.completion_text =
      "**Completion.** Subject to the satisfaction of the Conditions Precedent (which have not been waived by the Investor in writing), Completion shall take place ten (10) Business Days from the date of receipt by the Investor of the CP Confirmation Certificate or such other date that is mutually agreed to among the Parties (the \"**Completion Date**\") electronically or at such physical place as the Parties may mutually agree in writing.";
    f.completion_date_def = "has the meaning given to it in {{clause:completion_when}};";
  } else {
    f.completion_text =
      "**Completion.** Completion shall take place on the Completion Date at such time and place as may be agreed by the Parties (including over email correspondences, electronically and/or DocuSign).";
    f.completion_date_def = completionDate
      ? `refers to the date that Completion takes place, being a date that falls no later than ${completionDate} or such other date agreed by the Parties in writing;`
      : "means the date of this Agreement or such other date agreed by the Parties in writing;";
    if (completionDate) own.push("the completion date");
    fdUsed.push(lead ? "completion on signing (no conditions)" : "the Completion Date");
  }

  f.company_cap_text = lead
    ? "**Limitation of Claims.** The Company's aggregate liability to the Investor in respect of a breach of any of the Warranties set out in {{section:warranties}} shall be limited to the Investment Amount. The Company shall not be liable in respect of any breach of any Warranty:"
    : "**Limitation of Claims.** The Company's aggregate liability to the Investor in respect of a breach of any of the warranties set out in {{section:warranties}} shall be limited to the Investment Amount.";

  f.assignment_text = lead
    ? "**Assignment.** The Parties agree that the Investor may, with the prior written consent of the Company whose consent shall not be unreasonably withheld, assign its rights and benefits under this Agreement to any Affiliate. Save as aforesaid, no Party may assign its rights under this Agreement without the prior written consent of the other Parties."
    : "**Assignment.** Neither Party may assign their rights under this Agreement or subcontract its obligations to a third party. The Parties shall not assign this Agreement or any rights under this Agreement without the other Party's prior written consent, and the Investor shall not grant security over this Agreement.";
  if (lead) fdUsed.push("assignment otherwise only with consent");

  /* ── which clauses ─────────────────────────────────────────────────── */
  const drop = new Set<string>();
  const dropSection = new Set<string>();
  const dropSub = new Set<string>();

  if (simple || nFdr === 0) drop.add("waiver");
  if (!conditional) dropSection.add("conditions");
  else {
    const map: Record<string, string> = { approvals: "cp_approvals", compliance: "cp_compliance", no_prohibition: "cp_no_prohibition", no_breach: "cp_no_breach" };
    for (const [k, id] of Object.entries(map)) if (!conds.includes(k)) dropSub.add(id);
  }

  if (!invDocs.includes("authority")) dropSub.add("io_authority");
  if (!invDocs.includes("application")) dropSub.add("io_application");
  if (!boardSeat) dropSub.add("io_director");
  if (!sha) dropSub.add("io_sha");
  if (!boardSeat) dropSub.add("cb_director");
  if (!constitution) {
    dropSub.add("cb_constitution");
    dropSub.add("cs_constitution");
  }
  if (simple) {
    if (boardSeat) fdUsed.push("board seat");
  }

  if (simple) {
    drop.add("warranties_given");
    drop.add("qualifications");
  } else drop.add("company_warranties");
  dropSub.add(individual ? "iw_company" : "iw_individual");
  if (individual) dropSub.add("iw_constitution");

  if (simple) {
    drop.add("founder_cap");
    drop.add("double_recovery");
    drop.add("mitigation");
    for (const id of ["cc_law", "cc_accounting", "cc_approval", "cc_disclosed", "cc_permitted"]) dropSub.add(id);
  } else if (companyOnly) drop.add("founder_cap");

  if (!safe) drop.add("safe_ack");
  if (lead || docs.length === 0) drop.add("transaction_docs");
  if (!und.includes("transfers")) drop.add("covenants");
  const ackMap: Record<string, string> = { esop: "ia_esop", other_terms: "ia_other_terms", fundraising: "ia_fundraising", liquidity: "ia_liquidity" };
  for (const [k, id] of Object.entries(ackMap)) if (!und.includes(k)) dropSub.add(id);
  if (!Object.keys(ackMap).some((k) => und.includes(k))) drop.add("acknowledgements");
  if (!und.includes("non_disparagement")) drop.add("non_disparagement");
  if (lead && und.some((x) => x !== "non_disparagement")) fdUsed.push("lead investor undertakings (from the simple-investor form)");

  if (!sha) drop.add("precedence");

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
    if (lead) out = apply(out, LEAD);
    if (lead && companyOnly) out = apply(out, COMPANY_ONLY);
    if (nFdr === 1) out = apply(out, ONE_FOUNDER);
    return out;
  };
  const fill = (text: string, extra: Record<string, string> = {}) => {
    let t = fillOnce(text, extra);
    if (t.includes("{{")) t = fillOnce(t, extra);
    t = t.replace(/\bClause (\d+(?:\.\d+)*) (and|or|to) Clause (\d+(?:\.\d+)*)/g, "Clauses $1 $2 $3");
    return reword(t);
  };

  /* ── the blocks ────────────────────────────────────────────────────── */
  const blocks: Block[] = [];
  const plain = (text: string, cont = false) => blocks.push({ kind: "plain", num: "", text, ...(cont ? { cont: true } : {}) });
  const sub = (n: string, text: string, level: 1 | 2 | 3 = 1) => blocks.push({ kind: "subclause", num: n, text, level });

  blocks.push({ kind: "title", num: "", text: TITLE });
  plain(fill(MADE_ON));
  plain(BETWEEN);
  let p = 0;
  blocks.push({ kind: "party", num: `(${++p})`, text: `${fill(COMPANY_PARTY)};` });
  if (lead) {
    const fp = nFdr === 1 ? "The person whose name and address are set out in Schedule 1 (the \"**Founder**\")" : FOUNDERS_PARTY;
    blocks.push({ kind: "party", num: `(${++p})`, text: `${fp}; and` });
  } else {
    blocks[blocks.length - 1].text = blocks[blocks.length - 1].text.replace(/;$/, "; and");
  }
  const invVals = { name: str(investor.name) || GAP, id_no: str(investor.id_no), jurisdiction: str(investor.jurisdiction) || "Singapore", address: oneLine(str(investor.address)) };
  if (!str(investor.name)) missing.add("investor");
  blocks.push({ kind: "party", num: `(${++p})`, text: `${fill(individual ? INVESTOR_INDIVIDUAL : INVESTOR_COMPANY, invVals)} ${reword('(the "**Investor**")')}` });
  plain(PARTIES_COLLECTIVE);
  plain(`**${WHEREAS}**`);
  recitals.forEach((r, i) => blocks.push({ kind: "recital", num: letter(i), text: fill(r) }));
  plain(AGREED);

  const termUsed = (term: string) => {
    switch (term) {
      case "ESOP": return und.includes("esop") && Boolean(clauseNo.acknowledgements);
      case "Fundraising Exercise":
      case "Securities": return und.includes("fundraising") && Boolean(clauseNo.acknowledgements);
      case "Liquidity Event": return (und.includes("liquidity") && Boolean(clauseNo.acknowledgements)) || preference;
      case "Warrantors": return lead && !companyOnly;
      case "Equity Securities": return lead;
      default: return true;
    }
  };
  const defsFor = (): Definition[] =>
    DEFINITIONS.filter((d) => {
      if (!termUsed(d.term)) return false;
      switch (d.when) {
        case undefined: return true;
        case "lead": case "warranties": case "affiliate": return lead;
        case "simple": return simple;
        case "cp": return conditional;
        case "constitution": return constitution;
        case "sha": return sha;
        case "safe": return safe;
        case "round": return round;
        case "pref": return preference;
        case "liquidity": return preference && lp;
        case "usd": return usd;
        case "convert": return preference && conversion !== "none";
      }
    })
      .map((d) => ({ ...d, term: fill(d.term) }))
      .sort((x, y) => x.term.localeCompare(y.term, "en-GB", { sensitivity: "base" }));

  const included: string[] = [];
  const prune = (list: MasterSub[]): MasterSub[] => {
    const kept = list.filter((s) => !(s.id && dropSub.has(s.id)));
    return kept.length === list.length ? kept : relist(kept);
  };
  const emit = (s: MasterSub, level: 1 | 2 | 3) => {
    const text = fill(s.text);
    if (s.ref) sub(s.ref, text, level);
    else if (text) plain(text, true);
    for (const t of prune(s.subs ?? [])) emit(t, Math.min(3, level + 1) as 1 | 2 | 3);
  };

  built.forEach((sec, si) => {
    blocks.push({ kind: "section", num: "", text: `${si + 1}. ${lead ? sec.heading.replace(/^INVESTOR/, "LEAD INVESTOR") : sec.heading}` });
    sec.clauses.forEach((c, ci) => {
      included.push(c.id);
      const n = `${si + 1}.${ci + 1}`;
      const kept = prune(c.subs ?? []);
      /* One item left of a list: it reads as one sentence. */
      if (kept.length === 1 && kept[0].ref && !kept[0].subs && /:\s*$/.test(c.text) && !/\)\s*:\s*$/.test(c.text) && !c.tail) {
        const joined = `${c.text.replace(/:\s*$/, "")} ${kept[0].text.replace(/\s*(;\s*(and|or)|;)\s*$/, ".").replace(/,\s*$/, ".")}`;
        blocks.push({ kind: "clause", num: n, text: fill(joined) });
        return;
      }
      blocks.push({ kind: "clause", num: n, text: fill(c.text) });
      if (c.id === "definitions") {
        const defs = defsFor();
        defs.forEach((d, i) => {
          const last = i === defs.length - 1;
          const penult = i === defs.length - 2;
          let text = fill(d.text).replace(/\s*(;\s*and|;|\.)\s*$/, "");
          text += last ? "." : penult ? "; and" : ";";
          plain(`"**${d.term}**" ${text}`, true);
        });
        return;
      }
      if (c.id === "interpretation_rules") {
        const rules = INTERPRETATION.filter((r) => (r.id === "agreed_form" ? constitution : r.id === "several" ? lead && !joint : true));
        rules.forEach((r, i) => sub(`(${String.fromCharCode(97 + i)})`, fill(r.text), 1));
        return;
      }
      for (const s of kept) emit(s, 1);
      if (c.tail) plain(fill(c.tail), true);
    });
  });

  /* Signature page. */
  plain(EXECUTED);
  const signLines = (head: string, lines: string[]) => {
    blocks.push({ kind: "sign-head", num: "", text: head });
    for (const l of lines) blocks.push({ kind: "sign", num: "", text: l });
  };
  const line = "___________________________";
  plain("**THE COMPANY**");
  signLines(`SIGNED by ${str(company.signatory_name) || GAP} for and on behalf of ${f.company_name || GAP}`, [line, `Name: ${str(company.signatory_name) || GAP}`, `Title: ${str(company.signatory_title) || GAP}`, `Email: ${str(company.signatory_email) || GAP}`]);
  if (!str(company.signatory_email)) missing.add("Company's notice e-mail");
  if (lead) {
    plain(nFdr === 1 ? "**THE FOUNDER**" : "**THE FOUNDERS**");
    for (let i = 0; i < nFdr; i++) {
      const x = founders[i];
      const nm = x ? str(x.name) : GAP;
      signLines(`SIGNED by ${nm}`, [line, `Name: ${nm}`, `Email: ${(x && str(x.email)) || GAP}`]);
    }
    if (founders.length < nFdr) missing.add("founder");
  }
  plain(lead ? "**THE LEAD INVESTOR**" : "**THE INVESTOR**");
  const invName = str(investor.name) || GAP;
  if (individual) signLines(`SIGNED by ${invName}`, [line, `Name: ${invName}`, `Email: ${str(investor.email) || GAP}`]);
  else signLines(`SIGNED by ${str(investor.signatory_name) || GAP} for and on behalf of ${invName}`, [line, `Name: ${str(investor.signatory_name) || GAP}`, `Title: ${str(investor.signatory_title) || GAP}`, `Email: ${str(investor.email) || GAP}`]);
  if (!str(investor.email)) missing.add("investor's notice e-mail");

  /* Schedules. */
  const schedule = (n: number, title: string) => {
    blocks.push({ kind: "section", num: "", text: `SCHEDULE ${n}` });
    plain(`**${title}**`);
  };
  const row = (k: string, v: string) => plain(`${k}: ${v || GAP}`, true);

  if (lead) {
    schedule(1, nFdr === 1 ? "THE FOUNDER" : "THE FOUNDERS");
    for (let i = 0; i < nFdr; i++) {
      const x = founders[i];
      sub(`${i + 1}.`, `**${(x && str(x.name)) || GAP}** — address: ${(x && oneLine(str(x.address))) || GAP}; e-mail: ${(x && str(x.email)) || GAP}.`, 1);
    }

    schedule(2, "PARTICULARS OF THE COMPANY");
    row("Name", f.company_name);
    row("Registration number", f.company_reg_no);
    row("Date of incorporation", str(company.incorporated_on));
    row("Registered office", f.company_address);
    row("Directors", str(company.directors).split(/\s*;\s*/).filter(Boolean).join("; "));
    row("Issued and paid-up share capital", [f.issued_capital, f.issued_shares ? `${f.issued_shares} Ordinary Shares` : ""].filter(Boolean).join(", comprising "));
    if (!f.issued_capital) missing.add("issued_capital");

    schedule(3, "CAPITALISATION");
    plain("To be completed by the Parties before signing.");
    const table = (title: string, after: boolean) => {
      plain(`**${title}**`);
      let k = 0;
      for (let i = 0; i < nFdr; i++) sub(`${++k}.`, `${(founders[i] && str(founders[i].name)) || GAP}: ${GAP} Ordinary Shares (${GAP}%)`, 1);
      sub(`${++k}.`, `[Other shareholders]: ${GAP} Shares (${GAP}%)`, 1);
      if (after) sub(`${++k}.`, `${invName}: ${f.shares || GAP} ${klass} (${GAP}%)`, 1);
      const total = after ? (Number.isFinite(issued) && Number.isFinite(shares) ? (issued + shares).toLocaleString("en-GB") : GAP) : f.issued_shares || GAP;
      plain(`Total: ${total} Shares (100%)`, true);
    };
    table("Part 1 — Immediately before Completion", false);
    table("Part 2 — Immediately after Completion", true);

    schedule(4, "REPRESENTATIONS AND WARRANTIES");
    WARRANTIES.forEach((w, i) => {
      blocks.push({ kind: "clause", num: `${i + 1}.`, text: fill(`**${w.title}.** ${w.text}`) });
      (w.subs ?? []).forEach((t, k) => sub(`(${String.fromCharCode(97 + k)})`, fill(t), 1));
    });
  }

  if (preference) {
    schedule(simple ? 1 : 5, `${klass.replace(/ Shares$/, " Share").toUpperCase()} TERMS`);
    plain(fill(`The {{class}} shall have the following rights and be subject to the following conditions.`));
    const keep = (id?: string) => {
      switch (id) {
        case undefined: return true;
        case "lp": return lp;
        case "lp_none": return !lp;
        case "vote_as_converted": return voting;
        case "vote_as_converted_conv": return voting && conversion !== "none";
        case "vote_non": return !voting;
        case "transfer": return simple;
        case "conv": return conversion !== "none";
        case "conv_basic": return conversion === "convertible";
        case "conv_ratchet": return conversion === "ratchet";
        default: return true;
      }
    };
    let k = 0;
    for (const para of PREF_TERMS) {
      if (!keep(para.id)) continue;
      if (para.fd) fdUsed.push(para.id === "lp_none" ? "no liquidation preference" : "1:1 conversion without a ratchet");
      if (para.heading) {
        plain(`**${para.heading}**`);
        continue;
      }
      blocks.push({ kind: "clause", num: `${++k}.`, text: fill(para.text ?? "") });
      (para.subs ?? []).forEach((t, i) => sub(`(${String.fromCharCode(97 + i)})`, fill(t), 1));
      if (para.tail) plain(fill(para.tail), true);
    }
  }

  /* ── what the lawyer should know ───────────────────────────────────── */
  if (own.length) {
    flags.push({ level: "yellow", scenario: "IA21", title: "Your own wording", reason: `Wording you typed has gone into the agreement as written: ${joinAnd(Array.from(new Set(own)))}. Have your lawyer check it.` });
  }
  if (fdUsed.length) {
    flags.push({
      level: "green",
      scenario: "FD",
      title: "FD supplementary wording",
      reason: `Wording not in either FD sample, written in their style for the answers given: ${joinAnd(Array.from(new Set(fdUsed)))}. For FD review.`,
    });
  }

  return { blocks, missing: Array.from(missing), flags, fields: f, included };
}
