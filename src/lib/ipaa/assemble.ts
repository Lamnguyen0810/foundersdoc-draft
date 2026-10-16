/**
 * Answers → IP assignment agreement.
 *
 * Deterministic, as the other assemblers are: the same answers give the
 * same agreement from the wording in data/master.ts, with nothing invented.
 * The level (IP0) decides which of the FD Lite menu's clauses go in; the
 * answers pick each clause's version; the governing law fills the moral
 * rights law, the third-party rights statute, the courts or arbitration and
 * the signing formalities (data/master.ts → JURISDICTIONS). FD AI's only
 * part is the review of the answers (server.ts).
 */

import type { Block } from "../contract/parse";
import { formatDate, joinAnd, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import {
  AGREED, BACKGROUND, BETWEEN, DEFINITIONS, IN_WITNESS, INTERPRETATION, JURISDICTIONS, MADE_ON, OTHER_JURISDICTION, OWNERSHIP_RECITAL,
  PARTIES_COLLECTIVE, PARTY_COMPANY, PARTY_INDIVIDUAL, PROJECT_PERIOD, RELATIONSHIP, SCHEDULE_ITEMS, SCHEDULE_TITLE, SECTIONS,
  type Jurisdiction, type MasterClause, type MasterSub,
} from "./data/master";
import { applyDefaults, levelOf, picks, type Level } from "./questions";
import type { Answers, Flag, IpaaInput, Party } from "./types";

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
   (checks.ts, IP2) rather than item by item. */
const RIDER_KEYS = new Set(["city", "seat", "courts", "law"]);

const MAY_BE_EMPTY = new Set([
  "title_guarantee", "share_of", "trust_share", "assigned_share", "recipient_contribution", "wp_except", "moral_law", "knowledge",
  "code_tail", "or_licence_copy", "tp_under",
]);

/** "5,000" → 5000; anything that is not a plain number → NaN. */
export function num(raw: string): number {
  const s = String(raw ?? "").replace(/[,\s%]/g, "").replace(/^(S\$|US\$|HK\$|SGD|USD|HKD|GBP|EUR|£|€|\$)/i, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const CURRENCIES: Record<string, { sym: string; unit: string; cents: string }> = {
  SGD: { sym: "S$", unit: "Singapore dollars", cents: "cents" },
  USD: { sym: "US$", unit: "United States dollars", cents: "cents" },
  GBP: { sym: "£", unit: "pounds sterling", cents: "pence" },
  HKD: { sym: "HK$", unit: "Hong Kong dollars", cents: "cents" },
  EUR: { sym: "€", unit: "euros", cents: "cents" },
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

/** 50 → "fifty per cent. (50%)"; 37.5 → "37.5 per cent. (37.5%)". */
export function pct(n: number): string {
  if (!Number.isFinite(n)) return GAP;
  return Number.isInteger(n) && n > 0 && n < 100 ? `${numberWords(n)} per cent. (${n}%)` : `${n} per cent. (${n}%)`;
}

/** "The source code." → "the source code", keeping an acronym or a name. */
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

export type Owner = "recipient" | "joint" | "creator";
export type LicenceBack = "none" | "showcase" | "any";

const LEVEL_RANK: Record<Level, number> = { basic: 1, standard: 2, complex: 3 };
const WARRANTIES = ["ownership", "non_infringement", "validity", "originality"] as const;

/** Everything the answers decide, read once — shared with the checks. */
export function readAnswers(a: Answers) {
  const level = levelOf(a);
  const atLeast = (l: Level) => LEVEL_RANK[level] >= LEVEL_RANK[l];
  const creatorSide = str(a.IP1) === "creator";
  const lawKey = str(a.IP2) || "sg";
  const otherLaw = lawKey === "other" || !JURISDICTIONS[lawKey];
  const j: Jurisdiction = otherLaw ? { ...OTHER_JURISDICTION, law: str(a.IP2a) } : JURISDICTIONS[lawKey];

  /* Who makes it: the Recipient's answer (IP3), or the Creator's (IP4). */
  const role = creatorSide ? str(a.IP4) || "contractor" : str(a.IP3) || "contractor";
  const roleOther = creatorSide ? str(a.IP4a) : str(a.IP3a);
  const aim = creatorSide ? str(a.IP5) || "project" : "project";
  const template = creatorSide && aim === "template";
  const withOthers = str(a.IP6) || "solo";
  const types = picks(a, "IP7").filter((t) => t !== "none");
  const typeOther = str(a.IP7a);
  const work = asPhrase(str(a.IP8));
  const project = str(a.IP9) || "one_off";
  const months = num(str(a.IP9a));
  const confidential = str(a.IP10) || "yes";

  /* Who owns it. Basic and Standard: the Recipient, 100% (the level fixes it). */
  let owner: Owner = "recipient";
  let licenceKind: "perpetual" | "limited" = "perpetual";
  let licenceBack: LicenceBack = "none";
  let buyBack = false;
  if (atLeast("complex")) {
    if (!creatorSide) {
      const o = str(a.IP11) || "recipient";
      owner = o === "joint" ? "joint" : o === "creator" ? "creator" : "recipient";
      licenceKind = str(a.IP11a) === "limited" ? "limited" : "perpetual";
      if (owner === "recipient") licenceBack = (["showcase", "any"].includes(str(a.IP14)) ? str(a.IP14) : "none") as LicenceBack;
    } else {
      const o = str(a.IP12) || "recipient_showcase";
      if (o === "joint") owner = "joint";
      else if (o === "creator_perpetual" || o === "creator_limited") {
        owner = "creator";
        licenceKind = o === "creator_limited" ? "limited" : "perpetual";
      } else {
        owner = "recipient";
        licenceBack = o === "recipient_licence" ? "any" : o === "recipient_showcase" ? "showcase" : "none";
        buyBack = (o === "recipient_licence" || o === "recipient_showcase") && str(a.IP12a) === "yes";
      }
    }
  } else if (atLeast("standard")) {
    const lb = str(a.IP14) || (creatorSide ? "showcase" : "none");
    licenceBack = (["showcase", "any"].includes(lb) ? lb : "none") as LicenceBack;
  }
  const creatorShare = owner === "joint" ? (str(a.IP13) === "other" ? num(str(a.IP13a)) : 50) : NaN;
  const exclusivity = str(a.IP15) || (creatorSide ? "non_exclusive" : "exclusive");

  const fee = str(a.IP16) === "fee";
  const currency = CURRENCIES[str(a.IP16a)] ? str(a.IP16a) : "SGD";
  const feeAmount = fee ? num(str(a.IP16b)) : NaN;
  /* A deed when nothing is paid for the IP — never under US law. */
  const deed = !fee && !j.us;

  const warranties = atLeast("complex") ? picks(a, "IP17").filter((w): w is (typeof WARRANTIES)[number] => (WARRANTIES as readonly string[]).includes(w)) : [];
  const knowledge = (str(a.IP17a) || (creatorSide ? "knowledge" : "absolute")) === "knowledge";
  const disputes = atLeast("standard") && str(a.IP18) === "arbitration" ? "arbitration" : "courts";

  return {
    level, atLeast, creatorSide, lawKey, otherLaw, j, role, roleOther, aim, template, withOthers, types, typeOther, work, project, months, confidential,
    owner, licenceKind, licenceBack, buyBack, creatorShare, exclusivity, fee, currency, feeAmount, deed, warranties, knowledge, disputes,
  };
}

export type Read = ReturnType<typeof readAnswers>;

const TYPE_WORDS: Record<string, string> = { coding: "coding (software)", artwork: "artwork", proprietary: "proprietary information" };

export function assemble(input: IpaaInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const creator = input.creator;
  const recipient = input.recipient;
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();
  const own: string[] = [];

  const r = readAnswers(a);
  const { j } = r;
  const doc = r.deed ? "Deed" : "Agreement";
  const cur = CURRENCIES[r.currency];
  const money = (n: number) =>
    Number.isFinite(n) ? `${cur.sym}${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}` : GAP;
  const words = (n: number) => {
    if (!Number.isFinite(n)) return GAP;
    const whole = Math.floor(n);
    const cents = Math.round((n - whole) * 100);
    return `${bigWords(whole)} ${cur.unit}${cents ? ` and ${numberWords(cents)} ${cur.cents}` : ""}`;
  };

  if (r.otherLaw && str(a.IP2a)) own.push("the governing law");
  if (r.roleOther) own.push("the creator's role");
  if (r.typeOther) own.push("the other type of IP");

  const recipientOwns = r.owner === "recipient";
  const assign = r.owner !== "creator";
  const licenceBack = recipientOwns && r.licenceBack !== "none" && r.atLeast("standard");
  const background = r.atLeast("standard") && assign;
  const complex = r.atLeast("complex");

  /* ── which version of each clause ──────────────────────────────────── */
  const keep = (when?: string): boolean => {
    switch (when) {
      case undefined: return true;
      case "assign": return assign;
      case "recipient_owns": return recipientOwns;
      case "not_recipient_owns": return !recipientOwns;
      case "joint": return r.owner === "joint";
      case "creator_owns": return r.owner === "creator";
      case "complex": return complex;
      case "us_hire": return j.us && recipientOwns;
      case "sue": return complex && assign;
      case "contributors_assign": return r.withOthers !== "solo" && assign;
      case "contributors_creator": return r.withOthers !== "solo" && r.owner === "creator";
      case "buy_back": return r.buyBack && recipientOwns;
      case "licence_section": return background || licenceBack || r.owner === "creator";
      case "background": return background;
      case "back_showcase": return licenceBack && r.licenceBack === "showcase";
      case "back_any": return licenceBack && r.licenceBack === "any";
      case "licence_perpetual": return r.owner === "creator" && r.licenceKind === "perpetual";
      case "licence_limited": return r.owner === "creator" && r.licenceKind === "limited";
      case "scope_back": return complex && licenceBack;
      case "scope_licence": return complex && r.owner === "creator";
      case "exclusive": return r.exclusivity === "exclusive";
      case "sole": return r.exclusivity === "sole";
      case "non_exclusive": return r.exclusivity === "non_exclusive";
      case "fee": return r.fee;
      case "warranties": return complex && r.warranties.length > 0;
      case "w_ownership": return r.warranties.includes("ownership");
      case "w_non_infringement": return r.warranties.includes("non_infringement");
      case "w_validity": return r.warranties.includes("validity");
      case "w_originality": return r.warranties.includes("originality");
      case "completion_recipient": return complex && recipientOwns;
      case "completion_joint": return complex && r.owner === "joint";
      case "completion_creator": return complex && r.owner === "creator";
      case "conf_return": return r.confidential !== "no";
      case "advice": return r.atLeast("standard");
      case "business_day": return complex;
      case "agreement": return !r.deed;
      case "deed": return r.deed;
      case "arbitration": return r.disputes === "arbitration";
      case "courts": return r.disputes === "courts";
      default: return true;
    }
  };

  /* ── the fields ────────────────────────────────────────────────────── */
  if (!r.work) missing.add("the description of the work");
  if (r.fee && !Number.isFinite(r.feeAmount)) missing.add("the fee");
  if (r.project === "fixed" && !(Number.isFinite(r.months) && r.months > 0)) missing.add("the number of months");
  if (r.owner === "joint" && !(r.creatorShare > 0 && r.creatorShare < 100)) missing.add("the creator's share");

  const recipientShare = Number.isFinite(r.creatorShare) ? 100 - r.creatorShare : NaN;
  const shareWords = (n: number) => (Number.isFinite(n) && n > 0 && n < 100 ? pct(n) : GAP);
  const typeLabels = r.types.map((t) => (t === "other" ? r.typeOther || GAP : TYPE_WORDS[t] ?? t));
  const roleKey = r.project === "collab" ? "collab" : RELATIONSHIP[r.role] ? r.role : "contractor";
  const roleOther = asPhrase(r.roleOther) || GAP;
  const lead = r.fee
    ? "In consideration of the Fee, the Creator"
    : j.us
      ? "For good and valuable consideration, the receipt and sufficiency of which the Creator acknowledges, the Creator"
      : "The Creator";
  const keepCopy = licenceBack ? `as permitted by {{clause:grant}} or as required by law` : "as required by law";

  const f: Record<string, string> = {
    doc,
    title_words: `${r.owner === "creator" ? "Intellectual Property Ownership and Licence" : "Intellectual Property Assignment"} ${doc}`,
    date: formatDate(today),
    city: j.city,
    law: j.law || GAP,
    seat: j.seat,
    rules: j.rules,
    institution: j.institution,
    courts: j.courts || (j.law ? `the courts of ${j.law}` : ""),
    tp_under: j.tpStatute ? `under ${j.tpStatute} or otherwise ` : r.otherLaw ? `under ${GAP} or otherwise ` : "",
    moral_law: j.moralLaw,
    title_guarantee: j.titleGuarantee,
    lead,
    share_of: r.owner === "joint" ? ` an undivided ${shareWords(recipientShare)} share of` : "",
    trust_share: r.owner === "joint" ? " to the extent of the Recipient's share" : "",
    assigned_share: r.owner === "joint" ? " (to the extent of the share assigned to the Recipient)" : "",
    recipient_contribution: r.withOthers === "others" && r.owner !== "joint" ? " Anything that the Recipient itself contributes to the Work Product belongs to the Recipient." : "",
    creator_share: shareWords(r.creatorShare),
    recipient_share: shareWords(recipientShare),
    wp_owner: r.owner === "recipient" ? "the Recipient" : r.owner === "joint" ? "each Party" : "the Creator",
    wp_except: licenceBack ? ", except to the extent displayed or used as permitted by {{clause:grant}}" : "",
    wp_who: r.owner === "joint" ? "either Party" : "the Creator",
    project_who: r.project === "collab" ? "the Parties together create" : `the Creator creates${r.owner === "creator" ? "" : " for the Recipient"}`,
    work: r.work || GAP,
    project_period: PROJECT_PERIOD[r.project] ?? PROJECT_PERIOD.one_off,
    months_words: Number.isFinite(r.months) && r.months > 0 && Number.isInteger(r.months) && r.months < 1000 ? `${numberWords(r.months)} (${r.months}) month${r.months === 1 ? "" : "s"}` : GAP,
    role_other: roleOther,
    a_exclusivity: r.exclusivity === "exclusive" ? "an exclusive" : r.exclusivity === "sole" ? "a sole" : "a non-exclusive",
    fee_for: r.owner === "creator" ? "Licence" : r.owner === "joint" ? "assignment of a share of the Project IP" : "assignment",
    fee: money(r.feeAmount),
    fee_words: words(r.feeAmount),
    knowledge: r.knowledge ? " so far as the Creator is aware, having made reasonable enquiries," : "",
    code_tail: r.types.includes("coding") ? ", including complete source code, build instructions and technical documentation" : "",
    keep_copy: keepCopy,
    conf_except: complex ? " except as permitted by {{clause:permitted}} (Permitted Disclosure)" : ", except where disclosure is required by law or is to its professional advisers who are bound to keep it confidential",
    or_licence_copy: licenceBack ? " or may keep under {{clause:grant}}" : "",
    cr_address: oneLine(str(creator.address)) || GAP,
    cr_email: str(creator.email) || GAP,
    re_address: oneLine(str(recipient.address)) || GAP,
    re_email: str(recipient.email) || GAP,
  };

  /* ── which clauses ─────────────────────────────────────────────────── */
  type Built = { id: string; heading: string; clauses: MasterClause[] };
  const built: Built[] = [];
  for (const sec of SECTIONS) {
    if (!keep(sec.when)) continue;
    const clauses = sec.clauses.filter((c) => keep(c.when));
    if (clauses.length) built.push({ id: sec.id, heading: sec.heading, clauses });
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
        if (k.startsWith("clause:") || k.startsWith("section:")) return `this ${doc}`;
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

  /* A template leaves the other side blank, to fill in for each client. */
  const blankOk = (label: string) => r.template && label === "Recipient";
  const partyText = (p: Party, label: string) => {
    const isCo = p.kind === "company";
    const vals = {
      name: str(p.name) || GAP,
      id_no: str(p.id_no) || GAP,
      jurisdiction: str(p.jurisdiction) || j.law || GAP,
      address: oneLine(str(p.address)) || GAP,
    };
    if (!str(p.name) && !blankOk(label)) missing.add(`the ${label}'s name`);
    if (!str(p.id_no) && !blankOk(label)) missing.add(`the ${label}'s ${isCo ? "registration number" : "ID or passport number"}`);
    if (!str(p.address) && !blankOk(label)) missing.add(`the ${label}'s address`);
    return fill(isCo ? PARTY_COMPANY : PARTY_INDIVIDUAL, vals);
  };

  blocks.push({ kind: "title", num: "", text: f.title_words.toUpperCase() });
  plain(fill(MADE_ON));
  plain(BETWEEN);
  blocks.push({ kind: "party", num: "(1)", text: `${partyText(creator, "Creator")} (the "**Creator**"); and` });
  blocks.push({ kind: "party", num: "(2)", text: `${partyText(recipient, "Recipient")} (the "**Recipient**"),` });
  plain(PARTIES_COLLECTIVE);
  plain(`**${BACKGROUND}**`);
  blocks.push({ kind: "recital", num: "(A)", text: fill(RELATIONSHIP[roleKey]) });
  blocks.push({ kind: "recital", num: "(B)", text: fill(OWNERSHIP_RECITAL[r.owner]) });
  plain(AGREED[r.deed ? "deed" : "agreement"]);

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
  plain(IN_WITNESS[r.deed ? "deed" : "agreement"]);
  const line = "___________________________";
  const signFor = (p: Party, label: string, heading: string) => {
    const nm = str(p.name) || GAP;
    const isCo = p.kind === "company";
    plain(`**${heading}**`);
    if (r.deed && isCo) {
      /* A company's deed: two signatories, as the governing law allows (in
         Singapore, section 41B of the Companies Act 1967). */
      blocks.push({ kind: "sign-head", num: "", text: `EXECUTED as a DEED by **${nm}** ${j.deedCompany}` });
      for (const l of [line, `Name: ${str(p.signatory_name) || GAP}`, "Title: Director", line, "Name: ___________________________", "Title: Director / Company Secretary"])
        blocks.push({ kind: "sign", num: "", text: l });
      if (!str(p.signatory_name) && !blankOk(label)) missing.add(`the ${label}'s signatory`);
    } else if (r.deed) {
      blocks.push({ kind: "sign-head", num: "", text: `${j.deedIndividual} **${nm}** in the presence of:` });
      for (const l of [line, `Name: ${nm}`, "", "Witness's signature: ___________________________", "Witness's name: ___________________________", "Witness's address: ___________________________"])
        if (l) blocks.push({ kind: "sign", num: "", text: l });
    } else if (isCo) {
      blocks.push({ kind: "sign", num: "", text: line });
      blocks.push({ kind: "sign-head", num: "", text: "For and on behalf of" });
      for (const l of [`**${nm}**`, `Name: ${str(p.signatory_name) || GAP}`, `Title: ${str(p.signatory_title) || GAP}`])
        blocks.push({ kind: "sign", num: "", text: l });
      if (!str(p.signatory_name) && !blankOk(label)) missing.add(`the ${label}'s signatory`);
    } else {
      blocks.push({ kind: "sign-head", num: "", text: `SIGNED by ${nm}` });
      for (const l of [line, `Name: ${nm}`]) blocks.push({ kind: "sign", num: "", text: l });
    }
    if (!str(p.email) && !blankOk(label)) missing.add(`the ${label}'s email`);
  };
  signFor(creator, "Creator", "THE CREATOR");
  signFor(recipient, "Recipient", "THE RECIPIENT");

  /* ── Schedule 1 ────────────────────────────────────────────────────── */
  blocks.push({ kind: "section", num: "", text: "SCHEDULE 1" });
  plain(`**${SCHEDULE_TITLE}**`);
  const periodLine: Record<string, string> = {
    one_off: "A one-off project, until it is completed.",
    fixed: `A fixed period of ${f.months_words} from the date of this ${doc}.`,
    ongoing: "An ongoing project, until the Creator stops working on it.",
    collab: "A continuing collaboration between the Parties.",
  };
  const rows: [string, string][] = [
    ["The Project", `The creation of ${f.work}.`],
    ["Project Period", periodLine[r.project] ?? periodLine.one_off],
    ["Type of IP", typeLabels.length ? `${joinAnd(typeLabels).replace(/^./, (c) => c.toUpperCase())}.` : GAP],
  ];
  rows.forEach(([k, v], i) => blocks.push({ kind: "clause", num: `${i + 1}.`, text: `**${k}.** ${v}` }));
  blocks.push({ kind: "clause", num: `${rows.length + 1}.`, text: "**The Work Product.** The Work Product includes the following, and any later versions of them:" });
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const items = r.types.map((t) => (t === "other" ? `${cap(r.typeOther || "other IP")} (a description of each item)` : SCHEDULE_ITEMS[t])).filter(Boolean);
  if (complex) items.push("Registered rights and applications (patents, trade marks, designs and domain names)");
  items.push("Work Product already created before the date of this " + doc);
  items.forEach((t, i) => sub(`(${String.fromCharCode(97 + i)})`, `${t}: ${GAP}`, 1));
  missing.add("the items in Schedule 1");

  /* ── what the lawyer should know ───────────────────────────────────── */
  if (own.length) {
    flags.push({ level: "yellow", scenario: "IP21", title: "Your own wording", reason: `Wording you typed has gone into the agreement as written: ${joinAnd(Array.from(new Set(own)))}. Have your lawyer check it.` });
  }

  return { blocks, missing: Array.from(missing), flags, fields: f, included };
}
