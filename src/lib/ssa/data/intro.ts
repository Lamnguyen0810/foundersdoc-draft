/**
 * What the SSA screen says before the first question: the short version,
 * Learn more, and the disclaimer.
 */
export const SSA_INTRO = {
  short:
    "**A share subscription agreement, for an investor coming into your company.**\n\nAnswer plain-English questions about the shares, completion, warranties and undertakings — and FD AI puts together a share subscription agreement in the version you choose: Basic, Standard or Complex.\n\nIt is in Beta and written for a Singapore company and a simple investment (up to about $750k, company under three years old). It takes about 10 minutes; anything you skip takes the usual answer.",
  learn_more: {
    what_you_get: [
      "A share subscription agreement naming the company, the founders and each investor, with each investor’s shares and subscription amount in a schedule",
      "Basic: subscription, completion, confidentiality and governing law",
      "Standard: adds signed resolutions and warranties on authority, existence, compliance and title",
      "Complex: adds conditions, fundamental warranties with caps on liability, undertakings, a capital table and up to five investors",
      "Points your lawyer should check, listed beside the agreement, and a Word file",
    ],
    good_to_know: [
      "Preference shares need their rights written into the Constitution — speak to an FD lawyer about amending it.",
      "If existing shares are being sold to the investor, use the Share Purchase Agreement instead.",
      "Board seats and veto rights for investors belong in a shareholders agreement.",
      "Beta: the wording follows the Singapore VIMA model, simplified to the FD Lite versions. Have a lawyer read it in full.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft share subscription agreement. It is not legal advice. We recommend having a lawyer check it before it is signed.",
} as const;
