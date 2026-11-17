/**
 * The Loan Agreement questionnaire.
 *
 * There is no FD Lite question bank for the loan agreement. The base is
 * the Founders Doc master (Master Loan Agreement Template — Universal, as
 * updated by Rachel Wong): an individual Borrower, individual Lenders acting
 * through a Lenders' Authorised Representative, tiered simple interest,
 * repayment on request after the Maturity Date or a Change of Control, the
 * Company's representations and quarterly reporting.
 *
 * Four other loan agreements were shared "for the system's reference only",
 * to show the permutations (names redacted, never embedded):
 *
 *   B  a short-form facility agreement (company to company) — purpose, a
 *      single drawdown, a fixed repayment date, interest a year with
 *      interest periods, default interest above the rate, free assignment
 *      by the lender, costs and set-off alternatives;
 *   C  a term loan to a holding company — conditions precedent, a
 *      drawdown request, prepayment on notice, interest a year, a strict
 *      list of events of default and a share pledge (which, as Rachel
 *      notes, is not normal for a loan agreement: offered here only as an
 *      option, never the usual answer, and flagged);
 *   D  a bank loan and security agreement, and E an amendment to another —
 *      a secured facility with covenants; used only for the shape of the
 *      security and default provisions.
 *
 * The first question asks how detailed the agreement should be (LN0):
 *
 *   simple         the essentials, about ten questions: one Lender, no
 *                  connected-company terms, no security, no default
 *                  interest; confidentiality, announcements, the limit on
 *                  liability and further assurances are left out;
 *   standard       the Founders Doc master, with its usual protections;
 *   comprehensive  every option asked — purpose, drawdown, early
 *                  repayment, late-payment interest, security, transfers.
 *
 * A question asked only at some levels says so (asked_at). At the others
 * it is not asked and takes its usual answer, or the answer the level sets
 * (fixed). The wording is the same at every level: the level only decides
 * what is asked, and the simple version leaves the four clauses out.
 *
 * The next question asks whose side the user is on; where the two sides
 * would answer differently, the usual answer follows the side (default_by).
 * Otherwise the usual answer is the master's.
 *
 * Data, not code: the screen asks these in order, the server checks them,
 * the assembler reads them by id, and the admin console lists them.
 *
 * 1.2 (0240), after an outside lawyer's review of the chat and of a draft:
 *   - amounts are read by lib/amount.ts (format: "amount"), so "1.000.000"
 *     is a million and not a blank; the question names the currency; with
 *     several Lenders the amount lent is their total and is not asked again;
 *   - the usual interest is a rate a year (simple, day by day); tiered stays
 *     as a choice; a floating rate (SORA or Term SOFR plus a margin) is added;
 *   - drawdown on the Borrower's request; early repayment with a break fee;
 *   - three ways to treat defaults (balanced is the old lender-friendly list;
 *     lender-friendly now has no grace for a missed payment and a material
 *     adverse change default);
 *   - change of control at more than 50% or more than 75%;
 *   - the costs cap has its own currency and says whether GST and
 *     disbursements are inside it.
 */

const NUM = { pattern: "^(?!\\s*\\d[\\d,]*(\\.\\d+)?\\s*$)", message: "A number only, please (e.g. 18)." };
const PCT = { pattern: "^(?!\\s*\\d{1,2}(\\.\\d{1,2})?\\s*%?\\s*$)", message: "A percentage only, please (e.g. 8 or 8.5)." };
const SIDE = (lender: unknown, borrower: unknown) => ({ q: "LN1", map: { lender, borrower } });
const NOT_SIMPLE = ["standard", "comprehensive"] as const;
const ONLY_COMPREHENSIVE = ["comprehensive"] as const;
const CONNECTED = { any: [{ q: "LN3", eq: "company" }, { q: "LN4", eq: "yes" }] } as const;

export const LOAN_QUESTIONNAIRE = {
  id: "FD_LOAN_QUESTIONNAIRE",
  version: "1.2",
  for_master: "FD Master Loan Agreement Template (Universal), with four reference loan agreements (redacted)",
  status: "Beta",
  questions: [
    /* ── the loan ── */
    {
      id: "LN0",
      key: "level",
      section: "The loan",
      type: "scale",
      required: true,
      default: "standard",
      text: "Level of Detail. How detailed should the agreement be?",
      help: "Pro Tip: Move the slider to choose. A fuller level asks a few more questions and adds the master's fuller protections. You can change the level later from the list on the right; your answers are kept.",
      options: [
        { value: "simple", label: "Simple" },
        { value: "standard", label: "Standard", recommended: true },
        { value: "comprehensive", label: "Comprehensive" },
      ],
    },
    {
      id: "LN1",
      key: "side",
      section: "The loan",
      type: "single_choice",
      required: true,
      text: "Your Side. Are you lending the money, or borrowing it?",
      help: "Pro Tip: The agreement stays fair to both sides, but where the usual position differs — how strictly defaults are treated, how repayment is triggered, a cap on the Borrower's liability — the usual answer will lean to your side. You can change any of them.",
      options: [
        { value: "lender", label: "I am the Lender (or one of the Lenders)" },
        { value: "borrower", label: "I am the Borrower" },
      ],
    },
    {
      id: "LN2",
      asked_at: NOT_SIMPLE,
      fixed: { simple: "one" },
      key: "lenders",
      section: "The loan",
      type: "single_choice",
      required: true,
      default: "one",
      text: "Lenders. How many lenders are there?",
      help: "Pro Tip: With several lenders, they lend together and act through one Lenders' Authorised Representative, who gives notices and agrees changes for all of them — the Borrower deals with one person.",
      options: [
        { value: "one", label: "One lender", recommended: true },
        { value: "several", label: "Several lenders – lending together, through an authorised representative" },
      ],
    },
    {
      id: "LN3",
      key: "borrower_kind",
      section: "The loan",
      type: "single_choice",
      required: true,
      text: "Borrower. Is the Borrower an individual or a company?",
      options: [
        { value: "individual", label: "An individual" },
        { value: "company", label: "A company" },
      ],
    },
    {
      id: "LN4",
      asked_at: NOT_SIMPLE,
      fixed: { simple: "no" },
      key: "connected",
      section: "The loan",
      type: "single_choice",
      required: true,
      default: "yes",
      show_if: { q: "LN3", eq: "individual" },
      text: "Connected Company. Is the loan connected to a company the Borrower founded or runs?",
      help: "Pro Tip: A founder often borrows personally to fund their company. If so, the Borrower gives comfort on the company's accounts and business, reports on its next fundraising, and the loan can be called in if the company changes hands.",
      options: [
        { value: "yes", label: "Founder loan – the loan relates to the Borrower's company", recommended: true },
        { value: "no", label: "Personal loan – no company involved" },
      ],
    },
    {
      id: "LN5",
      key: "currency",
      section: "The loan",
      type: "single_choice",
      required: true,
      default: "SGD",
      text: "Currency. What currency is the loan in?",
      options: [
        { value: "SGD", label: "Singapore dollars (S$)", recommended: true },
        { value: "USD", label: "US dollars (US$)" },
      ],
    },
    {
      id: "LN6",
      key: "principal",
      section: "The loan",
      type: "free_text",
      required: true,
      max_length: 24,
      text: "Amount. How much is being lent, in {{currency}}?",
      help: "Pro Tip: Figures only — 50,000, 50000 or 1.5m all work. This agreement is for one lump sum, paid over once.",
      placeholder: "e.g. 50,000",
      format: "amount",
    },
    {
      id: "LN7",
      asked_at: ONLY_COMPREHENSIVE,
      fixed: { simple: "", standard: "" },
      key: "purpose",
      section: "The loan",
      type: "free_text",
      required: false,
      max_length: 300,
      text: "Purpose. What is the money for? Skip if it can be used for anything.",
      help: "Pro Tip: A stated purpose lets the Lender object if the money is used for something else. Keep it broad — e.g. “the working capital of the Company”.",
      placeholder: "e.g. the working capital of the Company",
    },

    /* ── drawdown and term ── */
    {
      id: "LN8",
      asked_at: ONLY_COMPREHENSIVE,
      key: "drawdown",
      section: "Drawdown and term",
      type: "single_choice",
      required: true,
      default: "days5",
      text: "Drawdown. When is the money paid over?",
      help: "Pro Tip: The loan is paid in one go into the Borrower's bank account: this agreement is a term loan, not a revolving facility or a loan drawn in stages. The date can always be moved by agreement in writing (an email will do).",
      options: [
        { value: "signing", label: "On the date of the agreement" },
        { value: "days5", label: "Within five Business Days of signing", recommended: true },
        { value: "request", label: "When the Borrower asks – within five Business Days of its written request" },
        { value: "date", label: "On a set date" },
      ],
    },
    { id: "LN8a", key: "drawdown_date", section: "Drawdown and term", type: "free_text", required: true, max_length: 120, show_if: { q: "LN8", eq: "date" }, text: "Drawdown date?", placeholder: "e.g. 1 December 2026" },
    {
      id: "LN9",
      key: "term",
      section: "Drawdown and term",
      type: "single_choice",
      required: true,
      default: "12",
      text: "Term. When does the loan mature?",
      help: "Pro Tip: The term runs from the day the money is paid over (the Drawdown Date), so a 12-month loan is borrowed for 12 months. The Lender can extend it in writing.",
      options: [
        { value: "6", label: "6 months" },
        { value: "12", label: "12 months", recommended: true },
        { value: "24", label: "24 months" },
        { value: "other", label: "Another period" },
      ],
    },
    { id: "LN9a", key: "term_months", section: "Drawdown and term", type: "free_text", required: true, max_length: 3, show_if: { q: "LN9", eq: "other" }, text: "Term in months?", placeholder: "e.g. 18", reject: [NUM] },
    {
      id: "LN10",
      key: "repayment",
      section: "Drawdown and term",
      type: "single_choice",
      required: true,
      default_by: SIDE("maturity", "demand"),
      text: "Repayment. How is the loan repaid?",
      help: "Pro Tip: On request, the loan runs on after the Maturity Date until the Lender asks for it back, with 30 days to pay — kinder to the Borrower. On the Maturity Date is a fixed deadline. Instalments spread the principal over the term.",
      options: [
        { value: "demand", label: "On request – within 30 days of the Lender asking, on or after the Maturity Date" },
        { value: "maturity", label: "In full on the Maturity Date" },
        { value: "instalments", label: "In equal instalments over the term" },
      ],
    },
    {
      id: "LN10a",
      key: "instalments",
      section: "Drawdown and term",
      type: "single_choice",
      required: true,
      default: "monthly",
      show_if: { q: "LN10", eq: "instalments" },
      text: "Instalments. How often?",
      options: [
        { value: "monthly", label: "Monthly", recommended: true },
        { value: "quarterly", label: "Quarterly" },
      ],
    },
    {
      id: "LN11",
      asked_at: ONLY_COMPREHENSIVE,
      key: "early",
      section: "Drawdown and term",
      type: "single_choice",
      required: true,
      default: "free",
      text: "Early Repayment. Can the Borrower repay early?",
      help: "Pro Tip: A break fee pays the Lender for the interest it loses when the money comes back early. It is common with a fixed or floating rate a year; with tiered or flat interest the Lender is already covered.",
      options: [
        { value: "free", label: "Any time, without penalty – in whole or in part", recommended: true },
        { value: "fee", label: "Any time, with a break fee – no consent needed" },
        { value: "consent", label: "Only with the Lender's consent" },
      ],
    },
    { id: "LN11a", key: "early_fee", section: "Drawdown and term", type: "free_text", required: true, max_length: 6, show_if: { q: "LN11", eq: "fee" }, text: "Break fee (% of the amount repaid early)?", placeholder: "e.g. 2", reject: [PCT] },

    /* ── interest ── */
    {
      id: "LN12",
      key: "interest",
      section: "Interest",
      type: "single_choice",
      required: true,
      default: "annual",
      text: "Interest. How is interest charged?",
      help: "Pro Tip: A fixed rate a year, accruing day by day, is the usual choice for a lump-sum loan. A floating rate follows a benchmark (SORA for Singapore dollars, Term SOFR for US dollars) plus a margin, for a Lender whose own funding cost moves. Tiered interest is a total that steps up the longer the loan is out: it rewards early repayment and suits a short bridge loan. A flat charge is one fixed amount however long the loan runs.",
      options: [
        { value: "annual", label: "A fixed rate a year – simple interest, day by day", recommended: true },
        { value: "floating", label: "A floating rate – a benchmark plus a margin" },
        { value: "tiered", label: "Tiered – a total that steps up at 3 and 6 months" },
        { value: "flat", label: "A flat charge – one fixed percentage of the amount lent" },
        { value: "none", label: "Interest-free" },
      ],
    },
    {
      id: "LN12a",
      key: "tiers",
      section: "Interest",
      type: "single_choice",
      required: true,
      default: "20_25_30",
      show_if: { q: "LN12", eq: "tiered" },
      text: "Tiers. What are the three totals?",
      help: "Pro Tip: These are totals of the amount lent, not rates a year: repaid within 3 months, within 3 to 6 months, after 6 months. The top tier also applies if the Borrower defaults.",
      options: [
        { value: "20_25_30", label: "20% / 25% / 30% – the master's tiers", recommended: true },
        { value: "10_15_20", label: "10% / 15% / 20%" },
        { value: "5_8_10", label: "5% / 8% / 10%" },
        { value: "other", label: "Other tiers" },
      ],
    },
    {
      id: "LN12b",
      key: "tiers_other",
      section: "Interest",
      type: "free_text",
      required: true,
      max_length: 30,
      show_if: { all: [{ q: "LN12", eq: "tiered" }, { q: "LN12a", eq: "other" }] },
      text: "The three totals, lowest first?",
      placeholder: "e.g. 12, 18, 24",
      reject: [{ pattern: "^(?!\\s*\\d{1,2}(\\.\\d)?\\s*%?\\s*[,/ ]\\s*\\d{1,2}(\\.\\d)?\\s*%?\\s*[,/ ]\\s*\\d{1,2}(\\.\\d)?\\s*%?\\s*$)", message: "Three percentages, please (e.g. 12, 18, 24)." }],
    },
    { id: "LN12c", key: "rate", section: "Interest", type: "free_text", required: true, max_length: 6, show_if: { q: "LN12", eq: "annual" }, text: "Rate a year (%)?", placeholder: "e.g. 8", reject: [PCT] },
    {
      id: "LN12d",
      asked_at: NOT_SIMPLE,
      key: "interest_paid",
      section: "Interest",
      type: "single_choice",
      required: true,
      default: "end",
      show_if: { q: "LN12", eq: "annual" },
      text: "Interest Payments. When is the interest paid?",
      options: [
        { value: "end", label: "With the principal, when the loan is repaid", recommended: true },
        { value: "quarterly", label: "Every three months, in arrears" },
      ],
    },
    { id: "LN12e", key: "flat", section: "Interest", type: "free_text", required: true, max_length: 6, show_if: { q: "LN12", eq: "flat" }, text: "Flat charge (% of the amount lent)?", placeholder: "e.g. 10", reject: [PCT] },
    {
      id: "LN12f",
      key: "margin",
      section: "Interest",
      type: "free_text",
      required: true,
      max_length: 6,
      show_if: { q: "LN12", eq: "floating" },
      text: "Margin over the benchmark (% a year)?",
      help: "Pro Tip: The rate is the benchmark plus this margin, reset every three months: 3-month Compounded SORA for a Singapore dollar loan, 3-month Term SOFR for a US dollar loan. Interest is paid at the end of each three-month period.",
      placeholder: "e.g. 3",
      reject: [PCT],
    },
    {
      id: "LN13",
      asked_at: ONLY_COMPREHENSIVE,
      fixed: { simple: "none" },
      key: "default_interest",
      section: "Interest",
      type: "single_choice",
      required: true,
      show_if: { q: "LN12", not_in: ["tiered"] },
      default_by: { q: "LN12", map: { annual: "plus2", floating: "plus2", flat: "none", none: "none" } },
      text: "Late Payment. Is extra interest charged on overdue amounts?",
      help: "Pro Tip: Default interest compensates the Lender for late payment. It must be a genuine estimate of loss, not a penalty — 2% a year above the normal rate is the market standard.",
      options: [
        { value: "plus2", label: "2% a year above the rate – the market standard" },
        { value: "fixed", label: "A set rate a year" },
        { value: "none", label: "No extra interest" },
      ],
    },
    { id: "LN13a", key: "default_rate", section: "Interest", type: "free_text", required: true, max_length: 6, show_if: { all: [{ q: "LN12", not_in: ["tiered"] }, { q: "LN13", eq: "fixed" }] }, text: "Rate a year on overdue amounts (%)?", placeholder: "e.g. 8", reject: [PCT] },

    /* ── protections ── */
    {
      id: "LN14",
      asked_at: ONLY_COMPREHENSIVE,
      key: "security",
      section: "Protections",
      type: "single_choice",
      required: true,
      default: "none",
      text: "Security. Is the loan secured?",
      help: "Pro Tip: Most loans of this kind are unsecured. Security — a guarantee, a charge, a pledge — is given in a separate document, which FD AI does not draft yet; this agreement makes it a condition of the loan, and a Founders Doc lawyer can prepare it. A share pledge is not normal for a loan agreement and needs its own lawyer-drafted pledge.",
      options: [
        { value: "none", label: "Unsecured – no security", recommended: true },
        { value: "other", label: "Guarantee or charge – in a separate document" },
        { value: "pledge", label: "Share pledge – not usual for a loan" },
      ],
    },
    {
      id: "LN14a",
      key: "security_desc",
      section: "Protections",
      type: "free_text",
      required: true,
      max_length: 400,
      show_if: { q: "LN14", eq: "other" },
      text: "What is the security?",
      help: "Pro Tip: Say it in your own words, one item after another. FD AI puts it into contract wording and shows you both.",
      placeholder: "e.g. a personal guarantee from Tan Ah Kow; a charge over the Borrower's stock",
    },
    {
      id: "LN14b",
      key: "pledged_shares",
      section: "Protections",
      type: "free_text",
      required: true,
      max_length: 300,
      show_if: { q: "LN14", eq: "pledge" },
      text: "Which shares are pledged?",
      placeholder: "e.g. 100,000 ordinary shares in the Company held by the Borrower",
    },
    {
      id: "LN15",
      asked_at: NOT_SIMPLE,
      key: "defaults",
      section: "Protections",
      type: "single_choice",
      required: true,
      default_by: SIDE("strict", "lenient"),
      text: "Defaults. How strictly are defaults treated?",
      help: "Pro Tip: The master gives the Borrower 30 days to fix a breach and a further 90 days to cure a default before the loan can be called in. Lenders usually want more triggers — a false statement, other debts called in, insolvency steps. A few days' grace for a payment held up by a bank error is something a strong Borrower asks for; a Lender's own draft leaves it out and adds a general material adverse change trigger.",
      options: [
        { value: "lenient", label: "Borrower-friendly – 30 days to fix a breach, then 90 days to cure" },
        { value: "balanced", label: "Balanced – 3 Business Days for a payment held up by a technical error, 15 for other breaches, more triggers" },
        { value: "strict", label: "Lender-friendly – no grace for a missed payment, 15 Business Days for other breaches, more triggers and a material adverse change" },
      ],
    },
    {
      id: "LN16",
      asked_at: NOT_SIMPLE,
      fixed: { simple: "no" },
      key: "change_of_control",
      section: "Protections",
      type: "single_choice",
      required: true,
      default_by: SIDE("yes50", "yes"),
      show_if: CONNECTED,
      text: "Change of Control. Can the loan be called in if the company is sold?",
      help: "Pro Tip: A sale of the shares, a merger, a sale of the assets or a change in who ultimately owns the company lets the Lender ask for repayment within 30 days. More than 50% is the usual test of control; the master's 75% leaves the loan running through a smaller sale.",
      options: [
        { value: "yes50", label: "Callable on a sale of more than 50% – the usual test of control" },
        { value: "yes", label: "Callable on a sale of more than 75% – the master's threshold" },
        { value: "no", label: "Not callable on a sale" },
      ],
    },
    {
      id: "LN17",
      asked_at: NOT_SIMPLE,
      fixed: { simple: "no" },
      key: "company_comfort",
      section: "Protections",
      type: "single_choice",
      required: true,
      default: "yes",
      show_if: CONNECTED,
      text: "Company Comfort. Does the Borrower confirm the company's accounts and report on its fundraising?",
      help: "Pro Tip: The Borrower confirms the company's financial statements are true and fair, there has been no undisclosed material adverse change, and the business complies with the law — and updates the Lender every quarter on the next round.",
      options: [
        { value: "yes", label: "Company warranties and quarterly updates – the master's position", recommended: true },
        { value: "no", label: "Borrower's own warranties only – that it can enter into the loan" },
      ],
    },
    {
      id: "LN17a",
      key: "financial_periods",
      section: "Protections",
      type: "free_text",
      required: false,
      max_length: 200,
      show_if: { all: [CONNECTED, { q: "LN17", eq: "yes" }] },
      text: "Which financial statements does the Borrower stand behind?",
      placeholder: "e.g. the financial year ended 31 December 2025",
    },
    {
      id: "LN17b",
      key: "next_round",
      section: "Protections",
      type: "free_text",
      required: false,
      max_length: 60,
      show_if: { all: [CONNECTED, { q: "LN17", eq: "yes" }] },
      text: "Fundraising Updates. What is the company's next funding round called? Leave blank if it has no name yet.",
      help: "Pro Tip: Every quarter the Borrower tells the Lender how this fundraising is going. Give the round a name (“Series A”) and the agreement says “Series A financing”; leave it blank and it says “next financing”.",
      placeholder: "e.g. Series A",
    },
    {
      id: "LN18",
      asked_at: ONLY_COMPREHENSIVE,
      key: "assignment",
      section: "Protections",
      type: "single_choice",
      required: true,
      default: "notice",
      text: "Transfers. Can the Lender transfer the loan to someone else?",
      options: [
        { value: "notice", label: "On 30 days' notice – but not to a competitor", recommended: true },
        { value: "free", label: "Freely – without the Borrower's consent" },
        { value: "consent", label: "Only with the Borrower's consent" },
      ],
    },
    {
      id: "LN19",
      asked_at: NOT_SIMPLE,
      fixed: { simple: "none" },
      key: "cap",
      section: "Protections",
      type: "single_choice",
      required: true,
      default_by: SIDE("none", "cap2x"),
      text: "Borrower's Liability. Is the Borrower's liability for a breach capped?",
      help: "Pro Tip: The master caps the Borrower's total liability for a breach at twice the amount lent. Repayment and interest are owed in full either way.",
      options: [
        { value: "cap2x", label: "Capped at twice the amount lent" },
        { value: "none", label: "No cap" },
      ],
    },
    {
      id: "LN20",
      asked_at: NOT_SIMPLE,
      fixed: { simple: "own" },
      key: "costs",
      section: "Protections",
      type: "single_choice",
      required: true,
      default: "cap",
      text: "Legal Costs. Who pays for preparing the agreement?",
      options: [
        { value: "cap", label: "The Borrower, up to a cap", recommended: true },
        { value: "own", label: "Each side pays its own" },
        { value: "borrower", label: "The Borrower pays the Lender's costs in full" },
      ],
    },
    {
      id: "LN20b",
      key: "costs_cap_currency",
      section: "Protections",
      type: "single_choice",
      required: true,
      default: "SGD",
      default_by: { q: "LN5", map: { SGD: "SGD", USD: "USD" } },
      show_if: { q: "LN20", eq: "cap" },
      text: "Cap Currency. Which currency is the cap on legal costs in?",
      help: "Pro Tip: The cap need not be in the loan's currency: lawyers in Singapore usually bill in Singapore dollars even when the loan is in US dollars.",
      options: [
        { value: "SGD", label: "Singapore dollars (S$)" },
        { value: "USD", label: "US dollars (US$)" },
      ],
    },
    { id: "LN20a", key: "costs_cap", section: "Protections", type: "free_text", required: false, max_length: 24, show_if: { q: "LN20", eq: "cap" }, text: "The cap on legal costs, in {{cap_currency}}?", placeholder: "e.g. 3,000", format: "amount" },
    {
      id: "LN20c",
      key: "costs_cap_basis",
      section: "Protections",
      type: "single_choice",
      required: true,
      default_by: SIDE("excl", "incl"),
      show_if: { q: "LN20", eq: "cap" },
      text: "Cap Basis. Does the cap include GST and disbursements?",
      help: "Pro Tip: Disbursements are what the lawyers pay out for you, such as search and filing fees. A cap that includes them and GST is the most the Borrower can be asked for.",
      options: [
        { value: "incl", label: "Includes GST and disbursements" },
        { value: "excl", label: "Excludes GST and disbursements – they are paid on top" },
      ],
    },
    {
      id: "LN21",
      key: "disputes",
      section: "Protections",
      type: "single_choice",
      required: true,
      default: "siac",
      text: "Disputes. How are disputes resolved?",
      help: "Pro Tip: Both start with 30 days of talks or mediation. Arbitration is private and enforceable abroad; the courts are usually cheaper for a small loan between people in Singapore. Either way the Lender need not wait for talks to claim a plain unpaid debt, to act in the Borrower's insolvency or to enforce security.",
      options: [
        { value: "siac", label: "Talks or mediation, then arbitration in Singapore (SIAC)", recommended: true },
        { value: "courts", label: "Talks or mediation, then the Singapore courts" },
      ],
    },
  ],
} as const;
