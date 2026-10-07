/**
 * What the contractor screen says before the first question: the short
 * version, Learn more, and the disclaimer. Plain words for a founder
 * engaging a freelancer or consultant, anywhere.
 */
export const CONTRACTOR_INTRO = {
  short:
    "**A contractor agreement, from our lawyers’ own master.**\n\nAnswer fifteen plain-English questions about the engagement — exclusivity, who owns the work, how it ends, what happens after — and FD AI puts together a contractor agreement from Founders Doc’s master contract.\n\nIt works for any country: the agreement uses the law of the place the Company is based, and FD AI flags anything that could make the contractor look like an employee. It takes about 10 minutes, and anything you skip takes the usual answer.",
  learn_more: {
    what_you_get: [
      "An independent contractor agreement with a schedule of the services, the fee and the dates",
      "Clauses switched on or off by your answers — nothing added that you didn’t choose",
      "Points your lawyer should check, including whether the arrangement could be treated as employment, listed beside the agreement",
      "A Word file, ready to send",
    ],
    good_to_know: [
      "A contractor who works only for you, keeps your hours and sits in your office can be treated as an employee by a court or tax office, whatever the contract says.",
      "Restrictions after the engagement (non-competes, non-solicits) are enforced against contractors even less readily than against employees.",
      "If the Company and the Contractor are in different countries, withholding tax, permits and local rules on contractors can all apply.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft contractor agreement. It is not legal advice. We recommend having a lawyer check it before it is signed.",
} as const;
