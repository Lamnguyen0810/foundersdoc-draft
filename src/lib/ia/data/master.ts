/**
 * Investment Agreement — the wording FD AI assembles from.
 *
 * SOURCE. Two of Founders Doc's own investment agreements, shared by Rachel
 * in #fdai-draft-investmentagreement as the reference points, both acting
 * for the company (redacted copies: IA_Sample_A_Simple_Investor_REDACTED
 * and IA_Sample_B_Lead_Investor_REDACTED):
 *
 *   A  simple investor (company and one investor);
 *   B  lead investor (company, founders and the lead investor).
 *
 * The two share most of their wording; where they differ, both versions are
 * kept and the first question (IA1) picks. The master is written with "the
 * Investor"; for a lead investor the assembler reads "the Lead Investor",
 * as sample B does. It is written for several founders ("each Founder");
 * with one founder it is read in the singular.
 *
 * `fd: true` marks wording in neither sample (an individual investor, an
 * ordinary-share version, the non-ratchet conversion, a set completion
 * date …). ADAPTATIONS lists where a sample clause was generalised;
 * CORRECTIONS the samples' slips.
 *
 * Markup, as the other masters: {{field}}, {{clause:id}}, {{section:id}},
 * **bold**.
 */

export const MASTER_VERSION = "IA-V1";
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

export const TITLE = "INVESTMENT AGREEMENT";
export const MADE_ON = "This Investment Agreement (the \"**Agreement**\") is made on {{date}}";
export const BETWEEN = "Between:";
export const COMPANY_PARTY =
  "{{company_name}} (Registration Number {{company_reg_no}}), a company incorporated in the Republic of Singapore with its registered office at {{company_address}} (the \"**Company**\")";
export const FOUNDERS_PARTY = "The persons whose names and addresses are set out in Schedule 1 (together the \"**Founders**\" and each a \"**Founder**\")";
export const INVESTOR_COMPANY =
  "{{name}} (Registration Number {{id_no}}), a company incorporated in {{jurisdiction}} with its registered office at {{address}}";
export const INVESTOR_INDIVIDUAL = "{{name}} (NRIC / Passport Number {{id_no}}), of {{address}}";
export const PARTIES_COLLECTIVE = "(collectively, the \"**Parties**\" and each, a \"**Party**\").";
export const WHEREAS = "WHEREAS";
export const RECITAL_INCORPORATED = "The Company is a private company limited by shares incorporated in Singapore.";
export const RECITAL_CAPITAL =
  "As at the date of this Agreement, the Company has an issued and paid-up share capital of {{issued_capital}} comprising {{issued_shares}} Ordinary Shares.";
export const RECITAL_SUBSCRIPTION =
  "The Investor has agreed to subscribe for, and the Company has agreed to allot and issue the Subscription Shares in consideration for the Investment Amount, on the terms and subject to the conditions of this Agreement (the \"**Subscription**\").";
export const RECITAL_SAFE =
  "The Parties agree and acknowledge that the investment contemplated under this Agreement shall constitute an \"Equity Financing\" for the purposes of the simple agreement for future equity entered into {{safe_date}}between the Company and the Investor (the \"**Investor SAFE**\"), pursuant to which the Investor SAFE will be converted in accordance with the terms set out therein as well as the Investor SAFE Conversion Notice.";
export const RECITAL_LEAD =
  "The Parties further note that the Company has entered or intends to enter into a term sheet with {{lead_name}} and/or its nominee (the \"**Lead Investor**\") in respect of a potential investment in the Company.";
export const AGREED = "It is hereby agreed as follows:";

/* ── the definitions ──────────────────────────────────────────────────── */

export interface Definition {
  term: string;
  text: string;
  when?: "lead" | "simple" | "cp" | "constitution" | "sha" | "safe" | "round" | "pref" | "liquidity" | "warranties" | "affiliate" | "convert" | "usd";
  fd?: boolean;
}

export const DEFINITIONS: Definition[] = [
  { term: "ACRA", text: "means the Accounting and Corporate Regulatory Authority of Singapore;" },
  { term: "Act", text: "means the Companies Act 1967 of Singapore, as amended or modified from time to time;" },
  {
    term: "Affiliate",
    when: "affiliate",
    text: "means, with respect to any specified person, any other person who, directly or indirectly, controls, is controlled by, or is under common control with such person, including without limitation any general partner, managing member, officer, director or trustee of such person, or any venture capital fund or investment company now or hereafter existing that is controlled by one or more general partners, managing members or investment adviser of, or shares the same management company or investment adviser with, such person; and in the case of any specified person that is a natural person, shall include a relative of such specified person, or an entity owned and controlled by a relative of such specified person, and includes any trust controlled by or held for the benefit of such specified person;",
  },
  { term: "Amended Constitution", when: "constitution", text: "means the amended constitution of the Company in the agreed form to be adopted on or prior to Completion;" },
  { term: "Board", text: "means the board of directors of the Company;" },
  { term: "Business Day", text: "means a day (other than a Saturday, a Sunday or a gazetted public holiday) on which banks and the Company are open for business generally in Singapore;" },
  { term: "Claim", when: "warranties", text: "means any claim for breach of any Warranty;" },
  { term: "Completion", text: "means the completion of the subscription of the Subscription Shares in accordance with {{section:completion}};" },
  { term: "Completion Date", text: "{{completion_date_def}}" },
  { term: "Conditions Precedent", when: "cp", text: "has the meaning given to it in {{clause:cp}};" },
  { term: "Confidential Information", text: "has the meaning given to it in {{clause:conf_info}};" },
  { term: "Constitution", text: "means the constitution of the Company, as amended from time to time;" },
  { term: "CP Confirmation Certificate", when: "cp", text: "has the meaning given to it in {{clause:cp_fulfilment}};" },
  { term: "Director", text: "refers to a director of the Company from time to time;" },
  {
    term: "Encumbrance",
    text: "means any mortgage, charge, security interest, lien, pledge, assignment by way of security, equity, claim, right of pre-emption, option, covenant, restriction, reservation, lease, trust, order, decree, judgment, title defect (including retention of title claim), conflicting claim of ownership or any other encumbrance of any nature whatsoever (whether or not perfected other than liens arising by operation of law);",
  },
  { term: "Equity Securities", when: "lead", text: "has the meaning given to it in Schedule 4 (Representations and Warranties);" },
  { term: "ESOP", when: "simple", text: "has the meaning given to it in {{clause:acknowledgements}};" },
  { term: "Fundraising Exercise", when: "simple", text: "means a bona fide transaction or series of transactions with the principal purpose of raising capital, pursuant to which the Company issues or sells Securities at a fixed valuation after the date of this Agreement;" },
  { term: "Investment Amount", text: "has the meaning given to it in {{clause:amount}};" },
  { term: "Investor SAFE", when: "safe", text: "has the meaning given to it in Recital {{safe_recital}};" },
  { term: "Investor SAFE Conversion Notice", when: "safe", text: "refers to the Investor SAFE conversion notice issued by the Company to the Investor on or around the date hereof;" },
  { term: "Lead Investor", when: "round", text: "has the meaning given to it in Recital {{lead_recital}};" },
  { term: "Liquidation Preference", when: "liquidity", text: "has the meaning given to it in Schedule {{pref_schedule}};" },
  { term: "Liquidation Proceeds", when: "liquidity", text: "has the meaning given to it in Schedule {{pref_schedule}};" },
  { term: "Liquidity Event", text: "{{liquidity_def}}" },
  { term: "Ordinary Shares", text: "means the ordinary shares in the capital of the Company;" },
  { term: "{{class}}", when: "pref", text: "means {{class_lower}} in the capital of the Company, with such rights and privileges as set out in the Constitution and Schedule {{pref_schedule}} ({{class_title}} Terms) of this Agreement;" },
  { term: "{{class_holder}}", when: "pref", text: "means any person who is the registered holder of any {{class}} in the Company;" },
  { term: "Securities", when: "simple", text: "means any Share and any security that may be converted into Shares or that gives the holder of the security or convertible instrument the right to have Shares issued to it (including but not limited to options, convertible notes and warrants);" },
  { term: "Shareholder", text: "means any shareholder of the Company from time to time (but excludes the Company holding Shares as treasury shares from time to time);" },
  { term: "Shareholders' Agreement", when: "sha", text: "means the shareholders' agreement with the Company to be entered into among the shareholders of the Company in the form agreed by {{sha_approver}} and the parties thereto;" },
  { term: "Shares", text: "means shares in the capital of the Company;" },
  { term: "SIAC", text: "or \"**SIAC Rules**\" has the meaning given to it in {{clause:disputes}};" },
  { term: "Singapore Dollars", text: "or \"**S$**\" mean the lawful currency of Singapore;" },
  { term: "Subscription", text: "has the meaning given to it in Recital {{subscription_recital}};" },
  { term: "Subscription Price", text: "has the meaning given to it in {{clause:amount}};" },
  { term: "Subscription Shares", text: "has the meaning given to it in {{clause:amount}};" },
  { term: "Taxing Authority", when: "lead", text: "means any governmental, state, federal, provincial, local governmental or municipal authority, body or official whether of Singapore or elsewhere in the world, which is competent to impose or collect tax;" },
  { term: "Transaction Documents", text: "refers to this Agreement{{td_docs}} and such other documents ancillary to the foregoing documents;" },
  { term: "United States Dollars", when: "usd", text: "or \"**US$**\" mean the lawful currency of the United States of America;" },
  { term: "Warranties", when: "lead", text: "means the warranty statements given pursuant to {{clause:warranties_given}} and set out in Schedule 4 (Representations and Warranties) and \"**Warranty**\" means any one of them;" },
  { term: "Warrantors", when: "lead", text: "means {{warrantors}}." },
];

export const LIQUIDITY_EVENT = [
  "the Company or shareholder(s) of the Company enters into a binding agreement with a third party (or a group of associated third parties) on arms' length terms pursuant to which the third party is to acquire fifty per cent. (50%) or more of the Shares of the Company, and that agreement becomes unconditional;",
  "the Company enters into a binding agreement to dispose of all or substantially all of the Company's assets, and that agreement becomes unconditional;",
  "the Company enters into a binding agreement to amalgamate with any other company (whether or not it is the continuing company), in a transaction that is in substance similar to those described above, and that agreement becomes unconditional; or",
  "the admission of all or any of the Shares to the Singapore stock exchange, or other internationally recognised stock exchange;",
];

export const INTERPRETATION = [
  { id: "headings", text: "The headings in the Agreement are for convenience only and shall not affect the construction or interpretation of this Agreement." },
  { id: "agreement", text: "References to \"Agreement\" and \"this Agreement\" are references to this investment agreement, as amended in writing from time to time." },
  { id: "persons", text: "References to \"persons\" include any individual, company, corporation, firm, partnership, joint venture, association, state, state agency, institution, or trust (whether or not having a separate legal personality)." },
  { id: "singular", text: "Words importing the singular include the plural and vice versa, words importing any gender include any gender, words importing persons include bodies corporate and unincorporated, and references to time shall mean Singapore time." },
  { id: "agreed_form", text: "Any reference to a document being \"in the agreed form\" is to a document in a form agreed between the Company and the Investor and initialled or otherwise identified by, or on behalf of, each of them as such, with such alterations as may be agreed in writing between the Company and the Investor." },
  { id: "several", text: "Notwithstanding anything to the contrary in this Agreement, all representations, warranties, covenants, liabilities and obligations under this Agreement are provided by the respective Parties on a several, and not joint and several basis, and in no event shall any Party be deemed liable hereunder for any breach or default of any of the representations or warranties made herein by any other Party." },
];

/* ── the clauses ─────────────────────────────────────────────────────── */

export const SECTIONS: MasterSection[] = [
  {
    id: "interpretation",
    heading: "INTERPRETATION",
    clauses: [
      { id: "definitions", title: "Definitions", text: "**Definitions.** In this Agreement, unless the subject or context otherwise requires, the following words and expressions shall have the following meanings:" },
      { id: "interpretation_rules", title: "Interpretation", text: "**Interpretation.**" },
    ],
  },
  {
    id: "investment",
    heading: "THE INVESTMENT",
    clauses: [
      { id: "issuance", title: "Issuance of Subscription Shares", text: "**Issuance of Subscription Shares.** On and subject to the terms of this Agreement, the Investor agrees to subscribe for, and the Company agrees to allot and issue, the Subscription Shares to the Investor, free of all mortgages, security interests, charges, liens and other Encumbrances on Completion." },
      {
        id: "amount",
        title: "Investment Amount",
        question: "IA2 / IA3",
        text: "**Investment Amount.** The aggregate investment amount by the Investor in the Company shall be {{amount}} (the \"**Investment Amount**\"), for an aggregate of {{shares}} {{share_word}} (the \"**Subscription Shares**\") at a subscription price of approximately {{price}} per Subscription Share (the \"**Subscription Price**\").",
      },
      { id: "terms", title: "Terms", question: "IA3", text: "**Terms.** The Subscription Shares to be allotted and issued under {{clause:issuance}} shall, when issued, rank pari passu with all {{share_word}} in issue as at Completion." },
      { id: "acknowledgement", title: "Acknowledgements", text: "**Acknowledgements.** The Investor acknowledges and agrees that the Investor shall procure the execution of such documents and the execution, delivery and performance of such actions as may be required by the Company in order to effect the Subscription." },
      { id: "waiver", title: "Waiver", text: "**Waiver.** Each Founder hereby irrevocably waives any and all pre-emption rights or rights of first refusal he may have, pursuant to the Constitution or otherwise, in relation to the allotment and issuance of the Subscription Shares under this Agreement." },
    ],
  },
  {
    id: "conditions",
    heading: "CONDITIONS PRECEDENT",
    clauses: [
      {
        id: "cp",
        title: "Conditions Precedent",
        question: "IA5",
        text: "**Conditions Precedent.** The obligation of the Investor to subscribe for the Subscription Shares is subject to the satisfaction, acting in a reasonable manner, of the following conditions (\"**Conditions Precedent**\"):",
        subs: [
          { ref: "(a)", id: "cp_approvals", text: "the procurement of all necessary waivers, approvals and consents (including from existing Shareholders, and other third parties) for the issuance of the Subscription Shares having been obtained, and the same shall not have been withdrawn or amended;" },
          { ref: "(b)", id: "cp_compliance", text: "the Company shall have performed and complied in all respects with all agreements, obligations and conditions contained in this Agreement that are required to be performed or complied with on or before the Completion Date, and shall have obtained all approvals, consents and qualifications necessary to complete the subscription, allotment and issuance of the Subscription Shares;" },
          { ref: "(c)", id: "cp_no_prohibition", text: "the transactions contemplated under the Transaction Documents not being prohibited by any statute, order, rule, regulation or directive promulgated or issued after the date of this Agreement by any legislative, executive, judicial or regulatory body or authority of any jurisdiction which is applicable to the Company or the Investor; and" },
          { ref: "(d)", id: "cp_no_breach", text: "there shall have been no breach of any Warranties or other terms contained in this Agreement." },
        ],
      },
      { id: "cp_waiver", title: "Right of Waiver", text: "**Right of Waiver.** Notwithstanding anything contained elsewhere in this Agreement, the Investor shall have the right at its sole discretion to waive any of the Conditions Precedent by a written notice to the Company." },
      { id: "cp_assurance", title: "Further Assurance", text: "**Further Assurance.** The Parties agree to use all reasonable endeavours to procure that the Conditions Precedent are satisfied as soon as practicable after the date of this Agreement and that there is no occurrence that would prevent the Conditions Precedent from being satisfied." },
      {
        id: "cp_fulfilment",
        title: "Fulfilment of Conditions Precedent",
        text: "**Fulfilment of Conditions Precedent.** The Parties shall take all steps necessary to fulfil the Conditions Precedent, and within ten (10) Business Days of fulfilment of all the Conditions Precedent (excluding those which have been waived in writing by the Investor), the Company shall provide written confirmation of the same (\"**CP Confirmation Certificate**\") to the Investor.",
      },
      {
        id: "cp_terminate",
        title: "Right to Terminate",
        question: "IA5a",
        text: "**Right to Terminate.** If any of the Conditions Precedent (which have not been waived by the Investor in writing) is not fulfilled on or prior to the date falling {{longstop}} after the date of this Agreement, any Party shall have the right to terminate this Agreement immediately by written notice to the other Parties and no Party shall have any further rights or obligations under this Agreement against any other Party.",
      },
    ],
  },
  {
    id: "completion",
    heading: "COMPLETION",
    clauses: [
      { id: "completion_when", title: "Completion", question: "IA4", text: "{{completion_text}}" },
      {
        id: "investor_obligations",
        title: "Investor's Obligations on Completion",
        question: "IA9",
        text: "**Investor's Obligations on Completion.** On Completion, the Investor shall:",
        subs: [
          { ref: "(a)", text: "remit an amount equal to the Investment Amount by wire transfer of immediately available funds to the following bank account designated by the Company, without any set-off or withholding whatsoever, and all bank charges in connection with the aforementioned transfer shall be borne by the Investor: account name: {{account_name}}; bank: {{bank_name}}; account number: {{account_no}}; SWIFT code: {{swift}};" },
          { ref: "(b)", id: "io_authority", text: "deliver (via email) evidence that the appointed signatory(ies) is duly authorised to execute the Transaction Documents on behalf of the Investor, to the reasonable satisfaction of the Company;" },
          { ref: "(c)", id: "io_application", text: "deliver (via email) to the Company a completed and duly executed share application form with respect to the Subscription Shares, and such other documents and/or information as may be reasonably requested by the Company to effect the issuance of the Subscription Shares to the Investor;" },
          { ref: "(d)", id: "io_director", text: "procure that its appointed director deliver (via email) to the Company a completed and duly executed director appointment form (Form 45), and such other documents and/or information as may be reasonably requested by the Company to effect the appointment of the individual nominated by the Investor; and" },
          { ref: "(e)", id: "io_sha", text: "deliver (via email) to the Company the Shareholders' Agreement duly executed by the Investor and such other document(s) reasonably requested by the Company in order to effect Completion contemplated hereunder, including but not limited to document(s) requested by the company secretary to effect the share issuance contemplated under this Agreement." },
        ],
      },
      {
        id: "company_obligations",
        title: "Company's Obligations on Completion",
        question: "IA7 / IA8",
        text: "**Company's Obligations on Completion.** On Completion, subject to the receipt of the Investment Amount from the Investor in accordance with {{clause:investor_obligations}}, the Company shall:",
        subs: [
          {
            ref: "(a)",
            text: "deliver (via email) to the Investor a copy of the written resolutions passed by the Board, under which the Board shall have:",
            subs: [
              { ref: "(i)", text: "approved (A) the allotment and issue of the Subscription Shares; (B) the entry of the Investor in the Company's electronic register of members in respect thereof; and (C) the execution and delivery to the Investor of share certificates for the Subscription Shares as soon as practicably possible after Completion;" },
              { ref: "(ii)", id: "cb_director", text: "approved the appointment of a qualified individual nominated by the Investor in writing to the Board as a Director;" },
              { ref: "(iii)", id: "cb_constitution", text: "adopted the Amended Constitution;" },
              { ref: "(iv)", text: "approved and authorised the execution by the Company of this Agreement{{sha_and}} and the consummation of all transactions contemplated thereunder; and" },
              { ref: "(v)", text: "passed such other resolutions as may be required to carry out the obligations of the Company under this Agreement;" },
            ],
          },
          {
            ref: "(b)",
            text: "deliver (via email) to the Investor a copy of the written resolutions passed by the Shareholders under which the Shareholders shall have:",
            subs: [
              { ref: "(i)", text: "authorised the allotment and issuance of the Subscription Shares;" },
              { ref: "(ii)", id: "cs_constitution", text: "adopted the Amended Constitution; and" },
              { ref: "(iii)", text: "waived pre-emption rights in respect of the allotment and issuance of the Subscription Shares;" },
            ],
          },
          { ref: "(c)", text: "issue written instructions to the company secretary to allot and issue the Subscription Shares to the Investor and to lodge the necessary filings with ACRA; and" },
          { ref: "(d)", text: "issue written instructions to the company secretary to deliver (electronically or otherwise) the share certificate(s) in the name of the Investor for the Subscription Shares within ten (10) Business Days of Completion." },
        ],
      },
      {
        id: "breach_completion",
        title: "Breach of Completion Obligations",
        text: "**Breach of Completion Obligations.** If the foregoing provisions of {{clause:company_obligations}} or {{clause:investor_obligations}} are not fully satisfied by the Company or the Investor by the Completion Date, then the Parties may, acting collectively:",
        subs: [
          { ref: "(a)", text: "elect to terminate this Agreement;" },
          { ref: "(b)", text: "elect to effect Completion so far as practicable having regard to the default which has occurred; or" },
          { ref: "(c)", text: "elect to fix a new date for Completion, in which case the foregoing provisions of this {{section:completion}} shall apply to Completion as so deferred." },
        ],
      },
    ],
  },
  {
    id: "warranties",
    heading: "REPRESENTATIONS AND WARRANTIES",
    clauses: [
      {
        id: "company_warranties",
        title: "Company's Representations and Warranties",
        text: "**Company's Representations and Warranties.** The Company represents and warrants to the Investor that, as at the date of this Agreement:",
        subs: [
          { ref: "(a)", text: "the Company is a corporation duly incorporated and validly existing under the laws of Singapore;" },
          { ref: "(b)", text: "the Company has full corporate power and authority to enter into and perform its obligations under this Agreement which when executed will constitute valid and binding obligations on it in accordance with its terms;" },
          { ref: "(c)", text: "the Company has procured the consents required for the execution and performance of this Agreement;" },
          { ref: "(d)", text: "the entry and delivery of, and the performance by the Company of its obligations under this Agreement will not and are not likely to result in a breach of any provision of the Company's constitution, or equivalent constitutional document;" },
          { ref: "(e)", text: "entry into this Agreement shall not violate any material judgment, statute, rule or regulation applicable to the Company under the applicable laws; and" },
          { ref: "(f)", text: "there is no action, suit, investigation or proceeding pending against or threatened against or affecting it before any arbitrator or any governmental authority which in any manner challenges or seeks to prevent, enjoin, alter or materially delay the transactions contemplated under this Agreement." },
        ],
      },
      { id: "warranties_given", title: "Warranties", question: "IA12 / IA12a", text: "**{{warranty_heading}}.** {{warranty_lead}} to the Investor that, as at the date of this Agreement, each and every Warranty set out in Schedule 4 (Representations and Warranties) is true, accurate and not misleading." },
      {
        id: "qualifications",
        title: "Qualifications",
        text: "**Qualifications.** The Warranties set out in Schedule 4 (Representations and Warranties) are subject to the following qualifications:",
        subs: [
          { ref: "(a)", text: "the Warranties are qualified by the facts and circumstances fairly disclosed to the Investor in writing before the date of this Agreement and subject to any exceptions expressly provided for under this Agreement;" },
          { ref: "(b)", text: "any Warranty qualified by the Warrantors' awareness, the expression \"so far as the Warrantors are aware\" or any similar expression shall, unless otherwise stated, be deemed to refer to the actual knowledge of the Warrantors; and" },
          { ref: "(c)", text: "each Warranty is to be construed independently and (except where this Agreement provides otherwise) is not limited by any provision of this Agreement or another Warranty." },
        ],
      },
      {
        id: "investor_warranties",
        title: "Investor's Representations and Warranties",
        text: "**Investor's Representations and Warranties.** The Investor represents and warrants to the Company that, as at the date of this Agreement and as at Completion:",
        subs: [
          { ref: "(a)", id: "iw_company", text: "the Investor is a corporation duly incorporated and validly existing under the laws of the applicable jurisdiction, and the Investor has full power and authority to enter into and perform the obligations under this Agreement which when executed will constitute valid and binding obligations of the Investor in accordance with its terms;" },
          { ref: "(a)", id: "iw_individual", fd: true, text: "the Investor is of full age and capacity, is not bankrupt, and has full power and authority to enter into and perform the obligations under this Agreement which when executed will constitute valid and binding obligations of the Investor in accordance with its terms;" },
          { ref: "(b)", text: "this Agreement has been executed and constitutes a valid and legally binding obligation on the Investor, enforceable against such party in accordance with its terms;" },
          {
            ref: "(c)",
            id: "iw_no_breach",
            text: "the execution and delivery of, and the performance by it of its obligations under, this Agreement shall not:",
            subs: [
              { ref: "(i)", id: "iw_constitution", text: "result in a breach of its constitution (or the equivalent constitutional documents);" },
              { ref: "(ii)", text: "result in a breach of any applicable laws by which it or its assets are bound; or" },
              { ref: "(iii)", text: "result in any breach or violation of any of the terms and conditions of, or constitute (with or without notice or lapse of time or both) a default under, or result in the termination, modification or acceleration of, any material contract to which the Investor is a party or by which it or any of its assets or properties is bound;" },
            ],
          },
          { ref: "(d)", text: "there is no action, suit, investigation or proceeding pending against or threatened against or affecting the Investor before any arbitrator or any governmental authority which in any manner challenges or seeks to prevent, enjoin, alter or materially delay the transactions contemplated under this Agreement; and" },
          { ref: "(e)", text: "the Investor has either obtained independent advice on the investment in the Company pursuant to this Agreement or chose to enter into this Agreement without seeking independent advice. In particular, the Investor acknowledges the risks involved in investing in the securities of private companies and acknowledges that such party is qualified to evaluate the merits and risks of the investment under this Agreement." },
        ],
      },
    ],
  },
  {
    id: "limitation",
    heading: "LIMITATION OF LIABILITY",
    clauses: [
      { id: "time_limit", title: "Time Limit for Claims", question: "IA13", text: "**Time Limit for Claims.** In respect of {{section:warranties}}, {{claim_parties}} shall have no obligation to the Investor in respect of any {{claim_word}} unless written notice of that claim is given to the Company within {{claims_period}} of the date of this Agreement." },
      { id: "company_cap", title: "Limitation of Claims", text: "{{company_cap_text}}", subs: [
        { ref: "(a)", id: "cc_law", text: "if such breach occurs by reason of any matter which would not have arisen but for the passing of, or any change in, after the date of this Agreement, any law not actually or prospectively in effect at the date of this Agreement or by reason of any change to any Taxing Authority's taxing practice occurring after the date of this Agreement;" },
        { ref: "(b)", id: "cc_accounting", text: "to the extent that such breach arises as a result of any change in the accounting policy, bases or practice of the Company introduced or having effect after the date of this Agreement (unless such changes are required to correct errors or because relevant generally accepted accounting principles have not been complied with);" },
        { ref: "(c)", id: "cc_approval", text: "to the extent the claim arises from any act or omission that was made with the prior written approval of the Investor or at the Investor's direction;" },
        { ref: "(d)", id: "cc_disclosed", text: "to the extent the claim arises from any matters, facts and/or circumstances that have been disclosed by the Company and/or the Founders to the Investor prior to the date of this Agreement and/or if the Investor should have reasonable awareness and/or knowledge in respect of the same; and" },
        { ref: "(e)", id: "cc_permitted", text: "to the extent the claim arises from any act or omission that was expressly permitted by the Transaction Documents or any other document contemplated by it." },
      ] },
      {
        id: "founder_cap",
        title: "Founders' Liability",
        question: "IA14",
        text: "**Founders' Liability.** Each Founder's aggregate liability to the Investor arising in connection with this Agreement shall be limited to {{founder_cap}}. Each Founder shall not be liable in respect of any breach of any Warranty:",
        subs: [
          { ref: "(a)", text: "if such breach occurs by reason of any matter which would not have arisen but for the passing of, or any change in, after the date of this Agreement, any law not actually or prospectively in effect at the date of this Agreement or by reason of any change to any Taxing Authority's taxing practice occurring after the date of this Agreement;" },
          { ref: "(b)", text: "to the extent that such breach arises as a result of any change in the accounting policy, bases or practice of the Company introduced or having effect after the date of this Agreement (unless such changes are required to correct errors or because relevant generally accepted accounting principles have not been complied with);" },
          { ref: "(c)", text: "to the extent the claim arises from any act or omission that was made with the prior written approval of the Investor or at the Investor's direction;" },
          { ref: "(d)", text: "to the extent that such breach arose unknowingly and/or unintentionally, or such breach is cured by the Company and/or the Founders within one (1) month of the Investor's request;" },
          { ref: "(e)", text: "to the extent the claim arises from any matters, facts and/or circumstances that have been disclosed by the Company and/or the Founders to the Investor prior to the date of this Agreement and/or if the Investor should have reasonable awareness and/or knowledge in respect of the same; and" },
          { ref: "(f)", text: "to the extent the claim arises from any act or omission that was expressly permitted by the Transaction Documents or any other document contemplated by it," },
        ],
        tail: "provided that the limitations in this Clause shall not apply in respect of a claim arising as a result of any fraud, wilful default, or gross negligence on the part of such Founder.",
      },
      { id: "double_recovery", title: "No Double Recovery", text: "**No Double Recovery.** The Investor may not recover from the Company and/or the Founders in respect of a Claim under this Agreement more than once for the same loss." },
      { id: "mitigation", title: "Duty to Mitigate Loss", text: "**Duty to Mitigate Loss.** Nothing in this Agreement shall prejudice the Investor's common law duty to mitigate any loss suffered by it as a result of a breach of a Warranty and which is the subject of a Claim." },
      {
        id: "special_damages",
        title: "No Special Damages",
        text: "**No Special Damages.** Subject to {{clause:company_cap}} above, to the maximum extent permissible by the applicable laws, neither Party shall be liable to the other Party for any indirect, incidental, consequential or special damages suffered by the other Party, including without limitation damages for harm to business, lost revenues, lost savings or lost profits suffered by such Party, regardless of the form of action, whether in contract, warranty, strict liability or tort, including without limitation negligence of any kind whether active or passive and regardless of whether the Parties knew of the possibility that such damages could result. Each Party hereby releases the other Party (and their respective officers, directors, employees and agents) from any such claim.",
      },
    ],
  },
  {
    id: "undertakings",
    heading: "INVESTOR UNDERTAKINGS",
    clauses: [
      { id: "safe_ack", title: "Acknowledgement", question: "IA10", text: "**Acknowledgement.** The Parties agree and acknowledge that the investment contemplated under this Agreement shall constitute an \"Equity Financing\" for the purposes of the Investor SAFE, pursuant to which the Investor SAFE will be converted in accordance with the terms set out therein as well as the Investor SAFE Conversion Notice." },
      {
        id: "transaction_docs",
        title: "Entry into Transaction Documents",
        text: "**Entry into Transaction Documents.** Where requested by the Board, the Investor undertakes to procure the delivery, whether electronically or otherwise, of {{docs_list}} and such other ancillary documents duly executed by the Investor (either via DocuSign or otherwise){{led_by}}.",
      },
      {
        id: "covenants",
        title: "Investor Covenants",
        question: "IA15",
        text: "**Investor Covenants.** The Investor acknowledges and agrees that:",
        subs: [
          { ref: "(a)", text: "the Subscription Shares or any rights or interests therein shall not be, directly or indirectly, transferred, mortgaged, charged, assigned, pledged, liened, hypothecated, used as security interest, for title retention or any other security agreement or arrangement, or otherwise encumbered in whole or in part in any way whatsoever, {{transfer_exception}}; and" },
          { ref: "(b)", text: "{{transfer_rule}}" },
        ],
      },
      {
        id: "acknowledgements",
        title: "Investor Acknowledgements",
        question: "IA15",
        text: "**Investor Acknowledgements.** The Investor acknowledges and agrees that{{subject_to_sha}}:",
        subs: [
          { ref: "(a)", id: "ia_esop", text: "the Company may implement an employee share option plan (the \"**ESOP**\") in respect of the Company from time to time and the Investor shall not in any way prohibit or restrict the Company from implementing the ESOP. To the extent required, the Investor shall sign all documents and/or resolutions that may be required in connection with the implementation of the ESOP;" },
          { ref: "(b)", id: "ia_other_terms", text: "the Company is currently in the process of obtaining investments from more than one party{{including_lead}}, and the Investor acknowledges and agrees that the terms of such investment agreements may not be similar to the terms of this Agreement, and in any event the Board has the sole discretion to, from time to time, enter into such investment agreements on terms that the Board sees fit;" },
          { ref: "(c)", id: "ia_fundraising", text: "the Company will, in its discretion, engage in further Fundraising Exercises concurrently with or subsequent to the issuance of Subscription Shares under this Agreement and the Investor shall not in any way prohibit or restrict the Company from carrying out such Fundraising Exercises, other than in accordance with the terms of this Agreement. To the extent required, the Investor shall sign all documents and/or resolutions that may be required in connection with the Fundraising Exercise; and" },
          { ref: "(d)", id: "ia_liquidity", text: "subject to the Investor's rights under this Agreement, upon the occurrence of a Liquidity Event, the Investor shall transfer the Subscription Shares in accordance with the same or similar economic terms as that ascribed to other shareholders of the Company." },
        ],
      },
      { id: "non_disparagement", title: "Non-Disparagement", question: "IA15", text: "**Non-Disparagement.** The Investor agrees that the Investor shall not directly or indirectly, in any manner (orally or in writing) make or publish any statement that would libel, slander, disparage, denigrate, ridicule or criticise the Company, the founder(s) of the Company, or their respective employees, officers or directors." },
    ],
  },
  {
    id: "confidentiality",
    heading: "CONFIDENTIALITY",
    clauses: [
      {
        id: "conf_info",
        title: "Confidential Information",
        text: "**Confidential Information.** The Company's confidential information includes the Company's materials, benefits, and any information, whether orally, in writing, electronically or in other tangible form (including, but not limited to, business plans, products, customers, vendors, trade secret processes or methodologies, software, documentation and other proprietary rights or information), that the Investor has access to under this Agreement or relating to all or any part of the business, property, assets, technology, activities, services, financial affairs, management and administration of the Company, including but not limited to trade secrets, business secrets, know-how, adaptations, discoveries, methods, formulae, processes, inventions and other technical information relating to the creation, production or supply of any past, present or future product or service of the Company as well as information that the Company may consider to be of value to it or to be detrimental to itself if disclosed (the \"**Confidential Information**\").",
      },
      { id: "conf_obligation", title: "Confidentiality Obligation", text: "**Confidentiality Obligation.** During the term and after the termination of this Agreement, the Investor shall adopt the highest standard of professional care to keep confidential and prevent the disclosure, whether directly or indirectly, of all Confidential Information and agrees that such Confidential Information shall at all times remain the property of the Company. The Investor shall take all security precautions to prevent the disclosure of Confidential Information and shall not modify, decompile, create other work forms, or disassemble any information contained in the Confidential Information without the prior written consent of the Company." },
      {
        id: "conf_exceptions",
        title: "Exceptions to Confidentiality",
        text: "**Exceptions to Confidentiality.** The restrictions in {{clause:conf_obligation}} do not apply to:",
        subs: [
          { ref: "(a)", text: "any use or disclosure authorised by the Company in writing or as required by law; and" },
          { ref: "(b)", text: "any information which is already in, or comes into, the public domain otherwise than through the Investor's unauthorised disclosure." },
        ],
      },
      { id: "conf_survival", title: "Surviving Obligations", text: "**Surviving Obligations.** All rights and obligations under this {{section:confidentiality}} shall continue after the termination of this Agreement." },
    ],
  },
  {
    id: "general",
    heading: "GENERAL",
    clauses: [
      { id: "personal_data", title: "Personal Data", text: "**Personal Data.** For the purposes of this Clause, \"personal data\" shall have the meaning given to it in the Personal Data Protection Act 2012 of Singapore, including but not limited to name, address, references, bank details and any other personal information that may be collected in connection with the administration of the transactions contemplated under this Agreement. The Investor acknowledges and agrees that the Company and its affiliates, by themselves or through third parties, will process, disclose and if necessary, transfer personal data to third parties for administration and management purposes in connection with the transactions contemplated under this Agreement and such other purposes reasonably necessary in connection with the business of the Company. By signing this Agreement, the Investor expressly consents to such processing, disclosure and transfer." },
      { id: "invalidity", title: "Partial Invalidity", text: "**Partial Invalidity.** If at any time, any provision of this Agreement is or becomes illegal, invalid, or unenforceable in any respect under any law of any jurisdiction, neither the legality, validity or enforceability of the remaining provisions nor the legality, validity or enforceability of such provision under the law of any other jurisdiction will in any way be affected or impaired." },
      { id: "notices", title: "Notices", text: "**Notices.** All notices and communications given under this Agreement must be in writing and in English, and will be delivered personally, sent by post, or sent by email, to the recorded addresses or email addresses of the Parties as described in this Agreement, or as amended by the Parties' change of circumstances. The primary mode of communication shall be via email." },
      { id: "assignment", title: "Assignment", text: "{{assignment_text}}" },
      { id: "entire", title: "Entire Agreement", text: "**Entire Agreement.** This Agreement contains all the terms, representations and warranties made between the Parties relating to the matters dealt with in this Agreement and supersedes and cancels all prior discussions and agreements covering the subject matter of this Agreement. The Parties have not relied on any representation, warranty or agreement relating to the subject matter of this Agreement that is not expressly set out in this Agreement, and no such representation, warranty or agreement has any effect from the date of this Agreement." },
      { id: "further_assurances", title: "Further Assurances", text: "**Further Assurances.** The Parties must each sign all further documents, pass all resolutions and do all further things as may be necessary or desirable to give effect to this Agreement{{further_docs}}." },
      { id: "amendments", title: "Amendments or Extensions", text: "**Amendments or Extensions.** Any amendments or extensions to this Agreement must be made in writing with the unanimous agreement of all Parties and are subject to the written approval of the Shareholders holding more than seventy-five per cent. (75%) of the issued share capital of the Company." },
      { id: "waiver_general", title: "Waiver", text: "**Waiver.** Except for waivers pursuant to {{section:limitation}}, no exercise or failure to exercise or delay in exercising any right or remedy will constitute a waiver by that Party of that or any other right or remedy available to it." },
      { id: "costs", title: "Costs", text: "**Costs.** Except as otherwise provided in this Agreement, the Parties will meet their own costs relating to the negotiation, preparation and implementation of this Agreement." },
      { id: "precedence", title: "Precedence", question: "IA6", text: "**Precedence.** In the event of any conflict and/or inconsistency between the terms set out herein and the terms of the Shareholders' Agreement, the Parties agree and acknowledge that the terms set out in the Shareholders' Agreement shall take precedence and prevail." },
      { id: "counterparts", title: "Counterparts", text: "**Counterparts.** This Agreement may be signed in any number of counterparts, all of which taken together shall constitute one and the same instrument. Any Party may enter into this Agreement by signing any such counterpart and each counterpart shall be as valid and effectual as if executed as an original." },
      {
        id: "third_parties",
        title: "Contracts (Rights of Third Parties) Act",
        text: "**Contracts (Rights of Third Parties) Act.**",
        subs: [
          { ref: "(a)", text: "Unless expressly provided to the contrary in this Agreement, a person who is not a Party has no right under the Contracts (Rights of Third Parties) Act 2001 of Singapore to enforce or enjoy the benefit of any term of this Agreement." },
          { ref: "(b)", text: "Notwithstanding any term of this Agreement, the consent of any person who is not a Party is not required to rescind or vary this Agreement." },
        ],
      },
      { id: "governing_law", title: "Governing Law", text: "**Governing Law.** This Agreement shall be governed by, and construed in accordance with, the laws of Singapore." },
      {
        id: "disputes",
        title: "Dispute Resolution",
        text: "**Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "If any dispute, controversy, or claim arises out of or relating to this Agreement, or to the interpretation, breach, termination or validity of this Agreement, the Parties must use their best efforts to resolve such dispute through consultation or mediation. The consultation or mediation between the Parties must begin as soon as practicable after one disputing Party has delivered to the other disputing Party a written notice setting out the matter of the dispute." },
          { ref: "(b)", text: "If such dispute is not settled within thirty (30) days after the date of the relevant dispute notice referred to above, the dispute must be referred to and resolved by arbitration in Singapore in accordance with the Rules of the Singapore International Arbitration Centre (\"**SIAC Rules**\" and \"**SIAC**\" respectively). The tribunal will consist of one arbitrator, to be appointed by the President of the SIAC. The language of the arbitration will be English." },
        ],
      },
    ],
  },
];

export const EXECUTED = "This Agreement has been executed on the date shown on the first page.";

/* ── Schedule 4 (lead investor): the fifteen warranties of sample B ───── */

export const WARRANTIES: { title: string; text: string; subs?: string[] }[] = [
  { title: "Existence, Authority and Entitlement", text: "The Company has all requisite legal authority and entitlement necessary for the execution and performance of this Agreement. There is no violation of any law or contract, or breach of any obligation, which may restrict or impede the execution and performance hereof; and no litigation, arbitration, investigation or other legal proceeding has been instituted, and no judgment, decree or order restricting or impeding the exercise of any right hereunder has been entered against the Company, and, to the best knowledge of the Company, no litigation of such kind is being threatened or anticipated to be forthcoming. The Company has duly obtained and holds the necessary governmental approvals and permits and/or the third party's consents necessary or required for the execution and performance of this Agreement." },
  { title: "Incorporation and Existence of the Company", text: "The Company has been lawfully established and is validly existing. The Company has been lawfully operating its business, and is duly empowered and entitled to own and use the properties in its possession. It has duly obtained and holds the necessary governmental approvals and permits, and has not done any act which might result in the cancellation or suspension thereof, and, so far as the Warrantors are aware, such act or fact has not been alleged. The Company is not involved in bankruptcy, reorganisation, workout, liquidation or similar procedures, and there is no cause to initiate such procedures." },
  { title: "Capital Structure", text: "The share capital of the Company is as set out in Part 1 and Part 2 of Schedule 3. Except for the matters prescribed in this Agreement and set out in Schedule 3, all issued and outstanding shares of the Company have been duly and effectively issued and paid in full. As of the execution date of this Agreement, except for the matters prescribed in this Agreement and set out in Schedule 3, the Company has not issued or granted convertible bonds, bonds with warrants, exchangeable bonds, stock options, or any other securities or rights that may be converted into or exchanged for shares of the Company (collectively, the \"**Equity Securities**\"), nor has it granted or promised to grant pre-emptive rights or similar rights to demand the issuance of stocks or Equity Securities. The Company has no obligation to repurchase or redeem any shares of the Company or to refund any capital contribution. There are no rights of any third party to acquire the Subscription Shares and there are no agreements restricting the exercise of voting rights in respect of the Subscription Shares." },
  { title: "Financial Status", text: "The Company's financial statements and/or management accounts have been properly prepared by consistently applying the standards under the applicable laws and the generally accepted accounting principles under the applicable laws, and accurately and duly reflect the financial status, operation results, and cash flows of the Company. Other than in the ordinary course of business and as reflected in the financial statements and/or management accounts, the Company has no additional debts, liabilities or obligations (including unconfirmed, off-balance-sheet or contingent liabilities). Moreover, the Company has not provided any direct or indirect guarantee or security for the obligations of the shareholders, officers, employees, or third parties." },
  { title: "Solvency", text: "The Company is not in a position of being unable to pay off or repay debts due to financial difficulties. The Company is not involved in any reorganisation, bankruptcy, liquidation or similar proceedings for the reduction or adjustment of the Company's debts/liabilities, and after the execution date hereof such proceedings have not been initiated by the Company or any third party, and there are no causes to anticipate that such proceedings will commence." },
  {
    title: "Early Stage Development",
    text: "The Company is an early stage company in its developmental stage. So far as the Warrantors are aware:",
    subs: [
      "the Company has conducted its business in normal manner within the scope of ordinary business activities;",
      "the Company has complied with all applicable laws and regulations in the course of its business;",
      "there is no transaction or act that may result in a breach of the representations, warranties, confirmations, and obligations under this Agreement; and",
      "there is no act causing a change in the corporate and capital structure of the Company, creating any security interest over its assets, acquiring assets out of the ordinary course of business, executing or amending important agreements, engaging in donations, loans and guarantees to third parties, entering into new business, or pursuing any amendment to the Constitution and other important internal regulations.",
    ],
  },
  { title: "Compliance, Litigation and Disputes", text: "In all material respects, the Company has complied with the internal rules, laws, regulations, conditions to licences/permits, and orders applying to the ownership and use of its properties, business activities, products, or services, and there are no material breaches, defaults, or disputes related thereto. The Company has not been aware of or received any notice of any judicial or administrative proceedings, including any pending or continuing litigation, petition, arbitration, investigation or inquiry, against the Company, its officers and employees or any property of the Company. The Company has not received any judgment or order that would, if executed, materially and adversely affect the business, financial status, assets, and performance of the Company." },
  { title: "Agreements", text: "With respect to agreements to which the Company is a party, each agreement is duly executed, binding on the Company and the other party thereto and consistent with applicable laws and regulations. The Company is entitled to fully and effectively exercise its rights under each agreement, and has not materially breached any agreement to which it is a party, and there are no events or actions constituting a default by the Company under any agreement." },
  { title: "Transactions with Interested Persons", text: "Save as disclosed in writing to the Investor before the date of this Agreement, the Company has not engaged in any transaction (for goods and services, financial transactions, and all other types of transactions incurring debt) with its shareholders, officers, employees, affiliated companies, or any other specially related parties; and all such transactions have been executed on fair terms between independent parties." },
  { title: "Intellectual Property Rights", text: "The Company has the sole ownership of or lawful right to use any intellectual property necessary for the performance of the business operation. No intellectual property rights owned by the Company are subject to any encumbrance and, to its best knowledge, there exists no cause or event which would invalidate or revoke such intellectual property rights. The Company is not in infringement of a third party's intellectual property rights, and has not received any notice stating that it has infringed a third party's intellectual property right. With respect to any of the Company's intellectual property rights that constitute employee invention, the Company has lawfully succeeded to the rights of the inventor in accordance with applicable laws, and has paid reasonable compensation to the inventor." },
  { title: "Personnel and Labour Affairs", text: "The Company is in compliance with labour laws and labour contracts, and is duly performing all duties and obligations arising therefrom. There are no labour disputes that have not been concluded or resolved. All payments to the officers and employees of the Company, including wages, severance pay and legal allowances, have been lawfully made in accordance with the relevant laws and regulations, and the liabilities relating thereto have been properly reflected in the financial statements, and no compensation remains unpaid. The Company has not committed any promises, guarantees, or agreements to the officers and employees for wage increases or other benefits that are not provided for in the employment rules or the employment contracts, and there are no pending or threatened strikes or labour disputes against the Company. There are no civil actions or criminal accusations or charges relating to the employment or dismissal by the Company and, to its best knowledge, there is no cause or event that raises concerns of such actions." },
  { title: "Assets", text: "All assets that are being used or held for the business are lawfully owned by or licensed to the Company; and there are no causes impeding such ownership or licence to use." },
  { title: "Taxes", text: "The Company has duly filed all tax returns and reports, as required by the laws, and such tax returns are true and accurate. The Company has timely paid all taxes that are levied under the relevant laws. There are no pending tax investigations, other administrative or judicial proceedings or disputes relating to any taxes for which the Company is responsible." },
  { title: "Books and Records", text: "The Company's books and records accurately reflect the official status of the Company in all material respects since its establishment. All general meetings of shareholders and board meetings of the Company have been held in accordance with the Constitution and applicable laws and regulations." },
  { title: "Full Disclosure", text: "So far as the Warrantors are aware, the representations and warranties of the Company contained in other provisions of this Agreement do not contain any false statement, nor omit any material fact, nor have any loophole in reasonable interpretation. So far as the Warrantors are aware, the Company has provided the Investor with complete, true and accurate materials, documents and information regarding all material facts on the Company, including those necessary to determine whether or not to execute the transaction contemplated herein." },
];

/* ── the preference share terms ──────────────────────────────────────── */

export interface TermsPara {
  id?: string;
  heading?: string;
  text?: string;
  subs?: string[];
  tail?: string;
  fd?: boolean;
}

export const PREF_TERMS: TermsPara[] = [
  { heading: "Dividend Rights" },
  { text: "Holders of the {{class}} shall have the same dividend rights as holders of Ordinary Shares on a pari passu basis." },
  { text: "Any dividends declared by the Company shall be paid on the {{class}} concurrently with the payment of any dividend on Ordinary Shares of the Company." },
  { id: "lp", heading: "Liquidation Preference" },
  {
    id: "lp",
    text: "Upon the occurrence of any voluntary or involuntary liquidation, dissolution or winding up of the Company or a Liquidity Event, out of the assets and funds available for distribution, the proceeds from such liquidation, dissolution or winding up or Liquidity Event (\"**Liquidation Proceeds**\") shall first be distributed to the holders of {{class}}, in priority to all other classes of shares (save for any class ranking pari passu with the {{class}} under the Constitution), such that each holder of {{class}} receives an amount which is the higher of the following (\"**Liquidation Preference**\"):",
    subs: [
      "an amount which is equal to one-time (1x) of the Investment Amount paid for the {{class}}; or",
      "the proceeds calculated pro rata to the shareholding of the holder of {{class}} on an as-converted basis immediately prior to the occurrence of the Liquidity Event,",
    ],
    tail: "and any remaining Liquidation Proceeds after distribution in accordance with the foregoing shall be distributed to the holders of Ordinary Shares on a pro rata basis.",
  },
  { id: "lp", text: "In the event that the Liquidation Proceeds are insufficient to satisfy the Liquidation Preference, the entire Liquidation Proceeds shall be distributed to the holders of {{class}} in as close a proportion to the Liquidation Preference (as calculated among the holders of {{class}}) as possible, on a pro rata basis." },
  { id: "lp_none", heading: "Return of Capital", fd: true },
  { id: "lp_none", fd: true, text: "On a liquidation, dissolution or winding up of the Company or a Liquidity Event, the holders of {{class}} shall participate in the assets and funds available for distribution pari passu with the holders of Ordinary Shares, pro rata to their shareholdings on an as-converted basis." },
  { heading: "Voting Rights" },
  { id: "vote_as_converted", text: "Each {{class_holder}} shall carry the same rights as a holder of Ordinary Shares, including, for all purposes in any general meeting of the Company, having the same voting rights as the holders of Ordinary Shares." },
  { id: "vote_as_converted", text: "The {{class_holder}}s shall be entitled to receive notices of, and attend, speak and vote at, any meetings of the members, and shall further be entitled to receive notices of, and attend and speak at, any class meetings of the holders of the Ordinary Shares." },
  { id: "vote_as_converted_conv", text: "The holder of the {{class}} shall have one (1) vote for every Ordinary Share into which the {{class}} it holds are convertible pursuant to the provisions of this Schedule." },
  { id: "vote_non", text: "Subject to the provisions of the Act and the Constitution, and except as provided below, {{class}} shall be non-voting shares and {{class_holder}}s shall not be entitled to vote at general meetings of the Company." },
  { id: "vote_non", text: "The {{class_holder}}s shall be entitled to attend and vote at class meetings of the {{class_holder}}s. Every {{class_holder}} who is present in person at such class meetings shall have on a show of hands one (1) vote and on a poll one (1) vote for every {{class_singular}} of which such {{class_holder}} is the holder. The holders of {{class}} then outstanding are entitled to receive notice of, and to attend and speak at, general meetings of the Company, and to receive a copy of any written resolution circulated to eligible members on the circulation date in accordance with the Act." },
  { id: "transfer", heading: "Transferability" },
  { id: "transfer", text: "{{transfer_subject}}each of the {{class_holder}}s shall not sell, transfer, grant any option over, or otherwise dispose of, any {{class}} or other direct or indirect interests in the Company, save with the prior written approval of the Board or in accordance with any agreement entered into among the members of the Company from time to time." },
  { id: "transfer", text: "Each of the {{class_holder}}s shall not create or permit to subsist any mortgage, charge, pledge, lien or other encumbrance of any nature whatsoever over any {{class}} held by such {{class_holder}} without the prior written consent of the holders of a majority of the Ordinary Shares (such consent not to be unreasonably withheld)." },
  { heading: "Variation of Rights" },
  { text: "The class rights attaching to the {{class}} may be varied or abrogated either with the consent in writing of at least seventy-five per cent. (75%) of the total voting rights of the {{class_holder}}s who would have been entitled to vote at a separate meeting of the holders of {{class}} or with the sanction of a special resolution passed at a separate class meeting of the holders of {{class}}." },
  { heading: "Adjustments" },
  { text: "Appropriate adjustments will be made in the event of any subdivision of shares, by any split, dividend, distribution, reclassification, recapitalisation or otherwise, or consolidation of shares, by reverse split, reclassification, recapitalisation or otherwise, such that the percentage of shares constituted by the {{class}} immediately prior to the occurrence of such event shall, to the maximum extent practicable, remain unchanged immediately following such event." },
  { id: "conv", heading: "Convertibility" },
  { id: "conv", text: "At any time, any {{class_holder}} may, but shall not be obliged to, convert all or some only of its {{class}} into Ordinary Shares (which shall rank pari passu in all respects with any existing Ordinary Shares) at the conversion price set out in this Schedule (as adjusted from time to time) by delivering to the Company a notice in writing of its intention (a \"**Share Conversion Notice**\") together with the share certificate(s) in respect of the {{class}}." },
  {
    id: "conv",
    text: "The Company shall within one (1) month after the date of receipt of the Share Conversion Notice from a {{class_holder}} forthwith:",
    subs: [
      "allot and issue to the {{class_holder}} (or as it may direct), the Ordinary Shares (credited as fully paid up) to which the {{class_holder}} is entitled by way of conversion; and",
      "forward the properly and validly issued share certificate for the relevant Ordinary Shares to the {{class_holder}}.",
    ],
  },
  { id: "conv", text: "The {{class}} shall on conversion be cancelled with effect from the date of issuance of the relevant Ordinary Shares." },
  { id: "conv_basic", fd: true, text: "The number of Ordinary Shares to be issued on conversion of the {{class}} shall be calculated on a 1:1 basis (the \"**Conversion Price**\" being the Subscription Price), as adjusted in accordance with the paragraph headed \"Adjustments\" above." },
  { id: "conv_ratchet", text: "The number of Ordinary Shares to be issued on conversion of the {{class}} and the conversion price shall be calculated on a 1:1 basis (the \"**Conversion Price**\") provided that if, prior to the conversion of the {{class}}, the Company issues new shares in a paid-in capital increase or stock-related bonds (convertible bonds, bonds with warrants and other types of bonds that can be converted to stock) at an issue price below the Conversion Price, then the Conversion Price shall be adjusted to such lower issue price." },
  { id: "conv_ratchet", text: "The Conversion Price may from time to time be adjusted in accordance with the directions of the Board in the event of share dividends, share splits, share reductions, re-capitalisations, sub-divisions, combinations, bonus shares and other changes in the capital structure of the Company, including a merger or consolidation, so as to maintain the proportionate conversion rights of the {{class_holder}}s." },
  { id: "conv_ratchet", text: "In the event the Company merges with another company, if the valuation price for the calculation of the exchange ratio is lower than the then Conversion Price, the Conversion Price shall be adjusted based on such valuation." },
  { id: "conv_ratchet", text: "If an amount equal to seventy per cent. (70%) of the IPO subscription unit price is lower than the then Conversion Price, the conversion ratio shall be adjusted as follows: number of Ordinary Shares converted per {{class_singular}} after adjustment = number of Ordinary Shares converted per {{class_singular}} before adjustment x Conversion Price / an amount equal to seventy per cent. (70%) of the Company's IPO subscription unit price." },
  { id: "conv", text: "No fractional Ordinary Shares shall be issued upon conversion of the {{class}}. All Ordinary Shares (including fractions thereof) issuable upon conversion of the {{class}} by a holder thereof shall be aggregated for purposes of determining whether the conversion would result in the issuance of any fractional share, and shall, where applicable, be rounded to the nearest whole number, in accordance with the discretion of the Board." },
];

/* ── for the admin page ──────────────────────────────────────────────── */

export const ADAPTATIONS: { where: string; change: string }[] = [
  { where: "Parties", change: "Sample B names the lead investor; here \"the Investor\", read as \"the Lead Investor\" when IA1 is lead. An individual investor is allowed (FD wording for its capacity warranty)." },
  { where: "Investment Amount", change: "Amounts and share numbers come from the investor box, in S$ or US$; the subscription price is worked out." },
  { where: "Terms / preference share schedule", change: "Generalised from \"Seed Preference Shares\" (A) and \"Pre-Series A Preference Shares\" (B) to the class named in IA3a; the reference to an earlier class ranking pari passu is generalised to \"any class ranking pari passu under the Constitution\"." },
  { where: "Long-stop date", change: "Sample B used a fixed date; here 1–3 months after signing (default 2)." },
  { where: "Completion Date (sample A)", change: "Was \"[to discuss completion date]\"; here on signing, or a date typed in IA4a." },
  { where: "Warranty qualifications", change: "\"fairly disclosed in the Disclosure Letter (if any)\" → \"fairly disclosed in writing before the date of this Agreement\": there is no disclosure letter step." },
  { where: "Schedule 4 footnotes", change: "Client-specific footnotes on SAFEs and a related-party disclosure removed; \"save as disclosed\" now refers to written disclosure before signing." },
  { where: "Investor Covenants (A)", change: "Paragraph (a) barred every transfer while (b) allowed transfers under the shareholders' agreement; (a) now reads \"save for a transfer permitted under paragraph (b)\". Without a shareholders' agreement, (b) allows transfers with Board approval (FD)." },
  { where: "Company's Obligations on Completion", change: "Sample B's fuller list is used for both shapes (sample A had the same steps in fewer words); the nominee director and the Amended Constitution limbs follow IA7 and IA8." },
  { where: "Lead investor — Investor Undertakings", change: "Sample B had only Non-Disparagement; the other undertakings can be added from sample A (IA15l)." },
  { where: "Personal Data (sample A)", change: "Three clauses combined into one; the list of personal data shortened (no salary or stock options — the investor is not an employee)." },
];

export const CORRECTIONS: { where: string; was: string; now: string }[] = [
  { where: "Definition of Warrantor (B)", was: "\"Warrantor\" means the Company — while the Founders also give the warranties", now: "\"Warrantors\" means the Company and each of the Founders (or the Company only, per IA12)" },
  { where: "Right of Waiver (B)", was: "the Lead Investor shall together have the right", now: "the Investor shall have the right" },
  { where: "Company warranties (A) (b)", was: "valid and binding obligations in it", now: "on it" },
  { where: "Limitation (A)", was: "the Company and its founder(s) shall have no obligation — founders not parties", now: "the Company shall have no obligation" },
  { where: "Investor Undertakings (A)", was: "the negotiation pursuant thereto will be lead by", now: "led by" },
  { where: "Breach of Completion Obligations", was: "are not fully satisfied with by the Company", now: "are not fully satisfied by the Company" },
  { where: "Schedule 4 para 5 (B)", was: "such proceedings has not been initiated", now: "have not been initiated" },
];
