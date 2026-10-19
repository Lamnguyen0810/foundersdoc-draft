/**
 * What the back end can spot by rule. Every flag is for the lawyer who
 * reviews the agreement before it is signed and is listed beside the draft,
 * never written in it. A red flag stops the draft: the answers are saved,
 * the credit is refunded and the firm follows up.
 */

import { readAnswers } from "./assemble";
import { applyDefaults, problemWith, questionsFor } from "./questions";
import type { Answers, Flag, Party } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const FLAG_TITLES: Record<string, string> = {
  JV1: "Confirm the jurisdiction entries",
  JV2: "Another law: entries left blank",
  JV3: "Amend the constitution to match",
  JV4: "The majority percentage",
  JV5: "Special resolutions",
  JV6: "Deadlock route",
  JV7: "Rotating casting vote",
  JV8: "Few decisions need the minority",
  JV9: "Restrictions after leaving",
  JV10: "Same party on both sides",
  JV11: "An individual as a party",
  JV12: "Answer that cannot be used",
  JV13: "Basic: no default provisions",
  JV14: "A binding funding commitment",
  JV15: "You can be made to sell",
  JV16: "Shotgun with a majority",
  JV17: "Competition and approvals",
  JV21: "Your own wording",
};

export function titleFor(f: Flag): string {
  return f.title ?? FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export function ruleChecks(answersIn: Answers, partyA: Party, partyB: Party): { flags: Flag[] } {
  const a = applyDefaults(answersIn);
  const r = readAnswers(a, [partyA, partyB]);
  const flags: Flag[] = [];

  /* The governing law. */
  if (r.otherLaw) {
    flags.push({
      level: "yellow",
      scenario: "JV2",
      reason: `The governing law is ${str(a.JV3a) || "another country's"}. FD AI has no entries for it, so the third-party rights statute, the courts or arbitration seat and who appoints the valuer are left as [●]. A lawyer qualified there should fill them in and check ${r.j.checkLocally}.`,
      field: "JV3",
    });
  } else if (r.lawKey !== "sg") {
    flags.push({
      level: "yellow",
      scenario: "JV1",
      reason: `The agreement is governed by the laws of ${r.j.law}. Have a lawyer qualified there confirm the jurisdiction entries, and check ${r.j.checkLocally}.`,
      field: "JV3",
    });
  } else {
    flags.push({ level: "green", scenario: "JV3", reason: `Under Singapore law, check ${r.j.checkLocally}.`, field: "JV3" });
  }

  /* The shape. */
  if (!r.equal) {
    if (Number.isFinite(r.pctA) && !(r.pctA > 50 && r.pctA < 100)) {
      flags.push({
        level: "red",
        scenario: "JV4",
        reason: `The majority party is to hold ${r.pctA}%. A majority must be more than 50% and less than 100% — for equal shares choose 50:50.`,
        field: "JV1a",
      });
    } else if (r.pctA >= 75) {
      flags.push({
        level: "yellow",
        scenario: "JV5",
        reason: `With ${r.pctA}%, Party A can pass special resolutions on its own under most company laws (usually 75%), such as changing the constitution. The reserved matters still need Party B's consent under the agreement; make sure the constitution says so too.`,
        field: "JV1a",
      });
    }
    if (r.side === "minority" && r.reserved.length <= 6) {
      flags.push({
        level: "yellow",
        scenario: "JV8",
        reason: "You are the minority party, and only a few decisions need your consent: everything else is decided by the board, where the majority has more directors. Consider adding the business plan, borrowing, related-party contracts and senior hires to the reserved matters.",
        field: "JV13",
      });
    }
    if (r.side === "minority" && r.tagDrag.includes("drag")) {
      flags.push({
        level: "yellow",
        scenario: "JV15",
        reason: "Drag-along lets the majority make you sell your shares to its buyer, on the same terms as it gets. Check you are content with that, or ask for a minimum price.",
        field: "JV17",
      });
    }
    if (r.deadlock === "shotgun") {
      flags.push({
        level: "yellow",
        scenario: "JV16",
        reason: "A buy-out (\"shotgun\") clause is more usual in a 50:50 joint venture. With a majority, the party with more money can use it to force the other out; check it suits you both.",
        field: "JV14",
      });
    }
  } else if (r.chair === "chair_rotate") {
    flags.push({
      level: "yellow",
      scenario: "JV7",
      reason: "A casting vote that rotates each year gives control of the board (except reserved matters) to whichever party holds the chair that year. Check you are both content with that.",
      field: "JV11",
    });
  }

  /* Deadlock. */
  if (r.deadlock === "escalate" && r.equal && r.standard) {
    flags.push({
      level: "green",
      scenario: "JV6",
      reason: "If a deadlock is not resolved by the senior people or mediation, the proposal is dropped and the company carries on. For a long-term 50:50 joint venture, consider whether a way out (a buy-out or winding up) is needed.",
      field: "JV14",
    });
  } else if (r.deadlock === "shotgun" && r.equal) {
    flags.push({
      level: "yellow",
      scenario: "JV6",
      reason: "A buy-out (\"shotgun\") clause keeps offers fair, but favours the party that can more easily raise the money. Check both parties could fund a buy-out.",
      field: "JV14",
    });
  } else if (r.deadlock === "wind_up") {
    flags.push({
      level: "yellow",
      scenario: "JV6",
      reason: "On an unresolved deadlock either party may require the company to be wound up, which ends the business. Check this suits you both, and the effect on the company's staff, contracts and IP.",
      field: "JV14",
    });
  }

  if (r.funding === "cap") {
    flags.push({ level: "yellow", scenario: "JV14", reason: "Each party must fund its share of what the board asks for, up to the cap. A party that does not is diluted. Check both can meet the commitment.", field: "JV8" });
  }
  if (r.restrictions === "during_after") {
    flags.push({ level: "green", scenario: "JV9", reason: "The restriction on competing lasts for 12 months after a party leaves. Restrictions after leaving are enforceable only if reasonable in time, place and the business covered; check the business description is not wider than needed.", field: "JV19" });
  }
  if (!r.standard) {
    flags.push({
      level: "green",
      scenario: "JV13",
      reason: "Basic has no default provisions: if a party breaches the agreement, becomes insolvent or dies, nothing lets the other buy its shares. Choose Standard or Complex to include them.",
      field: "JV0",
    });
  }
  if (r.anyIndividual) {
    flags.push({
      level: "green",
      scenario: "JV11",
      reason: `An individual is a party${r.defaultOn ? ": on death or incapacity the other party may buy the shares at fair value" : ""}. Check how the individual's shares would pass under a will, and whether the individual should hold them through a company.`,
      field: "parties",
    });
  }
  if (partyA.kind === "company" && partyB.kind === "company") {
    flags.push({
      level: "green",
      scenario: "JV17",
      reason: "Where both parties are businesses, check whether competition (antitrust) or merger control rules apply to the joint venture, and whether any foreign investment or regulatory approval is needed before it starts.",
      field: "parties",
    });
  }

  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key(str(partyA.name)) && key(str(partyA.name)) === key(str(partyB.name))) {
    flags.push({ level: "red", scenario: "JV10", reason: "The same party is named as both Party A and Party B. A joint venture needs two different parties — check the parties.", field: "parties" });
  }

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) flags.push({ level: "red", scenario: "JV12", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
  }
  return { flags };
}
