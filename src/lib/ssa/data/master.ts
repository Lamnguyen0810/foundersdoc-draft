/**
 * Share Subscription Agreement — the wording FD AI assembles from.
 *
 * SOURCE. The firm's FD Lite SSA question bank sets out what each version
 * (Basic / Standard / Complex) contains, but no FD Lite SSA template could
 * be reached (#fdai-draft-ssa-investors, where the Template and Precs tabs
 * live, is not visible to FD AI's Slack connection). The wording is
 * therefore the Singapore VIMA Model Subscription Agreement (SVCA / SAL —
 * the industry model, in Slack as "VIMA - Model Subscription Agreement"),
 * simplified to the bank's three versions:
 *
 *   - a single company (no subsidiaries / "Group Companies"), ordinary or
 *     preference shares, no Series A share terms schedule, no disclosure
 *     letter (the bank: "No disclosure letter is required");
 *   - the bank's warranty lists (4 for Standard, 9 for Complex) taken from
 *     VIMA Schedule 4, paragraph for paragraph where VIMA has one;
 *   - VIMA leaves conditions and post-Completion undertakings blank
 *     ("[insert …]"): the bank's conditions and undertakings are written
 *     here in VIMA's style and marked `fd: true`.
 *
 * Written for one or more investors and founders ("the Investors", "each
 * Founder"); with one, the assembler reads it in the singular.
 *
 * Markup, as the SHA and SPA masters:
 *   {{field}}        fill in — anything unknown becomes [●] and is reported
 *   {{clause:id}}    "Clause 4.2" — worked out after numbering
 *   {{section:id}}   "Clause 4"
 *   **bold**         bold
 */

export const MASTER_VERSION = "SSA-V1";
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

export const TITLE = "SHARE SUBSCRIPTION AGREEMENT";
export const MADE_ON = "This Share Subscription Agreement (this \"**Agreement**\") is made on {{date}} among:";
export const PARTY_COMPANY_INVESTOR =
  "{{name}}, a company incorporated under the laws of {{jurisdiction}} with registration number {{id_no}} and having its registered office at {{address}}";
export const PARTY_INDIVIDUAL = "{{name}}, holder of identification number {{id_no}}, residing at {{address}}";
export const INVESTORS_COLLECTIVE = "(together the \"**Investors**\" and each an \"**Investor**\");";
export const FOUNDERS_COLLECTIVE = "(together the \"**Founders**\" and each a \"**Founder**\");";
export const COMPANY_PARTY =
  "{{company_name}} (Company Registration Number: {{company_reg_no}}), a company incorporated under the laws of Singapore whose registered office is at {{company_address}} (the \"**Company**\"),";
export const COMPANY_PARTY_TO_BE =
  "{{company_name}}, a company to be incorporated under the laws of Singapore (the \"**Company**\"),";
export const PARTIES_COLLECTIVE = "(collectively, the \"**Parties**\" and each, a \"**Party**\").";
export const WHEREAS = "Whereas:";
export const RECITAL_A = "The Company is a private company limited by shares. Further particulars of the Company are set out in Schedule 2.";
export const RECITAL_A_TO_BE = "The Company is to be incorporated in Singapore as a private company limited by shares before this Agreement is signed. Further particulars of the Company are set out in Schedule 2.";
export const RECITAL_B =
  "As at the date of this Agreement, the Company has an issued and paid-up share capital of {{issued_capital}} comprising {{issued_shares}} Ordinary Shares.";
export const RECITAL_C =
  "The Investors have agreed to subscribe for, and the Company has agreed to allot and issue to the Investors, the Subscription Shares on the terms and subject to the conditions of this Agreement.";
export const AGREED = "It is agreed as follows:";

/* ── the definitions ──────────────────────────────────────────────────── */

export interface Definition {
  term: string;
  text: string;
  when?: "warranties" | "conditions" | "constitution" | "sha" | "ip" | "representative" | "complex_warranties" | "preference";
}

export const DEFINITIONS: Definition[] = [
  { term: "Act", text: "means the Companies Act 1967 of Singapore;" },
  { term: "agreed form", when: "conditions", text: "means, in relation to a document, the form of that document agreed in writing between the Company and the Investors;" },
  { term: "Amended Constitution", when: "constitution", text: "means the amended and restated constitution of the Company in the agreed form;" },
  { term: "Board", text: "means the board of directors for the time being of the Company;" },
  { term: "Business", text: "means {{business}};" },
  { term: "Business Day", text: "means a day on which banks are open for business in Singapore (excluding Saturdays, Sundays or public holidays);" },
  { term: "Claim", when: "warranties", text: "means any claim for breach of any Warranty;" },
  { term: "Completion", text: "means completion of the subscription for, and the allotment and issue of, the Subscription Shares in accordance with {{section:completion}};" },
  { term: "Conditions", when: "conditions", text: "means the conditions set out in {{clause:cp}};" },
  { term: "Constitution", text: "means the constitution of the Company as may be amended, restated or replaced from time to time;" },
  {
    term: "Encumbrance",
    text: "means any mortgage, charge, security interest, lien, pledge, assignment by way of security, equity, claim, right of pre-emption, option, covenant, restriction, reservation, lease, trust, order, decree, judgment, title defect (including retention of title claim), conflicting claim of ownership or any other encumbrance of any nature whatsoever (whether or not perfected other than liens arising by operation of law);",
  },
  {
    term: "Intellectual Property",
    when: "ip",
    text: "means all intellectual property rights, whether registered or not, including pending applications for registration of such rights and the right to apply for registration or extension of such rights including patents, designs, copyright (including moral rights), database rights, trade marks, trading names, company names, service marks, logos, internet domain names, social media user names, rights in know-how and any rights of the same or similar effect or nature as any of the foregoing anywhere in the world;",
  },
  { term: "Investors' Representative", when: "representative", text: "has the meaning ascribed to it in {{clause:representative}};" },
  { term: "Long-Stop Date", when: "conditions", text: "has the meaning ascribed to it in {{clause:longstop}};" },
  { term: "Ordinary Shares", text: "means ordinary shares in the capital of the Company;" },
  { term: "Preference Shares", when: "preference", text: "means preference shares in the capital of the Company having the rights and restrictions set out in the Constitution;" },
  { term: "Registrar", text: "means the Registrar of Companies appointed under the Act;" },
  { term: "Shareholders' Agreement", when: "sha", text: "means the shareholders agreement in relation to the Company to be entered into on or before Completion among the Company, the Founders and the Investors;" },
  { term: "Shares", text: "means issued shares in the capital of the Company;" },
  { term: "S$", text: "means Singapore dollars, the lawful currency of Singapore;" },
  { term: "Subscription Consideration", text: "has the meaning ascribed to it in {{clause:subscription}};" },
  { term: "Subscription Shares", text: "means the {{total_shares}} new {{share_word}} to be allotted and issued to the Investors under this Agreement, as set out in Part 1 of Schedule 1;" },
  { term: "Warranties", when: "warranties", text: "means the warranties set out in Schedule 3, and \"Warranty\" means any one of them;" },
  { term: "Warrantors", when: "warranties", text: "means {{warrantors}}." },
];

export const INTERPRETATION_RULES: string[] = [
  "References to Clauses and Schedules are to clauses of and schedules to this Agreement, and the Schedules form part of this Agreement.",
  "Headings are for convenience only and do not affect the interpretation of this Agreement.",
  "Words in the singular include the plural and vice versa, and words importing a gender include every gender.",
  "References to a statute or statutory provision include that statute or provision as amended, consolidated or re-enacted from time to time.",
  "The words \"include\" and \"including\" are to be construed without limitation.",
];

/* ── the clauses ─────────────────────────────────────────────────────── */

export const SECTIONS: MasterSection[] = [
  {
    id: "interpretation",
    heading: "INTERPRETATION",
    clauses: [
      { id: "definitions", title: "Definitions", text: "**Definitions.** In this Agreement, unless the context otherwise requires:" },
      { id: "rules", title: "Interpretation", text: "**Interpretation.** In this Agreement, unless the context otherwise requires:" },
    ],
  },
  {
    id: "subscription",
    heading: "SUBSCRIPTION FOR AND ISSUANCE OF SUBSCRIPTION SHARES",
    clauses: [
      {
        id: "subscription",
        title: "Subscription",
        question: "SS5",
        text: "**Subscription.** Subject to the terms of this Agreement, each Investor agrees to subscribe for, and the Company agrees to allot and issue to such Investor, at Completion the number of Subscription Shares set opposite its name in Part 1 of Schedule 1, free from any Encumbrances, in consideration for the aggregate subscription price set opposite its name in Part 1 of Schedule 1 (its \"**Subscription Consideration**\").",
      },
      { id: "share_rights", title: "Ranking / Rights", question: "SS5", text: "{{share_rights_text}}" },
      {
        id: "founder_waiver",
        title: "Waiver of Pre-emption Rights",
        question: "SS3",
        text: "**Waiver of Pre-emption Rights.** Each Founder hereby irrevocably waives any and all pre-emption rights or rights of first refusal he may have, pursuant to the Constitution or otherwise, in relation to the allotment and issue of the Subscription Shares under this Agreement.",
      },
      {
        id: "several",
        title: "Several Obligations",
        question: "SS4",
        fd: true,
        text: "**Several Obligations.** The obligations of each Investor under this Agreement are several. No Investor shall be responsible for the obligations of any other Investor.",
      },
      {
        id: "representative",
        title: "Investors' Representative",
        question: "SS4a",
        fd: true,
        text: "**Investors' Representative.** Each Investor appoints {{representative}} (the \"**Investors' Representative**\") to act on its behalf for all purposes of this Agreement, including giving or receiving any consent, waiver or notice. The Company and the Founders may rely on any act of the Investors' Representative as the act of each Investor.",
      },
    ],
  },
  {
    id: "conditions",
    heading: "CONDITIONS",
    fd: true,
    clauses: [
      {
        id: "cp",
        title: "Conditions",
        question: "SS6a",
        text: "**Conditions.** Completion is conditional upon the following conditions being satisfied (or waived in accordance with {{clause:cp_waiver}}):",
        subs: [
          { ref: "(a)", id: "cp_shareholder_approval", text: "the passing of resolutions by the shareholders of the Company approving the allotment and issue of the Subscription Shares, and the waiver by every person entitled to it of any right of pre-emption or other right in respect of such allotment and issue;" },
          { ref: "(b)", id: "cp_board_approval", text: "the approval by the Board of the allotment and issue of the Subscription Shares and of the entry by the Company into this Agreement;" },
          { ref: "(c)", id: "cp_sha", text: "the entry by the Company, the Founders and the Investors into the Shareholders' Agreement;" },
          { ref: "(d)", id: "cp_constitution", text: "the adoption by the Company of the Amended Constitution;" },
          { ref: "(e)", id: "cp_no_mac", text: "there having been no material adverse change in the business, assets, financial condition or prospects of the Company between the date of this Agreement and Completion;" },
          { ref: "(f)", id: "cp_esop", text: "the adoption by the Company of an employee share option plan in the agreed form;" },
          { ref: "(g)", id: "cp_employment", text: "each of the Founders having entered into a full-time employment agreement with the Company in the agreed form;" },
          { ref: "(h)", id: "cp_ip", text: "each of the Founders, and every other person who has created Intellectual Property for or in connection with the Business, having assigned to the Company all of his rights in such Intellectual Property, in the agreed form; and" },
          { ref: "(i)", id: "cp_other", text: "{{condition_other}}." },
        ],
      },
      {
        id: "cp_satisfaction",
        title: "Satisfaction",
        text: "**Satisfaction.** The Company{{and_founders}} shall use best endeavours to procure that the Conditions are satisfied as soon as practicable and in any event on or before the Long-Stop Date, and shall notify the Investors in writing promptly upon each Condition being satisfied.",
      },
      { id: "cp_waiver", title: "Waiver", text: "**Waiver.** {{waiver_by}} may waive any Condition, in whole or in part, by notice in writing to the Company." },
      {
        id: "longstop",
        title: "Long-Stop Date",
        text: "**Long-Stop Date.** If any Condition has not been satisfied (or waived) on or before the date falling one (1) month after the date of this Agreement, or such later date as the Parties may agree in writing (the \"**Long-Stop Date**\"), this Agreement (other than {{clause:conf}} and {{section:general}}) shall terminate and no Party shall have any claim against any other Party under it, save for any claim arising from any antecedent breach.",
      },
    ],
  },
  {
    id: "completion",
    heading: "COMPLETION",
    clauses: [
      { id: "completion_date", title: "Completion", question: "SS6", text: "{{completion_text}}" },
      {
        id: "investor_obligations",
        title: "The Investors' Obligations",
        question: "SS8 / SS9",
        text: "**The Investors' Obligations.** At Completion, each Investor shall:",
        subs: [
          { ref: "(a)", id: "ia_pay", text: "pay its Subscription Consideration by electronic funds transfer to the bank account of the Company set out below, and payment so made shall constitute a good discharge of such Investor's obligation to pay its Subscription Consideration: account name: {{account_name}}; bank: {{bank_name}}; account number: {{account_no}};" },
          { ref: "(a)", id: "ia_convert", fd: true, text: "procure that its Subscription Consideration is satisfied in full by the conversion of the amount outstanding under the simple agreement for future equity or loan (as the case may be) previously made by it to the Company, which shall be extinguished upon such conversion;" },
          { ref: "(b)", id: "ia_authority", fd: true, text: "deliver to the Company evidence, in a form reasonably satisfactory to the Company, that such Investor is authorised to make its investment under this Agreement;" },
          { ref: "(c)", id: "ia_sha", text: "enter into the Shareholders' Agreement and deliver to the Company a copy duly executed by it; and" },
          { ref: "(d)", id: "ia_safe", fd: true, text: "deliver to the Company a SAFE conversion letter, duly executed by it, waiving any and all claims it may have against the Company under the converted instrument." },
        ],
      },
      {
        id: "company_obligations",
        title: "The Company's Obligations",
        question: "SS7",
        text: "**The Company's Obligations.** At Completion, the Company shall:",
        subs: [
          { ref: "(a)", id: "co_satisfaction", fd: true, text: "deliver to each Investor evidence, reasonably satisfactory to the Investors, that each of the Conditions has been satisfied (or waived);" },
          { ref: "(b)", id: "co_certificate", fd: true, text: "deliver to each Investor a certificate signed by a director of the Company confirming that each of the Conditions has been satisfied (or waived){{certificate_warranties}};" },
          { ref: "(c)", id: "co_board", text: "deliver to each Investor a copy of the written resolutions passed by the Board approving the allotment and issue of the Subscription Shares credited as fully paid to the Investors, the entry of the Investors in the Company's electronic register of members in respect thereof, and the execution and delivery to each Investor of a share certificate for its Subscription Shares;" },
          { ref: "(d)", id: "co_members", text: "deliver to each Investor a copy of the written resolutions passed by the shareholders of the Company authorising the allotment and issue of the Subscription Shares and waiving any pre-emption rights in respect of such allotment and issue;" },
          { ref: "(e)", text: "allot and issue to each Investor its Subscription Shares credited as fully paid;" },
          { ref: "(f)", text: "lodge the relevant return of allotment with the Registrar to update the Company's electronic register of members to reflect each Investor as the holder of its Subscription Shares; and" },
          { ref: "(g)", text: "subject to the Company's electronic register of members being updated, issue and deliver to each Investor a share certificate for its Subscription Shares." },
        ],
      },
      {
        id: "simultaneous",
        title: "Simultaneous Completion",
        text: "**Simultaneous Completion.** An Investor shall not be obliged to perform any of its obligations under this {{section:completion}} unless the Company simultaneously performs its obligations under this {{section:completion}}, and vice versa.",
      },
    ],
  },
  {
    id: "warranties",
    heading: "WARRANTIES",
    clauses: [
      { id: "w_give", title: "Warranties", question: "SS10 / SS10a", text: "**Warranties.** {{warrant_lead}} to the Investors that each of the Warranties is true, accurate and not misleading at the date of this Agreement{{at_completion}}." },
      { id: "w_independent", title: "Independent Warranties", text: "**Independent Warranties.** Each Warranty is to be construed independently and (except where this Agreement provides otherwise) is not limited by any provision of this Agreement or another Warranty." },
      { id: "w_unaffected", title: "Effect of Completion", text: "**Effect of Completion.** The rights and remedies of each Investor in respect of any breach of any Warranty shall not be affected by Completion or any investigation made by or on behalf of any Investor into the affairs of the Company, except by a specific and duly authorised written waiver or release." },
      {
        id: "w_contribution",
        title: "No Contribution",
        text: "**No Contribution.** In the case of a Claim against the Company, the Company undertakes not to make any counterclaim or claim for a right of contribution or indemnity against the Founders and, in the case of a Claim against any Founder, each Founder undertakes not to make any counterclaim or claim for a right of contribution or indemnity against the Company or any other Warrantor.",
      },
      {
        id: "w_awareness",
        title: "Awareness",
        text: "**Awareness.** Any Warranty qualified by the expression \"so far as the Warrantors are aware\" or any similar expression shall be deemed to refer to the actual knowledge of the Warrantors and such knowledge which the Warrantors would have had if they had made reasonable enquiry of all relevant persons.",
      },
    ],
  },
  {
    id: "limitations",
    heading: "LIMITATIONS ON WARRANTY CLAIMS",
    clauses: [
      { id: "lim_time", title: "Time Limit", question: "SS12c", text: "**Time Limit.** The Warrantors shall not be liable in respect of any Claim unless written notice of such Claim (with reasonable details) shall have been given to the Warrantors within {{time_cap}} following Completion, but failure to give reasonable details of any Claim shall not prevent the Investors from proceeding with such Claim." },
      { id: "lim_amount", title: "Maximum Liability", question: "SS12a", text: "**Maximum Liability.** The aggregate liability of the Warrantors in respect of any and all Claims by an Investor shall be limited to an amount equal to {{cap_pct}} of the Subscription Consideration paid by such Investor pursuant to this Agreement." },
      { id: "lim_once", title: "No Double Recovery", text: "**No Double Recovery.** An Investor may not recover from the Warrantors in respect of a Claim under this Agreement more than once for the same loss." },
      { id: "lim_mitigation", title: "Mitigation", text: "**Mitigation.** Nothing in this Agreement shall prejudice an Investor's common law duty to mitigate any loss suffered by it as a result of a breach of a Warranty and which is the subject of a Claim." },
      { id: "lim_fraud", title: "Fraud", text: "**Fraud.** Nothing in this Agreement shall have the effect of limiting or restricting any liability of the Warrantors in respect of a Claim arising as a result of any fraud, dishonesty, wilful concealment or wilful misrepresentation by or on behalf of a Warrantor." },
    ],
  },
  {
    id: "undertakings",
    heading: "UNDERTAKINGS",
    fd: true,
    clauses: [
      {
        id: "investor_undertakings",
        title: "Investor Undertakings",
        question: "SS13",
        text: "**Investor Undertakings.** Each Investor undertakes that:",
        subs: [
          { ref: "(a)", id: "iu_no_transfer", text: "it shall not transfer any of its Subscription Shares without the prior written consent of the Board;" },
          { ref: "(b)", id: "iu_rofo", text: "before transferring any of its Subscription Shares to a third party, it shall first offer them to the Founders (or such other members of the management of the Company as the Board may nominate) on terms no less favourable than those offered to the third party;" },
          { ref: "(c)", id: "iu_esop", text: "it acknowledges that the Company will implement an employee share option plan, and that its shareholding may be diluted by the issue of shares under it;" },
          { ref: "(d)", id: "iu_fundraising", text: "it acknowledges that the Company will carry out further fundraising exercises, and it shall act in good faith to support such fundraising exercises; and" },
          { ref: "(e)", id: "iu_exit", text: "it shall act in good faith to support any exit event or exit efforts undertaken by the Company." },
        ],
      },
      {
        id: "company_undertakings",
        title: "Information Rights",
        question: "SS14",
        text: "**Information Rights.** For so long as an Investor holds any Shares, the Company shall provide to such Investor:",
        subs: [
          { ref: "(a)", id: "cu_budget", text: "the annual budget and forecast of the Company for each financial year, within thirty (30) days after the start of that financial year;" },
          { ref: "(b)", id: "cu_quarterly", text: "the management accounts of the Company for each financial quarter, within thirty (30) days after the end of that quarter;" },
          { ref: "(c)", id: "cu_monthly", text: "the management accounts of the Company for each month, within twenty-one (21) days after the end of that month; and" },
          { ref: "(d)", id: "cu_updates", text: "prompt written notice of any matter which has or is likely to have a material effect on the business, assets or financial condition of the Company." },
        ],
      },
      {
        id: "founder_undertakings",
        title: "Founder Undertakings",
        question: "SS15",
        text: "**Founder Undertakings.** Each Founder undertakes to the Investors that:",
        subs: [
          { ref: "(a)", id: "fu_reputation", text: "he shall not engage in any conduct which will prejudice the reputation or goodwill of the Company;" },
          { ref: "(b)", id: "fu_conflict", text: "he shall not place himself in a position which gives or may give rise to a conflict between his interests and those of the Company;" },
          { ref: "(c)", id: "fu_non_compete", text: "he shall, on or before Completion, enter into a non-compete undertaking letter in favour of the Company on terms approved by the Investors (acting reasonably); and" },
          { ref: "(d)", id: "fu_vesting", text: "he shall, on or before Completion, enter into a share vesting letter in respect of his Shares on terms approved by the Investors (acting reasonably)." },
        ],
      },
    ],
  },
  {
    id: "confidentiality",
    heading: "CONFIDENTIALITY",
    clauses: [
      {
        id: "conf",
        title: "Confidentiality",
        text: "**Confidentiality.** Each Party undertakes to keep confidential and at all times not disclose publicly or to any third party without the prior written consent of the other Parties the existence and subject matter of this Agreement{{sha_conf}} and all other agreements entered into pursuant to this Agreement, the substance of any negotiations between the Parties relating to this Agreement and any other information received or obtained as a result of entering into this Agreement, unless and to the extent that:",
        subs: [
          { ref: "(a)", text: "the disclosure is required by law, any governmental or regulatory body or any recognised stock exchange on which the shares of any Party are listed;" },
          { ref: "(b)", text: "the disclosure is required for the purpose of any judicial proceedings arising out of this Agreement or any other agreement entered into pursuant to this Agreement;" },
          { ref: "(c)", text: "the disclosure is made to the professional advisers, consultants, related corporations or affiliates of any Party (collectively, the \"**Representatives**\") for the purpose of this Agreement, on terms that each Representative receiving the information agrees to comply with this {{clause:conf}} in respect of such information as if it were a party to this Agreement;" },
          { ref: "(d)", text: "the information is or becomes publicly available (other than by breach of this Agreement);" },
          { ref: "(e)", text: "the Party whose information is to be disclosed has given prior written approval to the disclosure; or" },
          { ref: "(f)", text: "the information is independently developed by the recipient or is lawfully in its possession prior to the disclosure to it of the information," },
        ],
        tail: "provided that prior to disclosure of any information pursuant to paragraph (a), the Party concerned shall, to the extent permitted by law, promptly notify the other Party or Parties (as the case may be) of such requirement.",
      },
      { id: "conf_duration", title: "Duration", text: "**Duration.** The obligations in this {{section:confidentiality}} shall endure, even after the termination of this Agreement, without limit in point of time except and until any confidential information enters the public domain as set out above." },
    ],
  },
  {
    id: "general",
    heading: "GENERAL",
    clauses: [
      { id: "variation", title: "Variation", text: "**Variation.** No variation of this Agreement shall be effective unless in writing and signed by or on behalf of each Party." },
      { id: "assignment", title: "Assignment", text: "**Assignment.** All rights and obligations hereunder are personal to the Parties and a Party may not assign or transfer all or part of its rights or obligations under this Agreement without the prior written consent of the other Parties." },
      { id: "waiver", title: "Indulgence, Waiver, etc.", text: "**Indulgence, Waiver, etc.** No failure on the part of any Party to exercise and no delay on the part of any Party in exercising any right hereunder will operate as a release or waiver thereof, nor will any single or partial exercise of any right under this Agreement preclude any other or further exercise of it." },
      { id: "costs", title: "Costs", text: "**Costs.** Each Party shall bear its own costs and disbursements incurred in the negotiations leading up to and in the preparation of this Agreement and of matters incidental to this Agreement." },
      { id: "whole", title: "Whole Agreement", text: "**Whole Agreement.** This Agreement contains the whole agreement between the Parties relating to the subject matter of this Agreement at the date of this Agreement to the exclusion of any terms implied by law which may be excluded by contract and supersedes any previous written or oral agreement between the Parties in relation to the matters dealt with in this Agreement." },
      {
        id: "notices",
        title: "Notices",
        text: "**Notices.** Any notice in connection with this Agreement must be in writing in English and delivered by hand, sent by pre-paid registered post or sent by e-mail to the Party concerned at the address or e-mail address set out below (or as notified by that Party for this purpose). A notice is deemed received: if delivered by hand, at the time of delivery; if sent by pre-paid registered post, on the second Business Day after posting (or the sixth Business Day, if sent by registered airmail); and if sent by e-mail, when the sender receives an automated message confirming delivery, except that a notice received on a day which is not a Business Day or after 5.30 p.m. (addressee's time) is deemed received at 9.30 a.m. on the following Business Day.",
      },
      { id: "third_parties", title: "Rights of Third Parties", text: "**Rights of Third Parties.** A person who is not a party to this Agreement has no rights under the Contracts (Rights of Third Parties) Act 2001 of Singapore to enforce any of its terms." },
      { id: "remedies", title: "Remedies", text: "**Remedies.** No remedy conferred by any of the provisions of this Agreement is intended to be exclusive of any other remedy which is otherwise available at law, in equity, by statute or otherwise, and each and every other remedy shall be cumulative and shall be in addition to every other remedy given hereunder or now or hereafter existing at law, in equity, by statute or otherwise." },
      { id: "severance", title: "Severance", text: "**Severance.** If any provision of this Agreement or part thereof is rendered void, illegal or unenforceable by any legislation to which it is subject, it shall be rendered void, illegal or unenforceable to that extent and it shall in no way affect or prejudice the enforceability of the remainder of such provision or the other provisions of this Agreement." },
      { id: "counterparts", title: "Counterparts", text: "**Counterparts.** This Agreement may be signed in any number of counterparts and by the Parties on separate counterparts, each of which, when so executed, shall be an original, but all counterparts shall together constitute one and the same document. Each Party agrees to be bound by its own electronic signature and accepts the electronic signature of the other Parties." },
      { id: "governing_law", title: "Governing Law", text: "**Governing Law.** This Agreement shall be governed by, and construed in accordance with, the laws of Singapore." },
      {
        id: "disputes",
        title: "Dispute Resolution",
        text: "**Dispute Resolution.** In the event of any dispute arising out of or in connection with this Agreement, including any question regarding its existence, validity or termination (the \"**Dispute**\"), a Party may give notice to the other Parties to submit the Dispute to mediation at the Singapore Mediation Centre. If the Parties do not agree to mediation, or the Dispute is not resolved within thirty (30) days after it is submitted to mediation, the Parties irrevocably agree that the courts of Singapore are to have exclusive jurisdiction to settle the Dispute.",
      },
    ],
  },
];

export const EXECUTED = "IN WITNESS WHEREOF this Agreement has been entered into on the date stated at the beginning.";

/* ── Schedule 3: the warranties, keyed by the bank's list ─────────────── */

export interface WarrantyGroup {
  key: string;
  heading: string;
  items: string[];
  fd?: boolean;
}

export const WARRANTIES: WarrantyGroup[] = [
  {
    key: "existence",
    heading: "Corporate Existence",
    items: ["The Company is duly incorporated and validly existing under the laws of Singapore and has been in continuous existence since its incorporation."],
  },
  {
    key: "authority",
    heading: "Capacity and Authority",
    items: ["Each Warrantor has full right and authority to enter into and perform its obligations under this Agreement on the terms and conditions hereunder and this Agreement represents its legal, valid and binding obligations enforceable in accordance with its terms."],
  },
  {
    key: "laws",
    heading: "No Breach",
    items: [
      "The execution and delivery by the Warrantors of this Agreement and the documents referred to herein, and compliance with their respective terms, shall not breach or constitute a default under the Constitution, or any other agreement or instrument to which any Warrantor is a party or by which any Warrantor is bound, and shall not constitute a breach under any law or regulation, or any order, judgment, decree or other restriction, applicable to any Warrantor.",
    ],
  },
  {
    key: "title",
    heading: "Share Capital",
    items: [
      "The Subscription Shares, when issued at Completion, will be duly authorised, properly allotted and issued as fully paid free of any Encumbrances.",
      "There is no Encumbrance, and there is no agreement, arrangement or obligation to create or give any Encumbrance, in relation to any of the Subscription Shares or any shares in the capital of the Company.",
      "Other than this Agreement, there is no agreement, arrangement or obligation requiring the issue, transfer, redemption or repurchase of, or the grant to a person of the right (conditional or not) to require the issue, transfer, redemption or repurchase of, any shares in the capital of the Company (including any option or other right convertible into or exchangeable or exercisable for any such shares).",
    ],
  },
  {
    key: "accounts",
    heading: "Financial Statements and Management Accounts",
    items: [
      "The financial statements and management accounts of the Company provided to the Investors before the date of this Agreement (the \"**Accounts**\") have been prepared in accordance with accounting principles, standards and practices which are generally accepted in Singapore, comply with the requirements of the Act and any other applicable law, and give a true and fair view (or, in the case of management accounts, reasonably reflect) the state of affairs of the Company as at the date to which they are made up and of its results for the period concerned.",
      "The accounting records of the Company are accurate, up to date, in its possession or under its control and properly completed in accordance with the applicable laws and accounting standards.",
    ],
  },
  {
    key: "compliance",
    heading: "Compliance with Law",
    items: [
      "The Company has conducted its business in all material respects in accordance with all applicable laws and all permits, authorities, licences and consents have been obtained and all conditions applicable thereto complied with and so far as the Warrantors are aware there are no circumstances which might lead to the suspension, alteration or cancellation of any such permits, authorities, licences or consents.",
      "No Founder has been disqualified from being a company director.",
    ],
  },
  {
    key: "litigation",
    heading: "Litigation",
    items: [
      "Neither the Company nor any Founder is at present engaged, whether as claimant, defendant or otherwise, in any legal action, proceeding or arbitration of a material nature which is in progress or threatened or, so far as the Warrantors are aware, pending, and no governmental, regulatory or official investigation or inquiry concerning the Company is threatened or in progress or so far as the Warrantors are aware pending.",
      "There are no circumstances known to any of the Warrantors likely to lead to any such claim, legal action, proceeding, arbitration, investigation or inquiry.",
    ],
  },
  {
    key: "contracts",
    heading: "Agreements",
    items: [
      "Neither the Company nor any party with whom the Company has entered into any agreement, arrangement or obligation is in breach of such agreement, arrangement or obligation and, so far as the Warrantors are aware, no fact or circumstance exists which might give rise to a breach of this type.",
      "So far as the Warrantors are aware, no fact or circumstance exists which might invalidate or give rise to a ground for termination of any agreement, arrangement or obligation to which the Company is a party, and no party with whom the Company has entered into any agreement, arrangement or obligation has given notice of its intention to terminate it.",
    ],
  },
  {
    key: "anti_corruption",
    heading: "Anti-Corruption and Anti-Bribery",
    items: [
      "Neither the Company nor any Founder, nor so far as the Warrantors are aware any person acting for or on behalf of the Company, is being prosecuted for, or is or has been the subject of any investigation or inquiry by any governmental, administrative or regulatory authority in respect of, any offence or alleged offence under any applicable anti-corruption or anti-bribery law (including the Prevention of Corruption Act 1960 of Singapore), and there are no circumstances known to any of the Warrantors likely to give rise to any such prosecution, investigation or inquiry.",
      "Neither the Company nor any Founder, nor any director, officer, employee or agent of the Company acting on its behalf, has offered, paid, promised or authorised the payment of any money or anything of value, directly or indirectly, to any person in order to improperly influence any act or decision of that person, in breach of any applicable anti-corruption or anti-bribery law.",
    ],
  },
];

/* ── for the admin page ──────────────────────────────────────────────── */

/** Where the wording comes from, clause by clause. */
export const SOURCES: { where: string; source: string }[] = [
  { where: "Parties, recitals, Clause 2 (subscription, founders' waiver)", source: "VIMA Model Subscription Agreement, Clause 1 and parties — one company, ordinary or preference shares" },
  { where: "Completion", source: "VIMA Clause 2 (board and shareholders' resolutions, allotment, return of allotment, share certificates, simultaneous completion)" },
  { where: "Warranties, limitations", source: "VIMA Clauses 4 and 5 — no disclosure letter, so \"Fairly Disclosed\" is dropped; caps from the bank (SS12)" },
  { where: "Schedule 3 warranties", source: "VIMA Schedule 4 paragraphs 1, 2, 5, 8, 14 and 17, for the bank's nine headings; anti-bribery second paragraph is FD wording" },
  { where: "Confidentiality, general", source: "VIMA Clauses 6–13, shortened; mediation then Singapore courts (VIMA option 1)" },
  { where: "Conditions, undertakings, SAFE conversion, investors' representative", source: "FD supplementary — VIMA leaves these blank" },
];

/** VIMA slips and out-of-date references, fixed here. */
export const CORRECTIONS: { where: string; was: string; now: string }[] = [
  { where: "Definition of Act", was: "the Companies Act, Chapter 50 of Singapore", now: "the Companies Act 1967 (2020 Revised Edition name)" },
  { where: "Rights of Third Parties", was: "Contracts (Rights of Third Parties) Act, Chapter 53B", now: "Contracts (Rights of Third Parties) Act 2001" },
  { where: "Confidentiality", was: "information received or obtained as a resulting of entering into this Agreement", now: "as a result of" },
  { where: "Schedule 4 para 11.1", was: "No Group Company has not granted any Encumbrance", now: "not used (assets warranty not in the bank's list)" },
];
