/**
 * What the SHA screen says before the first question: the short version,
 * Learn more, and the disclaimer.
 */
export const SHA_INTRO = {
  short:
    "**A shareholders agreement, from our lawyers’ own master.**\n\nAnswer plain-English questions about your board, meetings, reserved matters, new shares, transfers, exits, founder vesting and leavers — and FD AI puts together a shareholders agreement from Founders Doc’s master, the one we use for startups raising from investors.\n\nIt is written for a Singapore company. It takes about 20 minutes; anything you skip takes the firm’s usual answer.",
  learn_more: {
    what_you_get: [
      "A shareholders agreement naming every shareholder, with Table A: the initial capital, the reserved matters, the investors’ reporting rights and the board",
      "Clauses switched on or off by your answers — the firm’s approved wording, nothing invented",
      "Points your lawyer should check — a deadlock risk, a steep discount, a long non-compete — listed beside the agreement",
      "A Word file, ready to sign",
    ],
    good_to_know: [
      "Every shareholder should sign: the agreement binds only those who are parties to it.",
      "Share rights (preference, conversion, liquidation) sit in the Constitution; make sure the two match.",
      "Founder IP created before the agreement should be assigned to the company by a separate deed.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft shareholders agreement. It is not legal advice. We recommend having a lawyer check it before it is signed.",
} as const;
