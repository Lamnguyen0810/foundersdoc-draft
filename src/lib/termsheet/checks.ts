/**
 * The scenarios the back end can spot by rule (drafting_scenarios.json,
 * detect.type = "rule"). Run before the AI is asked anything: an "ask"
 * result means the questions go back to the user first; a red means nothing
 * is drafted. The AI-judged scenarios (type = "ai_check") live in ai.ts.
 *
 * Order, as the scenarios file says: red first, then ask, then yellow, then
 * green. One red stops drafting.
 */

import { applyDefaults, type Answers } from "./conditions";
import { ARBITRATION, FEDERAL_COUNTRIES, THIRD_PARTY_RIGHTS_STATUTE } from "./data/map";
import { SCENARIOS } from "./data/scenarios";
import { addPeriod, compareDates, currenciesIn, parseDate, todaySingapore } from "./format";
import { countryOf } from "./assemble";
import type { Flag, Party } from "./types";

type Scenario = (typeof SCENARIOS)["scenarios"][number];

const BY_ID: Record<string, Scenario> = Object.fromEntries(SCENARIOS.scenarios.map((s) => [s.id, s]));

/**
 * What each flag says, in one sentence, to the lawyer who reviews the term
 * sheet before it is signed — the client's own. Taken from the playbook's
 * own notes (§9 and drafting_scenarios.json), in plain words.
 */
export const LAWYER_NOTE: Record<string, string> = {
  S4: "The kind of deal was typed in rather than chosen, so check the roles and wording fit it.",
  S8: "The deal has more than one element (for example shares and a loan); check both are described in 2.2 and 2.3.",
  S13: "Customer data, personal data or employees move in this deal; data-protection and employee-transfer rules differ by country.",
  S14: "Security or a guarantee is involved; check the asset and the guarantor are named precisely. Personal guarantees need particular care.",
  S16: "An intellectual-property line was added because this is a development project; check it suits the deal.",
  S18: "The parties are in different countries; check the governing law and that arbitration (or the courts chosen) suits both sides.",
  S19: "The governing law is outside FD's reference tables; confirm the arbitration seat and any local formalities. No third-party-rights statute is cited.",
  S20: "Some answers were not in English and have been translated; check the facts carried over correctly.",
  S22: "A binding payment (such as a break fee) was asked for; check it is enforceable.",
  S23: "A break fee, deposit or penalty is included; some legal systems will not enforce a payment that works as a penalty.",
  S24: "Both sides are meant to be bound by exclusivity, but paragraph 7 binds only the receiving party; it needs adapting.",
  S25: "A non-compete or non-solicit is included as a key term; how far it can be enforced varies greatly between countries.",
  S26: "A party is listed or regulated; stock-exchange disclosure and inside-information rules may apply, and the term sheet itself may be inside information.",
  S28: "An answer contained instructions to the AI; they were ignored and only the facts were used.",
};

/** A few words for a flag, for the list the user sees. */
export function titleFor(f: Flag): string {
  if (f.title) return f.title;
  if (f.scenario === "OTHER") return "Typed answer";
  if (f.scenario === "AI") return "Drafted by FD AI";
  const s = BY_ID[f.scenario];
  return s?.name ?? "Worth checking";
}

function flag(id: string, extra: Partial<Flag> = {}): Flag {
  const s = BY_ID[id];
  const msg = "user_message" in s ? (s.user_message as string) : undefined;
  return {
    level: (s?.level as Flag["level"]) ?? "yellow",
    scenario: id,
    title: s?.name,
    reason: extra.reason ?? LAWYER_NOTE[id] ?? s?.name ?? id,
    field: extra.field,
    user_message: extra.user_message ?? msg,
  };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);

export interface RuleChecks {
  flags: Flag[];
  /** Questions to put to the user before anything is drafted. */
  ask: Flag[];
  stop: Flag | null;
  /** S16: add the default IP line. */
  addIpLine: boolean;
}

export function ruleChecks(answersIn: Answers, parties: Party[], dateIso?: string): RuleChecks {
  const a = applyDefaults(answersIn);
  const flags: Flag[] = [];
  const ask: Flag[] = [];
  const today = (dateIso && parseDate(dateIso)) || todaySingapore();

  /* ── ask ────────────────────────────────────────────────────────────── */

  // S5 · party details missing. A Law that cannot be completed is not drafted.
  const need = (p: Party | undefined, label: string) => {
    if (!p) return `${label}: no details yet`;
    const gaps: string[] = [];
    if (!str(p.name)) gaps.push("full legal name");
    if (!str(p.address)) gaps.push("registered address");
    if (p.kind === "individual") {
      if (!str(p.id_no)) gaps.push("ID number");
    } else {
      if (!str(p.reg_no)) gaps.push("registration number");
      if (!str(p.jurisdiction)) gaps.push("country of incorporation");
      if (!str(p.entity_type)) gaps.push("type of entity");
    }
    return gaps.length ? `${label}: ${gaps.join(", ")}` : "";
  };
  const partyGaps = [need(parties[0], "The party sending the term sheet"), need(parties[1], "The party receiving it")]
    .concat(parties.slice(2).map((p, i) => need(p, p.role || `Party ${i + 3}`)))
    .filter(Boolean);
  if (partyGaps.length) {
    ask.push(flag("S5", { reason: partyGaps.join("; "), field: "parties", user_message: `A few party details are missing — ${partyGaps.join("; ")}. Every party needs its full registered name, number and address before the term sheet can be prepared.` }));
  }

  // S17 · federal country without a state.
  const country = str(a.Q7a_other) || str(a.Q7a);
  if (FEDERAL_COUNTRIES.includes(country) && !str(a.Q7a_state)) {
    ask.push(flag("S17", { field: "Q7a_state", user_message: `Which state or province's law should apply? In ${country}, contract law is set at state or province level.` }));
  }

  // S7 · dates that do not work.
  const expiry = addPeriod(today, str(a.Q6a) || "P14D");
  const longStop = addPeriod(today, str(a.Q6b) || "P3M");
  const problems: string[] = [];
  if (expiry && compareDates(expiry, today) <= 0) problems.push("the acceptance date is not in the future");
  if (expiry && longStop && compareDates(longStop, expiry) <= 0) problems.push("the long-stop date is not after the acceptance date");
  const signing = parseDate(str(a.Q10a));
  const completion = parseDate(str(a.Q10b));
  if (signing && completion && compareDates(completion, signing) < 0) problems.push("completion is before the target signing date");
  if (problems.length) {
    ask.push(flag("S7", { reason: problems.join("; "), field: "Q6a", user_message: `Some dates don't line up: ${problems.join("; ")}. Could you check them?` }));
  }

  // S12 · a secondary share purchase needs the seller as a party.
  if (str(a.Q4) === "existing_shares" && parties.length < 3) {
    ask.push(flag("S12", { field: "parties" }));
  }

  // S15 · an earn-out needs a measurable trigger.
  if (str(a.Q8c) === "earn_out" && !str(a.Q8c_detail)) {
    ask.push(flag("S15", { field: "Q8c" }));
  }

  // S6 (rule half) · more than one currency in the deal's own amounts. A
  // costs cap in another currency (a London lawyer's fees in GBP on a USD
  // deal) is not a conflict, only worth a look.
  const currencies = new Set<string>();
  for (const v of [a.Q8b, a.Q8c]) for (const c of currenciesIn(str(v))) currencies.add(c);
  if (currencies.size > 1) {
    const cs = Array.from(currencies).join(" and ");
    ask.push(flag("S6", { reason: `Amounts in ${cs}`, field: "Q8b", user_message: `You've mentioned amounts in ${cs}. Which currency should the term sheet use? (We never convert currencies.)` }));
  }
  const capCurrency = currenciesIn(str(a.Q13_amount));
  if (currencies.size === 1 && capCurrency.length === 1 && !currencies.has(capCurrency[0])) {
    flags.push({ level: "yellow", scenario: "S6", title: "Two currencies", reason: `The legal-costs cap is in ${capCurrency[0]} while the deal is in ${Array.from(currencies)[0]}; check that is intended.`, field: "Q13" });
  }

  /* ── yellow ─────────────────────────────────────────────────────────── */

  // Any "Other" free-text answer (playbook §8, first row).
  for (const [k, v] of Object.entries(a)) {
    if (/_other$/.test(k) && str(v)) {
      flags.push({ level: "yellow", scenario: "OTHER", title: "Typed answer", reason: `This was typed in rather than chosen from the list: "${str(v)}". Check it reads correctly in the letter.`, field: k.replace(/_other$/, "") });
    }
  }
  if (str(a.Q1) === "other") flags.push(flag("S4", { field: "Q1" }));

  // S16 · a development project with nothing said about IP.
  const ipMentioned = list(a.Q8e).some((l) => /\b(ip|intellectual property|patent|copyright|trade ?mark)\b/i.test(l));
  const addIpLine = str(a.Q1) === "project" && ["joint_development", "joint_venture"].includes(str(a.Q4)) && !ipMentioned;
  if (addIpLine) flags.push(flag("S16", { field: "Q8e" }));

  // S18 · parties in different countries.
  const countries = new Set(parties.map(countryOf).filter(Boolean));
  if (countries.size > 1) {
    const chosen = str(a.Q7b);
    const reason =
      chosen === "courts"
        ? `${LAWYER_NOTE.S18} Courts were chosen; arbitration is usually recommended where the parties are in different countries.`
        : LAWYER_NOTE.S18;
    flags.push(flag("S18", { reason, field: "Q7b" }));
  }

  // S19 · governing law outside the lookup tables.
  const law = str(a.Q7a_state) || country;
  if (law && !ARBITRATION[law] && !THIRD_PARTY_RIGHTS_STATUTE[law]) {
    flags.push(flag("S19", { reason: `${law} law is outside FD's reference tables; confirm the arbitration seat and any local formalities. No third-party-rights statute is cited.`, field: "Q7a" }));
  }

  // S26 · listed or regulated party.
  if (parties.some((p) => p.listed_or_regulated)) flags.push(flag("S26", { field: "parties" }));

  /* ── green (information for the user) ───────────────────────────────── */
  if (str(a.Q8a) === "no") flags.push(flag("S1", { field: "Q8a" }));
  if (str(a.Q8a) === "partly") flags.push(flag("S2", { field: "Q8a" }));
  if (parties.length > 2) flags.push(flag("S9", { field: "parties" }));
  if (parties.some((p) => p.kind === "individual")) flags.push(flag("S10", { field: "parties" }));
  if (["safe", "convertible_note"].includes(str(a.Q4))) flags.push(flag("S11", { field: "Q4" }));

  return { flags, ask, stop: null, addIpLine };
}

/** The scenario text the AI is briefed with: every ai_check cue. */
export function aiCues(): { id: string; name: string; level: string; cue: string; instruction?: string; user_message?: string }[] {
  return SCENARIOS.scenarios
    .filter((s) => s.detect.type === "ai_check")
    .map((s) => ({
      id: s.id,
      name: s.name,
      level: s.level,
      cue: "cue" in s.detect ? (s.detect.cue as string) : "",
      instruction: "drafting_instruction" in s ? (s.drafting_instruction as string) : undefined,
      user_message: "user_message" in s ? (s.user_message as string) : undefined,
    }));
}
