/**
 * The Investment Agreement questionnaire.
 *
 * There is no FD Lite question bank for the investment agreement. Rachel
 * shared two of the firm's own investment agreements in
 * #fdai-draft-investmentagreement as the reference points (both drafted by
 * Founders Doc for the company, redacted):
 *
 *   A  a simple investor — the company and one investor, no conditions,
 *      the company's warranties in the body, investor undertakings, a
 *      converting SAFE and a lead investor elsewhere in the round;
 *   B  a lead investor — the company, the founders and the lead investor,
 *      conditions precedent and a CP certificate, a board seat, an amended
 *      constitution, fifteen warranties in a schedule given by the company
 *      and the founders severally, founder liability capped, and a
 *      capitalisation table.
 *
 * The first question picks the shape; the rest are the choices that differ
 * between the two samples, or that the samples leave in [brackets]. The
 * defaults are the samples' own positions.
 *
 * Data, not code: the screen asks these in order, the server checks them,
 * the assembler reads them by id, and the admin console lists them.
 */

const NUM = { pattern: "^(?!\\s*\\d[\\d,]*(\\.\\d+)?\\s*$)", message: "A number only, please (e.g. 200,000)." };
const LEAD = { q: "IA1", eq: "lead" } as const;
const SIMPLE = { q: "IA1", eq: "simple" } as const;
const PREF = { q: "IA3", eq: "preference" } as const;

export const IA_QUESTIONNAIRE = {
  id: "FD_IA_QUESTIONNAIRE",
  version: "1.0",
  for_master: "FD investment agreements (simple investor; lead investor), redacted",
  status: "Beta",
  questions: [
    /* ── the deal ── */
    {
      id: "IA1",
      key: "shape",
      section: "The deal",
      type: "single_choice",
      required: true,
      text: "Type of Investment. Which describes the investment?",
      help: "Pro Tip: A lead investor usually asks for conditions, warranties from the founders and a board seat. A smaller or strategic investor usually comes in on simpler terms, alongside the round.",
      options: [
        { value: "simple", label: "One investor on simple terms – the company and the investor only" },
        { value: "lead", label: "A lead investor – the founders sign too, with conditions, full warranties and a board seat" },
      ],
    },
    {
      id: "IA1a",
      key: "founder_count",
      section: "The deal",
      type: "single_choice",
      required: true,
      default: "2",
      show_if: LEAD,
      text: "How many founders will sign?",
      options: ["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n })),
    },
    {
      id: "IA2",
      key: "currency",
      section: "The deal",
      type: "single_choice",
      required: true,
      default: "SGD",
      text: "Currency. What currency is the investment in?",
      options: [
        { value: "SGD", label: "Singapore dollars (S$)", recommended: true },
        { value: "USD", label: "US dollars (US$)" },
      ],
    },
    {
      id: "IA3",
      key: "share_type",
      section: "The shares",
      type: "single_choice",
      required: true,
      default: "preference",
      text: "Shares. What shares will the investor receive?",
      help: "Pro Tip: Investors usually take preference shares, which are paid back first on a sale or liquidation. Their rights must also be written into the Constitution.",
      options: [
        { value: "preference", label: "Preference shares", recommended: true },
        { value: "ordinary", label: "Ordinary shares" },
      ],
    },
    {
      id: "IA3a",
      key: "class_name",
      section: "The shares",
      type: "single_choice",
      required: true,
      default: "Seed Preference Shares",
      show_if: PREF,
      text: "What is the class called?",
      options: [
        { value: "Pre-Seed Preference Shares", label: "Pre-Seed Preference Shares" },
        { value: "Seed Preference Shares", label: "Seed Preference Shares", recommended: true },
        { value: "Pre-Series A Preference Shares", label: "Pre-Series A Preference Shares" },
        { value: "Series A Preference Shares", label: "Series A Preference Shares" },
        { value: "other", label: "Other – please specify" },
      ],
    },
    { id: "IA3b", key: "class_other", section: "The shares", type: "free_text", required: true, max_length: 60, show_if: { all: [PREF, { q: "IA3a", eq: "other" }] }, text: "Name of the class?", placeholder: "e.g. Bridge Preference Shares", reject: [{ pattern: "^(?!.*shares?\\s*$)", message: "End the name with “Shares” (e.g. Bridge Preference Shares)." }] },
    {
      id: "IA16",
      key: "liquidation",
      section: "The shares",
      type: "single_choice",
      required: true,
      default: "1x",
      show_if: PREF,
      text: "Liquidation Preference. On a sale or liquidation, what do the preference shares get first?",
      help: "Pro Tip: The usual seed position is the higher of the money invested (1x) or the share of the proceeds the investor would get as an ordinary shareholder.",
      options: [
        { value: "1x", label: "The higher of 1x the investment or their as-converted share (non-participating)", recommended: true },
        { value: "none", label: "No preference – paid alongside ordinary shares" },
      ],
    },
    {
      id: "IA17",
      key: "voting",
      section: "The shares",
      type: "single_choice",
      required: true,
      default: "as_converted",
      show_if: PREF,
      text: "Voting. Do the preference shares vote?",
      options: [
        { value: "as_converted", label: "Yes – alongside ordinary shares, one vote per ordinary share they convert into", recommended: true },
        { value: "non_voting", label: "No – only at meetings of their own class" },
      ],
    },
    {
      id: "IA18",
      key: "conversion",
      section: "The shares",
      type: "single_choice",
      required: true,
      default: "convertible",
      show_if: PREF,
      text: "Conversion. Can the preference shares be converted into ordinary shares?",
      help: "Pro Tip: A “full ratchet” lowers the conversion price to the price of any later, cheaper share issue — strongly in the investor’s favour.",
      options: [
        { value: "convertible", label: "Yes – 1:1 at the holder’s option, adjusted only for splits and similar changes", recommended: true },
        { value: "ratchet", label: "Yes – 1:1, with a full ratchet for later cheaper issues and an IPO adjustment" },
        { value: "none", label: "No conversion right" },
      ],
    },

    /* ── before and at completion ── */
    {
      id: "IA4",
      key: "completion",
      section: "Completion",
      type: "single_choice",
      required: true,
      default: "signing",
      show_if: SIMPLE,
      text: "Completion. When does the investment complete?",
      options: [
        { value: "signing", label: "On signing", recommended: true },
        { value: "date", label: "By a set date" },
      ],
    },
    { id: "IA4a", key: "completion_date", section: "Completion", type: "free_text", required: true, max_length: 40, show_if: { all: [SIMPLE, { q: "IA4", eq: "date" }] }, text: "By when?", placeholder: "e.g. 31 December 2026" },
    {
      id: "IA5",
      key: "conditions",
      section: "Completion",
      type: "multi_choice",
      required: true,
      default: ["approvals", "compliance", "no_prohibition", "no_breach"],
      show_if: LEAD,
      text: "Conditions Precedent. What must be satisfied before the lead investor pays?",
      options: [
        { value: "approvals", label: "All waivers, approvals and consents for the share issue obtained", recommended: true },
        { value: "compliance", label: "The company has done everything it must do before completion", recommended: true },
        { value: "no_prohibition", label: "No new law or order prohibits the investment", recommended: true },
        { value: "no_breach", label: "No breach of the warranties or the agreement", recommended: true },
        { value: "none", label: "None – completion on signing", exclusive: true },
      ],
    },
    {
      id: "IA5a",
      key: "longstop",
      section: "Completion",
      type: "single_choice",
      required: true,
      default: "2",
      show_if: { all: [LEAD, { q: "IA5", lacks: "none" }] },
      text: "If the conditions are not met, when can a party walk away?",
      options: [
        { value: "1", label: "1 month after signing" },
        { value: "2", label: "2 months after signing", recommended: true },
        { value: "3", label: "3 months after signing" },
      ],
    },
    {
      id: "IA6",
      key: "sha",
      section: "Completion",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Shareholders Agreement. Will the investor also sign a shareholders agreement?",
      help: "Pro Tip: Transfers, board rights and vetoes sit in the shareholders agreement; this agreement then gives way to it if they ever conflict.",
      options: [
        { value: "yes", label: "Yes", recommended: true },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "IA7",
      key: "constitution",
      section: "Completion",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Constitution. Will the company adopt an amended constitution at completion?",
      help: "Needed when new preference shares are issued, so that their rights are in the Constitution.",
      options: [
        { value: "yes", label: "Yes", recommended: true },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "IA8",
      key: "board_seat",
      section: "Completion",
      type: "single_choice",
      required: true,
      default: "yes",
      show_if: LEAD,
      text: "Board Seat. Will the lead investor nominate a director at completion?",
      options: [
        { value: "yes", label: "Yes", recommended: true },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "IA9",
      key: "investor_docs",
      section: "Completion",
      type: "multi_choice",
      required: true,
      default: ["authority", "application"],
      text: "What should the investor deliver at completion, besides the money?",
      options: [
        { value: "authority", label: "Evidence that its signatory is authorised", recommended: true },
        { value: "application", label: "A signed share application form", recommended: true },
        { value: "none", label: "Nothing else", exclusive: true },
      ],
    },
    {
      id: "IA10",
      key: "safe",
      section: "Completion",
      type: "single_choice",
      required: true,
      default: "no",
      show_if: SIMPLE,
      text: "SAFE. Does the investor hold a SAFE that converts on this investment (as an “Equity Financing”)?",
      options: [
        { value: "no", label: "No", recommended: true },
        { value: "yes", label: "Yes" },
      ],
    },
    { id: "IA10a", key: "safe_date", section: "Completion", type: "free_text", required: false, max_length: 40, show_if: { all: [SIMPLE, { q: "IA10", eq: "yes" }] }, text: "When was the SAFE signed? (Optional)", placeholder: "e.g. 27 February 2025" },
    {
      id: "IA11",
      key: "round",
      section: "Completion",
      type: "single_choice",
      required: true,
      default: "no",
      show_if: SIMPLE,
      text: "The Round. Is the company also raising from a lead investor, possibly on different terms?",
      options: [
        { value: "no", label: "No", recommended: true },
        { value: "yes", label: "Yes" },
      ],
    },
    { id: "IA11a", key: "lead_name", section: "Completion", type: "free_text", required: false, max_length: 120, show_if: { all: [SIMPLE, { q: "IA11", eq: "yes" }] }, text: "Who is the lead investor? (Optional)", placeholder: "e.g. Harbour Ventures Fund I" },

    /* ── warranties and liability ── */
    {
      id: "IA12",
      key: "warrantors",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "company_founders",
      show_if: LEAD,
      text: "Warrantors. Who gives the warranties about the company?",
      options: [
        { value: "company_founders", label: "The company and the founders", recommended: true },
        { value: "company", label: "The company only" },
      ],
    },
    {
      id: "IA12a",
      key: "basis",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "several",
      show_if: { all: [LEAD, { q: "IA12", eq: "company_founders" }] },
      text: "Jointly or severally?",
      help: "Severally: each warrantor answers only for its own share. Jointly and severally: the investor can claim the whole amount from any one of them.",
      options: [
        { value: "several", label: "Severally", recommended: true },
        { value: "joint", label: "Jointly and severally" },
      ],
    },
    {
      id: "IA13",
      key: "claims_period",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "12",
      show_if: SIMPLE,
      text: "Claims Period. How long after signing can the investor claim for a breach of warranty?",
      options: [
        { value: "6", label: "6 months" },
        { value: "12", label: "12 months", recommended: true },
        { value: "18", label: "18 months" },
        { value: "24", label: "24 months" },
      ],
    },
    {
      id: "IA13l",
      key: "claims_period_lead",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "18",
      show_if: LEAD,
      text: "Claims Period. How long after signing can the lead investor claim for a breach of warranty?",
      options: [
        { value: "12", label: "12 months" },
        { value: "18", label: "18 months", recommended: true },
        { value: "24", label: "24 months" },
        { value: "36", label: "36 months" },
      ],
    },
    {
      id: "IA14",
      key: "founder_cap",
      section: "Warranties",
      type: "single_choice",
      required: true,
      default: "150000",
      show_if: { all: [LEAD, { q: "IA12", eq: "company_founders" }] },
      text: "Founder Cap. What is the most each founder can be liable for (in the deal currency)?",
      help: "The company’s own liability is capped at the investment amount.",
      options: [
        { value: "50000", label: "50,000" },
        { value: "100000", label: "100,000" },
        { value: "150000", label: "150,000", recommended: true },
        { value: "250000", label: "250,000" },
        { value: "other", label: "Other – please specify" },
      ],
    },
    { id: "IA14a", key: "founder_cap_other", section: "Warranties", type: "free_text", required: true, max_length: 12, show_if: { all: [LEAD, { q: "IA12", eq: "company_founders" }, { q: "IA14", eq: "other" }] }, text: "What cap per founder?", placeholder: "e.g. 75,000", reject: [NUM] },

    /* ── investor undertakings ── */
    {
      id: "IA15",
      key: "undertakings",
      section: "Investor undertakings",
      type: "multi_choice",
      required: true,
      default: ["transfers", "esop", "other_terms", "fundraising", "liquidity", "non_disparagement"],
      show_if: SIMPLE,
      text: "Investor Undertakings. Which should the investor give? (Tick all that apply.)",
      options: [
        { value: "transfers", label: "No charging of the shares; transfers only under the shareholders agreement / with Board approval", recommended: true },
        { value: "esop", label: "Not to block an employee share option plan", recommended: true },
        { value: "other_terms", label: "Accepts that other investors may come in on different terms", recommended: true },
        { value: "fundraising", label: "Not to block further fundraising", recommended: true },
        { value: "liquidity", label: "To sell on the same terms as other shareholders on a sale of the company", recommended: true },
        { value: "non_disparagement", label: "Not to disparage the company or its founders", recommended: true },
        { value: "none", label: "None", exclusive: true },
      ],
    },
    {
      id: "IA15l",
      key: "undertakings_lead",
      section: "Investor undertakings",
      type: "multi_choice",
      required: true,
      default: ["non_disparagement"],
      show_if: LEAD,
      text: "Lead Investor Undertakings. Which should the lead investor give? (Tick all that apply.)",
      options: [
        { value: "transfers", label: "No charging of the shares; transfers only under the shareholders agreement / with Board approval" },
        { value: "esop", label: "Not to block an employee share option plan" },
        { value: "fundraising", label: "Not to block further fundraising" },
        { value: "non_disparagement", label: "Not to disparage the company or its founders", recommended: true },
        { value: "none", label: "None", exclusive: true },
      ],
    },
  ],
} as const;
