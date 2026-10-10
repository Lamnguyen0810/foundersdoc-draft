/**
 * FD Master Employment Agreement (GENERIC) — letter form, jurisdiction-neutral.
 *
 * The approved wording from FD_Master_Employment_Agreement_GENERIC.docx, as
 * data. The assembler (assemble.ts) fills the {{fields}}, picks the variant
 * each answer calls for and drops what does not apply; it never rewrites a
 * sentence of its own.
 *
 * Markup:
 *   {{field}}          fill in — anything unknown becomes [●] and is reported
 *   {{clause:id}}      "Clause 7.2" — worked out after numbering, so a dropped
 *                      clause never leaves a reference pointing at the wrong
 *                      place (whole-clause references such as "Clause 5
 *                      (Confidentiality)" are built the same way, in the
 *                      assembler: {{breach_clauses}}, {{leaver_breach}} …)
 *   {{item:id}}        "item (b)" of Table A, the same way
 *   **bold**           bold, as the master has it
 *
 * `fd: true` marks wording that is NOT in the master: clauses the
 * questionnaire needs and the master does not have (garden leave, a fixed
 * term, arbitration, leaver rules, a shorter confidentiality period …).
 * They are written in the master's style and listed in the admin console
 * as "FD supplementary — for FD review" until a lawyer signs them off.
 */

export interface MasterSub {
  /** "(a)", "(i)" … or null for an unnumbered line that carries on the clause. */
  ref: string | null;
  text: string;
  /** Nested (i), (ii) … under this (a). */
  subs?: MasterSub[];
  /** Set by the assembler to leave this one out. */
  id?: string;
}

export interface MasterClause {
  /** Stable id, for cross-references and the rules. */
  id: string;
  text: string;
  subs?: MasterSub[];
  fd?: boolean;
}

export interface MasterSection {
  id: string;
  heading: string;
  clauses: MasterClause[];
}

export const MASTER_VERSION = "GENERIC-1";

/* ── the letter's head ───────────────────────────────────────────────── */

export const HEADER: string[] = [
  "**Name of Employee: {{employee_name}}**",
  "**Address: {{employee_address}}**",
  "**{{date}}**",
  "Dear {{employee_name}},",
  "**EMPLOYMENT WITH {{COMPANY_NAME}}**",
  "This employment agreement (the \"**Agreement**\") sets out the key terms that will govern your employment arrangement with **{{company_name}}** ({{registration_label}}: {{company_reg_no}}) (the \"**Company**\"), a company incorporated in {{company_jurisdiction}}. This Agreement remains subject to local employment laws and regulations, including but not limited to the applicable employment legislation of {{law}} (as amended and updated from time to time) (the \"**Employment Laws**\") as well as the policies implemented by the board of the Company from time to time.",
  "You shall be employed as {{position}} and you will be paid a salary of {{salary}} per {{salary_period}}, as may be updated by the Company from time to time (the \"**Salary**\"), payable on {{pay_day}}. You will report to such persons as directed by the Company from time to time. You will be based in {{work_location}}, or such other location as may be directed by the Company from time to time.",
  "In this Agreement, the reference to the term \"**Group**\" shall include the Company, its subsidiaries and (where applicable), its parent company, and their respective parents and subsidiaries from time to time.",
  "Where applicable, words importing the singular shall include the plural and vice-versa and references to any statute or provision thereof shall be deemed also to refer to any statutory modification or re‑enactment thereof or any statutory instrument, order or regulation made thereunder or under such re‑enactment.",
];

/* ── Table A ─────────────────────────────────────────────────────────── */

export const TABLE_A_TITLE = "**Table A: Summary of Employment Terms**";
export const TABLE_A_NOTE = "**This summary should not be a substitute for reading the terms of this Agreement in full.**";

/** The rows, in order. The assembler letters them after dropping any that do
 *  not apply, and each names the clause it belongs to. */
export interface TableRow {
  id: string;
  item: string;
  /** The clause the row feeds — shown as "(Clause 1.1)". */
  clause: string;
}

export const TABLE_A: TableRow[] = [
  { id: "commencement", item: "Date of Commencement", clause: "term" },
  { id: "fixed_term", item: "End of Fixed Term", clause: "term" },
  { id: "probation", item: "Probation Period", clause: "probation" },
  { id: "place", item: "Place of Work", clause: "place_of_work" },
  { id: "travel", item: "Travel", clause: "place_of_work" },
  { id: "hours", item: "Normal Working Hours", clause: "hours" },
  { id: "leave", item: "Annual Leave", clause: "annual_leave" },
  { id: "restricted_period", item: "Restricted Period", clause: "restrictive_covenants" },
  { id: "notice", item: "Notice Period for Termination", clause: "termination" },
];

export const TABLE_TEXT: Record<string, string> = {
  commencement: "{{commencement_date}} (the \"**Commencement Date**\")",
  fixed_term: "{{end_date}}, when your employment shall end automatically unless terminated earlier",
  probation_none: "Not Applicable.",
  probation: "{{probation_period}}, as may be extended by the Company in its discretion. During the probation period, your salary shall be the Salary and your termination notice period shall be {{probation_notice}}.",
  place: "{{work_place}}",
  travel: "{{travel}}",
  hours: "{{working_hours}}",
  leave: "{{annual_leave}}, or such greater entitlement as applicable law requires (\"**Annual Leave**\")",
  restricted_period: "The period of your employment and a further period of {{restricted_months}} from the date you cease to be employed by the Company.",
  notice: "{{notice_period}} (the \"**Termination Notice Period**\")",
};

export const AGREED = "**It is hereby agreed as follows:**";

/* ── the clauses ─────────────────────────────────────────────────────── */

export const SECTIONS: MasterSection[] = [
  {
    id: "term_of_employment",
    heading: "TERM OF EMPLOYMENT",
    clauses: [
      {
        id: "term",
        text: "**Term of Employment.** Subject to the conditions set out below, your employment hereunder shall commence on the Commencement Date and shall continue until it is terminated in accordance with the terms of this Agreement (the \"**Term**\"). You acknowledge that the Company has the right to terminate your employment immediately and without notice and/or withdraw the offer set out in this Agreement if any of the conditions are not met, in the opinion of the Company:",
        subs: [
          { ref: "(a)", text: "you fail to hold the requisite approvals to work in {{work_country}} or if you lose your right to work in {{work_country}} at any time during your employment; and/or" },
          { ref: "(b)", text: "the reference checks conducted by the Company and/or its authorised representative(s) are not successfully completed or completed to the satisfaction of the Company," },
          { ref: null, text: "and this Agreement shall thereafter be rendered null and void save for the provisions that are stated to survive the termination of this Agreement." },
        ],
      },
      {
        id: "probation",
        text: "**Probation Period.** Where applicable, the Company may impose a probationary period, the terms of which are specified in {{item:probation}} of Table A (Summary of Employment Terms).",
      },
      {
        id: "place_of_work",
        text: "**Place of Work and Travel.** Your place of work is set out in {{item:place}} of Table A (Summary of Employment Terms). You may be required to travel in the course of your duties as set out in {{item:travel}} of Table A, and to work at such other locations as the Company may reasonably require from time to time.",
      },
      {
        id: "hours",
        text: "**Normal Working Hours.** Your normal working hours are set out in {{item:hours}} of Table A (Summary of Employment Terms).",
      },
      {
        id: "hours_variation",
        text: "**Variations in Working Hours.** Subject to the Employment Laws, the Company may vary your normal working hours from time to time subject to your job requirements. You may also be required to work overtime in addition to your normal hours or on certain weekends and public holidays as required by the Company. Unless otherwise stated in Table A (Summary of Employment Terms), any applicable overtime rate shall be discussed and agreed upon with you in writing in accordance with applicable laws.",
      },
    ],
  },
  {
    id: "duties",
    heading: "EMPLOYEE DUTIES AND CONDUCT",
    clauses: [
      {
        id: "responsibilities",
        text: "**Responsibilities.** During the Term, you shall:",
        subs: [
          { ref: "(a)", text: "perform the duties assigned to you to the best of your ability and knowledge;" },
          { ref: "(b)", text: "serve the Company faithfully and diligently to the best of your ability;" },
          { ref: "(c)", text: "use all reasonable efforts to promote the Company's interests and act in the Company's best interests;" },
          { ref: "(d)", text: "devote the whole of your time, attention and skills during working hours to the faithful and diligent performance of your duties;" },
          { ref: "(e)", text: "uphold the Company's goals and culture, including but not limited to being respectful towards colleagues, clients, customers and business partners (whether actual or potential); and" },
          { ref: "(f)", text: "refrain from engaging in any activity which may hinder or otherwise interfere with the performance of your duties under this Agreement." },
        ],
      },
      {
        id: "conduct",
        text: "**Conduct.** You shall not commit any act which shall or may be prejudicial or detrimental to the Group's reputation or business. You shall, where applicable, comply with the Group's policies, rules and regulations as implemented from time to time during the course of your employment.",
      },
      {
        id: "external",
        text: "**External Directorships and Positions.**",
        subs: [
          { ref: "(a)", id: "external_directorships", text: "You shall seek the Company's consent in respect of any external directorships that you hold or propose to hold. The Company may, acting reasonably, request that you resign from or refrain from accepting any external directorship." },
          {
            ref: "(b)",
            id: "external_roles",
            text: "During the Term, your principal commitment shall be to the Company pursuant to this Agreement. Without the prior written approval of the Company, you shall not undertake any other role, appointment and/or employment, including but not limited to the following:",
            subs: [
              { ref: "(i)", text: "positions that may lead to unwanted publicity for the Group;" },
              { ref: "(ii)", text: "positions that leverage on the Group's confidential research findings, literature, and other forms of intellectual property are not made use of at all in articles for publication; and/or" },
              { ref: "(iii)", text: "positions that may be in conflict with the business of the Group." },
            ],
          },
          { ref: "(c)", text: "You may not use your position, influence, knowledge of Confidential Information of the Company or the Group's assets for personal gain. A direct or indirect financial interest, including joint ventures in or with a supplier, vendor, customer or prospective customer without disclosure and written approval from an authorised representative of the Company is strictly prohibited and constitutes cause for dismissal." },
        ],
      },
      {
        id: "undertakings",
        text: "**Undertakings During Employment.** During the Term, you shall not at any time, directly or indirectly, without the prior written consent of the Company:",
        subs: [
          { ref: "(a)", text: "carry on, work for or be engaged (whether as sole proprietor or in partnership with any entity or entities or on behalf of any entity) in the conduct of any other business, employment or provision of goods or services, whether in competition with the Company and/or the Group;" },
          { ref: "(b)", text: "directly or indirectly carry on, work for, or be engaged in the conduct of any business of any competitor of the Company and/or the Group or related fields;" },
          { ref: "(c)", text: "provide any advice or perform any service to or for any competitor of the Company and/or the Group; and/or" },
          { ref: "(d)", id: "competitor_shares", text: "acquire, own or retain any interest in any competitor of the Company and/or the Group Provided That you shall not be prevented from holding any interests in any publicly traded stock traded on an internationally recognised stock exchange where such interests do not exceed five per cent. (5%) of the total issued stock of the relevant company." },
        ],
      },
      {
        id: "non_circumvention",
        text: "**Non-Circumvention.** You shall ensure that all relevant business opportunities related to the business of the Company shall only be taken up by you through the Company. Without the prior written consent of the Company, you shall not, directly or indirectly, enter into transactions with potential clients and/or third parties to circumvent this Clause. In the event that you circumvent this provision, the Company shall be entitled to damages equal to the maximum service amount that it would have realised from such a transaction plus any and all expenses, including but not limited to all legal costs and expenses incurred to recover the lost revenue.",
      },
    ],
  },
  {
    id: "remuneration",
    heading: "REMUNERATION",
    clauses: [
      {
        id: "salary",
        text: "**Salary.** You will be paid the Salary. Your Salary may be subject to review from time to time in accordance with the Group's policy. Your remuneration under this Agreement is confidential and should not be disclosed to any third party, including any staff of the Group.",
      },
      {
        id: "esop",
        text: "**Employee Share Option Plan.** To the extent that you are granted any options under the Company's employee share option plan, you agree to be bound by the terms of any share incentive scheme, share option scheme or such other share plans as may be implemented by the Board from time to time and which may apply to you in your capacity as an employee.",
      },
      {
        id: "leaver",
        fd: true,
        text: "**Good Leaver and Bad Leaver.** Subject always to the rules of the relevant plan, which shall prevail in the event of any inconsistency, if you are granted any shares, share options or long-term incentive awards and your employment ends:",
        subs: [
          { ref: "(a)", text: "as a Good Leaver, any unvested award shall lapse on the date your employment ends unless the Board determines otherwise, and any vested award shall remain exercisable or held in accordance with the terms of the relevant plan; and" },
          { ref: "(b)", text: "as a Bad Leaver, all awards, whether vested or unvested, shall lapse immediately on the date your employment ends, and any shares acquired under such awards may, at the Board's election, be required to be transferred at the lower of their cost and their market value." },
          { ref: null, text: "For these purposes, you are a \"**Bad Leaver**\" if your employment is terminated under {{clause:summary_dismissal}} or you are in breach of {{leaver_breach}}, and a \"**Good Leaver**\" in any other case, including death, ill health, redundancy or termination by the Company other than under {{clause:summary_dismissal}}." },
        ],
      },
      {
        id: "deductions",
        text: "**Deductions.** Subject to the applicable laws, you agree that the Company has the right to deduct from your remuneration or any money due to you, any sums which you may owe the Company or any costs which the Company incurs on your behalf.",
      },
      {
        id: "bonus",
        text: "**Discretionary Bonus.** The Company may, but shall not be obliged to, award you a discretionary bonus during the Term. The decision relating to the distribution of any discretionary bonus and the amount thereof shall not be regarded as a right or entitlement under this Agreement.",
      },
      {
        id: "contributions",
        text: "**{{contributions_heading}}.** The Company shall, where applicable, comply with the provisions of the applicable statutory social security / pension legislation of {{law}} for the time being in force and the rules and regulations promulgated thereunder. This Clause applies only where you are eligible for such statutory contributions under the laws of {{law}}.",
      },
      {
        id: "taxes",
        text: "**Taxes.** You will be responsible for all taxes which may be payable in respect of any remuneration due to you hereunder and you agree to forthwith indemnify the Company against any claims for tax in respect of any such remuneration.",
      },
    ],
  },
  {
    id: "benefits",
    heading: "BENEFITS",
    clauses: [
      {
        id: "annual_leave",
        text: "**Annual Leave.** Subject to the Employment Laws as amended from time to time, you will be entitled to annual leave as set out in {{item:leave}} of Table A (Summary of Employment Terms); in addition to all public holidays gazetted in {{law}}.",
      },
      {
        id: "pro_rata",
        text: "**Pro-Rata Basis.** If your employment commenced or terminates partway through a calendar year, your entitlement during that holiday year will be calculated on a pro-rata basis.",
      },
      {
        id: "illness",
        text: "**Illness or Injury.** In the event of any illness or injury incapacitating you from attending to your duties, you shall be entitled to be absent from duties by either taking up the sick leave entitlement or hospitalisation leave entitlement in accordance with applicable law, provided that such leave entitlement can only be taken upon certification by a medical practitioner.",
      },
      {
        id: "other_leave",
        text: "**Other Leave and Benefits.**",
        subs: [
          { ref: "(a)", text: "You will be entitled to all maternity, paternity, childcare and infant care leave entitlements which you are eligible for under applicable law." },
          { ref: "(b)", text: "You shall also be entitled to such other employment benefits as statutorily provided by the applicable laws." },
          { ref: "(c)", text: "All other leave and benefits provided by the Company and/or the Group from time to time, shall be at the sole discretion of the Board of Directors and/or management." },
        ],
      },
    ],
  },
  {
    id: "confidentiality",
    heading: "CONFIDENTIALITY",
    clauses: [
      {
        id: "ci_definition",
        text: "**Confidential Information.** \"**Confidential Information**\" means any information which is proprietary and confidential to the Group including but not limited to information concerning or relating in any way whatsoever to any of the trade secrets or confidential operations, processes or inventions carried on or used by the Group, any information concerning the organisation, business, finances, transactions or affairs of the Group, its dealings, secret or confidential information which relates to its business or any of its affiliates' transactions or affairs, its personal training methodology or designs, algorithms, databases, software, documentation, manuals, budgets, financial statements or information, drawings, notes, memoranda and the information contained therein, any information therein in respect of trade secrets, technology and technical or other information relating to the development, manufacture, clinical testing, analysis, marketing, sale or supply or proposed development, manufacture, clinical testing, analysis, marketing, sale or supply of any products or services by the Group, and plans for the development or marketing of such products or services and information and material which is either marked confidential or is by its nature intended to be exclusively for the knowledge of the recipient alone and to be kept confidential by the recipient. For the avoidance of doubt, this shall also include: (a) the business of the Group; (b) the identity of the investors and/or stakeholders of the Group and their participations, other than as publicly disclosed by the Group; and (c) the technology relating to the Group.",
      },
      {
        id: "ci_obligation",
        text: "**Confidentiality.** You shall, {{confidentiality_period}}:",
        subs: [
          { ref: "(a)", text: "hold in the strictest confidence the Confidential Information of the Group;" },
          { ref: "(b)", text: "not divulge, furnish, transfer, or make accessible to anyone, directly or indirectly, or use for any purpose for the account or benefit of any person or entity, the Confidential Information of the Group;" },
          { ref: "(c)", text: "not copy, reproduce or reverse engineer in any form or by or any media or device (or permit others to copy or reproduce) documents, or other material containing or referring to Confidential Information in whole or in part; and" },
          { ref: "(d)", text: "use all endeavours to prevent disclosure of the Confidential Information of the Group by any other party," },
          { ref: null, text: "save as in connection with the due and proper performance of their duties or unless required by law or ordered by a court of competent jurisdiction, use divulge or communicate to any persons, other than with the prior written consent of the Company." },
        ],
      },
      {
        id: "ci_ownership",
        text: "**Ownership of Confidential Information.** All information you have or may come into possession during the employment with the Company, including but not limited to the Company's plans, customer lists, product information, launch plans, business strategy, sales and sales promotion activities, as well as personnel, financial and operational information, is the property of the Company.",
      },
      {
        id: "ci_return",
        text: "**Return of Confidential Information.** All documents (including copies), any form of storage media, correspondence, software, programmes, hardware, drawings, documents, other papers or property belonging to the Company or any of its businesses and other material (in whatsoever medium) held by you containing or referring to Confidential Information or relating to the affairs and business of the Company (and whether or not prepared by you or supplied by the Company) shall be the property of the Company, and shall be: (a) delivered; or (b) deleted or destroyed, immediately by you upon the expiry or termination of the Term. The failure of the Company to enforce this Clause at any time shall not operate as a waiver of that provision in respect of the particular act or omission or any other act or omission.",
      },
      {
        id: "ci_survival",
        text: "**Surviving Obligation.** The obligations set forth in this Clause shall remain in full force and effect notwithstanding the termination of this Agreement and/or the expiry of the Term.",
      },
    ],
  },
  {
    id: "conflicts",
    heading: "CONFLICTS OF INTEREST",
    clauses: [
      {
        id: "restrictive_covenants",
        text: "**Restrictive Covenants.** Without the prior written consent of the Company, you agree that during the Restricted Period (as defined below) within the Restricted Territory (as defined below):",
        subs: [
          { ref: "(a)", id: "no_poach_staff", text: "you will not either on your own account, jointly with or for any person, firm, company or organisation, entice or endeavour to entice away from the Company or any company in the Group any Restricted Person (as defined below);" },
          { ref: "(b)", id: "no_poach_clients", text: "you will not either on your own account, jointly with or for any person, firm, company or organisation, solicit business from any person, firm, company or organisation which at any time during the currency of your employment hereunder has dealt with the Company or any company in the Group; and" },
          { ref: "(c)", id: "no_compete", text: "you will not be directly or indirectly in any capacity whether as shareholder, director, manager, consultant, employee, agent or otherwise engaged or concerned or interested in any other business which is in any respect in competition with or in opposition to any business for the time being carried on by any company in the Group in which you have been materially involved or concerned, including but not limited to any business in {{industry}}, provided that this shall not prohibit the holding (directly or through nominees) of investments listed on any stock exchange, as long as not more than five per cent. (5%) of the issued shares or stock of any class of any one company shall be so held." },
        ],
      },
      {
        id: "rc_severability",
        text: "**Severability.** While the restrictions contained in this Clause are considered by you to be reasonable in all the circumstances, it is recognised that restrictions of the nature in question may fail for unforeseen technical reasons and accordingly it is hereby agreed and declared that if any such restrictions shall be adjudged to be void as going beyond what is reasonable in all the circumstances for the protection of the interests of the Company, but would be valid if part of the wording thereof were deleted or the periods (if any) thereof were reduced or the range of services or area dealt with thereby were reduced in scope the said restriction shall apply with such modifications as may be necessary to make it valid and effective or as the Company may decide.",
      },
      {
        id: "rc_definitions",
        text: "**Definitions.** For these purposes:",
        subs: [
          { ref: "(a)", text: "\"**Restricted Period**\" shall mean period specified in {{item:restricted_period}} of Table A (Summary of Employment Terms);" },
          { ref: "(b)", id: "def_restricted_person", text: "\"**Restricted Person**\" means any director, manager, employee or servant providing material services to the Company or any company in the Group, with whom you had material business-related contact, or about whom you had access to confidential personnel information, or for whom you had direct or indirect supervisory responsibility, during your employment with the Company; and" },
          { ref: "(c)", text: "\"**Restricted Territory**\" shall mean {{territory}}, or such other jurisdictions that the Company may have a presence in from time to time." },
        ],
      },
      {
        id: "rc_group",
        text: "**Trade Secrets and Confidential Information.** Since you also may obtain in the course of your employment by reason of services rendered for or offices held in any other company in the Group knowledge of the trade secrets or other confidential information of such company you hereby agree that you will at the request and cost of the Company enter into a direct agreement or undertaking with such company whereby you will accept restrictions corresponding to the restrictions herein contained (or such of them as may be appropriate in the circumstances) in relation to such products and services and such area and for such period as such company may reasonably require for the protection of its legitimate interests.",
      },
      {
        id: "rc_survival",
        text: "**Surviving Obligation.** The obligations set forth in this Clause shall remain in full force and effect notwithstanding the termination of this Agreement and/or the expiry of the Term.",
      },
    ],
  },
  {
    id: "termination_section",
    heading: "TERMINATION",
    clauses: [
      {
        id: "termination",
        text: "**Termination.** Upon the expiry of the probation period (if any), this Agreement may be terminated by you or the Company by giving the other party prior written notice of termination in accordance with the Termination Notice Period specified in {{item:notice}} of Table A (Summary of Employment Terms).",
      },
      {
        id: "summary_dismissal",
        text: "**Reasons for Termination.** Your appointment hereunder shall be subject to termination by the Company by summary notice in writing, with immediate effect if you shall at any time:",
        subs: [
          { ref: "(a)", id: "sd_breach", text: "commit any breach of any of the provisions set out herein, which shall include but is not limited to {{breach_clauses}};" },
          { ref: "(b)", id: "sd_misconduct", text: "be guilty of misconduct where such conduct is inconsistent with the due and faithful discharge of your duties;" },
          { ref: "(c)", id: "sd_fraud", text: "be guilty of fraud, dishonesty or any criminal offence;" },
          { ref: "(d)", id: "sd_neglect", text: "be guilty of any default, misconduct or neglect in the discharge of your duties hereunder or in connection with or affecting the business of the Company or any company in the Group;" },
          { ref: "(e)", id: "sd_at_law", text: "conduct yourself in any manner that gives rise to any other reason justifying summary dismissal by the Company at law, and upon such termination you shall not be entitled to claim any compensation or damages for or in respect of or by reason of such termination;" },
          { ref: "(f)", id: "sd_bankrupt", text: "be served with any bankruptcy notice or become bankrupt or if you shall apply for a receiving order or have a receiving order made against you or shall enter into any arrangement or composition with your creditors generally;" },
          { ref: "(g)", id: "sd_capacity", text: "become of unsound mind or a person whose person or estate is liable to be dealt with in any way under the law relating to mental disorder or mental capacity;" },
          { ref: "(h)", id: "sd_charged", text: "be charged or convicted of any criminal offence (other than an offence which, in the sole and absolute opinion of the Company, does not affect your position or adversely reflect upon your character or integrity); or" },
          { ref: "(i)", id: "sd_disrepute", text: "in the sole and absolute opinion of the Company, be guilty of any conduct tending to bring yourself or the Company or any company in the Group into disrepute or that is prejudicial to the interests of the Company or any company in the Group." },
        ],
      },
      {
        id: "garden_leave",
        fd: true,
        text: "**Garden Leave.** During all or any part of the Termination Notice Period, whether notice is given by you or by the Company, the Company may require you not to attend work, not to carry out some or all of your duties and/or not to contact any client, employee or business partner of the Group, and may appoint another person to carry out your duties. During any such period you shall remain employed by the Company, continue to receive the Salary and your contractual benefits, remain bound by all of your obligations under this Agreement and remain available to assist the Company as it may reasonably request.",
      },
    ],
  },
  {
    id: "post_termination",
    heading: "POST-TERMINATION OBLIGATIONS",
    clauses: [
      {
        id: "on_termination",
        text: "**Obligations Upon Termination.** On the termination of your appointment hereunder howsoever so arising, you shall:",
        subs: [
          { ref: "(a)", text: "(where applicable) at any time or from time to time thereafter at the request of the Company resign from office as a director of the Company and all offices (whether as director, officer or otherwise) held by you in any company in the Group without any claim for compensation (save for any claim you may have against the Company hereunder) and in the event of your failure so to do the Company is hereby irrevocably authorised to appoint some person in your name and on your behalf to sign and deliver such resignation or resignations and you shall transfer without payment to the Company or as the Company may direct any shares held by you in trust or as nominee for the Company or any company in the Group and should you fail to do so the Company is hereby irrevocably authorised to appoint such person in your name and on your behalf to sign and do any documents or things necessary or requisite to give effect thereto;" },
          { ref: "(b)", text: "forthwith deliver, transfer or cause to be delivered or transferred to the Company or as the Company may direct all books, documents, papers, materials, credit cards, motorcars, club memberships and other property of or relating to the business of the Company or any company in the Group which may be in your possession or under your power or control or held in your name; and" },
          { ref: "(c)", text: "not at any time thereafter represent yourself still to be connected with the Company or any member of the Group." },
        ],
      },
      {
        id: "continuing",
        text: "**Continuing Obligations.**",
        subs: [
          { ref: "(a)", text: "Handling of Company Property. You shall not access, download, copy or transfer any data or information which you were provided access to because of your status as an employee of the Company. This includes, but is not limited to, information on the websites or electronic portals of any third parties." },
          { ref: "(b)", text: "Non-Disparagement. You undertake not to, directly or indirectly, in any manner (orally or in writing) make or publish any statement that would libel, slander, disparage, denigrate, ridicule or criticise the Company or the Company's employees, officers or directors." },
        ],
      },
      {
        id: "pt_survival",
        text: "**Surviving Obligation.** The obligations set forth in this Clause shall remain in full force and effect notwithstanding the termination of this Agreement and/or the expiry of the Term.",
      },
    ],
  },
  {
    id: "privacy",
    heading: "PRIVACY CONSENT",
    clauses: [
      {
        id: "pd_definitions",
        text: "**Definitions.** In this Clause, the following terms are defined as follows:",
        subs: [
          { ref: null, text: "\"**Personal Data**\" means any information about you, including but not limited to your name, address, references, bank details, salary, stock options, performance appraisals, work skills and career achievements, vacation, other benefits, sickness, work records, management and organisational appraisals and data held for employment law purposes, and shall include information about any next of kin, if appropriate, and/or other persons about whom data may be collected; and" },
          { ref: null, text: "\"**Processing**\" or \"**Process**\" means carrying out any operation or set of operations on Personal Data including, but not limited to, collecting, obtaining, organising, consulting, using, disclosing or destroying." },
        ],
      },
      {
        id: "pd_use",
        text: "**Use of Personal Data.** Subject to applicable data protection laws, you acknowledge and agree that the Company, by itself or through third parties, will Process Personal Data and that this Personal Data may be used for personnel, administration and management purposes in connection with your employment or the administration of post-employment benefits to comply with any obligations that the Company or any Group company may have regarding the retention of employee/worker records. You acknowledge and agree that the Company may use your Personal Data for legitimate and reasonable purposes, including but not limited to:",
        subs: [
          { ref: "(a)", text: "administering and maintaining personnel records, including medical records and information about your physical and mental health or condition;" },
          { ref: "(b)", text: "paying, reviewing and administering salary and other remuneration and benefits;" },
          { ref: "(c)", text: "undertaking performance appraisals and reviews;" },
          { ref: "(d)", text: "maintaining records for sickness, holiday and other absence, including paternity, childcare or infant care leave;" },
          { ref: "(e)", text: "making decisions about your fitness for work;" },
          { ref: "(f)", text: "providing references and information to future employers, and if necessary, governmental and quasi-governmental bodies, including the relevant tax and statutory authorities;" },
          { ref: "(g)", text: "providing information to current and/or future partners and/or purchasers of the Company and/or its business and/or any Group company or any of their respective businesses;" },
          { ref: "(h)", text: "disciplinary and grievance matters; and" },
          { ref: "(i)", text: "recruitment activities." },
        ],
      },
      {
        id: "pd_transfer",
        text: "**Transfer of Personal Data.** You further understand and agree that Personal Data may if necessary for the above-mentioned purposes, be transferred to third parties, including other Group companies, their advisors, third parties providing products and services, such as IT systems suppliers, pension, benefits, stock options and payroll administrators, as well as regulatory authorities as required by law and relevant stock exchange rules. If your Personal Data is transferred to a country or territory outside {{law}}, we will ensure that the transfer complied with the requirements of the applicable data protection legislation of {{law}}.",
      },
      {
        id: "pd_dpo",
        text: "**Designated Person.** You understand that you should contact the designated data protection officer with any queries, requests or applications that you may have about your Personal Data.",
      },
      {
        id: "pd_rights",
        text: "**Your Rights.** You have the right to access the file containing your Personal Data by making a written application to the Company's human resources department and specifying the information required and to request the correction of any inaccuracies that you identify. The Company reserves the right to charge a fee (representing its costs in administering your request) for supplying such data and to refuse requests which, in its opinion, occur with unreasonable frequency.",
      },
      {
        id: "pd_consent",
        text: "**Consent.** By signing this Agreement, you expressly consent to the Processing and transfer of Personal Data during and after your employment.",
      },
    ],
  },
  {
    id: "user_information",
    heading: "HANDLING OF USER INFORMATION",
    clauses: [
      {
        id: "ui_confidentiality",
        text: "**Confidentiality of Data.** You acknowledge that in the course of your employment with the Company, the personal data of our users, customers, partners and clients of the Company (\"**User Information**\") may be made available to you and that you shall treat such User Information with strict confidentiality and with the highest degree of diligence and care.",
      },
      {
        id: "ui_undertakings",
        text: "**Undertakings.** You undertake that you shall not, without the prior written consent of the Company:",
        subs: [
          { ref: "(a)", text: "transfer User Information to your personal devices, other than as is strictly required in accordance with your employment duties;" },
          { ref: "(b)", text: "disclose any User Information, directly or indirectly, whether verbally, in writing or such other modes of communication, to any third parties or online social media;" },
          { ref: "(c)", text: "handle any User Information in any manner or form which may be inconsistent with the applicable laws, including but not limited to the laws on personal data and data protection; and/or" },
          { ref: "(d)", text: "retain any User Information (whether electronically or physical copies) after the termination of this Agreement." },
        ],
      },
      {
        id: "ui_post",
        text: "**Post-Termination Undertakings.** On the termination of your appointment hereunder howsoever so arising you shall destroy and/or delete all User Information and shall not make reference to the same in any medium or whatsoever. You shall provide a signed written confirmation to the Company stating that such User Information has been deleted.",
      },
      {
        id: "ui_survival",
        text: "**Surviving Provision.** The obligations set forth in this Clause shall remain in full force and effect notwithstanding the termination of this Agreement and/or the expiry of the Term.",
      },
    ],
  },
  {
    id: "ip",
    heading: "INTELLECTUAL PROPERTY",
    clauses: [
      {
        id: "ip_definitions",
        text: "**Definitions.** In this Clause, the following terms are defined as follows:",
        subs: [
          { ref: null, text: "\"**Intellectual Property**\" means any property, works, subject matter, material and information which is protected or protectable pursuant to the copyright, trademark, patent or similar legislation worldwide or any other legislation which may come into existence which creates proprietary rights in intangible objects; and" },
          { ref: null, text: "\"**Intellectual Property Rights**\" means all proprietary and Intellectual Property rights granted in respect of the Intellectual Property including without limitation, all rights in or arising out of patents, trade, service and other marks, layout design rights, registered designs, design rights (and applications for all of the same), copyrights, rights affording equivalent protection to copyrights and design rights, moral rights, trade, product, brand and business names, rights protecting trade secrets and Confidential Information, get-ups and logos, inventions, discoveries, improvements, designs, techniques, computer programs, trade secrets, supply, distributorship, agency and other like agreements, technical and commercial know-how and confidential processes, all other information including rights acquired under licenses or other agreements in connection with any of the same, rights protecting goodwill and reputation and in every case, all other similar corresponding proprietary rights and all applications for the same, whether presently existing or created in the future, anywhere in the world, whether registered or not, and all benefits, privileges, rights to sue, recover damages and obtain relief for any past, current or future infringement, misappropriation or violation of any of the foregoing rights." },
        ],
      },
      {
        id: "ip_ownership",
        text: "**Ownership of Intellectual Property Rights.** You acknowledge that the Company exclusively owns all Intellectual Property Rights in any material created, generated or contributed to by you {{ip_scope}}. You warrant that the Intellectual Property in any material created, generated or contributed to by you {{ip_scope}} does not and will not infringe the Intellectual Property or other rights of a third party and you will indemnify the Company for any loss or damage incurred in the event that you contravene this Clause.",
      },
      {
        id: "ip_assignment",
        text: "**Assignment of Intellectual Property Rights.** You assign to the Company all pre-existing and future Intellectual Property and Intellectual Property Rights in any material created, generated, used or contributed to or by you {{ip_assign_scope}}. You further agree that all materials, documents or computer media containing, comprising or which are necessary for the use of such Intellectual Property and Intellectual Property Rights are the property of the Company and/or the Group.",
      },
      {
        id: "ip_obligations",
        text: "**Obligations.** You must do all things reasonably requested by the Company to enable the Company to perfect the assignment of the Intellectual Property and Intellectual Property Rights. You severally appoint the directors of the Company or any Group company from time to time as your attorney to execute any documents required under this Clause.",
      },
      {
        id: "ip_disputes",
        text: "**Intellectual Property Disputes.** You undertake that:",
        subs: [
          { ref: "(a)", text: "you shall not, at any time or in any way, question, dispute, challenge, infringe or do any act inconsistent with the Company's and/or the Group's ownership of any Intellectual Property and Intellectual Property Rights or do any act that would render the Intellectual Property and Intellectual Property Rights vulnerable to revocation, invalidation or cancellation or otherwise compromise the protection, registration and subsistence of the Intellectual Property and Intellectual Property Rights;" },
          { ref: "(b)", text: "the Intellectual Property Rights in any material created, generated, or contributed to or by you {{ip_scope}} does not and will not infringe the Intellectual Property Rights of any third party;" },
          { ref: "(c)", text: "if you become aware of any infringement or suspected infringement of any Intellectual Property Right in any Intellectual Property, you will promptly notify the Company in writing; and" },
          { ref: "(d)", text: "you will not disclose or make use of any Intellectual Property without the Company's prior written approval of the Company unless the disclosure is necessary for the proper performance of your duties." },
        ],
      },
      {
        id: "moral_rights",
        text: "**Waiver of Moral Rights.** You hereby waive any moral rights that you may have in respect of any Intellectual Property Rights and any other moral rights to which they are or may become entitled to under any legislation now existing or in future enacted anywhere in the world, in respect of the Intellectual Property Rights.",
      },
      {
        id: "ip_survival",
        text: "**Surviving Obligation.** The obligations set forth in this Clause shall remain in full force and effect notwithstanding the termination of this Agreement and/or the expiry of the Term.",
      },
    ],
  },
  {
    id: "general",
    heading: "GENERAL",
    clauses: [
      {
        id: "warranties",
        text: "**Warranties.** You represent and warrant to the Company that:",
        subs: [
          { ref: "(a)", text: "you have the power to execute, deliver and perform your obligations hereunder;" },
          { ref: "(b)", text: "this Agreement constitutes your valid and legally binding obligations enforceable in accordance with its terms; and" },
          { ref: "(c)", text: "the execution, delivery and performance by you of this Agreement will not (i) contravene any existing law, regulation or authorisation to which you are subject or (ii) result in any breach of or default under any agreement or other instrument to which you are a party or are subject." },
        ],
      },
      {
        id: "no_waiver",
        text: "**No Waiver.** No failure or delay on the part of the Company to exercise any power, right or remedy under herein shall operate as a waiver thereof, nor shall any single or partial exercise by the Company of any power, right or remedy preclude any other or further exercise thereof or the exercise of any other power, right or remedy. The remedies provided herein are cumulative and are not exclusive of any remedies provided by law.",
      },
      {
        id: "severability",
        text: "**Severability.** Each of the provisions of this Agreement is severable and distinct from the other and if at any time one or more of such provisions is or becomes invalid, illegal or unenforceable, the validity, legality and enforceability of the remaining provisions hereof shall not in any way be affected or impaired thereby.",
      },
      {
        id: "counterparts",
        text: "**Counterparts.** This Agreement may be signed in any number of counterparts, all of which taken together shall constitute one and the same instrument. Either party may enter into this Agreement by signing any such counterpart and each counterpart shall be as valid and effectual as if executed as an original.",
      },
      {
        id: "third_parties",
        text: "**Contracts (Rights of Third Parties) Act.** Unless expressly provided to the contrary in this Agreement, a person who is not party to this Agreement has no right under {{third_party_statute}} to enforce or enjoy the benefit of any Term of this Agreement.",
      },
      {
        id: "third_parties_group",
        fd: true,
        text: "**Rights of Group Companies.** Any company in the Group may enforce and rely on {{group_clauses}} as if it were a party to this Agreement. Save as aforesaid, a person who is not party to this Agreement has no right under {{third_party_statute}} to enforce or enjoy the benefit of any Term of this Agreement, and the parties may vary or terminate this Agreement without the consent of any such person.",
      },
      {
        id: "variation",
        text: "**Variation.** No purported variation of this Agreement shall be effective unless made in writing and signed by and agreed to by you and the Company.",
      },
      {
        id: "entire",
        text: "**Entire Agreement.** This Agreement shall be in substitution of any previous service agreements, arrangements or understanding between you and any company in the Group and for any terms of employment previously in force, and you acknowledge that you have no outstanding claims of any kind against any company in the Group.",
      },
      {
        id: "law_disputes",
        text: "**Governing Law & Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "This Agreement shall be governed by, and construed in accordance with, the laws of {{governing_law}}." },
          { ref: "(b)", id: "courts", text: "Any dispute arising out of or in connection with this Agreement, including any question regarding its existence, validity or termination, shall be referred to and governed by the exclusive jurisdiction of the courts of {{governing_law}}, without prejudice to your right to bring any claim before an employment tribunal or other statutory body in {{governing_law}} where the law so provides." },
        ],
      },
    ],
  },
];

/* ── wording the questionnaire calls for that the master does not have ── */

/** 1.1 for a fixed term: the first sentence only is replaced. */
export const FIXED_TERM_SENTENCE =
  "Subject to the conditions set out below, your employment hereunder shall commence on the Commencement Date and shall continue until {{end_date}}, when it shall end automatically without the need for notice, unless terminated earlier in accordance with the terms of this Agreement (the \"**Term**\").";
export const PERMANENT_SENTENCE =
  "Subject to the conditions set out below, your employment hereunder shall commence on the Commencement Date and shall continue until it is terminated in accordance with the terms of this Agreement (the \"**Term**\").";

/** 12.8(b) when disputes go to arbitration. */
export const ARBITRATION_TEXT =
  "To the extent permitted by applicable law, any dispute arising out of or in connection with this Agreement, including any question regarding its existence, validity or termination, shall be referred to and finally resolved by arbitration administered by {{arbitral_institution}} in accordance with its arbitration rules for the time being in force, which rules are deemed to be incorporated by reference in this Clause. The seat of the arbitration shall be {{arbitration_seat}}. The tribunal shall consist of one (1) arbitrator and the language of the arbitration shall be English. Nothing in this Clause prevents you from bringing any claim which, under applicable law, may only be brought before an employment tribunal, labour court or other statutory body.";

/** 5.2's opening, by how long confidentiality lasts after the job. */
export const CONFIDENTIALITY_PERIOD: Record<string, { text: string; fd?: boolean }> = {
  indefinite: { text: "during or after the Term without limit in point of time" },
  "5y": { text: "during the Term and for a period of five (5) years after its termination or expiry (and, in respect of any trade secret, without limit in point of time)", fd: true },
  "2y": { text: "during the Term and for a period of two (2) years after its termination or expiry (and, in respect of any trade secret, without limit in point of time)", fd: true },
};

/** The scope of the IP clauses, by who owns what. */
export const IP_SCOPE: Record<string, { own: string; assign: string; fd?: boolean }> = {
  work_related: {
    own: "in connection with your employment",
    assign: "for the purpose of or in connection with the business of the Company and/or your employment",
  },
  all: {
    own: "during the Term, whether or not in connection with your employment and whether or not during working hours",
    assign: "during the Term, whether or not in connection with the business of the Company and/or your employment",
    fd: true,
  },
};

/* ── the close ───────────────────────────────────────────────────────── */

export const CLOSING: string[] = [
  "Please confirm your acceptance of the above terms and conditions of your employment by signing in the acceptance field and returning to us the signed copy of this contract.",
  "Yours sincerely",
  "___________________________",
  "For and on behalf of",
  "**{{COMPANY_NAME}}**",
  "**Name:** {{signatory_name}}",
  "**Designation:** {{signatory_designation}}",
  "**Email:** {{signatory_email}}",
];

export const ACCEPTANCE: string[] = [
  "**ACCEPTANCE**",
  "I, {{employee_name}}, of Passport/Identification No. {{employee_id_no}}, have read, understood and hereby accept and agree to be bound by the terms and conditions of my employment as set out in this Agreement.",
];

/** Under the acceptance: the employee signs and dates it. */
export const ACCEPTANCE_SIGN: string[] = [
  "___________________________",
  "**Signature**",
  "**Name:** {{employee_name}}",
  "**Email:** {{employee_email}}",
  "**Date:**",
];
