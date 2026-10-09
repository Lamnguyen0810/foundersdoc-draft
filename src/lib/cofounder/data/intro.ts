/**
 * What the co-founder screen says before the first question: the short
 * version, Learn more, and the disclaimer. Plain words for founders
 * setting out how they will run the startup together.
 */
export const COFOUNDER_INTRO = {
  short:
    "**A co-founder agreement, from our lawyers’ own master.**\n\nAnswer twenty-five plain-English questions — who decides, how the shares are split and vest, what happens if someone stops pulling their weight or leaves — and FD AI puts together a co-founder agreement from Founders Doc’s master.\n\nIt is written for a Singapore company, incorporated or not yet. It takes about 15 minutes, and anything you skip takes the usual answer.",
  learn_more: {
    what_you_get: [
      "A co-founders agreement naming every co-founder, with the initial shareholding, vesting, roles and decision-making",
      "Good leaver and bad leaver terms, deadlock, share transfers and new issues, set by your answers",
      "Points your lawyer should check — for example a 50:50 split with no tie-breaker — listed beside the agreement",
      "A Word file, ready to sign",
    ],
    good_to_know: [
      "Agree this early, while everyone is still on good terms. It is much harder once there is money or a dispute.",
      "Investors usually expect founder shares to vest and the company to own the IP. Answers that go the other way are flagged.",
      "A co-founder agreement binds the co-founders. Once investors come in, a shareholders’ agreement and the constitution take over much of it.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft co-founder agreement. It is not legal advice. We recommend having a lawyer check it before it is signed.",
} as const;
