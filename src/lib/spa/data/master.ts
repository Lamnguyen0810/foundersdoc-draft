/**
 * Share Purchase Agreement — the wording FD AI assembles from.
 *
 * SOURCE. There is no FD Lite SPA master yet. This is the one SPA precedent
 * the firm has (a buyer-side draft for the purchase of 100% of a Singapore
 * company from one seller, November 2024), redacted —
 * SPA_Precedent_REDACTED.docx in AI files → Share Purchase Agreements — and
 * generalised so it works for any deal:
 *
 *   - written for one or more sellers ("the Sellers", "each Seller"); with
 *     one seller the assembler reads it in the singular;
 *   - the deal-only terms are taken out: the price paid in fund units and
 *     the investment agreement behind them, the integration of the target
 *     into the buyer's group, named staff, the working-capital top-up, the
 *     brand change, the consolidated audit and the exchange-rate clause
 *     (listed in REMOVED, for the admin page);
 *   - Schedule 3 Part B (the business warranties) is the precedent's,
 *     paragraph for paragraph, in data/warranties.ts.
 *
 * `fd: true` marks wording that is NOT in the precedent: the permutations
 * the questions need and the precedent has no clause for (several sellers,
 * a deposit, a cap on claims, court jurisdiction …). They are written in
 * the precedent's style and listed in the admin console as "FD
 * supplementary — for FD review". ADAPTATIONS lists where a precedent
 * clause was reworded to stand on its own; CORRECTIONS its slips.
 *
 * Markup, as the SHA master:
 *   {{field}}        fill in — anything unknown becomes [●] and is reported
 *   {{clause:id}}    "Clause 5.2" — worked out after numbering
 *   {{section:id}}   "Clause 5"
 *   **bold**         bold
 */

export const MASTER_VERSION = "SPA-P1";
export const MASTER_LOADED = true;

export interface MasterSub {
  ref: string | null;
  text: string;
  subs?: MasterSub[];
  id?: string;
  fd?: boolean;
}

export interface MasterClause {
  id: string;
  title: string;
  question?: string;
  text: string;
  subs?: MasterSub[];
  /** Unnumbered lines after the subs ("in each case within …"). */
  tail?: string;
  fd?: boolean;
}

export interface MasterSection {
  id: string;
  heading: string;
  clauses: MasterClause[];
  fd?: boolean;
}

/* ── the head ─────────────────────────────────────────────────────────── */

export const TITLE = "SHARE PURCHASE AGREEMENT";
export const MADE_ON = "THIS SHARE PURCHASE AGREEMENT (this \"**Agreement**\") is made on {{date}}";
export const BETWEEN = "BETWEEN:";
export const PARTY_COMPANY =
  "{{name}}, a company incorporated under the laws of {{jurisdiction}} with registration number {{id_no}} and having its registered office at {{address}}";
export const PARTY_INDIVIDUAL = "{{name}}, holder of identification number {{id_no}}, residing at {{address}}";
export const SELLERS_COLLECTIVE = "({{labels}} shall be collectively referred to as the \"**Sellers**\" and each, a \"**Seller**\").";
export const WHEREAS = "WHEREAS:";
export const RECITAL_A =
  "{{target_name}} is a company incorporated under the laws of Singapore with registration number {{target_reg_no}} and having its registered address at {{target_address}} (the \"**Target Company**\"). The Target Company is principally engaged in {{business}} (the \"**Business**\"). Particulars of the Target Company are set out in Schedule 1.";
export const RECITAL_B_ALL =
  "As at the date of this Agreement, the Sellers are the legal and beneficial owners of {{sale_shares}} issued ordinary shares in the capital of the Target Company, representing the entire issued share capital of the Target Company.";
export const RECITAL_B_PART =
  "As at the date of this Agreement, the Sellers are the legal and beneficial owners of {{sale_shares}} issued ordinary shares in the capital of the Target Company, out of {{issued_shares}} issued ordinary shares.";
export const RECITAL_C =
  "Upon and subject to the terms and conditions set out herein, the Buyer agrees to purchase from the Sellers, and the Sellers agree to sell to the Buyer, the Sale Shares (as defined below) (the \"**Acquisition**\").";
export const RECITAL_D =
  "Immediately following Closing (as defined below), the Buyer shall own the entire issued share capital of the Target Company, and the Target Company and its Business shall continue as a going concern in the ordinary and usual course, without any interruption or alteration in its nature, scope or manner.";
export const AGREED =
  "In consideration of the mutual covenants and agreements hereinafter set forth, and intending to be legally bound thereby, IT IS AGREED as follows:";

/* ── the definitions ──────────────────────────────────────────────────── */

/** `when`: the assembler keeps the definition only when that switch is on. */
export interface Definition {
  term: string;
  text: string;
  when?: "full" | "cashfree" | "deferred" | "deposit" | "mac" | "taxation" | "usd" | "sgd" | "key_people" | "no_key_people" | "conditions";
  fd?: boolean;
}

export const DEFINITIONS: Definition[] = [
  { term: "Accounts", when: "full", text: "means the latest audited accounts of the Target Company or, where the Target Company is exempt from audit, its latest unaudited financial statements, in each case made up to the Accounts Date;" },
  { term: "Accounts Date", when: "full", text: "means {{accounts_date}}, being the date on which the latest financial year of the Target Company ended and to which the Accounts are drawn up;" },
  { term: "Acquisition", text: "has the meaning ascribed to it under Recital (C);" },
  { term: "ACRA", text: "means the Accounting and Corporate Regulatory Authority of Singapore;" },
  {
    term: "Affiliate",
    text: "means, with respect to any Person, any other Person directly or indirectly controlling, controlled by, or under common control with such Person (including any subsidiary) and \"Affiliates\" and \"Affiliated\" shall be construed accordingly. For the purpose of this definition, the term \"control\", as used with respect to any Person, means the (a) direct or indirect ownership of more than 30% of the voting securities of such Person, (b) the right to appoint, or cause the appointment of, more than 50% of the members of the board of directors (or similar governing body) of such Person, or (c) the possession, directly or indirectly, of the power to direct or cause the direction of the management and policies of such Person or exercise significant influence over such Person, whether through the ownership of voting securities or by contract or otherwise (and \"controlling\", \"controlled by\" and \"under common control with\" shall be construed accordingly);",
  },
  { term: "Business", text: "has the meaning ascribed to it under Recital (A);" },
  { term: "Business Day", text: "means a day (other than Saturday, Sunday or a public holiday) on which banks located in Singapore are open for business;" },
  { term: "Buyer's Warranties", text: "means the representations and warranties to be given by the Buyer set out in Part C of Schedule 3;" },
  { term: "Cash and Equivalents", when: "cashfree", text: "means cash and other equivalent liquid assets, and includes amounts in all of the Target Company's bank accounts;" },
  { term: "Closing", text: "means the completion of the sale and purchase of the Sale Shares in accordance with {{section:closing}};" },
  { term: "Closing Accounts", when: "cashfree", text: "has the meaning ascribed to it in {{clause:adjustment}};" },
  { term: "Closing Date", text: "has the meaning ascribed to it in {{clause:closing_date}};" },
  { term: "Confidential Information", text: "has the meaning ascribed to it in {{clause:conf}};" },
  { term: "Consideration", text: "has the meaning ascribed to it in {{clause:amount}};" },
  {
    term: "Debt",
    when: "cashfree",
    text: "means all or any indebtedness of the Target Company, including without limitation (a) all obligations of the Target Company for borrowed moneys or evidenced by bonds, debentures, notes, letters of credit or other instruments and securities, (b) all obligations of the Target Company as lessee under capital leases, (c) all pledges of the Target Company and obligations of the Target Company to pay the deferred purchase price of goods, properties or services, except accounts payable, accrued expenses or trade payables arising in the normal course of business, (d) all debt of other parties guaranteed by the Target Company or secured by a lien on any of the assets of the Target Company, and (e) all Taxation liabilities;",
  },
  { term: "Deferred Consideration", when: "deferred", text: "has the meaning ascribed to it in {{clause:payment}};" },
  { term: "Deposit", when: "deposit", text: "has the meaning ascribed to it in {{clause:payment}};" },
  {
    term: "Encumbrance",
    text: "means any mortgage, pledge, lien, charge, interest under any pre-sale contracts, hypothecation, right of set-off or counterclaim, security interest, transfer restriction, security agreement or arrangement of any kind, purchase or option agreement or arrangement, subordination agreement or arrangement, and agreements to create or effect any of the foregoing;",
  },
  { term: "Government Authority", text: "means any court, tribunal, arbitrator, authority, agency, commission, official or other instrumentality of any country, territory, province, state, city or other political subdivision;" },
  { term: "Indemnified Persons", text: "has the meaning ascribed to it in {{clause:general_indemnity}};" },
  {
    term: "Intellectual Property Rights",
    text: "means Confidential Information, business or trade secrets, database rights, rights in Knowhow, patents, trade marks, service marks, trade names, design rights, copyright, domain names and other intellectual property rights, whether now known or created in future (of whatever nature and wherever arising), and in each case whether registered or unregistered and including applications for the grant of any such rights;",
  },
  { term: "Key Personnel", when: "key_people", text: "means the persons listed in Schedule 4;" },
  { term: "Key Personnel", when: "no_key_people", text: "means the directors and senior managers of the Target Company;" },
  {
    term: "Knowhow",
    text: "means confidential industrial and commercial information and techniques in any form (including paper, electronically stored data, magnetic media, film or microfilm) including without limitation drawings, formulae, reports, project reports and testing procedures, instruction and training manuals, tables of operating conditions, market forecasts, lists and particulars of customers and suppliers;",
  },
  { term: "Law", text: "means any law, treaty, statute, ordinance, code, rule or regulation of any Government Authority or any Order;" },
  { term: "Licences", when: "full", text: "has the meaning ascribed to it in Part B of Schedule 3;" },
  { term: "Losses", text: "has the meaning ascribed to it in {{clause:general_indemnity}};" },
  { term: "Management Accounts", when: "full", text: "means the unaudited management accounts of the Target Company drawn up to the Relevant Management Accounts Date;" },
  {
    term: "Material Adverse Change",
    when: "mac",
    text: "means in the reasonable opinion of the Buyer any condition, circumstance, change or effect that has a material adverse effect on the business, operations, assets, prospects or condition (financial or otherwise) of the Target Company taken as a whole;",
  },
  { term: "Order", text: "means any writ, judgment, decree, injunction, award or similar order of any Government Authority (in each case whether preliminary or final);" },
  { term: "Parties", text: "means the parties to this Agreement and the term \"Party\" refers to any of them;" },
  {
    term: "Person",
    text: "means an individual, firm, corporation, partnership, association, limited liability company, trust or estate or any other entity or organization whether or not having separate legal existence, including any Government Authority;",
  },
  { term: "Relevant Management Accounts Date", when: "full", text: "means the last day of the month immediately preceding the date of this Agreement, or such other date before the date of this Agreement as the Buyer may agree;" },
  { term: "Sale Shares", text: "{{sale_shares_def}}" },
  { term: "Sellers' Warranties", text: "means the representations and warranties to be given by the Sellers set out in {{seller_parts}} of Schedule 3;" },
  { term: "Singapore", text: "means the Republic of Singapore;" },
  { term: "Surviving Provisions", text: "means {{surviving}};" },
  { term: "S$", when: "sgd", text: "means Singapore dollars, the lawful currency of Singapore;" },
  { term: "Target Company", text: "has the meaning ascribed to it under Recital (A);" },
  {
    term: "Taxation",
    text: "or \"**Tax**\" means any and all applicable tax or taxes (including, but not limited to, any goods and services tax, value added tax, sales tax, income tax, or business tax, stamp or other duty, levy, impost, charge, fee, deduction, penalty or withholding imposed, levied, collected or assessed) and includes any interest thereon;",
  },
  {
    term: "Taxation Claim",
    when: "taxation",
    text: "includes (without limitation) any claim, counterclaim, assessment, notice, demand or other documents issued or action taken by or on behalf of any revenue, customs, fiscal, statutory, governmental or other authority whatsoever or official anywhere in any part of the world whereby the Target Company is liable or is sought to be made liable for any payment of any Taxation;",
  },
  { term: "Transfer Documents", text: "has the meaning ascribed to it in {{clause:seller_deliver}};" },
  { term: "US$", when: "usd", text: "means United States dollars, the lawful currency of the United States of America;" },
  { term: "Warranties", text: "means the Buyer's Warranties and the Sellers' Warranties, and the term \"Warranty\" shall be construed accordingly; and" },
  { term: "%", text: "means per cent." },
];

/* ── the clauses ─────────────────────────────────────────────────────── */

export const SECTIONS: MasterSection[] = [
  {
    id: "interpretation",
    heading: "DEFINITIONS AND INTERPRETATION",
    clauses: [
      { id: "definitions", title: "Definitions", text: "**Definitions.** As used in this Agreement, the following terms have the meanings specified below, unless the context requires otherwise:" },
      {
        id: "statutes",
        title: "References to Statutes",
        text: "**References to Statutes.** References to a statute or statutory provision include:",
        subs: [
          { ref: "(a)", text: "that statute or provision as from time to time modified, re-enacted or consolidated whether before or after the date of this Agreement; and" },
          { ref: "(b)", text: "any subordinate legislation made from time to time under that statute or statutory provision." },
        ],
      },
      {
        id: "references",
        title: "Clauses and Schedules",
        text: "**Clauses and Schedules.** References in this Agreement to Recitals, Clauses and Schedules are to Recitals and Clauses in, and Schedules to, this Agreement (unless the context otherwise requires). The Recitals and Schedules to this Agreement shall be deemed to form part of this Agreement.",
      },
      { id: "headings", title: "Headings", text: "**Headings.** Headings are inserted for convenience only and shall not affect the construction of this Agreement." },
      { id: "writing", title: "References to Writing", text: "**References to Writing.** References to writing shall include any methods of reproducing words in a legible and non-transitory form." },
      { id: "gender", title: "Gender", text: "**Gender.** The masculine gender shall include the feminine and neuter and the singular number shall include the plural and vice versa." },
      {
        id: "misc_interpretation",
        title: "Miscellaneous",
        text: "**Miscellaneous.** Unless the context requires otherwise:",
        subs: [
          { ref: "(a)", text: "any definition of or reference to any agreement, instrument or other document herein shall be construed as referring to such agreement, instrument or other document as from time to time amended, supplemented or otherwise modified (subject to any restrictions on such amendments, supplements or modifications set forth herein);" },
          { ref: "(b)", text: "any reference herein to any Person shall be construed to include such Person's permitted successors and assigns;" },
          { ref: "(c)", text: "any reference herein to a Law or governmental approval shall be deemed to refer to such Law or governmental approval as it may be amended from time to time;" },
          { ref: "(d)", text: "the words \"herein\", \"hereof\" and \"hereunder\", and words of similar import, shall be construed to refer to this Agreement in its entirety and not to any particular provision hereof;" },
          { ref: "(e)", text: "the words \"include\", \"includes\" and \"including\" are deemed to be followed by the phrase \"without limitation\";" },
          { ref: "(f)", text: "the words \"asset\" and \"property\" shall be construed to have the same meaning and effect and to refer to any and all tangible and intangible assets and properties, including cash, securities, accounts and contract rights; and" },
          { ref: "(g)", text: "all terms defined in this Agreement have their defined meanings when used in any certificate or other document made or delivered pursuant hereto, unless otherwise defined therein." },
        ],
      },
    ],
  },
  {
    id: "sale",
    heading: "SALE AND PURCHASE",
    clauses: [
      {
        id: "sale_purchase",
        title: "Sale and Purchase",
        text: "**Sale and Purchase.** Subject to the terms and conditions hereof, each Seller hereby agrees to sell to the Buyer, and the Buyer hereby agrees to purchase from each Seller, the Sale Shares set opposite that Seller's name in Schedule 2, free from all Encumbrances and together with all rights attaching to them at Closing.",
      },
      {
        id: "all_or_nothing",
        title: "All or Nothing",
        question: "P1",
        fd: true,
        text: "**All or Nothing.** The Buyer shall not be obliged to complete the purchase of any of the Sale Shares unless the purchase of all the Sale Shares is completed simultaneously.",
      },
      {
        id: "pre_emption",
        title: "Waiver of Pre-emption Rights",
        fd: true,
        text: "**Waiver of Pre-emption Rights.** Each Seller waives, and shall procure the waiver of, any right of pre-emption or other restriction on transfer which it may have in respect of the Sale Shares, whether under the constitution of the Target Company, any agreement or otherwise.",
      },
    ],
  },
  {
    id: "consideration",
    heading: "CONSIDERATION",
    clauses: [
      {
        id: "amount",
        title: "Consideration",
        question: "P6",
        text: "**Consideration.** The aggregate consideration for the Sale Shares shall be {{price_total}} (the \"**Consideration**\"), payable to the Sellers in the proportions set out in Schedule 2{{cashfree_phrase}}.",
      },
      {
        id: "payment",
        title: "Payment",
        question: "P5",
        text: "{{payment_text}}",
        subs: [
          { ref: "(a)", id: "pay_first", text: "{{pay_first}}" },
          { ref: "(b)", id: "pay_second", text: "{{pay_second}}" },
        ],
        tail: "{{payment_tail}}",
      },
      {
        id: "method",
        title: "Method of Payment",
        text: "**Method of Payment.** Each payment to a Seller shall be made by way of transfer to the bank account designated by that Seller in writing in immediately available funds, or in such manner as may be agreed between the Buyer and that Seller. Payment to that account shall be a good discharge of the Buyer's obligation to make that payment.",
      },
      {
        id: "set_off",
        title: "Set-off",
        question: "P5",
        fd: true,
        text: "**Set-off.** The Buyer may set off against the Deferred Consideration any amount which any Seller owes to the Buyer under this Agreement and which has been agreed by that Seller or finally determined by an arbitral tribunal or court of competent jurisdiction.",
      },
      {
        id: "adjustment",
        title: "Adjustment",
        question: "P6",
        text: "**Adjustment.** Within thirty (30) Business Days after the Closing Date, the Buyer shall procure that accounts of the Target Company drawn up to the Closing Date (the \"**Closing Accounts**\") are prepared and delivered to the Sellers. The Parties shall use the Closing Accounts to determine the Cash and Equivalents and the Debt of the Target Company as at the Closing Date (or confirmation that there is none), and:",
        subs: [
          { ref: "(a)", text: "if the Target Company has any undischarged Debt, the Consideration shall be reduced by the total Debt, which shall be borne by the Sellers and paid by them to the Buyer{{debt_deduct}}; and" },
          { ref: "(b)", text: "if the Target Company has any Cash and Equivalents, the Consideration shall be increased by the total Cash and Equivalents, which shall be paid by the Buyer to the Sellers," },
        ],
        tail: "in each case within fourteen (14) Business Days after the delivery of the Closing Accounts, and in the proportions set out in Schedule 2.",
      },
    ],
  },
  {
    id: "conditions",
    heading: "CONDITIONS PRECEDENT",
    clauses: [
      {
        id: "cp",
        title: "Conditions",
        question: "P7",
        text: "**Conditions.** Closing shall be conditional upon fulfilment or waiver, as the case may be, of the following conditions precedent:",
        subs: [
          { ref: "(a)", id: "cp_due_diligence", text: "the Buyer having completed, and being satisfied with the results of, the due diligence review conducted on the Target Company regarding, including but not limited to, its affairs, assets, liabilities, operations, records, financial condition, asset values, accounts, business performance, legal and financial structures and tax status;" },
          { ref: "(b)", id: "cp_no_mac", text: "there being no Material Adverse Change;" },
          { ref: "(c)", id: "cp_warranties", text: "the representations, warranties and undertakings of the Sellers, including those set out in {{seller_parts}} of Schedule 3, being true, accurate and complete in all material respects and not misleading or deceptive in any respect;" },
          { ref: "(d)", id: "cp_no_breach", text: "there having been no material breach by any Seller of its obligations under this Agreement and/or any documents incidental to the Acquisition to which it is a party;" },
          { ref: "(e)", id: "cp_approvals", fd: true, text: "the board of directors and, where required, the shareholders of the Target Company having approved the transfer of the Sale Shares to the Buyer, and each Person entitled to any right of pre-emption or other right over any of the Sale Shares having irrevocably waived it;" },
          { ref: "(f)", id: "cp_consents", fd: true, text: "the Target Company having obtained, in such form as the Buyer may reasonably require, each consent or waiver from a counterparty to a contract with the Target Company which is required for the Acquisition, or without which that counterparty may terminate or vary the contract by reason of the Acquisition;" },
          { ref: "(g)", id: "cp_key_people", text: "each of the Key Personnel having entered into an employment agreement with the Target Company (or such Affiliate of the Buyer as the Buyer may designate), in such form and substance that is satisfactory to the Buyer, which shall include relevant non-competition and non-solicitation provisions." },
        ],
      },
      { id: "endeavours", title: "Endeavours", text: "**Endeavours.** The Sellers and the Buyer shall use their best endeavours to ensure the satisfaction of the relevant conditions precedent set out in {{clause:cp}}." },
      { id: "cp_waiver", title: "Waiver", text: "**Waiver.** The Buyer may waive in whole or in part any of the conditions precedent set out in {{clause:cp}} by written notice to the Sellers." },
      {
        id: "longstop",
        title: "Long-stop Date",
        question: "P8",
        text: "**Long-stop Date.** If any of the conditions precedent in {{clause:cp}} are not fulfilled (or waived by the Buyer, as the case may be) on or before the date falling {{longstop}} after the date of this Agreement (or such later date as agreed between the Parties in writing), this Agreement (other than the Surviving Provisions and without prejudice to any other rights and remedies which a Party may have in respect of any breach of this Agreement by any other Party) shall automatically lapse and be of no further effect and none of the Parties shall have any claim against the other under this Agreement, save for any claim arising from any antecedent breach of any obligation before the termination of this Agreement.",
      },
    ],
  },
  {
    id: "closing",
    heading: "CLOSING",
    clauses: [
      { id: "closing_date", title: "Closing Date", question: "P9", text: "{{closing_text}}" },
      {
        id: "seller_deliver",
        title: "Sellers' Deliverables",
        question: "P12",
        text: "**Sellers' Deliverables.** On the Closing Date, the Sellers shall deliver or make available or release to the Buyer:",
        subs: [
          { ref: "(a)", text: "a copy of the duly executed corporate approvals and/or authorisations from the board of directors of the Target Company noting and approving the Acquisition, and authorising and approving, inter alia, (i) the cancellation of the existing share certificates in respect of the Sale Shares and the issue of new share certificates in respect of the Sale Shares in favour of the Buyer, (ii) the entering of the name of the Buyer into the register of members of the Target Company as the holder of the Sale Shares, the making of such other entries into other corporate records of the Target Company and the filing of the necessary forms with ACRA, and (iii) all matters incidental hereto, in such form and substance that is satisfactory to the Buyer;" },
          { ref: "(b)", text: "the share transfer documents dated the Closing Date in respect of the Sale Shares (the \"**Transfer Documents**\") duly signed by each Seller in favour of the Buyer;" },
          { ref: "(c)", text: "the relevant current share certificates comprising the Sale Shares (to be cancelled and re-issued, taking into account the Sale Shares);" },
          { ref: "(d)", id: "sd_books", text: "all corporate documents, statutory books, accounts, financials, and other books and records relating to the Target Company whether stored physically and/or in a digital format, all complete and up to date as at the Closing Date;" },
          { ref: "(e)", id: "sd_seals", text: "originals of all chops, stamps, current cheque books, unissued share certificates, documents for tax filings and other company books (duly written up-to-date) of the Target Company;" },
          { ref: "(f)", id: "sd_bank", text: "all bank tokens or equivalent, and the documents needed to grant the Buyer electronic access to all bank accounts of the Target Company;" },
          { ref: "(g)", id: "sd_resign", text: "if so requested by the Buyer, a letter of resignation from each Seller who is a director of the Target Company, with effect from the Closing Date, confirming that he has no claim against the Target Company for compensation for loss of office or otherwise;" },
          { ref: "(h)", id: "sd_waiver", fd: true, text: "a deed of waiver from each Seller, in such form and substance that is satisfactory to the Buyer, confirming that it has no claim of any kind against the Target Company (including for any loan, fee, salary or reimbursement) and irrevocably waiving any such claim;" },
          { ref: "(i)", id: "sd_cp", text: "documentary evidence showing that the conditions precedent in {{clause:cp}} have been fulfilled (save for any which the Buyer has waived); and" },
          { ref: "(j)", text: "any other documents as the Buyer may reasonably require to give effect to the Acquisition." },
        ],
      },
      {
        id: "buyer_deliver",
        title: "Buyer's Deliverables",
        text: "**Buyer's Deliverables.** Against the delivery of all the documents from the Sellers set out in {{clause:seller_deliver}}, the Buyer shall simultaneously on the Closing Date:",
        subs: [
          { ref: "(a)", id: "bd_board", text: "deliver or make available to the Sellers a copy of the duly executed corporate approvals and/or authorisations from the board of directors of the Buyer authorising and approving inter alia (i) the Acquisition, (ii) the execution of this Agreement, and (iii) the transactions contemplated hereunder and all matters incidental hereto;" },
          { ref: "(b)", text: "deliver to the Sellers the Transfer Documents dated the Closing Date in respect of the Sale Shares duly signed by the Buyer; and" },
          { ref: "(c)", text: "pay the part of the Consideration due on the Closing Date in accordance with {{clause:payment}}." },
        ],
      },
      {
        id: "stamping",
        title: "Stamping",
        text: "**Stamping.** As soon as practicable following the Parties' compliance with {{clause:seller_deliver}} and {{clause:buyer_deliver}}, the Parties shall:",
        subs: [
          { ref: "(a)", text: "arrange for the Transfer Documents to be duly stamped (including the payment of any stamp duty payable thereon in accordance with {{clause:costs}}); and" },
          { ref: "(b)", text: "serve on the Target Company the duly executed and stamped Transfer Documents, together with the relevant share certificates (to be cancelled and re-issued, taking into account the Sale Shares)." },
        ],
      },
      {
        id: "filings",
        title: "Filings",
        text: "**Filings.** Upon presentation of the documents referred to in {{clause:stamping}}(b) to the Target Company, the Sellers shall procure that the Target Company shall, within three (3) Business Days after the date on which the Transfer Documents become duly stamped:",
        subs: [
          { ref: "(a)", text: "file the transfer of the Sale Shares with ACRA and deliver a copy of the filing record to the Buyer;" },
          { ref: "(b)", text: "deliver an electronic copy of the share certificate of the Target Company issued in the name of the Buyer evidencing the transfer of the Sale Shares to the Buyer; and" },
          { ref: "(c)", text: "deliver the updated register of members maintained by the Target Company evidencing the transfer of the Sale Shares to the Buyer." },
        ],
      },
      {
        id: "board_change",
        title: "New Directors and Signatories",
        text: "**New Directors and Signatories.** Upon and after Closing, the Buyer shall be entitled to nominate new directors to the board of directors of the Target Company and to change the authorised signatories of the Target Company's bank accounts to any Person as the Buyer may designate from time to time, and the Sellers shall procure that this is done at Closing if the Buyer so requests.",
      },
    ],
  },
  {
    id: "warranties",
    heading: "WARRANTIES",
    clauses: [
      {
        id: "seller_warranties",
        title: "The Sellers' Warranties",
        question: "P14",
        text: "**The Sellers' Warranties.** Subject to any disclosures made by the Sellers to the Buyer in writing before the date of this Agreement, which form part of the Sellers' Warranties, each Seller warrants and represents to the Buyer that the Sellers' Warranties are true and accurate and not misleading in any respect as at the date of this Agreement and at Closing.",
      },
      { id: "buyer_warranties", title: "The Buyer's Warranties", text: "**The Buyer's Warranties.** The Buyer warrants and represents to the Sellers that the Buyer's Warranties are true and accurate and not misleading in any respect as at the date of this Agreement and at Closing." },
      { id: "reliance", title: "Reliance", text: "**Reliance.** The Sellers acknowledge that the Buyer has entered into this Agreement in reliance upon the Sellers' Warranties. The Buyer acknowledges that the Sellers have entered into this Agreement in reliance upon the Buyer's Warranties." },
      { id: "separate_warranties", title: "Separate Warranties", text: "**Separate Warranties.** Each of the Warranties shall be separate and independent and severally enforceable and shall not be limited by reference to any other paragraph or anything in this Agreement." },
      { id: "effect_of_closing", title: "Effect of Closing", text: "**Effect of Closing.** The Warranties and all other provisions of this Agreement, to the extent that they have not been performed by Closing, shall not be extinguished or affected by Closing, or by any other event or matter, except by a specific and duly authorised written waiver or release by the Parties." },
    ],
  },
  {
    id: "pre_closing",
    heading: "PRE-CLOSING",
    clauses: [
      {
        id: "conduct",
        title: "Conduct of Business",
        question: "P10",
        text: "**Conduct of Business.** Unless otherwise agreed in writing by the Buyer, the Sellers undertake to procure that, between the date of this Agreement and the Closing Date, the Target Company:",
        subs: [
          { ref: "(a)", text: "shall preserve and maintain in full force and effect its corporate existence and its material assets used in the conduct of its Business;" },
          { ref: "(b)", text: "shall carry on its Business as a going concern in the ordinary and usual course as carried on prior to the date of this Agreement;" },
          { ref: "(c)", text: "shall comply with all applicable Laws (including maintaining all existing licences for the Business);" },
          { ref: "(d)", text: "shall discharge all its debts and liabilities (including Taxes) on or prior to their maturity or payment due date;" },
          { ref: "(e)", text: "shall maintain in force all existing insurance policies (which are material to the Business and operation of the Target Company) for the benefit of the Target Company and/or its employees; and" },
          {
            ref: "(f)",
            text: "save as to the transactions contemplated under this Agreement, and without prejudice to the generality of paragraph (a), shall not:",
            subs: [
              { ref: "(i)", text: "enter into or amend any agreement or incur any commitment which is not in the ordinary and usual course of business;" },
              { ref: "(ii)", text: "acquire or dispose of, or agree to acquire or dispose of, any material asset or enter into or amend any agreement or incur any commitment to do so;" },
              { ref: "(iii)", text: "incur any indebtedness in the nature of borrowings other than those already incurred as at the date of this Agreement;" },
              { ref: "(iv)", text: "create, allot or issue any share capital or loan capital of the Target Company or any option to subscribe for the same or any security or obligation which is by its terms convertible into or exchangeable or exercisable for shares or other share capital of the Target Company;" },
              { ref: "(v)", text: "repay, redeem or repurchase any share capital or loan capital of the Target Company;" },
              { ref: "(vi)", text: "pass any shareholders' resolution other than for the purposes contemplated in this Agreement;" },
              { ref: "(vii)", text: "declare, make or pay any dividend or other distribution to its shareholders;" },
              { ref: "(viii)", text: "save as required by Law or as contemplated by this Agreement, change the terms and conditions of employment of any of its Key Personnel, provide or agree to provide any gratuitous payment or benefit to any person or any of his/her dependants, dismiss any Key Personnel, or engage or appoint any additional Key Personnel;" },
              { ref: "(ix)", text: "alter or change the scope of the principal business of the Target Company;" },
              { ref: "(x)", text: "enter into any arrangement, contract or agreement with its Affiliates except on an arm's length basis and in the ordinary course of business;" },
              { ref: "(xi)", text: "adopt any share option plan or employee share ownership plan or other share scheme;" },
              { ref: "(xii)", text: "appoint any additional directors to its board of directors or otherwise change the size of its board of directors;" },
              { ref: "(xiii)", text: "enter into any guarantee, indemnity or other agreement to secure any obligation of a third party or create any Encumbrance (other than liens arising by operation of Law) over any of its assets or undertaking, save in the ordinary course of business;" },
              { ref: "(xiv)", text: "settle an insurance claim materially below the amount claimed;" },
              { ref: "(xv)", text: "initiate, defend, waive, settle or compromise any mediation, litigation, arbitration or other civil or criminal proceedings, or any other action, claim or dispute, except as disclosed to the Buyer as at the date of this Agreement and/or contemplated in this Agreement; or" },
              { ref: "(xvi)", text: "make any change to its accounting principles, standards, practices or policies or amend its constitution, unless required by applicable Laws." },
            ],
          },
        ],
      },
      {
        id: "access",
        title: "Other Obligations of the Sellers before Closing",
        text: "**Other Obligations of the Sellers before Closing.** {{access_lead}}the Sellers undertake, to the extent permitted by applicable Laws, before and upon Closing, to:",
        subs: [
          { ref: "(a)", text: "collaborate with the Buyer in relation to all material matters concerning the business and operation of the Target Company;" },
          { ref: "(b)", text: "consult with such representatives and advisers as may be designated by the Buyer with respect to any action which may materially affect the business of the Target Company, and provide to such representatives and advisers such information as they may reasonably request for this purpose;" },
          { ref: "(c)", text: "provide the Buyer and its authorised agents and representatives with such information regarding the business and affairs of the Target Company as they may reasonably require and, upon reasonable prior notice in writing, provide access to, and allow them to take copies of, the books, records and documents of, or relating in whole or in part to, the Target Company;" },
          { ref: "(d)", text: "allow the Buyer and its authorised agents and representatives to have such direct contact with the Target Company's auditors as the Buyer may reasonably require; and" },
          { ref: "(e)", text: "forthwith notify the Buyer of any change affecting any of the Sellers' Warranties and take such steps as may be requested by the Buyer to remedy the same." },
        ],
      },
      { id: "separate_undertakings", title: "Separate Undertakings", text: "**Separate Undertakings.** Each of the undertakings in this {{section:pre_closing}} shall be separate and independent and severally enforceable obligations of each Seller." },
    ],
  },
  {
    id: "covenants",
    heading: "COVENANTS",
    clauses: [
      {
        id: "seller_covenants",
        title: "Sellers' Covenants",
        text: "**Sellers' Covenants.** Unless otherwise instructed by the Buyer, each Seller undertakes and covenants with the Buyer that upon and after the Closing Date:",
        subs: [
          { ref: "(a)", text: "it shall not claim ownership of any right, title or interest in or to the Target Company's assets (including but not limited to all Intellectual Property Rights of the Target Company), and unless otherwise agreed by the Buyer, shall not take any actions which may (i) interfere with or impair {{control_phrase}}, or (ii) otherwise cause any adverse impact on the Target Company's assets and the Business;" },
          { ref: "(b)", text: "it shall in good faith and with best endeavours provide all necessary assistance to the Target Company in the event of any claims, investigations or inquiries purportedly arising out of any of the business dealings and business practice carried on prior to the Closing Date and non-compliance with the applicable Laws, regulations, rules and guidelines which occurred prior to the Closing Date; and" },
          { ref: "(c)", id: "cv_handover", text: "it shall carry out any other actions as reasonably requested by the Buyer to hand over the management of the Target Company and its Business to the Buyer." },
        ],
      },
    ],
  },
  {
    id: "restraints",
    heading: "NON-COMPETITION AND NON-SOLICITATION",
    clauses: [
      {
        id: "restrictions",
        title: "Restrictions",
        question: "P19",
        text: "**Restrictions.** Unless it has obtained the prior written consent of the Buyer, during the period of {{restraint_years}} after the Closing Date, no Seller shall, and each Seller shall procure that its Affiliates shall not, either alone or jointly, with, through or on behalf of any person, directly or indirectly:",
        subs: [
          { ref: "(a)", id: "rs_compete", text: "whether on its own behalf or on behalf of or in association with any third party in any capacity, carry on or be engaged or concerned or interested (whether for reward or otherwise) in any activities which are or are about to be engaged in or which are or are reasonably expected to be or likely to be in direct competition or conflict of interests with the Business in any location where the Target Company carries on the Business;" },
          { ref: "(b)", id: "rs_poach", text: "solicit or entice away from, or endeavour to solicit or entice away from, or contact with a view to the engagement or employment by any person, any employee, officer or manager of the Target Company or any person who has been an employee, officer or manager of the Target Company, whether or not that person would commit any breach of their contract of employment, engagement or similar arrangement by reason of leaving the service of the Target Company; or" },
          { ref: "(c)", id: "rs_clients", text: "solicit, canvass or otherwise interfere with, or endeavour to solicit, canvass or otherwise interfere with, whether directly or indirectly, any person, firm, company or other organisation who is a customer or supplier of the Target Company or is negotiating with a view to doing business with the Target Company." },
        ],
      },
      { id: "restraint_separate", title: "Separate Obligations", text: "**Separate Obligations.** Each and every obligation under {{clause:restrictions}} shall be treated as a separate obligation and shall be severally enforceable as such." },
      {
        id: "restraint_reasonable",
        title: "Reasonableness",
        text: "**Reasonableness.** While the restrictions contained in this {{section:restraints}} are considered by the Parties to be reasonable in all the circumstances, if any of those restrictions in {{clause:restrictions}}, by themselves or taken together, are adjudged to go beyond what is reasonable in all the circumstances for the protection of the legitimate interest of the Buyer or the Target Company but would be adjudged reasonable or valid if part or parts of their wording were deleted or amended or qualified or the periods referred to were reduced or the range of services or area dealt with were reduced in scope, then the relevant restriction(s) shall apply with such modification or modifications as may be necessary to make it or them valid and effective to the maximum extent permitted by Law.",
      },
    ],
  },
  {
    id: "termination",
    heading: "TERMINATION",
    clauses: [
      {
        id: "t_warranty",
        title: "Right of Termination",
        question: "P11",
        text: "**Right of Termination.** If it shall be found prior to Closing that any of the Sellers' Warranties was, when given, or will be or would be, at Closing (as if repeated again at Closing) materially untrue or materially misleading, the Buyer shall be entitled (in addition to and without prejudice to all other rights or remedies available to it including the right to claim damages) by notice in writing to the Sellers to terminate this Agreement (other than the Surviving Provisions). Any failure by the Buyer to exercise such right shall not constitute a waiver of any other rights of the Buyer arising out of any breach of warranty.",
      },
      {
        id: "t_undertakings",
        title: "Termination – Breach of Undertakings",
        question: "P11",
        text: "**Termination – Breach of Undertakings.** Without prejudice to the Buyer's right to claim damages or other compensation, if prior to Closing, any Seller is in material breach of its undertakings in {{section:pre_closing}} and such breach is capable of being remedied but has not been remedied within ten (10) Business Days after the Buyer sending written notice requiring it to remedy such breach, the Buyer shall be entitled by notice in writing to the Sellers to immediately terminate this Agreement (other than the Surviving Provisions).",
      },
      {
        id: "t_mac",
        title: "Termination – Material Adverse Change",
        question: "P11",
        text: "**Termination – Material Adverse Change.** If prior to Closing, any Material Adverse Change shall occur, the Buyer shall be entitled by notice in writing to the Sellers to immediately terminate this Agreement (other than the Surviving Provisions).",
      },
      {
        id: "t_effect",
        title: "Effect of Termination",
        text: "**Effect of Termination.** The termination of this Agreement for any cause shall not release a Party from any liability which at the time of termination has already accrued or which thereafter may accrue in respect of any act or omission prior to such termination.",
      },
    ],
  },
  {
    id: "indemnity",
    heading: "INDEMNITY",
    clauses: [
      {
        id: "general_indemnity",
        title: "General Indemnity",
        question: "P18",
        text: "**General Indemnity.** Each Seller agrees and undertakes with the Buyer to indemnify and hold harmless the Buyer, its Affiliates and any of their respective directors, officers, controlling persons, employees, agents and representatives (collectively, the \"**Indemnified Persons**\", each an \"**Indemnified Person**\") fully and effectually from and against all direct and indirect losses, damages, liabilities, claims, proceedings, demands, costs and expenses (including the fees, disbursements and other charges of counsel incurred by the Indemnified Persons in any action between any Seller and the Indemnified Person or between the Indemnified Persons and any third party, in connection with any investigation, evaluation, disputing and defending of a claim or otherwise) (collectively, the \"**Losses**\") which arise from or in relation to:",
        subs: [
          { ref: "(a)", text: "any misrepresentation or alleged misrepresentation or any breach or alleged breach by any Seller of any of its representations, warranties, undertakings, obligations or provisions under this Agreement, save and except that such Losses are caused by the gross negligence, wilful default or fraud of any Indemnified Person; and" },
          { ref: "(b)", id: "gi_tax", text: "any governmental penalties, other punishments or additional amounts payable and any dispute with a third party resulting from any non-compliance of the Target Company with the pre-Closing liabilities, obligations, Laws, rules, regulations and guidelines, or any Taxation Claim which has been made or may hereafter be made wholly or partly in respect of or in consequence of any event or any income, profits or gains earned, accrued or received or alleged to, or should, have been earned or accrued or received by the Target Company on or before the Closing Date whether or not the Taxation so claimed is chargeable against or attributable to any other person." },
        ],
      },
      {
        id: "claims_conduct",
        title: "Notice of Claims",
        text: "**Notice of Claims.** If any action, proceeding, claim or demand shall be brought or asserted against an Indemnified Person in respect of which any Seller is or may be liable to indemnify as herein provided, the Buyer shall notify the Sellers in writing as soon as reasonably practicable, and the Indemnified Person may employ such legal advisers as it may select, except that failure to provide such notice to the Sellers shall not relieve any Seller of its obligations hereunder unless that Seller is materially prejudiced thereby.",
      },
      {
        id: "specific_indemnities",
        title: "Specific Indemnities",
        question: "P18",
        text: "**Specific Indemnities.** In addition to and without prejudice to any other rights and remedies available to the Indemnified Persons and notwithstanding any other provision in this Agreement, each Seller irrevocably undertakes to fully indemnify the Indemnified Persons from and against the Losses which arise from or in relation to:",
        subs: [
          { ref: "(a)", id: "si_registers", text: "the failure of the Target Company, before Closing, to keep and maintain its (i) register of directors' shareholdings, (ii) register of substantial shareholders, (iii) register of chief executive officer's shareholdings, (iv) register of nominee shareholders, and (v) register of charges, or to file any notice with ACRA within the prescribed time limit; and" },
          { ref: "(b)", id: "si_other", text: "{{indemnity_other}}." },
        ],
      },
      {
        id: "seller_liability",
        title: "Liability of the Sellers",
        question: "P17",
        fd: true,
        text: "{{liability_text}}",
      },
      {
        id: "cap",
        title: "Limitation",
        question: "P16",
        fd: true,
        text: "**Limitation.** The aggregate liability of the Sellers in respect of all claims under this Agreement shall not exceed {{cap_amount}}, save that this limitation shall not apply to any claim arising from the fraud, wilful misconduct or dishonesty of any Seller.",
      },
      { id: "other_remedies", title: "Other Remedies", text: "**Other Remedies.** This {{section:indemnity}} shall not be deemed to preclude or otherwise limit in any way the exercise of any other rights or pursuit of any other remedies for the breach of or misrepresentation under this Agreement or any other agreement contemplated herein." },
      { id: "survival", title: "Survival", question: "P15", text: "**Survival.** The Sellers' Warranties contained in or made pursuant to this Agreement, and the indemnification obligations contained in this {{section:indemnity}} with respect thereto, shall survive for {{survival}} after the Closing Date.{{tax_survival_sentence}}" },
    ],
  },
  {
    id: "misc",
    heading: "MISCELLANEOUS",
    clauses: [
      {
        id: "costs",
        title: "Costs",
        question: "P20",
        text: "**Costs.** Each Party shall bear its own fees, costs and expenses, as well as any Tax and duties incurred in relation to the negotiation, preparation, review, execution and performance (where applicable) of this Agreement, any due diligence exercise and other matters (including Closing) incidental to any of the foregoing. {{stamp_sentence}}",
      },
      {
        id: "notices",
        title: "Communication",
        text: "**Communication.** Any notice, claim or demand in connection with this Agreement or with any legal action or proceedings under this Agreement shall be in writing and shall be sufficiently given or served if delivered or sent to the Parties at the address or email address set out below (or such other address as a Party has by five (5) Business Days' prior written notice specified to the other Parties):",
      },
      {
        id: "deemed_delivery",
        title: "Deemed Delivery",
        text: "**Deemed Delivery.** Any notice, demand or other communication so addressed to the relevant Party shall be deemed to have been delivered:",
        subs: [
          { ref: "(a)", text: "if by personal delivery, at the time of delivery;" },
          { ref: "(b)", text: "if by registered mail, within two (2) Business Days after posting if sent to a local address, or within four (4) Business Days if sent to an overseas address; or" },
          { ref: "(c)", text: "if by e-mail, at the time of sending provided that (i) it is not returned undelivered, and (ii) it is delivered by 5:00 p.m. (Singapore time). In the event that the e-mail is sent after 5:00 p.m. (Singapore time), it shall be deemed to be delivered on the following day." },
        ],
      },
      {
        id: "conf",
        title: "Confidentiality",
        text: "**Confidentiality.** Subject to {{clause:conf_permitted}}, each Party shall keep strictly confidential and not disclose or use, and shall ensure that its Affiliates and its officers, employees, agents and professional and other advisers keep strictly confidential and not disclose or use, any documents, materials and other information (the \"**Confidential Information**\") in whatever form received or obtained by it before or after the date of this Agreement which relates to:",
        subs: [
          { ref: "(a)", text: "the business, customers, assets, financial or other affairs (including future plans and targets) of any other Party, the Target Company or any of their respective Affiliates which is acquired as a result of the negotiation of this Agreement;" },
          { ref: "(b)", text: "any information obtained as a result of or in connection with the entering into of this Agreement, or the existence or terms of this Agreement or any transaction contemplated by this Agreement, or the identities of the Parties, the Target Company and their respective Affiliates; or" },
          { ref: "(c)", text: "information relating to the Target Company that each Party is entitled to receive pursuant to the terms of this Agreement." },
        ],
      },
      {
        id: "conf_excluded",
        title: "Excluded Information",
        text: "**Excluded Information.** For the purpose of this Agreement, the Confidential Information does not include any document, material or other information that:",
        subs: [
          { ref: "(a)", text: "was lawfully in the possession of the receiving Party prior to its disclosure by the disclosing Party and had not been obtained from the disclosing Party;" },
          { ref: "(b)", text: "is or becomes generally known to the public (other than by breach of this Agreement or any other obligation of confidentiality owed between the Parties);" },
          { ref: "(c)", text: "is or becomes available to the receiving Party other than as a result of a disclosure by a Person known by the receiving Party to be bound by an obligation of secrecy to the disclosing Party; or" },
          { ref: "(d)", text: "is independently developed by the receiving Party without reference to the Confidential Information." },
        ],
      },
      {
        id: "conf_permitted",
        title: "Permitted Disclosure",
        text: "**Permitted Disclosure.** {{clause:conf}} shall not prohibit disclosure or use of any Confidential Information if and to the extent that:",
        subs: [
          { ref: "(a)", text: "the disclosure or use is required by Law, Order or by any Government Authority having jurisdiction over the receiving Party or its Affiliates, whether or not the requirement has the force of Law;" },
          { ref: "(b)", text: "the disclosure or use is required to vest the full benefit of this Agreement in the receiving Party;" },
          { ref: "(c)", text: "the disclosure or use is required for the purpose of any judicial, arbitration or other similar proceedings arising out of this Agreement, the disclosure is reasonably required to be made to a Government Authority in connection with the Taxation affairs of the receiving Party or the disclosure is reasonably required for the purpose of preparing any statutory accounts of the receiving Party;" },
          { ref: "(d)", text: "the disclosure is made to the Affiliates of the receiving Party, or to the officers, employees, agents, creditors (present or potential) and professional and other advisers of the receiving Party or its Affiliates, where such person has a business-related need to have access to or use the Confidential Information on terms that each such person undertakes to comply with the provisions of {{clause:conf}} in respect of such information as if it were a Party to this Agreement and the receiving Party disclosing such information to such person shall be liable for any breach of {{clause:conf}} by such person; or" },
          { ref: "(e)", text: "the disclosing Party has given prior written approval to the disclosure or use," },
        ],
        tail: "provided that prior to disclosure or use of any Confidential Information pursuant to paragraph (c) above (except in the case of disclosure to a Government Authority), the receiving Party shall give reasonable prior written notice to the disclosing Party (including a copy of any relevant written request which may exist) and the information is disclosed in a manner that is designed to preserve its confidential nature to the extent permitted by Law. If on the receipt of such a notice a Party wishes to take action to oppose or limit such potential disclosure or seek a protective order in respect of the information required to be disclosed, it may do so at its own cost and the receiving Party shall provide it with any reasonable assistance required.",
      },
      { id: "conf_period", title: "Duration", text: "**Duration.** The provisions of {{clause:conf}} to {{clause:conf_permitted}} shall continue to apply for two (2) years after termination of this Agreement." },
      { id: "waiver", title: "Waiver", text: "**Waiver.** No failure of any Party to exercise, and no delay or forbearance in exercising, any right or remedy in respect of any provision of this Agreement shall operate as a waiver of such right or remedy, nor shall any single or partial exercise of the same preclude any further exercise thereof or the exercise of any other right, power or remedy." },
      {
        id: "assignment",
        title: "Assignment",
        text: "**Assignment.** The Buyer may assign or transfer any or all of its rights and delegate any or all of its obligations under this Agreement to any of its Affiliates without the consent of the Sellers. No other Party may assign or transfer any of its rights or delegate any of its obligations under this Agreement without the express prior written consent of the Buyer. Any purported transfer in contravention of this {{clause:assignment}} shall be null and void ab initio. This Agreement shall be binding on and enure to the benefit of the Parties and their successors and permitted assigns.",
      },
      { id: "counterparts", title: "Counterparts", text: "**Counterparts.** This Agreement may be executed in one or more counterparts, each of which shall be deemed an original but all of which together shall constitute one and the same instrument. Each counterpart may be signed and executed by the Parties and transmitted by e-mail and shall be as valid and effectual as if executed as an original." },
      { id: "entire", title: "Entire Agreement and Amendment", text: "**Entire Agreement and Amendment.** This Agreement (together with any documents referred to herein or executed contemporaneously by the Parties in connection herewith) constitutes the whole agreement between the Parties and supersedes any previous agreements or arrangements between them relating to the subject matter of this Agreement and it is expressly declared that no variations of this Agreement shall be effective unless made in writing and executed by the Parties." },
      { id: "continuity", title: "Continuity of Obligations", text: "**Continuity of Obligations.** All the provisions of this Agreement shall remain in full force and effect notwithstanding Closing (except insofar as they set out obligations which have been fully performed at Closing)." },
      { id: "severability", title: "Severability", text: "**Severability.** If any provision of this Agreement shall be held invalid or unenforceable to any extent, the remainder of this Agreement shall not be affected thereby and shall be enforced to the greatest extent permitted by Law." },
      { id: "remedies", title: "Other Rights and Remedies", text: "**Other Rights and Remedies.** Any right of rescission or termination of this Agreement conferred upon any Party hereby shall be in addition to and without prejudice to all other rights and remedies available to it (and, without prejudice to the generality of the foregoing, shall not extinguish any right to damages to which the relevant Party may be entitled in respect of the breach of this Agreement) and no exercise or failure to exercise such a right of rescission shall constitute a waiver by that Party of any such other right or remedy." },
      { id: "further_assurance", title: "Further Assurance", text: "**Further Assurance.** Each Party undertakes to the other Parties that it shall do all such acts and things and execute all such deeds and documents as may be necessary or desirable to carry into effect or to give legal effect to the provisions of this Agreement and the transactions contemplated herein." },
      { id: "third_parties", title: "No Third Party Rights", text: "**No Third Party Rights.** A Person who is not a Party shall not have any rights under the Contracts (Rights of Third Parties) Act 2001 of Singapore to enforce any term of this Agreement. The rights of the Parties to terminate, rescind or agree any variation, waiver or settlement under this Agreement are not subject to the consent of any Person who is not a Party." },
      { id: "governing_law", title: "Governing Law", text: "**Governing Law.** This Agreement and the documents to be entered into pursuant to it, save as expressly referred to therein, shall be governed by and construed in accordance with the laws of Singapore." },
      { id: "disputes", title: "Disputes", question: "P21", text: "{{disputes_text}}" },
    ],
  },
];

export const EXECUTED = "IN WITNESS WHEREOF this Agreement has been signed by the duly authorised representatives of the Parties the day and year first before written.";

/* ── Schedule 3, Parts A and C ───────────────────────────────────────── */

export interface ScheduleItem {
  id?: string;
  text: string;
  subs?: string[];
  fd?: boolean;
}
export interface ScheduleGroup {
  heading: string;
  items: ScheduleItem[];
}

export const PART_A: ScheduleGroup[] = [
  {
    heading: "Authority",
    items: [
      { id: "pa_individual", text: "Each Seller who is an individual (a) is of sound mind, (b) is over the age of 18, (c) is not suffering from a mental disability, (d) is not bankrupt in any jurisdiction, and (e) has no knowledge of any bankruptcy petition which has been presented or proposed to be presented against such Seller, or of any event having occurred which would justify such proceedings." },
      { id: "pa_company", fd: true, text: "Each Seller which is a company is duly incorporated and validly existing under the laws of its jurisdiction of incorporation, and is not insolvent or the subject of any winding up, judicial management, receivership or similar proceedings." },
      { text: "Each Seller has the legal right and full power and authority to enter into and perform this Agreement and any other documents to be executed by it pursuant to or in connection with this Agreement, which when executed will constitute valid and binding obligations on it, in accordance with their respective terms." },
      { text: "Each Seller has obtained all requisite consents, authorisations and approvals (or, as the case may be, the relevant waiver(s)), completed all other necessary registrations and filings (if applicable), and executed all other documents in connection with the entering into and performance of the terms of this Agreement and the transactions contemplated hereunder." },
    ],
  },
  {
    heading: "No Breach",
    items: [
      {
        text: "The execution and delivery of, and the performance by each Seller of its obligations under, this Agreement and any other documents to be executed by it pursuant to or in connection with this Agreement will not and are not likely to:",
        subs: [
          "result in a breach of the constitution or any other constitutional documents of the Target Company (or, in the case of a Seller which is a company, of that Seller);",
          "result in a breach of, require any consent under or give any third party a right to terminate, accelerate or modify, or result in the creation or enforcement of any Encumbrance under any agreement, licence or other instrument to which that Seller is a party; or",
          "result in a breach of any law or regulation or any judgment, order, decree or directive of any court, Government Authority or regulatory body to which that Seller is a party or by which that Seller is bound.",
        ],
      },
    ],
  },
  {
    heading: "Share Capital and Ownership of Sale Shares",
    items: [
      { text: "Immediately prior to Closing, each Seller shall be the sole legal and beneficial owner of the Sale Shares set opposite its name in Schedule 2." },
      { id: "pa_entire", text: "The Sale Shares represent the entire issued share capital of the Target Company and are shares credited as fully paid, properly and validly allotted and issued, and free of Encumbrances and with the right to receive all dividends and distributions which may be declared, made and paid." },
      { id: "pa_part", text: "The Sale Shares are shares credited as fully paid, properly and validly allotted and issued, and free of Encumbrances and with the right to receive all dividends and distributions which may be declared, made and paid." },
      { text: "There are no agreements or commitments outstanding which call for the issue of any shares, loan stock or debentures in or other securities of the Target Company or accord to any person the right to call for the issue of any such shares, loan stock or debentures or other securities." },
    ],
  },
  {
    heading: "Accuracy",
    items: [{ text: "The information set out in Schedules 1 and 2 is complete and accurate in all respects." }],
  },
];

export const PART_C: ScheduleGroup[] = [
  {
    heading: "Authority",
    items: [
      { id: "pc_company", text: "The Buyer is a company duly incorporated under the laws of its jurisdiction of incorporation." },
      { id: "pc_individual", fd: true, text: "The Buyer is of sound mind, is over the age of 18 and is not bankrupt in any jurisdiction." },
      { text: "The Buyer has the legal right and full power and authority to enter into and perform this Agreement and any other documents to be executed by the Buyer pursuant to or in connection with this Agreement, which when executed will constitute valid and binding obligations on the Buyer, in accordance with their respective terms." },
      { id: "pc_corporate", text: "The Buyer has taken all necessary corporate actions to authorise the entry into and performance of this Agreement and any other documents to be executed by the Buyer pursuant to or in connection with this Agreement, and such actions remain in full force and effect. The representatives of the Buyer who have signed this Agreement and any other documents to be executed by the Buyer pursuant to or in connection with this Agreement have the full power or authority to do so on behalf of the Buyer." },
      { text: "All approvals, registrations and filings with the Government Authorities necessary for the Buyer to enter into this Agreement and any other documents to be executed by the Buyer pursuant to or in connection with this Agreement and to perform its obligations thereunder have been obtained or will be obtained by Closing." },
    ],
  },
  {
    heading: "No Breach",
    items: [
      {
        text: "The execution and delivery of, and the performance by the Buyer of its obligations under, this Agreement and any other documents to be executed by the Buyer pursuant to or in connection with this Agreement will not and are not likely to:",
        subs: [
          "result in a breach of the constitution or any other constitutional documents of the Buyer;",
          "result in a breach of, require any consent under or give any third party a right to terminate, accelerate or modify, or result in the creation or enforcement of any Encumbrance under any agreement, licence or other instrument to which the Buyer is a party; or",
          "result in a breach of any law or regulation or any judgment, order, decree or directive of any court, Government Authority or regulatory body to which the Buyer is a party or by which the Buyer is bound.",
        ],
      },
    ],
  },
];

/* ── for the admin page ──────────────────────────────────────────────── */

/** Precedent terms that belonged to that deal and are not in FD AI's SPA. */
export const REMOVED: string[] = [
  "Price paid 70% in units of the buyer's fund, with a unit-adjustment mechanism, and the Investment Agreement behind it",
  "Integration of the target into the buyer's group: data migration, brand change, consolidated audit",
  "Conditions and deliverables naming individual staff (an employment contract, a sub-contract, a termination)",
  "The seller's working-capital top-up (three months' working capital) and its repayment from receivables",
  "Red-flag due diligence report confirmation",
  "Exchange-rate clause (US$ to S$)",
  "Beneficial ownership and control passing at a fixed cut-off date before Closing",
  "Termination of the investment agreement as a remedy for breach of the non-compete",
  "Schedule 5 (list of bank accounts) — the bank deliverable now covers all accounts",
];

/** Where a precedent clause was reworded to stand on its own. */
export const ADAPTATIONS: { where: string; change: string }[] = [
  { where: "Throughout", change: "One seller → one or more sellers (\"each Seller\"); \"her\" → \"its\". With one seller the agreement reads in the singular." },
  { where: "Non-compete (Clause 8.1 of the precedent)", change: "Ran for 3 years after a separate investment agreement ended; now runs for 1–3 years after Closing (default 2), and protects the Target Company rather than the buyer's group." },
  { where: "Stamp duty", change: "Precedent split it equally; default is now the buyer (the Singapore default), with equal and seller options." },
  { where: "\"Accounts\"", change: "Latest audited accounts → audited, or unaudited where the company is exempt from audit (most small Singapore companies)." },
  { where: "\"Relevant Management Accounts Date\"", change: "Was [●], to be fixed by the buyer; now the last day of the month before signing, or another date the buyer agrees." },
  { where: "Price adjustment (Schedule 2 para 3)", change: "Units deducted/added at a cut-off date → the price reduced by debt and increased by cash, from Closing Accounts prepared within 30 Business Days." },
  { where: "Deferred payment (Schedule 2 para 2)", change: "15% at 30 days and 15% at 180 days → a chosen % at Closing and the balance 3, 6 or 12 months after Closing." },
  { where: "Key Personnel", change: "Was a named list; now the people listed in Schedule 4 if any, otherwise the directors and senior managers." },
  { where: "Part A 3.2 (Sale Shares)", change: "For a sale of part of the company, the \"entire issued share capital\" wording is replaced." },
];

/** Slips in the precedent, fixed here. */
export const CORRECTIONS: { where: string; was: string; now: string }[] = [
  { where: "Assignment (11.5)", was: "the Buyer may assign … without the consent of the Buyer", now: "without the consent of the Sellers" },
  { where: "Recital (B) / definition of Acquisition", was: "\"Acquisition\" has the meaning ascribed to it under Recital (D)", now: "Recital (C), where it is defined" },
  { where: "Part A 3.3", was: "local stock", now: "loan stock" },
  { where: "Material Adverse Change", was: "a material adverse change on the future business", now: "a material adverse effect on the business" },
  { where: "Conditions (3.1(e))", was: "Red Flag Legal Due Diligence Report (defined as \"Red Flag Due Diligence Report\")", now: "removed with the report (deal-specific)" },
  { where: "Closing deliverables (4.2(n))", was: "the rectified terms and conditions of the Company with the correct party name", now: "removed (deal-specific; \"the Company\" was undefined)" },
  { where: "Part A 2(a)", was: "articles of association", now: "constitution (the Companies Act 1967 term since 2016)" },
  { where: "Clause 6.1(f)(vi) and (vii)", was: "shareholder's resolution / its shareholder", now: "shareholders' resolution / its shareholders" },
];
