/**
 * What each question means, in plain English — shown when the person taps
 * the "i" beside it on the drafting screen.
 *
 * Written for a founder, not a lawyer: what the question is for, what a good
 * answer looks like, and what to choose when unsure. Keyed by the question's
 * key; a question with no entry here shows its own help text from the form
 * (the admin console's "help"), and a question with neither shows no "i".
 */

import type { Field } from "./doctypes";

const NDA: Record<string, string> = {
  nda_direction:
    "Mutual: both sides will share confidential information, so both must protect it. One-way (we disclose): only you share information, so only the other side is bound. One-way (we receive): only the other side shares, so only you are bound. If both sides might share anything sensitive, choose Mutual.",
  party_a:
    "Your full legal name, or your company’s registered name, as it should appear in the NDA.",
  party_b:
    "The full legal name of the person or company you are sharing information with.",
  party_extra:
    "Anything else you want in the NDA about either party, such as a registered address, a company registration or ID number, or the person who will sign. Say which party each detail belongs to. Leave it blank if the names are enough: anything missing is marked in the draft for you to fill in later.",
  purpose:
    "Why the information is being shared, for example “to discuss a possible distribution partnership”. The other side may use your information only for this purpose, so a specific description protects you better than a vague one.",
  info_categories:
    "The kinds of information you expect to share, for example pricing, customer lists, financial figures, product plans or source code. Naming the real categories helps avoid disputes later about whether something was covered.",
  term_years:
    "How long the NDA stays open for sharing new information. One to three years is usual.",
  survival_years:
    "How long the duty to keep the information confidential lasts after the agreement ends. Two to five years is common. Choose Perpetual if the information must stay confidential with no time limit, for example trade secrets.",
  ip_assignment:
    "Choose Yes if anything the other side creates using your information (such as a design, a report or software) should belong to you. This is uncommon in an NDA, so choose No unless it matters for your deal.",
  personal_data:
    "Choose Yes if either side will share information about individuals, such as customer or employee details. A data protection clause is then added to the NDA.",
  special_terms:
    "Anything else you want in the NDA, in your own words: for example the country whose law should apply, a clause to add, or something to leave out. This is optional.",
};

const BY_TYPE: Record<string, Record<string, string>> = { nda: NDA };

/** The step that asks for an existing document to work from. */
export const SOURCE_EXPLANATION =
  "If you already have an NDA or a term sheet for this deal (Word or PDF), attach it. FD AI uses it as a starting point and follows your answers wherever they differ. If not, start fresh.";

export function explainField(docSlug: string, f: Pick<Field, "key" | "help">): string {
  return BY_TYPE[docSlug]?.[f.key] ?? (f.help ?? "").trim();
}
