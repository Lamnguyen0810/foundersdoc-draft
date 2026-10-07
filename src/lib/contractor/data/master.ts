/**
 * The FD Master Contractor Agreement — NOT YET LOADED.
 *
 * This file is the placeholder for the firm's master, in the shape the
 * employment master takes (src/lib/employment/data/master.ts): the opening
 * paragraphs, a summary table, then the clauses by section, each with an id
 * the assembler can switch on and off from the answers.
 *
 * When FD uploads the master Word file (Admin → AI files → Contractor
 * Agreements → "FD Master Contractor Agreement"), the clauses are transcribed
 * here and MASTER_LOADED turns true. Until then FD AI saves the answers and
 * a lawyer sends the draft — see server.ts.
 *
 * The clause ids below are the "master menu": which answer reaches which
 * clause. They are listed in Admin → AI files → Questions → Contractor
 * Agreement so FD can check the mapping against the master when it arrives.
 */

export const MASTER_VERSION = "not-loaded";
export const MASTER_LOADED = false;

export interface MasterClause {
  id: string;
  text: string;
  subs?: { ref: string | null; id?: string; text: string }[];
}

export interface MasterSection {
  id: string;
  heading: string;
  clauses: MasterClause[];
}

/** The clauses the questionnaire expects to find in the master, by answer. */
export const MASTER_MENU: { question: string; clause: string; what: string }[] = [
  { question: "C1a / C1b", clause: "governing_law, parties", what: "Governing law and courts; the Company's and the Contractor's place" },
  { question: "C2", clause: "parties", what: "Contractor as an individual or a company; signature block" },
  { question: "C3", clause: "obligations", what: "Contractor's obligations (a)–(d), each in or out" },
  { question: "C4", clause: "exclusivity", what: "Exclusive (written consent) or non-exclusive" },
  { question: "C5", clause: "representations", what: "No conflicting commitments representation in or out" },
  { question: "C6", clause: "expenses", what: "Contractor bears, or Company reimburses pre-approved" },
  { question: "C7", clause: "ip", what: "Full assignment, or licence to the Company" },
  { question: "C8a / C8b", clause: "term", what: "Until completion, fixed end date, or until terminated" },
  { question: "C9a / C9b", clause: "termination", what: "Notice days; payment in lieu; or none" },
  { question: "C10", clause: "termination_for_cause", what: "Grounds (a)–(g), each in or out" },
  { question: "C11", clause: "remedies", what: "Immediate termination, damages, replacement" },
  { question: "C12", clause: "continuing_obligations", what: "Data return, non-disparagement" },
  { question: "C13a / C13b / C13c", clause: "restrictive_covenants", what: "Non-compete and non-solicit, months, territory" },
  { question: "C14", clause: "probation", what: "Probation clause in or out" },
  { question: "C15", clause: "confidentiality", what: "Duration of the confidentiality obligation" },
  { question: "C16", clause: "data_protection", what: "Processing of the Contractor's personal data" },
  { question: "Engagement step", clause: "schedule", what: "Services, fee and basis, payment terms, start date, schedule, location, benefits" },
];

export const SECTIONS: MasterSection[] = [];
