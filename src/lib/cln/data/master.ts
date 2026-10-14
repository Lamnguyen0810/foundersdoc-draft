/**
 * Convertible Loan Agreement — the wording FD AI assembles from.
 *
 * SOURCE. The Founders Doc master: "Convertible Loan Agreement — Master
 * Template". A company borrows from one investor; the loan converts into
 * ordinary shares on the earliest of the Maturity Date, a Qualified Equity
 * Financing Event or a Liquidity Event, at the investor's election, at a
 * price set by a valuation cap (pre- or post-money) or, in a qualifying
 * round, the lower of the cap price and the round price less any discount.
 * Interest accrues and is paid at maturity; an Exercise Notice (Schedule 1)
 * and the conversion calculation (Schedule 2) are attached.
 *
 * The master is written for any jurisdiction: its Schedule 3 (Jurisdiction
 * Rider) gives, for Singapore, England and Wales, Hong Kong and the United
 * States, the data protection law, the third-party rights statute and the
 * dispute resolution option. The answers pick a row and the assembler fills
 * it in (JURISDICTIONS below). The Rider is guidance for the preparer — "it
 * does not form part of the Agreement and must be deleted before signing" —
 * so it is not printed; its "points to check locally" become points for the
 * lawyer. The master's drafting notes are likewise not printed: each choice
 * they describe is a question, and each caution a point for the lawyer.
 *
 * Markup, as the other masters: {{field}}, {{clause:id}}, {{section:id}},
 * **bold**. Where a point has versions, each is kept and keyed (`when`);
 * the assembler picks by the answers. `fd: true` marks wording not in the
 * master, written in its style (an interest-free loan, automatic conversion
 * in a qualifying round — the latter is the master's own drafting note).
 * CORRECTIONS lists the master's slips that are fixed here.
 */

export const MASTER_VERSION = "CL-V1";
export const MASTER_LOADED = true;

export interface MasterSub {
  ref: string | null;
  text: string;
  subs?: MasterSub[];
  id?: string;
  when?: string;
  fd?: boolean;
}

export interface MasterClause {
  id: string;
  when?: string;
  text: string;
  subs?: MasterSub[];
  tail?: string;
  fd?: boolean;
}

export interface MasterSection {
  id: string;
  heading: string;
  when?: string;
  clauses: MasterClause[];
}

/* ── the jurisdiction rider (Schedule 3 of the master) ────────────────── */

export interface Jurisdiction {
  /** As it follows "the laws of". */
  law: string;
  /** "Applicable Data Protection Law" … "being {{dp_law}}". */
  dpLaw: string;
  /** Third Party Rights: "has no right under {{tp_statute}} or otherwise"; "" when there is no statute. */
  tpStatute: string;
  /** Business Days and local time. */
  city: string;
  /** Arbitration: seat, rules and institution. */
  seat: string;
  rules: string;
  institution: string;
  /** The courts, when the parties choose courts over arbitration. */
  courts: string;
  /** "within the meaning of {{securities_law}}". */
  securitiesLaw: string;
  /** Liquidity Event (d): the stock exchange named. */
  exchange: string;
  /** The Rider's "points to check locally". */
  checkLocally: string;
}

export const JURISDICTIONS: Record<string, Jurisdiction> = {
  sg: {
    law: "Singapore",
    dpLaw: "the Personal Data Protection Act 2012 of Singapore",
    tpStatute: "the Contracts (Rights of Third Parties) Act 2001 of Singapore",
    city: "Singapore",
    seat: "Singapore",
    rules: "the Arbitration Rules of the Singapore International Arbitration Centre",
    institution: "the Singapore International Arbitration Centre",
    courts: "the courts of Singapore",
    securitiesLaw: "the Securities and Futures Act 2001 of Singapore",
    exchange: "the Singapore Exchange Securities Trading Limited",
    checkLocally: "the prospectus exemptions under the Securities and Futures Act 2001, e-signature under the Electronic Transactions Act 2010, and the Constitution and pre-emption rights",
  },
  ew: {
    law: "England and Wales",
    dpLaw: "the UK GDPR and the Data Protection Act 2018",
    tpStatute: "the Contracts (Rights of Third Parties) Act 1999",
    city: "London, United Kingdom",
    seat: "London",
    rules: "the LCIA Arbitration Rules",
    institution: "the London Court of International Arbitration",
    courts: "the courts of England and Wales",
    securitiesLaw: "the Financial Services and Markets Act 2000 and the Financial Services and Markets Act 2000 (Financial Promotion) Order 2005",
    exchange: "the London Stock Exchange",
    checkLocally: "the financial promotion restrictions, execution as a deed where needed, and the directors' authority to allot shares and pre-emption rights",
  },
  hk: {
    law: "Hong Kong",
    dpLaw: "the Personal Data (Privacy) Ordinance (Cap. 486) of Hong Kong",
    tpStatute: "the Contracts (Rights of Third Parties) Ordinance (Cap. 623) of Hong Kong",
    city: "Hong Kong",
    seat: "Hong Kong",
    rules: "the HKIAC Administered Arbitration Rules",
    institution: "the Hong Kong International Arbitration Centre",
    courts: "the courts of Hong Kong",
    securitiesLaw: "the Securities and Futures Ordinance (Cap. 571) of Hong Kong",
    exchange: "The Stock Exchange of Hong Kong Limited",
    checkLocally: "professional investor status under the Securities and Futures Ordinance (Cap. 571), the prospectus rules, and stamp duty",
  },
  ny: {
    law: "the State of New York",
    dpLaw: "the applicable federal and state privacy laws of the United States",
    tpStatute: "",
    city: "New York, United States",
    seat: "New York, New York",
    rules: "the International Arbitration Rules of the International Centre for Dispute Resolution",
    institution: "the International Centre for Dispute Resolution",
    courts: "the state and federal courts located in the Borough of Manhattan, New York",
    securitiesLaw: "the United States Securities Act of 1933, as amended, and Regulation D under it",
    exchange: "the New York Stock Exchange or the Nasdaq Stock Market",
    checkLocally: "the Securities Act exemption relied on (e.g. Regulation D, accredited investors), state usury limits on the interest rate, and the charter's authorisation of the shares",
  },
  de: {
    law: "the State of Delaware",
    dpLaw: "the applicable federal and state privacy laws of the United States",
    tpStatute: "",
    city: "Wilmington, Delaware, United States",
    seat: "Wilmington, Delaware",
    rules: "the International Arbitration Rules of the International Centre for Dispute Resolution",
    institution: "the International Centre for Dispute Resolution",
    courts: "the state and federal courts located in the State of Delaware",
    securitiesLaw: "the United States Securities Act of 1933, as amended, and Regulation D under it",
    exchange: "the New York Stock Exchange or the Nasdaq Stock Market",
    checkLocally: "the Securities Act exemption relied on (e.g. Regulation D, accredited investors), state usury limits on the interest rate, and the Delaware charter's authorisation of the shares",
  },
};

/** "Other": the Rider's last row. Its entries are left as [●] for a lawyer. */
export const OTHER_JURISDICTION: Omit<Jurisdiction, "law"> = {
  dpLaw: "",
  tpStatute: "",
  city: "",
  seat: "",
  rules: "the Arbitration Rules of the International Chamber of Commerce",
  institution: "the International Chamber of Commerce",
  courts: "",
  securitiesLaw: "",
  exchange: "",
  checkLocally: "exchange controls on foreign loans, withholding tax on interest, and foreign investment approvals for issuing shares",
};

/* ── the head ─────────────────────────────────────────────────────────── */

export const TITLE = "CONVERTIBLE LOAN AGREEMENT";
export const MADE_ON = "This Convertible Loan Agreement (the \"**Agreement**\") is made on {{date}}";
export const BETWEEN = "Between:";
export const PARTY_COMPANY = "{{name}} (Registration Number {{id_no}}), a {{company_type}} incorporated in {{jurisdiction}} with its registered address at {{address}}";
export const PARTY_INVESTOR_COMPANY = "{{name}} (Registration Number {{id_no}}), a {{company_type}} incorporated in {{jurisdiction}}, with its registered office at {{address}}";
export const PARTY_INVESTOR_INDIVIDUAL = "{{name}} (identity card / passport number {{id_no}}), of {{address}}";
export const PARTIES_COLLECTIVE = "(collectively, the \"**Parties**\" and each, a \"**Party**\").";
export const WHEREAS = "WHEREAS";
export const RECITALS = [
  "The Investor has agreed to advance to the Company a principal amount of {{principal}} in the Agreed Currency (the \"**Principal Amount**\") on the terms and subject to the conditions set out in this Agreement.",
  "In accordance with the terms set out in this Agreement, the Principal Amount may be converted into Conversion Shares upon the occurrence of a Conversion Event.",
];
export const AGREED = "It is hereby agreed as follows:";

/* ── the definitions ──────────────────────────────────────────────────── */

export interface Definition {
  term: string;
  text: string;
  subs?: string[];
  when?: string;
}

export const DEFINITIONS: Definition[] = [
  { term: "Agreed Currency", text: "means {{cur_name}}, being the lawful currency of {{cur_country}};" },
  { term: "Applicable Data Protection Law", text: "means the data protection and privacy laws applicable to either Party in connection with this Agreement, being {{dp_law}};" },
  { term: "Board", text: "means the board of directors of the Company;" },
  { term: "Business Day", text: "means a day (other than a Saturday, a Sunday, or a gazetted public holiday) on which banks and the Company are open for business generally in {{city}};" },
  { term: "Company Bank Account", text: "refers to the bank account of the Company, as nominated by the Company in writing from time to time;" },
  { term: "Constitutional Documents", text: "means the constitution, memorandum and articles of association, certificate of incorporation, by-laws or equivalent constitutional documents of the Company, as amended from time to time;" },
  { term: "Conversion", text: "means the conversion and application of the amount in the Agreed Currency equivalent to the aggregate principal amount of the Loan (including accrued interest) towards the subscription for Conversion Shares in accordance with the provisions set out in {{section:conversion}} (Conversion);" },
  { term: "Conversion Date", text: "means the date that the Conversion Event occurs;" },
  {
    term: "Conversion Event",
    text: "refers to the occurrence of any of the following events, whichever occurs earlier:",
    subs: ["the Maturity Date;", "the occurrence of a Qualified Equity Financing Event; or", "the occurrence of a Liquidity Event;"],
  },
  {
    term: "Conversion Price",
    text: "means:",
    subs: [
      "(if a Qualified Equity Financing Event does not occur) a conversion price calculated on the basis of a Company {{basis}} valuation of {{cap}} in the Agreed Currency (the \"**Valuation Cap**\"), in accordance with the calculations set out in Schedule 2 (Conversion Calculation) hereto; or",
      "(if a Qualified Equity Financing Event occurs) the lower of: (i) the conversion price calculated in accordance with paragraph (a) above; and (ii) the price per Share paid by the third-party investor(s) in the Qualified Equity Financing Event{{less_discount}}, in each case in accordance with Schedule 2 (Conversion Calculation);",
    ],
  },
  { term: "Conversion Shares", text: "means the Ordinary Shares issued to the Investor calculated at the Conversion Price in accordance with {{section:conversion}} (Conversion) and Schedule 2 (Conversion Calculation);" },
  { term: "Co-Founders", text: "refers to {{cofounders}}such persons identified by the Board as a co-founder from time to time;" },
  { term: "Drawdown Date", text: "means the date hereof or such other date as agreed in writing by the Parties;" },
  { term: "Exercise Notice", text: "means a notice in writing by the Investor to the Company to convert all of the outstanding Loan into Conversion Shares in the form substantially set out in Schedule 1 (Exercise Notice) hereto;" },
  { term: "Event of Default", text: "shall have the meaning given to it in {{clause:eod}} (Event of Default);" },
  { term: "Principal Amount", text: "has the meaning given to it in Recital (A);" },
  {
    term: "Liquidity Event",
    text: "means an occurrence of any of the following events:",
    subs: [
      "the Company or a shareholder (or shareholders) of the Company enters into a binding agreement with a third party (or a group of associated third parties) on arms' length terms under which the third party is to acquire (other than by way of a subscription for new shares) 50% or more of the voting shares of the Company, and that agreement becomes unconditional;",
      "the Company enters into a binding agreement to dispose of all or substantially all of the Company's assets, and that agreement becomes unconditional;",
      "the Company enters into a binding agreement to amalgamate with any other company (whether or not it is the continuing company), in a transaction that is in substance the same as those transactions described above, and that agreement becomes unconditional;",
      "the admission of all or any of the shares or the securities to {{exchange}}, or to such other internationally recognised stock exchange of similar or better standing; or",
      "any other event or series of events that together have the effect of allowing a realisation of substantially all the shares in, or substantially all of the assets of, the Company,",
    ],
  },
  { term: "Loan", text: "has the meaning given to it in {{clause:advance}} (Advance of Loan);" },
  { term: "Maturity Date", text: "means the date falling {{maturity_words}} from the Drawdown Date;" },
  { term: "Ordinary Shares", text: "means ordinary shares in the share capital of the Company;" },
  { term: "Qualified Equity Financing Event", text: "means the issuance of Shares to one or more third parties prior to the Maturity Date, in a single transaction or a series of related transactions, {{qfe_test}} Provided That the issuance of Shares: (a) to Co-Founder(s); and (b) to persons pursuant to an option share plan which shall not exceed {{esop_words}} of the total issued share capital of the Company from time to time, shall not constitute a \"Qualified Equity Financing Event\";" },
  { term: "Shares", text: "means shares in the capital of the Company, and which for the avoidance of doubt, shall include ordinary shares in the capital of the Company." },
];

/** Follows the Liquidity Event definition's list. */
export const LIQUIDITY_PROVISO =
  "Provided That, a transaction shall not constitute a Liquidity Event if its sole purpose is to change the place of the Company's incorporation or to create a holding company that will be owned in the same proportions by the persons who held the shares immediately prior to such transaction;";

export const INTERPRETATION: string[] = [
  "The headings in the Agreement are for convenience only and shall not affect the construction or interpretation of this Agreement.",
  "References to \"Agreement\" and \"this Agreement\" are references to this convertible loan agreement (including its Schedules), as amended in writing from time to time.",
  "References to \"persons\" include any individual, company, corporation, firm, partnership, joint venture, association, state, state agency, institution, or trust (whether or not having a separate legal personality).",
  "Words importing the singular include the plural and vice versa, words importing any gender include any gender, words importing persons include bodies corporate and unincorporated, and references to time shall mean local time in {{city}}.",
];

/* ── the clauses ──────────────────────────────────────────────────────── */

export const SECTIONS: MasterSection[] = [
  {
    id: "interpretation",
    heading: "INTERPRETATION",
    clauses: [
      { id: "definitions", text: "**Definitions.** In this Agreement, unless the subject or context otherwise requires, the following words and expressions shall have the following meanings:" },
      { id: "interpretation", text: "**Interpretation.**" },
    ],
  },
  {
    id: "loan",
    heading: "THE LOAN",
    clauses: [
      { id: "advance", text: "**Advance of Loan.** Subject to the terms set out in this Agreement, the Investor hereby agrees to advance to the Company, the Principal Amount comprising a principal amount of {{principal}} ({{principal_words}}) in the Agreed Currency which shall be convertible at the option of the Investor pursuant to {{section:conversion}} (Conversion) (the \"**Loan**\")." },
      { id: "drawdown", text: "**Drawdown Date.** The Investor shall pay the full amount of the Principal Amount to the Company on the Drawdown Date in cleared funds into the Company Bank Account. The Investor shall make the Principal Amount available to the Company in a single advance on the terms set out in this Agreement." },
      { id: "purpose", when: "purpose", text: "**Purpose.** The Company shall apply the Loan towards {{purpose}}." },
      { id: "payments", text: "**Payments.** All payments made under this Agreement shall be in the Agreed Currency. All payments shall be applied first to accrued interest, and thereafter to the Principal Amount. Whenever any payment becomes due on a day which is not a Business Day, payment shall be made on the next following Business Day." },
    ],
  },
  {
    id: "interest",
    heading: "INTEREST",
    clauses: [
      {
        id: "interest",
        when: "interest",
        text: "**Interest.** Interest shall accrue on the principal outstanding amount of the Loan at an interest rate of {{rate_words}} per annum{{compounded}} from the Drawdown Date until the earlier of the date of:",
        subs: [
          { ref: "(a)", text: "the full repayment of the Loan; or" },
          { ref: "(b)", text: "the Conversion of the Loan in accordance with the terms of this Agreement." },
        ],
      },
      { id: "coupon", when: "interest", text: "**Coupon Distribution.** Subject to {{clause:effect}} (Effect of Conversion) and {{clause:early}} (Voluntary Early Repayment), the interest accrued in accordance with {{clause:interest}} (Interest) shall only be payable by the Company to the Investor on the Maturity Date. For the avoidance of doubt, the interest accrued on the Loan shall not be payable on an annual basis until the Maturity Date." },
      { id: "calculation", when: "interest", text: "**Calculation of Interest.** All interest accruing on the Loan shall be computed on the basis of a year of 365 days and for the actual number of days elapsed." },
      { id: "interest", when: "interest_free", fd: true, text: "**No Interest.** The Loan is interest-free. No interest shall accrue on the Principal Amount, and references in this Agreement to interest accrued on the Loan shall be read accordingly." },
    ],
  },
  {
    id: "repayment",
    heading: "REPAYMENT OF LOAN",
    clauses: [
      { id: "maturity", text: "**Repayment on Maturity Date.** Save to the extent that there has been a Conversion and subject to the voluntary repayment provisions set out in {{clause:early}} (Voluntary Early Repayment), the Company shall repay the Loan, being the Principal Amount{{and_interest_on_maturity}}, on the Maturity Date." },
      { id: "no_setoff", text: "**No Set-Off or Counterclaim.** All payments by the Company to the Investor hereunder shall be made, without set-off or counterclaim, in the Agreed Currency to such account as the Investor may from time to time notify the Company, at least five (5) Business Days prior to the date such payment is due." },
      { id: "effect", text: "**Effect of Conversion.** In the event that Conversion occurs in accordance with this Agreement, the obligation of the Company to repay the Loan and all outstanding interest accrued on the Loan shall be deemed discharged in full, and the right of the Investor to the repayment of the Loan and all outstanding interest accrued on the Loan shall be extinguished in full." },
      {
        id: "eod",
        text: "**Event of Default.** If there shall be any Event of Default hereunder, at the option of the Investor, the Loan shall accelerate and all principal and unpaid accrued interest shall become immediately due and payable. For the purposes of this provision, \"Event of Default\" shall refer to any of the following events:",
        subs: [
          { ref: "(a)", text: "if the Company files any petition or action for relief under any reorganisation, insolvency or moratorium law or any other law for the relief of, or relating to debtors, or makes any assignment for the benefit of creditors or takes any corporate action in furtherance of any of the foregoing;" },
          { ref: "(b)", text: "if the Company is adjudicated insolvent or enters into a scheme of arrangement or composition with or assignment for the benefit of all or any class of creditors or a petition is presented for the winding up, insolvency, dissolution, appointment of a receiver, an administrator, a judicial manager, liquidator or provisional liquidator, receiver or receiver and manager, trustee or similar officer over the whole or any part of the Company's assets or any analogous event occurs or proceeding is taken in any jurisdiction;" },
          { ref: "(c)", when: "pay_default", text: "if the Company fails to pay any amount due under this Agreement within {{pay_days}} Business Days of its due date; or" },
          { ref: "(d)", text: "if it becomes unlawful for the Company to perform any of its obligations set out herein." },
        ],
      },
    ],
  },
  {
    id: "early",
    heading: "VOLUNTARY EARLY REPAYMENT",
    clauses: [
      {
        id: "early",
        text: "**Voluntary Early Repayment.** Provided that the mutual agreement by the Parties is obtained, the Company may repay the whole or any part of the Loan without premium or penalty provided that:",
        subs: [
          { ref: "(a)", text: "five (5) Business Days' prior written notice shall have been given by the Company to the Investor;" },
          { ref: "(b)", when: "multiple", text: "in the event of a partial repayment, the amount of Loan repaid shall be an integral multiple of {{multiple}} in the Agreed Currency; and" },
          { ref: "(c)", text: "any amounts repaid by the Company may not be redrawn." },
        ],
      },
    ],
  },
  {
    id: "conversion",
    heading: "CONVERSION",
    clauses: [
      {
        id: "conv_event",
        text: "**Conversion Event.** Subject to the proviso that the Loan has not been fully repaid in accordance with {{section:repayment}} (Repayment of Loan), upon the occurrence of a Conversion Event:",
        subs: [
          { ref: "(a)", text: "the Company shall serve a written notice to the Investor no later than five (5) Business Days from the Conversion Date; and" },
          { ref: "(b)", text: "the Investor may, at its election, exercise its right of conversion in accordance with this {{section:conversion}} in the form substantially set out in Schedule 1 (Exercise Notice) hereto." },
        ],
      },
      {
        id: "auto",
        when: "auto",
        fd: true,
        text: "**Automatic Conversion on a Qualified Equity Financing Event.** Notwithstanding {{clause:conv_event}} (Conversion Event), upon the occurrence of a Qualified Equity Financing Event the outstanding Loan (including interest accrued therein) shall convert automatically into Conversion Shares on the Conversion Date, without the need for an Exercise Notice, and {{clause:terms}} (Terms of Conversion) shall apply as if an Exercise Notice had been served on the Conversion Date.",
      },
      {
        id: "terms",
        text: "**Terms of Conversion.** Upon the receipt of the Exercise Notice, the Company shall convert the outstanding Loan (including interest accrued therein) into Conversion Shares and apply the outstanding Loan towards the aggregate issue price for the Conversion Shares and shall be entitled to credit the Conversion Shares as fully paid up subject to the following terms and conditions:",
        subs: [
          { ref: "(a)", text: "the Investor shall serve the Exercise Notice on the Company within {{exercise_words}} Business Days from the date of receipt of the Company's notice under {{clause:conv_event}}(a);" },
          { ref: "(b)", text: "the service of the Exercise Notice shall be irrevocable; and" },
          { ref: "(c)", text: "if no Exercise Notice is served within the period in paragraph (a), the Loan shall remain outstanding and be repaid in accordance with {{section:repayment}} (Repayment of Loan)." },
        ],
      },
      { id: "completion", text: "**Completion.** The Conversion Shares arising on Conversion shall be allotted and issued to the Investor no later than one (1) month after the Conversion Date and shall rank pari passu in all respects with the Ordinary Shares in issue on such Conversion Date save that the Conversion Shares shall not rank for dividends or other distributions declared made or paid on the Ordinary Shares arising prior to the Conversion Date." },
      { id: "certificates", text: "**Issuance of Share Certificates.** Within fourteen (14) days after the relevant allotment date, the Company shall enter the Investor in its register of members (or equivalent register) and, where share certificates are issued under the laws of its jurisdiction of incorporation, issue free of charge to the Investor a share certificate in respect of the Conversion Shares." },
      { id: "fractions", text: "**No Fractional Entitlement.** In the event that the number of Conversion Shares to be allotted and issued as computed pursuant to this {{section:conversion}} is not a whole number, such number shall be rounded down to the nearest whole number and no fractional shares shall be issued to the Investor." },
      {
        id: "documentation",
        text: "**Conversion Documentation.** In the event of a Conversion:",
        subs: [
          { ref: "(a)", text: "the Investor shall execute any agreements, resolutions and/or other documents (including any subscription agreement or shareholders' agreement) that are required to be executed by the Investor in order to complete the Conversion{{mfn}}; and" },
          { ref: "(b)", text: "any Conversion Shares issued are to be issued subject to the terms of the Constitutional Documents and any shareholders' agreement of the Company entered into by the Investor in force as at the date of issuance of the Conversion Shares." },
        ],
      },
      { id: "shareholder", text: "**Shareholder Rights.** Until the Exercise Notice is issued and delivered by the Investor to the Company in accordance with this Agreement, the Investor shall have no rights as a shareholder of the Conversion Shares." },
      { id: "adjustment", text: "**Adjustment Event.** Subject to the prior written approval of the Investor, if there is any bonus issue, consolidation or subdivision of any Shares or any reduction or cancellation of share capital (or any similar reorganisation of the capital of the Company), the Conversion Price may be adjusted by the Company, if necessary, to ensure that the economic effect of the Conversion remains the same." },
      { id: "approvals", text: "**Corporate Approvals.** The Company shall procure that all shareholder and Board approvals, waivers of pre-emption rights and other consents required under the Constitutional Documents and applicable law for the issue of the Conversion Shares are obtained on or before the Conversion Date." },
    ],
  },
  {
    id: "warranties",
    heading: "REPRESENTATIONS AND WARRANTIES",
    clauses: [
      {
        id: "reps_company",
        text: "**Company's Representations.** The Company represents and warrants to the Investor that, as at the date of this Agreement:",
        subs: [
          { ref: "(a)", text: "the Company is a corporation duly incorporated and validly existing under the laws of {{co_jurisdiction}};" },
          { ref: "(b)", text: "the Company has full corporate power to perform its obligations as contemplated by this Agreement and has procured any consent(s) required for the execution and performance of this Agreement;" },
          { ref: "(c)", text: "this Agreement constitutes an unconditional, valid, and legally binding obligation of the Company, enforceable against the Company in accordance with its terms; and" },
          { ref: "(d)", text: "to the Company's knowledge, there is no private or governmental action, suit, proceeding, claim, arbitration or investigation pending before any agency, court or tribunal, foreign or domestic, or threatened against the Company." },
        ],
      },
      {
        id: "reps_investor",
        text: "**Investor's Representations.** The Investor represents and warrants to the Company that, as at the date of this Agreement and at any time in the continuance of this Agreement:",
        subs: [
          { ref: "(a)", text: "the Investor is {{investor_capacity}}, and the Investor has full power to perform its obligations under this Agreement and has procured any consent(s) required for the execution and performance of this Agreement;" },
          { ref: "(b)", text: "this Agreement constitutes an unconditional, valid, and legally binding obligation of the Investor, enforceable against the Investor in accordance with its terms;" },
          { ref: "(c)", text: "the Investor is an investor in securities of companies in the developmental stage and acknowledges that the Investor can fend for itself, can bear the economic risk of the transactions contemplated under this Agreement, and has such knowledge and experience in financial or business matters such that the Investor is capable of evaluating the merits and risks of the investment contemplated under this Agreement;" },
          { ref: "(d)", text: "the Investor has obtained independent advice on the transactions contemplated under this Agreement, or it has waived its right to independent advice; and" },
          { ref: "(e)", when: "status", text: "the Investor is {{investor_status}} within the meaning of {{securities_law}} and is acquiring the Loan and any Conversion Shares for its own account and not with a view to resale or distribution." },
        ],
      },
      {
        id: "reps_further",
        text: "**Further Representations.** The Company further represents and warrants to the Investor that:",
        subs: [
          { ref: "(a)", text: "on the Conversion Date, the issuance of the Conversion Shares shall have been duly authorised and the Conversion Shares will be validly issued as fully paid-up Shares;" },
          { ref: "(b)", text: "on the Conversion Date, the Conversion Shares shall be issued unencumbered and free from any security interests, claims or liens and shall rank pari passu in all respects with all existing Ordinary Shares; and" },
          { ref: "(c)", text: "no dividends shall be declared by the Company for so long as the Loan remains unpaid, except with the prior written approval of the Investor." },
        ],
      },
      {
        id: "liability",
        text: "**Limitation of Liability.**",
        subs: [
          { ref: "(a)", text: "The Company shall have no obligation to the Investor in respect of any claim under this Agreement unless written notice of that claim is given to the Company within six (6) months of the Maturity Date." },
          { ref: "(b)", text: "The Company's aggregate liability to the Investor arising in connection with this Agreement shall be limited to the Principal Amount{{and_accrued_interest}}." },
          { ref: "(c)", text: "To the maximum extent permissible by the applicable laws, neither Party shall be liable to the other Party for any indirect, incidental, consequential or special damages suffered by the other Party, including without limitation damages for harm to business, lost revenues, lost savings or lost profits suffered by such Party, regardless of the form of action, whether in contract, warranty, strict liability or tort, including without limitation negligence of any kind whether active or passive and regardless of whether the Parties knew of the possibility that such damages could result. Each Party hereby releases the other Party (and their respective officers, directors, employees and agents) from any such claim." },
          { ref: "(d)", text: "Nothing in this Agreement limits or excludes any liability for fraud, or any other liability that cannot be limited or excluded under applicable law." },
        ],
      },
    ],
  },
  {
    id: "general",
    heading: "GENERAL",
    clauses: [
      { id: "personal_data", text: "**Personal Data.** For the purposes of this Clause, \"personal data\" shall have the meaning given to it in the Applicable Data Protection Law, including but not limited to name, sensitive personal information, address, references, bank details, salary, stock options, work records and any other personal information that may be collected in connection with the administration of the transactions contemplated under this Agreement." },
      { id: "processing", text: "**Processing and Disclosure of Personal Data.** The Investor acknowledges and agrees that the Company and their affiliates, by itself or through third parties, will process, disclose and if necessary, transfer personal data to third parties and that this personal data may be used for personnel, administration and management purposes in connection with the transactions contemplated under this Agreement and such other purposes reasonably necessary in connection with the business of the Company." },
      { id: "consent", text: "**Privacy Consent.** By signing this Agreement, the Investor expressly consents to the processing, disclosure and transfer of its personal data in connection with the transactions contemplated under this Agreement. The Investor has the right to know how the Investor's personal data is processed, disclosed or transferred. For any questions, please feel free to contact the Company's designated data protection officer at {{dpo_email}} with any queries, request or applications that the Investor may have about the Investor's personal data." },
      { id: "invalidity", text: "**Partial Invalidity.** If at any time, any provision of this Agreement is or becomes illegal, invalid or unenforceable in any respect under any law of any jurisdiction, neither the legality, validity or enforceability of the remaining provisions nor the legality, validity or enforceability of such provision under the law of any other jurisdiction will in any way be affected or impaired." },
      {
        id: "notices",
        text: "**Notices.** All notices and communications given under this Agreement must be in writing and in English, and will be delivered personally, sent by post, or sent by email, to the addresses or email addresses set out below, or to such other address or email address as a Party may notify to the other in writing. The primary mode of communication shall be via email.",
        subs: [
          { ref: null, text: "Company: Address: {{co_address}}; Email: {{co_email}}; Attention: {{co_attention}}" },
          { ref: null, text: "Investor: Address: {{inv_address}}; Email: {{inv_email}}; Attention: {{inv_attention}}" },
        ],
      },
      {
        id: "assignment",
        text: "**No Assignment.** Except with the prior written consent of the other Party, no Party may:",
        subs: [
          { ref: "(a)", text: "assign, transfer, charge or otherwise deal with any of its rights or obligations under this Agreement nor grant, declare, create or dispose of any right or interest in it; or" },
          { ref: "(b)", text: "sub-contract the performance of any of such Party's obligations under this Agreement." },
        ],
        tail: "The Investor may not grant any security or create any encumbrances over this Agreement.",
      },
      { id: "entire", text: "**Entire Agreement.** This Agreement contains all the terms, representations and warranties made between the Parties relating to the matters dealt with in this Agreement and supersedes and cancels all prior discussions and agreements covering the subject matter of this Agreement. The Parties have not relied on any representation, warranty or agreement relating to the subject matter of this Agreement that is not expressly set out in this Agreement, and no such representation, warranty or agreement has any effect from the date of this Agreement." },
      { id: "assurances", text: "**Further Assurances.** The Parties must each sign all further documents, pass all resolutions and do all further things as may be necessary or desirable to give effect to this Agreement." },
      { id: "amendments", text: "**Amendments or Extensions.** Any amendments or extensions to this Agreement must be made in writing with the unanimous agreement of all Parties. These extensions can add to or amend any provision in this Agreement when explicitly stated." },
      { id: "waiver", text: "**Waiver.** Subject to the terms set out in this Agreement, no exercise or failure to exercise or delay in exercising any right or remedy will constitute a waiver by that Party of that or any other right or remedy available to that Party." },
      { id: "costs", text: "**Costs.** Except as otherwise provided in this Agreement, the Parties will meet their own costs relating to the negotiation, preparation and implementation of this Agreement." },
      { id: "counterparts", text: "**Counterparts.** This Agreement may be signed in any number of counterparts, all of which taken together shall constitute one and the same instrument. Either Party may enter into this Agreement by signing any such counterpart and each counterpart shall be as valid and effectual as if executed as an original. To the extent permitted by the governing law, this Agreement may be signed by electronic signature and a signed counterpart may be delivered by email." },
      {
        id: "third_party",
        text: "**Third Party Rights.**",
        subs: [
          { ref: "(a)", text: "Unless expressly provided to the contrary in this Agreement, a person who is not a Party has no right {{tp_under}}to enforce or enjoy the benefit of any term of this Agreement." },
          { ref: "(b)", text: "Notwithstanding any term of this Agreement, the consent of any person who is not a Party is not required to rescind or vary this Agreement." },
        ],
      },
      {
        id: "law",
        when: "arbitration",
        text: "**Governing Law & Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "This Agreement shall be governed by, and construed in accordance with, the laws of {{law}}." },
          { ref: "(b)", text: "If any dispute, controversy, or claim arises out of or relating to this Agreement, or to the interpretation, breach, termination or validity of this Agreement, the Parties must use their best efforts to resolve such dispute through consultation or mediation. The consultation or mediation between the Parties must begin as soon as practicable after one disputing Party has delivered to the other disputing Party a written notice setting out the matter of the dispute." },
          { ref: "(c)", text: "If such dispute is not settled within thirty (30) days after the date of the relevant dispute notice referred to above, the dispute must be referred to and resolved by arbitration seated in {{seat}} in accordance with {{rules}} administered by {{institution}} for the time being in force (the \"**Rules**\"). The tribunal will consist of one arbitrator, appointed in accordance with the Rules. The language of the arbitration will be English." },
          { ref: "(d)", text: "Nothing in this Clause shall prevent a Party from seeking urgent interim or injunctive relief from any court of competent jurisdiction." },
        ],
      },
      {
        id: "law",
        when: "courts",
        text: "**Governing Law & Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "This Agreement shall be governed by, and construed in accordance with, the laws of {{law}}." },
          { ref: "(b)", text: "If any dispute, controversy, or claim arises out of or relating to this Agreement, or to the interpretation, breach, termination or validity of this Agreement, the Parties must use their best efforts to resolve such dispute through consultation or mediation. The consultation or mediation between the Parties must begin as soon as practicable after one disputing Party has delivered to the other disputing Party a written notice setting out the matter of the dispute." },
          { ref: "(c)", text: "If such dispute is not settled within thirty (30) days after the date of the relevant dispute notice referred to above, {{courts}} shall have exclusive jurisdiction to settle any dispute arising out of or in connection with this Agreement." },
          { ref: "(d)", text: "Nothing in this Clause shall prevent a Party from seeking urgent interim or injunctive relief from any court of competent jurisdiction." },
        ],
      },
    ],
  },
];

export const ACCEPTANCE =
  "By signing below, the Investor indicates acceptance of the terms of this Agreement as of the date given above. The signature also represents and warrants to the Company the Investor has fully read and understood this whole Agreement and that to the extent that any personal data is involved, the Investor expressly consents to the processing, disclosure, and transfer of personal data during and after the execution of this Agreement.";

/* ── Schedule 1: the Exercise Notice ──────────────────────────────────── */

export const EXERCISE_NOTICE: string[] = [
  "Date: [●]",
  "To: {{co_name}}",
  "Attn: Board of Directors",
  "From: {{inv_name}}",
  "Via Email",
  "Dear Sirs / Madams",
  "**EXERCISE NOTICE – CONVERSION**",
  "We refer to the convertible loan agreement dated {{date}} entered into between {{co_name}} as the company and {{inv_name}} as the investor (the \"**Agreement**\").",
  "Capitalised terms used but not defined in this Letter shall have the same meanings ascribed to it in the Agreement.",
  "Pursuant to {{section:conversion}} (Conversion) of the Agreement, the Investor hereby gives you notice that it wishes to convert the outstanding Loan, being the sum of [●] in the Agreed Currency (comprising the Principal Amount{{and_accrued_interest}}), into [●] Ordinary Shares at a Conversion Price of [●] per Share in the capital of the Company.",
  "Please allot and issue [●] Conversion Shares in favour of the Investor and deliver the share certificate(s) in respect of the Conversion Shares within the time period set out in the Agreement.",
  "After such Conversion, the outstanding amount of the Loan{{and_outstanding_interest}} shall be deemed discharged in full.",
  "Yours faithfully",
];

/* ── Schedule 2: the conversion calculation ───────────────────────────── */

export const CALCULATION = {
  shares: "**Number of Conversion Shares.** The number of Conversion Shares to be issued to the Investor shall be calculated as follows:",
  sharesFormula: "Conversion Shares = Conversion Amount ÷ Conversion Price",
  sharesWhere: "where \"Conversion Amount\" means the outstanding Principal Amount{{together_with_interest}} up to (and including) the Conversion Date.",
  price: "**Conversion Price.** The Conversion Price shall be calculated as follows:",
  priceA: "if no Qualified Equity Financing Event occurs: Valuation Cap ÷ Fully Diluted Share Capital; or",
  priceB: "if a Qualified Equity Financing Event occurs: the lower of (i) the price in paragraph (a) above; and (ii) the price per Share paid by the third-party investor(s) in that Qualified Equity Financing Event{{times_discount}},",
  priceWhere: "where \"Fully Diluted Share Capital\" means the total number of Ordinary Shares in issue immediately before the Conversion Date, {{diluted}} all Shares issuable under outstanding options, warrants and any option share plan, and excluding the Conversion Shares.",
  example: "**Worked example.** To be completed for each transaction and agreed by the Parties.",
};

/** The master's slips, fixed here (listed for the admin). */
export const CORRECTIONS: string[] = [
  "The master's cross-references that had lost their clause numbers (\"in accordance with the provisions set out in ;\", \"pursuant to (the \"Loan\")\", \"Subject to and ,\") point to the right clause again.",
  "\"over the whole or any part of any Company's assets\" reads \"the Company's assets\"; \"in the continuance of Agreement\" reads \"of this Agreement\".",
  "The Liquidity Event list ends with a comma before its proviso, which now follows the list as the master intends.",
  "The signature blocks' \"By: [COMPANY NAME]\" line is the signatory's name and title, as in the other FD masters.",
  "Schedule 3 (Jurisdiction Rider) and the drafting notes are guidance for the preparer and are not printed: each choice is a question, each caution a point for the lawyer.",
];
