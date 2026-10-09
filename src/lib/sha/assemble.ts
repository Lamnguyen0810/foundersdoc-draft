/**
 * Answers → shareholders' agreement.
 *
 * Deterministic, as the contractor assembler is: the same answers give the
 * same agreement, every time, from the firm's master (data/master.ts), with
 * nothing invented. No model is called.
 *
 * What comes out:
 *   blocks    the agreement, as the document editor draws it
 *   missing   fields nothing could fill — shown as [●] and reported
 *   flags     what a lawyer should look at
 *   included  the clause ids that went in (for tests and the admin view)
 */

import type { Block } from "../contract/parse";
import { formatDate, joinAnd, normaliseMoney, numberWords, parseDate, todaySingapore } from "../termsheet/format";
import {
  AGREED, BETWEEN, COMPANY_PARTY, COMPANY_PARTY_UNINCORPORATED, DEFINITIONS, EXECUTED, MADE_ON, PARTIES_COLLECTIVE,
  RECITALS, RECITAL_A_UNINCORPORATED, REPORTING_OBLIGATIONS, RESERVED_MATTERS, SCHEDULE_DEFINITIONS_HEAD, SCHEDULE_INTRO,
  SCHEDULE_RULES, SCHEDULE_TITLE, SECTIONS, SHAREHOLDERS_COLLECTIVE, SHAREHOLDER_PARTY, TABLE_A_BOARD_HEAD,
  TABLE_A_CAPITAL_HEAD, TABLE_A_CAPITAL_LINE, TABLE_A_CAPITAL_TAIL, TABLE_A_NOTE, TABLE_A_REPORTING_HEAD,
  TABLE_A_REPORTING_TAIL, TABLE_A_RESERVED_HEAD, TABLE_A_RESERVED_TAIL, TABLE_A_TITLE, TITLE, WHEREAS,
  type Definition, type MasterClause, type MasterSub,
} from "./data/master";
import { applyDefaults, picks } from "./questions";
import type { Answers, Flag, Shareholder, ShaInput } from "./types";

export interface Assembled {
  blocks: Block[];
  missing: string[];
  flags: Flag[];
  fields: Record<string, string>;
  included: string[];
}

const GAP = "[●]";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** "ten per cent. (10%)", the master's way; "12.5 per cent. (12.5%)". */
export function pctWords(raw: string): string {
  const n = Number(String(raw).replace(/%/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return "";
  const shown = Number.isInteger(n) ? String(n) : String(n);
  return Number.isInteger(n) && n < 1000 ? `${numberWords(n)} per cent. (${shown}%)` : `${shown} per cent. (${shown}%)`;
}

/** "three (3)". */
function countWords(n: number): string {
  return Number.isInteger(n) && n > 0 && n < 1000 ? `${numberWords(n)} (${n})` : "";
}

/** "three (3) years". */
function yearsWords(raw: string): string {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? `${numberWords(n)} (${n}) year${n === 1 ? "" : "s"}` : "";
}

/** "US$10,000" from "10000", "US$10k", "SGD 8,000" → "SGD 8,000". */
function moneyWords(raw: string, defaultCurrency = "US$"): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^\d[\d,]*(\.\d+)?$/.test(s)) return `${defaultCurrency}${Number(s.replace(/,/g, "")).toLocaleString("en-GB")}`;
  const m = normaliseMoney(s);
  if (!m) return s;
  return m.currency === "USD" ? `US$${m.amount.toLocaleString("en-GB")}` : m.currency === "SGD" ? `S$${m.amount.toLocaleString("en-GB")}` : m.text;
}

/** Upper-case the first letter, for a sentence whose opening words were left out. */
function capFirst(t: string): string {
  return t.replace(/^(\s*["“]?)([a-z])/, (_, p: string, c: string) => p + c.toUpperCase());
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** Re-letter a run of items after some were dropped, and put the joining
 *  word before the last one. Unnumbered lines keep their place. */
function relist(items: MasterSub[], conj: "and" | "or" | "and/or"): MasterSub[] {
  const numbered = items.filter((s) => s.ref);
  if (numbered.length === 0) return items;
  const first = numbered[0].ref ?? "";
  const roman = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$/.test(first);
  const capital = /^\([A-Z]\)$/.test(first);
  const letters = /^\([a-z]\)$/.test(first) && !roman;
  let i = 0;
  return items.map((s) => {
    if (!s.ref) return s;
    const last = i === numbered.length - 1;
    const penult = i === numbered.length - 2;
    const trailingComma = /,\s*$/.test(s.text.trim());
    let text = s.text.replace(/\s*(;\s*(and\/or|and|or)|;|,|\.)\s*$/, "");
    if (last) text = `${text}${trailingComma ? "," : "."}`;
    else if (penult) text += `; ${conj}`;
    else text += ";";
    const ref = roman ? `(${ROMAN[i]})` : capital ? `(${String.fromCharCode(65 + i)})` : letters ? `(${String.fromCharCode(97 + i)})` : s.ref;
    i += 1;
    return { ...s, ref, text };
  });
}

/** Re-letter a run of sentences after some were dropped; the wording is untouched. */
function relabel(items: MasterSub[]): MasterSub[] {
  const numbered = items.filter((s) => s.ref);
  if (numbered.length === 0) return items;
  const first = numbered[0].ref ?? "";
  const roman = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$/.test(first);
  const letters = /^\([a-z]\)$/.test(first) && !roman;
  let i = 0;
  return items.map((s) => {
    if (!s.ref) return s;
    const ref = roman ? `(${ROMAN[i]})` : letters ? `(${String.fromCharCode(97 + i)})` : s.ref;
    i += 1;
    return { ...s, ref };
  });
}

/** Fill {{fields}}; anything unknown becomes a gap and is reported. */
/** Fields that are meant to be empty sometimes. */
const MAY_BE_EMPTY = new Set<string>(["tag_threshold", "tag_subject", "drag_subject"]);

function fill(text: string, f: Record<string, string>, missing: Set<string>): string {
  const once = fillOnce(text, f, missing);
  /* a field can carry a reference of its own ("{{clause:rofo}}") */
  return once.includes("{{") ? fillOnce(once, f, missing) : once;
}

function fillOnce(text: string, f: Record<string, string>, missing: Set<string>): string {
  return text.replace(/\{\{([\w:]+)\}\}/g, (_, k: string) => {
    const v = f[k];
    if (v === "" && MAY_BE_EMPTY.has(k)) return "";
    if (v === undefined || v === "") {
      if (k.startsWith("clause:") || k.startsWith("section:")) return "this Agreement";
      missing.add(k);
      return GAP;
    }
    return v;
  });
}

const VESTING: Record<string, string> = {
  "4y_1y_monthly": "over a period of four (4) years from the date of this Agreement, as to twenty-five per cent. (25%) on the first anniversary of the date of this Agreement and as to the balance in equal monthly instalments over the following thirty-six (36) months",
  "3y_1y_monthly": "over a period of three (3) years from the date of this Agreement, as to one-third on the first anniversary of the date of this Agreement and as to the balance in equal monthly instalments over the following twenty-four (24) months",
  "4y_yearly": "in four (4) equal annual instalments on each of the first four (4) anniversaries of the date of this Agreement",
  "2y_monthly": "in twenty-four (24) equal monthly instalments from the date of this Agreement",
};

const GOOD_LEAVER: Record<string, string> = {
  without_cause: "the termination of his engagement by the Company without cause",
  death: "his death or permanent disability",
  mutual: "a mutual separation approved by the Board",
};

const BAD_LEAVER: Record<string, string> = {
  resign: "his voluntary resignation without good reason",
  cause: "the termination of his engagement for cause, including serious misconduct, fraud or breach of the Company's rules",
  underperform: "persistent underperformance despite written feedback from the Board",
  uncured: "a material breach of his obligations to the Company which he fails to remedy within thirty (30) days after written notice",
};

const DEFAULT_PRICE: Record<string, string> = {
  disc75: "a seventy-five per cent. (75%) discount to the Fair Market Value",
  disc50: "a fifty per cent. (50%) discount to the Fair Market Value",
  disc25: "a twenty-five per cent. (25%) discount to the Fair Market Value",
  fmv: "the Fair Market Value",
};

/** The labels the master gives the shareholders in the parties clause. */
export function partyLabels(holders: Shareholder[]): string[] {
  const n = { founder: 0, investor: 0, other: 0 };
  return holders.map((h) => {
    n[h.kind] += 1;
    return h.kind === "founder" ? `Founder Shareholder ${n.founder}` : h.kind === "investor" ? `Investor Shareholder ${n.investor}` : `Shareholder ${n.other}`;
  });
}

export function assemble(input: ShaInput): Assembled {
  const a: Answers = applyDefaults(input.answers);
  const { company } = input;
  const holders = input.shareholders.filter((h) => str(h.name));
  const missing = new Set<string>();
  const flags: Flag[] = [];
  const today = parseDate(input.date) ?? todaySingapore();
  const own: string[] = [];

  const founders = holders.filter((h) => h.kind === "founder");
  const investors = holders.filter((h) => h.kind === "investor");
  const ceo = founders.find((h) => h.ceo) ?? founders[0];
  const lead = investors.find((h) => h.lead) ?? investors[0];
  const hasInvestors = investors.length > 0;

  /* ── the choices ────────────────────────────────────────────────────── */
  const incorporated = str(a.S1) !== "no";
  const appointRights = picks(a, "S7");
  const removal = picks(a, "S9");
  const process = picks(a, "S10");
  const restrictions = str(a.S26) === "no" ? [] : picks(a, "S26a");
  const exits = picks(a, "S27");
  const defaults = picks(a, "S20");
  const defaultActions = picks(a, "S21");
  const reserved = picks(a, "S24");
  const commitments = picks(a, "S38");
  const goodEvents = picks(a, "S29");
  const badEvents = picks(a, "S30");
  const vesting = str(a.S28);
  const typed = (id: string, where: string) => {
    const t = str(a[id]).replace(/\.$/, "");
    if (t) own.push(where);
    return t;
  };

  /* ── the fields ─────────────────────────────────────────────────────── */
  const classes = Array.from(
    new Set(
      [
        ...picks(a, "S5a"),
        ...holders.map((h) => str(h.share_class)).filter(Boolean),
      ]
        .map((c) => c.replace(/\s+/g, " ").trim())
        .filter((c) => c && !/^ordinary( shares)?$/i.test(c))
        .map((c) => (/shares?$/i.test(c) ? c.replace(/share$/i, "Shares") : `${c} Shares`)),
    ),
  );

  const boardSeats = str(a.S6) === "other" ? Number(str(a.S6a)) : Number(str(a.S6));
  const thresholdPct = str(a.S8) === "other" ? str(a.S8a) : str(a.S8);
  const f: Record<string, string> = {
    date: formatDate(today),
    company_name: str(company.name),
    company_reg_no: str(company.reg_no),
    company_address: str(company.address).replace(/\s*\n\s*/g, ", "),
    business: str(company.business).replace(/\.$/, ""),
    board_size: countWords(boardSeats),
    appoint_threshold: pctWords(thresholdPct),
    ceo_founder: ceo ? str(ceo.name) : "",
    lead_investor: lead ? str(lead.name) : "",
    key_investors: joinAnd(investors.map((h) => str(h.name))),
    investor_names: joinAnd(investors.map((h) => str(h.name))),
    founder_names: joinAnd(founders.map((h) => str(h.name))),
    share_classes: ["the Ordinary Shares", ...classes.map((c) => `the ${c}`)].reduce((acc, c, i, arr) => (i === 0 ? c : i === arr.length - 1 ? `${acc} and ${c}` : `${acc}, ${c}`), ""),
  };
  if (!incorporated) f.company_reg_no = "to be confirmed on incorporation";

  /* Board quorum and votes. */
  const quorumN = Number(str(a.S11a));
  switch (str(a.S11)) {
    case "majority":
      f.board_quorum = "a majority of the Directors for the time being";
      break;
    case "each_major":
      f.board_quorum = "a majority of the Directors for the time being, including at least one (1) Director appointed by each Shareholder entitled to appoint a Director";
      break;
    case "other":
      f.board_quorum = typed("S11a", "board quorum");
      break;
    default:
      f.board_quorum = `any ${countWords(quorumN) || GAP} Directors${hasInvestors ? ", including the Lead Investor Director" : ""}`;
  }
  f.adjourned_board_quorum = {
    same: "The quorum at an adjourned meeting of the Board shall be the same as for the original meeting.",
    any: "The Directors present at an adjourned meeting of the Board shall constitute a quorum.",
    two: "The quorum at an adjourned meeting of the Board shall be any two (2) Directors.",
    other: `The quorum at an adjourned meeting of the Board shall be ${typed("S13a", "adjourned board quorum") || GAP}.`,
  }[str(a.S13) || "two"] ?? "The quorum at an adjourned meeting of the Board shall be any two (2) Directors.";
  f.expense_cap = str(a.S14a) === "other" ? moneyWords(str(a.S14b)) : moneyWords(str(a.S14a) || "10000");
  if (str(a.S12) === "special") f.board_vote = `a majority of not less than ${pctWords(str(a.S12a)) || GAP} of the Directors present and voting`;
  if (str(a.S12) === "unanimous") f.board_vote = "the unanimous vote of the Directors present and voting";

  /* Appointment and removal. */
  const removers = [
    removal.includes("majority") ? "by an ordinary resolution of the Shareholders holding a majority of the Shares" : "",
    removal.includes("board") ? "by a resolution of the Board" : "",
    removal.includes("other") ? typed("S9a", "removal of directors") : "",
  ].filter(Boolean);
  f.removal_others = removers.join(" or ");
  const processes = [
    process.includes("notice") ? "notice in writing to the Company signed by the Shareholder concerned" : "",
    process.includes("board") ? "a resolution of the Board" : "",
    process.includes("ordinary") ? "an ordinary resolution of the Shareholders" : "",
    process.includes("special") ? "a special resolution of the Shareholders" : "",
    process.includes("other") ? typed("S10a", "appointment process") : "",
  ].filter(Boolean);
  f.appoint_process = processes.join(" or ");

  /* Shareholder meetings. */
  f.gm_quorum = { two_ceo: "two (2) Shareholders, one (1) of whom shall be the CEO Founder", majority: "Shareholders holding a majority of the total issued share capital of the Company" }[str(a.S18)] ?? typed("S18a", "general meeting quorum");
  const adjournLead = "The Shareholders shall use reasonable endeavours to procure that a quorum is present at and throughout each meeting of the Shareholders. If within one (1) hour of the time appointed for the meeting, a quorum is not present, the meeting shall be adjourned";
  f.gm_adjourned = {
    seven_days: `${adjournLead} to seven (7) days thereafter and the Shareholder(s) present at such meeting shall constitute a quorum for that meeting.`,
    same: `${adjournLead} to seven (7) days thereafter, and the quorum for the adjourned meeting shall be the same as for the original meeting.`,
  }[str(a.S19)] ?? `${adjournLead} and ${typed("S19a", "adjourned general meeting") || GAP}.`;
  f.gm_chairman = { ceo: "The CEO Founder", board_chair: "The Chairman of the Board", elected: "A Director elected by the Shareholders present at the meeting" }[str(a.S16a)] ?? capFirst(typed("S16b", "chairman of general meetings"));

  /* Reserved matters. */
  const rmPct = pctWords(str(a.S23a));
  f.rm_consent = {
    lead_investor: "the prior written consent of the Lead Investor, whose consent shall not be unreasonably withheld",
    ceo: "the prior written consent of the CEO Founder",
    unanimous: "the prior written consent of all the Shareholders",
    threshold: `the prior written consent of Shareholders holding not less than ${rmPct || GAP} of the total issued share capital of the Company`,
  }[str(a.S23) || "lead_investor"] ?? "";
  f.rm_threshold = moneyWords(str(a.S24a) || "US$1,000,000");

  /* Shares. */
  f.esop_pct = pctWords(str(a.S22a) === "other" ? str(a.S22b) : str(a.S22a) || "10");
  f.preemption_holders = {
    all: "the existing shareholders",
    investors: "the Investors",
    threshold: `the Shareholders holding not less than ${pctWords(str(a.S25b)) || GAP} of the total issued share capital of the Company`,
  }[str(a.S25)] ?? "the existing shareholders";
  f.preemption_period = { "7": "seven (7) days", "14": "fourteen (14) days", "30": "thirty (30) days", "10bd": "ten (10) Business Days" }[str(a.S25a) || "10bd"] ?? "ten (10) Business Days";

  /* Transfers. */
  f.tag_holder = str(a.S26c) === "all" ? "other Shareholder" : "Key Investor";
  f.tag_threshold = str(a.S26c) === "threshold" ? ` and the Shares to be Transferred represent more than ${pctWords(str(a.S26d)) || GAP} of the total issued share capital of the Company` : "";
  f.drag_pct = pctWords(str(a.S26e) === "other" ? str(a.S26f) : str(a.S26e) || "50");
  f.observer_holder = hasInvestors ? "The Lead Investor" : "Each Shareholder entitled to appoint a Director";

  /* Default. */
  const unanimous = defaultActions.includes("unanimous");
  f.default_vote = unanimous ? "unanimously" : "by a majority";
  const noVotes = unanimous || defaultActions.includes("no_votes");
  const noGov = unanimous || defaultActions.includes("no_governance");
  f.default_rights =
    noVotes && noGov
      ? "the Defaulting Shareholder shall no longer be entitled to: (1) exercise the voting rights in relation to the Defaulting Shareholder's Shares, and (2) the Defaulting Shareholder's rights of governance, including any right to appoint Directors or to form part of any required quorum and majority for any Board or general meeting of the Company; and"
      : noVotes
        ? "the Defaulting Shareholder shall no longer be entitled to exercise the voting rights in relation to the Defaulting Shareholder's Shares; and"
        : "the Defaulting Shareholder shall no longer be entitled to the Defaulting Shareholder's rights of governance, including any right to appoint Directors or to form part of any required quorum and majority for any Board or general meeting of the Company; and";
  f.default_recourse = defaultActions.includes("compel_sale")
    ? `the Non-Defaulting Shareholders shall, acting ${f.default_vote}, be entitled, in their discretion, to such recourse as may be available to them under the law or in equity, including but not limited to the right to damages or specific performance compelling the sale of the Defaulting Shareholder's Shares to the Non-Defaulting Shareholders (in proportion (as nearly as possible) to their respective Shareholding Percentages inter se) at ${DEFAULT_PRICE[str(a.S21a) || "disc75"] ?? DEFAULT_PRICE.disc75}.`
    : `the Non-Defaulting Shareholders shall, acting ${f.default_vote}, be entitled, in their discretion, to such recourse as may be available to them under the law or in equity, including but not limited to the right to damages or specific performance.`;

  /* Founders. */
  f.vesting_schedule = vesting === "other" ? typed("S28b", "founder vesting") : VESTING[str(a.S28a) || "4y_1y_monthly"] ?? "";
  f.good_leaver_events = joinOr([...goodEvents.filter((k) => k !== "other").map((k) => GOOD_LEAVER[k]), goodEvents.includes("other") ? typed("S29a", "Good Leaver") : ""].filter(Boolean));
  f.bad_leaver_events = joinOr([...badEvents.filter((k) => k !== "other").map((k) => BAD_LEAVER[k]), badEvents.includes("other") ? typed("S30a", "Bad Leaver") : ""].filter(Boolean));
  f.leaver_kept = vesting === "yes" || vesting === "other" ? "Vested Shares" : "Shares";
  f.leaver_scope = vesting === "yes" || vesting === "other" ? "all of such Founder Shareholder's Vested Shares" : "all of such Founder Shareholder's Shares";
  f.gl_price = { fmv: "their Fair Market Value", board: "a price determined by the Board in good faith" }[str(a.S31)] ?? (str(a.S31) === "fixed" ? typed("S31a", "Good Leaver price") : str(a.S31) === "other" ? typed("S31a", "Good Leaver price") : "");
  f.bl_price = {
    nominal: "an aggregate price of S$1.00 for all such Shares",
    discount: `a ${pctWords(str(a.S32a) || "50")} discount to their Fair Market Value`,
    board: "a price determined by the Board in good faith",
  }[str(a.S32)] ?? typed("S32b", "Bad Leaver price");

  /* Death and insolvency. */
  const hasRofo = restrictions.includes("rofo");
  const insolvencyPrice = { fmv: "the Fair Market Value", board: "a price determined by the Board in good faith" }[str(a.S34a)] ?? str(a.S34b);
  if (str(a.S34) === "offer") {
    f.insolvency_text = `If a Shareholder becomes the subject of any bankruptcy, liquidation or winding up proceedings (other than for the purposes of a bona fide reconstruction or amalgamation), such Shareholder shall be deemed to have offered all of its Shares to the other Shareholders in proportion (as nearly as possible) to their respective Shareholding Percentages at ${insolvencyPrice || GAP}, ${hasRofo ? "and the provisions of {{clause:rofo}} (Right of First Offer) shall apply to such offer with the necessary changes" : "and such offer shall remain open for acceptance for fourteen (14) days"}.`;
  } else if (str(a.S34) === "buyback") {
    f.insolvency_text = `If a Shareholder becomes the subject of any bankruptcy, liquidation or winding up proceedings (other than for the purposes of a bona fide reconstruction or amalgamation), the Company shall be entitled, to the extent permitted by the Act, to buy back all of such Shareholder's Shares at ${insolvencyPrice || GAP}.`;
  }
  const deathMaster = "the Relevant Individual shall be deemed to have given an Offer in accordance with {{clause:rofo}} (Right of First Offer) in respect of the Shares at a price to be agreed between the parties or failing such agreement, the fair market value of such Shares to be determined by an independent auditor jointly appointed by the Shareholders.";
  const deathNoRofo = "the Relevant Individual (or his personal representatives) shall be deemed to have offered such Shares to the other Shareholders in proportion (as nearly as possible) to their respective Shareholding Percentages at a price to be agreed between the parties or failing such agreement, the fair market value of such Shares to be determined by an independent auditor jointly appointed by the Shareholders.";
  f.death_text = {
    offer: hasRofo ? deathMaster : deathNoRofo,
    transmit: "the Shares of the Relevant Individual may be transmitted to, and registered in the name of, his personal representatives or appointed representative, who shall first execute a Deed of Ratification and Accession.",
    buyback: "the Company shall be entitled, to the extent permitted by the Act, to buy back the Shares of the Relevant Individual at their Fair Market Value.",
  }[str(a.S33)] ?? "";

  /* Covenants and amendment. */
  f.lock_in = yearsWords(str(a.S38a) || "3");
  f.post_exit = yearsWords(str(a.S38b) || "2");
  f.amend_by = {
    majority: "the Shareholders holding more than seventy-five per cent. (75%) of the total issued share capital of the Company",
    unanimous: "all the Shareholders",
  }[str(a.S37)] ?? typed("S37a", "amendments");

  /* ── which clauses, and in what words ───────────────────────────────── */
  const drop = new Set<string>();
  const dropSection = new Set<string>();
  const dropSub = new Set<string>();
  const replace: Record<string, string> = {};
  const fdUsed: string[] = [];

  // Board.
  if (!removal.includes("appointer")) dropSub.add("ap_remove");
  if (!removal.includes("below_threshold")) dropSub.add("ev_threshold");
  else fdUsed.push("removal below the threshold");
  if (!f.removal_others) dropSub.add("ap_others");
  else fdUsed.push("removal of directors");
  if (processes.length === 0 || (processes.length === 1 && process[0] === "notice")) dropSub.add("ap_process");
  else fdUsed.push("appointment process");
  if (!hasInvestors) dropSub.add("mt_lead_director");
  if (str(a.S14) === "no") dropSub.add("mt_expenses");
  if (!f.board_vote) dropSub.add("mt_voting");
  else fdUsed.push("board voting threshold");
  if (["majority", "each_major"].includes(str(a.S11))) fdUsed.push("board quorum");
  if (["same", "any"].includes(str(a.S13))) fdUsed.push("adjourned board quorum");
  if (str(a.S17) !== "yes") drop.add("observer");
  else fdUsed.push("board observer");
  if (str(a.S15) === "no") {
    replace.chairman = "**Chairman.** The Chairman of the Board shall be appointed by the Board from among the Founder Directors. The Chairman of the Board shall not be entitled to a second or casting vote at any meeting of the Board and, in the case of an equality of votes, the resolution shall not be passed.";
    fdUsed.push("no casting vote");
  }

  // Shareholder meetings.
  if (str(a.S16) === "no") drop.add("gm_chairman");
  else if (["board_chair", "elected"].includes(str(a.S16a))) fdUsed.push("chairman of general meetings");
  if (str(a.S18) === "majority") fdUsed.push("general meeting quorum");
  if (str(a.S19) === "same") fdUsed.push("adjourned general meeting");

  // Information rights: written for investors.
  if (!hasInvestors) {
    dropSection.add("information");
    drop.add("assignment");
  }

  // Reserved matters.
  const rmItems = RESERVED_MATTERS.filter((r) => reserved.includes(r.key));
  if (rmItems.length === 0) {
    dropSection.add("reserved");
    dropSub.add("so_reserved");
  }
  if (str(a.S23) && str(a.S23) !== "lead_investor") fdUsed.push("reserved matters approval");

  // Shares.
  if (str(a.S22) === "no") {
    dropSection.add("share_option");
    dropSub.add("ex_esop");
  }
  if (str(a.S25) === "none") dropSection.add("pre_emption");
  else if (str(a.S25) !== "all") fdUsed.push("pre-emption holders");

  // Transfers.
  if (str(a.S26) === "no") {
    dropSection.add("transfer");
  } else {
    if (!restrictions.includes("board")) dropSub.add("gr_board");
    else fdUsed.push("board approval of transfers");
    if (!hasRofo) {
      drop.add("rofo");
      dropSub.add("gr_rofo");
    }
    if (!restrictions.includes("tag")) drop.add("tag_along");
    else if (str(a.S26c) !== "key_investors") fdUsed.push("tag-along holders");
    if (!restrictions.includes("drag")) drop.add("drag_along");
    if (!hasRofo && !restrictions.includes("tag")) drop.add("permitted_transfers");
  }

  // Exit.
  if (exits.includes("none") || exits.length === 0) dropSection.add("exit");
  else {
    for (const k of ["trade_sale", "ipo", "asset_sale"]) if (!exits.includes(k)) dropSub.add(`xe_${k}`);
    if (!exits.includes("asset_sale")) drop.add("asset_sale");
  }

  // Default, insolvency, death.
  for (const [k, id] of [["breach", "dd_breach"], ["insolvency", "dd_insolvency"], ["composition", "dd_composition"], ["asset_sale", "dd_asset_sale"]] as const) {
    if (!defaults.includes(k)) dropSub.add(id);
  }
  if (defaults.length === 0) drop.add("defaulting");
  if (!noVotes && !noGov) dropSub.add("dd_rights");
  if (!defaultActions.includes("continue") && !unanimous) dropSub.add("dd_continue");
  if (!defaultActions.includes("compel_sale")) fdUsed.push("default remedies without a compelled sale");
  if (!f.insolvency_text) drop.add("insolvency");
  if (!f.death_text) drop.add("death");
  else if (str(a.S33) !== "offer" || !hasRofo) fdUsed.push("effect of death");

  // Founders: vesting and leavers (all FD supplementary).
  if (founders.length === 0) dropSection.add("vesting");
  if (vesting !== "yes" && vesting !== "other") {
    drop.add("founder_vesting");
    drop.add("unvested");
  }
  if (str(a.S28c) !== "yes") drop.add("unvested");
  if (str(a.S31) === "keep") {
    dropSub.add("ls_good");
    dropSub.add("ls_bad");
    replace.leaver_shares =
      "**Shares of a Leaver.** Within ninety (90) days after the Cessation Date, the Company (or such person as the Board may nominate) may, by notice in writing, require a Founder Shareholder who is a Bad Leaver to transfer {{leaver_scope}} at {{bl_price}}, to the extent permitted by the Act. A Good Leaver shall retain his {{leaver_kept}}.";
  }
  if (founders.length === 0) {
    dropSub.add("ev_good");
    dropSub.add("ev_bad");
  }

  // Covenants.
  if (!commitments.includes("stay")) drop.add("founder_undertaking");
  if (!commitments.includes("no_compete")) dropSub.add("rc_compete");
  if (!commitments.includes("no_solicit")) dropSub.add("rc_solicit");
  if (!commitments.includes("no_compete") && !commitments.includes("no_solicit")) {
    for (const id of ["restrictive_covenants", "reasonableness", "exclusions", "covenant_definitions"]) drop.add(id);
  }
  if (!commitments.includes("exceptions")) dropSub.add("ex_consent");
  if (founders.length === 0) dropSection.add("covenants");

  // Confidentiality.
  if (str(a.S35) === "no") dropSection.add("confidentiality");

  // Amendment.
  if (str(a.S37) === "unanimous") fdUsed.push("unanimous amendment");

  /* ── the sections, numbered ─────────────────────────────────────────── */
  type Built = { id: string; heading: string; clauses: MasterClause[] };
  const built: Built[] = [];
  for (const sec of SECTIONS) {
    if (dropSection.has(sec.id)) continue;
    const clauses = sec.clauses.filter((c) => !drop.has(c.id));
    if (clauses.length === 0) continue;
    built.push({ id: sec.id, heading: sec.heading, clauses });
  }
  const clauseNo: Record<string, string> = {};
  built.forEach((s, i) => {
    f[`section:${s.id}`] = `Clause ${i + 1}`;
    s.clauses.forEach((c, k) => (clauseNo[c.id] = `${i + 1}.${k + 1}`));
  });
  for (const [id, n] of Object.entries(clauseNo)) f[`clause:${id}`] = `Clause ${n}`;
  const ref = (id: string, title: string) => (clauseNo[id] ? `Clause ${clauseNo[id]} (${title})` : "");

  /* References that depend on what went in. */
  const transferIds = ["rofo", "tag_along", "drag_along", "permitted_transfers"].filter((id) => clauseNo[id]);
  f.transfer_clauses = transferIds.length >= 2 ? `Clauses ${clauseNo[transferIds[0]]} to ${clauseNo[transferIds[transferIds.length - 1]]}` : transferIds.length === 1 ? `Clause ${clauseNo[transferIds[0]]}` : "this Agreement";
  const rofoSubject = [ref("drag_along", "Drag Along"), ref("permitted_transfers", "Permitted Transfers")].filter(Boolean);
  f.rofo_subject = rofoSubject.length ? rofoSubject.join(" and ") : "the other provisions of this Agreement";
  f.tag_subject = clauseNo.rofo ? `Subject to compliance with the procedures set out in Clause ${clauseNo.rofo} (Right of First Offer), ` : "";
  f.drag_subject = clauseNo.rofo ? `Notwithstanding Clause ${clauseNo.rofo} (Right of First Offer), ` : "";
  const permittedRefs = [ref("rofo", "Right of First Offer"), ref("tag_along", "Tag Along")].filter(Boolean);
  f.permitted_refs = permittedRefs.join(" and ");

  /* ── the blocks ─────────────────────────────────────────────────────── */
  const blocks: Block[] = [];
  const plain = (text: string, cont = false) => blocks.push({ kind: "plain", num: "", text, ...(cont ? { cont: true } : {}) });
  const sub = (num: string, text: string, level: 1 | 2 | 3 = 1) => blocks.push({ kind: "subclause", num, text, level });

  blocks.push({ kind: "title", num: "", text: TITLE });
  plain(fill(MADE_ON, f, missing));
  plain(BETWEEN);
  blocks.push({ kind: "party", num: "(1)", text: fill(incorporated ? COMPANY_PARTY : COMPANY_PARTY_UNINCORPORATED, f, missing) });
  const labels = partyLabels(holders);
  holders.forEach((h, i) => {
    const last = i === holders.length - 1;
    const penult = i === holders.length - 2;
    const line = fill(SHAREHOLDER_PARTY, { ...f, name: str(h.name), id_no: str(h.id_no), address: str(h.address).replace(/\s*\n\s*/g, ", "), label: labels[i] }, missing);
    blocks.push({ kind: "party", num: `(${i + 2})`, text: `${line}${last ? "," : penult ? "; and" : ";"}` });
  });
  plain(fill(SHAREHOLDERS_COLLECTIVE, { ...f, labels: joinAnd(labels.map((l) => `the ${l}`)) || GAP }, missing));
  plain(PARTIES_COLLECTIVE);
  plain(`**${WHEREAS}**`);
  blocks.push({ kind: "recital", num: "(A)", text: incorporated ? RECITALS[0] : RECITAL_A_UNINCORPORATED });
  blocks.push({ kind: "recital", num: "(B)", text: RECITALS[1] });

  /* Table A. */
  plain(TABLE_A_TITLE);
  plain(TABLE_A_NOTE);
  sub("(1)", TABLE_A_CAPITAL_HEAD);
  if (holders.length === 0) sub("(a)", GAP, 2);
  holders.forEach((h, i) => {
    const capital = moneyWords(str(h.capital), "S$");
    const shares = str(h.shares).replace(/\s*shares?$/i, "");
    const cls = str(h.share_class) || "Ordinary Shares";
    if (!capital) missing.add(`capital of ${str(h.name)}`);
    if (!shares) missing.add(`shares of ${str(h.name)}`);
    sub(`(${String.fromCharCode(97 + i)})`, fill(TABLE_A_CAPITAL_LINE, { name: str(h.name), capital: capital || GAP, shares: shares || GAP, class: /shares?$/i.test(cls) ? cls : `${cls} Shares` }, missing), 2);
  });
  plain(fill(TABLE_A_CAPITAL_TAIL, f, missing), true);
  sub("(2)", TABLE_A_RESERVED_HEAD);
  if (rmItems.length === 0) plain("None.", true);
  rmItems.forEach((r, i) => sub(`(${String.fromCharCode(97 + i)})`, fill(r.text, f, missing), 2));
  if (rmItems.length) plain(fill(TABLE_A_RESERVED_TAIL, f, missing), true);
  if (hasInvestors) {
    sub("(3)", TABLE_A_REPORTING_HEAD);
    REPORTING_OBLIGATIONS.forEach((r, i) => sub(`${i + 1}.`, r, 2));
    plain(fill(TABLE_A_REPORTING_TAIL, f, missing), true);
  }
  sub(hasInvestors ? "(4)" : "(3)", TABLE_A_BOARD_HEAD);
  const directors = picks(a, "S6b");
  plain(`Initial Directors: ${directors.length ? directors.join("; ") : GAP}.`, true);
  if (!directors.length) missing.add("initial directors");
  const rights: string[] = [];
  if (appointRights.includes("threshold")) rights.push(`Each Shareholder holding at least ${f.appoint_threshold || GAP} of the total issued share capital of the Company may appoint one (1) Director.`);
  if (appointRights.includes("named")) {
    const named = holders.filter((h) => h.appoints).map((h) => str(h.name));
    rights.push(`${named.length ? `Each of ${joinAnd(named)}` : GAP} may appoint one (1) Director.`);
    if (!named.length) missing.add("shareholders who appoint a director");
  }
  if (appointRights.includes("majority")) rights.push("Shareholders holding a majority of the total issued share capital of the Company may together appoint the remaining Director(s).");
  if (appointRights.includes("class")) rights.push("The holders of each class of Shares may, acting by a majority of that class, appoint one (1) Director.");
  if (appointRights.includes("other")) rights.push(`${capFirst(typed("S7a", "appointment rights") || GAP)}.`.replace(/\.\.$/, "."));
  rights.forEach((r, i) => sub(`(${String.fromCharCode(97 + i)})`, r, 2));

  plain(AGREED);

  /* Item numbers move when there are no investors. */
  const itemFix = (t: string) => (hasInvestors ? t : t.replace(/item \(4\) of Table A/g, "item (3) of Table A"));

  /* The clauses. */
  const included: string[] = [];
  const emit = (s: MasterSub, level: 1 | 2 | 3) => {
    const text = itemFix(fill(s.text, f, missing));
    if (s.ref) sub(s.ref, text, level);
    else if (text) plain(text, true);
    for (const t of s.subs ?? []) emit(t, Math.min(3, level + 1) as 1 | 2 | 3);
  };
  /** Drop what is switched off; a list that lost an item (or carries FD
   *  wording) is re-lettered and, where it is a true list, re-joined. */
  const SENTENCE_LISTS = new Set(["appointment", "meetings", "restrictive_covenants", "exit_events", "leavers", "drag_along", "tag_along", "rofo", "confidentiality", "announcements"]);
  const prune = (list: MasterSub[], clauseId: string, depth: number, parentRef: string | null): MasterSub[] => {
    const kept = list.filter((s) => !(s.id && dropSub.has(s.id))).map((s) => (s.subs ? { ...s, subs: prune(s.subs, clauseId, depth + 1, s.ref) } : s));
    const changed = kept.length !== list.length || kept.some((s) => s.fd);
    if (!changed) return kept;
    if (depth === 0 && SENTENCE_LISTS.has(clauseId)) return relabel(kept);
    const conj: "and" | "or" | "and/or" =
      clauseId === "exit_events" && parentRef === "(a)" ? "and/or" : clauseId === "appointment" && parentRef === "(b)" ? "or" : clauseId === "exclusions" ? "or" : "and";
    return relist(kept, conj);
  };

  built.forEach((sec, si) => {
    blocks.push({ kind: "section", num: "", text: `${si + 1}. ${sec.heading}` });
    sec.clauses.forEach((c, ci) => {
      included.push(c.id);
      let subs = prune(c.subs ?? [], c.id, 0, null);
      /* A sentence whose opening words were left out starts with a capital. */
      if ((c.id === "tag_along" || c.id === "drag_along") && subs[0]) {
        const opening = c.id === "tag_along" ? f.tag_subject : f.drag_subject;
        if (!opening) subs = [{ ...subs[0], text: capFirst(subs[0].text.replace(/^\{\{(tag|drag)_subject\}\}/, "")) }, ...subs.slice(1)];
      }
      if (c.id === "defaulting") {
        /* (a)–(d) the events, then the consequences. */
        const events = subs.filter((s) => s.id?.startsWith("dd_") && s.ref);
        const rest = subs.filter((s) => !(s.id?.startsWith("dd_") && s.ref));
        const relettered = relist(events, "or");
        const n = relettered.length;
        f.default_paras = n === 1 ? "paragraph (a)" : `paragraphs (a) to (${String.fromCharCode(96 + n)})`;
        /* the last event ends with a comma, as the master has it */
        if (n) relettered[n - 1] = { ...relettered[n - 1], text: relettered[n - 1].text.replace(/[.;]$/, ",") };
        subs = [...relettered, ...rest];
      }
      const text = itemFix(fill(replace[c.id] ?? c.text, f, missing));
      blocks.push({ kind: "clause", num: `${si + 1}.${ci + 1}`, text });
      for (const s of subs) emit(s, 1);
    });
  });

  /* Schedule 1. */
  blocks.push({ kind: "section", num: "", text: SCHEDULE_TITLE });
  plain(SCHEDULE_INTRO);
  blocks.push({ kind: "clause", num: "1.1", text: SCHEDULE_DEFINITIONS_HEAD });
  const defs: Definition[] = [
    ...DEFINITIONS.filter((d) => !d.needs || clauseNo[d.needs]).filter((d) => {
      if (!hasInvestors && ["Investors", "Key Investor", "Lead Investor", "Lead Investor Director"].includes(d.term)) return false;
      if (founders.length === 0 && ["Founder Director", "CEO Founder"].includes(d.term)) return false;
      return true;
    }),
    ...classes.map((c) => ({ term: c, text: `means ${c.replace(/Shares$/, "shares").replace(/^([A-Z])/, (m) => m)} in the capital of the Company from time to time having the rights set out in the Constitution;` })),
  ].sort((x, y) => x.term.localeCompare(y.term, "en", { sensitivity: "base" }));
  defs.forEach((d, i) => {
    const last = i === defs.length - 1;
    const penult = i === defs.length - 2;
    let text = fill(d.text, f, missing).replace(/\s*(;\s*and|;|\.)\s*$/, "");
    if (d.subs?.length) {
      plain(`"**${d.term}**" ${text}`, true);
      const ending = last ? "." : penult ? "; and" : ";";
      d.subs.forEach((s, k) => {
        const m = /^(\([a-z]+\))\s*(.*)$/.exec(s);
        let t = m ? m[2] : s;
        /* the definition's own ending goes on its last paragraph */
        if (k === d.subs!.length - 1) t = t.replace(/\s*(;\s*and|;|\.)\s*$/, "") + ending;
        sub(m ? m[1] : "", fill(t, f, missing), 2);
      });
    } else {
      text += last ? "." : penult ? "; and" : ";";
      plain(`"**${d.term}**" ${text}`, true);
    }
  });
  SCHEDULE_RULES.forEach((r, i) => {
    blocks.push({ kind: "clause", num: `1.${i + 2}`, text: r.text });
    (r.subs ?? []).forEach((s, k) => sub(`(${String.fromCharCode(97 + k)})`, s, 1));
  });

  /* Signature page. */
  plain(EXECUTED);
  const signLines = (head: string, lines: string[]) => {
    blocks.push({ kind: "sign-head", num: "", text: head });
    for (const l of lines) blocks.push({ kind: "sign", num: "", text: l });
  };
  plain("**THE COMPANY**");
  signLines(`For and on behalf of ${f.company_name || GAP}`, ["___________________________", `Name: ${str(company.signatory_name) || GAP}`, `Title: ${str(company.signatory_title) || GAP}`, `Email: ${str(company.signatory_email) || GAP}`]);
  const signFor = (h: Shareholder) =>
    h.signatory_name
      ? signLines(`For and on behalf of ${str(h.name)}`, ["___________________________", `Name: ${str(h.signatory_name)}`, `Title: ${str(h.signatory_title) || GAP}`, `Email: ${str(h.email) || GAP}`])
      : signLines(`Signed by ${str(h.name)}`, ["___________________________", `Name: ${str(h.name)}`, `Email: ${str(h.email) || GAP}`]);
  if (founders.length) {
    plain(`**THE FOUNDER${founders.length === 1 ? "" : "S"}**`);
    founders.forEach(signFor);
  }
  if (lead) {
    plain("**THE LEAD INVESTOR**");
    signFor(lead);
  }
  const others = investors.filter((h) => h !== lead);
  if (others.length) {
    plain(`**THE INVESTOR${others.length === 1 ? "" : "S"}**`);
    others.forEach(signFor);
  }
  const rest = holders.filter((h) => h.kind === "other");
  if (rest.length) {
    plain(`**THE OTHER SHAREHOLDER${rest.length === 1 ? "" : "S"}**`);
    rest.forEach(signFor);
  }

  /* ── what the lawyer should know ────────────────────────────────────── */
  if (!incorporated) {
    flags.push({ level: "yellow", scenario: "SH20", title: "Company not incorporated", reason: "The Company is not incorporated yet: the agreement is drawn for a company \"to be incorporated\". Sign it, or have the Company accede by deed, once it exists and its UEN is known." });
  }
  if (own.length) {
    flags.push({ level: "yellow", scenario: "SH21", title: "Your own wording", reason: `Wording you typed has gone into the agreement as written: ${joinAnd(Array.from(new Set(own)))}. Have your lawyer check it reads as a clause.` });
  }
  const fdNames = Array.from(new Set([...fdUsed, ...(built.some((s) => s.id === "vesting") ? ["founder vesting and leavers"] : []), "Table A item: Board of Directors"]));
  flags.push({
    level: "green",
    scenario: "FD",
    title: "FD supplementary wording",
    reason: `Wording not in the master, written in its style for the answers given: ${joinAnd(fdNames)}. For FD review.`,
  });

  return { blocks, missing: Array.from(missing), flags, fields: f, included };
}

function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}
