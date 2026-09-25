/**
 * Answers → term sheet.
 *
 * A port of the firm's reference mapper (fd_ts_mapper.py), brought up to
 * master v4.0 and made to produce the app's document blocks rather than
 * plain text. Deterministic: the same answers give the same letter, every
 * time, with nothing invented — the AI's only contribution is the handful
 * of fields in `ai`, and those are checked here before they are used.
 *
 * What comes out:
 *   blocks    the letter, as the document editor draws it
 *   included  the master paragraphs that went in ("1", "2", "3", "9" …)
 *   binding   the headings 3.1 lists
 *   missing   fields nothing could fill — shown as [●] and reported
 *   flags     what a lawyer should look at (playbook §8)
 */

import type { Block } from "../contract/parse";
import { applyDefaults, evaluate, type Answers } from "./conditions";
import {
  ACCEPTANCE, ACCEPTANCE_DATE, CLOSING, HEADER, PARAGRAPHS, PARTY_COMPANY, PARTY_INDIVIDUAL,
  SIGNATURE_COMPANY, SIGNATURE_INDIVIDUAL, type MasterSub,
} from "./data/master";
import {
  ARBITRATION, ARBITRATION_LANGUAGE, CONDITIONS, KEY_TERM_HEADINGS, PARAGRAPH_RULES, PAYMENT_PHRASES, PRICING_BASIS,
  REGISTRATION_LABEL, ROLES, SUBJECT, THIRD_PARTY_RIGHTS_STATUTE, type DealType,
} from "./data/map";
import { addPeriod, formatDate, joinAnd, letteredList, normaliseMoney, parseDate, periodWords, todaySingapore, withArticle } from "./format";
import type { AiFields, Flag, KeyTerm, Party, TermSheetInput } from "./types";

export interface Assembled {
  blocks: Block[];
  included: string[];
  binding: string[];
  missing: string[];
  flags: Flag[];
  /** Every field as it was filled, for the confirm-back screen and for tests. */
  fields: Record<string, string>;
  keyTerms: KeyTerm[];
  /** The plain-English name of the deal for titles: "Investment", "Loan" … */
  dealLabel: string;
}

const GAP = "[●]";

const DEAL_LABEL: Record<DealType, string> = {
  investment: "Investment", loan: "Loan", acquisition: "Acquisition", project: "Project", other: "Transaction",
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function list(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}

/** Fill {{fields}}; anything unknown becomes a gap and is reported. */
function fill(text: string, f: Record<string, string>, missing: Set<string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = f[k];
    if (v === undefined || v === "") {
      missing.add(k);
      return GAP;
    }
    return v;
  });
}

/** The country a party is in, for "all in one country" and the law default. */
export function countryOf(p: Party | undefined): string {
  const j = str(p?.jurisdiction);
  if (!j) return "";
  const parts = j.split(",").map((s) => s.trim());
  return parts[parts.length - 1];
}

export function partyLine(p: Party, role: string, f: Record<string, string>, missing: Set<string>): string {
  const label = REGISTRATION_LABEL[countryOf(p)] ?? REGISTRATION_LABEL.default;
  const vals: Record<string, string> = {
    ...f,
    name: p.name,
    registration_label: label,
    reg_no: str(p.reg_no),
    entity_type: str(p.entity_type),
    jurisdiction: str(p.jurisdiction),
    address: p.address,
    id_type: str(p.id_type),
    id_no: str(p.id_no),
    role,
  };
  return fill(p.kind === "individual" ? PARTY_INDIVIDUAL : PARTY_COMPANY, vals, missing);
}

/** Key-term lines from the answers alone — used when the AI gave none, or
 *  gave lines that did not pass the checks. Nothing here is invented. */
export function keyTermsFromAnswers(a: Answers, deal: DealType): KeyTerm[] {
  const heads = KEY_TERM_HEADINGS[deal];
  const out: KeyTerm[] = [];
  const amount = str(a.Q8b);
  if (amount) {
    const money = normaliseMoney(amount);
    out.push({ heading: heads[0], text: money ? money.text : amount, source: "Q8b" });
  }
  const pricing = str(a.Q8c);
  if (pricing && heads[1]) {
    let text = pricing;
    if (deal === "investment") {
      const money = normaliseMoney(pricing);
      const basis = str(a.Q8c_basis);
      const base = money ? money.text : pricing;
      text = basis === "pre" || basis === "post" ? `${base} on a ${basis}-money, fully diluted basis` : base;
    } else if (deal === "acquisition") {
      text = PRICING_BASIS[pricing] ?? pricing;
    }
    out.push({ heading: heads[1], text, source: "Q8c" });
  }
  const payment = str(a.Q8d);
  if (payment && heads[2]) {
    const detail = str(a.Q8d_detail);
    const text = PAYMENT_PHRASES[payment] ?? (detail || payment);
    out.push({ heading: heads[2], text: detail && PAYMENT_PHRASES[payment] ? `${PAYMENT_PHRASES[payment]}; ${detail}` : text, source: "Q8d" });
  }
  list(a.Q8e).forEach((line, i) => {
    out.push({ heading: "Other Term", text: line, source: `Q8e[${i}]` });
  });
  return out;
}

/** Every digit-run in the AI's text must appear somewhere in the answers or
 *  the parties: the playbook's hard rule against invented numbers, checked
 *  rather than trusted. */
export function numbersAreFromAnswers(text: string, corpus: string): boolean {
  const digits = (s: string) => Array.from(s.matchAll(/\d[\d,.]*\d|\d/g)).map((m) => m[0].replace(/[,.]/g, ""));
  const known = new Set(digits(corpus));
  for (const n of digits(text)) {
    if (known.has(n)) continue;
    /* "one (1)" style periods and small counts are house style, not invention. */
    if (n.length <= 1) continue;
    /* USD 2,000,000 written from "US$2m": the multiplied figure. */
    const stripped = n.replace(/0+$/, "");
    if (stripped && known.has(stripped)) continue;
    return false;
  }
  return true;
}

function corpusOf(a: Answers, parties: Party[]): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(a)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) parts.push(v.map(String).join(" "));
  }
  for (const p of parties) parts.push(Object.values(p).filter((x) => typeof x === "string").join(" "));
  const money = [a.Q8b, a.Q8c, a.Q13_amount].map((x) => (typeof x === "string" ? normaliseMoney(x)?.text ?? "" : "")).join(" ");
  return parts.join(" ") + " " + money;
}

/** The AI's key terms, kept only where they trace to an answer and invent no
 *  number. Lines that fail are replaced by the answer's own words. */
export function vetKeyTerms(ai: KeyTerm[] | undefined, a: Answers, parties: Party[], deal: DealType, flags: Flag[]): KeyTerm[] {
  const own = keyTermsFromAnswers(a, deal);
  if (!ai || ai.length === 0) return own;
  const corpus = corpusOf(a, parties);
  const validSources = new Set(own.map((t) => t.source));
  const out: KeyTerm[] = [];
  const seen = new Set<string>();
  for (const t of ai) {
    const heading = str(t.heading);
    const text = str(t.text);
    const source = str(t.source);
    if (!heading || !text) continue;
    const ok = (validSources.has(source) || source === "S16") && numbersAreFromAnswers(text, corpus);
    if (!ok) {
      flags.push({
        level: "green",
        scenario: "AI",
        reason: `A key-term line ("${heading}") was left out: it did not match your answers.`,
        user_message: `I left out a “${heading}” line I had drafted, because it didn’t match your answers exactly — your own words are used instead.`,
        field: source || "key_terms",
      });
      continue;
    }
    if (seen.has(source) && source !== "S16") continue;
    seen.add(source);
    out.push({ heading, text: text.replace(/[.;]\s*$/, ""), source });
  }
  /* Any answer the AI left out comes through in its own words. */
  for (const t of own) if (!seen.has(t.source)) out.push(t);
  /* Order: amount → price or valuation → payment → other terms as given. */
  const rank = (s: string) => (s === "Q8b" ? 0 : s === "Q8c" ? 1 : s === "Q8d" ? 2 : s.startsWith("Q8e") ? 3 + Number(/\d+/.exec(s)?.[0] ?? 0) : 99);
  return out.sort((x, y) => rank(x.source) - rank(y.source));
}

export function assemble(input: TermSheetInput): Assembled {
  const a = applyDefaults(input.answers);
  const parties = input.parties;
  const ai: Partial<AiFields> = input.ai ?? {};
  const missing = new Set<string>();
  const flags: Flag[] = [];

  const deal = ((typeof a.Q1 === "string" && a.Q1 in ROLES ? a.Q1 : "other") as DealType);
  const roles = ROLES[deal];
  const p1 = parties[0];
  const p2 = parties[1];
  const today = parseDate(input.date) ?? todaySingapore();

  /* ── the fields ─────────────────────────────────────────────────────── */
  const f: Record<string, string> = {
    party_1_role: roles[0],
    party_2_role: roles[1],
    date: formatDate(today),
    document_title: str(input.documentTitle) || "TERM SHEET",
    recipient_name: str(p2?.name),
    recipient_address: str(p2?.address),
    recipient_contact: [str(p2?.contact_name), str(p2?.contact_title)].filter(Boolean).join(", "),
    salutation: str(p2?.salutation) || (str(p2?.contact_name).split(/\s+/)[0] ?? "") || "Sirs",
    arbitration_language: ARBITRATION_LANGUAGE,
  };

  /* The Proposed Transaction. */
  f.transaction_title = str(ai.transaction_title);
  f.transaction_description = str(ai.transaction_description);
  f.structure = str(ai.structure);
  const q4 = str(a.Q4);
  if (SUBJECT[q4]) {
    f.subject_matter = SUBJECT[q4]
      .replace(/\{\{target_name\}\}/g, str(p2?.name) || GAP)
      .replace(/\{\{project_subject\}\}/g, str(a._project_subject) || str(ai.subject_matter) || GAP);
  } else {
    f.subject_matter = str(ai.subject_matter) || str(a.Q4_other) || q4;
  }
  f.definitive_agreements = joinAnd(list(a.Q5).filter((x) => x !== "suggest").map(withArticle));

  /* Timing. */
  const expiry = addPeriod(today, str(a.Q6a) || "P14D");
  const longStop = addPeriod(today, str(a.Q6b) || "P3M");
  f.expiry_date = expiry ? formatDate(expiry) : "";
  f.long_stop_date = longStop ? formatDate(longStop) : "";
  const q10a = str(a.Q10a);
  f.signing_period = q10a && q10a !== "unsure" ? periodWords(q10a) : "";
  const q10b = str(a.Q10b);
  const completion = q10b && q10b !== "unsure" ? parseDate(q10b) : null;
  f.completion_date = completion ? formatDate(completion) : "such date as the Parties may agree";
  if (q10a && q10a !== "unsure" && parseDate(q10a)) f.signing_period = `the period ending on ${formatDate(parseDate(q10a)!)}`;

  /* Law and disputes. */
  const country = str(a.Q7a_other) || str(a.Q7a);
  const law = str(a.Q7a_state) || country;
  f.governing_law = law;
  f.court_jurisdiction = law;
  const arb = ARBITRATION[law] ?? ARBITRATION.default;
  f.arbitral_institution = arb.institution;
  f.arbitration_seat = arb.seat.replace(/\{\{governing_law\}\}/g, law);
  if (arb.review && law) {
    flags.push({ level: "yellow", scenario: "S19", title: "Arbitration seat", reason: `No arbitration centre is set for ${law} law, so the ICC is used with the seat in ${law}; confirm the institution and name a city.`, field: "Q7a" });
  }
  const statute = THIRD_PARTY_RIGHTS_STATUTE[law];
  if (statute) f.third_party_rights_statute = statute;

  const allInOneCountry = parties.length > 0 && parties.every((p) => countryOf(p) === countryOf(parties[0]));
  const lawCountry = country;
  let forum = str(a.Q7b);
  if (forum === "recommend" || forum === "") {
    forum = allInOneCountry && countryOf(p1) === lawCountry ? "courts" : "arbitration";
  }
  if (!["courts", "arbitration"].includes(forum)) {
    flags.push({ level: "yellow", scenario: "OTHER", title: "Disputes", reason: `Disputes were described as "${str(a.Q7b_other) || forum}"; the standard arbitration wording is used for now and should be adapted.`, field: "Q7b" });
    forum = "arbitration";
  }

  /* Costs. */
  const q13 = str(a.Q13);
  if (q13 === "capped") {
    const cap = normaliseMoney(str(a.Q13_amount));
    f.costs_allocation = `The ${roles[1]} shall pay the legal costs of the ${roles[0]} up to ${cap ? cap.text : str(a.Q13_amount) || GAP}, whether or not the Proposed Transaction proceeds. Otherwise each Party shall bear its own costs.`;
    if (!cap && !str(a.Q13_amount)) missing.add("costs_cap");
  } else if (q13 && q13 !== "own") {
    f.costs_allocation = str(ai.costs_allocation) || str(a.Q13_other) || q13;
  }

  /* Exclusivity. */
  const q11 = str(a.Q11);
  if (q11 && q11 !== "no") f.exclusivity_period = periodWords(str(a.Q11_other) || q11);

  /* ── which paragraphs ───────────────────────────────────────────────── */
  const included = PARAGRAPH_RULES.filter((r) => r.include === "always" || evaluate(r.include_if ?? null, a)).map((r) => r.para);
  const bindingHeads = PARAGRAPHS.filter((p) => p.binding && p.number !== "3" && included.includes(p.number)).map((p) => p.heading);
  f.binding_provisions = joinAnd(bindingHeads.map((h) => `“${h}”`));

  /* Key terms and conditions. */
  const keyTerms = included.includes("4") ? vetKeyTerms(ai.key_terms, a, parties, deal, flags) : [];
  const q9 = list(a.Q9).filter((x) => x !== "none");
  const conditions: string[] = q9.map((c) => (CONDITIONS[c] ?? "").replace(/\{\{party_1_role\}\}/g, roles[0])).filter(Boolean);
  const otherConds = (ai.conditions_other ?? []).map(str).filter(Boolean);
  if (q9.includes("other") || str(a.Q9_other)) {
    if (otherConds.length) conditions.push(...otherConds);
    else if (str(a.Q9_other)) conditions.push(str(a.Q9_other));
  }
  f.conditions = letteredList(conditions);

  /* ── the blocks ─────────────────────────────────────────────────────── */
  const blocks: Block[] = [];
  const plain = (text: string) => blocks.push({ kind: "plain", num: "", text });

  for (const line of HEADER) {
    /* The address may run to several lines; each is its own line of the letter. */
    if (line === "{{recipient_address}}") {
      const addr = f.recipient_address || GAP;
      if (!f.recipient_address) missing.add("recipient_address");
      addr.split(/\s*[\n,]\s*/).filter(Boolean).forEach((l) => plain(l));
      continue;
    }
    /* "Attention:" names a person; with nobody named the line is left out
       rather than printed with a gap in it. */
    if (line.includes("{{recipient_contact}}") && !f.recipient_contact) continue;
    plain(fill(line, f, missing));
  }

  const partyRole = (i: number) => (i === 0 ? roles[0] : i === 1 ? roles[1] : str(parties[i].role) || `${["Third", "Fourth", "Fifth", "Sixth"][i - 2] ?? "Further"} Party`);
  let num = 0;
  for (const p of PARAGRAPHS) {
    if (!included.includes(p.number)) continue;
    num += 1;
    blocks.push({ kind: "section", num: "", text: `${num}. ${p.heading.toUpperCase()}` });

    let ci = 0;
    for (const c of p.clauses) {
      let text = c.text;
      let subs: MasterSub[] = c.subparagraphs ? c.subparagraphs.slice() : [];

      if (p.number === "1" && c.number === "1.1") {
        const lines: MasterSub[] = parties.map((party, i) => ({
          ref: `(${String.fromCharCode(97 + i)})`,
          text: partyLine(party, partyRole(i), f, missing) + (i === parties.length - 1 ? "," : i === parties.length - 2 ? "; and" : ";"),
        }));
        if (parties.length < 2) {
          for (let i = parties.length; i < 2; i++) {
            missing.add(`party_${i + 1}`);
            lines.push({ ref: `(${String.fromCharCode(97 + i)})`, text: `${GAP} (the **“${partyRole(i)}”**)${i === 1 ? "," : "; and"}` });
          }
        }
        subs = [...lines, ...subs];
      }
      if (p.number === "4") {
        if (keyTerms.length === 0) continue;
        subs = keyTerms.map((t, i) => ({
          ref: `(${String.fromCharCode(97 + i)})`,
          text: `**${t.heading}:** ${t.text}${i === keyTerms.length - 1 ? "." : i === keyTerms.length - 2 ? "; and" : ";"}`,
        }));
      }
      if (p.number === "5" && c.number === "5.2" && !q9.includes("due_diligence")) continue;
      if (p.number === "9") text = chooseOption(text, f.costs_allocation ? 1 : 0);
      if (p.number === "11" && c.number === "11.2") text = chooseOption(text, forum === "courts" ? 0 : 1);
      if (p.number === "12" && c.number === "12.1") text = optional(text, Boolean(f.third_party_rights_statute));

      ci += 1;
      blocks.push({ kind: "clause", num: `${num}.${ci}`, text: fill(text, f, missing) });
      for (const s of subs) {
        if (s.ref) blocks.push({ kind: "subclause", num: s.ref, text: fill(s.text, f, missing), level: 1 });
        else plain(fill(s.text, f, missing));
      }
    }
  }

  for (const line of CLOSING) plain(fill(line, f, missing));
  const sign = (party: Party | undefined, i: number, accept: boolean) => {
    const name = str(party?.name) || GAP;
    if (!party) missing.add(`party_${i + 1}`);
    const tpl = party?.kind === "individual" ? SIGNATURE_INDIVIDUAL : SIGNATURE_COMPANY;
    for (const l of tpl) plain(l.replace(/\{\{NAME\}\}/g, name.toUpperCase()).replace(/\{\{name\}\}/g, name));
    if (accept) plain(ACCEPTANCE_DATE);
  };
  sign(p1, 0, false);
  for (const l of ACCEPTANCE) plain(l);
  for (let i = 1; i < Math.max(2, parties.length); i++) sign(parties[i], i, true);

  /* Nothing the AI drafted goes out unflagged (playbook §2). */
  for (const k of ["transaction_title", "transaction_description", "structure"] as const) {
    if (f[k]) flags.push({ level: "green", scenario: "AI", reason: `${k.replace(/_/g, " ")} was drafted by the AI — please confirm it.`, field: k });
  }
  if (!SUBJECT[q4] && f.subject_matter) flags.push({ level: "yellow", scenario: "OTHER", title: "Subject matter", reason: `The subject matter was typed in ("${f.subject_matter}"); check paragraph 2.2 describes it precisely.`, field: "Q4" });

  return {
    blocks,
    included,
    binding: bindingHeads,
    missing: Array.from(missing),
    flags,
    fields: f,
    keyTerms,
    dealLabel: DEAL_LABEL[deal],
  };
}

/** "[A / B]" → A or B. The split is on " / " at the top level of the bracket. */
export function chooseOption(text: string, index: 0 | 1): string {
  return text.replace(/\[([\s\S]*?) \/ ([\s\S]*?)\]$/, (_, a: string, b: string) => (index === 0 ? a : b));
}

/** "[text]" → text, or nothing. Only the first optional bracket in the clause. */
export function optional(text: string, keep: boolean): string {
  return text.replace(/\[([^\]]*)\]/, (_, inner: string) => (keep ? inner : ""));
}
