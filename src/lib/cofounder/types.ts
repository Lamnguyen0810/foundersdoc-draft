/**
 * The shapes the co-founder agreement flow passes around. Shared by the
 * client, the API route and (later) the assembler — so no imports from
 * either side here.
 *
 * Flags and statuses are the term sheet's own (lib/termsheet/types): the
 * review queue, the Slack messages and the draft screen already read them.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (F1 … F25). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

/** The startup. It may not be incorporated yet: the agreement then speaks of
 *  "the Company (if and when incorporated)". */
export interface Company {
  /** Full legal name, or the proposed name. Blank → [●]. */
  name: string;
  reg_no?: string;
  address?: string;
  /** What the business does, in a line (the recital). */
  business?: string;
}

/** One co-founder, as they will appear in the preamble and the signature block. */
export interface Founder {
  name: string;
  /** NRIC or passport number. */
  id_no?: string;
  nationality?: string;
  address?: string;
  email?: string;
  /** "Chief Executive Officer", "Director" — the signature block's title. */
  title?: string;
  /** What they are responsible for — clause 5.1 Performance Contributions. */
  role?: string;
}

/** One line of the initial shareholding (clause 2.1(b)). */
export interface Holding {
  name: string;
  /** "Co-Founder", "Angel investor", "ESOP pool". */
  role?: string;
  /** Percent, as typed: "30", "33.33". */
  percent: string;
}

/** What the AI writes. Nothing: the master is not loaded. */
export interface AiFields {
  notes?: string[];
}

export interface CofounderInput {
  answers: Answers;
  company: Company;
  founders: Founder[];
  holdings: Holding[];
  ai: AiFields | null;
  /** The date the agreement bears, ISO. */
  date: string;
}
