/**
 * The Convertible Loan Agreement questionnaire.
 *
 * The base is the Founders Doc master (Convertible Loan Agreement — Master
 * Template). Every square-bracketed choice and every drafting note in the
 * master is a question here; Schedule 3 (Jurisdiction Rider) is the
 * governing-law question, whose answer fills the data protection law, the
 * third-party rights statute, the courts or arbitration and the local time.
 *
 * The first question asks whose side the user is on — the company raising
 * the money or the investor. Where the two would answer differently (a
 * discount, a payment default, the share count the cap is divided by), the
 * usual answer follows the side (default_by). Otherwise it is the master's
 * or the market's usual position.
 *
 * Data, not code: the screen asks these in order, the server checks them,
 * the assembler reads them by id, and the admin console lists them.
 */

const NUM = { pattern: "^(?!\\s*\\d[\\d,]*(\\.\\d+)?\\s*$)", message: "A number only, please (e.g. 250,000)." };
const PCT = { pattern: "^(?!\\s*\\d{1,2}(\\.\\d{1,2})?\\s*%?\\s*$)", message: "A percentage only, please (e.g. 8 or 8.5)." };
const INT = { pattern: "^(?!\\s*\\d{1,2}\\s*$)", message: "A whole number only, please (e.g. 3)." };
const SIDE = (company: unknown, investor: unknown) => ({ q: "CL1", map: { company, investor } });

export const CLN_QUESTIONNAIRE = {
  id: "FD_CLN_QUESTIONNAIRE",
  version: "1.0",
  for_master: "FD Convertible Loan Agreement — Master Template",
  status: "Beta",
  questions: [
    /* ── the deal ── */
    {
      id: "CL1",
      key: "side",
      section: "The deal",
      type: "single_choice",
      required: true,
      text: "Your Side. Are you the company raising the money, or the investor?",
      help: "Pro Tip: The agreement stays fair to both sides, but where the usual position differs — a discount on conversion, how quickly a missed payment is a default, whether the investor's documents must match the next round — the usual answer leans to your side. You can change any of them.",
      options: [
        { value: "company", label: "The company – we are raising the money" },
        { value: "investor", label: "The investor – I am lending the money" },
      ],
    },
    {
      id: "CL2",
      key: "investor_kind",
      section: "The deal",
      type: "single_choice",
      required: true,
      default: "company",
      text: "Investor. Is the investor a company or an individual?",
      options: [
        { value: "company", label: "A company or fund", recommended: true },
        { value: "individual", label: "An individual" },
      ],
    },
    {
      id: "CL3",
      key: "law",
      section: "The deal",
      type: "single_choice",
      required: true,
      default: "sg",
      text: "Governing Law. Which country's law governs the agreement?",
      help: "Pro Tip: Usually where the company is incorporated. The answer sets the data protection law, the third-party rights statute, the courts or arbitration and the local time. Outside Singapore, have a lawyer qualified there confirm it.",
      options: [
        { value: "sg", label: "Singapore", recommended: true },
        { value: "ew", label: "England and Wales" },
        { value: "hk", label: "Hong Kong" },
        { value: "de", label: "Delaware (United States)" },
        { value: "ny", label: "New York (United States)" },
        { value: "other", label: "Another country – type it" },
      ],
    },
    { id: "CL3a", key: "law_other", section: "The deal", type: "free_text", required: true, max_length: 60, show_if: { q: "CL3", eq: "other" }, text: "Which country's law?", placeholder: "e.g. Malaysia" },
    {
      id: "CL4",
      key: "currency",
      section: "The deal",
      type: "single_choice",
      required: true,
      default: "SGD",
      text: "Currency. What currency is the loan in?",
      options: [
        { value: "SGD", label: "Singapore dollars (S$)", recommended: true },
        { value: "USD", label: "US dollars (US$)" },
        { value: "GBP", label: "Pounds sterling (£)" },
        { value: "HKD", label: "Hong Kong dollars (HK$)" },
        { value: "EUR", label: "Euros (€)" },
      ],
    },
    {
      id: "CL5",
      key: "principal",
      section: "The deal",
      type: "free_text",
      required: true,
      max_length: 20,
      text: "Amount. How much is the investor lending?",
      placeholder: "e.g. 250,000",
      reject: [NUM],
    },
    {
      id: "CL6",
      key: "purpose",
      section: "The deal",
      type: "single_choice",
      required: true,
      default: "general",
      text: "Purpose. What is the money for?",
      help: "Pro Tip: A stated purpose lets the investor object if the money is used for something else. Most convertible loans use the broad wording.",
      options: [
        { value: "general", label: "Working capital and general corporate purposes", recommended: true },
        { value: "other", label: "Something specific – type it" },
        { value: "none", label: "No purpose clause" },
      ],
    },
    { id: "CL6a", key: "purpose_text", section: "The deal", type: "free_text", required: true, max_length: 200, show_if: { q: "CL6", eq: "other" }, text: "What is the money for?", placeholder: "e.g. the development and launch of the Company's mobile app" },

    /* ── interest and maturity ── */
    {
      id: "CL7",
      key: "interest",
      section: "Interest and maturity",
      type: "single_choice",
      required: true,
      default: "simple",
      text: "Interest. Does the loan carry interest?",
      help: "Pro Tip: Interest accrues and is paid at maturity — or converts into shares with the loan. Many start-up convertible loans carry a low rate, often between 0% and 8% a year.",
      options: [
        { value: "simple", label: "Simple interest", recommended: true },
        { value: "compound", label: "Interest compounded annually" },
        { value: "none", label: "Interest-free" },
      ],
    },
    { id: "CL7a", key: "rate", section: "Interest and maturity", type: "free_text", required: true, max_length: 6, show_if: { q: "CL7", in: ["simple", "compound"] }, text: "Rate a year (%)?", placeholder: "e.g. 5", reject: [PCT] },
    {
      id: "CL8",
      key: "maturity",
      section: "Interest and maturity",
      type: "single_choice",
      required: true,
      default: "2",
      text: "Maturity. When does the loan mature, if it has not converted?",
      help: "Pro Tip: On the Maturity Date the investor may convert at the cap price or be repaid. Two years is common; a longer term gives the company more time to raise its next round.",
      options: [
        { value: "1", label: "1 year" },
        { value: "2", label: "2 years", recommended: true },
        { value: "3", label: "3 years" },
        { value: "other", label: "Another number of years" },
      ],
    },
    { id: "CL8a", key: "maturity_years", section: "Interest and maturity", type: "free_text", required: true, max_length: 2, show_if: { q: "CL8", eq: "other" }, text: "How many years?", placeholder: "e.g. 4", reject: [INT] },
    {
      id: "CL9",
      key: "pay_default",
      section: "Interest and maturity",
      type: "single_choice",
      required: true,
      default_by: SIDE("10", "5"),
      text: "Missed Payment. Is a missed payment an Event of Default?",
      help: "Pro Tip: An Event of Default lets the investor call in the whole loan at once. The master always includes insolvency and illegality; a missed payment is the optional third.",
      options: [
        { value: "5", label: "Default if not paid within 5 Business Days" },
        { value: "10", label: "Default if not paid within 10 Business Days" },
        { value: "none", label: "Not a default – only insolvency and illegality are" },
      ],
    },
    {
      id: "CL10",
      key: "partial",
      section: "Interest and maturity",
      type: "single_choice",
      required: true,
      default: "any",
      text: "Early Repayment. The company may repay early if both sides agree. Must a partial repayment be a round sum?",
      options: [
        { value: "any", label: "Any amount", recommended: true },
        { value: "multiple", label: "In multiples of a set amount" },
      ],
    },
    { id: "CL10a", key: "multiple", section: "Interest and maturity", type: "free_text", required: true, max_length: 20, show_if: { q: "CL10", eq: "multiple" }, text: "In multiples of how much?", placeholder: "e.g. 10,000", reject: [NUM] },

    /* ── conversion ── */
    {
      id: "CL11",
      key: "cap",
      section: "Conversion",
      type: "free_text",
      required: true,
      max_length: 20,
      text: "Valuation Cap. What company valuation sets the conversion price?",
      help: "Pro Tip: The loan converts at no more than the price this valuation gives — the investor's reward for coming in early. In a qualifying round they get the lower of this price and the round price.",
      placeholder: "e.g. 5,000,000",
      reject: [NUM],
    },
    {
      id: "CL12",
      key: "basis",
      section: "Conversion",
      type: "single_choice",
      required: true,
      default: "post",
      text: "Cap Basis. Is the valuation cap before or after the money comes in?",
      help: "Pro Tip: Post-money (the valuation including this loan and other convertibles) makes the investor's stake on conversion easier to predict. Pre-money is better for the investor at the same number.",
      options: [
        { value: "post", label: "Post-money", recommended: true },
        { value: "pre", label: "Pre-money" },
      ],
    },
    {
      id: "CL13",
      key: "discount",
      section: "Conversion",
      type: "single_choice",
      required: true,
      default_by: SIDE("none", "20"),
      text: "Discount. In a qualifying round, does the investor get a discount on the round price?",
      help: "Pro Tip: The investor converts at the lower of the cap price and the round price less this discount. 15–20% is common; with no discount the cap does the work.",
      options: [
        { value: "none", label: "No discount" },
        { value: "10", label: "10%" },
        { value: "15", label: "15%" },
        { value: "20", label: "20%" },
        { value: "other", label: "Another percentage" },
      ],
    },
    { id: "CL13a", key: "discount_other", section: "Conversion", type: "free_text", required: true, max_length: 5, show_if: { q: "CL13", eq: "other" }, text: "The discount (%)?", placeholder: "e.g. 25", reject: [PCT] },
    {
      id: "CL14",
      key: "qfe",
      section: "Conversion",
      type: "single_choice",
      required: true,
      default: "raise",
      text: "Qualifying Round. Which new round triggers conversion before maturity?",
      help: "Pro Tip: The minimum-raise test is the more common: any round of at least a set size counts. The master's other test counts only a round priced below the valuation cap.",
      options: [
        { value: "raise", label: "A round raising at least a set amount", recommended: true },
        { value: "down", label: "Only a round at a valuation below the cap" },
      ],
    },
    { id: "CL14a", key: "min_raise", section: "Conversion", type: "free_text", required: true, max_length: 20, show_if: { q: "CL14", eq: "raise" }, text: "The minimum amount the round must raise?", placeholder: "e.g. 1,000,000", reject: [NUM] },
    {
      id: "CL15",
      key: "esop",
      section: "Conversion",
      type: "single_choice",
      required: true,
      default: "10",
      text: "Option Pool. Shares issued under an option plan do not trigger conversion, up to what share of the company?",
      options: [
        { value: "10", label: "10%", recommended: true },
        { value: "15", label: "15%" },
        { value: "20", label: "20%" },
      ],
    },
    {
      id: "CL16",
      key: "cofounders",
      section: "Conversion",
      type: "free_text_list",
      required: false,
      max_items: 6,
      text: "Co-Founders. Who are the co-founders? Shares issued to them do not trigger conversion. Skip to leave it to the Board.",
      placeholder: "One name at a time",
    },
    {
      id: "CL17",
      key: "auto",
      section: "Conversion",
      type: "single_choice",
      required: true,
      default: "elect",
      text: "Election. Does the loan convert only if the investor chooses to?",
      help: "Pro Tip: In the master the investor elects by an Exercise Notice; if they do not, the loan is repaid. Many companies prefer conversion in a qualifying round to be automatic, so the round's cap table is certain.",
      options: [
        { value: "elect", label: "The investor chooses each time", recommended: true },
        { value: "auto", label: "Automatic in a qualifying round – the investor chooses otherwise" },
      ],
    },
    {
      id: "CL18",
      key: "exercise_days",
      section: "Conversion",
      type: "single_choice",
      required: true,
      default: "10",
      text: "Exercise Period. How long does the investor have to send the Exercise Notice?",
      options: [
        { value: "10", label: "10 Business Days", recommended: true },
        { value: "15", label: "15 Business Days" },
        { value: "20", label: "20 Business Days" },
      ],
    },
    {
      id: "CL19",
      key: "mfn",
      section: "Conversion",
      type: "single_choice",
      required: true,
      default_by: SIDE("no", "yes"),
      text: "Round Documents. Must the documents the investor signs on conversion be no less favourable than the new investors' terms?",
      options: [
        { value: "yes", label: "No less favourable than the round's terms" },
        { value: "no", label: "Whatever is required to convert" },
      ],
    },
    {
      id: "CL20",
      key: "diluted",
      section: "Conversion",
      type: "single_choice",
      required: true,
      default_by: SIDE("excluding", "including"),
      text: "Share Count. Is the cap divided by a share count that includes options and the option pool?",
      help: "Pro Tip: Including them means more shares in the count, a lower price per share and more shares for the investor. Excluding them is better for the company.",
      options: [
        { value: "including", label: "Including options, warrants and the option pool" },
        { value: "excluding", label: "Issued shares only – excluding options and the pool" },
      ],
    },

    /* ── the investor and disputes ── */
    {
      id: "CL21",
      key: "status",
      section: "Investor and disputes",
      type: "single_choice",
      required: true,
      default: "accredited",
      text: "Investor Status. What does the investor confirm they are, for the securities laws?",
      help: "Pro Tip: An offer of shares to the public needs a prospectus; offers to accredited, institutional or professional investors usually do not. Match this to the exemption relied on.",
      options: [
        { value: "accredited", label: "An accredited investor", recommended: true },
        { value: "institutional", label: "An institutional investor" },
        { value: "professional", label: "A sophisticated or professional investor" },
        { value: "none", label: "No status warranty" },
      ],
    },
    {
      id: "CL22",
      key: "disputes",
      section: "Investor and disputes",
      type: "single_choice",
      required: true,
      default: "arbitration",
      text: "Disputes. After 30 days of talks or mediation, how are disputes resolved?",
      help: "Pro Tip: Arbitration is private and easier to enforce abroad; the courts are often cheaper when both sides are in the same country.",
      options: [
        { value: "arbitration", label: "Arbitration, under the governing law's usual rules", recommended: true },
        { value: "courts", label: "The courts of the governing law" },
      ],
    },
  ],
} as const;
