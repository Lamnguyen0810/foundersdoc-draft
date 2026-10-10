/**
 * What the employment screen says before the first question: the short
 * version, Learn more, and the disclaimer. Plain words for a founder hiring
 * their first people, anywhere.
 */
export const EMPLOYMENT_INTRO = {
  short:
    "**An employment contract, from our lawyers’ own master.**\n\nAnswer ten plain-English questions about the job — where the employee works, notice, probation, what they can do after they leave — and FD AI puts together a full employment agreement from Founders Doc’s master contract.\n\nIt works for any country: tell us where the employer and the employee are and the employee’s nationality, and FD AI gives you an overview of the employment law there, then tells you as you go if an answer does not comply. The contract uses the law of the place the employee works, always subject to applicable laws. It takes about 10 minutes, and anything you skip takes the usual answer.",
  learn_more: {
    what_you_get: [
      "A letter-form employment agreement with a one-page summary of the key terms (Table A)",
      "An overview of the employment law where the employee works, before you answer — and a prompt whenever an answer falls short of it",
      "Clauses switched on or off by your answers — nothing added that you didn’t choose",
      "Points your lawyer should check for the country the employee works in, listed beside the contract",
      "A Word file, ready to send",
    ],
    good_to_know: [
      "Local employment law protects employees whatever a contract says: minimum notice, leave and pay cannot be signed away.",
      "Restrictions after someone leaves (non-competes, non-solicits) are only enforced if they are reasonable, and some places do not enforce them at all.",
      "If the employer and the employee are in different countries, you may need a local entity or an employer of record to hire them.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft employment contract. It is not legal advice. We recommend having a lawyer check it against the law where the employee works before it is signed.",
} as const;
