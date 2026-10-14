/**
 * The shapes the convertible loan agreement flow passes around. Shared by
 * the client, the API route and the assembler — so no imports from either side.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (CL1 … CL22). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

export type PartyKind = "individual" | "company";

/** The Company (always a company) or the Investor. */
export interface Party {
  name: string;
  kind: PartyKind;
  /** Registration number, or identity card / passport number. */
  id_no?: string;
  /** "private company limited by shares". */
  company_type?: string;
  /** Where a company is incorporated. */
  jurisdiction?: string;
  address?: string;
  /** For notices (and, for the Company, data protection queries). */
  email?: string;
  /** Notices: "Attention: …". */
  attention?: string;
  signatory_name?: string;
  signatory_title?: string;
}

export interface ClnInput {
  answers: Answers;
  company: Party;
  investor: Party;
  date: string;
}
