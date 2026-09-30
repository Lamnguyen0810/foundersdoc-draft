/**
 * What each question means, in plain English — shown when the person points
 * at the "i" beside it on the drafting screen, and used by the chat's answers
 * (lib/draft-help.ts) for the same questions.
 *
 * Written for a founder, not a lawyer: what the question is for, what a good
 * answer looks like, and what to choose when unsure. Keyed by the question's
 * key; a question with no entry here shows its own help text from the form
 * (the admin console's "help"), and a question with neither shows no "i".
 *
 * ── THE WORDS ON THE SCREEN, EXACTLY ────────────────────────────────────────
 * An explanation that names a choice names it exactly as the button says it
 * — “One-way: we disclose”, not “we disclose” — so the person can find it.
 * The choices are therefore read from the question itself (its `options`, as
 * the admin console publishes them) rather than typed out here: rename an
 * option in the console and the explanation follows. A choice the question
 * does not offer is not mentioned at all.
 */

import type { Field } from "./doctypes";

type Explained = Pick<Field, "key" | "help"> & Partial<Pick<Field, "options" | "label">>;

/** The option on screen that matches, as the button spells it. */
export function optionLabel(f: Pick<Field, "options"> | undefined, match: RegExp, fallback: string): string {
  return (f?.options ?? []).find((o) => match.test(o)) ?? fallback;
}

/** “Label” — in the curly quotes the rest of the product uses. */
const q = (s: string) => `“${s}”`;

/**
 * The direction question, built from the options it really offers.
 * Shared with the chat's answer to "what does mutual mean?".
 */
export function explainDirection(f: Pick<Field, "options"> | undefined): string {
  const opts = f?.options?.length ? f.options : ["Mutual", "One-way: we disclose", "One-way: we receive"];
  const lines: string[] = [];
  for (const o of opts) {
    if (/mutual/i.test(o)) {
      lines.push(`${q(o)}: both sides will share confidential information, so both must protect it.`);
    } else if (/disclos|we share|we give/i.test(o)) {
      lines.push(`${q(o)}: only you share information, so only the other side must keep it confidential.`);
    } else if (/receiv|they share/i.test(o)) {
      lines.push(`${q(o)}: only the other side shares information, so only you must keep it confidential.`);
    } else {
      lines.push(`${q(o)}.`);
    }
  }
  const mutual = opts.find((o) => /mutual/i.test(o));
  if (mutual) lines.push(`If both sides might share anything sensitive, choose ${q(mutual)}.`);
  return lines.join(" ");
}

const NDA: Record<string, (f: Explained) => string> = {
  nda_direction: (f) => explainDirection(f),
  party_a: () => "Your full legal name, or your company’s registered name, as it should appear in the NDA.",
  party_b: () => "The full legal name of the person or company you are sharing information with.",
  party_extra: () =>
    "Anything else you want in the NDA about either party, such as a registered address, a company registration or ID number, or the person who will sign. Say which party each detail belongs to. Leave it blank if the names are enough: anything missing is marked in the draft for you to fill in later.",
  purpose: () =>
    "Why the information is being shared, for example “to discuss a possible distribution partnership”. The other side may use your information only for this purpose, so a specific description protects you better than a vague one.",
  info_categories: () =>
    "The kinds of information you expect to share, for example pricing, customer lists, financial figures, product plans or source code. Naming the real categories helps avoid disputes later about whether something was covered.",
  confidentiality_period: () =>
    `How long the other side must keep your information confidential, counted from the date of the NDA. Fill in the years, the months or both, for example 1 year and 3 months (two to five years is common), or choose ${q(PERPETUAL)} if the information must stay confidential with no time limit, for example trade secrets.`,
  ip_assignment: (f) => {
    const yes = optionLabel(f, /^yes\b/i, "Yes");
    const no = optionLabel(f, /^no\b/i, "No");
    return `Choose ${q(yes)} if anything the other side creates using your information (such as a design, a report or software) should belong to you. This is uncommon in an NDA, so choose ${q(no)} unless it matters for your deal.`;
  },
  personal_data: (f) => {
    const yes = optionLabel(f, /^yes\b/i, "Yes");
    return `Choose ${q(yes)} if either side will share information about individuals, such as customer or employee details. A data protection clause is then added to the NDA.`;
  },
  governing_law: () =>
    `The jurisdiction whose law applies to the NDA, usually where you are based. For the United States, Australia, Canada and the United Kingdom, law is set state by state (or part by part), so choose the state under its country, for example California or England and Wales. If yours is not listed, choose ${q("Other (type it)")} and type it.`,
  dispute_resolution: (f) => {
    const courts = optionLabel(f, /court/i, "Courts");
    const arb = optionLabel(f, /arbitrat/i, "Arbitration");
    const help = optionLabel(f, /help|not sure/i, "Help me choose");
    return `${q(courts)}: a dispute goes to the courts of the jurisdiction you chose. ${q(arb)}: it goes to a private arbitration centre instead, such as the Singapore International Arbitration Centre for Singapore law. Arbitration is confidential and its awards are easier to enforce abroad, so it suits parties in different countries. ${q(help)}: answer one question and FD AI suggests one.`;
  },
  special_terms: () =>
    "Anything else you want in the NDA, in your own words: for example the country whose law should apply, a clause to add, or something to leave out. This is optional.",
};

const BY_TYPE: Record<string, Record<string, (f: Explained) => string>> = { nda: NDA };

/** The chip beside the years box on the confidentiality question. */
export const PERPETUAL = "Perpetual";

/** The buttons on the step that asks for an existing document (DraftChat). */
export const SOURCE_ATTACH = "Attach a document";
export const SOURCE_FRESH = "No — start fresh";
export const SKIP_LABEL = "Skip for now";

/** The step that asks for an existing document to work from. */
export const SOURCE_EXPLANATION = `If you already have an NDA or a term sheet for this deal (Word or PDF), choose ${q(SOURCE_ATTACH)}. FD AI uses it as a starting point and follows your answers wherever they differ. If not, choose ${q(SOURCE_FRESH)}.`;

export function explainField(docSlug: string, f: Explained): string {
  const own = BY_TYPE[docSlug]?.[f.key];
  return own ? own(f) : (f.help ?? "").trim();
}
