/**
 * What the Convertible Loan Agreement screen says before the first question:
 * the short version, Learn more, and the disclaimer.
 */
export const CLN_INTRO = {
  short:
    "**A convertible loan agreement, for raising money that turns into shares.**\n\nAnswer plain-English questions about the amount, the valuation cap, any discount, interest and maturity — and FD AI puts together a convertible loan agreement from our lawyers' master: a company borrowing from one investor, with the loan converting into ordinary shares at the next qualifying round, a sale or listing, or at maturity.\n\nTell us whether you are the company or the investor, and the usual answers lean to your side. Choose Singapore, England and Wales, Hong Kong, Delaware, New York or another law. It is in Beta and takes about 7 minutes; anything you skip takes the usual answer.",
  learn_more: {
    what_you_get: [
      "A convertible loan agreement between the Company and the Investor, from the Founders Doc master",
      "The valuation cap (pre- or post-money), any discount, the qualifying round and the option pool carve-out",
      "Interest accrued and paid at maturity (simple, compounded or none), the Maturity Date and the Events of Default",
      "Schedule 1 (the Exercise Notice) and Schedule 2 (how the Conversion Price and the number of shares are worked out)",
      "The data protection law, third-party rights, courts or arbitration and local time for the law you choose",
      "Points your lawyer should check, listed beside the agreement, and a Word file",
    ],
    good_to_know: [
      "The usual answers lean to the side you choose — the other side may ask for changes. Each choice says what it means.",
      "Issuing shares to an investor can need a prospectus unless an exemption applies; the investor's status warranty should match it.",
      "Outside Singapore, have a lawyer qualified in the governing law confirm the jurisdiction entries before signing.",
      "Beta: the wording follows the Founders Doc master convertible loan agreement. Have a lawyer read it in full.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft convertible loan agreement. It is not legal advice. We recommend having a lawyer check it before it is signed.",
} as const;
