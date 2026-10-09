/**
 * The Co-Founder Agreement questionnaire — the firm's "FDL CFA I TF
 * Questions" (4 June 2025, Singapore), the twenty-five questions, with the
 * changes agreed in the June 2025 bug tests (#fdai-draft-cfa, canvases
 * F091VFNJZJ4 and F091M9B38SG):
 *
 *   - multi-select on 3, 7, 11, 12, 13, 15 and 20;
 *   - "None" / "No restrictions" on 3, 11 and 12 cannot be combined with the
 *     others (exclusive);
 *   - 14 asks the price the shares are "bought at", and its last option is
 *     "No Buy-out Option";
 *   - 25 is a plain Yes / No.
 *
 * Data, not code: the screen asks these in order, the server checks them,
 * and the admin console lists them read-only. Hidden questions (show_if)
 * are not asked and their answer is empty. `help` carries the Pro Tip or
 * the Assumption word for word; `recommended` follows the Pro Tip; `default`
 * is set only where the Pro Tip is unambiguous — the rest of the defaults
 * live in the firm's Gsheet (1JYurB5h…) and come in with the master.
 *
 * Who the Company and the Co-Founders are (name, NRIC/passport, nationality,
 * address, title, role) and the initial shareholding table (name / role / %)
 * are not questions here: the screen asks them in two steps of their own,
 * in fixed boxes, straight after F1 — the June tests showed free text being
 * read as placeholders. Anything left blank there is a [●] in the draft.
 *
 * Condition language: {q, eq} | {q, in} | {q, not_in} | {q, has} / {q, lacks}
 * (a multi-choice answer includes, or does not include, the value) | {all} | {any}.
 *
 * Status: the questions are live; the master they feed is not yet loaded
 * (data/master.ts). Until it is, FD AI saves the answers and a lawyer sends
 * the draft.
 */

export const COFOUNDER_QUESTIONNAIRE = {
  id: "FD_CFA_QUESTIONNAIRE",
  version: "1.0",
  for_master: "FD Master Co-Founders Agreement (Singapore)",
  status: "Draft for FD review",
  questions: [
    /* ── 1/25 ── */
    {
      id: "F1",
      key: "founder_count",
      section: "The Co-Founders",
      type: "single_choice",
      required: true,
      text: "How many Co-Founders are there?",
      help: "Pro-tip: We recommend no more than 3 Co-Founders in a team.",
      options: [
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
        { value: "5", label: "5" },
      ],
    },
    /* ── 2/25 ── */
    {
      id: "F2",
      key: "decision_maker",
      section: "Management",
      type: "single_choice",
      required: true,
      text: "Management. Who has the final say in your startup’s decisions?",
      help: "Pro-tip: “Majority” means more than 50% must agree. If there’s a tie (deadlock), decisions can stall — so pick an option that helps avoid this.",
      options: [
        { value: "ceo", label: "CEO – One co-founder (the CEO) makes all final decisions." },
        { value: "founders", label: "Co-Founders – Co-Founders vote, and the option with the most votes wins." },
        { value: "board", label: "Board of Directors – A group of appointed directors (e.g., co-founders, investors, advisors) vote on major decisions." },
        { value: "shareholders", label: "Shareholders – All company owners (including investors) vote, and the majority decision applies." },
      ],
    },
    /* ── 3/25 ── */
    {
      id: "F3",
      key: "conditions",
      section: "Conditions",
      type: "multi_choice",
      required: true,
      text: "What must a Co-Founder do to be officially recognised in the startup?",
      help: "Pro Tip: Setting conditions helps ensure commitment and alignment. You can select multiple options; “None” cannot be combined with the others.",
      options: [
        { value: "full_time", label: "Full-time Commitment – Leave their previous role and join the startup full-time." },
        { value: "capital", label: "Capital Investment – Invest personal funds into the business." },
        { value: "other", label: "Other – Specify a different requirement." },
        { value: "none", label: "None – No formal conditions are needed.", exclusive: true },
      ],
    },
    {
      id: "F3a",
      key: "conditions_other",
      section: "Conditions",
      type: "free_text",
      required: true,
      max_length: 380,
      show_if: { q: "F3", has: "other" },
      text: "What is the other condition?",
    },
    /* ── 4/25 ── */
    {
      id: "F4",
      key: "investment",
      section: "Initial capital",
      type: "single_choice",
      required: true,
      text: "Investment. Will the Co-Founders invest money in the startup?",
      help: "Pro Tip: Deciding early on how Co-Founders will contribute financially helps set clear expectations and avoid future disputes.",
      options: [
        { value: "shares", label: "Yes, for shares – Co-Founders will invest and receive shares (subscription of shares)." },
        { value: "loan", label: "Yes, as a loan – Co-Founders will lend money to the startup (director or shareholder loan)." },
        { value: "external", label: "No, relying on external funding – No personal investment from Co-Founders." },
      ],
    },
    /* ── 5/25 ── */
    {
      id: "F5",
      key: "dedication",
      section: "Commitment",
      type: "single_choice",
      required: true,
      text: "Dedication. Do Co-Founders have to commit to the startup full-time?",
      help: "Pro Tip: Agreeing on commitment levels early helps set clear expectations and avoid conflicts.",
      options: [
        { value: "all_full_time", label: "Yes, full-time – All Co-Founders must focus on the startup and avoid other commitments." },
        { value: "some_part_time", label: "Some part-time – Some Co-Founders will keep another full-time job." },
        { value: "all_part_time", label: "All part-time – None of the Co-Founders will work on this full-time." },
      ],
    },
    /* ── 6/25 ── */
    {
      id: "F6",
      key: "board",
      section: "Board",
      type: "single_choice",
      required: true,
      text: "Board Composition. Who gets a seat on the board?",
      help: "Pro Tip: In Singapore, every company must have at least 1 director who is ordinarily resident in Singapore.",
      options: [
        { value: "ceo_only", label: "Co-Founder CEO only – Only the CEO holds a board seat." },
        { value: "some", label: "Some Co-Founders – Only certain Co-Founders will be on the board." },
        { value: "all", label: "All Co-Founders – Every Co-Founder will have a board seat." },
      ],
    },
    /* ── 7/25 ── */
    {
      id: "F7",
      key: "reserved_matters",
      section: "Board",
      type: "multi_choice",
      required: false,
      text: "Reserved Matters. Which decisions need approval from all Co-Founders? (You can select multiple options.)",
      help: "Pro Tip: Reserved matters are major decisions that require everyone’s approval.",
      options: [
        { value: "new_shareholders", label: "Adding new shareholders – Bringing in non-Co-Founders as shareholders." },
        { value: "change_business", label: "Changing the business – Starting a new business or changing the current one." },
        { value: "major_assets", label: "Buying or selling major assets – Large business purchases or sales." },
        { value: "collateral", label: "Using company assets as collateral – Pledging assets, business, or shares for loans." },
        { value: "issue_shares", label: "Issuing new shares – Creating and distributing new company shares." },
        { value: "borrowing", label: "Borrowing money – Taking on company debt." },
        { value: "constitution", label: "Changing company rules – Amending the Company’s constitution." },
        { value: "winding_up", label: "Shutting down or restructuring – Winding up, dissolving, or major restructuring." },
        { value: "merger", label: "Merging or relocating – Redomiciling, merging, consolidating, or moving the business." },
        { value: "disputes", label: "Legal disputes – Starting or joining lawsuits." },
        { value: "share_capital", label: "Changing share capital – Modifying the number or type of shares." },
      ],
    },
    /* ── 8/25 ── */
    {
      id: "F8",
      key: "deadlock",
      section: "Deadlock",
      type: "single_choice",
      required: true,
      text: "Deadlock Event. What happens if Co-Founders can’t agree?",
      help: "Pro Tip: A deadlock happens when Co-Founders can’t reach a decision on an important matter. Having a plan in place helps avoid delays and conflicts.",
      options: [
        { value: "ceo", label: "CEO decides – The Co-Founder CEO makes the final call." },
        { value: "good_faith", label: "Talk it out – Co-Founders must discuss and try to resolve the issue in good faith." },
        { value: "buyout_agreed", label: "Buy-out at agreed price – One Co-Founder can offer to buy the other’s shares at a pre-agreed price." },
        { value: "buyout_fmv", label: "Buy-out at market value – One Co-Founder can buy the other’s shares at 100% of Fair Market Value." },
        { value: "third_party", label: "Third-party decision – An independent third party is appointed to resolve the deadlock." },
      ],
    },
    /* ── 9/25 ── */
    {
      id: "F9",
      key: "deadlock_price",
      section: "Deadlock",
      type: "single_choice",
      required: true,
      show_if: { q: "F8", in: ["buyout_agreed", "buyout_fmv"] },
      text: "Deadlock Event Resolution. If Co-Founders can’t agree and a buyout is triggered, how should the Co-Founder Shares be priced?",
      help: "Pro Tip: The market standard is to buy out shares at Fair Market Value, sometimes with a discount. Pre-determined methods help avoid valuation disputes later.",
      options: [
        { value: "disc_25", label: "25% discount – Shares will be bought at 75% of Fair Market Value." },
        { value: "disc_50", label: "50% discount – Shares will be bought at 50% of Fair Market Value." },
        { value: "disc_75", label: "75% discount – Shares will be bought at 25% of Fair Market Value." },
        { value: "nominal", label: "Nominal price – Shares will be bought out for S$1 (typically for bad leavers)." },
        { value: "valuation", label: "Pre-determined valuation – Shares will be valued based on an agreed method." },
        { value: "fixed", label: "Pre-determined price – Shares will be bought out at a fixed price set in advance." },
      ],
    },
    {
      id: "F9a",
      key: "deadlock_price_detail",
      section: "Deadlock",
      type: "free_text",
      required: true,
      max_length: 380,
      show_if: { q: "F9", in: ["valuation", "fixed"] },
      text: "What is the agreed valuation method or fixed price?",
      placeholder: "e.g. S$3.00 per share, or the last funding-round price",
    },
    /* ── 10/25 ── */
    {
      id: "F10",
      key: "vesting",
      section: "Vesting",
      type: "single_choice",
      required: true,
      text: "Vesting Structure. How will Co-Founders’ shares vest over time?",
      help: "Assumption: Co-Founders will get their shares upfront, but ownership will be earned over time or when certain goals are met (reverse vesting).",
      options: [
        { value: "performance", label: "Performance-based – Shares vest when specific tasks or projects are completed." },
        { value: "time", label: "Time-based – Shares vest gradually over time (e.g., 4 years with a 1-year cliff)." },
        { value: "milestone", label: "Milestone-based – Shares vest when key business goals (like product launches or hitting revenue targets) are met." },
        { value: "other", label: "Other – Use a different vesting method." },
      ],
    },
    {
      id: "F10a",
      key: "vesting_schedule",
      section: "Vesting",
      type: "single_choice",
      required: true,
      default: "4y_monthly_1y_cliff",
      show_if: { q: "F10", eq: "time" },
      text: "What is the vesting schedule?",
      options: [
        { value: "2y_monthly", label: "Over 2 years, monthly" },
        { value: "3y_quarterly_1y_cliff", label: "Over 3 years, quarterly, with a 1-year cliff" },
        { value: "4y_yearly_2y_cliff", label: "Over 4 years, yearly, with a 2-year cliff" },
        { value: "4y_monthly_1y_cliff", label: "Over 4 years, monthly, with a 1-year cliff", recommended: true },
      ],
    },
    {
      id: "F10b",
      key: "vesting_detail",
      section: "Vesting",
      type: "free_text_list",
      required: true,
      max_items: 5,
      max_length: 380,
      show_if: { q: "F10", in: ["performance", "milestone", "other"] },
      text: "For each Co-Founder, what are the deliverables or milestones (or the other method)?",
      placeholder: "Co-Founder name – deliverable or milestone",
    },
    /* ── 11/25 ── */
    {
      id: "F11",
      key: "share_transfers",
      section: "Shares",
      type: "multi_choice",
      required: true,
      text: "Share Transfers. Are there any restrictions on transferring Co-Founder Shares? (You can select multiple options.)",
      help: "Pro Tip: Most startups have some restrictions on share transfers to protect ownership and prevent unwanted third parties from gaining control. “No restrictions” overrides all other options.",
      options: [
        { value: "first_offer", label: "First offer to Co-Founders – Before selling, shares must be offered to existing Shareholders first.", recommended: true },
        { value: "identified_buyer", label: "Pre-approved buyers – The buyer must be identified in the transfer notice." },
        { value: "other", label: "Other conditions – Transfers must follow rules set by Management in writing." },
        { value: "none", label: "No restrictions – Shares can be freely transferred.", exclusive: true },
      ],
    },
    /* ── 12/25 ── */
    {
      id: "F12",
      key: "share_issuances",
      section: "Shares",
      type: "multi_choice",
      required: true,
      default: ["first_offer", "board_approval"],
      text: "Issuing New Shares. If the startup wants to create and distribute new shares, what rules should apply? (You can select multiple options.)",
      help: "Pro Tip: Issuing new shares can dilute existing ownership, so many startups set rules to protect Co-Founders. A common approach is to pick A (offering shares to Co-Founders first) and C (requiring Board approval).",
      options: [
        { value: "first_offer", label: "Offer to Co-Founders first – Existing Co-Founders get the first chance to buy.", recommended: true },
        { value: "identified_buyer", label: "Buyer must be identified – The recipient must be named before shares are issued." },
        { value: "board_approval", label: "Board approval – The Board must approve any new shareholders.", recommended: true },
        { value: "none", label: "No restrictions – Shares can be issued freely.", exclusive: true },
      ],
    },
    /* ── 13/25 ── */
    {
      id: "F13",
      key: "performance",
      section: "Roles",
      type: "multi_choice",
      required: true,
      text: "Performance. What happens if a Co-Founder isn’t meeting expectations? (You can select multiple options.)",
      help: "Pro Tip: It’s important to decide who has the final say on underperformance issues. The Board (B) is sometimes chosen for fairness, while CEO-led decisions (A) are quicker but more centralised.",
      options: [
        { value: "ceo", label: "Co-Founder CEO decides – The CEO will make the final call." },
        { value: "board", label: "Board decides – The Board will review and decide.", recommended: true },
        { value: "consulted", label: "Co-Founders consulted – Other Co-Founders will have a say." },
        { value: "third_party", label: "Third party decides – An independent party will make the decision." },
      ],
    },
    /* ── 14/25 ── */
    {
      id: "F14",
      key: "failure_price",
      section: "Roles",
      type: "single_choice",
      required: true,
      text: "Failure to Contribute. If a Co-Founder fails to fulfil their role, at what price should the shares be bought at?",
      help: "Pro Tip: Most startups apply a discount to the Fair Market Value to reflect the impact of non-performance. Larger discounts or a nominal price are usually reserved for serious misconduct. Pre-determined valuation methods offer more certainty upfront.",
      options: [
        { value: "disc_25", label: "25% discount – Shares will be bought at 75% of Fair Market Value." },
        { value: "disc_50", label: "50% discount – Shares will be bought at 50% of Fair Market Value." },
        { value: "disc_75", label: "75% discount – Shares will be bought at 25% of Fair Market Value." },
        { value: "nominal", label: "Nominal price – Shares will be bought out for S$1 (typically for serious breaches)." },
        { value: "valuation", label: "Pre-determined valuation – Shares will be valued using an agreed method." },
        { value: "fixed", label: "Pre-determined price – Shares will be bought out at a fixed price set in advance." },
        { value: "no_buyout", label: "No Buy-out Option" },
      ],
    },
    {
      id: "F14a",
      key: "failure_price_detail",
      section: "Roles",
      type: "free_text",
      required: true,
      max_length: 380,
      show_if: { q: "F14", in: ["valuation", "fixed"] },
      text: "What is the agreed valuation method or fixed price?",
    },
    /* ── 15/25 ── */
    {
      id: "F15",
      key: "rights",
      section: "Rights",
      type: "multi_choice",
      required: true,
      text: "Co-Founder Rights. What rights will the Co-Founders have? (You can select multiple options.)",
      help: "Pro Tip: Setting clear rights early helps prevent misunderstandings and ensures Co-Founders stay involved in key decisions. Many startups prioritise fair treatment and participation in discussions.",
      options: [
        { value: "recognition", label: "Recognition – Be publicly acknowledged as a Co-Founder in communications and publicity." },
        { value: "discussions", label: "Company discussions – Take part in important discussions about the business.", recommended: true },
        { value: "strategy", label: "Expansion & strategy – Help shape future growth and strategy.", recommended: true },
        { value: "accounts", label: "Access to accounts – Inspect the Company’s financial records." },
        { value: "fair", label: "Fair treatment – Be treated fairly in all matters.", recommended: true },
        { value: "continuity", label: "Agreement continuity – Ensure agreement terms apply to future business structures." },
      ],
    },
    /* ── 16/25 ── */
    {
      id: "F16",
      key: "restrictive_covenants",
      section: "Restrictions",
      type: "single_choice",
      required: true,
      text: "Restrictive Covenants. After leaving, will Co-Founders be restricted from competing or poaching employees?",
      help: "Pro Tip: Many startups set a 3-month restriction to protect the business but keep it short to stay fair. The Board can waive this rule if needed.",
      options: [
        { value: "none", label: "No restrictions – Free to compete or hire employees right away." },
        { value: "3m_shares", label: "Wait 3 months (shares-based) – Restriction applies only after selling shares (Board can waive)." },
        { value: "3m_founder", label: "Wait 3 months (Founder-based) – Restriction applies after stepping down as a Founder (Board can waive)." },
      ],
    },
    /* ── 17/25 ── */
    {
      id: "F17",
      key: "conflict",
      section: "Restrictions",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Conflict of Interest. Should Co-Founders be required to stay committed to the company and avoid competing interests?",
      help: "Pro Tip: This helps prevent Co-Founders from working on projects that could harm the company or create unfair advantages.",
      options: [
        { value: "yes", label: "Yes – Co-Founders must avoid conflicts and get approval before taking on anything that might interfere.", recommended: true },
        { value: "no", label: "No – Co-Founders can take on other roles freely." },
      ],
    },
    /* ── 18/25 ── */
    {
      id: "F18",
      key: "non_disparagement",
      section: "Restrictions",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Non-Disparagement. Should Co-Founders be prohibited from bad-mouthing the startup or each other?",
      help: "Pro Tip: This helps protect the company’s reputation and keeps things professional, even if a Co-Founder leaves.",
      options: [
        { value: "yes", label: "Yes – Co-Founders agree to keep things respectful, even if they leave.", recommended: true },
        { value: "no", label: "No – Co-Founders can say whatever they want." },
      ],
    },
    /* ── 19/25 ── */
    {
      id: "F19",
      key: "good_leaver",
      section: "Leavers",
      type: "single_choice",
      required: true,
      default: "keep",
      text: "Good Leaver Terms. When a Co-Founder leaves on good terms, their unvested shares are returned — but what happens to their vested shares?",
      help: "Pro Tip: Many startups let Good Leavers keep their vested shares, but some prefer a buyback option to maintain control over ownership.",
      options: [
        { value: "keep", label: "Good Leaver keeps vested shares – No buyback, they stay a shareholder.", recommended: true },
        { value: "fmv", label: "Buyback at Fair Market Value – The company can buy the shares at market price." },
        { value: "disc_25", label: "Buyback at a 25% discount – The company can buy the shares at 75% of market value." },
        { value: "fixed", label: "Buyback at pre-determined price – Shares will be bought at a fixed price set in advance." },
        { value: "cost", label: "Buyback at original investment amount – The company buys the shares for what was originally paid." },
      ],
    },
    /* ── 20/25 ── */
    {
      id: "F20",
      key: "bad_leaver_causes",
      section: "Leavers",
      type: "multi_choice",
      required: true,
      default: ["misconduct", "breach", "confidentiality", "crime", "reputation", "fiduciary"],
      text: "Cause of Bad Leaver. What makes a Co-Founder a Bad Leaver? (You can select multiple options.)",
      help: "Pro Tip: Most startups classify all of these as Bad Leaver behaviour to protect the company. Choose what would seriously harm your business.",
      options: [
        { value: "misconduct", label: "Serious misconduct – Disloyalty, gross negligence, wilful misconduct, dishonesty, or fraud.", recommended: true },
        { value: "breach", label: "Breaking agreements – Breaching this Agreement, an employment contract, or company policies.", recommended: true },
        { value: "confidentiality", label: "Sharing confidential info – Unauthorised disclosure or misuse of trade secrets or confidential information.", recommended: true },
        { value: "crime", label: "Criminal offence – Charged with or convicted of a crime (excluding minor traffic violations).", recommended: true },
        { value: "reputation", label: "Damaging company reputation – Engaging in fraud, illegal activities, or any conduct that harms the company’s image.", recommended: true },
        { value: "fiduciary", label: "Acting against the company – Breaching fiduciary duties or acting against the company’s best interests.", recommended: true },
      ],
    },
    /* ── 21/25 ── */
    {
      id: "F21",
      key: "bad_leaver_terms",
      section: "Leavers",
      type: "single_choice",
      required: true,
      text: "Bad Leaver Terms. If a Co-Founder is a Bad Leaver, their unvested shares will be returned — but what happens to their vested shares?",
      help: "Pro Tip: Many startups don’t let Bad Leavers keep their vested shares. The company usually buys them back, often at a discount or a nominal price.",
      options: [
        { value: "keep", label: "They keep them – The Bad Leaver retains all vested shares." },
        { value: "disc_50", label: "Return at 50% off – Shares are returned at half of market value." },
        { value: "fixed", label: "Return at a fixed price – Price is set in advance." },
        { value: "nominal", label: "Return all for S$1 – The company takes back all shares for S$1." },
        { value: "free", label: "Return for free – The company takes back all shares with no payment." },
      ],
    },
    /* ── 22/25 ── */
    {
      id: "F22",
      key: "sale_cooperation",
      section: "Exit",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Selling the Company. Would you like to include a clause stating that, if the company is sold, Co-Founders must take the necessary steps to complete the sale?",
      help: "Pro Tip: This clause ensures all Co-Founders cooperate in a sale, preventing anyone from blocking or delaying the process.",
      options: [
        { value: "yes", label: "Yes – Include this clause.", recommended: true },
        { value: "no", label: "No – Do not include this clause." },
      ],
    },
    /* ── 23/25 ── */
    {
      id: "F23",
      key: "confidentiality",
      section: "Protection",
      type: "single_choice",
      required: true,
      text: "Confidentiality. Should Co-Founders be required to keep company information confidential?",
      help: "Pro Tip: Confidentiality protects your business. Lifelong offers the most security, while time-limited gives flexibility. Choose what fits your needs.",
      options: [
        { value: "perpetual", label: "Forever – Confidentiality applies permanently.", recommended: true },
        { value: "while_shareholder", label: "While a shareholder – Obligation lasts as long as the Co-Founder holds shares." },
        { value: "5y", label: "For 5 years – Obligation continues for 5 years after leaving." },
        { value: "2y", label: "For 2 years – Obligation continues for 2 years after leaving." },
        { value: "none", label: "No – No confidentiality obligation." },
      ],
    },
    /* ── 24/25 ── */
    {
      id: "F24",
      key: "ip_assignment",
      section: "Protection",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "IP Assignment. Should all intellectual property (IP) created by a Co-Founder belong to the company?",
      help: "Pro Tip: Most startups assign IP to the company to protect their business and avoid future disputes. If you prefer flexibility, IP ownership can be handled separately.",
      options: [
        { value: "yes", label: "Yes – All IP created by Co-Founders will belong to the company.", recommended: true },
        { value: "no", label: "No – IP ownership will be documented separately." },
      ],
    },
    /* ── 25/25 ── */
    {
      id: "F25",
      key: "winding_up",
      section: "Exit",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Closing the Company. Would you like to include a clause stating that, if Co-Founders agree to shut down the company, they must: (1) sell company assets for cash, (2) let Co-Founders buy company IP first, and (3) pay off debts before splitting any remaining money?",
      help: "Pro Tip: This clause ensures everything is handled fairly and in an organised way if the company closes. If you choose No, the relevant insolvency laws of your country will apply instead.",
      options: [
        { value: "yes", label: "Yes – Include this clause.", recommended: true },
        { value: "no", label: "No – Do not include this clause (insolvency laws will apply)." },
      ],
    },
  ],
} as const;
