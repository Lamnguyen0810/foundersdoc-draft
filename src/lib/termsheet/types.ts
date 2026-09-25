/**
 * The shapes the term sheet flow passes around: the parties, the fields the
 * AI drafts, the flags a draft carries. Shared by the client, the API routes
 * and the assembler — so no imports from either side here.
 */

import type { Answers } from "./conditions";

export type PartyKind = "company" | "individual";

export interface Party {
  kind: PartyKind;
  /** Full legal name, never a trading name. */
  name: string;
  /** Company: "private company limited by shares", "corporation" … */
  entity_type?: string;
  /** Company: the country (or, for a federal country, "Delaware, United States"). */
  jurisdiction?: string;
  reg_no?: string;
  /** Individual: "NRIC", "passport" … */
  id_type?: string;
  id_no?: string;
  address: string;
  /** Extra parties only: Co-Investor, Founder, Guarantor. Parties 1 and 2 take
   *  their roles from the deal type. */
  role?: string;
  /** The recipient's contact, for the address block: "Jane Smith", "Chief Executive Officer". */
  contact_name?: string;
  contact_title?: string;
  /** "Jane" / "Ms Tan". Empty → "Sirs". */
  salutation?: string;
  /** Listed on a stock exchange, or regulated by a financial regulator (S26). */
  listed_or_regulated?: boolean;
}

export interface KeyTerm {
  heading: string;
  text: string;
  /** "Q8b", "Q8c", "Q8d", "Q8e[0]" … or "S16" for the one line the AI may add. */
  source: string;
}

/** What the AI drafts, per playbook §5 and §11. Everything else is approved
 *  wording, rules or lookups. */
export interface AiFields {
  transaction_title: string;
  transaction_description: string;
  structure: string;
  /** Only when Q4 was "Other". */
  subject_matter?: string;
  key_terms?: KeyTerm[];
  /** Q9 "Other", each rewritten as something that must happen or be obtained. */
  conditions_other?: string[];
  /** Q13 "Other": who pays what, any cap, whether it applies if the deal aborts. */
  costs_allocation?: string;
  /** Q1 "Other": the AI's classification, for the user to confirm. */
  deal_type_guess?: string;
}

export type FlagLevel = "green" | "yellow" | "ask" | "red";

export interface Flag {
  level: FlagLevel;
  /** S1 … S30, or "AI" for a drafted field. */
  scenario: string;
  /** A few words for the list the user sees: "Parties in different countries". */
  title?: string;
  reason: string;
  /** The question or field it concerns. */
  field?: string;
  /** Something to say to the user, in the conversation. */
  user_message?: string;
}

/** What the AI step returns, per playbook §11. */
export interface AiResult {
  fields: AiFields;
  key_terms: KeyTerm[];
  conditions_other: string[];
  questions_for_user: string[];
  flags: Flag[];
  stop: { scenario: string; reason: string } | null;
}

export interface TermSheetInput {
  answers: Answers;
  /** [0] the issuing party (party 1), [1] the recipient (party 2), then any others. */
  parties: Party[];
  ai: AiFields | null;
  /** The date the letter bears, ISO. */
  date: string;
  /** "TERM SHEET" unless local practice says otherwise (S21). */
  documentTitle?: string;
}

export type DraftStatus = "draft" | "held" | "stopped" | "final";
