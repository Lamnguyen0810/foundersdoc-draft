/**
 * The shapes the investment agreement flow passes around. Shared by the
 * client, the API route and the assembler — so no imports from either side.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (IA1 … IA18). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

/** The company issuing the shares. */
export interface Company {
  name: string;
  reg_no?: string;
  address?: string;
  /** Issued shares before the investment, "300,000". */
  issued_shares?: string;
  /** Issued share capital before the investment, "S$3,000". */
  issued_capital?: string;
  /** Date of incorporation, "6 January 2024" (Schedule 2, lead investor). */
  incorporated_on?: string;
  /** Directors, separated by ";" (Schedule 2, lead investor). */
  directors?: string;
  signatory_name?: string;
  signatory_title?: string;
  signatory_email?: string;
  bank_name?: string;
  account_name?: string;
  account_no?: string;
  swift?: string;
}

export interface Founder {
  name: string;
  address?: string;
  email?: string;
}

export type PartyKind = "individual" | "company";

export interface Investor {
  name: string;
  kind: PartyKind;
  id_no?: string;
  jurisdiction?: string;
  address?: string;
  email?: string;
  signatory_name?: string;
  signatory_title?: string;
  /** Shares subscribed, "6,597". */
  shares?: string;
  /** Investment amount, "200,011" (deal currency). */
  amount?: string;
}

export interface IaInput {
  answers: Answers;
  company: Company;
  founders: Founder[];
  investor: Investor;
  date: string;
}
