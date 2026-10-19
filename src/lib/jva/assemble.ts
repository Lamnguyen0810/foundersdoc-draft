/**
 * Answers → joint venture agreement.
 *
 * Deterministic, as the other assemblers are: the same answers give the
 * same agreement from the wording in data/master.ts, with nothing invented.
 * The level (JV0) decides which clauses go in; the answers pick each
 * clause's version; the governing law fills the constitution, the
 * third-party rights statute, mediation, the courts or arbitration and who
 * appoints the valuer (data/master.ts → JURISDICTIONS). FD AI's only part is
 * the review of the answers (server.ts).
 *
 * Party A and Party B: in a majority joint venture, Party A is the majority.
 * Always an agreement, never a deed: each party gives something (its
 * investment and its promises) for what it gets.
 */

import type { Block } from "../contract/parse";
import { formatDate, joinAnd, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import {
  AGREED, BACKGROUND, BETWEEN, DEED_OF_ADHERENCE, DEFINITIONS, IN_WITNESS, INTERPRETATION, JURISDICTIONS, MADE_ON, OTHER_JURISDICTION,
  PARTIES_COLLECTIVE, PARTY_COMPANY, PARTY_INDIVIDUAL, RECITAL_B, RECITALS, RESERVED_ORDER, RESERVED_TEXT, SCHEDULE_1_TITLE, SCHEDULE_2_LEAD,
  SCHEDULE_2_TITLE, SCHEDULE_3_TITLE, SECTIONS, TITLE,
  type Jurisdiction, type MasterClause, type MasterSub,
} from "./data/master";
import { CORE_RESERVED } from "./data/questionnaire";
import { applyDefaults, levelOf, picks, type Level } from "./questions";
import type { Answers, Flag, JvaInput, Party } from "./types";

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

/* The jurisdiction entries: blank for "another law", flagged once as a whole
   (checks.ts, JV2) rather than item by item. */
const RIDER_KEYS = new Set(["city", "seat", "courts", "law", "place", "appointer"]);

const MAY_BE_EMPTY = new Set(["plan_ref", "jvc_number", "tp_under", "after_period", "affiliates_too", "lock_in_except", "not_affiliate"]);

/** "5,000" → 5000; anything that is not a plain number → NaN. */
export function num(raw: string): number {
  const s = String(raw ?? "").replace(/[,\s%]/g, "").replace(/^(S\$|US\$|HK\$|SGD|USD|HKD|GBP|EUR|£|€|\$)/i, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const CURRENCIES: Record<string, { sym: string }> = {
  SGD: { sym: "S$" },
  USD: { sym: "US$" },
  GBP: { sym: "£" },
  HKD: { sym: "HK$" },
  EUR: { sym: "€" },
};

/** 50 → "fifty per cent. (50%)"; 37.5 → "37.5 per cent. (37.5%)". */
export function pct(n: number): string {
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return GAP;
  return Number.isInteger(n) ? `${numberWords(n)} per cent. (${n}%)` : `${n} per cent. (${n}%)`;
}

/** 2 → "two (2)". */
const nw = (n: number) => `${numberWords(n)} (${n})`;

/** "Develop an app." → "develop an app", keeping an acronym or a name. */
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

const LEVEL_RANK: Record<Level, number> = { basic: 1, standard: 2, complex: 3 };
const DIRECTORS: Record<string, [number, number]> = { one: [1, 1], two: [2, 2], "2_1": [2, 1], "3_1": [3, 1], "3_2": [3, 2] };

/** Everything the answers decide, read once — shared with the checks. */
export function readAnswers(a: Answers, parties: Party[] = []) {
  const level = levelOf(a);
  const atLeast = (l: Level) => LEVEL_RANK[level] >= LEVEL_RANK[l];
  const standard = atLeast("standard");
  const complex = atLeast("complex");
  const equal = str(a.JV1) !== "majority";
  const side = equal ? "" : str(a.JV2) === "minority" ? "minority" : "majority";
  const pctA = equal ? 50 : num(str(a.JV1a));
  const pctB = Number.isFinite(pctA) ? 100 - pctA : NaN;

  const lawKey = str(a.JV3) || "sg";
  const otherLaw = lawKey === "other" || !JURISDICTIONS[lawKey];
  const j: Jurisdiction = otherLaw ? { ...OTHER_JURISDICTION, law: str(a.JV3a), place: str(a.JV3a) } : JURISDICTIONS[lawKey];

  const newCo = str(a.JV4) !== "existing";
  const jvc = str(a.JV4a);
  const jvcNumber = newCo ? "" : str(a.JV4b);
  const business = asPhrase(str(a.JV5));

  const currency = CURRENCIES[str(a.JV6)] ? str(a.JV6) : "SGD";
  const investA = num(str(a.JV7));
  const investB = equal ? investA : num(str(a.JV7a));

  const funding = standard && str(a.JV8) === "cap" ? "cap" : "voluntary";
  const fundingCap = num(str(a.JV8a));

  const dirKey = equal ? str(a.JV9) || "one" : str(a.JV10) || "2_1";
  const [dirA, dirB] = DIRECTORS[dirKey] ?? (equal ? [1, 1] : [2, 1]);
  const chair = equal
    ? str(a.JV11) === "rotate" ? "chair_rotate" : "chair_none"
    : str(a.JV12) === "no" ? "chair_majority_plain" : "chair_majority_casting";

  const picked = new Set([...CORE_RESERVED, ...picks(a, "JV13")]);
  const reserved = RESERVED_ORDER.filter((k) => picked.has(k));
  const borrowingLimit = num(str(a.JV13a));

  const deadlock = standard ? (["shotgun", "wind_up"].includes(str(a.JV14)) ? str(a.JV14) : "escalate") : "escalate";
  const transfers = str(a.JV15) === "consent" ? "consent" : "first_refusal";
  const lockIn = standard ? num(str(a.JV16)) || 0 : 0;
  const tagDrag = !equal && standard ? picks(a, "JV17").filter((x) => x === "tag" || x === "drag") : [];
  const defaultPrice = standard ? (str(a.JV18) === "discount" && complex ? "discount" : "fair") : "none";
  const defaultOn = defaultPrice !== "none";
  const restrictions = standard ? (["during_after", "during"].includes(str(a.JV19)) ? str(a.JV19) : "none") : "none";
  const dividends = str(a.JV20) === "reinvest" ? "reinvest" : "distribute";
  const antiCorruption = complex && str(a.JV21) === "yes";
  const disputes = standard && str(a.JV22) !== "courts" ? "arbitration" : "courts";

  const anyCompany = parties.length === 0 || parties.some((p) => p.kind === "company");
  const anyIndividual = parties.some((p) => p.kind === "individual");

  return {
    level, atLeast, standard, complex, equal, side, pctA, pctB, lawKey, otherLaw, j, newCo, jvc, jvcNumber, business, currency, investA, investB,
    funding, fundingCap, dirA, dirB, chair, reserved, borrowingLimit, deadlock, transfers, lockIn, tagDrag, defaultPrice, defaultOn, restrictions,
    dividends, antiCorruption, disputes, anyCompany, anyIndividual,
  };
}

export type Read = ReturnType<typeof readAnswers>;

export function assemble(input: JvaInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const { partyA, partyB } = input;
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();
  const own: string[] = [];

  const r = readAnswers(a, [partyA, partyB]);
  const { j } = r;
  const cur = CURRENCIES[r.currency];
  const money = (n: number) =>
    Number.isFinite(n) ? `${cur.sym}${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}` : GAP;

  if (r.otherLaw && str(a.JV3a)) own.push("the governing law");

  /* ── which version of each clause ──────────────────────────────────── */
  const keep = (when?: string): boolean => {
    switch (when) {
      case undefined: return true;
      case "new": return r.newCo;
      case "any_company": return r.anyCompany;
      case "any_individual": return r.anyIndividual;
      case "standard":
      case "plan":
      case "adherence": return r.standard;
      case "default":
      case "valuation": return r.defaultOn;
      case "chair_none":
      case "chair_rotate":
      case "chair_majority_casting":
      case "chair_majority_plain": return r.chair === when;
      case "reserved_inline": return !r.standard;
      case "reserved_schedule": return r.standard;
      case "funding_voluntary": return r.funding === "voluntary";
      case "funding_cap": return r.funding === "cap";
      case "dividends_distribute": return r.dividends === "distribute";
      case "dividends_reinvest": return r.dividends === "reinvest";
      case "deadlock_escalate": return r.deadlock === "escalate";
      case "deadlock_shotgun": return r.deadlock === "shotgun";
      case "deadlock_wind_up": return r.deadlock === "wind_up";
      case "lock_in": return r.lockIn > 0;
      case "transfers_consent": return r.transfers === "consent";
      case "transfers_first_refusal": return r.transfers === "first_refusal";
      case "tag": return r.tagDrag.includes("tag");
      case "drag": return r.tagDrag.includes("drag");
      case "restrictions": return r.restrictions !== "none";
      case "anti_corruption": return r.antiCorruption;
      case "arbitration": return r.disputes === "arbitration";
      case "courts": return r.disputes === "courts";
      default: return true;
    }
  };

  /* ── the fields ────────────────────────────────────────────────────── */
  if (!r.jvc) missing.add("the company's name");
  if (!r.business) missing.add("the description of the business");
  if (!Number.isFinite(r.investA)) missing.add(r.equal ? "each party's investment" : "Party A's investment");
  if (!r.equal && !Number.isFinite(r.investB)) missing.add("Party B's investment");
  if (!r.equal && !(r.pctA > 50 && r.pctA < 100)) missing.add("the majority party's percentage");
  if (r.funding === "cap" && !Number.isFinite(r.fundingCap)) missing.add("the funding cap");
  if (r.reserved.includes("borrowing") && r.standard && !Number.isFinite(r.borrowingLimit)) missing.add("the borrowing limit");

  const lockWords = r.lockIn > 0 && Number.isInteger(r.lockIn) && r.lockIn < 1000 ? `${nw(r.lockIn)} months` : GAP;
  const dirWords = (n: number) => `${nw(n)} Director${n === 1 ? "" : "s"}`;

  const f: Record<string, string> = {
    date: formatDate(today),
    city: j.city,
    law: j.law || GAP,
    place: j.place || GAP,
    seat: j.seat,
    rules: j.rules,
    institution: j.institution,
    courts: j.courts || (j.law ? `the courts of ${j.law}` : ""),
    appointer: j.appointer,
    mediation: j.mediation,
    constitution_def: j.constitution,
    tp_under: j.tpStatute ? `under ${j.tpStatute} or otherwise ` : r.otherLaw ? `under ${GAP} or otherwise ` : "",
    shares_def: j.us ? "the shares of common stock of the Company" : "the ordinary shares in the capital of the Company",
    register: j.us ? "stock ledger" : "register of members",
    jvc: r.jvc || GAP,
    jvc_number: r.jvcNumber ? ` (Registration Number ${r.jvcNumber})` : "",
    business: r.business || GAP,
    pct_a: pct(r.pctA),
    pct_b: pct(r.pctB),
    invest_a: money(r.investA),
    invest_b: money(r.investB),
    funding_cap: money(r.fundingCap),
    borrowing_limit: money(r.borrowingLimit),
    completion_from: r.newCo ? "the Company is incorporated" : "the date of this Agreement",
    board_total: nw(r.dirA + r.dirB),
    dir_a: dirWords(r.dirA),
    dir_b: dirWords(r.dirB),
    meetings: r.standard ? "four (4) times" : "twice",
    quorum: "one (1) Director appointed by each Party",
    adjourned_quorum: "the Directors present form a quorum (but no Reserved Matter may be decided without the consent that {{clause:reserved}} requires)",
    plan_ref: r.standard ? " and the Business Plan," : "",
    deadlock_trigger: r.equal
      ? "a matter of importance to the Company (including any Reserved Matter) is put to two (2) consecutive meetings of the Board or of the Shareholders, properly called, and is not decided because the votes are equal, a Party's consent is refused or no quorum is present"
      : "a Party refuses its consent to a Reserved Matter that the other Party has proposed in writing, and the Parties have not agreed on it within twenty (20) Business Days",
    adherence_step: r.standard ? "sign a Deed of Adherence" : "agree in writing with the other Shareholders to be bound by this Agreement as if it were a Party",
    lock_in: lockWords,
    lock_in_except: r.anyCompany ? "for a transfer under {{clause:group}} (Group Transfers), or " : "",
    default_price: r.defaultPrice === "discount" ? "eighty per cent. (80%) of Fair Value" : "Fair Value",
    affiliates_too: r.anyCompany ? " (and shall procure that none of its Affiliates shall)" : "",
    related_party: r.anyCompany ? "a Party, an Affiliate of a Party or any person connected with a Party" : "a Party or any person connected with a Party",
    not_affiliate: partyA.kind === "company" ? " (other than its Affiliate)" : "",
    advisers: r.anyCompany ? ", professional advisers and (if it is a company) Affiliates" : " and professional advisers",
    after_period: r.restrictions === "during_after" ? ", and for twelve (12) months after it stops holding Shares" : "",
    a_address: oneLine(str(partyA.address)) || GAP,
    a_email: str(partyA.email) || GAP,
    b_address: oneLine(str(partyB.address)) || GAP,
    b_email: str(partyB.email) || GAP,
    name_a: str(partyA.name) || GAP,
    name_b: str(partyB.name) || GAP,
  };

  /* ── which clauses ─────────────────────────────────────────────────── */
  type Built = { id: string; heading: string; clauses: MasterClause[] };
  const built: Built[] = [];
  for (const sec of SECTIONS) {
    if (!keep(sec.when)) continue;
    const clauses = sec.clauses.filter((c) => keep(c.when));
    if (!clauses.length) continue;
    /* Without default events nothing is valued: only the completion mechanics stay. */
    const heading = sec.id === "valuation" && !r.defaultOn ? "COMPLETING SALES OF SHARES" : sec.heading;
    built.push({ id: sec.id, heading, clauses });
  }
  const clauseNo: Record<string, string> = {};
  built.forEach((s, i) => {
    f[`section:${s.id}`] = `Clause ${i + 1}`;
    s.clauses.forEach((c, k) => (clauseNo[c.id] = `${i + 1}.${k + 1}`));
  });
  for (const [id, n] of Object.entries(clauseNo)) f[`clause:${id}`] = `Clause ${n}`;
  f.survives = built.some((s) => s.id === "restrictions")
    ? "{{section:restrictions}} (Restrictions on the Parties) and {{section:confidentiality}} (Confidentiality)"
    : "{{section:confidentiality}} (Confidentiality)";

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

  const partyText = (p: Party, label: string) => {
    const isCo = p.kind === "company";
    const vals = {
      name: str(p.name) || GAP,
      id_no: str(p.id_no) || GAP,
      jurisdiction: str(p.jurisdiction) || j.place || GAP,
      address: oneLine(str(p.address)) || GAP,
    };
    if (!str(p.name)) missing.add(`${label}'s name`);
    if (!str(p.id_no)) missing.add(`${label}'s ${isCo ? "registration number" : "ID or passport number"}`);
    if (!str(p.address)) missing.add(`${label}'s address`);
    return fill(isCo ? PARTY_COMPANY : PARTY_INDIVIDUAL, vals);
  };

  blocks.push({ kind: "title", num: "", text: TITLE });
  plain(fill(MADE_ON));
  plain(BETWEEN);
  blocks.push({ kind: "party", num: "(1)", text: `${partyText(partyA, "Party A")} ("**Party A**"); and` });
  blocks.push({ kind: "party", num: "(2)", text: `${partyText(partyB, "Party B")} ("**Party B**"),` });
  plain(PARTIES_COLLECTIVE);
  plain(`**${BACKGROUND}**`);
  blocks.push({ kind: "recital", num: "(A)", text: fill(RECITALS[r.newCo ? "new" : "existing"]) });
  blocks.push({ kind: "recital", num: "(B)", text: fill(RECITAL_B) });
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

  /* The reserved matters, lettered: inline at Basic, Schedule 2 above it. */
  const allReserved: MasterSub[] = RESERVED_ORDER.map((k) => ({ ref: "(x)", text: RESERVED_TEXT[k], id: k }));
  const reservedList = relist(allReserved.filter((s) => r.reserved.includes(s.id as (typeof RESERVED_ORDER)[number])), allReserved);

  const defs = DEFINITIONS.filter((d) => keep(d.when));
  built.forEach((sec, si) => {
    blocks.push({ kind: "section", num: "", text: `${si + 1}. ${sec.heading}` });
    sec.clauses.forEach((c, ci) => {
      included.push(c.id);
      blocks.push({ kind: "clause", num: `${si + 1}.${ci + 1}`, text: fill(c.text) });
      if (c.id === "definitions") {
        defs.forEach((d, i) => {
          const last = i === defs.length - 1;
          const text = fill(d.text).replace(/\s*(;\s*and|;|\.)\s*$/, "") + (last ? "." : ";");
          plain(`"**${d.term}**" ${text}`, true);
        });
        return;
      }
      if (c.id === "interpretation") {
        INTERPRETATION.forEach((x, i) => sub(`(${String.fromCharCode(97 + i)})`, fill(x), 1));
        return;
      }
      if (c.id === "reserved" && !r.standard) {
        for (const s of reservedList) sub(s.ref ?? "", fill(s.text), 1);
        return;
      }
      for (const s of prune(c.subs ?? [])) emit(s, 1);
      if (c.tail) plain(fill(c.tail), true);
    });
  });

  /* ── signatures ────────────────────────────────────────────────────── */
  plain(IN_WITNESS);
  const line = "___________________________";
  const signFor = (p: Party, label: string) => {
    const nm = str(p.name) || GAP;
    plain(`**${label.toUpperCase()}**`);
    if (p.kind === "company") {
      blocks.push({ kind: "sign", num: "", text: line });
      blocks.push({ kind: "sign-head", num: "", text: "For and on behalf of" });
      for (const l of [`**${nm}**`, `Name: ${str(p.signatory_name) || GAP}`, `Title: ${str(p.signatory_title) || GAP}`])
        blocks.push({ kind: "sign", num: "", text: l });
      if (!str(p.signatory_name)) missing.add(`${label}'s signatory`);
    } else {
      blocks.push({ kind: "sign-head", num: "", text: `SIGNED by ${nm}` });
      for (const l of [line, `Name: ${nm}`]) blocks.push({ kind: "sign", num: "", text: l });
    }
    if (!str(p.email)) missing.add(`${label}'s email`);
  };
  signFor(partyA, "Party A");
  signFor(partyB, "Party B");

  /* ── Schedule 1: the investment ────────────────────────────────────── */
  blocks.push({ kind: "section", num: "", text: "SCHEDULE 1" });
  plain(`**${SCHEDULE_1_TITLE}**`);
  const rows: [string, string][] = [
    ["Party A", `${f.name_a}: ${GAP} Shares, for a subscription price of ${f.invest_a}.`],
    ["Party B", `${f.name_b}: ${GAP} Shares, for a subscription price of ${f.invest_b}.`],
    ["Shareholdings after Completion", `Party A, ${f.pct_a}; Party B, ${f.pct_b}.`],
  ];
  rows.forEach(([k, v], i) => blocks.push({ kind: "clause", num: `${i + 1}.`, text: `**${k}.** ${v}` }));
  missing.add("the number of Shares in Schedule 1");

  /* ── Schedule 2: the reserved matters ──────────────────────────────── */
  if (r.standard) {
    blocks.push({ kind: "section", num: "", text: "SCHEDULE 2" });
    plain(`**${SCHEDULE_2_TITLE}**`);
    plain(fill(SCHEDULE_2_LEAD));
    for (const s of reservedList) sub(s.ref ?? "", fill(s.text), 1);
  }

  /* ── Schedule 3: the deed of adherence ─────────────────────────────── */
  if (r.standard) {
    blocks.push({ kind: "section", num: "", text: "SCHEDULE 3" });
    plain(`**${SCHEDULE_3_TITLE}**`);
    DEED_OF_ADHERENCE.forEach((t, i) => {
      const last = i === DEED_OF_ADHERENCE.length - 1;
      if (last) plain(fill(t));
      else blocks.push({ kind: "clause", num: `${i + 1}.`, text: fill(t) });
    });
  }

  /* ── what the lawyer should know ───────────────────────────────────── */
  if (own.length) {
    flags.push({ level: "yellow", scenario: "JV21", title: "Your own wording", reason: `Wording you typed has gone into the agreement as written: ${joinAnd(Array.from(new Set(own)))}. Have your lawyer check it.` });
  }

  return { blocks, missing: Array.from(missing), flags, fields: f, included };
}
