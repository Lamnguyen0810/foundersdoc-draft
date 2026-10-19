/**
 * The shapes the joint venture agreement flow passes around. Shared by the
 * client, the API route and the assembler — so no imports from either side.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (JV0 … JV22). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

export type PartyKind = "individual" | "company";

/** Party A or Party B. In a majority joint venture, Party A is the majority party. */
export interface Party {
  name: string;
  kind: PartyKind;
  /** Registration number, or identity card / passport number. */
  id_no?: string;
  /** Where a company is incorporated. */
  jurisdiction?: string;
  address?: string;
  /** For notices. */
  email?: string;
  /** A company: who signs, and their title. */
  signatory_name?: string;
  signatory_title?: string;
}

export interface JvaInput {
  answers: Answers;
  partyA: Party;
  partyB: Party;
  date: string;
}
