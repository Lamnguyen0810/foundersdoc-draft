/**
 * What the back end can spot by rule. Every flag is for the lawyer who
 * reviews the agreement before it is signed and is listed beside the draft,
 * never written in it. A red flag stops the draft: the answers are saved and
 * the firm follows up.
 */

import { applyDefaults, picks, problemWith, questionsFor } from "./questions";
import type { Answers, Flag, Shareholder } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A few words for each flag, for the list the user sees. */
export const FLAG_TITLES: Record<string, string> = {
  SH1: "Shares or capital missing",
  SH2: "Even board with no casting vote",
  SH3: "Quorum larger than the board",
  SH4: "No investors in an investor-style agreement",
  SH5: "CEO Founder decides reserved matters alone",
  SH6: "No pre-emption rights",
  SH7: "Shares freely transferable",
  SH8: "Drag-along at a low threshold",
  SH9: "Compelled sale at a steep discount",
  SH10: "Bad Leaver shares for a nominal price",
  SH11: "Long non-compete",
  SH12: "IP not yet assigned",
  SH13: "No confidentiality",
  SH14: "Unanimous consent to amend",
  SH15: "No founder vesting",
  SH16: "Death or insolvency left open",
  SH17: "Resident director",
  SH18: "Answer that cannot be used",
  SH19: "Fewer shareholders named than stated",
  SH20: "Company not incorporated",
  SH21: "Your own wording",
};

export function titleFor(f: Flag): string {
  if (f.title) return f.title;
  if (f.scenario === "AI") return "Drafted by FD AI";
  if (f.scenario === "FD") return "FD supplementary wording";
  return FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export function ruleChecks(answersIn: Answers, holders: Shareholder[]): { flags: Flag[] } {
  const a = applyDefaults(answersIn);
  const flags: Flag[] = [];
  const named = holders.filter((h) => str(h.name));
  const investors = named.filter((h) => h.kind === "investor");
  const founders = named.filter((h) => h.kind === "founder");

  const stated = Number(str(a.S4));
  if (Number.isInteger(stated) && named.length < stated) {
    flags.push({ level: "yellow", scenario: "SH19", reason: `${stated} shareholders were stated, but ${named.length} ${named.length === 1 ? "is" : "are"} named. Every shareholder should be a party, or the agreement will not bind the others.`, field: "S4" });
  }

  const gaps = named.filter((h) => !str(h.shares) || !str(h.capital)).map((h) => h.name);
  if (gaps.length) {
    flags.push({ level: "yellow", scenario: "SH1", reason: `No capital amount or number of shares for ${gaps.join(", ")}: Table A item (1) shows [●] there. Fill it in before signing; it should match the register of members.`, field: "shareholders" });
  }

  const seats = str(a.S6) === "other" ? Number(str(a.S6a)) : Number(str(a.S6));
  if (Number.isInteger(seats) && seats % 2 === 0 && str(a.S15) === "no") {
    flags.push({ level: "yellow", scenario: "SH2", reason: `A board of ${seats} with no casting vote can split evenly, and a tied resolution fails. Consider an odd number of seats or a casting vote for the Chairman.`, field: "S15" });
  }

  const quorum = Number(str(a.S11a));
  if (str(a.S11) === "fixed" && Number.isInteger(seats) && Number.isInteger(quorum) && quorum > seats) {
    flags.push({ level: "red", scenario: "SH3", reason: `The board quorum (${quorum}) is larger than the board (${seats}): no meeting could ever be quorate. One of the two answers must change.`, field: "S11a" });
  }

  if (investors.length === 0) {
    flags.push({ level: "yellow", scenario: "SH4", reason: "No investor is a party. The firm's master is written for a round with a Lead Investor: the information rights, the Key Investor assignment clause and the investor definitions are left out, and the remaining references to the Lead Investor (consents under the transfer, founder and covenant clauses) will need a lawyer to re-point them, usually to the Board.", field: "S2" });
  }

  if (str(a.S23) === "ceo" && investors.length) {
    flags.push({ level: "yellow", scenario: "SH5", reason: "Reserved matters need only the CEO Founder's consent. The investors would have no say over new shares, borrowing, a sale or winding up — most will not accept that.", field: "S23" });
  }

  if (str(a.S25) === "none") {
    flags.push({ level: "yellow", scenario: "SH6", reason: "No pre-emption rights: new shares can be issued to anyone without first being offered to the existing shareholders, diluting them. Check this is intended.", field: "S25" });
  }

  if (str(a.S26) === "no") {
    flags.push({ level: "yellow", scenario: "SH7", reason: "Share transfers are not restricted: any shareholder can sell to anyone, including a competitor, and there is no right of first offer, tag-along or drag-along.", field: "S26" });
  }

  const drag = str(a.S26e) === "other" ? Number(str(a.S26f)) : Number(str(a.S26e));
  if (picks(a, "S26a").includes("drag") && drag <= 50 && investors.length) {
    flags.push({ level: "yellow", scenario: "SH8", reason: `Shareholders holding ${drag}% can force everyone to sell. With the founders holding a majority, they could drag the investors into a sale on their own; investors often ask for a higher threshold or their own consent.`, field: "S26e" });
  }

  if (picks(a, "S21").includes("compel_sale") && ["disc75", "disc50"].includes(str(a.S21a) || "disc75")) {
    flags.push({ level: "yellow", scenario: "SH9", reason: `A defaulting shareholder must sell at a ${str(a.S21a) === "disc50" ? "50%" : "75%"} discount to Fair Market Value. A transfer at a steep discount triggered by breach can be challenged as a penalty; it is easier to defend for serious defaults. Check the triggers.`, field: "S21a" });
  }

  if (str(a.S32) === "nominal" && founders.length) {
    flags.push({ level: "yellow", scenario: "SH10", reason: "A Bad Leaver's shares can be bought back for S$1 in total. For vested shares this can be challenged as a penalty or forfeiture; a discount to Fair Market Value is easier to defend.", field: "S32" });
  }

  if (str(a.S38b) === "3" && (picks(a, "S38").includes("no_compete") || picks(a, "S38").includes("no_solicit"))) {
    flags.push({ level: "yellow", scenario: "SH11", reason: "A three-year restriction after a founder ceases to be a shareholder. Singapore courts enforce restraints only as far as reasonably necessary to protect a legitimate interest; one to two years is more usual.", field: "S38b" });
  }

  if (str(a.S36) === "no") {
    flags.push({ level: "yellow", scenario: "SH12", reason: "Founder IP has not yet been assigned to the Company. The agreement's IP clause covers IP created in connection with the Business, but IP created before the agreement (or before incorporation) should be assigned by a separate deed — investors check this first.", field: "S36" });
  }

  if (str(a.S35) === "no") {
    flags.push({ level: "yellow", scenario: "SH13", reason: "No confidentiality clause: shareholders may use or share what they learn about the Company. Few companies mean this.", field: "S35" });
  }

  if (str(a.S37) === "unanimous") {
    flags.push({ level: "yellow", scenario: "SH14", reason: "Every shareholder must sign any amendment, so a single shareholder — however small — can block changes, including those a new round needs.", field: "S37" });
  }

  if (str(a.S28) === "no" && founders.length && investors.length) {
    flags.push({ level: "yellow", scenario: "SH15", reason: "Founder shares are fully vested from the start. Investors usually expect reverse vesting so that a founder who leaves early does not keep all their shares.", field: "S28" });
  }

  if (str(a.S33) === "later") {
    flags.push({ level: "yellow", scenario: "SH16", reason: "What happens to a shareholder's shares on death or mental incapacity is left to decide later, so the agreement has no clause on it: the shares pass under the Constitution and the general law.", field: "S33" });
  }

  flags.push({
    level: "green",
    scenario: "SH17",
    reason: "A Singapore company must have at least one director who is ordinarily resident in Singapore (s 145(1) Companies Act 1967).",
    user_message: "Reminder: a Singapore company needs at least one director who is ordinarily resident in Singapore.",
    field: "S6b",
  });

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) flags.push({ level: "red", scenario: "SH18", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
  }

  return { flags };
}
