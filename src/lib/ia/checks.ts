/**
 * What the back end can spot by rule. Every flag is for the lawyer who
 * reviews the agreement before it is signed and is listed beside the draft,
 * never written in it. A red flag stops the draft: the answers are saved,
 * the credit is refunded and the firm follows up.
 */

import { num } from "./assemble";
import { applyDefaults, founderCount, picks, problemWith, questionsFor } from "./questions";
import type { Answers, Company, Flag, Founder, Investor } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const FLAG_TITLES: Record<string, string> = {
  IA0: "Beta: built from two FD samples",
  IA1: "Preference shares need the Constitution",
  IA2: "Shares or amount missing",
  IA3: "Full ratchet",
  IA4: "Founders jointly and severally liable",
  IA5: "Founder cap above the investment",
  IA6: "Fewer founders named than stated",
  IA7: "Converting SAFE",
  IA8: "Lead investor on completion at signing",
  IA9: "Answer that cannot be used",
  IA10: "Individual lead investor with a board seat",
  IA21: "Your own wording",
};

export function titleFor(f: Flag): string {
  if (f.title) return f.title;
  if (f.scenario === "FD") return "FD supplementary wording";
  return FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export function ruleChecks(answersIn: Answers, company: Company, founders: Founder[], investor: Investor): { flags: Flag[] } {
  const a = applyDefaults(answersIn);
  const flags: Flag[] = [];
  const lead = str(a.IA1) === "lead";
  void company;

  flags.push({
    level: "yellow",
    scenario: "IA0",
    reason: "The Investment Agreement is in Beta. It is built from two of Founders Doc's own investment agreements (a simple investor and a lead investor), generalised; there is no approved FD Lite template yet. Have a lawyer read it in full before it is signed.",
  });

  if (str(a.IA3) === "preference" && str(a.IA7) === "no") {
    flags.push({ level: "yellow", scenario: "IA1", reason: "Preference shares are being issued but no amended constitution is adopted at completion. Their rights must be in the Constitution: check that it already provides for this class, or approach an FD lawyer to amend it.", field: "IA7" });
  }
  if (!Number.isFinite(num(str(investor.shares))) || !Number.isFinite(num(str(investor.amount)))) {
    flags.push({ level: "yellow", scenario: "IA2", reason: "No number of shares or investment amount (as a plain number): the agreement shows [●] there. Fill it in before signing.", field: "investor" });
  }
  if (str(a.IA3) === "preference" && str(a.IA18) === "ratchet") {
    flags.push({ level: "yellow", scenario: "IA3", reason: "The preference shares have a full ratchet: any later issue below the conversion price re-prices this investor's conversion to that lower price, diluting the founders. Check the company has agreed to this.", field: "IA18" });
  }
  if (lead && str(a.IA12) === "company_founders" && str(a.IA12a) === "joint") {
    flags.push({ level: "yellow", scenario: "IA4", reason: "The founders give the warranties jointly and severally: each can be pursued for the whole claim, up to the cap. The FD sample has them warrant severally. Check this is intended.", field: "IA12a" });
  }
  const cap = str(a.IA14) === "other" ? num(str(a.IA14a)) : num(str(a.IA14));
  const amount = num(str(investor.amount));
  if (lead && str(a.IA12) === "company_founders" && Number.isFinite(cap) && Number.isFinite(amount) && cap > amount) {
    flags.push({ level: "yellow", scenario: "IA5", reason: `Each founder's liability is capped at ${cap.toLocaleString("en-GB")}, more than the investment itself (${amount.toLocaleString("en-GB")}). Check this is intended.`, field: "IA14" });
  }
  const stated = founderCount(a);
  const named = founders.filter((x) => str(x.name)).length;
  if (lead && named < stated) {
    flags.push({ level: "yellow", scenario: "IA6", reason: `${stated} founder${stated === 1 ? " was" : "s were"} stated, but ${named} ${named === 1 ? "is" : "are"} named. Each founder must be named in Schedule 1 and sign.`, field: "founders" });
  }
  if (!lead && str(a.IA10) === "yes") {
    flags.push({ level: "yellow", scenario: "IA7", reason: "The investor's SAFE converts on this investment. Check the number of shares and price against the SAFE's conversion terms, and issue the SAFE conversion notice the agreement refers to.", field: "IA10" });
  }
  if (lead && picks(a, "IA5").includes("none")) {
    flags.push({ level: "green", scenario: "IA8", reason: "No conditions precedent: the lead investor pays on signing. Make sure the approvals and the amended constitution are in place before it is signed.", field: "IA5" });
  }
  if (lead && investor.kind !== "company" && str(a.IA8) !== "no") {
    flags.push({ level: "green", scenario: "IA10", reason: "The lead investor is an individual who nominates a director. Check whether the investor will sit on the board personally.", field: "IA8" });
  }

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) flags.push({ level: "red", scenario: "IA9", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
  }
  return { flags };
}
