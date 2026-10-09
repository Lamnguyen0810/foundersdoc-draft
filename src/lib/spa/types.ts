/**
 * The shapes the share purchase agreement flow passes around. Shared by the
 * client, the API route and the assembler — so no imports from either side.
 *
 * Flags and statuses are the term sheet's own (lib/termsheet/types): the
 * review queue, the Slack messages and the draft screen already read them.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (P1 … P21). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

/** The company whose shares are sold. */
export interface Target {
  name: string;
  /** UEN. */
  reg_no?: string;
  address?: string;
  /** "developing software for …" — Recital (A) and the definition of Business. */
  business?: string;
  /** Total issued shares, "10,000". */
  issued_shares?: string;
  /** Issued share capital, "S$10,000". */
  issued_capital?: string;
  /** Directors, one per line or comma-separated — Schedule 1. */
  directors?: string;
  /** The date the latest accounts are made up to, "31 December 2025". */
  accounts_date?: string;
}

export type PartyKind = "individual" | "company";

export interface Party {
  name: string;
  kind: PartyKind;
  /** NRIC/passport, or company registration number. */
  id_no?: string;
  /** For a company: where it is incorporated ("Singapore"). */
  jurisdiction?: string;
  address?: string;
  email?: string;
  /** For a company: who signs, and their title. */
  signatory_name?: string;
  signatory_title?: string;
}

/** One seller: a party, a line of Schedule 2, a signature block. */
export interface Seller extends Party {
  /** Shares sold, "5,000". */
  shares?: string;
  /** This seller's part of the price, "250,000" (in the deal currency). */
  price?: string;
}

export interface SpaInput {
  answers: Answers;
  target: Target;
  buyer: Party;
  sellers: Seller[];
  /** The date the agreement bears, ISO. */
  date: string;
}
