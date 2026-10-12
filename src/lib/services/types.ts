/**
 * The shapes the services agreement flow passes around. Shared by the
 * client, the API route and the assembler — so no imports from either side.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (SV1 … SV23). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

export type PartyKind = "individual" | "company";

/** The Service Provider or the Customer. */
export interface Party {
  name: string;
  kind: PartyKind;
  /** UEN / registration number, or NRIC / passport number. */
  id_no?: string;
  /** Where a company is incorporated. */
  jurisdiction?: string;
  address?: string;
  /** For notices. */
  email?: string;
  signatory_name?: string;
  signatory_title?: string;
}

export interface ServicesInput {
  answers: Answers;
  provider: Party;
  customer: Party;
  date: string;
}
