/**
 * What the Loan Agreement screen says before the first question: the
 * short version, Learn more, and the disclaimer.
 */
export const LOAN_INTRO = {
  short:
    "**A loan agreement, for lending or borrowing money.**\n\nAnswer plain-English questions about the amount, the interest and how it is repaid — and FD AI puts together a loan agreement from our lawyers' master: one lender or several, to an individual or a company, including a founder borrowing for their start-up.\n\nTell us whether you are lending or borrowing, and the usual answers lean to your side. It is in Beta and written under Singapore law. It takes about 8 minutes; anything you skip takes the usual answer.",
  learn_more: {
    what_you_get: [
      "A loan agreement naming the Borrower and the Lender — or several Lenders, listed in a schedule and acting through one authorised representative",
      "The amount, the drawdown into the Borrower's bank account, the term and how it is repaid: on request, on the Maturity Date or in instalments",
      "Tiered interest that rewards early repayment (the master's position), a rate a year, a flat charge, or interest-free",
      "Events of default, the Company's warranties and change of control for a founder loan, security if there is any, and how disputes are resolved",
      "Points your lawyer should check, listed beside the agreement, and a Word file",
    ],
    good_to_know: [
      "The usual answers lean to the side you choose — the other side may ask for changes. Each choice says what it means.",
      "Lending to an individual for interest can count as moneylending under the Moneylenders Act 2008. FD AI flags it; check before you sign.",
      "Security such as a guarantee or share pledge is given in a separate document, which this agreement does not draft.",
      "Beta: the wording follows the Founders Doc master loan agreement and four reference loan agreements. Have a lawyer read it in full.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft loan agreement. It is not legal advice. We recommend having a lawyer check it before it is signed.",
} as const;
