/**
 * Answers → share purchase agreement.
 *
 * Deterministic, as the SHA assembler is: the same answers give the same
 * agreement, every time, from the wording in data/master.ts and
 * data/warranties.ts, with nothing invented. No model is called.
 *
 * The master is written for one or more sellers ("the Sellers", "each
 * Seller"). With one seller every line is read in the singular at the end
 * (singular()), so the wording is kept once.
 *
 * What comes out:
 *   blocks    the agreement, as the document editor draws it
 *   missing   fields nothing could fill — shown as [●] and reported
 *   flags     what a lawyer should look at
 *   included  the clause ids that went in (for tests and the admin view)
 */

import type { Block } from "../contract/parse";
import { formatDate, joinAnd, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import {
  AGREED, BETWEEN, DEFINITIONS, EXECUTED, MADE_ON, PART_A, PART_C, PARTY_COMPANY, PARTY_INDIVIDUAL, RECITAL_A,
  RECITAL_B_ALL, RECITAL_B_PART, RECITAL_C, RECITAL_D, SECTIONS, SELLERS_COLLECTIVE, TITLE, WHEREAS,
  type Definition, type MasterClause, type MasterSub, type ScheduleGroup,
} from "./data/master";
import { PART_B } from "./data/warranties";
import { applyDefaults, picks } from "./questions";
import type { Answers, Flag, Party, SpaInput } from "./types";

export interface Assembled {
  blocks: Block[];
  missing: string[];
  flags: Flag[];
  fields: Record<string, string>;
  included: string[];
}

const GAP = "[●]";

/** Fields that are meant to be empty sometimes. */
const MAY_BE_EMPTY = new Set(["cashfree_phrase", "payment_tail", "debt_deduct", "tax_survival_sentence", "access_lead"]);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ", ").trim();

/** "5,000" → 5000; anything that is not a plain number → NaN. */
export function num(raw: string): number {
  const s = String(raw ?? "").replace(/[,\s]/g, "").replace(/^(S\$|US\$|SGD|USD|\$)/i, "").replace(/shares?$/i, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

function count(n: number): string {
  return Number.isInteger(n) && n > 0 && n < 1000 ? `${numberWords(n)} (${n})` : String(n);
}

function years(n: number): string {
  return `${count(n)} year${n === 1 ? "" : "s"}`;
}

function months(n: number): string {
  return `${count(n)} month${n === 1 ? "" : "s"}`;
}

function pct(n: number): string {
  return Number.isInteger(n) && n > 0 && n <= 100 ? `${numberWords(n)} per cent. (${n}%)` : `${n} per cent. (${n}%)`;
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi"];

/** Re-letter a run after some items were dropped and put "and"/"or" before the last. */
function relist(items: MasterSub[], conj: "and" | "or"): MasterSub[] {
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
    else if (penult) text += `; ${conj}`;
    else text += ";";
    const ref = roman ? `(${ROMAN[i]})` : `(${String.fromCharCode(97 + i)})`;
    i += 1;
    return { ...s, ref, text };
  });
}

/* ── one seller: the master read in the singular ─────────────────────── */

const SINGULAR: [RegExp, string][] = [
  [/\(in the proportions set out in Schedule 2\) /g, ""],
  [/,? in the proportions set out in Schedule 2/g, ""],
  [/ \(or, in the case of a Seller which is a company, of that Seller\)/g, " or of the Seller"],
  [/\bthe Sellers are the legal and beneficial owners\b/g, "the Seller is the legal and beneficial owner"],
  [/\bthe Sellers agree to\b/g, "the Seller agrees to"],
  [/\bThe Sellers who is an individual\b/g, "The Seller"],
  [/\bEach Seller who is an individual\b/g, "The Seller"],
  [/\bEach Seller which is a company is\b/g, "The Seller is"],
  [/\bfrom each Seller who is a director of the Target Company\b/g, "from the Seller, if a director of the Target Company"],
  [/\bno Seller shall, and each Seller shall procure\b/g, "the Seller shall not, and shall procure"],
  [/\beach of the Sellers\b/g, "the Seller"],
  [/\bEach of the Sellers\b/g, "The Seller"],
  [/\bno Seller is aware\b/g, "the Seller is not aware"],
  [/\bno Seller shall\b/g, "the Seller shall not"],
  [/\bNo Seller shall\b/g, "The Seller shall not"],
  [/\bEach Seller\b/g, "The Seller"],
  [/\beach Seller\b/g, "the Seller"],
  [/\bany Seller\b/g, "the Seller"],
  [/\bAny Seller\b/g, "The Seller"],
  [/\bthat Seller\b/g, "the Seller"],
  [/\ba Seller\b/g, "the Seller"],
  [/\bthe Sellers acknowledge\b/g, "the Seller acknowledges"],
  [/\bThe Sellers acknowledge\b/g, "The Seller acknowledges"],
  [/\bthe Sellers undertake\b/g, "the Seller undertakes"],
  [/\bthe Sellers have\b/g, "the Seller has"],
  [/\bthe Sellers are\b/g, "the Seller is"],
  [/\bpaid by them\b/g, "paid by it"],
  [/\bSellers'/g, "Seller's"],
  [/\bSellers\b/g, "Seller"],
];

export function singular(t: string): string {
  return SINGULAR.reduce((acc, [re, to]) => acc.replace(re, to), t);
}

/* ── the price ───────────────────────────────────────────────────────── */

function money(n: number, cur: string): string {
  if (!Number.isFinite(n)) return GAP;
  const shown = n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  return `${cur}${shown}`;
}

export function assemble(input: SpaInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const { target, buyer } = input;
  const sellers = input.sellers.filter((s) => str(s.name));
  const one = sellers.length <= 1;
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();
  const own: string[] = [];
  const fdUsed: string[] = [];

  /* ── the choices ───────────────────────────────────────────────────── */
  const whole = str(a.P3) !== "part";
  const cur = str(a.P4) === "USD" ? "US$" : "S$";
  const payment = str(a.P5) || "closing";
  const cashfree = str(a.P6) === "yes";
  const conditions = picks(a, "P7").filter((c) => c !== "none");
  const conditional = conditions.length > 0;
  const keyPeople = conditions.includes("key_people") ? picks(a, "P7a") : [];
  const conduct = conditional && str(a.P10) !== "no";
  const termination = conditional ? picks(a, "P11").filter((c) => c !== "none") : [];
  const full = str(a.P14) !== "title";
  const indemnities = picks(a, "P18").filter((c) => c !== "none");
  const restraints = picks(a, "P19").filter((c) => c !== "none");
  const buyerCompany = buyer.kind !== "individual";
  const mac = conditions.includes("no_mac") || termination.includes("mac");

  /* ── the numbers ───────────────────────────────────────────────────── */
  const shares = sellers.map((s) => num(str(s.shares)));
  const prices = sellers.map((s) => num(str(s.price)));
  const totalShares = shares.every(Number.isFinite) && shares.length ? shares.reduce((x, y) => x + y, 0) : NaN;
  const totalPrice = prices.every(Number.isFinite) && prices.length ? prices.reduce((x, y) => x + y, 0) : NaN;
  sellers.forEach((s, i) => {
    if (!Number.isFinite(shares[i])) missing.add(`shares sold by ${str(s.name)}`);
    if (!Number.isFinite(prices[i])) missing.add(`price for ${str(s.name)}`);
  });
  const issued = num(str(target.issued_shares));

  /* ── the fields ────────────────────────────────────────────────────── */
  const f: Record<string, string> = {
    date: formatDate(today),
    target_name: str(target.name),
    target_reg_no: str(target.reg_no),
    target_address: oneLine(str(target.address)),
    business: str(target.business).replace(/\.$/, ""),
    sale_shares: Number.isFinite(totalShares) ? totalShares.toLocaleString("en-GB") : "",
    issued_shares: Number.isFinite(issued) ? issued.toLocaleString("en-GB") : str(target.issued_shares),
    price_total: Number.isFinite(totalPrice) ? money(totalPrice, cur) : "",
    currency: cur,
    accounts_date: str(target.accounts_date),
    seller_parts: full ? "Parts A and B" : "Part A",
    restraint_years: years(Number(str(a.P19a) || "2")),
    survival: years(Number(str(a.P15) || "5")),
  };
  if (whole && !f.issued_shares && f.sale_shares) f.issued_shares = f.sale_shares;

  f.sale_shares_def = whole
    ? "means the {{sale_shares}} ordinary shares in the capital of the Target Company held by the Sellers, representing the entire issued share capital of the Target Company, as set out in Schedule 2;"
    : "means the {{sale_shares}} ordinary shares in the capital of the Target Company to be sold by the Sellers to the Buyer, as set out in Schedule 2;";

  f.cashfree_phrase = cashfree ? ", on a cash-free debt-free basis and subject to adjustment in accordance with {{clause:adjustment}}" : "";

  /* Payment. */
  const closingPct = Number(str(a.P5a) || "70");
  const depositPct = Number(str(a.P5c) || "10");
  const deferredMonths = Number(str(a.P5b) || "6");
  const replace: Record<string, string> = {};
  if (payment === "deferred") {
    f.payment_text = "**Payment.** The Consideration shall be settled by the Buyer to the Sellers in the following manner:";
    f.pay_first = `${pct(closingPct)} of the Consideration shall be paid on the Closing Date; and`;
    f.pay_second = `the balance of ${pct(100 - closingPct)} of the Consideration (the "**Deferred Consideration**") shall be paid on the date falling ${months(deferredMonths)} after the Closing Date.`;
    f.payment_tail = "";
  } else if (payment === "deposit") {
    f.payment_text = "**Payment.** The Consideration shall be settled by the Buyer to the Sellers in the following manner:";
    f.pay_first = `${pct(depositPct)} of the Consideration (the "**Deposit**") shall be paid within five (5) Business Days after the date of this Agreement; and`;
    f.pay_second = "the balance of the Consideration shall be paid on the Closing Date.";
    f.payment_tail = "If this Agreement lapses or is terminated before Closing other than by reason of a breach by the Buyer, the Sellers shall refund the Deposit to the Buyer within five (5) Business Days, without interest.";
    fdUsed.push("deposit");
  } else {
    replace.payment = "**Payment.** The Consideration shall be paid by the Buyer to the Sellers in full on the Closing Date.";
  }
  f.debt_deduct = payment === "deferred" ? " (or, at the Buyer's option, deducted from the Deferred Consideration)" : "";

  /* Before and at Closing. */
  f.longstop = months(Number(str(a.P8) || "3"));
  f.closing_text = conditional
    ? `**Closing Date.** Subject to the fulfilment or waiver of the conditions set out in {{clause:cp}} (as the case may be), Closing shall take place on the date falling ${count(Number(str(a.P9) || "10"))} Business Days after the date on which the last of those conditions is fulfilled or waived, or such other date as the Parties may agree in writing (the "**Closing Date**").`
    : `**Closing Date.** Closing shall take place on the date of this Agreement, immediately after its execution, or such other date as the Parties may agree in writing (the "**Closing Date**").`;
  f.access_lead = conduct ? "Without prejudice to the generality of {{clause:conduct}}, " : "";
  f.control_phrase = whole ? "the ability of the Buyer to exercise control over the Target Company" : "the rights of the Buyer as a shareholder of the Target Company";

  /* Claims. */
  const capPct = Number(str(a.P16a).replace(/%/g, ""));
  f.cap_amount = str(a.P16) === "pct" ? `${pct(capPct)} of the Consideration` : "the Consideration";
  f.liability_text =
    str(a.P17) === "joint"
      ? "**Liability of the Sellers.** The obligations and liabilities of the Sellers under this Agreement are joint and several."
      : "**Liability of the Sellers.** The obligations and liabilities of the Sellers under this Agreement are several and not joint. Each Seller shall be liable only for such proportion of any claim under this Agreement as the number of Sale Shares sold by it bears to the total number of Sale Shares, save that each Seller shall be wholly liable for any breach of its own obligations, and of the warranties given in respect of itself and its own Sale Shares in Part A of Schedule 3.";
  const taxSurv = str(a.P15a);
  f.tax_survival_sentence =
    full && taxSurv && taxSurv !== "same"
      ? ` Notwithstanding the foregoing, the Sellers' Warranties relating to Taxation and to compliance with applicable Laws, and the corresponding indemnification obligations, shall survive for ${years(Number(taxSurv))} after the Closing Date.`
      : "";
  f.indemnity_other = str(a.P18a).replace(/\.$/, "");
  if (f.indemnity_other) own.push("specific indemnity");

  /* General. */
  f.stamp_sentence = {
    buyer: "All stamp duty payable in respect of the transfer of the Sale Shares shall be borne by the Buyer.",
    equal: "All stamp duty payable in respect of the transfer of the Sale Shares shall be borne by the Sellers (in the proportions set out in Schedule 2) and the Buyer in equal shares.",
    sellers: "All stamp duty payable in respect of the transfer of the Sale Shares shall be borne by the Sellers in the proportions set out in Schedule 2.",
  }[str(a.P20) || "buyer"] ?? "";
  f.disputes_text =
    str(a.P21) === "courts"
      ? "**Disputes.** Each Party irrevocably submits to the exclusive jurisdiction of the courts of Singapore in respect of any dispute, controversy, difference or claim arising out of or relating to this Agreement, including the existence, validity, interpretation, performance, breach or termination thereof or any dispute regarding non-contractual obligations arising out of or relating to it."
      : "**Disputes.** Any dispute, controversy, difference or claim arising out of or relating to this Agreement, including the existence, validity, interpretation, performance, breach or termination thereof or any dispute regarding non-contractual obligations arising out of or relating to it shall be referred to and finally resolved by arbitration administered by the Singapore International Arbitration Centre under the Arbitration Rules of the Singapore International Arbitration Centre in force when the Notice of Arbitration is submitted. The seat of arbitration shall be Singapore. The Parties shall appoint one arbitrator, as mutually agreed between them. The arbitration proceedings shall be conducted in English.";
  if (str(a.P21) === "courts") fdUsed.push("court jurisdiction");

  /* ── which clauses ─────────────────────────────────────────────────── */
  const drop = new Set<string>();
  const dropSection = new Set<string>();
  const dropSub = new Set<string>();

  if (one) drop.add("all_or_nothing");
  else fdUsed.push("all or nothing");
  fdUsed.push("waiver of pre-emption rights");

  if (payment === "closing") {
    dropSub.add("pay_first");
    dropSub.add("pay_second");
  }
  if (payment !== "deferred") drop.add("set_off");
  else fdUsed.push("set-off against deferred consideration");
  if (!cashfree) drop.add("adjustment");

  if (!conditional) {
    dropSection.add("conditions");
    dropSection.add("pre_closing");
    dropSection.add("termination");
    dropSub.add("sd_cp");
  } else {
    const ids: Record<string, string> = {
      due_diligence: "cp_due_diligence", warranties: "cp_warranties", no_breach: "cp_no_breach", approvals: "cp_approvals",
      no_mac: "cp_no_mac", consents: "cp_consents", key_people: "cp_key_people",
    };
    for (const [k, id] of Object.entries(ids)) if (!conditions.includes(k)) dropSub.add(id);
    if (conditions.includes("approvals")) fdUsed.push("approvals condition");
    if (conditions.includes("consents")) fdUsed.push("third-party consents condition");
    if (!conduct) drop.add("conduct");
    if (!termination.includes("warranty")) drop.add("t_warranty");
    if (!termination.includes("undertakings")) drop.add("t_undertakings");
    if (!termination.includes("mac")) drop.add("t_mac");
    if (termination.length === 0) dropSection.add("termination");
  }

  if (!whole) {
    for (const id of ["sd_books", "sd_seals", "sd_bank", "sd_resign", "cv_handover"]) dropSub.add(id);
    drop.add("board_change");
  }
  if (str(a.P12) === "no") dropSub.add("sd_resign");
  if (str(a.P13) === "no") dropSub.add("sd_waiver");
  else fdUsed.push("sellers' waiver of claims");
  if (!buyerCompany) dropSub.add("bd_board");

  if (restraints.length === 0) dropSection.add("restraints");
  else {
    if (!restraints.includes("no_compete")) dropSub.add("rs_compete");
    if (!restraints.includes("no_poach")) dropSub.add("rs_poach");
    if (!restraints.includes("no_clients")) dropSub.add("rs_clients");
  }

  if (!indemnities.includes("tax")) dropSub.add("gi_tax");
  if (!indemnities.includes("registers")) dropSub.add("si_registers");
  if (!indemnities.includes("other") || !f.indemnity_other) dropSub.add("si_other");
  if (!indemnities.includes("registers") && !(indemnities.includes("other") && f.indemnity_other)) drop.add("specific_indemnities");
  if (one) drop.add("seller_liability");
  else fdUsed.push(str(a.P17) === "joint" ? "joint and several liability" : "several liability");
  if (str(a.P16) !== "price" && str(a.P16) !== "pct") drop.add("cap");
  else fdUsed.push("cap on claims");

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
  const surviving = [f["section:indemnity"], f["section:misc"]].filter(Boolean);
  f.surviving = surviving.length === 2 ? `${surviving[0]} and ${surviving[1]}` : surviving[0] ?? "this Agreement";
  /* "Clause 11 and Clause 12" reads as "Clauses 11 and 12" (fill does it). */

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
    let t = fillOnce(text, extra);
    if (t.includes("{{")) t = fillOnce(t, extra);
    t = t.replace(/\bClause (\d+(?:\.\d+)*) (and|to) Clause (\d+(?:\.\d+)*)/g, "Clauses $1 $2 $3");
    return one ? singular(t) : t;
  };

  /* ── the blocks ────────────────────────────────────────────────────── */
  const blocks: Block[] = [];
  const plain = (text: string, cont = false) => blocks.push({ kind: "plain", num: "", text, ...(cont ? { cont: true } : {}) });
  const sub = (n: string, text: string, level: 1 | 2 | 3 = 1) => blocks.push({ kind: "subclause", num: n, text, level });

  blocks.push({ kind: "title", num: "", text: TITLE });
  plain(fill(MADE_ON));
  plain(`**${BETWEEN}**`);

  const partyLine = (p: Party) =>
    fill(p.kind === "company" ? PARTY_COMPANY : PARTY_INDIVIDUAL, {
      name: str(p.name),
      id_no: str(p.id_no),
      jurisdiction: str(p.jurisdiction) || "Singapore",
      address: oneLine(str(p.address)),
    });
  const buyerParty: Party = { ...buyer, kind: buyerCompany ? "company" : "individual" };
  blocks.push({ kind: "party", num: "(1)", text: `${partyLine(buyerParty)} (the "**Buyer**"); and` });
  const labels = sellers.map((_, i) => `Seller ${i + 1}`);
  if (one) {
    const s = sellers[0];
    blocks.push({ kind: "party", num: "(2)", text: s ? `${partyLine(s)} (the "**Seller**").` : `${GAP} (the "**Seller**").` });
    if (!s) missing.add("seller");
  } else {
    sellers.forEach((s, i) => {
      const last = i === sellers.length - 1;
      const penult = i === sellers.length - 2;
      blocks.push({ kind: "party", num: `(${i + 2})`, text: `${partyLine(s)} ("**${labels[i]}**")${last ? "" : penult ? "; and" : ";"}` });
    });
    plain(fill(SELLERS_COLLECTIVE, { labels: joinAnd(labels) }));
  }

  plain(`**${WHEREAS}**`);
  blocks.push({ kind: "recital", num: "(A)", text: fill(RECITAL_A) });
  blocks.push({ kind: "recital", num: "(B)", text: fill(whole ? RECITAL_B_ALL : RECITAL_B_PART) });
  blocks.push({ kind: "recital", num: "(C)", text: fill(RECITAL_C) });
  if (whole) blocks.push({ kind: "recital", num: "(D)", text: fill(RECITAL_D) });
  plain(fill(AGREED));

  /* The clauses. */
  const included: string[] = [];
  const LISTS_OR = new Set(["restrictions"]);
  const prune = (list: MasterSub[], clauseId: string): MasterSub[] => {
    const kept = list.filter((s) => !(s.id && dropSub.has(s.id))).map((s) => (s.subs ? { ...s, subs: prune(s.subs, clauseId) } : s));
    if (kept.length === list.length) return kept;
    return relist(kept, LISTS_OR.has(clauseId) ? "or" : "and");
  };
  const emit = (s: MasterSub, level: 1 | 2 | 3) => {
    const text = fill(s.text);
    if (s.ref) sub(s.ref, text, level);
    else if (text) plain(text, true);
    for (const t of s.subs ?? []) emit(t, Math.min(3, level + 1) as 1 | 2 | 3);
  };

  const defsFor = (): Definition[] => {
    const on = (w: Definition["when"]): boolean => {
      switch (w) {
        case undefined: return true;
        case "full": return full;
        case "cashfree": return cashfree;
        case "deferred": return payment === "deferred";
        case "deposit": return payment === "deposit";
        case "mac": return mac;
        case "taxation": return indemnities.includes("tax") || full;
        case "usd": return cur === "US$";
        case "sgd": return true;
        case "key_people": return keyPeople.length > 0;
        case "no_key_people": return keyPeople.length === 0;
        case "conditions": return conditional;
      }
    };
    return DEFINITIONS.filter((d) => on(d.when)).filter((d) => {
      /* A definition only for a clause that is not in. */
      if (d.term === "Closing Accounts" || d.term === "Cash and Equivalents" || d.term === "Debt") return Boolean(clauseNo.adjustment);
      if (d.term === "Transfer Documents") return Boolean(clauseNo.seller_deliver);
      return true;
    });
  };

  built.forEach((sec, si) => {
    blocks.push({ kind: "section", num: "", text: `${si + 1}. ${sec.heading}` });
    sec.clauses.forEach((c, ci) => {
      included.push(c.id);
      blocks.push({ kind: "clause", num: `${si + 1}.${ci + 1}`, text: fill(replace[c.id] ?? c.text) });
      if (c.id === "definitions") {
        const defs = defsFor();
        defs.forEach((d, i) => {
          const last = i === defs.length - 1;
          const penult = i === defs.length - 2;
          let text = fill(d.text).replace(/\s*(;\s*and|;|\.)\s*$/, "");
          if (d.term !== "%") text += last ? "." : penult ? "; and" : ";";
          else text += ".";
          plain(`"**${one ? singular(d.term) : d.term}**" ${text}`, true);
        });
        return;
      }
      if (replace[c.id]) return;
      for (const s of prune(c.subs ?? [], c.id)) emit(s, 1);
      if (c.tail) {
        const t = fill(c.tail);
        if (t) plain(t, true);
      }
      if (c.id === "notices") {
        const contact = (label: string, p: Party) => {
          plain(`**${label}**`, true);
          plain(`Address: ${oneLine(str(p.address)) || GAP}`, true);
          plain(`Email: ${str(p.email) || GAP}`, true);
          if (p.kind === "company") plain(`Attention: ${str(p.signatory_name) || GAP}`, true);
          if (!str(p.email)) missing.add(`email of ${str(p.name) || label}`);
        };
        contact("The Buyer", buyerParty);
        sellers.forEach((s, i) => contact(one ? "The Seller" : `${labels[i]} (${str(s.name)})`, s));
      }
    });
  });

  plain("[The remainder of this page has been left deliberately blank]");

  /* Signature page. */
  plain(EXECUTED);
  const signLines = (head: string, lines: string[]) => {
    blocks.push({ kind: "sign-head", num: "", text: head });
    for (const l of lines) blocks.push({ kind: "sign", num: "", text: l });
  };
  const signFor = (p: Party) =>
    p.kind === "company"
      ? signLines(`SIGNED by ${str(p.signatory_name) || GAP} for and on behalf of ${str(p.name) || GAP}`, ["___________________________", `Name: ${str(p.signatory_name) || GAP}`, `Title: ${str(p.signatory_title) || GAP}`])
      : signLines(`SIGNED by ${str(p.name) || GAP}`, ["___________________________", `Name: ${str(p.name) || GAP}`]);
  plain("**THE BUYER**");
  signFor(buyerParty);
  plain(one ? "**THE SELLER**" : "**THE SELLERS**");
  sellers.forEach(signFor);

  /* Schedule 1. */
  const schedule = (n: number, title: string) => {
    blocks.push({ kind: "section", num: "", text: `SCHEDULE ${n}` });
    plain(`**${title}**`);
  };
  schedule(1, "PARTICULARS OF THE TARGET COMPANY");
  const directors = str(target.directors).split(/\s*(?:\n|;)\s*/).filter(Boolean);
  const row = (k: string, v: string) => plain(`${k}: ${v || GAP}`, true);
  row("Company name", f.target_name);
  row("Registration number", f.target_reg_no);
  row("Place of incorporation", "Singapore");
  row("Registered address", f.target_address);
  row("Issued share capital", [str(target.issued_capital), f.issued_shares ? `${f.issued_shares} ordinary shares` : ""].filter(Boolean).join(", divided into "));
  plain("Shareholders:", true);
  sellers.forEach((s, i) => sub(`(${String.fromCharCode(97 + i)})`, `${str(s.name)}: ${Number.isFinite(shares[i]) ? shares[i].toLocaleString("en-GB") : GAP} ordinary shares`, 2));
  if (!whole) sub(`(${String.fromCharCode(97 + sellers.length)})`, "[Other shareholders and their shareholdings]", 2);
  row("Directors", directors.join("; "));
  if (!directors.length) missing.add("directors of the Target Company");
  if (!f.target_reg_no) missing.add("target_reg_no");
  if (!str(target.issued_capital)) missing.add("issued share capital");

  /* Schedule 2. */
  schedule(2, "SALE SHARES AND CONSIDERATION");
  sellers.forEach((s, i) => {
    const share = Number.isFinite(prices[i]) && Number.isFinite(totalPrice) && totalPrice > 0 ? ` (${(Math.round((prices[i] / totalPrice) * 10000) / 100).toString()}% of the Consideration)` : "";
    sub(`${i + 1}.`, `${one ? "The Seller" : labels[i]}, ${str(s.name)}: ${Number.isFinite(shares[i]) ? shares[i].toLocaleString("en-GB") : GAP} Sale Shares, for ${money(prices[i], cur)}${share}.`, 1);
  });
  plain(`Total: ${f.sale_shares || GAP} Sale Shares, for an aggregate Consideration of ${f.price_total || GAP}.`, true);

  /* Schedule 3. */
  schedule(3, "WARRANTIES");
  const hasIndividual = sellers.some((s) => s.kind !== "company");
  const hasCompany = sellers.some((s) => s.kind === "company");
  const group = (part: string, title: string, groups: ScheduleGroup[], skip: Set<string>) => {
    plain(`**Part ${part} — ${title}**`);
    let gi = 0;
    for (const g of groups) {
      const items = g.items.filter((it) => !(it.id && skip.has(it.id)));
      if (!items.length) continue;
      gi += 1;
      blocks.push({ kind: "clause", num: `${gi}.`, text: `**${g.heading}**` });
      items.forEach((it, k) => {
        const text = hasCompany ? it.text : it.text.replace(/ \(or, in the case of a Seller which is a company, of that Seller\)/, "");
        sub(`${gi}.${k + 1}`, fill(text), 1);
        (it.subs ?? []).forEach((s, j) => sub(`(${String.fromCharCode(97 + j)})`, fill(hasCompany ? s : s.replace(/ \(or, in the case of a Seller which is a company, of that Seller\)/, "")), 2));
      });
    }
  };
  const skipA = new Set<string>([...(hasIndividual ? [] : ["pa_individual"]), ...(hasCompany ? [] : ["pa_company"]), whole ? "pa_part" : "pa_entire"]);
  if (hasCompany) fdUsed.push("warranty for a corporate seller");
  group("A", one ? "The Seller" : "The Sellers", PART_A, skipA);
  if (full) {
    plain("**Part B — The Target Company**");
    PART_B.forEach((sec, i) => {
      const n = i + 1;
      blocks.push({ kind: "clause", num: `${n}.`, text: `**${sec.heading}**` });
      sec.items.forEach((it, j) => {
        const m = `${n}.${j + 1}`;
        if (it.title) sub(m, it.text ? `**${it.title}.** ${fill(it.text)}` : `**${it.title}**`, 1);
        else sub(m, fill(it.text ?? ""), 1);
        (it.subs ?? []).forEach((s, k) => sub(`(${String.fromCharCode(97 + k)})`, fill(s), 2));
        (it.tail ?? []).forEach((t) => plain(fill(t), true));
        (it.paras ?? []).forEach((p, k) => {
          sub(`${m}.${k + 1}`, fill(p.text), 2);
          (p.subs ?? []).forEach((s, q) => sub(`(${String.fromCharCode(97 + q)})`, fill(s), 3));
          (p.tail ?? []).forEach((t) => plain(fill(t), true));
        });
      });
    });
  }
  const skipC = new Set<string>(buyerCompany ? ["pc_individual"] : ["pc_company", "pc_corporate"]);
  if (!buyerCompany) fdUsed.push("warranty for an individual buyer");
  group("C", "The Buyer", PART_C, skipC);

  /* Schedule 4. */
  if (keyPeople.length) {
    schedule(4, "KEY PERSONNEL");
    keyPeople.forEach((p, i) => sub(`${i + 1}.`, p, 1));
    own.push("key personnel");
  }

  /* ── what the lawyer should know ───────────────────────────────────── */
  if (own.length) {
    flags.push({ level: "yellow", scenario: "SP21", title: "Your own wording", reason: `Wording you typed has gone into the agreement as written: ${joinAnd(Array.from(new Set(own)))}. Have your lawyer check it reads as a clause.` });
  }
  flags.push({
    level: "green",
    scenario: "FD",
    title: "FD supplementary wording",
    reason: `Wording not in the precedent, written in its style for the answers given: ${joinAnd(Array.from(new Set(fdUsed)))}. For FD review.`,
  });

  return { blocks, missing: Array.from(missing), flags, fields: f, included };
}
