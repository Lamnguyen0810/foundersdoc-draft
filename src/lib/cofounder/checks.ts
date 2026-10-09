/**
 * What the back end can spot by rule, before any master is read. Every flag
 * is for the lawyer who reviews the agreement before it is signed — the
 * founders' own — and is listed beside the draft, never written in it.
 *
 * The ones that matter most between co-founders: a split that cannot break
 * a tie, shares that do not add up, no protection when someone leaves, and
 * IP left outside the company (the first thing an investor checks).
 */

import { applyDefaults, founderCount, problemWith, questionsFor } from "./questions";
import type { Answers, Flag, Founder, Holding } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);

/** "33.33%", " 30 " → 33.33, 30; anything else → NaN. */
export function percentOf(p: string): number {
  const m = /^\s*(\d{1,3}(?:\.\d{1,4})?)\s*%?\s*$/.exec(p ?? "");
  return m ? Number(m[1]) : NaN;
}

/** A few words for each flag, for the list the user sees. */
export const FLAG_TITLES: Record<string, string> = {
  CF1: "More than three co-founders",
  CF2: "Shareholding does not add up",
  CF3: "Co-founder missing from the shareholding",
  CF4: "Shareholders who are not co-founders",
  CF5: "A tie with no way to break it",
  CF6: "No protection when a co-founder leaves",
  CF7: "Shares taken back for S$1 or nothing",
  CF8: "IP not assigned to the company",
  CF9: "No confidentiality",
  CF10: "Shares freely transferable",
  CF11: "Part-time founders and a conflict clause",
  CF12: "No reserved matters",
  CF13: "Capital condition without investment",
  CF14: "Vesting method to be written",
  CF15: "Master agreement pending",
  CF16: "Answer that cannot be used",
  CF17: "Resident director",
};

export function titleFor(f: Flag): string {
  if (f.title) return f.title;
  if (f.scenario === "AI") return "Drafted by FD AI";
  return FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export interface RuleChecks {
  flags: Flag[];
}

export function ruleChecks(answersIn: Answers, founders: Founder[], holdings: Holding[]): RuleChecks {
  const a = applyDefaults(answersIn);
  const flags: Flag[] = [];
  const n = founderCount(a);
  const named = founders.map((f) => str(f.name)).filter(Boolean);

  if (n > 3) {
    flags.push({
      level: "yellow",
      scenario: "CF1",
      reason: `${n} co-founders. The firm recommends no more than three: decisions slow down, the shareholding is thinner for each, and a deadlock or a leaver touches more people. Check that who has the final say, and what happens in a deadlock, still work with ${n}.`,
      field: "F1",
    });
  }

  /* The shareholding table. */
  const lines = holdings.filter((h) => str(h.name) || str(h.percent));
  if (lines.length > 0) {
    const pcts = lines.map((h) => percentOf(h.percent));
    const total = pcts.reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0);
    if (pcts.some((p) => !Number.isFinite(p)) || Math.abs(total - 100) > 0.05) {
      flags.push({
        level: "red",
        scenario: "CF2",
        reason: `The initial shareholding adds up to ${Math.round(total * 100) / 100}%${pcts.some((p) => !Number.isFinite(p)) ? ", and at least one line has no percentage" : ""}. It must come to 100% before the shares are allotted; clause 2.1(b) is drawn from this table.`,
        user_message: `The shareholding adds up to ${Math.round(total * 100) / 100}%, not 100%. Worth fixing before the agreement is prepared.`,
        field: "holdings",
      });
    }
    const holders = new Set(lines.map((h) => str(h.name).toLowerCase()));
    const missing = named.filter((x) => !holders.has(x.toLowerCase()));
    if (missing.length) {
      flags.push({
        level: "yellow",
        scenario: "CF3",
        reason: `${missing.join(", ")} ${missing.length === 1 ? "is a co-founder but has" : "are co-founders but have"} no line in the initial shareholding. Intended (shares to come later, e.g. forward vesting), or an omission?`,
        field: "holdings",
      });
    }
    const founderNames = new Set(named.map((x) => x.toLowerCase()));
    const others = lines.filter((h) => str(h.name) && !founderNames.has(str(h.name).toLowerCase()));
    if (others.length) {
      flags.push({
        level: "yellow",
        scenario: "CF4",
        reason: `${others.map((h) => `${str(h.name)}${str(h.role) ? ` (${str(h.role)})` : ""}`).join(", ")} ${others.length === 1 ? "holds" : "hold"} shares but ${others.length === 1 ? "is not a party" : "are not parties"} to the co-founder agreement, so its restrictions (transfers, drag-along, reserved matters) do not bind ${others.length === 1 ? "them" : "them"}. Investors are usually bound through a shareholders’ agreement or the constitution.`,
        field: "holdings",
      });
    }

    /* Even split, everyone votes, nobody breaks the tie. */
    const founderPcts = lines.filter((h) => founderNames.has(str(h.name).toLowerCase())).map((h) => percentOf(h.percent));
    const equal = founderPcts.length >= 2 && founderPcts.length % 2 === 0 && founderPcts.every((p) => Math.abs(p - founderPcts[0]) < 0.01);
    if (equal && ["founders", "shareholders"].includes(str(a.F2)) && ["good_faith", ""].includes(str(a.F8))) {
      flags.push({
        level: "yellow",
        scenario: "CF5",
        reason: `The co-founders hold equal shares, decisions are taken by vote, and a deadlock is left to good-faith discussion. Nothing breaks a tie, so the company can stall on any decision the co-founders split on. Consider a casting vote, a buy-out mechanism or a third party.`,
        user_message: "With an even split and decisions by vote, nothing breaks a tie. Worth choosing a deadlock option that ends it — a casting vote, a buy-out or a third party.",
        field: "F8",
      });
    }
  }

  if (str(a.F19) === "keep" && str(a.F21) === "keep") {
    flags.push({
      level: "yellow",
      scenario: "CF6",
      reason: "Both a Good Leaver and a Bad Leaver keep their vested shares. A co-founder who leaves on bad terms, or for cause, stays a shareholder with no way for the others to buy the shares back. Investors often ask for this to change.",
      field: "F21",
    });
  }

  const forNothing = ["nominal", "free"].includes(str(a.F21)) || str(a.F14) === "nominal" || str(a.F9) === "nominal";
  if (forNothing) {
    flags.push({
      level: "yellow",
      scenario: "CF7",
      reason: `Shares are taken back for S$1${str(a.F21) === "free" ? " or for nothing" : ""} (${[str(a.F9) === "nominal" ? "deadlock buy-out" : "", str(a.F14) === "nominal" ? "failure to contribute" : "", ["nominal", "free"].includes(str(a.F21)) ? "Bad Leaver" : ""].filter(Boolean).join(", ")}). A transfer at a nominal price triggered by breach can be challenged as a penalty or a forfeiture; it is easier to defend for unvested shares and serious cause than for vested shares. Check the wording and the triggers.`,
      field: str(a.F21) && ["nominal", "free"].includes(str(a.F21)) ? "F21" : str(a.F14) === "nominal" ? "F14" : "F9",
    });
  }

  if (str(a.F24) === "no") {
    flags.push({
      level: "red",
      scenario: "CF8",
      reason: "IP created by the co-founders does not pass to the company under this agreement. Unless a separate assignment is signed, a co-founder who leaves may own code, designs or brand the company depends on; investors check this first in due diligence.",
      user_message: "You chose to deal with IP separately. Make sure a separate IP assignment is signed — investors check that the company owns its IP.",
      field: "F24",
    });
  }

  if (str(a.F23) === "none") {
    flags.push({
      level: "yellow",
      scenario: "CF9",
      reason: "No confidentiality obligation between the co-founders. Anything a co-founder learns about the business can be used or shared freely, including after leaving. Few founders mean this; check it is intended.",
      field: "F23",
    });
  }

  if (list(a.F11).includes("none")) {
    flags.push({
      level: "yellow",
      scenario: "CF10",
      reason: "Co-founder shares can be transferred to anyone, including a competitor, without first being offered to the other co-founders. A right of first offer to the other co-founders is the usual minimum.",
      field: "F11",
    });
  }

  if (["some_part_time", "all_part_time"].includes(str(a.F5)) && str(a.F17) === "yes") {
    flags.push({
      level: "yellow",
      scenario: "CF11",
      reason: "Some or all co-founders work part-time, and the conflict-of-interest clause asks them to avoid competing interests and get approval first. Make sure their existing jobs are carved out by name, or the clause is breached on signing.",
      field: "F17",
    });
  }

  if (list(a.F7).length === 0) {
    flags.push({
      level: "yellow",
      scenario: "CF12",
      reason: "No reserved matters: new shareholders, new shares, borrowing, a sale or winding up can all be decided without every co-founder’s approval — by whoever has the final say. Check that is intended.",
      field: "F7",
    });
  }

  if (list(a.F3).includes("capital") && str(a.F4) === "external") {
    flags.push({
      level: "yellow",
      scenario: "CF13",
      reason: "Recognition as a co-founder is conditional on investing capital, but the co-founders are not investing personally. One of the two answers needs to change.",
      field: "F4",
    });
  }

  if (str(a.F10) === "other") {
    flags.push({
      level: "yellow",
      scenario: "CF14",
      reason: `Vesting by another method: “${list(a.F10b).join(" · ") || "not described"}”. Clause 4.1 has to be written for it by hand.`,
      field: "F10",
    });
  }

  if (str(a.F6)) {
    flags.push({
      level: "green",
      scenario: "CF17",
      reason: "A Singapore company must have at least one director who is ordinarily resident in Singapore (s 145(1) Companies Act 1967).",
      user_message: "Reminder: a Singapore company needs at least one director who is ordinarily resident in Singapore.",
      field: "F6",
    });
  }

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) flags.push({ level: "red", scenario: "CF16", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
  }

  return { flags };
}

export { list };
