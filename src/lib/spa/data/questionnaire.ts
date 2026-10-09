/**
 * The Share Purchase Agreement questionnaire.
 *
 * There is no firm question bank for the SPA (nothing in #fdl-spa beyond
 * "get SPA up"), so these questions were written for FD AI from the one
 * precedent available — a buyer-side SPA for the purchase of 100% of a
 * Singapore company from one seller (SPA_Precedent_REDACTED.docx) — in the
 * style of the firm's other TF question banks: a short heading, the
 * question, a Pro Tip, the recommended option marked.
 *
 * Defaults follow the precedent where it takes a general position (5 years'
 * warranty cover, 6 for tax and compliance, SIAC arbitration, the Buyer may
 * terminate for breach or a Material Adverse Change). Where the precedent's
 * position was tied to that deal (the price paid in fund units, a 3-year
 * restraint running from a separate investment agreement, stamp duty split
 * equally) the default is the usual Singapore position instead, and the
 * change is listed in Admin → Questions → Share Purchase Agreement.
 *
 * Data, not code: the screen asks these in order, the server checks them,
 * the assembler reads them by id, and the admin console lists them.
 */

const NUM = { pattern: "^(?!\\s*\\d{1,3}(\\.\\d+)?\\s*%?\\s*$)", message: "A number, please (e.g. 70)." };

export const SPA_QUESTIONNAIRE = {
  id: "FD_SPA_QUESTIONNAIRE",
  version: "1.0",
  for_master: "SPA precedent (redacted), generalised for FD AI",
  status: "Beta",
  questions: [
    /* ── the deal ── */
    {
      id: "P1",
      key: "seller_count",
      section: "The deal",
      type: "single_choice",
      required: true,
      text: "Sellers. How many people or companies are selling shares?",
      help: "You’ll give each seller’s details next — name, ID, address, the shares they sell and their part of the price.",
      options: ["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n })),
    },
    {
      id: "P2",
      key: "buyer_kind",
      section: "The deal",
      type: "single_choice",
      required: true,
      default: "company",
      text: "Buyer. Is the buyer a company or an individual?",
      options: [
        { value: "company", label: "A company", recommended: true },
        { value: "individual", label: "An individual" },
      ],
    },
    {
      id: "P3",
      key: "stake",
      section: "The deal",
      type: "single_choice",
      required: true,
      default: "all",
      text: "Shares Sold. Is the buyer buying the whole company?",
      help: "Pro Tip: The warranties about the business are standard when a buyer takes over the whole company; a buyer of a minority stake often accepts fewer.",
      options: [
        { value: "all", label: "Yes – 100% of the issued shares", recommended: true },
        { value: "part", label: "No – only some of the shares" },
      ],
    },
    {
      id: "P4",
      key: "currency",
      section: "The deal",
      type: "single_choice",
      required: true,
      default: "SGD",
      text: "Currency. What currency is the price in?",
      options: [
        { value: "SGD", label: "Singapore dollars (S$)", recommended: true },
        { value: "USD", label: "US dollars (US$)" },
      ],
    },
    {
      id: "P5",
      key: "payment",
      section: "The price",
      type: "single_choice",
      required: true,
      default: "closing",
      text: "Payment. How will the price be paid?",
      help: "Pro Tip: Holding back part of the price after Closing gives the buyer something to claim against if a warranty turns out to be wrong.",
      options: [
        { value: "closing", label: "All of it at Closing", recommended: true },
        { value: "deferred", label: "Part at Closing, the rest later" },
        { value: "deposit", label: "A deposit when the agreement is signed, the balance at Closing" },
      ],
    },
    {
      id: "P5a",
      key: "closing_pct",
      section: "The price",
      type: "single_choice",
      required: true,
      default: "70",
      show_if: { q: "P5", eq: "deferred" },
      text: "How much is paid at Closing?",
      options: [
        { value: "50", label: "50%" },
        { value: "70", label: "70%", recommended: true },
        { value: "80", label: "80%" },
        { value: "90", label: "90%" },
      ],
    },
    {
      id: "P5b",
      key: "deferred_when",
      section: "The price",
      type: "single_choice",
      required: true,
      default: "6",
      show_if: { q: "P5", eq: "deferred" },
      text: "When is the rest paid?",
      options: [
        { value: "3", label: "3 months after Closing" },
        { value: "6", label: "6 months after Closing", recommended: true },
        { value: "12", label: "12 months after Closing" },
      ],
    },
    {
      id: "P5c",
      key: "deposit_pct",
      section: "The price",
      type: "single_choice",
      required: true,
      default: "10",
      show_if: { q: "P5", eq: "deposit" },
      text: "How large is the deposit?",
      options: [
        { value: "5", label: "5%" },
        { value: "10", label: "10%", recommended: true },
        { value: "20", label: "20%" },
      ],
    },
    {
      id: "P6",
      key: "cash_free",
      section: "The price",
      type: "single_choice",
      required: true,
      default: "no",
      text: "Price Adjustment. Should the price be adjusted for the company’s cash and debts at Closing (“cash-free, debt-free”)?",
      help: "Pro Tip: With an adjustment the price goes up by the company’s cash and down by its debts, worked out from accounts drawn up to Closing. Without one, the price is fixed.",
      options: [
        { value: "no", label: "No – a fixed price", recommended: true },
        { value: "yes", label: "Yes – adjust for cash and debt" },
      ],
    },

    /* ── before Closing ── */
    {
      id: "P7",
      key: "conditions",
      section: "Before Closing",
      type: "multi_choice",
      required: true,
      default: ["warranties", "no_breach", "approvals", "no_mac"],
      text: "Conditions. What must happen before the sale can close? (You can select multiple options.)",
      help: "Pro Tip: If the agreement is signed and closed on the same day, choose “None”.",
      options: [
        { value: "due_diligence", label: "The buyer is satisfied with its due diligence" },
        { value: "warranties", label: "The sellers’ warranties are still true at Closing", recommended: true },
        { value: "no_breach", label: "No serious breach of the agreement by the sellers", recommended: true },
        { value: "approvals", label: "Board and shareholder approvals for the transfer (and waivers of any pre-emption rights)", recommended: true },
        { value: "no_mac", label: "No Material Adverse Change in the company", recommended: true },
        { value: "consents", label: "Consents from the company’s contract counterparties, where a change of owner needs one" },
        { value: "key_people", label: "Key people have signed new employment contracts" },
        { value: "none", label: "None – signing and Closing on the same day", exclusive: true },
      ],
    },
    {
      id: "P7a",
      key: "key_people",
      section: "Before Closing",
      type: "free_text_list",
      required: true,
      max_items: 5,
      max_length: 80,
      show_if: { q: "P7", has: "key_people" },
      text: "Who are the key people?",
      placeholder: "e.g. Tan Wei Ming, Chief Technology Officer",
      help: "They are listed in a schedule to the agreement.",
    },
    {
      id: "P8",
      key: "longstop",
      section: "Before Closing",
      type: "single_choice",
      required: true,
      default: "3",
      show_if: { q: "P7", lacks: "none" },
      text: "Long-stop Date. If the conditions are not met, when does the deal fall away?",
      options: [
        { value: "1", label: "1 month after signing" },
        { value: "3", label: "3 months after signing", recommended: true },
        { value: "6", label: "6 months after signing" },
      ],
    },
    {
      id: "P9",
      key: "closing_after",
      section: "Before Closing",
      type: "single_choice",
      required: true,
      default: "10",
      show_if: { q: "P7", lacks: "none" },
      text: "Closing Date. How soon after the conditions are met does the sale close?",
      options: [
        { value: "5", label: "Within 5 Business Days" },
        { value: "10", label: "Within 10 Business Days", recommended: true },
        { value: "20", label: "Within 20 Business Days" },
      ],
    },
    {
      id: "P10",
      key: "conduct",
      section: "Before Closing",
      type: "single_choice",
      required: true,
      default: "yes",
      show_if: { q: "P7", lacks: "none" },
      text: "Running the Company. Until Closing, should the sellers keep the company running as usual and need the buyer’s consent for anything out of the ordinary?",
      help: "Pro Tip: This stops the business changing between signing and Closing — no new debts, share issues or dividends without the buyer’s say-so.",
      options: [
        { value: "yes", label: "Yes", recommended: true },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "P11",
      key: "termination",
      section: "Before Closing",
      type: "multi_choice",
      required: true,
      default: ["warranty", "undertakings", "mac"],
      show_if: { q: "P7", lacks: "none" },
      text: "Walking Away. When may the buyer end the agreement before Closing? (You can select multiple options.)",
      options: [
        { value: "warranty", label: "A warranty turns out to be materially untrue", recommended: true },
        { value: "undertakings", label: "The sellers break their pre-Closing promises and do not put it right within 10 Business Days", recommended: true },
        { value: "mac", label: "A Material Adverse Change happens", recommended: true },
        { value: "none", label: "Only if the conditions are not met by the long-stop date", exclusive: true },
      ],
    },

    /* ── Closing ── */
    {
      id: "P12",
      key: "resign",
      section: "Closing",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Directors. Should the sellers who are directors resign at Closing?",
      help: "Pro Tip: The buyer can then appoint its own board. A seller staying on to help can be re-appointed or employed.",
      options: [
        { value: "yes", label: "Yes – if the buyer asks", recommended: true },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "P13",
      key: "waiver",
      section: "Closing",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Claims Against the Company. Should each seller confirm at Closing that they have no claims against the company (for unpaid salary, loans, fees and so on)?",
      help: "Pro Tip: The buyer takes over a company with no surprise debts to the people who sold it.",
      options: [
        { value: "yes", label: "Yes", recommended: true },
        { value: "no", label: "No" },
      ],
    },

    /* ── warranties and claims ── */
    {
      id: "P14",
      key: "warranty_scope",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "full",
      text: "Warranties. What should the sellers promise about the company?",
      help: "Pro Tip: Full warranties cover the accounts, assets, IP, contracts, employees, tax, litigation and insolvency. Title-only covers the shares themselves: who owns them, that they are fully paid and free of claims.",
      options: [
        { value: "full", label: "Full warranties about the shares and the business", recommended: true },
        { value: "title", label: "Title only – about the shares, not the business" },
      ],
    },
    {
      id: "P15",
      key: "survival",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "5",
      text: "Claims Period. For how long after Closing can the buyer claim under the warranties?",
      options: [
        { value: "1", label: "1 year" },
        { value: "2", label: "2 years" },
        { value: "3", label: "3 years" },
        { value: "5", label: "5 years", recommended: true },
      ],
    },
    {
      id: "P15a",
      key: "tax_survival",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "6",
      show_if: { q: "P14", eq: "full" },
      text: "And for tax and legal compliance?",
      help: "Pro Tip: Tax can be reassessed for earlier years, so tax claims usually get a longer period than the other warranties.",
      options: [
        { value: "same", label: "The same period" },
        { value: "5", label: "5 years" },
        { value: "6", label: "6 years", recommended: true },
      ],
    },
    {
      id: "P16",
      key: "cap",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "none",
      text: "Cap on Claims. Should the sellers’ total liability be capped?",
      help: "Pro Tip: Sellers usually ask for a cap at the price they receive; fraud is never capped.",
      options: [
        { value: "none", label: "No cap", recommended: true },
        { value: "price", label: "Capped at the price" },
        { value: "pct", label: "Capped at a percentage of the price" },
      ],
    },
    { id: "P16a", key: "cap_pct", section: "Warranties", type: "free_text", required: true, max_length: 5, show_if: { q: "P16", eq: "pct" }, text: "What percentage of the price?", placeholder: "e.g. 50", reject: [NUM] },
    {
      id: "P17",
      key: "liability",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "several",
      show_if: { q: "P1", not_in: ["1"] },
      text: "Liability Between Sellers. If more than one seller, how are they liable?",
      help: "Pro Tip: “Several” means each seller answers for their own share of a claim; “joint and several” lets the buyer claim the whole amount from any one of them.",
      options: [
        { value: "several", label: "Each for their own share (several)", recommended: true },
        { value: "joint", label: "Each for the whole (joint and several)" },
      ],
    },
    {
      id: "P18",
      key: "indemnities",
      section: "Warranties",
      type: "multi_choice",
      required: true,
      default: ["tax"],
      text: "Indemnities. Should the sellers also cover the buyer, pound for pound, for any of these? (You can select multiple options.)",
      help: "Pro Tip: An indemnity is a promise to pay back a loss, whether or not a warranty was broken.",
      options: [
        { value: "tax", label: "Tax and penalties for the period before Closing", recommended: true },
        { value: "registers", label: "Statutory registers that were not kept, or ACRA filings made late, before Closing" },
        { value: "other", label: "Something specific – please describe" },
        { value: "none", label: "None", exclusive: true },
      ],
    },
    { id: "P18a", key: "indemnity_other", section: "Warranties", type: "free_text", required: true, max_length: 300, show_if: { q: "P18", has: "other" }, text: "What should the sellers indemnify the buyer for?", placeholder: "e.g. the claim brought by a former distributor in 2025" },

    /* ── after Closing ── */
    {
      id: "P19",
      key: "restraints",
      section: "After Closing",
      type: "multi_choice",
      required: true,
      default: ["no_compete", "no_poach", "no_clients"],
      text: "Restrictions on the Sellers. After Closing, what should the sellers not do? (You can select multiple options.)",
      help: "Pro Tip: Singapore courts enforce these only as far as reasonably needed to protect the goodwill the buyer paid for.",
      options: [
        { value: "no_compete", label: "Compete with the business", recommended: true },
        { value: "no_poach", label: "Poach the company’s staff", recommended: true },
        { value: "no_clients", label: "Approach its customers or suppliers", recommended: true },
        { value: "none", label: "None", exclusive: true },
      ],
    },
    {
      id: "P19a",
      key: "restraint_years",
      section: "After Closing",
      type: "single_choice",
      required: true,
      default: "2",
      show_if: { q: "P19", lacks: "none" },
      text: "For how long after Closing?",
      options: [
        { value: "1", label: "1 year" },
        { value: "2", label: "2 years", recommended: true },
        { value: "3", label: "3 years" },
      ],
    },

    /* ── costs and disputes ── */
    {
      id: "P20",
      key: "stamp_duty",
      section: "General",
      type: "single_choice",
      required: true,
      default: "buyer",
      text: "Stamp Duty. Who pays the stamp duty on the share transfer?",
      help: "Pro Tip: In Singapore stamp duty on a share transfer (0.2% of the price or the net asset value, whichever is higher) is paid by the buyer unless the parties agree otherwise.",
      options: [
        { value: "buyer", label: "The buyer", recommended: true },
        { value: "equal", label: "Shared equally" },
        { value: "sellers", label: "The sellers" },
      ],
    },
    {
      id: "P21",
      key: "disputes",
      section: "General",
      type: "single_choice",
      required: true,
      default: "siac",
      text: "Disputes. How should disputes be resolved?",
      options: [
        { value: "siac", label: "Arbitration in Singapore (SIAC)", recommended: true },
        { value: "courts", label: "The Singapore courts" },
      ],
    },
  ],
} as const;
