/**
 * What the back end can spot by rule. Every flag is for the lawyer who
 * reviews the agreement before it is signed and is listed beside the draft,
 * never written in it. A red flag stops the draft: the answers are saved,
 * the credit is refunded and the firm follows up.
 *
 * Most come from the master itself: its drafting notes (withholding tax and
 * usury, the investor-status warranty, the post-money formula, execution
 * formalities) and its Jurisdiction Rider ("points to check locally").
 */

import { readAnswers } from "./assemble";
import { applyDefaults, problemWith, questionsFor } from "./questions";
import type { Answers, Flag, Party } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const FLAG_TITLES: Record<string, string> = {
  CL0: "Beta: built from the FD master",
  CL1: "Confirm the jurisdiction entries",
  CL2: "Another law: entries left blank",
  CL3: "Withholding tax on interest",
  CL4: "High interest",
  CL5: "Down-round trigger only",
  CL6: "Large discount",
  CL7: "Large stake on conversion",
  CL8: "Post-money cap: check the formula",
  CL9: "No investor-status warranty",
  CL10: "Approvals to issue the shares",
  CL11: "Same party on both sides",
  CL12: "Execution formalities",
  CL13: "Usury limits",
  CL14: "Answer that cannot be used",
  CL15: "Qualifying round above the cap",
  CL21: "Your own wording",
};

export function titleFor(f: Flag): string {
  if (f.title) return f.title;
  if (f.scenario === "FD") return "FD supplementary wording";
  return FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export function ruleChecks(answersIn: Answers, company: Party, investor: Party): { flags: Flag[] } {
  const a = applyDefaults(answersIn);
  const r = readAnswers(a);
  const flags: Flag[] = [];

  flags.push({
    level: "yellow",
    scenario: "CL0",
    reason: "The Convertible Loan Agreement is in Beta. It follows the Founders Doc master convertible loan agreement, with its bracketed choices filled from your answers. Have a lawyer read it in full before it is signed.",
  });

  /* The Rider: "a starting point only … must be confirmed by a lawyer qualified in the chosen jurisdiction". */
  if (r.otherLaw) {
    flags.push({
      level: "yellow",
      scenario: "CL2",
      reason: `The governing law is ${str(a.CL3a) || "another country's"}. The master's Jurisdiction Rider has no entries for it, so the data protection law, the third-party rights statute, the arbitration seat, the local time and the securities law are left as [●]. A lawyer qualified there should fill them in and check ${r.j.checkLocally}.`,
      field: "CL3",
    });
  } else if (r.lawKey !== "sg") {
    flags.push({
      level: "yellow",
      scenario: "CL1",
      reason: `The agreement is governed by the laws of ${r.j.law}. The Jurisdiction Rider's entries are a starting point only: have a lawyer qualified there confirm them, and check ${r.j.checkLocally}.`,
      field: "CL3",
    });
  } else {
    flags.push({ level: "green", scenario: "CL1", reason: `Under Singapore law, check ${r.j.checkLocally}.`, field: "CL3" });
  }

  if (r.interest !== "none") {
    flags.push({
      level: "green",
      scenario: "CL3",
      reason: "If the Investor is not resident where the Company is, interest paid to them may be subject to withholding tax there. If so, add a tax gross-up or tax deduction clause.",
      field: "CL7",
    });
    if (r.lawKey === "ny" || r.lawKey === "de") {
      flags.push({ level: "yellow", scenario: "CL13", reason: `Check the interest rate${Number.isFinite(r.rate) ? ` (${r.rate}% a year)` : ""} against the state usury limits.`, field: "CL7a" });
    }
    if (Number.isFinite(r.rate) && r.rate >= 12) {
      flags.push({ level: "yellow", scenario: "CL4", reason: `Interest of ${r.rate}% a year is high for a convertible loan, where the investor's main return is the conversion. Check it is commercially justified.`, field: "CL7a" });
    }
  }

  if (r.qfe === "down") {
    flags.push({
      level: "yellow",
      scenario: "CL5",
      reason: "Only a round priced below the valuation cap triggers conversion before maturity. A round above the cap does not, so the loan stays outstanding until the Maturity Date. Check that is intended.",
      field: "CL14",
    });
  }
  if (r.qfe === "raise" && Number.isFinite(r.minRaise) && Number.isFinite(r.principal) && r.minRaise <= r.principal) {
    flags.push({
      level: "yellow",
      scenario: "CL15",
      reason: "The minimum raise for a qualifying round is no more than the loan itself, so a very small round would convert the loan. Check the threshold.",
      field: "CL14a",
    });
  }

  if (Number.isFinite(r.discount) && r.discount > 25) {
    flags.push({ level: "yellow", scenario: "CL6", reason: `A discount of ${r.discount}% is above the usual 15–20%.`, field: "CL13" });
  }

  if (Number.isFinite(r.principal) && Number.isFinite(r.cap) && r.cap > 0) {
    const stake = (r.principal / r.cap) * 100;
    if (stake >= 20) {
      flags.push({
        level: "yellow",
        scenario: "CL7",
        reason: `The loan is ${stake.toFixed(0)}% of the valuation cap, so the Investor could hold roughly that much of the Company after conversion (more with interest${r.basis === "pre-money" ? " and on a pre-money cap" : ""}). Check it matches the deal.`,
        field: "CL11",
      });
    }
  }

  if (r.basis === "post-money") {
    flags.push({
      level: "green",
      scenario: "CL8",
      reason: "On a post-money cap, the cap price is often calculated on a share capital that includes the Conversion Shares. Check the Schedule 2 formula gives the Investor the percentage agreed.",
      field: "CL12",
    });
  }

  if (r.status === "none") {
    flags.push({
      level: "yellow",
      scenario: "CL9",
      reason: "There is no investor-status warranty. Check which prospectus or private placement exemption the offer of the loan and the Conversion Shares relies on.",
      field: "CL21",
    });
  }

  flags.push({
    level: "green",
    scenario: "CL10",
    reason: "Before conversion, the Company must have the shareholder and Board approvals, pre-emption waivers and authorised shares needed to issue the Conversion Shares (Corporate Approvals clause).",
  });

  if (r.lawKey !== "sg" || r.investorCompany) {
    flags.push({
      level: "green",
      scenario: "CL12",
      reason: "Check whether the governing law or either Party's place of incorporation requires execution as a deed, a witness, a company seal or a second authorised signatory, and adapt the signature blocks.",
    });
  }

  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key(str(company.name)) && key(str(company.name)) === key(str(investor.name))) {
    flags.push({ level: "red", scenario: "CL11", reason: "The Company is also named as the Investor. A company cannot lend to itself — check the parties.", field: "parties" });
  }

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) flags.push({ level: "red", scenario: "CL14", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
  }
  return { flags };
}
