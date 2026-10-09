/**
 * The FD Master Co-Founders Agreement (Singapore) — NOT YET LOADED.
 *
 * This file is the placeholder for the firm's master, in the shape the
 * contractor master takes (src/lib/contractor/data/master.ts): the opening
 * paragraphs, then the clauses by section, each with an id the assembler can
 * switch on and off from the answers.
 *
 * When FD uploads the master Word file (Admin → AI files → Co-Founder
 * Agreements → "FD Master Co-Founders Agreement") and the clause sheet (the
 * Gsheet of June 2025: question → answer → clause text, with the defaults),
 * the clauses are transcribed here and MASTER_LOADED turns true. Until then
 * FD AI saves the answers and a lawyer sends the draft — see server.ts.
 *
 * The menu below is which answer reaches which clause, as the June 2025 bug
 * tests found it in the master (clause numbers from those tests). It is
 * listed in Admin → AI files → Questions → Co-Founder Agreement so FD can
 * check it against the master when it arrives.
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
  { question: "F1 + Co-Founders step", clause: "Preamble · signature blocks", what: "One entry per Co-Founder (name, NRIC/passport, address), “and” before the last; one signature block each (Signature, Full Name, Title, Email) — no witness" },
  { question: "Company step", clause: "Recitals", what: "The Company (if and when incorporated) and its business" },
  { question: "F2", clause: "1.2 Interpretation · 3.3 Decision-making Mechanics", what: "Who has the final say: CEO, Co-Founders by majority, the Board, or the shareholders" },
  { question: "F3 / F3a", clause: "2.1(a) Conditions", what: "Conditions to recognition (full-time, capital, other), or the no-conditions wording when None" },
  { question: "F4", clause: "2.1 Initial Capital", what: "Subscription of shares, a director/shareholder loan, or external funding only" },
  { question: "Shareholding step", clause: "2.1(b) Initial Shareholding Allocation", what: "Name (role): percentage, one line each — no Table A" },
  { question: "F5", clause: "2.3 Initial Working Structure", what: "All full-time, some part-time, or all part-time" },
  { question: "F6", clause: "3.1 Board Appointment Rights · 3.2 Cessation of Board Rights", what: "Board seats: CEO only, some, or all Co-Founders" },
  { question: "F7", clause: "3.4 Reserved Matters", what: "The matters needing every Co-Founder’s approval, listed (a), (b), (c) …" },
  { question: "F8", clause: "3.6 Deadlock", what: "CEO decides, good-faith discussion, buy-out (agreed price / FMV), or a third party" },
  { question: "F9 / F9a", clause: "3.6 Deadlock — buy-out price", what: "Discount to FMV, S$1, an agreed valuation method, or a fixed price" },
  { question: "F10 / F10a / F10b", clause: "4.1 Vesting Structure", what: "Reverse vesting: performance, time (schedule and cliff), milestone (per Co-Founder), or other" },
  { question: "F11", clause: "Share Transfers", what: "Right of first offer, identified buyer, Management’s rules — or freely transferable" },
  { question: "F12", clause: "Share Issuances", what: "Pre-emption, identified recipient, Board approval — or freely issued" },
  { question: "F13 + Co-Founders step (roles)", clause: "5.1 Performance Contributions", what: "Each Co-Founder’s role; who decides under-performance" },
  { question: "F14 / F14a", clause: "5.4 Failure to Contribute (Buy-out Option)", what: "Price the defaulting Co-Founder’s shares are bought at — or no buy-out option (clause out)" },
  { question: "F15", clause: "6.2 Mutual Rights and Obligations", what: "Recognition, discussions, strategy, accounts, fair treatment, continuity" },
  { question: "F16", clause: "Restrictive Covenants", what: "None, or 3 months after selling shares / after ceasing to be a Founder (Board can waive)" },
  { question: "F17", clause: "Conflict of Interest", what: "In or out" },
  { question: "F18", clause: "Non-Disparagement", what: "In or out" },
  { question: "F19", clause: "7.1 Good Leaver", what: "Vested shares kept, or bought back (FMV, 25% off, fixed price, cost)" },
  { question: "F20", clause: "7.2 Bad Leaver — causes", what: "The events that make a Co-Founder a Bad Leaver" },
  { question: "F21", clause: "7.2 Bad Leaver — terms", what: "Vested shares kept, or returned (50% off, fixed price, S$1, free)" },
  { question: "F22", clause: "8 Sale of the Company", what: "Co-Founders must take the steps to complete a sale — in or out" },
  { question: "F23", clause: "9.2 Confidentiality", what: "Perpetual, while a shareholder, 5 years, 2 years — or none" },
  { question: "F24", clause: "IP Assignment", what: "All IP to the Company, or documented separately" },
  { question: "F25", clause: "8.4 Winding Up", what: "Sell assets, IP first to Co-Founders, debts before distribution — or insolvency law applies" },
];

export const SECTIONS: MasterSection[] = [];
