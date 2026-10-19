/**
 * The Joint Venture Agreement questionnaire.
 *
 * One adaptive agreement for a joint venture company (JVC) owned by two
 * parties, each an individual or a company, in either shape:
 *
 *   equal     50:50 — every important decision needs both sides, so the
 *             deadlock route matters most;
 *   majority  one party holds more than half — it runs the company, and the
 *             minority is protected by reserved matters, information and
 *             (at Complex) tag-along; the usual answers lean to the side the
 *             user is on (default_by on JV2).
 *
 * The level of detail (JV0) is the slider every assembled document has:
 *
 *   basic     the essentials: the company and its business, the shares and
 *             what each party pays, the board, a short list of decisions
 *             that need both parties, a simple deadlock route, first refusal
 *             on transfers, pre-emption on new shares, confidentiality;
 *   standard  adds further funding, the full list of reserved matters, the
 *             business plan, accounts and information, dividends, a lock-in,
 *             default transfers at fair value, restrictions on competing,
 *             and a deed of adherence;
 *   complex   every option: the deadlock buy-out ("shotgun") or winding up,
 *             funding up to a cap, tag- and drag-along, a discount for a
 *             defaulting party, anti-corruption and valuation by an expert.
 *
 * Questions are built from a joint venture set-up checklist and Founders
 * Doc's own experience; the wording is Founders Doc's. Any governing law:
 * the answer sets the companies statute, the name of the constitution, the
 * third-party rights statute and the courts or arbitration (data/master.ts →
 * JURISDICTIONS).
 *
 * Data, not code: the screen asks these in order, the server checks them,
 * the assembler reads them by id, and the admin console lists them.
 */

const NUM = { pattern: "^(?!\\s*\\d[\\d,]*(\\.\\d+)?\\s*$)", message: "A number only, please (e.g. 50,000)." };
const PCT = { pattern: "^(?!\\s*\\d{1,2}(\\.\\d{1,2})?\\s*%?\\s*$)", message: "A percentage only, please (e.g. 60)." };
const NOT_BASIC = ["standard", "complex"] as const;
const ONLY_COMPLEX = ["complex"] as const;
const EQUAL = { q: "JV1", eq: "equal" } as const;
const MAJORITY = { q: "JV1", eq: "majority" } as const;
const BY_SIDE = (majority: unknown, minority: unknown) => ({ q: "JV2", map: { majority, minority } });

/** The decisions that always need both parties, whatever the level. */
export const CORE_RESERVED = ["constitution", "shares", "wind_up", "business_change", "sale"] as const;
const ALL_RESERVED = [...CORE_RESERVED, "plan", "borrowing", "related", "dividends", "senior_hires", "auditors", "litigation", "subsidiaries", "security", "ip"];

export const JVA_QUESTIONNAIRE = {
  id: "FD_JVA_QUESTIONNAIRE",
  version: "1.0",
  for_master: "FD Joint Venture Agreement (Basic, Standard, Complex)",
  status: "Live",
  questions: [
    /* ── the basics ── */
    {
      id: "JV0",
      key: "level",
      section: "The basics",
      type: "scale",
      required: true,
      default: "standard",
      text: "Level of Detail. How detailed should the agreement be?",
      help: "Pro Tip: Move the slider to choose. Basic covers the essentials for a small joint venture; Standard is right for most; Complex adds a buy-out route for deadlock, tag- and drag-along and valuation by an expert. You can change the level later from the list on the right; your answers are kept.",
      options: [
        { value: "basic", label: "Basic" },
        { value: "standard", label: "Standard", recommended: true },
        { value: "complex", label: "Complex" },
      ],
    },
    {
      id: "JV1",
      key: "shape",
      section: "The basics",
      type: "single_choice",
      required: true,
      default: "equal",
      text: "Ownership. How will the joint venture company be owned?",
      help: "Pro Tip: In a 50:50 joint venture every important decision needs both of you, so the agreement concentrates on what happens if you disagree. With a majority, the larger party runs the company and the smaller one is protected by a list of decisions it must agree to.",
      options: [
        { value: "equal", label: "50:50 – we are equal partners", recommended: true },
        { value: "majority", label: "One party will hold more than half" },
      ],
    },
    {
      id: "JV1a",
      key: "majority_pct",
      section: "The basics",
      type: "free_text",
      required: true,
      max_length: 6,
      show_if: MAJORITY,
      default: "60",
      text: "What percentage will the majority party hold?",
      help: "The minority party holds the rest. Between 51 and 99.",
      placeholder: "e.g. 60",
      reject: [PCT],
    },
    {
      id: "JV2",
      key: "side",
      section: "The basics",
      type: "single_choice",
      required: true,
      show_if: MAJORITY,
      text: "Your Side. Will you be the majority or the minority party?",
      help: "Pro Tip: The agreement stays fair to both, but where the usual position differs — the chair's casting vote, which decisions need the minority's consent, tag- and drag-along — the usual answer leans to your side. You can change any of them.",
      options: [
        { value: "majority", label: "The majority party" },
        { value: "minority", label: "The minority party" },
      ],
    },
    {
      id: "JV3",
      key: "law",
      section: "The basics",
      type: "single_choice",
      required: true,
      default: "sg",
      text: "Governing Law. Where is the joint venture company incorporated, and which law governs the agreement?",
      help: "Pro Tip: Usually the country where the company is (or will be) incorporated, so the agreement and the company's constitution follow the same law. Outside Singapore, have a lawyer qualified there confirm it.",
      options: [
        { value: "sg", label: "Singapore", recommended: true },
        { value: "ew", label: "England and Wales" },
        { value: "hk", label: "Hong Kong" },
        { value: "de", label: "Delaware (United States)" },
        { value: "ny", label: "New York (United States)" },
        { value: "other", label: "Another country – type it" },
      ],
    },
    { id: "JV3a", key: "law_other", section: "The basics", type: "free_text", required: true, max_length: 60, show_if: { q: "JV3", eq: "other" }, text: "Which country?", placeholder: "e.g. Malaysia" },

    /* ── the company ── */
    {
      id: "JV4",
      key: "jvc_status",
      section: "The company",
      type: "single_choice",
      required: true,
      default: "new",
      text: "The Company. Is the joint venture company already set up?",
      options: [
        { value: "new", label: "No – it will be incorporated for the joint venture", recommended: true },
        { value: "existing", label: "Yes – it is already incorporated" },
      ],
    },
    {
      id: "JV4a",
      key: "jvc_name",
      section: "The company",
      type: "free_text",
      required: true,
      max_length: 120,
      text: "What is (or will be) the company's name?",
      help: "If the name is not settled yet, give a working name: it can be changed before signing.",
      placeholder: "e.g. Harbour Ventures Pte. Ltd.",
    },
    { id: "JV4b", key: "jvc_number", section: "The company", type: "free_text", required: false, max_length: 40, show_if: { q: "JV4", eq: "existing" }, text: "Its registration number? (optional)", placeholder: "e.g. 202612345K" },
    {
      id: "JV5",
      key: "business",
      section: "The company",
      type: "free_text",
      required: true,
      max_length: 300,
      text: "The Business. What will the joint venture company do?",
      help: "Pro Tip: Be specific: the description sets what the company may do without both parties agreeing, and what the parties must not compete with.",
      placeholder: "e.g. develop, market and sell a mobile payments app in Southeast Asia",
    },

    /* ── the money ── */
    {
      id: "JV6",
      key: "currency",
      section: "The money",
      type: "single_choice",
      required: true,
      default_by: { q: "JV3", map: { sg: "SGD", ew: "GBP", hk: "HKD", de: "USD", ny: "USD", other: "USD" } },
      text: "Currency. In which currency are the investments made?",
      options: [
        { value: "SGD", label: "Singapore dollars (S$)" },
        { value: "USD", label: "US dollars (US$)" },
        { value: "GBP", label: "Pounds sterling (£)" },
        { value: "HKD", label: "Hong Kong dollars (HK$)" },
        { value: "EUR", label: "Euros (€)" },
      ],
    },
    {
      id: "JV7",
      key: "invest_a",
      section: "The money",
      type: "free_text",
      required: true,
      max_length: 20,
      text: "Initial Investment. How much will each party pay for its shares at the start?",
      text_by: { q: "JV1", map: { equal: "Initial Investment. How much will each party pay for its shares at the start?", majority: "Initial Investment. How much will the majority party pay for its shares at the start?" } },
      help: "The total each party pays to subscribe for its shares, in the currency above. Any later money is dealt with under Further Funding.",
      placeholder: "e.g. 50,000",
      reject: [NUM],
    },
    { id: "JV7a", key: "invest_b", section: "The money", type: "free_text", required: true, max_length: 20, show_if: MAJORITY, text: "And the minority party?", placeholder: "e.g. 20,000", reject: [NUM] },
    {
      id: "JV8",
      key: "funding",
      asked_at: NOT_BASIC,
      fixed: { basic: "voluntary" },
      section: "The money",
      type: "single_choice",
      required: true,
      default: "voluntary",
      text: "Further Funding. If the company needs more money later, must the parties put it in?",
      help: "Pro Tip: Most joint ventures make further funding voluntary, with each party free to offer it in proportion to its shares. A firm commitment, up to a cap, gives the business certainty but binds the parties.",
      options: [
        { value: "voluntary", label: "No – each party may offer it, in proportion to its shares", recommended: true },
        { value: "cap", label: "Yes – each funds its share of what the board asks for, up to a cap" },
      ],
    },
    { id: "JV8a", key: "funding_cap", asked_at: NOT_BASIC, section: "The money", type: "free_text", required: true, max_length: 20, show_if: { q: "JV8", eq: "cap" }, text: "Up to how much in total, for each party (in the same currency)?", placeholder: "e.g. 100,000", reject: [NUM] },

    /* ── the board ── */
    {
      id: "JV9",
      key: "directors_equal",
      section: "The board",
      type: "single_choice",
      required: true,
      show_if: EQUAL,
      default: "one",
      text: "Directors. How many directors may each party appoint?",
      options: [
        { value: "one", label: "One each", recommended: true },
        { value: "two", label: "Two each" },
      ],
    },
    {
      id: "JV10",
      key: "directors_majority",
      section: "The board",
      type: "single_choice",
      required: true,
      show_if: MAJORITY,
      default: "2_1",
      text: "Directors. How many directors may each party appoint?",
      options: [
        { value: "2_1", label: "Majority two, minority one", recommended: true },
        { value: "3_1", label: "Majority three, minority one" },
        { value: "3_2", label: "Majority three, minority two" },
      ],
    },
    {
      id: "JV11",
      key: "casting_equal",
      section: "The board",
      type: "single_choice",
      required: true,
      show_if: EQUAL,
      default: "no",
      text: "Casting Vote. If the board is split, should the chair have a casting vote?",
      help: "Pro Tip: In a 50:50 joint venture a casting vote hands control to whoever holds the chair, so it is usually left out; a split goes to the deadlock route instead.",
      options: [
        { value: "no", label: "No – a split goes to the deadlock route", recommended: true },
        { value: "rotate", label: "Yes – the chair rotates each year between the parties' directors" },
      ],
    },
    {
      id: "JV12",
      key: "casting_majority",
      section: "The board",
      type: "single_choice",
      required: true,
      show_if: MAJORITY,
      default_by: BY_SIDE("yes", "no"),
      text: "Casting Vote. The majority party appoints the chair. Should the chair have a casting vote?",
      options: [
        { value: "yes", label: "Yes – the chair's vote decides a tie" },
        { value: "no", label: "No – a tie means the matter is not passed" },
      ],
    },

    /* ── decisions ── */
    {
      id: "JV13",
      key: "reserved",
      asked_at: NOT_BASIC,
      fixed: { basic: [...CORE_RESERVED] },
      section: "Decisions",
      type: "multi_choice",
      required: true,
      default_by: { q: "JV2", map: { majority: [...CORE_RESERVED, "related"], minority: ALL_RESERVED } },
      default: ALL_RESERVED,
      text: "Reserved Matters. Which decisions should need both parties' written consent?",
      help: "Pro Tip: Everything not on this list is decided by the board in the usual way. The first five protect each party's investment and are always included; the rest are usual in a joint venture.",
      options: [
        { value: "constitution", label: "Changing the constitution or the rights of the shares" },
        { value: "shares", label: "Issuing, buying back or reducing shares" },
        { value: "wind_up", label: "Winding up, or going into an insolvency process" },
        { value: "business_change", label: "Changing the business, or starting a new one" },
        { value: "sale", label: "Selling the business, or a large part of its assets" },
        { value: "plan", label: "Adopting or changing the business plan and budget" },
        { value: "borrowing", label: "Borrowing above a set limit" },
        { value: "related", label: "Contracts with a party or anyone connected to it" },
        { value: "dividends", label: "Declaring a dividend" },
        { value: "senior_hires", label: "Hiring or dismissing the CEO and other senior managers" },
        { value: "auditors", label: "Changing the auditors or the accounting policies" },
        { value: "litigation", label: "Starting or settling significant legal proceedings" },
        { value: "subsidiaries", label: "Setting up subsidiaries, acquisitions or other joint ventures" },
        { value: "security", label: "Giving security over the company's assets" },
        { value: "ip", label: "Licensing or selling the company's intellectual property" },
      ],
    },
    { id: "JV13a", key: "borrowing_limit", asked_at: NOT_BASIC, section: "Decisions", type: "free_text", required: true, max_length: 20, show_if: { q: "JV13", has: "borrowing" }, text: "Borrowing above how much should need both parties (in the same currency)?", placeholder: "e.g. 100,000", reject: [NUM] },
    {
      id: "JV14",
      key: "deadlock",
      asked_at: NOT_BASIC,
      fixed: { basic: "escalate" },
      section: "Decisions",
      type: "single_choice",
      required: true,
      default: "escalate",
      text: "Deadlock. If the parties still cannot agree on an important matter, what happens?",
      help: "Pro Tip: Every route starts with the parties' senior people meeting, then mediation. If that fails: the matter is dropped and the company carries on; or either party may offer to buy the other out at a price it names — the other must then sell, or buy at that price (a \"shotgun\" clause), which keeps offers fair; or the company is wound up.",
      options: [
        { value: "escalate", label: "Meet, then mediate – if still stuck, the matter is dropped", recommended: true },
        { value: "shotgun", label: "Meet, mediate, then either may offer to buy the other out (\"shotgun\")" },
        { value: "wind_up", label: "Meet, mediate, then the company is wound up" },
      ],
    },

    /* ── shares ── */
    {
      id: "JV15",
      key: "transfers",
      section: "Shares",
      type: "single_choice",
      required: true,
      default: "first_refusal",
      text: "Selling Shares. Can a party sell its shares to an outsider?",
      options: [
        { value: "first_refusal", label: "Yes, but the other party may buy them first, on the same terms", recommended: true },
        { value: "consent", label: "Only with the other party's written consent" },
      ],
    },
    {
      id: "JV16",
      key: "lock_in",
      asked_at: NOT_BASIC,
      fixed: { basic: "none" },
      section: "Shares",
      type: "single_choice",
      required: true,
      default: "24",
      text: "Lock-in. For how long after signing should neither party be able to sell its shares?",
      help: "Pro Tip: A lock-in keeps both partners committed while the business gets going. Transfers within a party's own group are still allowed.",
      options: [
        { value: "none", label: "No lock-in" },
        { value: "12", label: "12 months" },
        { value: "24", label: "24 months", recommended: true },
        { value: "36", label: "36 months" },
      ],
    },
    {
      id: "JV17",
      key: "tag_drag",
      asked_at: ONLY_COMPLEX,
      fixed: { basic: ["none"], standard: ["tag"] },
      section: "Shares",
      type: "multi_choice",
      required: true,
      show_if: MAJORITY,
      default_by: BY_SIDE(["tag", "drag"], ["tag"]),
      text: "Tag- and Drag-Along. If the majority party sells its shares, which rights apply?",
      options: [
        { value: "tag", label: "Tag-along – the minority may sell its shares to the buyer on the same terms" },
        { value: "drag", label: "Drag-along – the majority may require the minority to sell too, on the same terms" },
        { value: "none", label: "Neither", exclusive: true },
      ],
    },
    {
      id: "JV18",
      key: "default_price",
      asked_at: ONLY_COMPLEX,
      fixed: { basic: "none", standard: "fair" },
      section: "Shares",
      type: "single_choice",
      required: true,
      default: "fair",
      text: "Leaving on Bad Terms. If a party seriously breaches the agreement, becomes insolvent or changes hands, the other may buy its shares. At what price?",
      options: [
        { value: "fair", label: "Fair value, set by an independent accountant", recommended: true },
        { value: "discount", label: "Fair value less 20% – a discount for the party at fault" },
      ],
    },

    /* ── promises ── */
    {
      id: "JV19",
      key: "restrictions",
      asked_at: NOT_BASIC,
      fixed: { basic: "none" },
      section: "Promises and disputes",
      type: "single_choice",
      required: true,
      default: "during_after",
      text: "Competing. May a party compete with the joint venture business?",
      help: "Pro Tip: A restriction after a party leaves must be reasonable — in time, place and the business covered — to be enforceable. Twelve months is common.",
      options: [
        { value: "during_after", label: "No – not while a shareholder, nor for 12 months after; no poaching staff either", recommended: true },
        { value: "during", label: "No – but only while a shareholder" },
        { value: "none", label: "Yes – no restriction" },
      ],
    },
    {
      id: "JV20",
      key: "dividends",
      asked_at: NOT_BASIC,
      fixed: { basic: "board" },
      section: "Promises and disputes",
      type: "single_choice",
      required: true,
      default: "distribute",
      text: "Dividends. What should happen to the company's profits?",
      options: [
        { value: "distribute", label: "Pay out what can be spared each year, after what the business needs", recommended: true },
        { value: "reinvest", label: "Reinvest – dividends only when both parties agree" },
      ],
    },
    {
      id: "JV21",
      key: "anti_corruption",
      asked_at: ONLY_COMPLEX,
      fixed: { basic: "no", standard: "no" },
      section: "Promises and disputes",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Anti-Corruption. Should the parties promise to keep the joint venture free of bribery and corruption?",
      options: [
        { value: "yes", label: "Yes", recommended: true },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "JV22",
      key: "disputes",
      asked_at: NOT_BASIC,
      fixed: { basic: "courts" },
      section: "Promises and disputes",
      type: "single_choice",
      required: true,
      default: "arbitration",
      text: "Disputes. After 30 days of talks or mediation, how are disputes between the parties resolved?",
      help: "Pro Tip: Arbitration is private and easier to enforce abroad, which suits most joint ventures; the courts can be cheaper when both parties are in the same country.",
      options: [
        { value: "arbitration", label: "Arbitration, under the governing law's usual rules", recommended: true },
        { value: "courts", label: "The courts of the governing law" },
      ],
    },
  ],
} as const;
