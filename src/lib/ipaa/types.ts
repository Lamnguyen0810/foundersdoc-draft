/**
 * The shapes the IP assignment agreement flow passes around. Shared by the
 * client, the API route and the assembler — so no imports from either side.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (IP0 … IP15). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

export type PartyKind = "individual" | "company";

/** The Creator (who makes the IP) or the Recipient (who receives it). */
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

export interface IpaaInput {
  answers: Answers;
  creator: Party;
  recipient: Party;
  date: string;
}
