/**
 * What the Services Agreement screen says before the first question: the
 * short version, Learn more, and the disclaimer.
 */
export const SERVICES_INTRO = {
  short:
    "**A services agreement, for providing or buying services.**\n\nAnswer plain-English questions about the services, the fees and who carries the risk — and FD AI puts together a services agreement for a platform or software subscription, or for professional work such as consulting or advisory services.\n\nTell us whether you are the provider or the customer, and the usual answers lean to your side. It is in Beta and written under Singapore law. It takes about 10 minutes; anything you skip takes the usual answer.",
  learn_more: {
    what_you_get: [
      "A services agreement naming the Service Provider and the Customer, with the services and any deliverables in Schedule 1 and the fees in Schedule 2",
      "Platform: access for the customer's users, service changes, uptime and support levels if agreed, and the customer's data protected",
      "Professional services: the standard of work, deliverables and who owns them, retainer, fixed, hourly or success fees",
      "Fees and invoices, fee increases, the liability cap, indemnities, the time limit for claims, insurance, non-solicitation and how to end it",
      "Points your lawyer should check, listed beside the agreement, and a Word file",
    ],
    good_to_know: [
      "The usual answers lean to the side you choose — the other side may ask for changes. Each choice says what it means.",
      "Hiring an individual freelancer? The Contractor Agreement is written for that.",
      "Sharing information before you agree the deal? Sign an NDA first.",
      "Beta: the wording follows two services agreements and FD AI's review of them. Have a lawyer read it in full.",
    ],
  },
  disclaimer:
    "This tool helps you prepare a draft services agreement. It is not legal advice. We recommend having a lawyer check it before it is signed.",
} as const;
