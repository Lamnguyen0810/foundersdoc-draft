/**
 * The Share Subscription Agreement questionnaire — the firm's "FD LITE
 * QUESTIONS BANK I SHARE SUBSCRIPTION AGREEMENT [FOR INVESTORS]"
 * (FD_Lite_I_Qns_Bank_SSA.docx), all three versions:
 *
 *   Basic    (<7 pages)   investment, completion, confidentiality, law —
 *                         no conditions, no warranties, one investor;
 *   Standard (7–14 pages) adds signed resolutions and the limited
 *                         warranties (authority and capacity);
 *   Complex  (>14 pages)  adds conditions, a share capital table, the
 *                         fundamental warranties, caps on liability, the
 *                         investor / company / founder undertakings, and
 *                         more than one investor on the same terms.
 *
 * Fixes from reading the bank:
 *   - "No – not incorporated" and "existing shares will be transferred"
 *     are kept as answers, but they stop the draft with the bank's own
 *     advice (incorporate first; use the Share Purchase Agreement);
 *   - the number of founders and of investors are asked as numbers, so the
 *     screen can give each one a box;
 *   - "Others – please specify" has a typed follow-up, and the caps'
 *     "Others" accept numbers only, as the bank's FD note asks;
 *   - "Not applicable" options stand alone (exclusive).
 *
 * The bank gives no recommended answer for most questions; where it marks
 * one ("Recommended if you are an investor") the investor's choice is the
 * default, as the bank is written for investors.
 *
 * Data, not code: the screen asks these in order, the server checks them,
 * the assembler reads them by id, and the admin console lists them.
 */

const NUM = { pattern: "^(?!\\s*\\d{1,3}(\\.\\d+)?\\s*$)", message: "A number only, please (e.g. 60)." };

const COMPLEX = { q: "SS1", eq: "complex" } as const;
const NOT_BASIC = { q: "SS1", in: ["standard", "complex"] } as const;

export const SSA_QUESTIONNAIRE = {
  id: "FD_SSA_QUESTIONNAIRE",
  version: "1.0",
  for_master: "FD Lite Questions Bank — Share Subscription Agreement [for Investors]",
  status: "Beta",
  questions: [
    /* ── choice of document ── */
    {
      id: "SS1",
      key: "version",
      section: "Choice of document",
      type: "single_choice",
      required: true,
      text: "Choice of Document. Which version of the agreement would you like?",
      help: "For a simple investment of up to about $750k in a company incorporated less than three years ago. No disclosure letter is needed.",
      options: [
        { value: "basic", label: "Basic – no conditions, no warranties, one investor (under 7 pages)" },
        { value: "standard", label: "Standard – adds signed resolutions and warranties on authority and capacity, one investor (7–14 pages)", recommended: true },
        { value: "complex", label: "Complex – adds conditions, fundamental warranties, caps on liability, undertakings; one or more investors (over 14 pages)" },
      ],
    },

    /* ── Section I: investment ── */
    {
      id: "SS2",
      key: "incorporated",
      section: "Investment",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Company. Has the target company been incorporated?",
      options: [
        { value: "yes", label: "Yes", recommended: true },
        { value: "by_signing", label: "Not yet – but it will be incorporated by the time we sign" },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "SS3",
      key: "parties",
      section: "Investment",
      type: "multi_choice",
      required: true,
      default: ["company", "founders", "investors"],
      text: "Parties. Who are the parties to the agreement? (Tick all that apply.)",
      help: "If this is a SAFE investor converting the SAFE note, please consider our SAFE Conversion Letter as well.",
      options: [
        { value: "company", label: "The target company", recommended: true },
        { value: "founders", label: "Founder(s)", recommended: true },
        { value: "investors", label: "Investor(s)", recommended: true },
      ],
    },
    {
      id: "SS3a",
      key: "founder_count",
      section: "Investment",
      type: "single_choice",
      required: true,
      default: "1",
      show_if: { q: "SS3", has: "founders" },
      text: "How many founders?",
      options: ["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n })),
    },
    {
      id: "SS4",
      key: "investor_count",
      section: "Investment",
      type: "single_choice",
      required: true,
      default: "1",
      show_if: COMPLEX,
      text: "How many investors will enter into this agreement?",
      help: "All investors come in on the same terms.",
      options: ["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n })),
    },
    {
      id: "SS4a",
      key: "representative",
      section: "Investment",
      type: "single_choice",
      required: true,
      default: "no",
      show_if: { all: [COMPLEX, { q: "SS4", not_in: ["1"] }] },
      text: "Representative. Is there a representative authorised to act on behalf of all the investors?",
      options: [
        { value: "yes", label: "Yes – we expect an authorised representative to be appointed" },
        { value: "no", label: "No – each investor will represent itself / himself / herself" },
      ],
    },
    {
      id: "SS5",
      key: "share_type",
      section: "Investment",
      type: "single_choice",
      required: true,
      default: "ordinary",
      text: "Shares. Tell us more about the shares the investor will receive.",
      options: [
        { value: "ordinary", label: "New ordinary shares", recommended: true },
        { value: "preference", label: "New preference shares" },
        { value: "transfer", label: "No – existing shares will be transferred to the investor" },
      ],
    },
    {
      id: "SS6",
      key: "conditions",
      section: "Investment",
      type: "single_choice",
      required: true,
      default: "no",
      show_if: COMPLEX,
      text: "Conditions. Are there any conditions to the subscription of shares by the investor?",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "SS6a",
      key: "condition_list",
      section: "Investment",
      type: "multi_choice",
      required: true,
      default: ["shareholder_approval", "board_approval"],
      show_if: { all: [COMPLEX, { q: "SS6", eq: "yes" }] },
      text: "Which conditions apply? (Tick all that apply.)",
      help: "Disclaimer: if the conditions in your deal go beyond these standard conditions, please approach an FD lawyer to tailor the document. If you proceed regardless, you do so at your own risk.",
      options: [
        { value: "shareholder_approval", label: "Approval of the existing shareholders, and waiver of any rights (where applicable)" },
        { value: "board_approval", label: "Approval of the investment by the Board" },
        { value: "sha", label: "Entry into a new shareholders agreement" },
        { value: "constitution", label: "Amendment and restatement of the Constitution" },
        { value: "no_mac", label: "No material adverse change affecting the business between signing and completion" },
        { value: "esop", label: "Adoption of an ESOP" },
        { value: "employment", label: "Founders entering into full-time employment contracts with the company" },
        { value: "ip", label: "Completion of IP assignment" },
        { value: "other", label: "Others – please specify" },
      ],
    },
    { id: "SS6b", key: "condition_other", section: "Investment", type: "free_text", required: true, max_length: 300, show_if: { all: [COMPLEX, { q: "SS6", eq: "yes" }, { q: "SS6a", has: "other" }] }, text: "What other condition?", placeholder: "e.g. the Company obtaining the IMDA licence for its platform" },
    {
      id: "SS7",
      key: "company_actions",
      section: "Investment",
      type: "multi_choice",
      required: true,
      default: ["members", "board"],
      show_if: { q: "SS1", eq: "standard" },
      text: "Completion – Company. To complete the investment, the Company will update its electronic register of members with ACRA and issue new share certificates. What other actions would you like the Company to take?",
      options: [
        { value: "members", label: "Signed shareholders’ resolutions authorising the investment" },
        { value: "board", label: "Signed board resolutions authorising the investment" },
        { value: "none", label: "None", exclusive: true },
      ],
    },
    {
      id: "SS7c",
      key: "company_actions_complex",
      section: "Investment",
      type: "multi_choice",
      required: true,
      default: ["satisfaction", "certificate", "members", "board"],
      show_if: COMPLEX,
      text: "Completion – Company. To complete the investment, the Company will update its electronic register of members with ACRA and issue new share certificates. What other actions would you like the Company to take?",
      options: [
        { value: "satisfaction", label: "Satisfaction of the conditions of investment" },
        { value: "certificate", label: "A completion certificate evidencing that the conditions are satisfied" },
        { value: "members", label: "Signed shareholders’ resolutions authorising the investment" },
        { value: "board", label: "Signed board resolutions authorising the investment" },
        { value: "none", label: "None", exclusive: true },
      ],
    },
    {
      id: "SS8",
      key: "funding",
      section: "Investment",
      type: "single_choice",
      required: true,
      default: "wire",
      text: "Completion – Investor. To complete the investment, the investor will have to wire funds.",
      options: [
        { value: "wire", label: "OK", recommended: true },
        { value: "convert", label: "No need – we are converting a SAFE / loan" },
      ],
    },
    {
      id: "SS9",
      key: "investor_actions",
      section: "Investment",
      type: "multi_choice",
      required: true,
      default: ["none"],
      text: "What other actions would you like the investor to take? (Tick all that apply.)",
      options: [
        { value: "authority", label: "Evidence that the investor is authorised to make the investment (recommended for institutional or corporate investors)" },
        { value: "sha", label: "A signed shareholders agreement" },
        { value: "safe_letter", label: "A signed SAFE conversion letter waiving claims against the company (recommended for a converting SAFE investor)" },
        { value: "none", label: "None", exclusive: true },
      ],
    },

    /* ── Section II: warranties (Standard and Complex) ── */
    {
      id: "SS10",
      key: "warrantors",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "company_founders",
      show_if: { all: [NOT_BASIC, { q: "SS3", has: "founders" }] },
      text: "Warrantors. Which parties will give the warranties about the company? They are the “warrantors”.",
      help: "Implication: you can sue or make a claim against these parties if any of the warranties are found to be untrue.",
      options: [
        { value: "company", label: "The company only (recommended if you are a founder / acting for the company)" },
        { value: "company_founders", label: "The company and the founders (recommended if you are an investor)", recommended: true },
      ],
    },
    {
      id: "SS10a",
      key: "liability_basis",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "joint",
      show_if: { all: [NOT_BASIC, { q: "SS3", has: "founders" }, { q: "SS10", eq: "company_founders" }] },
      text: "Will the warranties be given jointly and severally, or severally?",
      help: "Jointly and severally: if one warrantor cannot pay its share of a claim, you can recover the shortfall from the others. Severally: each warrantor answers only for its own share.",
      options: [
        { value: "several", label: "Severally (recommended if you are a founder / acting for the company)" },
        { value: "joint", label: "Jointly and severally (recommended if you are an investor)", recommended: true },
      ],
    },
    {
      id: "SS11",
      key: "warranties",
      section: "Warranties",
      type: "multi_choice",
      required: true,
      default: ["authority", "existence", "laws", "title"],
      show_if: { q: "SS1", eq: "standard" },
      text: "Which warranties will be given to the investor?",
      options: [
        { value: "authority", label: "Authority to enter into this agreement", recommended: true },
        { value: "existence", label: "Valid corporate existence of the target company", recommended: true },
        { value: "laws", label: "No breach of applicable laws and regulations", recommended: true },
        { value: "title", label: "Valid title over the issued shares", recommended: true },
      ],
    },
    {
      id: "SS11c",
      key: "warranties_complex",
      section: "Warranties",
      type: "multi_choice",
      required: true,
      default: ["authority", "existence", "laws", "title", "accounts", "compliance", "litigation", "contracts", "anti_corruption"],
      show_if: COMPLEX,
      text: "Which warranties will be given to the investor?",
      options: [
        { value: "authority", label: "Authority to enter into this agreement", recommended: true },
        { value: "existence", label: "Valid corporate existence of the target company", recommended: true },
        { value: "laws", label: "No breach of applicable laws and regulations", recommended: true },
        { value: "title", label: "Valid title over the issued shares", recommended: true },
        { value: "accounts", label: "Accuracy of the financial statements or management accounts provided", recommended: true },
        { value: "compliance", label: "Material compliance with laws and regulations", recommended: true },
        { value: "litigation", label: "No material litigation against the company and/or founders", recommended: true },
        { value: "contracts", label: "No breach of third-party contracts and/or arrangements", recommended: true },
        { value: "anti_corruption", label: "Compliance with anti-corruption and anti-bribery laws", recommended: true },
      ],
    },
    {
      id: "SS12",
      key: "caps",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "yes",
      show_if: COMPLEX,
      text: "Limits. Will there be limits on the warrantors’ maximum liability?",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "SS12a",
      key: "financial_cap",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "100",
      show_if: { all: [COMPLEX, { q: "SS12", eq: "yes" }] },
      text: "Which financial cap?",
      options: [
        { value: "125", label: "125% of the investment amount" },
        { value: "100", label: "100% of the investment amount", recommended: true },
        { value: "75", label: "75% of the investment amount" },
        { value: "50", label: "50% of the investment amount" },
        { value: "other", label: "Others – please specify" },
      ],
    },
    { id: "SS12b", key: "financial_cap_other", section: "Warranties", type: "free_text", required: true, max_length: 6, show_if: { all: [COMPLEX, { q: "SS12", eq: "yes" }, { q: "SS12a", eq: "other" }] }, text: "What percentage of the investment amount?", placeholder: "e.g. 60", reject: [NUM] },
    {
      id: "SS12c",
      key: "time_cap",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "36",
      show_if: { all: [COMPLEX, { q: "SS12", eq: "yes" }] },
      text: "Which time cap?",
      options: [
        { value: "60", label: "5 years after the investment" },
        { value: "36", label: "3 years after the investment", recommended: true },
        { value: "18", label: "18 months after the investment" },
        { value: "12", label: "12 months after the investment" },
        { value: "6", label: "6 months after the investment" },
        { value: "other", label: "Others – please specify" },
      ],
    },
    { id: "SS12d", key: "time_cap_other", section: "Warranties", type: "free_text", required: true, max_length: 3, show_if: { all: [COMPLEX, { q: "SS12", eq: "yes" }, { q: "SS12c", eq: "other" }] }, text: "How many months after the investment?", placeholder: "e.g. 24", reject: [NUM] },

    /* ── Section III: undertakings (Complex) ── */
    {
      id: "SS13",
      key: "investor_undertakings",
      section: "Undertakings",
      type: "multi_choice",
      required: true,
      default: ["none"],
      show_if: COMPLEX,
      text: "Investor Undertakings. Do any of these apply? (Tick all that apply.)",
      options: [
        { value: "no_transfer", label: "The investor shall not transfer shares without the consent of the Board" },
        { value: "rofo", label: "The investor shall offer the shares to management first, before transferring them to third parties" },
        { value: "esop", label: "The investor acknowledges that an ESOP pool will be implemented" },
        { value: "fundraising", label: "The investor acknowledges further fundraising and will act in good faith to support it" },
        { value: "exit", label: "The investor will act in good faith to support exit events and exit efforts by the Company" },
        { value: "none", label: "Not applicable – this will be covered in the shareholders agreement", exclusive: true },
      ],
    },
    {
      id: "SS14",
      key: "company_undertakings",
      section: "Undertakings",
      type: "multi_choice",
      required: true,
      default: ["budget", "quarterly", "updates"],
      show_if: COMPLEX,
      text: "Company Undertakings. Do any of these apply? (Tick all that apply.)",
      help: "If investors are entitled to board seats or veto rights, please use a shareholders agreement or investor agreement for those rights.",
      options: [
        { value: "budget", label: "The Company will provide its annual budget and forecast to the investor(s)" },
        { value: "quarterly", label: "The Company will provide quarterly management accounts to the investor(s)" },
        { value: "monthly", label: "The Company will provide monthly management accounts to the investor(s)" },
        { value: "updates", label: "The Company will provide material updates to the investor(s)" },
        { value: "none", label: "Not applicable – this will be covered in the shareholders agreement", exclusive: true },
      ],
    },
    {
      id: "SS15",
      key: "founder_undertakings",
      section: "Undertakings",
      type: "multi_choice",
      required: true,
      default: ["reputation", "conflict"],
      show_if: { all: [COMPLEX, { q: "SS3", has: "founders" }] },
      text: "Founder Undertakings. Do any of these apply? (Tick all that apply.)",
      options: [
        { value: "reputation", label: "The founder(s) shall not do anything that will prejudice the reputation or goodwill of the company" },
        { value: "conflict", label: "The founder(s) will not place themselves in a position of conflict of interest" },
        { value: "non_compete", label: "The founder(s) will enter into a non-compete undertaking letter, on terms approved by the investor (acting reasonably)" },
        { value: "vesting", label: "The founder(s) will enter into a share vesting letter for their shares, on terms approved by the investor(s) (acting reasonably)" },
        { value: "none", label: "None", exclusive: true },
      ],
    },
  ],
} as const;
