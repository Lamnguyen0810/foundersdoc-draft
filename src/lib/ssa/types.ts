/**
 * The shapes the share subscription agreement flow passes around. Shared by
 * the client, the API route and the assembler — so no imports from either side.
 *
 * Flags and statuses are the term sheet's own (lib/termsheet/types): the
 * review queue, the Slack messages and the draft screen already read them.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (SS1 … SS15). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

/** The company issuing the shares. */
export interface Company {
  name: string;
  /** UEN. */
  reg_no?: string;
  address?: string;
  /** "developing software for …" — the definition of Business. */
  business?: string;
  /** Issued shares before the investment, "1,000,000". */
  issued_shares?: string;
  /** Issued share capital before the investment, "S$10,000". */
  issued_capital?: string;
  /** Who signs for the Company, and the notices contact. */
  signatory_name?: string;
  signatory_title?: string;
  signatory_email?: string;
  /** Where the subscription money is paid. */
  bank_name?: string;
  account_name?: string;
  account_no?: string;
}

export interface Founder {
  name: string;
  /** NRIC / passport. */
  id_no?: string;
  address?: string;
  email?: string;
}

export type PartyKind = "individual" | "company";

/** One investor: a party, a line of Clause 2, a signature block. */
export interface Investor {
  name: string;
  kind: PartyKind;
  id_no?: string;
  /** For a company: where it is incorporated. */
  jurisdiction?: string;
  address?: string;
  email?: string;
  signatory_name?: string;
  signatory_title?: string;
  /** Shares subscribed, "50,000". */
  shares?: string;
  /** Subscription amount, "250,000" (S$). */
  amount?: string;
}

export interface SsaInput {
  answers: Answers;
  company: Company;
  founders: Founder[];
  investors: Investor[];
  /** The investors' representative (SS4a), by name. */
  representative?: string;
  /** The date the agreement bears, ISO. */
  date: string;
}
