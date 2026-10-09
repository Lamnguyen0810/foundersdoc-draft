/**
 * What the back end can spot by rule. Every flag is for the lawyer who
 * reviews the agreement before it is signed and is listed beside the draft,
 * never written in it. A red flag stops the draft: the answers are saved,
 * the credit is refunded and the firm follows up.
 */

import { num } from "./assemble";
import { applyDefaults, founderCount, investorCount, picks, problemWith, questionsFor } from "./questions";
import type { Answers, Company, Flag, Founder, Investor } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const FLAG_TITLES: Record<string, string> = {
  SS0: "Beta: built from the VIMA model",
  SS1: "Company not incorporated",
  SS2: "Existing shares — use the SPA",
  SS3: "Preference shares need the Constitution",
  SS4: "Company or investor missing as a party",
  SS5: "Shares or amount missing",
  SS6: "Fewer investors named than stated",
  SS7: "Conditions beyond the standard list",
  SS8: "Above the recommended size",
  SS9: "Answer that cannot be used",
  SS10: "Converting SAFE / loan",
  SS11: "Cap above the investment",
  SS12: "Company to be incorporated",
  SS13: "Board seats or vetoes",
  SS21: "Your own wording",
};

export function titleFor(f: Flag): string {
  if (f.title) return f.title;
  if (f.scenario === "FD") return "FD supplementary wording";
  return FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export function ruleChecks(answersIn: Answers, company: Company, founders: Founder[], investorsIn: Investor[]): { flags: Flag[] } {
  const a = applyDefaults(answersIn);
  const flags: Flag[] = [];
  const investors = investorsIn.filter((x) => str(x.name));
  void company;
  void founders;

  flags.push({
    level: "yellow",
    scenario: "SS0",
    reason: "The Share Subscription Agreement is in Beta. It follows the FD Lite question bank, with wording from the Singapore VIMA Model Subscription Agreement simplified to the bank's versions, not yet an approved FD Lite SSA template. Have a lawyer read it in full before it is signed.",
  });

  if (str(a.SS2) === "no") {
    flags.push({ level: "red", scenario: "SS1", reason: "The company has not been incorporated, and will not be by signing. A company that does not exist cannot issue shares: incorporate it first, then prepare the agreement.", field: "SS2" });
  } else if (str(a.SS2) === "by_signing") {
    flags.push({ level: "yellow", scenario: "SS12", reason: "The company is to be incorporated before signing: the agreement names it as \"to be incorporated\". Fill in its UEN and share capital once it exists, and do not sign before then.", field: "SS2" });
  }

  if (str(a.SS5) === "transfer") {
    flags.push({ level: "red", scenario: "SS2", reason: "Existing shares are being transferred to the investor, not new shares issued. That is a share purchase, not a subscription: use FD AI's Share Purchase Agreement instead.", field: "SS5" });
  }
  if (str(a.SS5) === "preference") {
    flags.push({ level: "yellow", scenario: "SS3", reason: "Preference shares carry only the rights written into the Constitution. The Constitution will need to set out those rights (and be amended if it does not). Please approach an FD lawyer to have the Constitution amended.", field: "SS5" });
  }

  const parties = picks(a, "SS3");
  if (!parties.includes("company") || !parties.includes("investors")) {
    flags.push({ level: "red", scenario: "SS4", reason: "The company that issues the shares and the investor who subscribes for them must both be parties. Tick both under Parties.", field: "SS3" });
  }

  const stated = investorCount(a);
  if (investors.length < stated) {
    flags.push({ level: "yellow", scenario: "SS6", reason: `${stated} investors were stated, but ${investors.length} ${investors.length === 1 ? "is" : "are"} named. Each investor must be a party and sign.`, field: "SS4" });
  }
  const gaps = investors.filter((x) => !Number.isFinite(num(str(x.shares))) || !Number.isFinite(num(str(x.amount)))).map((x) => x.name);
  if (gaps.length) {
    flags.push({ level: "yellow", scenario: "SS5", reason: `No number of shares or subscription amount (as a plain number) for ${gaps.join(", ")}: Schedule 1 shows [●] there. Fill it in before signing.`, field: "investors" });
  }
  const total = investors.reduce((s, x) => s + (num(str(x.amount)) || 0), 0);
  if (total > 750000) {
    flags.push({ level: "yellow", scenario: "SS8", reason: `The investment totals S$${total.toLocaleString("en-GB")}. The FD Lite SSA is recommended for simple investments of up to about $750k; a larger round usually needs a fuller agreement and a disclosure letter.`, field: "investors" });
  }

  if (str(a.SS1) === "complex" && str(a.SS6) === "yes" && picks(a, "SS6a").includes("other")) {
    flags.push({ level: "yellow", scenario: "SS7", reason: "A condition beyond the standard list was added. The question bank's disclaimer applies: have an FD lawyer tailor the document, or proceed at your own risk.", field: "SS6b" });
  }
  if (str(a.SS8) === "convert") {
    flags.push({ level: "yellow", scenario: "SS10", reason: "The subscription is paid by converting a SAFE or loan. Check the conversion price and amount against the SAFE or loan terms, and consider FD's SAFE Conversion Letter so the investor waives its claims under the old instrument.", field: "SS8" });
  }
  const cap = picks(a, "SS12a")[0] === "other" ? Number(str(a.SS12b)) : Number(str(a.SS12a));
  if (str(a.SS1) === "complex" && str(a.SS12) === "yes" && Number.isFinite(cap) && cap > 125) {
    flags.push({ level: "yellow", scenario: "SS11", reason: `The warrantors' liability is capped at ${cap}% of the investment — above the bank's highest suggestion (125%). Check this is intended.`, field: "SS12b" });
  }
  if (str(a.SS1) === "complex") {
    flags.push({ level: "green", scenario: "SS13", reason: "If the investors are to have board seats or veto rights, put those in a shareholders agreement or investor agreement: this agreement does not give them.", user_message: "Board seats or vetoes for investors go in a shareholders agreement, not here.", field: "SS14" });
  }
  void founderCount;

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) flags.push({ level: "red", scenario: "SS9", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
  }
  return { flags };
}
