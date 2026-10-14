/**
 * Loan Agreement — the wording FD AI assembles from.
 *
 * SOURCE. The Founders Doc master: "Master Loan Agreement Template —
 * Universal", as updated by Rachel Wong. An individual Borrower; individual
 * Lenders, jointly and severally, through a Lenders' Authorised
 * Representative; tiered simple interest; repayment within thirty days of a
 * request served on or after the Maturity Date or on a Change of Control;
 * three Events of Default with a ninety-day cure period; the Company's
 * representations; the Lenders not carrying on moneylending; quarterly
 * reporting; confidentiality, a two-year claims period and a cap of twice
 * the Principal Amount; consultation or mediation, then arbitration.
 *
 * PERMUTATIONS, from four loan agreements shared for reference only (names
 * redacted, never embedded): a short-form facility agreement (B), a term
 * loan with conditions precedent and a share pledge (C), and a bank loan
 * and security agreement with an amendment to another (D, E). They supply
 * the other versions of a clause — one Lender, a company Borrower, a stated
 * purpose, a fixed repayment date, interest a year, default interest above
 * the rate, conditions precedent, stricter Events of Default, security —
 * and are kept to the master's style and defined terms.
 *
 * Where a point has versions, each is kept and keyed (`when`); the
 * assembler picks by the answers. `fd: true` marks wording in none of the
 * five documents, written in the master's style. ADAPTATIONS lists what was
 * generalised; CORRECTIONS the master's slips that are fixed here.
 *
 * Markup, as the other masters: {{field}}, {{clause:id}}, {{section:id}},
 * **bold**. The Lender wording follows the number of Lenders:
 * {{the_lenders}} is "the Lenders" or "the Lender", {{lar}} "the Lenders'
 * Authorised Representative" or "the Lender"; a capital first letter
 * ({{The_lenders}}, {{Lar}}) starts a sentence. {{co}} is "the Company", or
 * "the Borrower" when the Borrower is the company.
 */

export const MASTER_VERSION = "LN-V1";
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
  /** Keyed condition (see assemble.ts → keep()); absent means always. */
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
  fd?: boolean;
}

/* ── the head ─────────────────────────────────────────────────────────── */

export const TITLE = "LOAN AGREEMENT";
export const MADE_ON = "This Loan Agreement (the \"**Agreement**\") is made on {{date}} (the \"**Effective Date**\")";
export const BETWEEN = "Between:";
export const PARTY_COMPANY =
  "{{name}} (Registration Number {{id_no}}), a company incorporated in {{jurisdiction}} with its registered office at {{address}}";
export const PARTY_INDIVIDUAL = "{{name}} (NRIC / Passport No.: {{id_no}}), a {{nationality}} citizen whose residential address is {{address}}";
export const LENDERS_SCHEDULE = "THE PERSONS LISTED IN PART 1 OF SCHEDULE 1 (THE LENDERS) (collectively, the \"**Lenders**\", and each a \"**Lender**\")";
export const PARTIES_COLLECTIVE = "(collectively, the \"**Parties**\" and each, a \"**Party**\").";
export const WHEREAS = "WHEREAS";
export const RECITAL =
  "Pursuant to certain discussions, {{the_lenders}}{{lenders_desc}} {{have}} agreed to advance a principal amount of {{principal}} (the \"**Principal Amount**\") to the Borrower on the terms and subject to the conditions of this Agreement.";
export const AGREED = "It is hereby agreed as follows:";

/* ── the definitions ──────────────────────────────────────────────────── */

export interface Definition {
  term: string;
  text: string;
  /** Keyed condition (see assemble.ts → keep()). */
  when?: string;
}

export const DEFINITIONS: Definition[] = [
  { term: "Agreed Currency", text: "means {{cur_name}} ({{cur}}), being the lawful currency of {{cur_country}};" },
  { term: "Arbitral Institution", text: "has the meaning given to it in {{clause:disputes}} (Dispute Resolution);", when: "siac" },
  { term: "Arbitration Rules", text: "has the meaning given to it in {{clause:disputes}} (Dispute Resolution);", when: "siac" },
  { term: "Borrower Bank Account", text: "refers to the bank account of the Borrower with {{bank}} (account name: {{account_name}}; account number: {{account_no}}; SWIFT / BIC code: {{swift}}; bank address: {{bank_address}}), or such other account nominated by the Borrower in writing from time to time;" },
  { term: "Business Day", text: "means a day (other than a Saturday, a Sunday, or a public holiday) on which banks are open for business generally in Singapore;" },
  { term: "Change of Control Event", text: "has the meaning given to it in {{clause:coc_event}} (Change of Control Event);", when: "coc" },
  { term: "Company", text: "refers to {{company}};", when: "company_def" },
  { term: "Drawdown Date", text: "refers to the date that the Loan is disbursed by {{the_lenders}} to the Borrower Bank Account, being {{drawdown}}, or such other date agreed between {{the_lenders}} and the Borrower in writing, including, but not limited to, written communication through email from {{lar}};" },
  { term: "Event of Default", text: "shall have the meaning given to it in {{clause:eod}} (Events of Default);" },
  { term: "Financial Statements", text: "has the meaning given to it in {{clause:reps_company}} ({{reps_company_head}});", when: "comfort" },
  { term: "Interest", text: "has the meaning given to it in {{clause:interest}} (Interest Rate);", when: "interest" },
  { term: "Lenders' Authorised Representative", text: "means the person(s) set out in Part 2 of Schedule 1 (Lenders' Authorised Representative);", when: "several" },
  { term: "Loan", text: "refers to the Principal Amount{{and_interest}} in accordance with the terms set out herein;" },
  { term: "Maturity Date", text: "refers to the date falling {{term_words}} from the Effective Date, or such other later date as extended by {{lar}} in writing from time to time;" },
  { term: "Principal Amount", text: "has the meaning given to it in Recital (A);" },
  { term: "Security Document", text: "has the meaning given to it in {{clause:security}} (Security);", when: "security" },
  { term: "Settlement Date", text: "has the meaning given to it in {{clause:repayment}} (Repayment);" },
  { term: "Surviving Provisions", text: "refers to the provisions set out in {{section:general}} (General), or such provisions which by their nature should survive the termination of this Agreement;" },
  { term: "Term", text: "refers to the period commencing on the Effective Date and ending on the date the Loan is fully repaid." },
];

export const INTERPRETATION: { text: string; when?: string }[] = [
  { text: "The headings in this Agreement are for convenience only and shall not affect the construction or interpretation of this Agreement." },
  { text: "References to \"Agreement\" and \"this Agreement\" are references to this agreement, including the recitals and the schedule(s) hereto, as amended in writing from time to time." },
  { text: "References to \"persons\" include any individual, company, corporation, firm, partnership, joint venture, association, state, state agency, institution, or trust (whether or not having a separate legal personality)." },
  { text: "Words importing the singular include the plural and vice versa, words importing any gender include any gender, words importing persons include bodies corporate and unincorporated, and references to time, unless otherwise agreed by the relevant parties thereto, shall mean the time in Singapore." },
  { text: "All undertakings, representations and warranties provided by the Lenders under this Agreement shall be provided on a joint and several basis.", when: "several" },
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
      { id: "advance", text: "**Advance of Loan.** Subject to the terms set out in this Agreement, {{the_lenders}} hereby {{agree}} to advance to the Borrower the Principal Amount of {{principal}}{{each_share}}." },
      { id: "purpose", when: "purpose", text: "**Purpose.** The Borrower shall apply the Principal Amount towards {{purpose}}, and {{the_lenders}} shall not be obliged to monitor or verify the application of any amount advanced under this Agreement." },
      {
        id: "conditions",
        when: "conditions",
        text: "**Conditions Precedent.** {{The_lenders}} shall not be obliged to advance the Principal Amount until {{lar}} has received the following, in form and substance satisfactory to {{lar}} (acting reasonably):",
        subs: [
          { ref: "(a)", when: "borrower_company", text: "a certified copy of the constitutional documents of the Borrower and of the resolution of its board of directors approving the terms of, and the transactions contemplated by, this Agreement;" },
          { ref: "(b)", when: "security", text: "the Security Document, duly executed by each party to it;" },
          { ref: "(c)", when: "pledge", text: "the share certificate(s) for the Pledged Shares, together with share transfer forms in respect of the Pledged Shares duly signed by the registered holder but undated, to be held in accordance with the Security Document;" },
          { ref: "(d)", when: "pledge", text: "evidence that all consents and waivers required under the constitution of the company in which the Pledged Shares are held, and under any shareholders' agreement relating to it, for the creation and enforcement of the Security Document have been obtained; and" },
          { ref: "(e)", when: "security", text: "evidence that any stamp duty payable on the Security Document has been paid, and that any registration required to perfect it has been or will be made within the time allowed by law." },
        ],
      },
      { id: "drawdown", text: "**Drawdown Date.** {{The_lenders}} shall pay the full amount of the Principal Amount to the Borrower on the Drawdown Date in cleared funds into the Borrower Bank Account. {{The_lenders}} shall make the Principal Amount available to the Borrower in a single advance on the terms set out in this Agreement." },
      { id: "payments_borrower", when: "principal_first", text: "**Payments.** All payments made under this Agreement shall be made in the Agreed Currency. All payments shall be applied {{pay_order}}. Whenever any payment becomes due on a day that is not a Business Day, payment shall be made on the following Business Day." },
      { id: "payments_lender", when: "interest_first", text: "**Payments.** All payments made under this Agreement shall be made in the Agreed Currency, in immediately available funds and without set-off, counterclaim or deduction. All payments shall be applied {{pay_order}}. Whenever any payment becomes due on a day that is not a Business Day, payment shall be made on the following Business Day." },
      { id: "assign_notice", when: "assign_notice", text: "**{{lenders_heading}} Ability to Assign.** The Parties hereby agree that {{the_lenders}} {{reserve}} the right to assign the rights under this Agreement to a third party{{not_competitor}}, by providing the Borrower with a written notice at least thirty (30) calendar days prior to such assignment." },
      { id: "assign_free", when: "assign_free", text: "**{{lenders_heading}} Ability to Assign.** {{The_lenders}} may assign, transfer or otherwise dispose of {{lenders_their}} rights under this Agreement as {{the_lenders}} may see fit, without the consent of the Borrower, by written notice to the Borrower. The Borrower shall promptly execute all such documents and take all such steps as {{lar}} may reasonably require to give the assignee the benefit of this Agreement." },
      { id: "assign_consent", when: "assign_consent", text: "**{{lenders_heading}} Ability to Assign.** {{The_lenders}} may not assign or transfer any of {{lenders_their}} rights under this Agreement without the prior written consent of the Borrower (such consent not to be unreasonably withheld or delayed)." },
      { id: "borrower_assign", text: "**No Assignment by the Borrower.** The rights of the Borrower under this Agreement are personal to the Borrower, who may not assign, transfer, charge or otherwise deal with any of the Borrower's rights or obligations under this Agreement without the prior written consent of {{lar}}." },
    ],
  },
  {
    id: "interest",
    heading: "INTEREST",
    clauses: [
      {
        id: "interest",
        when: "tiered",
        text: "**Interest Rate.** The Loan shall accrue a simple interest based on the following terms (the \"**Interest**\"):",
        subs: [
          { ref: "(a)", text: "a total interest of {{t1_words}} of the Principal Amount, if the Loan is repaid on or before three (3) months from the Effective Date i.e. an interest payment equivalent to {{t1_amount}};" },
          { ref: "(b)", text: "a total interest of {{t2_words}} of the Principal Amount, if the Loan is repaid: (i) after three (3) months; but (ii) on or before six (6) months from the Effective Date i.e. an interest payment equivalent to {{t2_amount}};" },
          { ref: "(c)", text: "a total interest of {{t3_words}} of the Principal Amount, if the Loan is repaid after six (6) months from the Effective Date i.e. an interest payment equivalent to {{t3_amount}}; or" },
          { ref: "(d)", text: "in the event an Event of Default occurs, a total interest of {{t3_words}} of the Principal Amount i.e. an interest payment equivalent to {{t3_amount}}." },
        ],
      },
      { id: "interest", when: "annual", text: "**Interest Rate.** The Loan shall accrue a simple interest at the rate of {{rate_words}} per annum on the Principal Amount outstanding from time to time, from (and including) the Drawdown Date to (but excluding) the date of repayment (the \"**Interest**\"). The Interest shall be calculated on the basis of a 365-day year and the actual number of days elapsed." },
      { id: "interest", when: "flat", text: "**Interest Rate.** In consideration of the Loan, the Borrower shall pay a fixed interest of {{flat_words}} of the Principal Amount, i.e. an interest payment equivalent to {{flat_amount}} (the \"**Interest**\"), which shall be payable in full irrespective of the date on which the Loan is repaid." },
      { id: "interest_free", when: "interest_free", fd: true, text: "**No Interest.** The Loan is interest-free. No interest shall accrue on the Principal Amount{{save_default}}." },
      { id: "settlement", when: "settle_end", text: "**Settlement of Interest.** The Interest shall be payable on the Settlement Date, along with the repayment of the Principal Amount." },
      { id: "settlement", when: "settle_quarterly", text: "**Settlement of Interest.** The Interest shall be payable quarterly in arrears on the last day of each successive period of three (3) months from the Drawdown Date, and on the Settlement Date for the period then ending." },
      { id: "settlement", when: "settle_instalments", text: "**Settlement of Interest.** The Interest accrued up to the date of each instalment shall be payable with that instalment, and any balance on the Settlement Date." },
      { id: "default_interest", when: "default_interest", text: "**Default Interest.** If the Borrower fails to pay any amount under this Agreement on its due date, interest shall accrue on the overdue amount from the due date up to the date of actual payment (both before and after judgment) at the rate of {{default_rate}} per annum. Such default interest shall be payable on demand by {{lar}}." },
    ],
  },
  {
    id: "repayment",
    heading: "REPAYMENT OF LOAN",
    clauses: [
      {
        id: "repayment",
        when: "repay_demand",
        text: "**Repayment.** Subject to the voluntary repayment provisions set out in {{clause:early}} (Voluntary Early Repayment), the Borrower shall repay the Loan within thirty (30) calendar days from the date of the written request of {{lar}}:",
        subs: [
          { ref: "(a)", text: "served on the Borrower on or after the Maturity Date; or" },
          { ref: "(b)", when: "coc", text: "served upon the occurrence of a Change of Control Event," },
        ],
        tail: "whichever occurs earlier (such date, the \"**Settlement Date**\").",
      },
      { id: "repayment", when: "repay_maturity", text: "**Repayment.** Subject to the voluntary repayment provisions set out in {{clause:early}} (Voluntary Early Repayment), the Borrower shall repay the Loan in full, together with all Interest and other amounts accrued under this Agreement, on the Maturity Date (such date, or the earlier date on which the Loan becomes due and payable under this Agreement, the \"**Settlement Date**\")." },
      { id: "repayment", when: "repay_instalments", text: "**Repayment.** Subject to the voluntary repayment provisions set out in {{clause:early}} (Voluntary Early Repayment), the Borrower shall repay the Principal Amount in {{instalment_count}} equal {{instalment_freq}} instalments of {{instalment_amount}} each, the first falling {{instalment_first}} after the Drawdown Date and the last on the Maturity Date, and shall repay the balance of the Loan on the Maturity Date (the date on which the Loan is repaid in full, the \"**Settlement Date**\")." },
      {
        id: "early",
        when: "early_free",
        text: "**Voluntary Early Repayment.** The Borrower shall have the option (but not the obligation) at any time to repay the whole or any part of the Loan without premium or penalty Provided That:",
        subs: [
          { ref: "(a)", text: "written notice (via email or otherwise) shall have been given by the Borrower to {{lar}} in respect of its intention to repay the Loan; and" },
          { ref: "(b)", text: "{{lar}} shall provide full and complete details of the bank account(s), in respect of which the Loan is to be repaid, within three (3) calendar days of the notice referred to above." },
        ],
      },
      { id: "early", when: "early_consent", text: "**Voluntary Early Repayment.** The Borrower may not repay the whole or any part of the Loan before the Settlement Date without the prior written consent of {{lar}}." },
      { id: "repay_date", when: "repay_date", text: "**Date of Repayment.** For the purposes of calculating the Interest in accordance with {{section:interest}} (Interest), the date that the Loan is repaid shall be: (i) the date that irrevocable instructions were provided to the financial institution and/or bank in respect of the transfer; or (ii) in the event that {{lar}} does not provide the bank account details within the period stated in {{clause:early}}, the date that the written notice of repayment was served by the Borrower." },
    ],
  },
  {
    id: "default",
    heading: "EVENTS OF DEFAULT",
    clauses: [
      {
        id: "eod",
        when: "lenient",
        text: "**Events of Default.** For the purposes of this Agreement, the Parties agree that \"**Event of Default**\" shall refer to the occurrence of any of the following events during the Term:",
        subs: [
          { ref: "(a)", text: "if the Borrower materially breaches the terms set out in this Agreement and fails to remedy such breach within thirty (30) calendar days of the date that the written notice was validly served by {{lar}} on the Borrower;" },
          { ref: "(b)", text: "if the Borrower fails to repay the Loan in accordance with the terms set out herein; or" },
          { ref: "(c)", text: "if the Borrower has voluntarily or involuntarily become the subject of proceedings under any bankruptcy or insolvency laws." },
        ],
      },
      {
        id: "eod",
        when: "strict",
        text: "**Events of Default.** For the purposes of this Agreement, the Parties agree that \"**Event of Default**\" shall refer to the occurrence of any of the following events during the Term:",
        subs: [
          { ref: "(a)", text: "if the Borrower fails to pay any sum when due under this Agreement, unless such failure is caused by an administrative or technical error and payment is made within three (3) Business Days of its due date;" },
          { ref: "(b)", text: "if the Borrower fails to comply with any other provision of this Agreement{{or_security}}, unless such failure is capable of remedy and is remedied within fifteen (15) Business Days of the earlier of the Borrower becoming aware of it and {{lar}} giving notice of it;" },
          { ref: "(c)", text: "if any representation or warranty made or deemed to be made by the Borrower in this Agreement is or proves to have been incorrect or misleading in any material respect when made;" },
          { ref: "(d)", text: "if any other indebtedness of the Borrower for borrowed money is not paid when due, or becomes due and payable before its stated maturity by reason of a default;" },
          { ref: "(e)", text: "if the Borrower is unable or admits inability to pay its debts as they fall due, suspends making payments on any of its debts, or commences negotiations with its creditors with a view to rescheduling its indebtedness;" },
          { ref: "(f)", text: "if any step is taken for the {{insolvency_steps}} of the Borrower, or for the appointment of a {{insolvency_officer}} over the Borrower or any of its assets, which is not frivolous or vexatious and is not discharged within twenty-one (21) days;", },
          { ref: "(g)", when: "security", text: "if the Security Document is not, or ceases to be, in full force and effect, or any party to it (other than {{the_lenders}}) repudiates it; or" },
          { ref: "(h)", text: "if it becomes unlawful for the Borrower to perform any of its obligations under this Agreement." },
        ],
      },
      {
        id: "consequences",
        when: "lenient",
        text: "**Consequences of Default.**",
        subs: [
          { ref: "(a)", text: "Upon the occurrence of an Event of Default, the Borrower shall provide a written notice to {{lar}}, and shall have the opportunity to cure and/or remedy the Event of Default for a period of ninety (90) calendar days from the date of the foregoing notice." },
          { ref: "(b)", text: "In the event that the Event of Default is not cured within the timeline stated above, {{lar}} may, by written notice to the Borrower, declare that all or part of the Loan, together with the Interest accrued thereunder{{as_per_interest}} and any other amounts outstanding under this Agreement, shall become immediately due and payable." },
        ],
      },
      {
        id: "consequences",
        when: "strict",
        text: "**Consequences of Default.** The Borrower shall notify {{lar}} in writing promptly upon becoming aware of any Event of Default. At any time while an Event of Default is continuing, {{lar}} may, by written notice to the Borrower, declare that all or part of the Loan, together with the Interest accrued thereunder{{as_per_interest}} and any other amounts outstanding under this Agreement, shall become immediately due and payable.",
      },
      { id: "default_costs", text: "**Costs Borne by Borrower.** Upon the occurrence of an Event of Default, subject to the applicable laws and regulations, the Borrower shall bear the legal fees and/or expenses associated with the enforcement of the obligations set out in this Agreement." },
      { id: "acknowledgement", when: "tiered", text: "**Acknowledgements.** The Parties agree and acknowledge that upon the occurrence of an Event of Default, the interest that shall be applied on the Loan shall be determined in accordance with {{section:interest}} (Interest)." },
    ],
  },
  {
    id: "security",
    heading: "SECURITY",
    when: "security",
    clauses: [
      { id: "security", when: "security_other", text: "**Security.** The Loan and all other amounts payable by the Borrower under this Agreement shall be secured by {{security_desc}}, in a form agreed by {{lar}} (the \"**Security Document**\"), which shall be delivered in accordance with {{clause:conditions}} (Conditions Precedent)." },
      { id: "security", when: "pledge", text: "**Security.** The Loan and all other amounts payable by the Borrower under this Agreement shall be secured by a first-ranking pledge of {{pledged_shares}} (the \"**Pledged Shares**\") in favour of {{the_lenders}}, in a form agreed by {{lar}} (the \"**Security Document**\"), which shall be delivered in accordance with {{clause:conditions}} (Conditions Precedent)." },
      { id: "enforcement", text: "**Enforcement.** At any time after the Loan has been declared due and payable under {{clause:consequences}} (Consequences of Default), {{lar}} may enforce the Security Document in accordance with its terms. The rights of {{the_lenders}} under the Security Document are in addition to, and not in substitution for, {{lenders_their}} rights under this Agreement." },
      { id: "release", fd: true, text: "**Release.** Upon the full repayment of the Loan and all other amounts due and payable under this Agreement, {{the_lenders}} shall, at the cost of the Borrower, promptly release the security created by the Security Document{{and_return_pledge}}." },
    ],
  },
  {
    id: "reps",
    heading: "REPRESENTATIONS AND WARRANTIES",
    clauses: [
      {
        id: "reps_company",
        when: "comfort",
        text: "**{{reps_company_head}}.** The Borrower represents and warrants to {{the_lenders}} that, as at the Effective Date:",
        subs: [
          { ref: "(a)", id: "c_incorporated", text: "{{co}} is a corporation duly incorporated and validly existing under the laws of {{co_jurisdiction}};" },
          { ref: "(b)", text: "the financial statements relating to {{co}}, being the financial statements in respect of {{financial_periods}} (the \"**Financial Statements**\"), provide a true and fair view of {{co_poss}} financial affairs, the current cash balance of accounts and burn-down rate;" },
          {
            ref: "(c)",
            text: "the Financial Statements:",
            subs: [
              { ref: "(i)", text: "make full provision for all actual liabilities; and" },
              { ref: "(ii)", text: "disclose all contingent liabilities;" },
            ],
          },
          { ref: "(d)", text: "there have been no material adverse changes in the financial or trading position of {{co}} that have not been reflected in the investor update (which contains the profit and loss summary) that has been provided by the Borrower to {{lar}}; and" },
          { ref: "(e)", text: "{{co}} has been conducting its business in material compliance with the laws and/or regulations in Singapore and any other jurisdiction in which it carries on business and, based on its knowledge, is not in material breach of any laws and/or regulations that are pivotal to the operations of its business." },
        ],
      },
      {
        id: "reps_borrower",
        text: "**Borrower's Representations & Warranties.** The Borrower represents and warrants to {{the_lenders}} that, as at the Effective Date:",
        subs: [
          { ref: "(a)", when: "borrower_company", text: "the Borrower is a company duly incorporated and validly existing under the laws of {{borrower_jurisdiction}};", id: "b_incorporated" },
          { ref: "(b)", text: "the Borrower has full power and authority to perform the Borrower's obligations under this Agreement and has procured or will procure any consent(s) required for the execution and performance of this Agreement;" },
          { ref: "(c)", text: "entry into this Agreement and the transactions contemplated hereunder shall not result in the breach of any applicable laws and/or regulations in Singapore by the Borrower{{or_company}};" },
          { ref: "(d)", text: "this Agreement constitutes valid and legally binding obligations of the Borrower, enforceable against the Borrower in accordance with its terms; and" },
          { ref: "(e)", text: "the Borrower has the legal right and full power and authority to enter into and perform this Agreement, which when executed will constitute valid and binding obligations on the Borrower, in accordance with its terms." },
        ],
      },
      {
        id: "reps_lenders",
        text: "**{{lenders_heading}} Representations & Warranties.** {{The_lenders}}{{jointly}} {{represent}} and {{warrant}} to the Borrower that, as at the Effective Date:",
        subs: [
          { ref: "(a)", text: "{{each_lender}}{{lender_being}} has full power and authority to perform {{lender_poss}} obligations under this Agreement and has procured any consent(s) required for the execution and performance of this Agreement;" },
          { ref: "(b)", text: "this Agreement constitutes valid and legally binding obligations of {{each_lender}}, enforceable against {{each_lender_obj}} in accordance with its terms; and" },
          { ref: "(c)", text: "{{each_lender}} has the legal right and full power and authority to enter into and perform this Agreement, which when executed will constitute valid and binding obligations on {{each_lender_obj}}, in accordance with its terms." },
        ],
      },
      {
        id: "regulatory",
        text: "**Regulatory Status.** The Parties further agree and acknowledge that, for the purposes of the transactions contemplated under this Agreement:",
        subs: [
          { ref: "(a)", text: "{{the_lenders}}{{lenders_desc}} {{are}} not carrying on the business of moneylending or any other regulated lending activity in Singapore, whether as principal or agent, within the meaning of the Moneylenders Act 2008; and" },
          { ref: "(b)", text: "to the extent applicable, the execution, delivery or performance of this Agreement does not require {{the_lenders}} to be licensed, authorised or registered, or to seek the requisite approvals, under the Moneylenders Act 2008." },
        ],
        tail: "To the extent that any necessary approvals, authorisations and/or licences are required under the Moneylenders Act 2008, the Parties agree to act in good faith and cooperate to obtain such approvals, authorisations and/or licences in order to comply with the applicable laws and regulations.",
      },
      { id: "reporting", when: "comfort", text: "**Reporting.** The Borrower shall, on a quarterly basis, provide updates to {{lar}} on the status of {{co_poss}} {{next_round}} financing and other material business developments relating to {{co}}." },
    ],
  },
  {
    id: "coc",
    heading: "CHANGE OF CONTROL",
    when: "coc",
    clauses: [
      {
        id: "coc_event",
        text: "**Change of Control Event.** For the purposes of this Agreement, a \"**Change of Control Event**\" shall mean the occurrence of any of the following events:",
        subs: [
          { ref: "(a)", text: "the acquisition by any person of beneficial ownership, including through a merger, consolidation or reorganisation, of more than seventy-five per cent. (75%) of the shares or other equity securities in issue and/or voting power of {{co}};" },
          { ref: "(b)", text: "the consummation of a merger or consolidation involving {{co}}, unless, following such transaction, the shareholders of {{co}} immediately prior to such merger or consolidation own, directly or indirectly, at least seventy-five per cent. (75%) of the combined voting power of the surviving entity; or" },
          { ref: "(c)", text: "the sale or disposition by {{co}} of assets representing more than seventy-five per cent. (75%) of the total assets of {{co}}, based on {{co_poss}} most recent financial statements, excluding sales or dispositions made in the ordinary course of business." },
        ],
      },
      { id: "coc_accel", text: "**Acceleration of Repayment.** Upon the occurrence of a Change of Control Event, {{lar}} may, by written notice to the Borrower, determine that all or part of the Loan, together with the Interest accrued thereunder{{as_per_interest}}, become due and payable {{coc_when}}." },
    ],
  },
  {
    id: "termination",
    heading: "TERMINATION",
    clauses: [
      { id: "term_events", text: "**Termination Events.** Save for the Surviving Provisions, the Parties agree that this Agreement shall automatically terminate ipso facto upon the full repayment of the Loan, and any amounts due and payable under this Agreement in accordance with the terms set out herein." },
      { id: "term_effects", text: "**Effects of Termination.** Upon the termination of this Agreement for any of the reasons set forth above, all obligations of the Parties under this Agreement shall cease, save for the Surviving Provisions." },
    ],
  },
  {
    id: "general",
    heading: "GENERAL",
    clauses: [
      {
        id: "confidentiality",
        text: "**Confidentiality.**",
        subs: [
          { ref: "(a)", text: "Subject to {{clause:confidentiality}}(b), each of the Parties shall treat as confidential and not disclose or use any information received or obtained in connection with this Agreement and any negotiations relating thereto." },
          {
            ref: "(b)",
            text: "{{clause:confidentiality}}(a) shall not prohibit disclosure of any information if and to the extent:",
            subs: [
              { ref: "(i)", text: "the disclosure is required by law, any competent court, any competent governmental or regulatory authority or the rules and regulations of an internationally recognised stock exchange (including such disclosure for purposes of financial reporting in connection with group accounting or reporting);" },
              { ref: "(ii)", text: "the disclosure is required for the purpose of any judicial or arbitral proceedings arising out of this Agreement or any other agreement entered into under or pursuant to this Agreement, or the disclosure is reasonably required to be made to a taxation authority in connection with the taxation affairs of the disclosing Party;" },
              { ref: "(iii)", text: "the disclosure is made to the professional advisers of a Party{{co_advisers}};" },
              { ref: "(iv)", when: "co_any", text: "the disclosure is made by {{co}} and/or its officers to such third parties in respect of a potential fundraising exercise, acquisition and/or such other corporate transaction in relation to {{co}};" },
              { ref: "(v)", when: "assign_any", text: "the disclosure is made to a prospective assignee or transferee of {{the_lenders}} permitted under {{clause:assign}}, who has agreed to keep the information confidential on terms no less strict than this Clause;" },
              { ref: "(vi)", text: "the information becomes generally available to the public other than as a result of a breach of this Agreement; or" },
              { ref: "(vii)", text: "the other Parties have given prior written approval to the disclosure." },
            ],
          },
        ],
      },
      { id: "announcements", when: "announce_borrower", text: "**Announcements.** No announcement in connection with the existence or the subject matter of this Agreement shall be made or issued by or on behalf of any Party without the prior written approval of the Borrower." },
      { id: "announcements", when: "announce_mutual", text: "**Announcements.** No announcement in connection with the existence or the subject matter of this Agreement shall be made or issued by or on behalf of any Party without the prior written approval of the Borrower and {{lar}}." },
      {
        id: "liability",
        text: "**Limitation of Liability.**",
        subs: [
          { ref: "(a)", text: "No Party shall have any obligation to the other Party in respect of any claim under this Agreement unless written notice of that claim is given by such Party to the other Party(ies) within two (2) years from the termination of this Agreement." },
          { ref: "(b)", when: "cap", text: "The Borrower's aggregate liability to {{the_lenders}} in respect of any breach of the terms set out in this Agreement shall be limited to an aggregate sum not exceeding two (2) times the Principal Amount, provided that nothing in this Clause limits the Borrower's obligation to repay the Loan and to pay the Interest and other amounts due under this Agreement." },
        ],
      },
      { id: "invalidity", text: "**Partial Invalidity.** If at any time any provision of this Agreement is or becomes illegal, invalid or unenforceable in any respect under any law of any jurisdiction, neither the legality, validity or enforceability of the remaining provisions nor the legality, validity or enforceability of such provision under the law of any other jurisdiction will in any way be affected or impaired." },
      { id: "notices", text: "**Notices.** All notices and communications given under this Agreement must be in writing and in English, and will be delivered personally, sent by post, or sent by email to the recorded addresses or email addresses of the Parties as described in this Agreement, or as amended by a Party by notice to the others.{{lar_notices}} Subject to the applicable laws and regulations, the primary mode of communication shall be via the email addresses indicated in the signature blocks below." },
      { id: "lar", when: "several", text: "**Lenders' Authorised Representative.** The Lenders agree that the Lenders' Authorised Representative has full power and authority to represent, deal and transact on behalf of each Lender, and the Borrower shall not be responsible for any actions and/or omissions of the Lenders' Authorised Representative. The Lenders may replace the Lenders' Authorised Representative by written notice to the Borrower signed by all the Lenders." },
      { id: "entire", text: "**Entire Agreement.** This Agreement{{and_security_doc}} contains all the terms, representations and warranties made between the Parties relating to the matters dealt with in this Agreement and supersedes and cancels all prior discussions and agreements covering the subject matter of this Agreement. The Parties have not relied on any representation, warranty or agreement relating to the subject matter of this Agreement that is not expressly set out in this Agreement, and no such representation, warranty or agreement has any effect from the Effective Date." },
      { id: "assurances", text: "**Further Assurances.** The Parties must each sign all further documents, pass all resolutions and do all further things as may be necessary or desirable to give effect to this Agreement." },
      { id: "amendments", text: "**Amendments or Extensions.** Any amendments or extensions to this Agreement must be made in writing with the agreement of the Borrower and {{lar}}. Such extensions may add to or amend any provision in this Agreement when explicitly stated." },
      { id: "waiver", text: "**Waiver.** Subject to the terms set out in this Agreement, no exercise or failure to exercise or delay in exercising any right or remedy will constitute a waiver by that Party of that or any other right or remedy available to that Party." },
      {
        id: "costs",
        when: "costs_cap",
        text: "**Costs.**",
        subs: [
          { ref: "(a)", text: "The Parties hereby agree that the Borrower shall bear the costs of the legal fees and/or expenses incurred in connection with this Agreement up to an agreed cap of {{costs_cap}}. Unless otherwise agreed upon in writing and the terms set out herein, any other legal fees and/or expenses exceeding the agreed cap of {{costs_cap}} shall be borne by the Party incurring the additional legal fees and/or expenses. The Parties agree that all legal fees and/or expenses incurred shall be documented and receipts shall be provided or made available to the Parties for the purposes of transparency and record keeping." },
          { ref: "(b)", text: "Other than the above and except as provided herein, each Party shall bear its own costs and expenses incurred in connection with this Agreement." },
        ],
      },
      { id: "costs", when: "costs_own", text: "**Costs.** Except as otherwise provided in this Agreement, each Party shall bear its own costs and expenses incurred in connection with the negotiation, preparation and completion of this Agreement." },
      { id: "costs", when: "costs_borrower", text: "**Costs.** The Borrower shall pay, and indemnify {{the_lenders}} against, all costs and expenses (including legal fees) reasonably incurred by {{the_lenders}} in connection with the negotiation, preparation and completion of this Agreement{{and_security_costs}}, and any stamp duty payable on this Agreement{{or_security_doc}}." },
      { id: "counterparts", text: "**Counterparts.** This Agreement may be signed in any number of counterparts, all of which taken together shall constitute one and the same instrument. Any Party may enter into this Agreement by signing any such counterpart, and each counterpart shall be as valid and effectual as if executed as an original." },
      { id: "third_party", text: "**Third Party Rights.** Unless expressly provided to the contrary in this Agreement, a person who is not a Party has no right under the Contracts (Rights of Third Parties) Act 2001 to enforce or enjoy the benefit of any term of this Agreement." },
      { id: "law", text: "**Governing Law.** This Agreement shall be governed by, and construed in accordance with, the laws of Singapore." },
      {
        id: "disputes",
        when: "siac",
        text: "**Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "If any dispute, controversy, or claim arises out of or relating to this Agreement, or to the interpretation, breach, termination or validity of this Agreement, the Parties must use their best efforts to resolve such dispute through consultation or mediation. The consultation or mediation between the Parties must begin as soon as practicable after one disputing Party has delivered to the other disputing Party a written notice setting out the matter of the dispute." },
          { ref: "(b)", text: "If such dispute is not settled within thirty (30) calendar days after the date of the relevant dispute notice referred to above, the dispute must be referred to and resolved by arbitration seated in Singapore in accordance with the Arbitration Rules of the Singapore International Arbitration Centre for the time being in force, administered by the Singapore International Arbitration Centre (the \"**Arbitration Rules**\" and the \"**Arbitral Institution**\" respectively). The tribunal will consist of one (1) arbitrator, to be appointed in accordance with the Arbitration Rules. The language of the arbitration will be English." },
        ],
      },
      {
        id: "disputes",
        when: "courts",
        text: "**Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "If any dispute, controversy, or claim arises out of or relating to this Agreement, or to the interpretation, breach, termination or validity of this Agreement, the Parties must use their best efforts to resolve such dispute through consultation or mediation. The consultation or mediation between the Parties must begin as soon as practicable after one disputing Party has delivered to the other disputing Party a written notice setting out the matter of the dispute." },
          { ref: "(b)", text: "If such dispute is not settled within thirty (30) calendar days after the date of the relevant dispute notice referred to above, any Party may refer the dispute to the courts of Singapore, which shall have exclusive jurisdiction, and each Party irrevocably submits to the jurisdiction of the Singapore courts. Nothing in this Clause prevents a Party from seeking urgent interim relief at any time." },
        ],
      },
    ],
  },
];

export const EXECUTED = "IN WITNESS WHEREOF this Agreement has been entered into on the Effective Date.";

/** What was generalised from the master, for the admin list. */
export const ADAPTATIONS: string[] = [
  "One Lender or several: with one, \"the Lender\" stands where the master says \"the Lenders\" and \"the Lenders' Authorised Representative\"; Schedule 1, the joint and several rule and the representative's clause appear only with several.",
  "A company Borrower (short-form facility agreement, B): the company party wording, the Borrower's incorporation warranty and board approval as a condition precedent; the company warranties, reporting and change of control then concern the Borrower itself.",
  "A personal loan with no connected company: the Company definition, its warranties, reporting and change of control drop out.",
  "Lenders that are companies: the warranties and the regulatory status no longer say \"being individuals\".",
  "Interest a year, a flat charge or interest-free (B and C), with default interest above the rate or at a set rate (B); interest paid quarterly in arrears (B).",
  "Repayment in full on the Maturity Date (B and C), or in equal monthly or quarterly instalments; early repayment only with consent.",
  "A stated purpose (B); conditions precedent (C); lender-friendly Events of Default — three Business Days for a missed payment, fifteen for other breaches, misrepresentation, cross-default, insolvency steps, illegality (C).",
  "Security in a separate document (C, D): a guarantee or charge, or — offered but never the usual answer — a share pledge, which Rachel notes is not normal for a loan agreement.",
  "Transfers by the Lender freely (B) or only with consent; payments applied to interest first for a lender (B); costs paid by the Borrower in full or each side its own (B).",
  "The master's square-bracketed choices are filled for Singapore: Business Days, the time zone, the Moneylenders Act 2008, the Contracts (Rights of Third Parties) Act 2001, Singapore law, SIAC arbitration in Singapore in English — or the Singapore courts.",
];

/** The master's slips, fixed here. */
export const CORRECTIONS: string[] = [
  "\"Interests\" (a defined term, and the heading of Clause 3) reads \"Interest\".",
  "The Borrower Bank Account table is written into the definition, so it survives the Word export.",
  "Confidentiality: \"the disclosure is made to professional advisers of the Company\" also covers each Party's own advisers, and arbitral proceedings are carved out as well as judicial ones (the agreement provides for arbitration).",
  "Limitation of Liability: \"written notice of that claim is given such Party\" reads \"given by such Party\"; the cap of twice the Principal Amount does not reduce the Loan, the Interest or other amounts due.",
  "The Borrower's warranty that the agreement does not breach the law \"by the Company\" covers the Borrower too.",
  "Voluntary Early Repayment: the date-of-repayment rule, a free-standing paragraph (c) in the master, is its own clause and points back to the bank-details rule.",
  "The Effective Date is used throughout; the master's recital reference \"Recital (A)\" is kept, with the recital lettered (A).",
];
