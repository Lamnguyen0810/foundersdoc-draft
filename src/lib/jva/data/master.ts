/**
 * Joint Venture Agreement — the wording FD AI assembles from.
 *
 * Founders Doc's own wording for a joint venture company (the "Company")
 * owned by two parties, Party A and Party B, each an individual or a
 * company, either 50:50 or with Party A as the majority. Its structure
 * follows the usual joint venture shareholders' agreement — the company and
 * its business, the investment, the board, reserved matters, funding,
 * information, dividends, deadlock, transfers, default, restrictions,
 * confidentiality and termination — but every sentence is written here.
 *
 *   Basic     the company, its business and constitution · the shares and
 *             what each party pays · the board · a short list of reserved
 *             matters · deadlock (meet, mediate, then the matter drops) ·
 *             transfers (first refusal or consent) · pre-emption ·
 *             confidentiality · duration
 *   Standard  + further funding (voluntary or up to a cap) · the full
 *             reserved matters (Schedule 2) · business plan · accounts and
 *             information · dividends · a deadlock buy-out ("shotgun") or
 *             winding up · lock-in · default events at fair value · competing
 *             and poaching · deed of adherence (Schedule 3)
 *   Complex   + tag- and drag-along · a discount for the party at fault ·
 *             anti-corruption
 *
 * Written for any jurisdiction: the governing law picks a row of
 * JURISDICTIONS, which supplies the name of the constitution, the
 * third-party rights statute, the mediation and arbitration rules, the
 * courts and who appoints an independent accountant.
 *
 * Markup, as the other masters: {{field}}, {{clause:id}}, {{section:id}},
 * **bold**. Where a point has versions, each is kept and keyed (`when`);
 * the assembler picks by the answers and the level.
 */

export const MASTER_VERSION = "JV-V1";
export const MASTER_LOADED = true;

export interface MasterSub {
  ref: string | null;
  text: string;
  subs?: MasterSub[];
  id?: string;
  when?: string;
}

export interface MasterClause {
  id: string;
  when?: string;
  text: string;
  subs?: MasterSub[];
  tail?: string;
}

export interface MasterSection {
  id: string;
  heading: string;
  when?: string;
  clauses: MasterClause[];
}

/* ── the jurisdictions ────────────────────────────────────────────────── */

export interface Jurisdiction {
  /** As it follows "the laws of". */
  law: string;
  /** As it follows "incorporated in". */
  place: string;
  /** What the Constitution is, as it follows "means". */
  constitution: string;
  /** "has no right under {{tp_statute}} or otherwise"; "" when there is no statute. */
  tpStatute: string;
  /** Business Days. */
  city: string;
  /** Mediation: "… refer it to mediation {{mediation}}". */
  mediation: string;
  /** Arbitration: seat, rules and institution. */
  seat: string;
  rules: string;
  institution: string;
  /** The courts, when the parties choose courts over arbitration. */
  courts: string;
  /** Who appoints the independent accountant if the Parties cannot agree. */
  appointer: string;
  /** United States: a corporation, with stockholders. */
  us: boolean;
  /** What a lawyer there should check. */
  checkLocally: string;
}

export const JURISDICTIONS: Record<string, Jurisdiction> = {
  sg: {
    law: "Singapore",
    place: "Singapore",
    constitution: "the constitution of the Company",
    tpStatute: "the Contracts (Rights of Third Parties) Act 2001 of Singapore",
    city: "Singapore",
    mediation: "at the Singapore Mediation Centre, under its mediation procedure then in force",
    seat: "Singapore",
    rules: "the Arbitration Rules of the Singapore International Arbitration Centre",
    institution: "the Singapore International Arbitration Centre",
    courts: "the courts of Singapore",
    appointer: "the President of the Institute of Singapore Chartered Accountants",
    us: false,
    checkLocally: "that the constitution is amended to match (the Companies Act 1967 lets the constitution, not this agreement, bind the company and future members), and whether any filings with ACRA are needed for the share issue and the directors",
  },
  ew: {
    law: "England and Wales",
    place: "England and Wales",
    constitution: "the articles of association of the Company",
    tpStatute: "the Contracts (Rights of Third Parties) Act 1999",
    city: "London, United Kingdom",
    mediation: "under the Model Mediation Procedure of the Centre for Effective Dispute Resolution",
    seat: "London",
    rules: "the LCIA Arbitration Rules",
    institution: "the London Court of International Arbitration",
    courts: "the courts of England and Wales",
    appointer: "the President of the Institute of Chartered Accountants in England and Wales",
    us: false,
    checkLocally: "that the articles of association are amended to match, that the Company itself is not made a party to any restriction on its statutory powers (Russell v Northern Bank), and any filings at Companies House",
  },
  hk: {
    law: "Hong Kong",
    place: "Hong Kong",
    constitution: "the articles of association of the Company",
    tpStatute: "the Contracts (Rights of Third Parties) Ordinance (Cap. 623) of Hong Kong",
    city: "Hong Kong",
    mediation: "under the Mediation Rules of the Hong Kong International Arbitration Centre",
    seat: "Hong Kong",
    rules: "the HKIAC Administered Arbitration Rules",
    institution: "the Hong Kong International Arbitration Centre",
    courts: "the courts of Hong Kong",
    appointer: "the President of the Hong Kong Institute of Certified Public Accountants",
    us: false,
    checkLocally: "that the articles of association are amended to match under the Companies Ordinance (Cap. 622), any stamp duty on share transfers, and filings with the Companies Registry",
  },
  ny: {
    law: "the State of New York",
    place: "the State of New York",
    constitution: "the certificate of incorporation and the bylaws of the Company",
    tpStatute: "",
    city: "New York, United States",
    mediation: "administered by the International Centre for Dispute Resolution, under its mediation procedures",
    seat: "New York, New York",
    rules: "the International Arbitration Rules of the International Centre for Dispute Resolution",
    institution: "the International Centre for Dispute Resolution",
    courts: "the state and federal courts located in the Borough of Manhattan, New York",
    appointer: "the International Centre for Dispute Resolution",
    us: true,
    checkLocally: "whether the joint venture should be a corporation or a limited liability company (with an operating agreement instead), that the certificate of incorporation and bylaws match, any securities law points on the share issue, and that Schedule 3 is signed as an adherence agreement (US law has no deeds)",
  },
  de: {
    law: "the State of Delaware",
    place: "the State of Delaware",
    constitution: "the certificate of incorporation and the bylaws of the Company",
    tpStatute: "",
    city: "Wilmington, Delaware, United States",
    mediation: "administered by the International Centre for Dispute Resolution, under its mediation procedures",
    seat: "Wilmington, Delaware",
    rules: "the International Arbitration Rules of the International Centre for Dispute Resolution",
    institution: "the International Centre for Dispute Resolution",
    courts: "the state and federal courts located in the State of Delaware",
    appointer: "the International Centre for Dispute Resolution",
    us: true,
    checkLocally: "whether the joint venture should be a corporation or a limited liability company (with an operating agreement instead), that the certificate of incorporation and bylaws match the Delaware General Corporation Law, any securities law points on the share issue, and that Schedule 3 is signed as an adherence agreement (US law has no deeds)",
  },
};

/** "Other": entries left as [●] for a lawyer there. */
export const OTHER_JURISDICTION: Omit<Jurisdiction, "law" | "place"> = {
  constitution: "the constitutional documents of the Company",
  tpStatute: "",
  city: "",
  mediation: "with a mediator agreed by the Parties",
  seat: "",
  rules: "the Arbitration Rules of the International Chamber of Commerce",
  institution: "the International Chamber of Commerce",
  courts: "",
  appointer: "",
  us: false,
  checkLocally: "how the company's constitution must be amended to match, whether shareholder agreements of this kind are enforceable there, and any filings needed for the share issue",
};

/* ── the head ─────────────────────────────────────────────────────────── */

export const TITLE = "JOINT VENTURE AGREEMENT";
export const MADE_ON = "This Joint Venture Agreement (this \"**Agreement**\") is made on {{date}}";
export const BETWEEN = "Between:";
export const PARTY_COMPANY = "{{name}} (Registration Number {{id_no}}), a company incorporated in {{jurisdiction}} with its registered address at {{address}}";
export const PARTY_INDIVIDUAL = "{{name}} (identity card / passport number {{id_no}}), of {{address}}";
export const PARTIES_COLLECTIVE = "(each a \"**Party**\" and together the \"**Parties**\").";
export const BACKGROUND = "BACKGROUND";

export const RECITALS: Record<string, string> = {
  new: "The Parties wish to set up a company to be incorporated in {{place}} under the name {{jvc}} (or another name the Parties agree) (the \"**Company**\"), as a joint venture to carry on the Business.",
  existing: "{{jvc}}{{jvc_number}} is a company incorporated in {{place}} (the \"**Company**\"), which the Parties wish to carry on the Business as their joint venture.",
};
export const RECITAL_B = "The Parties have agreed to hold the Shares as to {{pct_a}} by Party A and {{pct_b}} by Party B, and to regulate their relationship as shareholders of the Company on the terms of this Agreement.";
export const AGREED = "It is agreed as follows:";

/* ── the definitions ──────────────────────────────────────────────────── */

export interface Definition {
  term: string;
  text: string;
  when?: string;
}

export const DEFINITIONS: Definition[] = [
  { term: "Affiliate", when: "any_company", text: "means, in relation to a Party that is a company, any company that controls, is controlled by or is under common control with it, where \"control\" means holding more than half of the voting rights, or the right to appoint or remove a majority of the board of directors;" },
  { term: "Agreed Proportions", text: "means the proportions in which the Parties hold the Shares, as set out in {{clause:shareholdings}} (Shareholdings) and as changed in accordance with this Agreement;" },
  { term: "Board", text: "means the board of directors of the Company;" },
  { term: "Business", text: "means the business that the Company is set up to carry on, namely: {{business}}; and any other business that the Parties agree in writing the Company may carry on;" },
  { term: "Business Day", text: "means a day (other than a Saturday, a Sunday or a public holiday) on which banks are open for general business in {{city}};" },
  { term: "Business Plan", when: "plan", text: "has the meaning given to it in {{clause:plan}} (Business Plan);" },
  { term: "Completion", text: "means completion of the subscriptions for Shares under {{clause:completion}} (Completion);" },
  { term: "Confidential Information", text: "means all information of a confidential nature (in whatever form) about the Company, its Business, or the business or affairs of either Party, that a Party receives in connection with this Agreement or the Company, and the terms of this Agreement;" },
  { term: "Constitution", text: "means {{constitution_def}}, as amended from time to time;" },
  { term: "Deadlock Notice", text: "has the meaning given to it in {{clause:deadlock}} (Deadlock);" },
  { term: "Deed of Adherence", when: "adherence", text: "has the meaning given to it in {{clause:adherence}} (Deed of Adherence);" },
  { term: "Default Event", when: "default", text: "has the meaning given to it in {{clause:default_events}} (Default Events);" },
  { term: "Director", text: "means a director of the Company;" },
  { term: "Fair Value", when: "valuation", text: "has the meaning given to it in {{clause:fair_value}} (Fair Value);" },
  { term: "Financial Year", text: "means each financial year of the Company;" },
  { term: "Reserved Matters", text: "has the meaning given to it in {{clause:reserved}} (Reserved Matters);" },
  { term: "Shares", text: "means {{shares_def}}, and \"**Shareholder**\" means a holder of Shares." },
];

export const INTERPRETATION: string[] = [
  "The headings in this Agreement are for convenience only and do not affect its interpretation.",
  "References to Clauses and Schedules are to the clauses of, and the schedules to, this Agreement, and the Schedules form part of this Agreement.",
  "A \"person\" includes an individual, a company, a partnership, a trust and any other body, whether or not it has a separate legal personality, and a reference to a Party includes its successors, personal representatives and permitted assigns.",
  "Words in the singular include the plural and vice versa, and \"including\" and similar words do not limit the words before them.",
  "Where a Party is required to \"procure\" that the Company does or does not do something, it shall exercise its votes and other rights as a Shareholder, and use its powers to procure that the Directors it appoints act (subject to their duties as directors), to that end.",
  "A reference to a law is to that law as amended or replaced from time to time, and \"writing\" includes email.",
];

/* ── the reserved matters (Schedule 2, or Clause 5 at Basic) ─────────── */

export const RESERVED_TEXT: Record<string, string> = {
  constitution: "altering the Constitution, or the rights attaching to any Shares;",
  shares: "issuing, allotting, buying back, redeeming or cancelling any Shares or other securities, granting any option or other right over them, or reducing or otherwise altering the Company's share capital, except as this Agreement provides;",
  wind_up: "passing any resolution to wind up the Company, applying for any insolvency procedure in respect of it, or proposing any arrangement with its creditors, except where the law requires it;",
  business_change: "changing the nature of the Business, starting any new business, or changing the Company's name;",
  sale: "selling, transferring or otherwise disposing of the whole or a substantial part of the Company's business or assets, or merging or amalgamating the Company with any other person;",
  plan: "adopting or materially changing any Business Plan, or making any capital expenditure not provided for in the current Business Plan;",
  borrowing: "borrowing money, or incurring any other indebtedness, of more than {{borrowing_limit}} in total at any one time, other than trade credit in the ordinary course of the Business;",
  related: "entering into, varying or ending any contract or arrangement between the Company and {{related_party}};",
  dividends: "declaring or paying any dividend or other distribution;",
  senior_hires: "appointing or dismissing the chief executive or any other senior manager of the Company, or changing the terms of their engagement;",
  auditors: "appointing or removing the Company's auditors, changing its Financial Year end, or making any material change to its accounting policies;",
  litigation: "starting, settling or abandoning any legal proceedings, other than routine debt collection in the ordinary course of the Business;",
  subsidiaries: "forming any subsidiary, acquiring any shares in or the business of any other company, or entering into any partnership or joint venture;",
  security: "creating any mortgage, charge or other security over any of the Company's assets, or giving any guarantee or indemnity, other than in the ordinary course of the Business; and",
  ip: "selling, assigning or licensing any intellectual property owned or used by the Company, other than non-exclusive licences granted to customers in the ordinary course of the Business.",
};
export const RESERVED_ORDER = ["constitution", "shares", "wind_up", "business_change", "sale", "plan", "borrowing", "related", "dividends", "senior_hires", "auditors", "litigation", "subsidiaries", "security", "ip"] as const;

/* ── the clauses ──────────────────────────────────────────────────────── */

export const SECTIONS: MasterSection[] = [
  {
    id: "interpretation",
    heading: "INTERPRETATION",
    clauses: [
      { id: "definitions", text: "**Definitions.** In this Agreement, unless the context requires otherwise:" },
      { id: "interpretation", text: "**Interpretation.** In this Agreement:" },
    ],
  },
  {
    id: "company",
    heading: "THE COMPANY AND ITS BUSINESS",
    clauses: [
      {
        id: "incorporation",
        when: "new",
        text: "**Incorporation.** As soon as practicable after the date of this Agreement, the Parties shall cause the Company to be incorporated in {{place}}, with a Constitution consistent with this Agreement, and shall share the costs of incorporation in their Agreed Proportions.",
      },
      { id: "business", text: "**The Business.** The Parties shall procure that the Company carries on the Business, and no other business, in accordance with this Agreement{{plan_ref}} and on sound commercial principles, with the aim of making the Business as profitable as it can be." },
      {
        id: "constitution",
        text: "**Constitution.** The Parties shall procure that the Constitution is consistent with this Agreement, and shall vote to amend it where it is not. If there is any conflict between this Agreement and the Constitution, this Agreement prevails as between the Parties.",
      },
    ],
  },
  {
    id: "shares",
    heading: "SHARES AND INVESTMENT",
    clauses: [
      { id: "shareholdings", text: "**Shareholdings.** The Parties shall hold the issued Shares in the following proportions: Party A, {{pct_a}}; and Party B, {{pct_b}}." },
      {
        id: "subscription",
        text: "**Subscription.** At Completion, each Party shall subscribe for the number of Shares set out against its name in Schedule 1, and pay the subscription price set out there in cash to the Company's bank account: Party A, {{invest_a}}; and Party B, {{invest_b}}.",
      },
      {
        id: "completion",
        text: "**Completion.** Completion shall take place within ten (10) Business Days after {{completion_from}}, or on another date the Parties agree. At Completion:",
        subs: [
          { ref: "(a)", text: "each Party shall pay its subscription price, and the Company shall issue the Shares to it and enter it in its {{register}};" },
          { ref: "(b)", text: "the Board shall appoint the Directors nominated by each Party under {{clause:board}} (Board); and" },
          { ref: "(c)", text: "the Parties shall procure that the Company adopts a Constitution consistent with this Agreement and opens a bank account, if it has not already done so." },
        ],
      },
    ],
  },
  {
    id: "board",
    heading: "BOARD AND MANAGEMENT",
    clauses: [
      {
        id: "board",
        text: "**Board.** The Board shall consist of {{board_total}} Directors. Party A may appoint {{dir_a}}, and Party B may appoint {{dir_b}}, and each Party may remove and replace any Director it has appointed, by written notice to the Company and the other Party. Each Party shall vote to give effect to any such appointment or removal.",
      },
      { id: "chair", when: "chair_none", text: "**Chair.** The Directors present at each Board meeting shall choose one of their number to chair it. The chair does not have a casting vote." },
      {
        id: "chair",
        when: "chair_rotate",
        text: "**Chair.** The chair of the Board shall be a Director appointed by Party A for the first year after Completion, then a Director appointed by Party B for the next year, and so on in turn. The chair has a casting vote at Board meetings if votes are equal, except on a Reserved Matter.",
      },
      { id: "chair", when: "chair_majority_casting", text: "**Chair.** Party A may appoint one of the Directors it has appointed as chair of the Board. The chair has a casting vote at Board meetings if votes are equal, except on a Reserved Matter." },
      { id: "chair", when: "chair_majority_plain", text: "**Chair.** Party A may appoint one of the Directors it has appointed as chair of the Board. The chair does not have a casting vote." },
      {
        id: "meetings",
        text: "**Board Meetings.** The Board shall meet at least {{meetings}} a year, on at least five (5) Business Days' written notice to every Director (or shorter notice if all the Directors agree), with an agenda. Directors may take part by video or telephone. The quorum is {{quorum}}. If a quorum is not present within thirty (30) minutes after the time set, the meeting stands adjourned to the same time and place five (5) Business Days later, where {{adjourned_quorum}}.",
      },
      {
        id: "decisions",
        text: "**Decisions of the Board.** Each Director has one vote. Subject to {{clause:reserved}} (Reserved Matters), the Board decides by a majority of the votes cast. A written resolution signed (including electronically) by all the Directors is as valid as one passed at a meeting.",
      },
      { id: "management", when: "standard", text: "**Day-to-Day Management.** The Board may delegate the day-to-day running of the Business to a chief executive and other managers it appoints, within the Business Plan and any limits the Board sets." },
      { id: "director_pay", text: "**Directors' Fees and Expenses.** Unless the Parties agree otherwise in writing, Directors are not paid for acting as Directors, but the Company shall reimburse their reasonable expenses of doing so." },
    ],
  },
  {
    id: "reserved",
    heading: "RESERVED MATTERS",
    clauses: [
      { id: "reserved", when: "reserved_inline", text: "**Reserved Matters.** The Parties shall procure that the Company does not do any of the following (the \"**Reserved Matters**\") without the prior written consent of both Parties:" },
      { id: "reserved", when: "reserved_schedule", text: "**Reserved Matters.** The Parties shall procure that the Company does not do any of the matters listed in Schedule 2 (the \"**Reserved Matters**\") without the prior written consent of both Parties." },
      {
        id: "consent",
        when: "standard",
        text: "**Giving Consent.** A Party shall give or refuse its consent to a Reserved Matter within ten (10) Business Days after being asked in writing. A Party's consent may be given in writing, or by the vote in favour at a Board meeting of all the Directors it has appointed who are present.",
      },
    ],
  },
  {
    id: "funding",
    heading: "FUNDING",
    when: "standard",
    clauses: [
      {
        id: "funding",
        when: "funding_voluntary",
        text: "**Further Funding.** Neither Party is obliged to provide any further money to the Company. If the Board decides that the Company needs further finance, the Company shall first seek it from banks or other third parties on reasonable terms, and each Party may (but need not) offer to provide its Agreed Proportion of it, by subscribing for new Shares under {{clause:pre_emption}} (Pre-Emption) or by loan, on terms the Board approves.",
      },
      {
        id: "funding",
        when: "funding_cap",
        text: "**Further Funding.** If the Board decides that the Company needs further finance to carry out the Business Plan, each Party shall provide its Agreed Proportion of the amount required within twenty (20) Business Days after the Board's written request, by subscribing for new Shares or by loan on terms the Board approves, up to a total of {{funding_cap}} for each Party over the life of this Agreement. Any finance beyond that amount is voluntary.",
      },
      {
        id: "shortfall",
        when: "funding_cap",
        text: "**Failure to Fund.** If a Party does not provide funding that it is obliged to provide under {{clause:funding}} (Further Funding), the other Party may provide the shortfall itself, by subscribing for new Shares at the price the Board decides, and the Agreed Proportions change accordingly.",
      },
      {
        id: "guarantees",
        text: "**Guarantees.** If, with the other Party's written agreement, a Party gives any guarantee or security for the obligations of the Company, the Parties shall bear any liability under it in their Agreed Proportions, and each shall indemnify the other to the extent that the other pays more than its share.",
      },
    ],
  },
  {
    id: "plan",
    heading: "BUSINESS PLAN AND INFORMATION",
    when: "standard",
    clauses: [
      {
        id: "plan",
        text: "**Business Plan.** The Board shall adopt a business plan and budget for the Company for each Financial Year (the \"**Business Plan**\"), the first within sixty (60) days after Completion and each later one at least thirty (30) days before the Financial Year begins. Until a new Business Plan is adopted, the Company shall continue to operate in line with the previous one.",
      },
      { id: "records", text: "**Records and Accounts.** The Company shall keep proper accounting records, and its accounts shall be audited each year by auditors appointed by the Board, unless the law allows the audit to be dispensed with and both Parties agree." },
      {
        id: "information",
        text: "**Information.** The Company shall send each Party:",
        subs: [
          { ref: "(a)", text: "management accounts within twenty (20) days after the end of each month (or, if the Parties agree, each quarter);" },
          { ref: "(b)", text: "its annual accounts within one hundred and twenty (120) days after the end of each Financial Year; and" },
          { ref: "(c)", text: "any other information about the Company that a Party reasonably asks for." },
        ],
      },
      { id: "access", text: "**Access.** Each Party may, on reasonable notice and at its own cost, inspect the Company's books and records and discuss its affairs with its managers and auditors." },
    ],
  },
  {
    id: "dividends",
    heading: "DIVIDENDS",
    when: "standard",
    clauses: [
      {
        id: "dividends",
        when: "dividends_distribute",
        text: "**Dividend Policy.** Subject to the law and to the Company's working capital needs and the Business Plan, the Parties shall procure that the Company distributes by way of dividend, in each Financial Year, as much of its profits available for distribution as the Board considers can prudently be distributed.",
      },
      { id: "dividends", when: "dividends_reinvest", text: "**Dividend Policy.** The Company shall reinvest its profits in the Business, and shall declare a dividend only with the prior written consent of both Parties." },
    ],
  },
  {
    id: "deadlock",
    heading: "DEADLOCK",
    clauses: [
      {
        id: "deadlock",
        text: "**Deadlock.** A deadlock arises if {{deadlock_trigger}}, and either Party then gives the other a written notice saying that it considers a deadlock has arisen and describing the matter (a \"**Deadlock Notice**\").",
      },
      {
        id: "senior",
        text: "**Senior People.** Within ten (10) Business Days after a Deadlock Notice, the matter shall be referred to a senior representative of each Party with authority to settle it (or, for a Party who is an individual, to that Party personally), who shall meet and try in good faith to resolve it.",
      },
      {
        id: "mediation",
        text: "**Mediation.** If the matter is not resolved within twenty (20) Business Days after the Deadlock Notice, either Party may refer it to mediation {{mediation}}. The Parties shall share the mediator's fees equally.",
      },
      {
        id: "unresolved",
        when: "deadlock_escalate",
        text: "**If Still Unresolved.** If the matter is not resolved within forty (40) Business Days after the Deadlock Notice, the proposal that caused the deadlock is treated as rejected, and the Company carries on the Business as before.",
      },
      {
        id: "unresolved",
        when: "deadlock_shotgun",
        text: "**Buy-Out Offer.** If the matter is not resolved within forty (40) Business Days after the Deadlock Notice, either Party (the \"**Offeror**\") may give the other (the \"**Receiving Party**\") a written notice naming a cash price for each Share. Within thirty (30) Business Days after that notice, the Receiving Party shall choose either to sell all its Shares to the Offeror, or to buy all the Offeror's Shares, in each case at that price per Share; if it does not choose in time, it is treated as having chosen to sell. The sale shall complete under {{clause:sale_completion}} (Completing a Sale) within twenty (20) Business Days after the choice is made or treated as made. If both Parties give such a notice, the one given first prevails.",
      },
      {
        id: "unresolved",
        when: "deadlock_wind_up",
        text: "**Winding Up.** If the matter is not resolved within forty (40) Business Days after the Deadlock Notice, either Party may by written notice require the Company to be wound up, and the Parties shall then vote for, and take all other steps needed to bring about, the solvent winding up of the Company in accordance with {{clause:winding_up}} (Winding Up).",
      },
    ],
  },
  {
    id: "transfers",
    heading: "TRANSFER OF SHARES",
    clauses: [
      {
        id: "no_transfer",
        text: "**No Transfer Except as Allowed.** A Party shall not sell, transfer, charge or otherwise deal with any of its Shares, or any interest in them, except as this Agreement allows. A Party that transfers Shares shall transfer all (and not only some) of its Shares, and the buyer must first {{adherence_step}}.",
      },
      { id: "lock_in", when: "lock_in", text: "**Lock-In.** Neither Party may transfer any Shares within {{lock_in}} after the date of this Agreement, except {{lock_in_except}}with the other Party's prior written consent." },
      {
        id: "group",
        when: "any_company",
        text: "**Group Transfers.** A Party that is a company may transfer all its Shares to its Affiliate, provided that the Affiliate shall first {{adherence_step}}, and that, if the Affiliate is to stop being an Affiliate of that Party, the Shares are first transferred back to that Party (or to another of its Affiliates).",
      },
      { id: "consent_transfer", when: "transfers_consent", text: "**Consent Required.** A Party may transfer its Shares to anyone else only with the other Party's prior written consent." },
      {
        id: "first_refusal",
        when: "transfers_first_refusal",
        text: "**Right of First Refusal.** A Party that wishes to sell its Shares (the \"**Seller**\") shall first offer them to the other Party by written notice, stating the price and the other terms on which it is willing to sell. The other Party may accept the offer, for all the Shares, within thirty (30) Business Days. If it does not, the Seller may, within sixty (60) Business Days after that period ends, sell all the Shares to a third party at a price no lower, and on terms no more favourable to the buyer, than those offered.",
      },
      {
        id: "tag",
        when: "tag",
        text: "**Tag-Along.** If Party A agrees to sell its Shares to a third party{{not_affiliate}}, it shall procure that the buyer offers to buy all of Party B's Shares at the same price per Share and on the same terms, and Party A shall not complete its sale unless that offer has been made and, if Party B accepts it, completes at the same time.",
      },
      {
        id: "drag",
        when: "drag",
        text: "**Drag-Along.** If Party A agrees to sell all its Shares to a third party{{not_affiliate}} on arm's length terms, it may require Party B to sell all of Party B's Shares to that buyer at the same price per Share and on the same terms, by giving Party B at least twenty (20) Business Days' written notice before completion.",
      },
      {
        id: "adherence",
        when: "adherence",
        text: "**Deed of Adherence.** No person (other than a Party) shall be registered as a holder of Shares unless it has first signed a deed of adherence in the form set out in Schedule 3 (a \"**Deed of Adherence**\"), by which it agrees to be bound by this Agreement as if it were a Party.",
      },
    ],
  },
  {
    id: "new_shares",
    heading: "NEW SHARES",
    clauses: [
      {
        id: "pre_emption",
        text: "**Pre-Emption.** Any new Shares, or rights to subscribe for Shares, that the Company issues with the Parties' consent shall first be offered to the Parties in their Agreed Proportions, at the same price and on the same terms. Any Shares that a Party does not take up within twenty (20) Business Days after the offer may be offered to the other Party.",
      },
    ],
  },
  {
    id: "default",
    heading: "DEFAULT",
    when: "default",
    clauses: [
      {
        id: "default_events",
        text: "**Default Events.** Each of the following is a \"**Default Event**\" in relation to a Party:",
        subs: [
          { ref: "(a)", text: "it commits a material breach of this Agreement and (if the breach can be remedied) does not remedy it within thirty (30) days after being asked in writing to do so;" },
          { ref: "(b)", text: "it becomes unable to pay its debts as they fall due, makes any arrangement with its creditors generally, has a receiver, liquidator, judicial manager, administrator or similar officer appointed over it or any of its assets, or (if an individual) is made bankrupt;" },
          { ref: "(c)", when: "any_company", text: "being a company, it undergoes a change of control (as defined in the definition of Affiliate) without the other Party's prior written consent; and" },
          { ref: "(d)", when: "any_individual", text: "being an individual, he or she dies or becomes unable, through illness or incapacity, to manage his or her own affairs." },
        ],
      },
      {
        id: "default_option",
        text: "**Option to Buy.** Within sixty (60) Business Days after becoming aware of a Default Event, the other Party may by written notice require the Party concerned (or its personal representatives, liquidator or other successor) to sell all its Shares to it at {{default_price}}. The sale shall complete under {{clause:sale_completion}} (Completing a Sale) within twenty (20) Business Days after the price is agreed or determined.",
      },
    ],
  },
  {
    id: "valuation",
    heading: "VALUATION AND COMPLETING SALES",
    clauses: [
      {
        id: "fair_value",
        when: "valuation",
        text: "**Fair Value.** Where Shares are to be sold at \"**Fair Value**\", the price is the amount the Parties agree or, if they have not agreed within twenty (20) Business Days, the amount that an independent firm of accountants appointed by the Parties (or, if they cannot agree, by {{appointer}}) certifies as the fair value of those Shares. The accountants shall value the Shares as a proportion of the value of the whole Company, on a going-concern basis between a willing buyer and a willing seller, with no discount for a minority holding. They act as experts and not as arbitrators, their decision is final except for manifest error, and their costs are borne equally by the buyer and the seller.",
      },
      {
        id: "sale_completion",
        text: "**Completing a Sale.** On completion of any sale of Shares under this Agreement, the seller shall deliver a signed transfer of the Shares (with any share certificates) free from any charge or other third-party right, against payment of the price in cleared funds, and shall procure the resignation of any Director it appointed, without any claim against the Company. The seller gives no warranty other than that it owns the Shares and has the right to sell them.",
      },
    ],
  },
  {
    id: "restrictions",
    heading: "RESTRICTIONS ON THE PARTIES",
    when: "restrictions",
    clauses: [
      {
        id: "non_compete",
        text: "**Non-Competition.** Each Party shall not{{affiliates_too}} carry on, or be engaged, concerned or interested in, any business that competes with the Business in any country in which the Company carries on the Business, while it holds Shares{{after_period}}. Holding, as an investment only, up to five per cent. (5%) of the listed shares of any company is not a breach of this Clause.",
      },
      {
        id: "non_solicit",
        text: "**Non-Solicitation.** During the same period, each Party shall not{{affiliates_too}} solicit or employ any senior employee of the Company, or solicit any customer of the Company away from it.",
      },
      {
        id: "reasonable",
        text: "**Reasonableness.** Each Party agrees that these restrictions are reasonable and no more than is needed to protect the Business and the value of the Shares. If any of them is found to go further than is enforceable, it applies with the smallest change needed to make it enforceable.",
      },
    ],
  },
  {
    id: "anti_corruption",
    heading: "ANTI-CORRUPTION",
    when: "anti_corruption",
    clauses: [
      {
        id: "anti_corruption",
        text: "**Anti-Corruption.** Each Party shall, and shall procure that the Company shall, comply with all anti-bribery and anti-corruption laws that apply to it, maintain adequate procedures to prevent bribery by anyone acting on its behalf in connection with the Business, and promptly tell the other Party of any request for an improper payment or advantage that it receives in connection with the Business.",
      },
    ],
  },
  {
    id: "confidentiality",
    heading: "CONFIDENTIALITY",
    clauses: [
      {
        id: "confidentiality",
        text: "**Confidentiality.** Each Party shall keep the Confidential Information confidential, and use it only for the purposes of the Company and this Agreement. A Party may disclose it only:",
        subs: [
          { ref: "(a)", text: "to its own and the Company's officers, employees{{advisers}} who need to know it and are bound to keep it confidential;" },
          { ref: "(b)", text: "where required by law, by any court, governmental or regulatory authority, or by the rules of any stock exchange, giving the other Party prompt notice where lawful; or" },
          { ref: "(c)", text: "with the other Party's prior written consent." },
        ],
        tail: "This Clause does not apply to information that is or becomes public other than through a breach of this Agreement, and continues to bind each Party for two (2) years after it stops holding Shares.",
      },
    ],
  },
  {
    id: "termination",
    heading: "DURATION AND TERMINATION",
    clauses: [
      {
        id: "duration",
        text: "**Duration.** This Agreement continues until one Party holds all the Shares, or the Company is wound up, whichever happens first. A Party that transfers all its Shares in accordance with this Agreement stops being bound by it, except for {{survives}} and any rights or liabilities that arose before the transfer.",
      },
      {
        id: "winding_up",
        text: "**Winding Up.** If the Company is to be wound up, the Parties shall cooperate so that its assets are realised and distributed fairly, any of its contracts with a Party are ended on fair terms, and (where practicable) each Party may bid for any of the Company's business or assets on arm's length terms.",
      },
    ],
  },
  {
    id: "general",
    heading: "GENERAL",
    clauses: [
      { id: "no_partnership", text: "**No Partnership.** Nothing in this Agreement creates a partnership or agency between the Parties, and neither Party may bind the other in any way." },
      {
        id: "entire",
        text: "**Entire Agreement.** This Agreement (with the Constitution) contains the whole agreement between the Parties about the Company and supersedes any earlier understanding about it. Each Party confirms that it has not relied on any statement that is not set out in this Agreement, but nothing in this Clause limits liability for fraud.",
      },
      { id: "assignment", text: "**Assignment.** Neither Party may assign or transfer any of its rights or obligations under this Agreement, except together with a transfer of its Shares made in accordance with this Agreement." },
      { id: "further_assurance", text: "**Further Assurance.** Each Party shall sign all documents, exercise its votes and do all other things reasonably required to give full effect to this Agreement." },
      { id: "amendments", text: "**Amendments.** This Agreement may only be amended in writing signed by both Parties." },
      { id: "waiver", text: "**Waiver.** A failure or delay in exercising a right or remedy under this Agreement is not a waiver of it, and a single or partial exercise of a right or remedy does not prevent its further exercise." },
      { id: "severance", text: "**Severance.** If any provision of this Agreement is or becomes invalid, illegal or unenforceable under the law of any jurisdiction, that does not affect the rest of this Agreement, or that provision under the law of any other jurisdiction." },
      { id: "costs", text: "**Costs.** Each Party bears its own costs of negotiating, preparing and entering into this Agreement." },
      {
        id: "notices",
        text: "**Notices.** A notice under this Agreement must be in writing and in English, and may be delivered by hand, sent by post or sent by email to the Party at the address or email address below, or any other address or email address the Party notifies in writing:",
        subs: [
          { ref: null, text: "Party A: Address: {{a_address}}; Email: {{a_email}}" },
          { ref: null, text: "Party B: Address: {{b_address}}; Email: {{b_email}}" },
        ],
      },
      {
        id: "third_party",
        text: "**Third Party Rights.**",
        subs: [
          { ref: "(a)", text: "Unless expressly provided to the contrary in this Agreement, a person who is not a Party (including the Company) has no right {{tp_under}}to enforce or enjoy the benefit of any term of this Agreement." },
          { ref: "(b)", text: "Notwithstanding any term of this Agreement, the consent of any person who is not a Party is not required to rescind or vary this Agreement." },
        ],
      },
      {
        id: "counterparts",
        text: "**Counterparts.** This Agreement may be signed in any number of counterparts, which together are one agreement. To the extent permitted by the governing law, it may be signed by electronic signature, and a signed counterpart may be delivered by email.",
      },
      {
        id: "law",
        when: "arbitration",
        text: "**Governing Law & Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "This Agreement shall be governed by, and construed in accordance with, the laws of {{law}}." },
          { ref: "(b)", text: "If any dispute, controversy or claim arises out of or in connection with this Agreement, the Parties shall first try in good faith to resolve it by consultation or mediation, beginning as soon as practicable after one Party gives the other written notice of the dispute. A deadlock is dealt with under {{section:deadlock}} and is not a dispute for the purposes of this Clause." },
          { ref: "(c)", text: "If the dispute is not settled within thirty (30) days after that notice, it shall be referred to and finally resolved by arbitration seated in {{seat}} in accordance with {{rules}} administered by {{institution}} for the time being in force (the \"**Rules**\"). The tribunal shall consist of one arbitrator appointed in accordance with the Rules, and the language of the arbitration shall be English." },
          { ref: "(d)", text: "Nothing in this Clause prevents a Party from seeking urgent interim or injunctive relief from any court of competent jurisdiction." },
        ],
      },
      {
        id: "law",
        when: "courts",
        text: "**Governing Law & Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "This Agreement shall be governed by, and construed in accordance with, the laws of {{law}}." },
          { ref: "(b)", text: "If any dispute, controversy or claim arises out of or in connection with this Agreement, the Parties shall first try in good faith to resolve it by consultation or mediation, beginning as soon as practicable after one Party gives the other written notice of the dispute. A deadlock is dealt with under {{section:deadlock}} and is not a dispute for the purposes of this Clause." },
          { ref: "(c)", text: "If the dispute is not settled within thirty (30) days after that notice, {{courts}} shall have exclusive jurisdiction to settle it." },
          { ref: "(d)", text: "Nothing in this Clause prevents a Party from seeking urgent interim or injunctive relief from any court of competent jurisdiction." },
        ],
      },
    ],
  },
];

export const IN_WITNESS = "IN WITNESS WHEREOF the Parties have signed this Agreement on the date written above.";

/* ── the schedules ────────────────────────────────────────────────────── */

export const SCHEDULE_1_TITLE = "THE PARTIES' INVESTMENT";
export const SCHEDULE_2_TITLE = "RESERVED MATTERS";
export const SCHEDULE_2_LEAD = "The following matters need the prior written consent of both Parties under {{clause:reserved}} (Reserved Matters):";
export const SCHEDULE_3_TITLE = "DEED OF ADHERENCE";
export const DEED_OF_ADHERENCE: string[] = [
  "This Deed of Adherence is made on [●] by [●] of [●] (the \"**New Shareholder**\").",
  "It is supplemental to the Joint Venture Agreement dated {{date}} between {{name_a}} and {{name_b}} relating to {{jvc}} (the \"**Agreement**\").",
  "The New Shareholder confirms that it has been given a copy of the Agreement, and that it is acquiring [●] Shares in the Company from [●].",
  "The New Shareholder agrees with each person who is (or later becomes) a party to the Agreement to be bound by the Agreement, and to perform its obligations, as if it were a party to it in place of [●], with effect from the date it is registered as the holder of those Shares.",
  "The address and email address of the New Shareholder for notices under the Agreement are: [●].",
  "This Deed is governed by the laws of {{law}}.",
  "EXECUTED as a DEED by the New Shareholder: ___________________________",
];
