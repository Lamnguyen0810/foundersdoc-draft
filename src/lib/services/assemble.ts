/**
 * Answers → services agreement.
 *
 * Deterministic, as the other assemblers are: the same answers give the
 * same agreement from the wording in data/master.ts, with nothing
 * invented. No model is called.
 *
 * The kind of service (SV1) decides the structure — a platform (access,
 * Authorised Users, Customer Data, service changes and levels, Outputs) or
 * professional services (standard of work, deliverables, Background IP,
 * retainer / fixed / hourly / success fees). The side (SV2) picks between
 * the provider's and the customer's version of the clauses where the
 * precedents and their review differ; the rest of the answers pick within
 * those (data/questionnaire.ts).
 */

import type { Block } from "../contract/parse";
import { formatDate, joinAnd, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import {
  AGREED, BACKGROUND, BETWEEN, DEFINITIONS, EXECUTED, INTERPRETATION, MADE_ON, PARTIES_COLLECTIVE, PARTY_COMPANY, PARTY_INDIVIDUAL,
  RECITALS, SECTIONS, SERVICE_LEVELS, TITLE, type MasterClause, type MasterSub,
} from "./data/master";
import { applyDefaults, picks } from "./questions";
import type { Answers, Flag, Party, ServicesInput } from "./types";

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
const MAY_BE_EMPTY = new Set(["and_deliverables", "or_outputs", "or_deliverables", "unlimited_extra", "not_before", "and_expenses"]);

/** "8,000" → 8000; anything that is not a plain number → NaN. */
export function num(raw: string): number {
  const s = String(raw ?? "").replace(/[,\s]/g, "").replace(/^(S\$|US\$|SGD|USD|\$)/i, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const count = (n: number) => (Number.isInteger(n) && n > 0 && n < 1000 ? `${numberWords(n)} (${n})` : String(n));
const months = (n: number) => (Number.isFinite(n) && n > 0 ? `${count(n)} month${n === 1 ? "" : "s"}` : GAP);
const days = (n: number) => `${count(n)} day${n === 1 ? "" : "s"}`;

/** "Access to the platform." → "access to the platform", keeping an acronym or a name. */
function asPhrase(s: string): string {
  const t = s.trim().replace(/[.;\s]+$/, "");
  if (!t) return "";
  return /^[A-Z][a-z]/.test(t) && !/^[A-Z][a-z]+ [A-Z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** A list with items dropped, re-lettered, its "; and" / "." endings moved. */
function relist(items: MasterSub[]): MasterSub[] {
  const numbered = items.filter((s) => s.ref);
  if (numbered.length === 0) return items;
  const roman = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$/.test(numbered[0].ref ?? "");
  const origLast = numbered[numbered.length - 1].text.trim();
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
    const ref = roman ? `(${ROMAN[i]})` : `(${String.fromCharCode(97 + i)})`;
    i += 1;
    return { ...s, ref, text };
  });
}

export function assemble(input: ServicesInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const { provider, customer } = input;
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();
  const own: string[] = [];
  const fdUsed: string[] = [];

  /* ── the answers, read once ────────────────────────────────────────── */
  const platform = str(a.SV1) === "platform";
  const pro = !platform;
  const prov = str(a.SV2) !== "customer";
  const cust = !prov;
  const usd = str(a.SV3) === "USD";
  const cur = usd ? "US$" : "S$";
  const deliverables = pro ? picks(a, "SV4a") : [];
  const complete = str(a.SV5) === "complete";
  const fixedTerm = !complete;
  const termMonths = str(a.SV5) === "other" ? num(str(a.SV5a)) : num(str(a.SV5) || (platform ? "12" : "6"));
  const autoRenew = fixedTerm && str(a.SV6) === "auto";
  const basis = pro ? str(a.SV8) || "fixed" : "";
  const success = basis === "retainer_success";
  const increase = str(a.SV11);
  const levels = platform && str(a.SV12) === "standard";
  const changes = platform ? str(a.SV13) || "terminate" : "";
  const indemnity = str(a.SV18) || "broad";
  const capBoth = str(a.SV17) === "both";
  const convenience = str(a.SV22) !== "none";
  const claims = str(a.SV19);
  const insurance = str(a.SV20);
  const solicit = str(a.SV21);

  if (deliverables.length) own.push("the deliverables");
  if (platform && str(a.SV7b) === "yes" && str(a.SV7c)) own.push("the usage fees");
  if (success && str(a.SV8d)) own.push("the success fee");

  /* ── which version of each clause ──────────────────────────────────── */
  const keep = (when?: string): boolean => {
    switch (when) {
      case undefined: return true;
      case "platform": return platform;
      case "professional": return pro;
      case "provider": return prov;
      case "customer": return cust;
      case "pro_provider": return pro && prov;
      case "platform_provider": return platform && prov;
      case "platform_customer": return platform && cust;
      case "deliverables_provider": return pro && prov && deliverables.length > 0;
      case "deliverables_customer": return pro && cust && deliverables.length > 0;
      case "changes_free": return changes === "free";
      case "changes_terminate": return changes === "terminate";
      case "changes_consent": return changes === "consent";
      case "levels_standard": return levels;
      case "levels_efforts": return platform && !levels;
      case "fixed_term": return fixedTerm;
      case "until_complete": return complete;
      case "auto_renew": return autoRenew;
      case "agreed_renew": return fixedTerm && !autoRenew;
      case "interest": return str(a.SV10) === "1pm";
      case "increase_notice": return increase === "notice" && autoRenew;
      case "increase_notice_no_auto": return increase === "notice" && !autoRenew;
      case "increase_mutual": return increase === "mutual";
      case "insurance_customer": return insurance === "customer";
      case "insurance_provider": return insurance === "provider";
      case "solicit_customer": return solicit === "customer";
      case "solicit_mutual": return solicit === "mutual";
      case "ip_assign": return pro && str(a.SV15) === "assign";
      case "ip_licence": return pro && str(a.SV15) !== "assign";
      case "indemnity_broad": return indemnity === "broad";
      case "indemnity_narrow": return indemnity !== "broad";
      case "indemnity_mutual": return indemnity === "mutual";
      case "indemnity_not_broad": return indemnity !== "broad";
      case "claims_6": return claims === "6";
      case "claims_12": return claims === "12";
      case "convenience": return convenience;
      case "courts": return str(a.SV23) !== "siac";
      case "siac": return str(a.SV23) === "siac";
      case "success": return success;
      default: return true;
    }
  };

  /* ── the fields ────────────────────────────────────────────────────── */
  const description = asPhrase(str(a.SV4));
  if (!description) missing.add("description of the Services");
  const startDate = str(a.SV5s) === "date" ? str(a.SV5t) : "";
  if (startDate) own.push("the start date");
  const payDays = Number(str(a.SV9) || "30");
  const capFixed = num(str(a.SV16a));
  const capKind = str(a.SV16) || "fees_12";
  const money = (n: number) => (Number.isFinite(n) ? `${cur}${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}` : GAP);

  const unlimitedExtra: string[] = [];
  if (capBoth) unlimitedExtra.push("the Customer's obligation to pay the Fees");
  if (capBoth && indemnity === "broad") unlimitedExtra.push("the Customer's liability under {{clause:indemnity_broad}}");
  if (cust) unlimitedExtra.push("breach of {{section:confidentiality}}");
  if (cust && indemnity === "mutual") unlimitedExtra.push("the Service Provider's liability under {{clause:indemnity_provider}}");

  const f: Record<string, string> = {
    date: formatDate(today),
    commencement: startDate || "the date of this Agreement",
    services_short: description || GAP,
    term_words: months(termMonths),
    pay_days: days(payDays),
    cur_word: cur,
    cur_name: usd ? "United States dollars" : "Singapore dollars",
    and_deliverables: pro && deliverables.length ? " and the Deliverables" : "",
    customer_inputs: platform ? "Customer Data" : "Customer Materials",
    or_outputs: platform ? " or the Outputs" : "",
    or_deliverables: pro ? " and the Deliverables" : "",
    unlimited_extra: unlimitedExtra.map((x) => `for ${x}, `).join(""),
    cap_who: capBoth ? "each Party's" : "the Service Provider's",
    cap_amount:
      capKind === "fixed"
        ? money(capFixed)
        : capKind === "fees_total"
          ? "the total Fees paid by the Customer under this Agreement"
          : "the Fees paid by the Customer under this Agreement in the twelve (12) months immediately preceding the event giving rise to the claim",
    notice_words: str(a.SV22) === "90" ? "three (3) months'" : "thirty (30) days'",
    not_before: platform && fixedTerm ? ", provided that no such termination takes effect before the end of the Initial Term" : "",
    cure_days: platform ? days(30) : days(14),
    and_expenses: pro ? ", and any expenses properly incurred under {{clause:fees_expenses}}" : "",
  };
  if (capKind === "fixed" && !Number.isFinite(capFixed)) missing.add("cap amount");

  /* ── which clauses ─────────────────────────────────────────────────── */
  const dropSub = new Set<string>();
  if (!platform) dropSub.add("c_access");
  if (!cust) dropSub.add("c_refund");
  if (!(platform && cust)) dropSub.add("c_export");

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
  f.refund_when = convenience
    ? "where the Customer terminates under {{clause:breach}} or the Service Provider terminates under {{clause:convenience}}"
    : "where the Customer terminates under {{clause:breach}}";

  /* What survives: the sections and clauses that matter after the end, by number. */
  const surviving = [
    ...["fees", "ip", "confidentiality", "indemnities", "liability"].filter((id) => f[`section:${id}`]).map((id) => f[`section:${id}`].replace("Clause ", "")),
    ...["non_solicit_customer", "non_solicit_mutual", "provider_insurance", "consequences", "notices", "law_courts", "law_siac"]
      .filter((id) => clauseNo[id])
      .map((id) => clauseNo[id]),
  ].sort((x, y) => {
    const [a1, a2 = 0] = x.split(".").map(Number);
    const [b1, b2 = 0] = y.split(".").map(Number);
    return a1 - b1 || a2 - b2;
  });
  f.survival = `Clauses ${joinAnd(surviving)}`;

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
    return t.replace(/\bClause (\d+(?:\.\d+)*) (and|or|to) Clause (\d+(?:\.\d+)*)/g, "Clauses $1 $2 $3");
  };

  /* ── the blocks ────────────────────────────────────────────────────── */
  const blocks: Block[] = [];
  const plain = (text: string, cont = false) => blocks.push({ kind: "plain", num: "", text, ...(cont ? { cont: true } : {}) });
  const sub = (n: string, text: string, level: 1 | 2 | 3 = 1) => blocks.push({ kind: "subclause", num: n, text, level });

  blocks.push({ kind: "title", num: "", text: TITLE });
  plain(fill(MADE_ON));
  plain(BETWEEN);
  const partyText = (p: Party, label: string) => {
    const vals = {
      name: str(p.name) || GAP,
      id_no: str(p.id_no),
      jurisdiction: str(p.jurisdiction) || "Singapore",
      address: oneLine(str(p.address)),
    };
    if (!str(p.name)) missing.add(label.toLowerCase());
    return `${fill(p.kind === "individual" ? PARTY_INDIVIDUAL : PARTY_COMPANY, vals)} (the "**${label}**")`;
  };
  blocks.push({ kind: "party", num: "(1)", text: `${partyText(provider, "Service Provider")}; and` });
  blocks.push({ kind: "party", num: "(2)", text: `${partyText(customer, "Customer")},` });
  plain(PARTIES_COLLECTIVE);
  plain(`**${BACKGROUND}**`);
  blocks.push({ kind: "recital", num: "(A)", text: fill(RECITALS.provider) });
  blocks.push({ kind: "recital", num: "(B)", text: fill(RECITALS.wish) });
  plain(AGREED);

  const defs = DEFINITIONS.filter((d) => keep(d.when)).map((d) => ({ ...d }));
  const included: string[] = [];
  const prune = (list: MasterSub[]): MasterSub[] => {
    const kept = list.filter((s) => !(s.id && dropSub.has(s.id)) && keep(s.when));
    return kept.length === list.length ? kept : relist(kept);
  };
  const emit = (s: MasterSub, level: 1 | 2 | 3) => {
    const text = fill(s.text);
    if (s.ref) sub(s.ref, text, level);
    else if (text) plain(text, true);
    for (const t of prune(s.subs ?? [])) emit(t, Math.min(3, level + 1) as 1 | 2 | 3);
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
        INTERPRETATION.forEach((r, i) => sub(`(${String.fromCharCode(97 + i)})`, fill(r), 1));
        return;
      }
      for (const s of prune(c.subs ?? [])) emit(s, 1);
      if (c.tail) plain(fill(c.tail), true);
    });
  });

  /* ── signatures ────────────────────────────────────────────────────── */
  plain(EXECUTED);
  const line = "___________________________";
  const signFor = (p: Party, label: string) => {
    const nm = str(p.name) || GAP;
    plain(`**THE ${label.toUpperCase()}**`);
    if (p.kind === "individual") {
      blocks.push({ kind: "sign-head", num: "", text: `SIGNED by ${nm}` });
      for (const l of [line, `Name: ${nm}`, `Email for notices: ${str(p.email) || GAP}`]) blocks.push({ kind: "sign", num: "", text: l });
    } else {
      blocks.push({ kind: "sign-head", num: "", text: `SIGNED by ${str(p.signatory_name) || GAP} for and on behalf of ${nm}` });
      for (const l of [line, `Name: ${str(p.signatory_name) || GAP}`, `Title: ${str(p.signatory_title) || GAP}`, `Email for notices: ${str(p.email) || GAP}`])
        blocks.push({ kind: "sign", num: "", text: l });
    }
    if (!str(p.email)) missing.add(`${label}'s notice e-mail`);
  };
  signFor(provider, "Service Provider");
  signFor(customer, "Customer");

  /* ── Schedule 1: the services ──────────────────────────────────────── */
  const schedule = (n: number, title: string) => {
    blocks.push({ kind: "section", num: "", text: `SCHEDULE ${n}` });
    plain(`**${title}**`);
  };
  schedule(1, "THE SERVICES");
  if (levels) plain("**Part 1 — Description of the Services**");
  plain(fill(`The Service Provider shall provide ${description || GAP}${platform && !/platform/i.test(description) ? ", through the Platform" : ""}.`));
  if (deliverables.length) {
    plain("**Deliverables**", true);
    deliverables.forEach((d, i) => sub(`(${i + 1})`, `${d.replace(/[.;]\s*$/, "")}${i === deliverables.length - 1 ? "." : ";"}`, 1));
  }
  if (levels) {
    plain("**Part 2 — Service Levels**");
    plain(SERVICE_LEVELS.intro, true);
    blocks.push({ kind: "clause", num: "1.", text: SERVICE_LEVELS.support });
    blocks.push({ kind: "clause", num: "2.", text: SERVICE_LEVELS.uptime });
    blocks.push({ kind: "clause", num: "3.", text: "**Response targets.**" });
    SERVICE_LEVELS.responses.forEach((r, i) => sub(`(${String.fromCharCode(97 + i)})`, r, 1));
    plain(SERVICE_LEVELS.tail, true);
  }

  /* ── Schedule 2: the fees ──────────────────────────────────────────── */
  schedule(2, "FEES");
  const rows: string[] = [];
  if (platform) {
    const fee = num(str(a.SV7));
    if (!Number.isFinite(fee)) missing.add("subscription fee");
    const bill = str(a.SV7a) || "monthly";
    const per = bill === "annually" ? "annually" : bill === "quarterly" ? "quarterly" : "monthly";
    rows.push(`**Subscription Fee:** ${money(fee)} per month, invoiced ${per} in advance.`);
    if (str(a.SV7b) === "yes") rows.push(`**Usage Fees:** ${str(a.SV7c).replace(/[.;]\s*$/, "") || GAP}, invoiced monthly in arrears.`);
    const setup = num(str(a.SV7d));
    if (Number.isFinite(setup) && setup > 0) rows.push(`**Set-up Fee:** ${money(setup)}, invoiced on the Commencement Date.`);
  } else {
    const amount = num(str(a.SV8a));
    if (!Number.isFinite(amount)) missing.add("fee amount");
    if (basis === "fixed") {
      const sched = str(a.SV8b) || "half";
      const when = sched === "upfront" ? "invoiced in full on the date of this Agreement" : sched === "completion" ? "invoiced in full on completion of the Services" : "invoiced as to 50% on the date of this Agreement and 50% on completion of the Services";
      rows.push(`**Fixed Fee:** ${money(amount)} for the Services, ${when}.`);
    } else if (basis === "hourly") {
      rows.push(`**Hourly Rate:** ${money(amount)} per hour, for time properly spent on the Services, invoiced monthly in arrears with a summary of the time spent.`);
      const capped = num(str(a.SV8c));
      if (Number.isFinite(capped) && capped > 0) rows.push(`**Fee Cap:** the Fees shall not exceed ${money(capped)} in total without the Customer's prior written approval.`);
    } else {
      rows.push(
        `**Retainer:** ${money(amount)} per calendar month, invoiced monthly in advance for each month of the Term${prov ? ", whether or not any particular outcome is achieved. The Retainer is not refundable" : ""}.`,
      );
      if (success) {
        const s = str(a.SV8d).replace(/[.;]\s*$/, "");
        if (!s) missing.add("success fee");
        rows.push(`**Success Fee:** in addition to the Retainer, ${s || GAP} (the "Success Fee"). The Success Fee is invoiced when it is earned and is payable within the payment terms below.`);
      }
    }
    rows.push("**Expenses:** reasonable out-of-pocket expenses approved in advance in writing, reimbursed at cost on production of receipts.");
  }
  rows.push(`**Payment:** each invoice is payable within ${f.pay_days} of its ${prov ? "date" : "receipt"}${str(a.SV10) === "1pm" ? "; interest on overdue undisputed sums at 1% per month" : ""}.`);
  if (increase) rows.push(fill(`**Fee increases:** in accordance with {{clause:${increase === "mutual" ? "fees_increase_mutual" : autoRenew ? "fees_increase_notice" : "fees_increase_agreed_renewal"}}}.`));
  rows.push("**GST:** all amounts are exclusive of GST, charged in addition at the prevailing rate where applicable.");
  rows.forEach((r, i) => blocks.push({ kind: "clause", num: `${i + 1}.`, text: r }));

  /* ── what the lawyer should know ───────────────────────────────────── */
  if (own.length) {
    flags.push({ level: "yellow", scenario: "SV21", title: "Your own wording", reason: `Wording you typed has gone into the agreement as written: ${joinAnd(Array.from(new Set(own)))}. Have your lawyer check it.` });
  }
  if (fdUsed.length) {
    flags.push({
      level: "green",
      scenario: "FD",
      title: "FD supplementary wording",
      reason: `Wording not in either precedent, written in their style for the answers given: ${joinAnd(Array.from(new Set(fdUsed)))}. For FD review.`,
    });
  }

  return { blocks, missing: Array.from(missing), flags, fields: f, included };
}
