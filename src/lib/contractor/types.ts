/**
 * The shapes the contractor flow passes around. Shared by the client, the
 * API routes and the assembler — so no imports from either side here.
 *
 * Flags and statuses are the term sheet's own (lib/termsheet/types): the
 * review queue, the Slack messages and the draft screen already read them.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (C1a … C16). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

export interface Company {
  /** Full legal name, never a trading name. */
  name: string;
  reg_no?: string;
  address?: string;
  /** Who signs for the Company. */
  signatory_name?: string;
  signatory_designation?: string;
  signatory_email?: string;
}

export interface Contractor {
  /** The person, or the company they sign for. */
  name: string;
  /** Company number when the Contractor is a company. */
  reg_no?: string;
  address?: string;
  /** Passport or national ID number, for an individual. */
  id_no?: string;
  email?: string;
  /** Who signs for a contractor company. */
  signatory_name?: string;
}

/** The engagement itself — the schedule of services and the fee. Blank → [●]. */
export interface Engagement {
  /** What the Contractor will do, in a few lines. */
  services: string;
  /** "SGD 8,000" — read through normaliseMoney where it can be. */
  fee?: string;
  fee_basis?: "month" | "hour" | "day" | "project" | "milestone";
  /** "within 14 days of invoice". */
  payment_terms?: string;
  /** ISO date. */
  start_date?: string;
  /** Fixed schedule or flexible, in a line. */
  schedule?: string;
  /** Where the work is done, if anywhere in particular. */
  location?: string;
  /** Other benefits beyond the fee, in a line. */
  benefits?: string;
}

/** What the AI writes. Nothing yet: the master is not loaded. */
export interface AiFields {
  notes?: string[];
}

export interface ContractorInput {
  answers: Answers;
  company: Company;
  contractor: Contractor;
  engagement: Engagement;
  ai: AiFields | null;
  /** The date the agreement bears, ISO. */
  date: string;
}
