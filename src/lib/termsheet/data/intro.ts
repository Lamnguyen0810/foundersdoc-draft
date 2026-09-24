/**
 * The intro shown before the first question: short version, Learn more, disclaimer.
 *
 * Generated from the firm's intro_content.json — data, not code. Edit the source file and regenerate;
 * do not hand-edit here.
 */
export const INTRO = {
  "id": "FD_TS_INTRO",
  "version": "1.0",
  "format": "markdown",
  "short": "**What is a term sheet?**\n\nA term sheet is a short document that sets out the main terms of a deal before the full legal agreements are drafted. It helps both sides confirm they agree on the key points, such as who is involved, what is being done and on what terms, before spending time and money on lawyers.\n\n**Most of a term sheet is not legally binding.** It records what the parties intend to agree, but no one is obliged to go ahead with the deal until the final agreements are signed. Only the terms the term sheet specifically says are binding can be enforced. These are usually protective terms, such as confidentiality and exclusivity.\n\nIt takes about 10 minutes to answer the questions. You can skip anything that hasn't been agreed yet.",
  "learn_more": {
    "when_used": "Term sheets are common when raising investment, borrowing money, buying or selling a business, or starting a project with a partner. Depending on the country and the deal, they may also be called *heads of terms*, a *letter of intent* or a *memorandum of understanding*.",
    "usually_binding": [
      "Exclusivity: the other side agrees not to negotiate with anyone else for a set period",
      "Confidentiality: the deal and the information shared are kept private",
      "Costs: who pays the legal and other fees",
      "Expiry: how long the offer stays open",
      "Governing law and disputes: which country's law applies and how disputes are resolved"
    ],
    "usually_not_binding": [
      "Price, valuation and payment terms",
      "Conditions that must be met before the deal closes",
      "Target dates for signing and completion",
      "Other commercial terms, such as board seats"
    ],
    "after_the_term_sheet": "Once both sides sign, lawyers use the term sheet to draft the full agreements. Some terms may still change during that process. The deal is only final when those agreements are signed.",
    "good_to_know": [
      "Even non-binding terms carry weight. Backing out of agreed points later can damage trust, and in some countries it can create legal liability if negotiations are broken off in bad faith.",
      "A term sheet should be clear and short. It doesn't need to cover every detail."
    ]
  },
  "disclaimer": "This tool helps you prepare a draft term sheet. It is not legal advice. We recommend having a lawyer review the term sheet before you sign it.",
  "status": "Draft for FD review"
} as const;
