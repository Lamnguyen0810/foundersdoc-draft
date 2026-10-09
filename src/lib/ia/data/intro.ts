/**
 * What the Investment Agreement screen says before the first question: the
 * short version, Learn more, and the disclaimer.
 */
export const IA_INTRO = {
  short:
    "**An investment agreement, for an investor putting money into your company for new shares.**\n\nAnswer plain-English questions about the investor, the shares, completion and warranties — and FD AI puts together an investment agreement for one investor on simple terms, or for a lead investor with conditions, founder warranties and a board seat.\n\nIt is in Beta and written for a Singapore company. It takes about 10 minutes; anything you skip takes the usual answer.",
  learn_more: {
    what_you_get: [
      "An investment agreement naming the company, the investor and (for a lead investor) the founders, with the investment amount, the shares and the price per share",
      "Simple investor: the company's warranties, investor undertakings (ESOP, further fundraising, a sale of the company) and the SAFE conversion if there is one",
      "Lead investor: conditions precedent, a board seat, fifteen warranties from the company and the founders, caps on liability and a capital table",
      "The rights of the preference shares in a schedule — liquidation preference, voting and conversion",
      "Points your lawyer should check, listed beside the agreement, and a Word file",
    ],
    good_to_know: [
      "Preference shares need their rights written into the Constitution — the agreement has the company adopt an amended constitution at completion.",
      "If existing shares are being sold to the investor, use the Share Purchase Agreement instead.",
      "Transfers, board rights and vetoes belong in the shareholders agreement; this agreement gives way to it.",
      "Beta: the wording follows two of Founders Doc's own investment agreements. Have a lawyer read it in full.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft investment agreement. It is not legal advice. We recommend having a lawyer check it before it is signed.",
} as const;
