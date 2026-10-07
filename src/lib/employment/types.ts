/**
 * The shapes the employment flow passes around. Shared by the client, the
 * API routes and the assembler — so no imports from either side here.
 *
 * Flags and statuses are the term sheet's own (lib/termsheet/types): the
 * review queue, the Slack messages and the draft screen already read them.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (E1a … M3). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

export interface Employer {
  /** Full legal name, never a trading name. */
  name: string;
  reg_no?: string;
  address?: string;
  /** Who signs for the Company. */
  signatory_name?: string;
  signatory_designation?: string;
  signatory_email?: string;
}

export interface Employee {
  name: string;
  address?: string;
  /** Passport or national ID number, for the acceptance. */
  id_no?: string;
  email?: string;
}

/** The job itself — Table A and the opening paragraphs. Blank → [●]. */
export interface Job {
  position: string;
  /** "SGD 6,500" — read through normaliseMoney where it can be. */
  salary?: string;
  salary_period?: "month" | "year";
  /** "the last day of every month". */
  pay_day?: string;
  /** ISO date. */
  start_date?: string;
  /** City or office address. */
  work_location?: string;
  /** Office, hybrid or remote — Table A "Place of Work". */
  work_arrangement?: "office" | "hybrid" | "remote";
  /** Travel the job needs, in a line — Table A "Travel". */
  travel?: string;
  working_hours?: string;
  /** Days a year. */
  leave_days?: string;
}

/** What the AI writes: only the custom dismissal reasons, tidied into the
 *  contract's wording. Everything else is approved wording or a rule. */
export interface AiFields {
  dismissal_grounds?: string[];
}

export interface AiResult {
  fields: AiFields;
  flags: Flag[];
  stop: { scenario: string; reason: string } | null;
}

export interface EmploymentInput {
  answers: Answers;
  employer: Employer;
  employee: Employee;
  job: Job;
  ai: AiFields | null;
  /** The date the letter bears, ISO. */
  date: string;
}
