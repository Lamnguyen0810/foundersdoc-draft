/**
 * What the SPA screen says before the first question: the short version,
 * Learn more, and the disclaimer.
 */
export const SPA_INTRO = {
  short:
    "**A share purchase agreement, for buying or selling shares in a Singapore company.**\n\nAnswer plain-English questions about the price, the conditions, Closing, the warranties and what the sellers may do afterwards — and FD AI puts together a share purchase agreement from Founders Doc’s precedent.\n\nIt is in Beta and written for a Singapore company. It takes about 15 minutes; anything you skip takes the usual answer.",
  learn_more: {
    what_you_get: [
      "A share purchase agreement naming the buyer and every seller, with the shares and price for each seller in a schedule",
      "Conditions, Closing deliverables, warranties, indemnities and restrictions switched on or off by your answers",
      "The full set of business warranties (accounts, assets, IP, contracts, employees, tax, litigation), or title-only for a small stake",
      "Points your lawyer should check — a long non-compete, a missing seller, more shares sold than issued — listed beside the agreement",
      "A Word file",
    ],
    good_to_know: [
      "Every seller must sign: the agreement only sells the shares of those who are parties to it.",
      "Check the company’s constitution and any shareholders agreement for pre-emption rights and transfer restrictions before you sign.",
      "The share transfer must be stamped with IRAS within 14 days of signing and lodged with ACRA.",
      "Beta: the agreement is assembled from a Founders Doc precedent, not yet from an approved master. Have a lawyer read it in full.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft share purchase agreement. It is not legal advice. We recommend having a lawyer check it before it is signed.",
} as const;
