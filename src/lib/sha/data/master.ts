/**
 * FD Lite | Shareholders' Agreement Master — from
 * FD_Lite_I_Shareholders_Agreement_Master_140425.docx (14 April 2025),
 * tracked changes accepted and the client's details taken out (the
 * redacted copy is what goes into AI files).
 *
 * The approved wording as data. The assembler (assemble.ts) fills the
 * {{fields}}, picks the variant each answer calls for and drops what does
 * not apply; it never rewrites a sentence of its own.
 *
 * ONE VERSION. The firm's Master Menu (8 April 2025) splits the SHA into
 * Complex / Standard / Basic, but its Standard and Basic ticks are not
 * available yet and it predates this master by six days, so FD AI drafts
 * the Complex version only: every clause, every question. When the menu's
 * ticks arrive, each clause gets a `tier` as the contractor master has.
 *
 * Markup:
 *   {{field}}        fill in — anything unknown becomes [●] and is reported
 *   {{clause:id}}    "Clause 8.2" — worked out after numbering, so a dropped
 *                    clause never leaves a reference pointing at the wrong place
 *   {{section:id}}   "Clause 13" — the same, for a whole section
 *   **bold**         bold, as the master has it
 *
 * `fd: true` marks wording that is NOT in the master: the permutations the
 * questionnaire needs and the master does not have (a different quorum, no
 * casting vote, board observers, founder vesting and leavers, unanimous
 * amendment …). They are written in the master's style and listed in the
 * admin console as "FD supplementary — for FD review".
 *
 * CORRECTIONS. Where the master itself had a slip, it is fixed here and
 * listed in MASTER_CORRECTIONS (shown in Admin → Questions) so FD can carry
 * the same fixes into the Word master.
 */

export const MASTER_VERSION = "140425";
export const MASTER_LOADED = true;

export interface MasterSub {
  /** "(a)", "(i)", "(A)", "1." … or null for an unnumbered line that carries on the clause. */
  ref: string | null;
  text: string;
  subs?: MasterSub[];
  /** For the assembler to leave this one out. */
  id?: string;
  fd?: boolean;
}

export interface MasterClause {
  /** Stable id, for cross-references and the rules. */
  id: string;
  title: string;
  /** The question whose answer switches or fills it, for the admin list. */
  question?: string;
  text: string;
  subs?: MasterSub[];
  fd?: boolean;
}

export interface MasterSection {
  id: string;
  heading: string;
  clauses: MasterClause[];
  fd?: boolean;
}

/* ── the head ─────────────────────────────────────────────────────────── */

export const TITLE = "SHAREHOLDERS' AGREEMENT";
export const MADE_ON = "This Shareholders' Agreement (the \"**Agreement**\") is made on {{date}} (the \"**Effective Date**\")";
export const BETWEEN = "Between:";
export const COMPANY_PARTY =
  "{{company_name}} (Registration Number: {{company_reg_no}}), a company incorporated under the laws of Singapore whose registered office is at {{company_address}} (the \"**Company**\");";
/** FD: the company is not incorporated yet (S1 = No). */
export const COMPANY_PARTY_UNINCORPORATED =
  "{{company_name}}, a company to be incorporated under the laws of Singapore (the \"**Company**\");";
export const SHAREHOLDER_PARTY =
  "{{name}} (Passport Number/Registration Number: {{id_no}}), whose registered address is at {{address}} (\"**{{label}}**\")";
export const SHAREHOLDERS_COLLECTIVE =
  "(each of {{labels}} shall be individually referred to as a \"**Shareholder**\" and collectively referred as \"**Shareholders**\"),";
export const PARTIES_COLLECTIVE =
  "(collectively, the Company and the Shareholders shall be referred to as \"**Parties**\" and each, a \"**Party**\").";
export const WHEREAS = "WHEREAS";
export const RECITALS = [
  "The Company is a private company limited by shares incorporated in Singapore.",
  "In consideration of the mutual obligations set out herein, the Parties have agreed to regulate the affairs of the Company and the respective rights and obligations of the Parties hereto as shareholders on the terms and subject to the conditions of this Agreement.",
];
/** FD: recital (A) when the company is not incorporated yet. */
export const RECITAL_A_UNINCORPORATED =
  "The Company is to be incorporated in Singapore as a private company limited by shares, and the Shareholders have agreed that this Agreement shall regulate its affairs from its incorporation.";

/* ── Table A ─────────────────────────────────────────────────────────── */

export const TABLE_A_TITLE = "**Table A: Key Commercial Terms**";
export const TABLE_A_NOTE = "This table should not be a substitute for reading the terms of this Agreement in full.";
export const TABLE_A_CAPITAL_HEAD = "**Initial Capital**";
export const TABLE_A_CAPITAL_LINE = "{{name}}: capital amount {{capital}}; {{shares}} {{class}}";
export const TABLE_A_CAPITAL_TAIL = "(collectively, the \"**Initial Capital**\") (per {{clause:initial_capital}} (Initial Capital)).";
export const TABLE_A_RESERVED_HEAD = "**Reserved Matters**";
export const TABLE_A_RESERVED_TAIL = "(per {{clause:reserved_matters}} (Reserved Matters)).";
export const TABLE_A_REPORTING_HEAD = "**Reporting Obligations**";
export const TABLE_A_REPORTING_TAIL = "(per {{clause:other_information}} (Other Information Rights)).";
/** FD: the master's 2.2 points to "item (x) of Table A" for the initial board, which the master's table does not have. */
export const TABLE_A_BOARD_HEAD = "**Board of Directors**";

/** Item (2): the reserved matters, keyed by the S24 answer. */
export const RESERVED_MATTERS: { key: string; text: string }[] = [
  { key: "constitution", text: "Any material amendment to the Constitution of the Company." },
  { key: "liquidation_event", text: "Approval of any transaction which, if completed, would fall within the definition of a Reserved Liquidation Event." },
  { key: "buy_back", text: "The acquisition or disposal of Treasury Shares and any reduction of capital or share buy-back." },
  { key: "dividends", text: "Any declaration or payment of any dividends or other distribution of profits of the Company (whether in cash or in specie)." },
  { key: "capital_structure", text: "Any reduction, consolidation, subdivision or reclassification or other alteration of the Company's capital structure." },
  { key: "share_rights", text: "The variation of any rights attaching to any shares in the capital of the Company or making of any call upon monies unpaid in respect of any issued shares." },
  { key: "bonds", text: "Undertaking any capital reduction, issuing or granting any stock-related bonds." },
  { key: "other_equity", text: "Acquiring or transferring equity securities of another corporation." },
  { key: "related_party", text: "Any transaction or series of transactions between the Company on the one hand, and any of its Founders, shareholders, directors, officers, employees or other related parties including without limitation the Immediate Family Members of any of the foregoing persons, on the other." },
  { key: "winding_up", text: "The liquidation, dissolution or winding up of the Company, and any other Reserved Liquidation Event to which the Company is a party." },
  { key: "encumbrances", text: "The creation of any mortgage, charge or other encumbrance over any assets of the Company." },
  { key: "guarantees", text: "Any exercise of the Company's powers to provide guarantees or indemnities in respect of the obligations of a third party." },
  { key: "borrowings", text: "Any borrowing by the Company of funds exceeding the greater of (i) {{rm_threshold}} (or its equivalent in any currency) or (ii) ten per cent. (10%) of the Company's assets based on the previous year's annual financial statement, either in a single transaction or in the aggregate under a series of related transactions." },
  { key: "unbudgeted", text: "Any single payment or capital expenditure for an amount exceeding {{rm_threshold}} in a 12-month period that is not provided for in the Annual Budget and Business Plan approved in accordance with this Agreement." },
];

/** Item (3): the reporting obligations. Numbered 1–8 as the master has them: Clause 4.4(b) cites "paragraphs 4 and 8". */
export const REPORTING_OBLIGATIONS: string[] = [
  "Any change of principal executive officer(s).",
  "Any change in the address of principal executive office(s).",
  "Any change in the ownership structure of the Company (list of owners/investors and their respective share percentage).",
  "Where the Company holds ownership of more than 10% of outstanding shares (of any class) of other entity (or entities).",
  "Any change in the principal executive officer(s) of the investee entity, of which the Company holds more than 10% of the outstanding shares.",
  "Any change in the address of principal executive offices of the investee entity, of which the Company holds more than 10% of the outstanding shares.",
  "Any change in the ownership structure of the entity, of which the Company holds more than 10% of the outstanding shares (list of owners/investors and their respective share percentage).",
  "Where there is liquidation of the entity where the Company holds more than 10% ownership.",
];

export const AGREED =
  "In consideration of the mutual promises and covenants set out herein, the receipt and sufficiency of which is hereby acknowledged, with effect from the Effective Date, the Parties agree as follows:";

/* ── the clauses ─────────────────────────────────────────────────────── */

export const SECTIONS: MasterSection[] = [
  {
    id: "initial_structure",
    heading: "INITIAL STRUCTURE",
    clauses: [
      {
        id: "initial_capital",
        title: "Initial Capital",
        question: "Shareholders step",
        text: "**Initial Capital.**",
        subs: [
          { ref: "(a)", text: "The Shareholders acknowledge that, in connection with the execution of this Agreement, each Shareholder has contributed (or shall contribute simultaneously with Completion) the capital amounts set out opposite such Shareholder's name in item (1) of Table A (Key Terms) (the \"**Initial Capital Contributions**\")." },
          { ref: "(b)", text: "In consideration of the Initial Capital Contributions, the Company has allotted or shall allot to each Shareholder the number and class of Shares as set out in item (1) of Table A (Key Terms) and shall record such allotment in its register of members." },
        ],
      },
      {
        id: "business",
        title: "Business of the Company",
        question: "Company step",
        text: "**Business of the Company.**",
        subs: [
          { ref: "(a)", text: "The business of the Company is {{business}}, subject to variation from time to time in accordance with the provisions of this Agreement (the \"**Business**\")." },
          { ref: "(b)", text: "Each Shareholder shall use their reasonable endeavours to promote the Business so far as is lawfully possible in the exercise of the Shareholder's rights and powers as a shareholder of the Company." },
          { ref: "(c)", text: "Each Shareholder shall use such Shareholder's reasonable endeavours to procure (so far as is lawfully possible in the exercise of his rights and powers as a shareholder of the Company) that the Business is carried on in accordance with the objects in the Constitution." },
        ],
      },
    ],
  },
  {
    id: "board",
    heading: "BOARD OF DIRECTORS",
    clauses: [
      {
        id: "board_size",
        title: "Board Size",
        question: "S6",
        text: "**Board Size.** Unless otherwise agreed in writing by the Parties, the initial composition of the Board shall comprise of {{board_size}} members.",
      },
      {
        id: "board_composition",
        title: "Initial Board Composition",
        question: "S6b / S7 / S8",
        text: "**Initial Board Composition.** Unless otherwise agreed in writing by the Parties, the initial members of the Board shall comprise of the persons specified in item (4) of Table A (Key Terms), and each Shareholder shall have such right to appoint Directors as is set out in item (4) of Table A (Key Terms).",
      },
      {
        id: "appointment",
        title: "Right of Appointment and Removal of Director",
        question: "S9 / S10",
        text: "**Right of Appointment and Removal of Director.**",
        subs: [
          {
            ref: "(a)",
            text: "Each Shareholder with a right to appoint one or more Directors in accordance with {{clause:board_composition}} (Initial Board Composition) above (each, an \"**Appointed Director**\"), shall have:",
            subs: [
              { ref: "(i)", id: "ap_remove", text: "the right to remove any Appointed Director at any time;" },
              { ref: "(ii)", text: "the right to appoint a replacement Director at any time; and" },
              { ref: "(iii)", text: "the right to determine the tenure of the Appointed Director." },
            ],
          },
          {
            ref: "(b)",
            text: "The rights set out in {{clause:board_composition}} (Initial Board Composition) shall terminate in respect of a Shareholder, and their Appointed Director(s) shall be removed from the Board with immediate effect, upon the occurrence of any of the following:",
            subs: [
              { ref: "(i)", text: "the Shareholder ceases to hold any Shares in the Company;" },
              { ref: "(ii)", text: "the Shareholder materially defaults under this Agreement in accordance with the terms set out herein;" },
              { ref: "(iii)", id: "ev_good", text: "in the case of a Founder Shareholder who is a Good Leaver, upon written request by the other Founder Shareholder(s); or" },
              { ref: "(iv)", id: "ev_bad", text: "in the case of a Founder Shareholder who is a Bad Leaver, automatically on the Cessation Date." },
              { ref: "(v)", id: "ev_threshold", fd: true, text: "the Shareholder ceases to hold at least {{appoint_threshold}} of the total issued share capital of the Company." },
            ],
          },
          { ref: null, id: "each_case", text: "In each case:" },
          {
            ref: null,
            id: "each_case_list",
            text: "",
            subs: [
              { ref: "(A)", text: "the relevant Shareholder shall take all actions reasonably requested to effect the resignation or removal of the Appointed Director from the Company and/or any Group entity; and" },
              { ref: "(B)", text: "the relevant Shareholder's vote shall no longer be counted for Board or Shareholder decisions from the applicable date of cessation or default." },
            ],
          },
          { ref: null, id: "attorney", text: "If the Appointed Director or Shareholder fails to take such action, the Company and the remaining Directors (excluding any Appointed Director of the relevant Shareholder) shall be deemed to be irrevocably appointed as attorney and agent of the relevant Shareholder to execute and deliver any documents necessary to effect the resignation or removal of the Appointed Director." },
          { ref: "(c)", id: "ap_others", fd: true, text: "An Appointed Director may also be removed {{removal_others}}." },
          { ref: "(d)", id: "ap_process", fd: true, text: "The appointment or removal of a Director under this {{clause:appointment}} shall be effected by {{appoint_process}}." },
        ],
      },
      {
        id: "meetings",
        title: "Meetings of Directors",
        question: "S11 / S12 / S13 / S14",
        text: "**Meetings of Directors.**",
        subs: [
          { ref: "(a)", text: "Unless otherwise agreed by the majority of the Board, Board meetings will be held on a quarterly basis." },
          { ref: "(b)", text: "The quorum at a meeting of the Board necessary for the transaction of any business of the Company shall be {{board_quorum}}. In the event that a meeting of Directors duly convened cannot be held for lack of quorum, the meeting shall be adjourned to the same time and day of the following week and at the same place and at least three (3) days' notice shall be given to the Board in relation to such adjourned meeting. {{adjourned_board_quorum}}" },
          {
            ref: "(c)",
            id: "mt_lead_director",
            text: "The Company shall send to the Lead Investor Director (in electronic form if so required):",
            subs: [
              { ref: "(i)", text: "reasonable advance notice of each meeting of the Board (being not fewer than three (3) Business Days); and" },
              { ref: "(ii)", text: "as soon as practicable after each meeting of the Board a copy of the minutes." },
            ],
          },
          { ref: "(d)", id: "mt_expenses", text: "The Company shall reimburse each Director with reasonable costs and out-of-pocket expenses incurred by them in respect of attending and returning from meetings of the Directors or any committee of the Directors or general meetings of the Company or in connection with the business of the Company (in each case not exceeding {{expense_cap}} per annum in respect of each Director)." },
          { ref: "(e)", id: "mt_voting", fd: true, text: "Questions arising at any meeting of the Board shall be decided by {{board_vote}}." },
        ],
      },
      {
        id: "observer",
        title: "Board Observer",
        question: "S17",
        fd: true,
        text: "**Board Observer.** {{observer_holder}} shall be entitled to appoint one (1) observer to the Board, who shall be entitled to receive notice of, attend and speak at all meetings of the Board and to receive copies of all papers circulated to the Directors, but shall not be entitled to vote or be counted in the quorum. The Board may exclude the observer from any part of a meeting where necessary to preserve legal professional privilege or to manage a conflict of interest.",
      },
      {
        id: "chairman",
        title: "Chairman",
        question: "S15",
        text: "**Chairman.** The Chairman of the Board shall be appointed by the Board from among the Founder Directors. The Chairman of the Board shall be entitled to a casting vote at any meeting of the Board.",
      },
    ],
  },
  {
    id: "shareholder_meetings",
    heading: "SHAREHOLDER MEETINGS",
    clauses: [
      {
        id: "gm_quorum",
        title: "Quorum",
        question: "S18 / S19",
        text: "**Quorum.**",
        subs: [
          { ref: "(a)", text: "Subject to the Constitution, no business shall be transacted at any general meeting of the Company unless a quorum is present at the commencement of such meeting. A quorum of any general meeting shall be constituted by the presence in person or by proxy of {{gm_quorum}}." },
          { ref: "(b)", text: "{{gm_adjourned}}" },
        ],
      },
      {
        id: "gm_chairman",
        title: "Chairman of General Meetings",
        question: "S16",
        text: "**Chairman of General Meetings.** {{gm_chairman}} shall preside as the Chairman at each general meeting of the Shareholders and shall have a casting vote at any general meeting. In the case of an equality of votes, the Chairman shall be entitled to a second or casting vote in addition to the votes he is entitled to as a Shareholder.",
      },
      {
        id: "shareholder_rights",
        title: "Shareholder Rights",
        text: "**Shareholder Rights.** Each Shareholder shall be entitled to receive notice of and attend general meetings of the Company, irrespective of whether such Shareholder elects to attend the same.",
      },
      {
        id: "shareholder_obligations",
        title: "Shareholder Obligations",
        question: "S23",
        text: "**Shareholder Obligations.** In consideration of the mutual obligations of the Shareholders herein contained, and save as otherwise agreed in writing among the Shareholders, each of the Shareholders shall exercise its voting rights and powers available to it to ensure that:",
        subs: [
          { ref: "(a)", text: "the Company shall carry on the Business and conduct its affairs in a proper and efficient manner and for its own benefit;" },
          { ref: "(b)", text: "the Company will comply with the provisions of this Agreement; and" },
          { ref: "(c)", id: "so_reserved", text: "none of the matters listed in item (2) of Table A (Key Terms) shall be undertaken by the Company without {{rm_consent}}." },
        ],
      },
    ],
  },
  {
    id: "information",
    heading: "INVESTOR INFORMATION RIGHTS",
    clauses: [
      { id: "management_accounts", title: "Quarterly Management Accounts", text: "**Quarterly Management Accounts.** The Company shall prepare management accounts for each fiscal quarter and shall deliver such quarterly management accounts to the Key Investors within thirty (30) days after the end of each fiscal quarter." },
      { id: "annual_statements", title: "Annual Financial Statements", text: "**Annual Financial Statements.** The annual audited financial statements of the Company for each financial year shall be delivered to the Key Investors within ninety (90) days after the end of the relevant financial year." },
      { id: "annual_budget", title: "Annual Budget", text: "**Annual Budget.** The Company shall prepare an annual budget and forecast for each financial year (the \"**Annual Budget**\") and shall deliver such Annual Budget to the Key Investors at least thirty (30) days prior to the beginning of each financial year of the Company." },
      {
        id: "other_information",
        title: "Other Information Rights",
        text: "**Other Information Rights.** To the extent reasonably practicable, the Company shall ensure that the Key Investors are notified:",
        subs: [
          { ref: "(a)", text: "one (1) month prior to the occurrence of the events set out in item (3) of Table A (Key Terms); and" },
          { ref: "(b)", text: "in respect of paragraphs 4 and 8 of item (3) of Table A (Key Terms), prior to the occurrence of the foregoing events." },
        ],
      },
      { id: "access_rights", title: "Other Access Rights", text: "**Other Access Rights.** The Key Investors may, from time to time, request additional information regarding the Company and its subsidiaries, its businesses or operations and the Company shall provide the Key Investors with such other reasonable information within one (1) month of the Key Investor requesting such information in writing, Provided That the Company shall not be required to provide such information if necessary to protect (a) its trade secrets; (b) any confidential information that is of competitive nature to the Company's business; and/or (c) legal professional privilege." },
    ],
  },
  {
    id: "share_option",
    heading: "SHARE OPTION PLAN",
    clauses: [
      { id: "share_option_plan", title: "Share Option Plan", question: "S22", text: "**Share Option Plan.** The Shareholders agree that Ordinary Shares equal to up to {{esop_pct}} of the Shares in issue immediately following Completion on a fully-diluted basis shall be reserved for issuance to employees of the Company in accordance with the terms and conditions of a Share Option Plan, which shall be adopted by the Company within three (3) months of the date of this Agreement." },
    ],
  },
  {
    id: "reserved",
    heading: "RESERVED MATTERS",
    clauses: [
      { id: "reserved_matters", title: "Reserved Matters", question: "S23 / S24", text: "**Reserved Matters.** The Shareholders shall procure, as far as they lawfully can, that no action is taken or resolution passed by the Company (including any subsidiaries of the Company) in respect of the matters set out in item (2) of Table A (Key Terms), save with {{rm_consent}}." },
    ],
  },
  {
    id: "pre_emption",
    heading: "PRE-EMPTION RIGHTS OVER NEW SECURITIES",
    clauses: [
      {
        id: "pre_emptive",
        title: "Pre-Emptive Rights",
        question: "S25",
        text: "**Pre-Emptive Rights.** If the Company proposes to allot or issue any New Securities, those New Securities shall not be allotted or issued to any person unless the Company has in the first instance offered them to {{preemption_holders}} (the \"**Subscribers**\") on the same terms and at the same price as those New Securities are being offered to other persons on a pari passu and pro rata basis to the number of Shares held by those holders (as nearly as may be without involving fractions). The offer:",
        subs: [
          { ref: "(a)", text: "shall be in writing, be open for acceptance from the date of the offer to the date {{preemption_period}} after the date of the offer (inclusive) (the \"**Subscription Period**\") and give details of the number and subscription price of the New Securities; and" },
          { ref: "(b)", text: "may stipulate that any Subscriber who wishes to subscribe for a number of New Securities in excess of the proportion to which each is entitled shall in their acceptance state the number of excess New Securities for which they wish to subscribe." },
        ],
      },
      {
        id: "allotment",
        title: "Allotment of New Securities",
        text: "**Allotment of New Securities.** If, at the end of the Subscription Period, the number of New Securities applied for by the Subscribers is:",
        subs: [
          { ref: "(a)", text: "equal to or exceeds the number of New Securities, the New Securities shall be allotted to the Subscribers who have applied for New Securities on a pro rata basis to the number of Shares (on an as-converted basis) held by such Subscribers which procedure shall be repeated until all New Securities have been allotted (as nearly as may be without involving fractions or increasing the number allotted to any Subscriber beyond that applied for by it); or" },
          { ref: "(b)", text: "less than the number of New Securities, the New Securities shall be allotted to the Subscribers in accordance with their applications and any remaining New Securities shall be offered to any other person as the Directors may determine at the same price and on the same terms as the offer to the Subscribers." },
        ],
      },
      { id: "disposal", title: "Disposal of New Securities", text: "**Disposal of New Securities.** Subject to the requirements of {{clause:pre_emptive}} (Pre-Emptive Rights) and {{clause:allotment}} (Allotment of New Securities) and the provisions of the Act, any New Securities shall be at the disposal of the Board who may allot, grant options over or otherwise dispose of them to such persons, at such times and on such terms as they think proper." },
      {
        id: "exceptions",
        title: "Exceptions to Pre-Emptive Rights",
        text: "**Exceptions to Pre-Emptive Rights.** Notwithstanding any other provision of this {{section:pre_emption}} (Pre-emption Rights over New Securities), the provisions of {{clause:pre_emptive}} (Pre-Emptive Rights) to {{clause:disposal}} (Disposal of New Securities) shall not apply to:",
        subs: [
          { ref: "(a)", id: "ex_esop", text: "options to subscribe for Ordinary Shares under the duly approved and established Share Option Plan(s) of the Company and Ordinary Shares issued upon the exercise of such options;" },
          { ref: "(b)", text: "shares in the capital of the Company issued upon the exercise or conversion of outstanding New Securities that have been issued or granted in accordance with the Constitution or this Agreement;" },
          { ref: "(c)", text: "New Securities issued or granted in order for the Company to comply with its obligations under the Constitution or this Agreement;" },
          { ref: "(d)", text: "New Securities which the Key Investors and Founders have agreed in writing should be issued without complying with this {{section:pre_emption}} (Pre-emption Rights over New Securities); and" },
          { ref: "(e)", text: "New Securities issued in connection with a Qualifying IPO." },
        ],
      },
    ],
  },
  {
    id: "transfer",
    heading: "TRANSFER OF SHARES",
    clauses: [
      {
        id: "general_restrictions",
        title: "General Restrictions",
        question: "S26 / S26a",
        text: "**General Restrictions.** The Parties hereby agree as follows:",
        subs: [
          { ref: "(a)", text: "except where the Founder(s) assigns, sells, exchanges, transfers, puts in pledge, or otherwise disposes of its shares (hereinafter, collectively referred to as \"**Transfer**\") with the prior written consent of the Lead Investor, whose consent shall not be unreasonably withheld, and by the procedures hereunder, such as the provisions of {{transfer_clauses}}, the Founder(s) shall not Transfer the shares under his/her ownership to a third party from the date of this Agreement or the Company's shares are listed on a stock exchange, whichever comes first. The Founder(s) may not Transfer the shares of the Company in violation of the provisions of this Agreement;" },
          { ref: "(b)", text: "no Shareholder shall, without the prior written consent of the majority of the Board, at any time create any Encumbrance or have outstanding any pledge, lien, charge or other encumbrance or security interest on or over any Share or any part interest in any Shares;" },
          { ref: "(c)", id: "gr_rofo", text: "subject to {{clause:permitted_transfers}} (Permitted Transfers), no Shareholder may sell, transfer or dispose of the legal or beneficial ownership of any Shares unless the restrictions set out in {{clause:rofo}} (Right of First Offer) have been exhausted;" },
          { ref: "(d)", id: "gr_board", fd: true, text: "subject to {{clause:permitted_transfers}} (Permitted Transfers), no Shareholder shall Transfer any Shares without the prior approval of the Board;" },
          { ref: "(e)", text: "each Shareholder shall not take any action that has the purpose or effect of evasion of the restrictions and limitations on transfer contained in this Agreement, including by way of direct or indirect transfer, or issuances or redemptions of securities to entities controlled by such Shareholder resulting in the Transfer of the Shares in circumvention of the restrictions in this Agreement;" },
          { ref: "(f)", text: "save where the prior written approval from the majority of the Founders is obtained, no Shareholder shall make an offer to sell, transfer or assign such Shareholder's rights, title and interests in the Shares to any person or entity, where such person or entity is a competitor of the Business, or is directly or indirectly engaged or concerned or interested in a business competing with or which adversely affects or is likely to compete with or adversely affect the Business, as determined by the Board; and" },
          { ref: "(g)", text: "any attempt to Transfer any Shares not in compliance with this Agreement shall be null and void, and the Company shall not, and shall cause any transfer agent not to give any effect in the Company's electronic register of members lodged with ACRA or other share records to such attempted transfer." },
        ],
      },
      {
        id: "rofo",
        title: "Right of First Offer",
        question: "S26a",
        text: "**Right of First Offer.** Subject to {{rofo_subject}}:",
        subs: [
          { ref: "(a)", text: "If a Shareholder (hereinafter referred to as the \"**Transferring Shareholder**\") wishes to Transfer any of such Shareholder's Shares, that Transferring Shareholder shall first offer in writing those Shares to be transferred by the Transferring Shareholder to the other Shareholders in (as nearly as may be) their respective Shareholding Percentage at a price and on such terms and conditions determined by the Transferring Shareholder (each offer to a Shareholder being an \"**Offer**\" and all such offers being the \"**Offers**\")." },
          { ref: "(b)", text: "An Offer may be accepted by the relevant Shareholder as to all but not some only of the Shares comprised in such Offer within fourteen (14) days from the date of the Offer (the \"**First ROFO Period**\") and failing such acceptance shall be deemed to have been declined." },
          {
            ref: "(c)",
            text: "Where an Offer is declined or deemed to have been declined, the other Shareholders who have so accepted their respective Offers shall for a further period of seven (7) days following the First ROFO Period (the \"**Second ROFO Period**\") have the option but not the obligation:",
            subs: [
              { ref: "(i)", text: "to accept all the Shares declined or deemed to have been declined by the other Shareholders (the \"**Remaining Offer Shares**\") in (as nearly as may be) their respective Shareholding Percentage inter se or in such proportion as they may agree amongst themselves; and/or" },
              { ref: "(ii)", text: "subject to the agreement of all Shareholders, to nominate a third party or parties to purchase some or all of such Remaining Offer Shares," },
            ],
          },
          { ref: null, text: "so that all and not some only of the Shares comprised in all the Offers shall be fully taken up. For the avoidance of doubt, if all of the Shares comprised in the Offers are not so accepted by the expiry of the Second ROFO Period, the Offers shall be deemed to have been declined in whole by the other Shareholders and {{clause:rofo}}(d) shall apply." },
          { ref: "(d)", text: "Upon the Offers being declined, or being deemed to have been declined, all and not some only of the Shares may be offered by the Transferring Shareholder for sale to non-Shareholders (the \"**Proposed Transferee**\") during a period of not more than one (1) year after the expiry of the Second ROFO Period on terms and conditions not more favourable than those comprised in the Offers, Provided That the prior written consent of the CEO Founder shall be obtained prior to the transfer of any Shares to any Proposed Transferee." },
          {
            ref: "(e)",
            text: "It shall be a condition precedent to the right of any Transferring Shareholder to transfer Shares that:",
            subs: [
              { ref: "(i)", text: "the transferee, if not already bound by the provisions of this Agreement, executes the Deed of Ratification and Accession under which such transferee agrees to be bound by and be entitled to the benefit of this Agreement as if such transferee were an original party hereto in place of the Transferring Shareholder;" },
              { ref: "(ii)", text: "the Transferring Shareholder assigns, and the transferee accepts the assignment of, any guarantees or other financial undertakings of the Transferring Shareholder made in connection with or for the benefit of the Company (on such terms as may be agreed between the Transferring Shareholder and the transferee), and the Transferring Shareholder shall obtain where necessary the consent of the beneficiary of such guarantees or undertakings to the said Transfer; and" },
              { ref: "(iii)", text: "the Transferring Shareholder shall remain liable and be responsible for the due discharge, performance and observance of all such Transferring Shareholder's liabilities and obligations whether actual or contingent arising out of or on or in respect of or in connection with this Agreement and in respect of the Shares, and shall remain entitled to all rights and benefits arising out of or in connection with the Shares at any time up to and including the date of Transfer." },
            ],
          },
        ],
      },
      {
        id: "tag_along",
        title: "Tag Along",
        question: "S26c / S26d",
        text: "**Tag Along.**",
        subs: [
          { ref: "(a)", text: "{{tag_subject}}in the event that the Founder(s) (the \"**Transferring Founder**\") desires to Transfer Shares to a Proposed Transferee{{tag_threshold}}, the Founder(s) shall give notice in writing to each {{tag_holder}} (the \"**Tag Along Notice**\") which shall specify in reasonable detail the terms and conditions of the proposed Transfer, including without limitation, the number of Shares to be Transferred, the nature of such Transfer, the consideration to be paid, and the identity of the prospective purchaser or transferee." },
          { ref: "(b)", text: "Each {{tag_holder}} shall have the right, exercisable upon written notice (the \"**Notice of Participation**\") to the Transferring Founder and the Company within fourteen (14) days after the receipt of the Tag Along Notice, to inform the Transferring Founder and the Company in writing whether it elects to participate in the Transfer by the Transferring Founder on the same terms and conditions as set forth in the Tag Along Notice (except however, the {{tag_holder}} will not be required to provide representations and warranties other than in respect of title to their shares and customary enforceability warranties). The Notice of Participation shall indicate the number of Shares that the {{tag_holder}} elects to transfer pursuant to this {{clause:tag_along}} (Tag Along), up to that number of Shares equal to the product obtained by multiplying (a) the aggregate number of Shares set forth in the Tag Along Notice by (b) the {{tag_holder}}'s Shareholding Percentage at the time of the Transfer. The {{tag_holder}} shall promptly deliver to the Company for transfer to the prospective purchaser one or more share transfer forms, properly executed for transfer, which represent the number of Shares which the {{tag_holder}} elects to transfer, together with the relevant share certificates (or where applicable, share indemnity letters). To the extent the {{tag_holder}} exercises such right of participation in accordance with the terms and conditions set forth above, the number of Shares that the Transferring Founder may Transfer in the transaction shall be correspondingly reduced. The Company shall (as agent for the {{tag_holder}}) Transfer the number of Shares that the {{tag_holder}} has elected to Transfer to the Proposed Transferee on the terms set out in the Tag Along Notice." },
          { ref: "(c)", text: "To the extent that a {{tag_holder}} fails to elect to participate in the Transfer by the Transferring Founder, the {{tag_holder}} shall be deemed to have consented to the Transfer by the Transferring Founder on the terms and conditions and to the Proposed Transferee set forth in the Tag Along Notice." },
        ],
      },
      {
        id: "drag_along",
        title: "Drag Along",
        question: "S26e",
        text: "**Drag Along.**",
        subs: [
          { ref: "(a)", text: "{{drag_subject}}if a Proposed Purchaser makes a bona fide offer to any Shareholder(s) (the \"**Target Shareholder(s)**\") to acquire all the Shares held by the Target Shareholder(s) in a single or a series of related transactions, and those Shares represent at least {{drag_pct}} of the total issued share capital of the Company as the date of the proposed offer, the Target Shareholder(s) may by written notice (the \"**Drag Notice**\") to the other Shareholders (each, a \"**Dragged Shareholder**\") require each Dragged Shareholder to sell such Dragged Shareholder's Shares at the same price per Share and otherwise on terms no less favourable as the Target Shareholder(s) (subject to paragraph (d) below) to the Proposed Purchaser simultaneously with completion of the sale of the Target Shareholder(s)' Shares to the Proposed Purchaser." },
          { ref: "(b)", text: "Upon the receipt of a Drag Notice, each Dragged Shareholder shall be obliged to transfer all of such Dragged Shareholder's Shares to the Proposed Purchaser (or the Proposed Purchaser's nominee) and for this purpose, shall promptly deliver to the Company (who shall be deemed to be constituted the agent of such Dragged Shareholder) the share transfer form(s) properly executed for the transfer of such Dragged Shareholder's Shares, together with the relevant share certificates (or share indemnity letters as the case may be) and all other relevant documents in connection with the transfer of such Dragged Shareholder's Shares against payment by the Proposed Purchaser of the price of the Dragged Shareholder's Shares to the bank account specified by the Dragged Shareholder at least three (3) Business Days prior to the date of such transfer." },
          { ref: "(c)", text: "All Shares transferred pursuant to this {{clause:drag_along}} (Drag Along) shall be transferred as full legal and beneficial ownership and free from all Encumbrances together with all rights, benefits and advantages attached thereto as at the date of the Drag Notice except the right to any dividend declared but not paid prior to the date of the Drag Notice." },
          {
            ref: "(d)",
            text: "Subject to the requirements of the applicable laws, regulations and/or rules of the relevant authority, each Party acknowledges and agrees that in connection with any sale of Shares under this {{clause:drag_along}} (Drag Along):",
            subs: [
              { ref: "(i)", text: "the Investors shall not be obliged to give any representations, warranties or indemnities in connection with any Group Company or its respective businesses (except a warranty as to title to the shares held by the Investors and as to their capacity to sell those shares);" },
              { ref: "(ii)", text: "such representations, warranties or indemnities shall only be provided on a several basis (and not a joint or joint and several basis); and" },
              { ref: "(iii)", text: "no Dragged Shareholder shall be required to agree to any non-competition covenant." },
            ],
          },
        ],
      },
      {
        id: "permitted_transfers",
        title: "Permitted Transfers",
        text: "**Permitted Transfers.** Notwithstanding the foregoing, the restrictions set out in {{permitted_refs}} shall not apply to:",
        subs: [
          { ref: "(a)", text: "any Transfer(s) of Shares by any Shareholder (including the Key Investors) to any Affiliate of that Shareholder (and vice versa) Provided That (i) that Shareholder shall not be relieved of any of such Shareholder's obligations hereunder and shall remain responsible for ensuring the due performance of all of such Shareholder's obligations hereunder, either by such Shareholder or by the registered holder for the time being of such Shares; (ii) in the event that the other person ceases to be an Affiliate of that Shareholder, such person shall and that party shall procure that such person shall before such cessation re-Transfer such Shares to that Shareholder and (iii) the Affiliate shall not be a Competitor or, directly or indirectly, affiliated to a Competitor; and/or" },
          { ref: "(b)", text: "any Transfer(s) of Shares by a Founder to another Founder, a senior manager of the Company or such other key employees of the Company, so long as the prior written consent of the Lead Investor has been obtained." },
        ],
      },
    ],
  },
  {
    id: "exit",
    heading: "EXIT EVENTS",
    clauses: [
      {
        id: "exit_events",
        title: "Exit Events",
        question: "S27",
        text: "**Exit Events.**",
        subs: [
          {
            ref: "(a)",
            text: "**Exit Events.** Each of the following events shall be deemed an \"**Exit Event**\":",
            subs: [
              { ref: "(i)", id: "xe_trade_sale", text: "a trade sale involving the sale of one hundred percent (100%) of the issued share capital of the Company to a third-party purchaser;" },
              { ref: "(ii)", id: "xe_ipo", text: "a Qualifying IPO; and/or" },
              { ref: "(iii)", id: "xe_asset_sale", text: "the sale of all the Shares of the Company or the sale of substantially all the assets and undertakings of the Company." },
            ],
          },
          {
            ref: "(b)",
            text: "**Approval of Exit Event.** If the Company approves an Exit Event in accordance with the terms of this Agreement:",
            subs: [
              { ref: "(i)", text: "the Parties shall use their reasonable endeavours and shall in good faith take all necessary actions and steps to prepare for initiation of such Exit Event (including waiving any rights of pre-emption on any sale of Share(s));" },
              { ref: "(ii)", text: "each Shareholder must exercise all rights that such Shareholder has in relation to the Company and any Shares to procure that an Exit Event is achieved; and" },
              { ref: "(iii)", text: "each Shareholder must do all things, execute all documents and provide all such assistance as may be required by the Company to facilitate the Exit Event and shall at all times fully support (including but not limited to complying with all applicable laws) and shall not whether directly or indirectly undertake any action (or omit to take any action) to object to, frustrate or prevent an Exit Event." },
            ],
          },
        ],
      },
      { id: "asset_sale", title: "Asset Sale", question: "S27", text: "**Asset Sale.** In the event that an Asset Sale is approved by the Board, the Board shall have the right, by notice in writing to all other Shareholders, to require such Shareholders to take any and all such actions as may be necessary for Shareholders to take in order to give effect to or otherwise implement such Asset Sale, subject always to the proceeds from such Asset Sale being distributed to Shareholders in accordance with their Shareholding Percentage, or as otherwise agreed by the Shareholders in writing from time to time." },
    ],
  },
  {
    id: "compulsory",
    heading: "COMPULSORY TRANSFERS",
    clauses: [
      {
        id: "defaulting",
        title: "Defaulting Shareholder",
        question: "S20 / S21",
        text: "**Defaulting Shareholder.** If any of the events set out in {{default_paras}} below shall occur in relation to any of the Shareholders (such Party, the \"**Defaulting Shareholder**\"):",
        subs: [
          { ref: "(a)", id: "dd_breach", text: "whereby the Defaulting Shareholder shall commit any breach of any of such Defaulting Shareholder's obligations under this Agreement and shall fail to remedy such breach (if capable of remedy) within sixty (60) days after being given notice by all the other Shareholders to do so;" },
          { ref: "(b)", id: "dd_insolvency", text: "whereby the Defaulting Shareholder shall go into bankruptcy or liquidation whether compulsory or voluntary (except for the purposes of a bona fide reconstruction or amalgamation with the consent of the other Shareholder(s), such consent not to be unreasonably withheld) or if a petition shall be presented or an order made from the appointment of an administrator in relation to the Defaulting Shareholder or if a receiver, administrative receiver, judicial manager or manager shall be appointed over any part of the assets or undertaking of the Defaulting Shareholder and such appointment is not revoked within thirty (30) days from the date of such appointment or if any event analogous to any of the foregoing shall occur in any jurisdiction;" },
          { ref: "(c)", id: "dd_composition", text: "whereby the Defaulting Shareholder shall make a general assignment or any composition or arrangement with or for the benefit of its creditors; or" },
          { ref: "(d)", id: "dd_asset_sale", text: "(where a corporate) whereby the Defaulting Shareholder shall sell, transfer, lease or otherwise dispose of the whole or substantially the whole of such Defaulting Shareholder's assets, rights and undertaking," },
          { ref: null, id: "dd_then", text: "(each, an \"**Event of Default**\") then upon the election of the non-defaulting Shareholders (\"**Non-Defaulting Shareholders**\") acting {{default_vote}}, the following shall occur:" },
          {
            ref: null,
            id: "dd_list",
            text: "",
            subs: [
              { ref: "(i)", id: "dd_rights", text: "{{default_rights}}" },
              { ref: "(ii)", id: "dd_recourse", text: "{{default_recourse}}" },
            ],
          },
          { ref: null, id: "dd_continue", text: "For the avoidance of doubt, unless otherwise elected, this Agreement shall continue in full force and effect among the Company and the Non-Defaulting Shareholders." },
        ],
      },
      {
        id: "insolvency",
        title: "Insolvency of a Shareholder",
        question: "S34",
        fd: true,
        text: "**Insolvency of a Shareholder.** {{insolvency_text}}",
      },
      {
        id: "death",
        title: "Effect of Death or Permanent Mental Disability",
        question: "S33",
        text: "**Effect of Death or Permanent Mental Disability.** Notwithstanding anything contained in a Shareholder's will or testamentary disposition, in the event of the death of a Shareholder or the permanent mental disability of a Shareholder which materially affects such Shareholder's ability to exercise rights, or comply with or observe obligations, as a member of the Company, or as a party to this Agreement (the \"**Relevant Individual**\"), {{death_text}}",
      },
    ],
  },
  {
    id: "vesting",
    heading: "FOUNDER VESTING AND LEAVERS",
    fd: true,
    clauses: [
      {
        id: "founder_vesting",
        title: "Founder Vesting",
        question: "S28",
        fd: true,
        text: "**Founder Vesting.** The Shares held by each Founder Shareholder as at the date of this Agreement (the \"**Founder Shares**\") shall vest {{vesting_schedule}}, for so long as such Founder Shareholder remains a director, employee or consultant of the Company. Founder Shares which have vested are \"**Vested Shares**\" and Founder Shares which have not vested are \"**Unvested Shares**\".",
      },
      {
        id: "unvested",
        title: "Unvested Shares on Cessation",
        question: "S28c",
        fd: true,
        text: "**Unvested Shares on Cessation.** If a Founder Shareholder ceases to be a director, employee or consultant of the Company for any reason, the Company (or such person as the Board may nominate) shall be entitled, by notice in writing given within ninety (90) days after the Cessation Date, to require such Founder Shareholder to transfer all of such Founder Shareholder's Unvested Shares at the lower of the price paid for them and their Fair Market Value, to the extent permitted by the Act.",
      },
      {
        id: "leavers",
        title: "Good Leaver and Bad Leaver",
        question: "S29 / S30",
        fd: true,
        text: "**Good Leaver and Bad Leaver.** In this Agreement, the \"**Cessation Date**\" is the date on which a Founder Shareholder ceases to be a director, employee or consultant of the Company.",
        subs: [
          { ref: "(a)", text: "A Founder Shareholder is a \"**Good Leaver**\" if the Founder Shareholder ceases to be a director, employee or consultant of the Company by reason of {{good_leaver_events}}." },
          { ref: "(b)", text: "A Founder Shareholder is a \"**Bad Leaver**\" if the Founder Shareholder ceases to be a director, employee or consultant of the Company by reason of {{bad_leaver_events}}." },
          { ref: "(c)", text: "A Founder Shareholder who is neither a Good Leaver nor a Bad Leaver shall be treated as a Good Leaver, unless the Board determines otherwise." },
        ],
      },
      {
        id: "leaver_shares",
        title: "Shares of a Leaver",
        question: "S31 / S32",
        fd: true,
        text: "**Shares of a Leaver.** Within ninety (90) days after the Cessation Date, the Company (or such person as the Board may nominate) may, by notice in writing, require a Founder Shareholder who has ceased to be a director, employee or consultant of the Company to transfer {{leaver_scope}}, in each case to the extent permitted by the Act:",
        subs: [
          { ref: "(a)", id: "ls_good", text: "if a Good Leaver, at {{gl_price}}; and" },
          { ref: "(b)", id: "ls_bad", text: "if a Bad Leaver, at {{bl_price}}." },
        ],
      },
    ],
  },
  {
    id: "covenants",
    heading: "RESTRICTIVE COVENANTS",
    clauses: [
      { id: "founder_undertaking", title: "Founder Undertaking", question: "S38 / S38a", text: "**Founder Undertaking.** Each Founder hereby severally undertakes and covenants with the Lead Investor and the Company that he shall remain in the employment of the Company for at least {{lock_in}} from the date of Completion." },
      {
        id: "restrictive_covenants",
        title: "Restrictive Covenants",
        question: "S38",
        text: "**Restrictive Covenants.**",
        subs: [
          { ref: "(a)", id: "rc_compete", text: "Each Founder hereby severally undertakes and covenants with the Lead Investor and the Company that he shall not, in any Relevant Capacity, directly or indirectly, during the Relevant Period, carry on, be engaged in or be economically interested in any business which is of the same or similar type to the Business or which is in competition with the Business." },
          {
            ref: "(b)",
            id: "rc_solicit",
            text: "Each Founder hereby severally undertakes and covenants with the Lead Investor and the Company that he shall not, in any Relevant Capacity, directly or indirectly, during the Relevant Period:",
            subs: [
              { ref: "(i)", text: "solicit with a view to the employment or engagement of, or employ or engage, any Relevant Personnel, whether as employee or consultant; or" },
              { ref: "(ii)", text: "otherwise induce or persuade, or seek to induce or persuade, any Relevant Personnel to leave or terminate his/its employment, service or engagement with the Company." },
            ],
          },
        ],
      },
      { id: "reasonableness", title: "Reasonableness", text: "**Reasonableness.** Each restriction set out in this {{section:covenants}} (Restrictive Covenants) is separate and distinct and is to be construed separately from the other restrictions." },
      {
        id: "exclusions",
        title: "Exclusions",
        question: "S38",
        text: "**Exclusions.** Nothing contained in this Clause precludes or restricts a Founder from:",
        subs: [
          { ref: "(a)", text: "holding or having an interest in the shares or other securities of a company traded on a recognised securities exchange so long as such shares or other securities is not more than three per cent. (3%) of the issued share capital of the company or the relevant class of securities; or" },
          { ref: "(b)", id: "ex_consent", text: "holding or having an interest in any securities of any company, or carrying out or doing any acts, activities or undertakings, if the consent of the Lead Investor has been obtained." },
        ],
      },
      {
        id: "covenant_definitions",
        title: "Definitions",
        question: "S38b",
        text: "**Definitions.** For the purpose of this {{section:covenants}} (Restrictive Covenants):",
        subs: [
          { ref: "(a)", text: "\"**Relevant Capacity**\" means for his own account or for that of any person, firm or company (other than the Company) and whether through the medium of any company controlled by him or as principal, partner, director, employee, consultant or agent;" },
          { ref: "(b)", text: "\"**Relevant Period**\" means, in relation to each Founder, the period during which such Founder is and remains a Shareholder and for a period of {{post_exit}} after such Founder ceases to be a Shareholder; and" },
          { ref: "(c)", text: "\"**Relevant Personnel**\" means, in relation to each Founder, any person who is or was during the one (1) year period prior to the end of the Relevant Period, employed at a managerial or senior level, or engaged as a consultant, by the Company, and with whom such Founder shall have had dealings during such one (1) year period prior to the end of the Relevant Period." },
        ],
      },
    ],
  },
  {
    id: "termination",
    heading: "TERMINATION",
    clauses: [
      { id: "termination", title: "Termination", text: "**Termination.** Subject to the other provisions of this Agreement, this Agreement shall continue in full force and effect without limit in point of time until the Parties agree in writing to terminate this Agreement, provided that this Agreement shall cease to have effect as regards any Shareholder who ceases to hold any Shares save for any of its provisions which are expressed to continue in force after termination and save that nothing in this Clause shall release any Party from liability for breaches of this Agreement which occurred prior to its termination." },
    ],
  },
  {
    id: "confidentiality",
    heading: "CONFIDENTIALITY",
    clauses: [
      {
        id: "confidentiality",
        title: "Confidentiality Obligations",
        question: "S35",
        text: "**Confidentiality Obligations.** All communications between the Company and the Shareholders or any of them and all information and other material supplied to or received by any of them from any one or more of the others which is either marked \"confidential\" or is by its nature intended to be exclusively for the knowledge of the recipient alone, or to be used by the recipient only for the benefit of the Company, any information concerning the business transactions or financial arrangements of the Company or of the Shareholders or any of them, or of any person with whom any of them is in a confidential relationship with regard to the matter in question coming to the knowledge of the recipient shall be kept confidential by the recipient and shall be used by the recipient solely and exclusively for the benefit of the Company unless:",
        subs: [
          { ref: "(a)", text: "the disclosure or use is required by law, any governmental or regulatory body or any recognised securities exchange on which the shares of any Shareholder are listed;" },
          { ref: "(b)", text: "the disclosure or use is required for the purpose of any judicial proceedings arising out of this Agreement or any other agreement entered into under or pursuant to this Agreement;" },
          { ref: "(c)", text: "the disclosure is made to the bankers, professional advisers, consultants, related corporations or affiliates of any Party (collectively, the \"**Representatives**\") for the purpose of this Agreement or for a purpose connected or related to the operation of this Agreement, on terms that each Representative receiving the information agrees to comply with the provisions of this {{clause:confidentiality}} (Confidentiality Obligations) in respect of such information as if it were a party to this Agreement;" },
          { ref: "(d)", text: "the information is or becomes publicly available (other than by breach of this Agreement);" },
          { ref: "(e)", text: "the Party whose information is to be disclosed or used has, or all other Parties have, given prior written approval to the disclosure or use; or" },
          { ref: "(f)", text: "the information is independently developed by the recipient or is lawfully in its possession prior to the disclosure to it of the information," },
          { ref: null, text: "provided that prior to disclosure or use of any information pursuant to {{clause:confidentiality}}(a) (Confidentiality Obligations), the Party concerned shall, to the extent permitted by law, promptly notify the other Party or Parties (as the case may be) of such requirement." },
        ],
      },
      { id: "shareholders_obligations_conf", title: "Shareholders' Obligations", text: "**Shareholders' Obligations.** Without prejudice to the generality of the foregoing, the Shareholders shall procure the observance of the abovementioned restrictions by the Company and shall take all reasonable steps to minimise the risk of disclosure of confidential information, by ensuring that only their employees, officers and directors and those of the Company whose duties will require them to possess any of such information, shall have access thereto, and that they shall be instructed to treat the same as confidential." },
      { id: "confidentiality_survival", title: "Survival", text: "**Survival.** The obligations contained in this {{section:confidentiality}} (Confidentiality) shall endure, even after the termination of this Agreement, without limit in point of time except and until any confidential information enters the public domain as set out above." },
    ],
  },
  {
    id: "announcements",
    heading: "ANNOUNCEMENTS",
    clauses: [
      {
        id: "announcements",
        title: "Announcements",
        text: "**Announcements.** None of the Parties shall issue any press release or make any public announcement or disclosure regarding the existence or subject matter of this Agreement, or any other agreement referred to in, or executed in connection with, this Agreement, without the prior agreement of the other Parties, save as required:",
        subs: [
          { ref: "(a)", text: "by law, any governmental or regulatory body or any recognised securities exchange on which the shares of any Shareholder are listed; or" },
          { ref: "(b)", text: "for the purpose of any judicial proceedings arising out of this Agreement, or any other agreement referred to in, or executed in connection with, this Agreement," },
          { ref: null, text: "provided that prior to the issue or making of such press release, announcement or disclosure, the Party concerned shall, to the extent permitted by law, promptly notify the other Parties of such requirement." },
        ],
      },
    ],
  },
  {
    id: "ip",
    heading: "INTELLECTUAL PROPERTY",
    clauses: [
      { id: "ip_ownership", title: "Ownership of Intellectual Property", question: "S36", text: "**Ownership of Intellectual Property.** All Intellectual Property created by a Shareholder in the course of the Shareholder's interaction with the Group or otherwise in connection with the Business will be owned by the Company or the relevant Group Company from the date of its creation. Each Shareholder must, if requested by the Company, execute any documents required to vest the ownership of any of that Intellectual Property in the Company or the relevant Group Company." },
      { id: "moral_rights", title: "Moral Rights", text: "**Moral Rights.** Each Shareholder waives any moral rights that such Shareholder may have in respect of any Intellectual Property rights under the Copyright Act 2021 of Singapore and any other moral rights to which they are or may become entitled to under any legislation now existing or in future enacted anywhere in the world, in respect of the Intellectual Property rights." },
      { id: "ip_survival", title: "Survival", text: "**Survival.** All rights and obligations under this {{section:ip}} (Intellectual Property) shall continue and survive after the termination of this Agreement." },
    ],
  },
  {
    id: "general",
    heading: "GENERAL",
    clauses: [
      { id: "interpretation", title: "Interpretation", text: "**Interpretation.** In this Agreement, unless the context otherwise requires, all capitalised words shall have the meanings ascribed to it in Schedule 1 (Interpretation) and the interpretation of this Agreement shall be in accordance with the terms set out in Schedule 1 (Interpretation)." },
      {
        id: "assignment",
        title: "Assignment",
        text: "**Assignment.** The Parties agree that each Key Investor may:",
        subs: [
          { ref: "(a)", text: "with the prior written consent of the Company whose consent shall not be unreasonably withheld, assign its rights and benefits under this Agreement to any Affiliate, provided that the Affiliate is not in competition with the Business; or" },
          { ref: "(b)", text: "assign its rights and benefits under this Agreement to any person who has received a transfer of Shares from such Key Investor in accordance with the Constitution and this Agreement and has executed a Deed of Ratification and Accession." },
        ],
      },
      { id: "partial_invalidity", title: "Partial Invalidity", text: "**Partial Invalidity.** If at any time, any provision of this Agreement is or becomes illegal, invalid, or unenforceable in any respect under any law of any jurisdiction, neither the legality, validity or enforceability of the remaining provisions nor the legality, validity or enforceability of such provision under the law of any other jurisdiction will in any way be affected or impaired." },
      { id: "notices", title: "Notices", text: "**Notices.** All notices and communications given under this Agreement must be in writing and in English, and will be delivered personally, sent by post, or sent by email, to the recorded addresses or email addresses of the Parties as described in this Agreement, or as amended by the Parties' change of circumstances in writing and notified to the Board. The primary mode of communication shall be via email." },
      { id: "entire_agreement", title: "Entire Agreement", text: "**Entire Agreement.** This Agreement contains all the terms, representations and warranties made between the Parties relating to the matters dealt with in this Agreement and supersedes and cancels all prior discussions and agreements covering the subject matter of this Agreement. The Parties have not relied on any representation, warranty or agreement relating to the subject matter of this Agreement that is not expressly set out in this Agreement, and no such representation, warranty or agreement has any effect from the date of this Agreement." },
      { id: "further_assurances", title: "Further Assurances", text: "**Further Assurances.** The Parties must each sign all further documents, pass all resolutions and do all further things as may be necessary or desirable to give effect to this Agreement." },
      { id: "waiver", title: "Waiver", text: "**Waiver.** No exercise or failure to exercise or delay in exercising any right or remedy will constitute a waiver by that Party of that or any other right or remedy available to it." },
      { id: "modifications", title: "Modifications", question: "S37", text: "**Modifications.** Save as otherwise expressly provided, no modification, amendment or waiver of any of the provisions of this Agreement shall be effective unless made in writing specifically referring to this Agreement and duly signed by {{amend_by}}." },
      { id: "remedies", title: "Remedies", text: "**Remedies.** No remedy conferred by any of the provisions of this Agreement is intended to be exclusive of any other remedy which is otherwise available at law, in equity, by statute or otherwise, and each and every other remedy shall be cumulative and shall be in addition to every other remedy given hereunder or now or hereafter existing at law, in equity, by statute or otherwise. The election of any one or more of such remedies by any of the Parties shall not constitute a waiver by such Party of the right to pursue any other available remedies." },
      { id: "costs", title: "Costs", text: "**Costs.** The Parties will meet their own costs relating to the negotiation, preparation and implementation of this Agreement." },
      { id: "prevalence", title: "Prevalence of Agreement", text: "**Prevalence of Agreement.** In the event of any inconsistency or conflict between the provisions of this Agreement and the provisions of the Constitution, the provisions of this Agreement shall as between the Shareholders prevail and the Shareholders shall, so far as they are able, cause such necessary alterations to be made to the Constitution as are required to remove such conflict." },
      { id: "counterparts", title: "Counterparts", text: "**Counterparts.** This Agreement may be signed in any number of counterparts, all of which taken together shall constitute one and the same instrument. Either Party may enter into this Agreement by signing any such counterpart and each counterpart shall be as valid and effectual as if executed as an original." },
      { id: "no_partnership", title: "No Partnership", text: "**No Partnership.** The relationship among the Shareholders shall not constitute a partnership. No Shareholder has the power or the right to bind, commit or pledge the credit of the other Shareholders." },
      {
        id: "third_party_rights",
        title: "Contracts (Rights of Third Parties) Act",
        text: "**Contracts (Rights of Third Parties) Act.**",
        subs: [
          { ref: "(a)", text: "Unless expressly provided to the contrary in this Agreement, a person who is not a Party has no right under the Contracts (Rights of Third Parties) Act 2001 of Singapore to enforce or enjoy the benefit of any term of this Agreement." },
          { ref: "(b)", text: "Notwithstanding any term of this Agreement, the consent of any person who is not a Party is not required to rescind or vary this Agreement." },
        ],
      },
      {
        id: "governing_law",
        title: "Governing Law & Dispute Resolution",
        text: "**Governing Law & Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "This Agreement shall be governed by, and construed in accordance with, the laws of Singapore." },
          { ref: "(b)", text: "If any dispute, controversy, or claim arises out of or relating to this Agreement, or to the interpretation, breach, termination or validity of this Agreement, the Parties must use their best efforts to resolve such dispute through consultation or mediation. The consultation or mediation between the Parties must begin as soon as practicable after one disputing Party has delivered to the other disputing Party a written notice setting out the matter of the dispute." },
          { ref: "(c)", text: "If such dispute is not settled within thirty (30) days after the date of the relevant dispute notice referred to above, the dispute must be referred to and resolved by arbitration in Singapore in accordance with the Rules of the Singapore International Arbitration Centre (\"**SIAC Rules**\" and \"**SIAC**\" respectively). The tribunal will consist of one arbitrator, to be appointed by the president of the SIAC. The language of the arbitration will be English." },
        ],
      },
    ],
  },
];

/* ── Schedule 1: Interpretation ──────────────────────────────────────── */

export const SCHEDULE_TITLE = "SCHEDULE 1: INTERPRETATION";
export const SCHEDULE_INTRO = "In this Agreement, unless the context otherwise requires:";
export const SCHEDULE_DEFINITIONS_HEAD = "**Definitions.**";

export interface Definition {
  /** The term as defined: "Act". */
  term: string;
  /** What follows the term: "means the Companies Act 1967 of Singapore;". */
  text: string;
  subs?: string[];
  /** Only when this clause is in the agreement. */
  needs?: string;
  fd?: boolean;
}

export const DEFINITIONS: Definition[] = [
  { term: "Act", text: "means the Companies Act 1967 of Singapore;" },
  {
    term: "Affiliate",
    text: "means:",
    subs: [
      "(i) in respect of a person who is an individual, the Immediate Family Member or Investment Holding Company;",
      "(ii) in respect of a person who is a corporate, any person (including an individual) that directly or indirectly Controls or is under common Control with, or is Controlled by such person; and",
      "(iii) in respect of a Key Investor, any person directly or indirectly controlling, controlled by, or under common control of the Key Investor or its successor. For the avoidance of doubt, a general partner is deemed to control a limited partnership, and, solely for the purposes of this Agreement, a fund or investment holding company whose funds are advised or managed directly or indirectly by a person or by any fund management entity whose management is controlled directly or indirectly by the current management of that person shall also be deemed to be controlled by such person;",
    ],
  },
  { term: "Annual Budget", text: "shall have the meaning given to it in {{clause:annual_budget}} (Annual Budget);", needs: "annual_budget" },
  { term: "Asset Sale", text: "means the disposal by the Company of all or substantially all of its undertaking and assets (where disposal may include, without limitation, the grant by the Company of an exclusive licence of Intellectual Property not entered into in the ordinary course of business);" },
  { term: "Board", text: "means the board of directors for the time being of the Company;" },
  { term: "Business", text: "means {{business}}, and any other business that the Company may be involved in, as determined by the board of directors of the Company from time to time;" },
  { term: "Business Day", text: "means a day on which banks are open for business in Singapore (excluding Saturdays, Sundays or public holidays);" },
  { term: "Business Plan", text: "means the business plan for the Company;" },
  { term: "CEO Founder", text: "refers to {{ceo_founder}};" },
  { term: "Competitor", text: "shall mean a person (whether a body corporate, an individual or a group of individuals) engaging in a business substantially similar to the Business or that derives more than thirty per cent. (30%) of its annual revenue from the provision of services similar to those currently provided or likely to be provided by the Company or its subsidiaries or affiliates, in each case within any jurisdiction in which any Group Company is operating at the relevant time;" },
  { term: "Completion", text: "means the date of this Agreement;", fd: true },
  { term: "Constitution", text: "means the constitution for the time being of the Company;" },
  { term: "Control", text: "means directly or indirectly having the power to direct or cause the direction of the management and policies of a person, whether through the ownership of voting securities, by contract or otherwise, including (a) ownership or possession, directly or indirectly, of more than fifty per cent. (50%) of the shares or other equity securities in issue and/or voting power, of such person; (b) the power, directly or indirectly, to appoint a majority of the members of the board of directors or similar governing body of such person; or (c) in its capacity as the general partner, managing member, investment manager or the equivalent, of such person;" },
  { term: "Deed of Ratification and Accession", text: "means a deed of ratification and accession, in such form as the Board may reasonably require, under which a person agrees to be bound by this Agreement as a Shareholder;", fd: true },
  { term: "Director", text: "means a director for the time being of the Company;" },
  { term: "Drag Notice", text: "shall have the meaning given to it in {{clause:drag_along}}(a) (Drag Along);", needs: "drag_along" },
  { term: "Dragged Shareholder", text: "shall have the meaning given to it in {{clause:drag_along}}(a) (Drag Along);", needs: "drag_along" },
  { term: "Encumbrance", text: "means any mortgage, charge, security interest, lien, pledge, assignment by way of security, equity, claim, right of pre-emption, option, covenant, restriction, reservation, lease, trust, order, decree, judgment, title defect (including retention of title claim), conflicting claim of ownership or any other encumbrance of any nature whatsoever (whether or not perfected other than liens arising by operation of law);" },
  { term: "Event of Default", text: "shall have the meaning given to it in {{clause:defaulting}} (Defaulting Shareholder);", needs: "defaulting" },
  {
    term: "Fair Market Value",
    text: "means:",
    subs: [
      "(a) as of any date, the fair market value of the Shares, as determined by the Board in good faith on such basis as it deems appropriate and applied consistently with respect to all Shares; and",
      "(b) in the event that the relevant Shareholders do not agree with the Board's valuation of the Shares, the Board and the seller of such Shares shall obtain an independent valuation from the auditors of the Company or an independent firm of chartered accountants practising in Singapore or a chartered valuer and appraiser certified by the Institute of Valuers and Appraisers of Singapore to be jointly appointed by the Board and the seller of such Shares, and such costs and expenses shall be borne by the seller of such Shares;",
    ],
  },
  { term: "First ROFO Period", text: "shall have the meaning given to it in {{clause:rofo}}(b) (Right of First Offer);", needs: "rofo" },
  { term: "Founder Director", text: "means a Director appointed by a Founder Shareholder;", fd: true },
  { term: "Founder Shareholder", text: "means a Shareholder who acquired Shares in connection with the incorporation of the Company and is or was a director, employee, or consultant of the Company, being {{founder_names}}, and \"**Founders**\" and \"**Founder**\" shall be construed accordingly;" },
  { term: "Group Company", text: "shall mean the Company and each and any of its subsidiaries as established from time to time, and \"**Group**\" shall be construed accordingly;" },
  { term: "Immediate Family Member", text: "means, in relation to a person who is a natural person, such person's spouse, child or stepchild;" },
  { term: "Intellectual Property", text: "means all intellectual property rights, whether registered or not, including pending applications for registration of such rights and the right to apply for registration or extension of such rights including patents, petty patents, utility models, design patents, designs, copyright (including moral rights and neighbouring rights), database rights, rights in integrated circuits and other sui generis rights, trade marks, trading names, Company names, service marks, logos, the getup of products and packaging, geographical indications and appellations and other signs used in trade, internet domain names, social media user names, rights in knowhow and any rights of the same or similar effect or nature as any of the foregoing anywhere in the world;" },
  { term: "Investment Holding Company", text: "means a company in which such person holds the entire issued share capital and over which such person exercises Control;" },
  { term: "Investors", text: "means {{investor_names}}, and \"**Investor**\" means any of them;", fd: true },
  { term: "Key Investor", text: "shall refer to {{key_investors}};" },
  { term: "Lead Investor", text: "shall refer to {{lead_investor}};" },
  { term: "Lead Investor Director", text: "means a Director appointed by the Lead Investor;", fd: true },
  { term: "New Securities", text: "means any shares in the capital of the Company or other securities convertible into, or carrying the right to subscribe for, shares in the capital of the Company, excluding for the avoidance of doubt any Treasury Shares transferred by the Company;" },
  { term: "Notice of Participation", text: "shall have the meaning given to it in {{clause:tag_along}}(b) (Tag Along);", needs: "tag_along" },
  { term: "Ordinary Shares", text: "means ordinary shares in the capital of the Company;" },
  { term: "Parties", text: "means the Company and the Shareholders, and \"**Party**\" means any of them;" },
  { term: "Proposed Purchaser", text: "means a proposed purchaser who at the relevant time has made an offer on arm's length terms;" },
  { term: "Proposed Transferee", text: "shall have the meaning given to it in {{clause:rofo}}(d) (Right of First Offer);", needs: "rofo" },
  { term: "Qualifying IPO", text: "means the closing of a firmly underwritten public offering of shares of the Company for the purpose of and in connection with the admission of the Company to the Official List of the Singapore Exchange Securities Trading Limited or any other recognised securities exchange agreed by the Lead Investor and the listing of the shares of the Company on such securities exchange;" },
  { term: "Representatives", text: "shall have the meaning given to it in {{clause:confidentiality}}(c) (Confidentiality Obligations);", needs: "confidentiality" },
  {
    term: "Reserved Liquidation Event",
    text: "shall mean:",
    subs: [
      "(i) a liquidation, dissolution or winding up of the Company;",
      "(ii) a consolidation, merger, scheme of arrangement or amalgamation of the Company with or into any other corporation or corporations or non-corporate business entity or any other corporate reorganisation, in which the shareholders of the Company immediately prior to such consolidation, merger or reorganisation, own less than a majority of the surviving or acquiring entity's voting power immediately after such consolidation, merger or reorganisation;",
      "(iii) a sale, lease, transfer, exclusive license or other disposition of all or substantially all of the assets of the Company; or",
      "(iv) a transaction or series of transactions in which more than 50% of the voting power of the Company is disposed of;",
    ],
  },
  { term: "Second ROFO Period", text: "shall have the meaning given to it in {{clause:rofo}}(c) (Right of First Offer);", needs: "rofo" },
  { term: "Share Option Plan", text: "means the share option plan to be established by the Company pursuant to {{clause:share_option_plan}} (Share Option Plan);", needs: "share_option_plan" },
  { term: "Shareholder", text: "means any shareholder of the Company from time to time who is a party to this Agreement (but excludes the Company holding Shares as Treasury Shares from time to time);" },
  { term: "Shareholding Percentage", text: "means in relation to any Shareholder at any given time, the proportion in which the Shares for which the Shareholder is registered in the Company's electronic register of members bears to the total number of Shares issued in the capital of the Company as reflected in ACRA;" },
  { term: "Shares", text: "means issued shares in the capital of the Company, including {{share_classes}};" },
  { term: "SIAC", text: "shall have the meaning given to it in {{clause:governing_law}}(c) (Governing Law & Dispute Resolution);" },
  { term: "SIAC Rules", text: "shall have the meaning given to it in {{clause:governing_law}}(c) (Governing Law & Dispute Resolution);" },
  { term: "Subscribers", text: "shall have the meaning given to it in {{clause:pre_emptive}} (Pre-Emptive Rights);", needs: "pre_emptive" },
  { term: "Subscription Period", text: "shall have the meaning given to it in {{clause:pre_emptive}}(a) (Pre-Emptive Rights);", needs: "pre_emptive" },
  { term: "Subsidiary", text: "means any subsidiary for the time being of the Company;" },
  { term: "Tag Along Notice", text: "shall have the meaning given to it in {{clause:tag_along}}(a) (Tag Along);", needs: "tag_along" },
  { term: "Target Shareholder(s)", text: "shall have the meaning given to it in {{clause:drag_along}}(a) (Drag Along);", needs: "drag_along" },
  { term: "Transfer", text: "means any voluntary or involuntary sale, assignment, conveyance, gift, distribution or other disposition or transfer, but shall not include any Encumbrance, and the words \"Transferred\" and \"Transferring\" shall be construed accordingly;" },
  { term: "Transferring Shareholder", text: "shall have the meaning given to it in {{clause:rofo}}(a) (Right of First Offer);", needs: "rofo" },
  { term: "Treasury Shares", text: "means shares in the capital of the Company held by the Company as treasury shares; and" },
  { term: "United States Dollar(s)", text: "and the sign \"US$\" mean the lawful currency of the United States of America." },
];

/** Schedule 1, paragraphs after the definitions. */
export const SCHEDULE_RULES: { text: string; subs?: string[] }[] = [
  { text: "**Clauses, Schedules, etc.** References to this Agreement include any Recitals and Schedules to it and references to Clauses and Schedules are to the clauses of, and schedules to, this Agreement. References to paragraphs and Parts are to paragraphs and parts of the Schedules. The Schedules form part of this Agreement and have the same force and effect as if expressly set out in the body of this Agreement." },
  { text: "**Headings.** The headings used in this Agreement are for convenience only and shall not affect the interpretation of this Agreement." },
  { text: "**Including.** Unless a contrary indication appears, a reference in this Agreement to \"including\" shall not be construed restrictively but shall mean \"including without prejudice to the generality of the foregoing\" and \"including, but without limitation\"." },
  { text: "**Modification etc. of Statutes.** References to a statute or statutory provision include that statute or statutory provision as from time to time modified, re-enacted or consolidated (whether before or after the date hereof), so far as such modification, re-enactment or consolidation applies or is capable of applying to any transaction entered into in accordance with this Agreement and (so far as liability thereunder may exist or can arise) shall also include any past statute or statutory provision (as from time to time modified, re-enacted or consolidated) which such statute or provision has directly or indirectly replaced." },
  {
    text: "**Others.**",
    subs: [
      "References to \"this Agreement\" includes all amendments, additions, and variations thereto agreed between the Parties.",
      "References to \"day\", \"month\" or \"year\" is a reference to a day, month or year respectively in the Gregorian calendar.",
      "References to a Lead Investor Director shall include any alternate appointed to act in his place from time to time.",
      "References to a person include any Company, limited liability partnership, partnership, business trust or unincorporated association (whether or not having separate legal personality).",
      "Except where the context specifically requires otherwise, reference to a party or parties is to a Party or Parties.",
      "References to those of the Parties that are individuals include their respective legal personal representatives.",
      "References to \"writing\" or \"written\" includes any non-transitory form of visible reproduction of words.",
      "Reference to \"issued Shares\" of any class or Shares of any class \"in issue\" shall exclude any Shares of that class held as Treasury Shares from time to time, unless stated otherwise.",
      "Reference to the \"holders\" of a class of Shares shall exclude the Company holding Shares of that class as Treasury Shares from time to time, unless stated otherwise.",
      "References to one gender include all genders and references to the singular include the plural and vice versa.",
      "References to a person connected with or to another person shall be interpreted within the meaning of \"connected person\" as defined in Section 2 of the Securities and Futures Act 2001 of Singapore.",
      "The expression \"electronic register of members\" refers to the electronic register of members of the Company kept and maintained by the Registrar pursuant to Section 196A of the Act.",
      "References to \"fully-diluted\" means on the basis of the total number of outstanding Ordinary Shares assuming all convertible securities (including preference shares) are converted or exchanged and all rights, options or warrants to subscribe for or acquire shares are exercised and including all Ordinary Shares reserved or authorised for future issuance or grant under any equity incentive, share option or similar plan of the Company.",
      "Anything or obligation to be done under this Agreement which is required or falls to be done on a stipulated day, shall be done on the next succeeding Business Day, if the day upon which that thing or obligation is required or falls to be done falls on a day which is not a Business Day.",
    ],
  },
  { text: "**References to Subsidiaries and Related Corporations.** The words \"subsidiary\" and \"related corporation\" shall have the same meanings in this Agreement as their respective definitions in the Act." },
  { text: "**Subsidiary Legislation.** References to a statute or statutory provision include any subsidiary or subordinate legislation made from time to time under that statute or statutory provision." },
];

export const EXECUTED = "This Agreement has been executed on the date shown on the first page.";

/* ── the menu, for the admin list ─────────────────────────────────────── */

/** The firm's Master Menu (8 April 2025), with where each item sits in this master. */
export const MASTER_MENU: { menu: string; title: string; clause: string; note?: string }[] = [
  { menu: "1.1", title: "Board Size", clause: "board_size" },
  { menu: "1.2", title: "Composition", clause: "board_composition" },
  { menu: "1.3", title: "Right of Appointment and Removal of Director", clause: "appointment" },
  { menu: "1.4", title: "Nominee Director Appointment", clause: "", note: "Not in the 14 April master (its definitions still mention a \"Resident Director\" under 1.4(a)); dropped" },
  { menu: "1.5", title: "Meetings of Directors", clause: "meetings" },
  { menu: "1.6", title: "Chairman", clause: "chairman" },
  { menu: "2.1", title: "Quorum", clause: "gm_quorum" },
  { menu: "2.2", title: "Chairman of General Meetings", clause: "gm_chairman" },
  { menu: "2.3", title: "Shareholder Written Resolutions", clause: "", note: "Not in the 14 April master" },
  { menu: "2.4", title: "Shareholder Rights", clause: "shareholder_rights" },
  { menu: "2.5", title: "Shareholder Obligations", clause: "shareholder_obligations" },
  { menu: "3.1", title: "Management Accounts", clause: "management_accounts" },
  { menu: "3.2", title: "Annual Financial Statements", clause: "annual_statements" },
  { menu: "3.3", title: "Annual Budget", clause: "annual_budget" },
  { menu: "3.4", title: "Other Access Rights", clause: "access_rights", note: "With Other Information Rights" },
  { menu: "4", title: "Share Option Plan", clause: "share_option_plan" },
  { menu: "5", title: "Investor Reserved Matters", clause: "reserved_matters" },
  { menu: "6.1", title: "Pre-Emptive Rights", clause: "pre_emptive" },
  { menu: "6.2", title: "Allotment of New Shares", clause: "allotment" },
  { menu: "6.3", title: "Exceptions to Pre-Emptive Rights", clause: "exceptions", note: "The master also has Disposal of New Securities" },
  { menu: "7.1", title: "General Restrictions", clause: "general_restrictions" },
  { menu: "7.2", title: "Right of First Offer", clause: "rofo" },
  { menu: "7.3", title: "Drag Along", clause: "drag_along", note: "The master adds Tag Along before it" },
  { menu: "7.4", title: "Permitted Transfers", clause: "permitted_transfers" },
  { menu: "8.1", title: "Exit Events", clause: "exit_events" },
  { menu: "8.2", title: "Asset Sale", clause: "asset_sale" },
  { menu: "9.1", title: "Defaulting Shareholder", clause: "defaulting" },
  { menu: "9.2", title: "Effect of Death or Permanent Mental Disability", clause: "death" },
  { menu: "10", title: "Termination", clause: "termination", note: "The master adds Restrictive Covenants before it" },
  { menu: "11.1", title: "Confidentiality Obligations", clause: "confidentiality" },
  { menu: "11.2", title: "Exceptions", clause: "confidentiality", note: "Inside 11.1 in the master" },
  { menu: "11.3", title: "Shareholder's Obligations", clause: "shareholders_obligations_conf" },
  { menu: "11.4", title: "Survival", clause: "confidentiality_survival" },
  { menu: "12.1–12.16", title: "General", clause: "general", note: "The master adds Announcements and Intellectual Property before General" },
];

/** Slips in the 14 April master, fixed in this transcription. */
export const MASTER_CORRECTIONS: string[] = [
  "Cross-references: the master's body numbers Initial Structure as 1, but its references count Board of Directors as 1 (e.g. \"Clause 7.2 (Right of First Offer)\" for what is 8.2). References are now worked out from the agreement as drafted.",
  "Restrictive Covenants: the Founder Undertaking (stay employed three years) appears twice — as its own clause and again as (a) of Restrictive Covenants. Kept once.",
  "Business of the Company (b): \"use their reasonable endeavours to promote so far as…\" has no object; reads \"to promote the Business so far as…\".",
  "Business of the Company (c): \"the objects in the Articles\" → \"the Constitution\" (the defined term).",
  "Initial Board Composition points to \"item (x) of Table A\", which Table A does not have: item (4) Board of Directors is added, with the appointment rights the questionnaire gives.",
  "Quorum (general meetings): a stray \"[\" before \"two (2) Shareholders\" removed.",
  "Reserved Matters: an unclosed bracket \"(including any subsidiaries of the Company relating to this Clause and item (2)…\" tidied to \"(including any subsidiaries of the Company)\".",
  "Shareholder Obligations: \"save as otherwise provided agreed in writing\" → \"save as otherwise agreed in writing\".",
  "General Restrictions (g): \"give any affect\" → \"give any effect\".",
  "Announcements: the closing proviso was numbered as a third paragraph; it carries on the clause instead.",
  "Definitions: \"Completion\" and \"Investment Agreement\" described the client's own preference-share round; \"Completion\" now means the date of this Agreement and \"Investment Agreement\" is dropped. \"Seed\" and \"Pre-Series A Preference Shares\" are replaced by the classes in Table A.",
  "Definitions: \"Founder Director\", \"Lead Investor Director\" and \"Resident Director\" pointed to clauses not in the master (1.3(a)(i), 1.3(b)(i), 1.4(a)). The first two are now defined directly; \"Resident Director\" is dropped.",
  "Definitions: \"Deed of Ratification and Accession\" referred to a Schedule 3 the master does not contain; now \"in such form as the Board may reasonably require\".",
  "Definitions: \"Share Option Plan\" pointed to \"Clause 3.5\"; it now points to the Share Option Plan clause. Fair Market Value (b): costs \"borne by the Defaulting Shareholder\" → \"by the seller of such Shares\" (the definition is used for every sale, not only defaults).",
  "Definitions: \"Founders\", \"Investors\" and \"Group\" were used but not defined; now defined.",
];
