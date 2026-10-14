/**
 * What the back end can spot by rule. Every flag is for the lawyer who
 * reviews the agreement before it is signed and is listed beside the draft,
 * never written in it. A red flag stops the draft: the answers are saved,
 * the credit is refunded and the firm follows up.
 */

import { num, readAnswers } from "./assemble";
import { applyDefaults, problemWith, questionsFor } from "./questions";
import type { Answers, Flag, LoanParties } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const FLAG_TITLES: Record<string, string> = {
  LN0: "Beta: built from the FD master",
  LN1: "Moneylenders Act",
  LN2: "Share pledge — not usual for a loan",
  LN3: "Security needs its own document",
  LN4: "Tiered interest with instalments",
  LN5: "High interest",
  LN6: "Lender-friendly terms on your side",
  LN7: "Short term for tiered interest",
  LN8: "Bank details missing",
  LN9: "Answer that cannot be used",
  LN10: "No authorised representative named",
  LN11: "Same party on both sides",
  LN12: "Borrower's liability uncapped",
  LN13: "Lenders' shares",
  LN14: "Level of detail",
  LN21: "Your own wording",
};

export function titleFor(f: Flag): string {
  if (f.title) return f.title;
  if (f.scenario === "FD") return "FD supplementary wording";
  return FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export function ruleChecks(answersIn: Answers, parties: LoanParties): { flags: Flag[] } {
  const a = applyDefaults(answersIn);
  const r = readAnswers(a);
  const flags: Flag[] = [];
  const { borrower, lenders, rep, bank } = parties;

  flags.push({
    level: "yellow",
    scenario: "LN0",
    reason: `The Loan Agreement is in Beta. It is assembled from the Founders Doc master loan agreement, with the other versions of a clause taken from four reference loan agreements, and the usual answers leaning to the ${r.lenderSide ? "Lender" : "Borrower"} where the sides differ. Have a lawyer read it in full before it is signed.`,
  });

  /* The level of detail (LN0): what was set without asking, so the lawyer knows. */
  if (r.level === "simple") {
    flags.push({
      level: "green",
      scenario: "LN14",
      title: "Simple version",
      user_message: "This is the simple version: the essentials only. It leaves out confidentiality, announcements, the limit on liability and further assurances, and has no security, late-payment interest or company warranties. Need any of them? Change the level of detail from the list on the right.",
      reason:
        "This is the simple version: one Lender, no warranties on a connected company and no change of control, no security, no stated purpose and no late-payment interest; drawdown within five Business Days, early repayment at any time, each side pays its own costs, the Events of Default follow your side, and the Lender may transfer the loan on 30 days' notice. The confidentiality, announcements, limitation of liability and further assurances clauses are left out. If any of these matter, choose Standard or Comprehensive.",
      field: "LN0",
    });
  } else if (r.level === "standard") {
    flags.push({
      level: "green",
      scenario: "LN14",
      title: "Standard version",
      user_message: "This is the standard version — our lawyers' master. Security, a stated purpose, late-payment interest and transfers were set to the usual answer; choose Comprehensive from the list on the right to set them yourself.",
      reason:
        "This is the standard version — the Founders Doc master. Not asked, and set to the master's usual answer: no stated purpose, drawdown within five Business Days, early repayment at any time, no security, late-payment interest only with a rate a year (2% above it), and the Lender may transfer the loan on 30 days' notice. Choose Comprehensive to set these yourself.",
      field: "LN0",
    });
  }

  /* Moneylending: lending to an individual for a larger sum back is presumed to be moneylending. */
  if (!r.borrowerCompany && r.model !== "none") {
    flags.push({
      level: "yellow",
      scenario: "LN1",
      reason:
        "The Borrower is an individual and interest is charged. Under the Moneylenders Act 2008 a person who lends money in return for a larger sum is presumed to be a moneylender (s 3), and a loan by an unlicensed moneylender is unenforceable and the money lent cannot be recovered (s 19). The exclusions include lending solely to companies, to accredited investors or to one's own employees, and lending that is incidental to a business whose main object is not lending. Confirm the Lender is excluded — the Regulatory Status clause records it but does not make it so — and keep the loan a one-off.",
      field: "LN3",
    });
  } else if (r.borrowerCompany) {
    flags.push({
      level: "green",
      scenario: "LN1",
      reason: "The Borrower is a company. A person who lends solely to companies (and similar bodies) is an excluded moneylender under the Moneylenders Act 2008 — check that is true of the Lender.",
      field: "LN3",
    });
  }

  if (r.security === "pledge") {
    flags.push({
      level: "yellow",
      scenario: "LN2",
      reason:
        "A share pledge is not normal for a loan agreement. The pledge itself must be drawn up separately: check the company's constitution and any shareholders' agreement for transfer restrictions and consents, pay any stamp duty, and register the charge with ACRA if the pledgor is a company. The agreement makes the pledge, the share certificates and undated transfer forms a condition of the loan.",
      field: "LN14",
    });
  } else if (r.security === "other") {
    flags.push({ level: "green", scenario: "LN3", reason: "The security is given in a separate Security Document, which this agreement does not draft. Have it prepared and signed before the drawdown — it is a condition of the loan.", field: "LN14" });
  }

  if (r.model === "tiered" && r.repay === "instalments") {
    flags.push({ level: "yellow", scenario: "LN4", reason: "Tiered interest is set by when the loan is repaid in full; with instalments to the Maturity Date it will normally be the top tier. Consider a rate a year instead.", field: "LN12" });
  }

  const top = r.model === "tiered" ? r.tiers[2] : r.model === "annual" ? r.rate : NaN;
  if (Number.isFinite(top) && top >= 20) {
    flags.push({
      level: r.borrowerCompany ? "green" : "yellow",
      scenario: "LN5",
      reason:
        r.model === "tiered"
          ? `The top tier is ${top}% of the amount lent. Tiers are totals, not rates a year, but a high total over a short loan can be challenged as excessive or unconscionable${r.borrowerCompany ? "" : ", particularly against an individual"}. Check it is commercially justified.`
          : `Interest of ${top}% a year is high. It can be challenged as excessive or unconscionable${r.borrowerCompany ? "" : ", particularly against an individual"}; check it is commercially justified.`,
      field: "LN12",
    });
  }

  if (!r.lenderSide && r.strict) {
    flags.push({ level: "yellow", scenario: "LN6", reason: "As the Borrower you have chosen the lender-friendly Events of Default: three Business Days for a missed payment, fifteen for other breaches, and more triggers, with no cure period before the loan is called in.", field: "LN15" });
  }
  if (!r.lenderSide && r.level !== "simple" && str(a.LN19) === "none") {
    flags.push({ level: "green", scenario: "LN12", reason: "The Borrower's liability for a breach is not capped. The master caps it at twice the amount lent.", field: "LN19" });
  }

  if (r.model === "tiered" && Number.isFinite(r.termMonths) && r.termMonths <= 6) {
    flags.push({ level: "green", scenario: "LN7", reason: `With a term of ${r.termMonths} months, the top tier (after 6 months) applies only if the loan runs on or is extended. Check the tiers match the term.`, field: "LN9" });
  }

  if (!str(bank.bank) || !str(bank.account_no)) {
    flags.push({ level: "green", scenario: "LN8", reason: "The Borrower's bank account details are not all filled in: the definition shows [●]. Fill them in before signing.", field: "parties" });
  }
  if (r.several && !str(rep.name)) {
    flags.push({ level: "yellow", scenario: "LN10", reason: "There are several Lenders but no Lenders' Authorised Representative is named. Name one of the Lenders (or another person) in Schedule 1, Part 2 — the Borrower deals only with them.", field: "parties" });
  }

  if (r.several) {
    const amounts = lenders.map((l) => num(str(l.amount)));
    const total = amounts.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);
    if (amounts.some((x) => !Number.isFinite(x))) {
      flags.push({ level: "yellow", scenario: "LN13", reason: "Not every Lender's share of the loan is filled in: Schedule 1 shows [●]. Say how much each Lender advances.", field: "parties" });
    } else if (Number.isFinite(r.principal) && Math.abs(total - r.principal) > 0.005) {
      flags.push({ level: "yellow", scenario: "LN13", reason: `The Lenders' shares add up to ${total.toLocaleString("en-GB")}, not the amount lent (${r.principal.toLocaleString("en-GB")}). Check Schedule 1.`, field: "parties" });
    }
  }

  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = key(str(borrower.name));
  if (b && lenders.some((l) => key(str(l.name)) === b)) {
    flags.push({ level: "red", scenario: "LN11", reason: "The Borrower is also named as a Lender. A person cannot lend to themselves — check the parties.", field: "parties" });
  }

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) flags.push({ level: "red", scenario: "LN9", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
  }
  return { flags };
}
