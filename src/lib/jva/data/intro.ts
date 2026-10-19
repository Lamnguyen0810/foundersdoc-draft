/**
 * What the Joint Venture Agreement screen says before the first question:
 * the short version, Learn more, and the disclaimer.
 */
export const JVA_INTRO = {
  short:
    "**A joint venture agreement, so you and your partner know where you stand.**\n\nAnswer plain-English questions about the joint venture company, what each of you puts in and how decisions are made — and FD AI puts together a joint venture agreement from our lawyers' wording: the shares and investment, the board, the decisions that need you both, what happens if you cannot agree, and how a party can leave.\n\n50:50 or with a majority partner — if one party will hold more, tell us which side you are on and the usual answers lean to it. Choose Basic, Standard or Complex, and Singapore, England and Wales, Hong Kong, Delaware, New York or another law. It takes about 8 minutes; anything you skip takes the usual answer.",
  learn_more: {
    what_you_get: [
      "A joint venture agreement between the two parties (individuals or companies) who will own the joint venture company",
      "Basic: the company and its business, the shares and what each party pays, the board, the decisions that need both parties, a deadlock route, first refusal on transfers, new shares offered to both first, and confidentiality",
      "Standard: adds further funding, the full list of reserved matters (Schedule 2), the business plan, accounts and information, dividends, a buy-out or winding up on deadlock, a lock-in, buying out a party in default at fair value, no competing or poaching, and a deed of adherence (Schedule 3)",
      "Complex: adds tag- and drag-along where one party holds the majority, a discount for a party at fault, and anti-corruption",
      "Schedule 1, setting out each party's shares and investment",
      "The constitution, third-party rights statute, mediation, courts or arbitration and expert valuation for the law you choose, the points your lawyer should check, and a Word file",
    ],
    good_to_know: [
      "The company's own constitution (or articles of association) should be amended to match the agreement: the agreement binds the parties, the constitution binds the company.",
      "In a 50:50 joint venture, think hardest about deadlock — what happens when you cannot agree. Each choice says what it means.",
      "Fill in the number of shares each party takes in Schedule 1 before signing.",
      "Outside Singapore, have a lawyer qualified in the governing law confirm the jurisdiction entries before signing.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft joint venture agreement. It is not legal advice. We recommend having a lawyer check it before it is signed.",
} as const;
