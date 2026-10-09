/**
 * The shapes the shareholders agreement flow passes around. Shared by the
 * client, the API route and the assembler — so no imports from either side.
 *
 * Flags and statuses are the term sheet's own (lib/termsheet/types): the
 * review queue, the Slack messages and the draft screen already read them.
 */

import type { DraftStatus, Flag, FlagLevel } from "../termsheet/types";

export type { DraftStatus, Flag, FlagLevel };

/** Answers keyed by question id (S1 … S38b). Multi-choice answers are arrays. */
export type Answers = Record<string, unknown>;

export interface Company {
  /** Full legal name, or the proposed name if not incorporated. */
  name: string;
  /** UEN. */
  reg_no?: string;
  address?: string;
  /** "developing and selling …" — clause 1.2 and the definition of Business. */
  business?: string;
  /** Who signs for the Company. */
  signatory_name?: string;
  signatory_title?: string;
  signatory_email?: string;
}

export type ShareholderKind = "founder" | "investor" | "other";

/** One shareholder: a party, a line of Table A item (1), a signature block. */
export interface Shareholder {
  name: string;
  kind: ShareholderKind;
  /** NRIC/passport, or company registration number. */
  id_no?: string;
  address?: string;
  email?: string;
  /** "S$100,000". */
  capital?: string;
  /** "100,000". */
  shares?: string;
  /** "Ordinary Shares" unless another class is chosen. */
  share_class?: string;
  /** For a corporate shareholder: who signs, and their title. */
  signatory_name?: string;
  signatory_title?: string;
  /** The CEO Founder (founders only, one). */
  ceo?: boolean;
  /** The Lead Investor (investors only, one). */
  lead?: boolean;
  /** May appoint a Director (S7 "specific named shareholders"). */
  appoints?: boolean;
}

export interface AiFields {
  notes?: string[];
}

export interface ShaInput {
  answers: Answers;
  company: Company;
  shareholders: Shareholder[];
  ai: AiFields | null;
  /** The date the agreement bears, ISO. */
  date: string;
}
