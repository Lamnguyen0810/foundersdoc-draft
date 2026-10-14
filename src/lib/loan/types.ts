/**
 * The shapes the loan agreement flow passes around. Shared by the client,
 * the API route and the assembler — so no imports from either side.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (LN1 … LN21). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

export type PartyKind = "individual" | "company";

/** The Borrower, a Lender, or the company the loan is connected to. */
export interface Party {
  name: string;
  kind: PartyKind;
  /** UEN / registration number, or NRIC / passport number. */
  id_no?: string;
  /** An individual's citizenship ("Singapore"). */
  nationality?: string;
  /** Where a company is incorporated. */
  jurisdiction?: string;
  address?: string;
  /** For notices. */
  email?: string;
  signatory_name?: string;
  signatory_title?: string;
  /** Several Lenders: the part of the Principal Amount this Lender advances. */
  amount?: string;
}

/** The Lenders' Authorised Representative, when there are several Lenders. */
export interface Rep {
  name?: string;
  address?: string;
  email?: string;
}

/** Where the Loan is paid: the Borrower Bank Account. */
export interface Bank {
  bank?: string;
  account_name?: string;
  account_no?: string;
  swift?: string;
  bank_address?: string;
}

export interface LoanParties {
  borrower: Party;
  /** One or more; the first is listed first. */
  lenders: Party[];
  rep: Rep;
  /** The company the loan is connected to, when the Borrower is an individual (LN4). */
  company: Party;
  bank: Bank;
}

export interface LoanInput extends LoanParties {
  answers: Answers;
  date: string;
}
