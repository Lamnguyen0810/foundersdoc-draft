/**
 * FD Master Contractor Agreement — letter form, from
 * FD_Lite_I_Contractor_Agreement_Master_110325.docx (11 March 2025), the
 * version in which Confidentiality sits under General, as the Master Menu
 * of the same date has it.
 *
 * The approved wording as data. The assembler (assemble.ts) fills the
 * {{fields}}, keeps the clauses the chosen version calls for, picks the
 * variant each answer calls for and drops what does not apply; it never
 * rewrites a sentence of its own.
 *
 * THE MENU. Each clause carries the Master Menu's number and its `tier`:
 * the smallest version it appears in. "basic" is in all three versions,
 * "standard" in Standard and Complex, "complex" in Complex only. Counted
 * from the menu's ticks: Basic 15, Standard 25, Complex 43. (The menu's
 * header says "Cmx [47]" and "Stn [28]"; its ticks give 43 and 25. The
 * ticks are followed.)
 *
 * Markup:
 *   {{field}}      fill in — anything unknown becomes [●] and is reported
 *   {{clause:id}}  "Clause 5.3" — worked out after numbering, so a dropped
 *                  clause never leaves a reference pointing at the wrong place
 *   **bold**       bold, as the master has it
 *
 * `fd: true` marks wording that is NOT in the master: the permutations the
 * questionnaire needs and the master does not have (a non-exclusive
 * engagement, a licence instead of an assignment, a fixed term, ending
 * without notice, a time-limited confidentiality, the courts instead of
 * arbitration, an initial period). They are written in the master's style
 * and listed in the admin console as "FD supplementary — for FD review".
 */

export const MASTER_VERSION = "110325";
export const MASTER_LOADED = true;

export type Tier = "basic" | "standard" | "complex";
export const TIERS: Tier[] = ["basic", "standard", "complex"];
export const TIER_LABEL: Record<Tier, string> = { basic: "Basic", standard: "Standard", complex: "Complex" };

export interface MasterSub {
  /** "(a)", "(i)" … or null for an unnumbered line that carries on the clause. */
  ref: string | null;
  text: string;
  /** Nested (i), (ii) … under this (a). */
  subs?: MasterSub[];
  /** Set by the assembler to leave this one out. */
  id?: string;
  fd?: boolean;
}

export interface MasterClause {
  /** Stable id, for cross-references and the rules. */
  id: string;
  /** The Master Menu's number, "2.2". */
  menu: string;
  /** The Master Menu's title, "Exclusivity". */
  title: string;
  /** The smallest version this clause appears in. */
  tier: Tier;
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
}

/* ── the letter's head ───────────────────────────────────────────────── */

export const HEADER: string[] = [
  "**Name: {{contractor_name}}**",
  "**Address: {{contractor_address}}**",
  "**{{date}}**",
  "Dear {{contractor_salutation}},",
  "**ENGAGEMENT WITH {{COMPANY_NAME}}**",
  "We are pleased to engage you and your contribution will be pivotal to our Company. This agreement of appointment (the \"**Agreement**\") sets out the key terms that will govern the key services provided by {{contractor_name}} ({{contractor_id_label}} {{contractor_id_no}}) (the \"**Key Contractor**\") to {{company_name}} ({{registration_label}}: {{company_reg_no}}) (the \"**Company**\"), a company incorporated in {{company_jurisdiction}}.",
  "You shall be engaged to provide the Services (as defined in {{clause:services}}) to the Company with effect from {{commencement_date}} (the \"**Commencement Date**\"). In consideration for your services, you will be paid a fee of {{fee}} {{fee_basis}}, as may be updated by the Company from time to time.",
  "For the purposes of this Agreement, the words \"**you**\" and \"**your**\" refer to the Key Contractor, references to the \"**Parties**\" shall refer to the Key Contractor and the Company, and the word \"**Party**\" shall be construed accordingly and the reference to the term \"**Group**\" shall include the Company, its subsidiaries and (where applicable), its parent company.",
  "Where applicable, words importing the singular shall include the plural and vice-versa and references to any statute or provision thereof shall be deemed also to refer to any statutory modification or re-enactment thereof or any statutory instrument, order or regulation made thereunder or under such re-enactment.",
];

export const AGREED = "**It is hereby agreed as follows:**";

/* ── the clauses ─────────────────────────────────────────────────────── */

export const SECTIONS: MasterSection[] = [
  {
    id: "engagement",
    heading: "YOUR ENGAGEMENT",
    clauses: [
      {
        id: "services",
        menu: "1.1",
        title: "Services",
        tier: "basic",
        question: "Engagement step",
        text: "**Services.** The Company hereby appoints you as an independent contractor, and you undertake from the Commencement Date to:",
        subs: [
          { ref: "(a)", text: "{{services}} (the \"**Services**\");" },
          { ref: "(b)", text: "perform such other services as may be subsequently agreed between the Parties; and" },
          { ref: "(c)", text: "generally, provide such other services as may be incidental or ancillary to the matters set out in this Agreement." },
        ],
      },
      {
        id: "performance",
        menu: "1.1A",
        title: "Performance",
        tier: "basic",
        question: "Engagement step",
        fd: true,
        text: "**Performance.** Unless otherwise agreed in writing, you shall perform the Services {{performance}}.",
      },
      {
        id: "independent_contractor",
        menu: "1.2",
        title: "Independent Contractor",
        tier: "basic",
        text: "**Independent Contractor.** The Parties acknowledge and agree that it is the express intention that you perform the Services as an independent contractor to the Company. Nothing in this Agreement shall in any way be construed to constitute you as an employee of the Company.",
      },
      {
        id: "reporting_obligation",
        menu: "1.3",
        title: "Reporting Obligation",
        tier: "standard",
        text: "**Reporting Obligation.** You agree and acknowledge that you are obliged to and shall be responsible for reporting as income all compensation received pursuant to this Agreement in accordance with the applicable laws.",
      },
      {
        id: "time_of_essence",
        menu: "1.4",
        title: "Time of Essence",
        tier: "complex",
        text: "**Time of Essence.** Time shall be of the essence in relation to the provision of the Services by you under this Agreement.",
      },
    ],
  },
  {
    id: "obligations",
    heading: "YOUR OBLIGATIONS",
    clauses: [
      {
        id: "obligations",
        menu: "2.1",
        title: "Obligations",
        tier: "basic",
        question: "C3",
        text: "**Obligations.** You hereby undertake to:",
        subs: [
          { ref: "(a)", id: "ob_professional", text: "carry out your obligations under this Agreement with a degree of care, skill, and diligence which would be expected of a professional, skilled and experienced contractor engaged in providing similar services;" },
          { ref: "(b)", id: "ob_instructions", text: "comply with all reasonable requests, directions and instructions issued by the Company from time to time;" },
          { ref: "(c)", id: "ob_updates", text: "keep the Company advised as to your progress in performing the Services and shall, as requested by the Company or any company in the Group, prepare written reports with respect to such progress; and" },
          { ref: "(d)", id: "ob_compliance", text: "ensure that all services (including the Services) provided to the Company are performed in accordance with all applicable laws, legislation, regulations and/or orders or directives from any competent authority." },
        ],
      },
      {
        id: "exclusivity",
        menu: "2.2",
        title: "Exclusivity",
        tier: "standard",
        question: "C4",
        text: "**Exclusivity.** You undertake that during the term of this Agreement, you shall provide services exclusively to the Company and shall not enter into any other agreement or arrangement to provide services to any other person except with the prior written consent of the Company (whether or not such agreement or arrangement constitutes an employment or contracting relationship and whether or not the services provided are similar to the Services).",
      },
      {
        id: "representation",
        menu: "2.3",
        title: "Representation",
        tier: "standard",
        question: "C5",
        text: "**Representation.** You represent and warrant that you have no agreements, relationships, or commitments to any other person or entity that conflicts with the provisions of this Agreement, your obligations to the Company under this Agreement, and/or your ability to perform the Services.",
      },
    ],
  },
  {
    id: "remuneration",
    heading: "REMUNERATION AND COMPENSATION",
    clauses: [
      {
        id: "service_fee",
        menu: "3.1",
        title: "Service Fee",
        tier: "basic",
        question: "Engagement step",
        text: "**Service Fee.** In consideration of your provision of services (including the Services) under this Agreement, the Company shall pay you a service fee of {{fee}} (the \"**Service Fee**\") {{fee_period}}, as may be updated from time to time by the Company. The Service Fee shall be payable {{fee_payable}}.{{benefits_sentence}}",
      },
      {
        id: "expenses",
        menu: "3.2",
        title: "Expenses",
        tier: "standard",
        question: "C6",
        text: "**Expenses.** You shall:",
        subs: [
          { ref: "(a)", text: "bear and pay all outgoings, expenses, payments and disbursements relating to the performance of the Services;" },
          { ref: "(b)", text: "not be entitled to any other remuneration for the services that you provide to the Company; and" },
          { ref: "(c)", text: "be solely responsible for all tax, social security contributions and regulatory issues that may arise, as a result of any payments into and out of {{law_country}} or otherwise, and pursuant to any law in {{law_country}}." },
          { ref: null, id: "expenses_reimbursed", text: "However, expenses incurred with the prior written approval of the Company may be reimbursed by the Company to you at the Company's sole and absolute discretion and shall, where appropriate, be subject to you providing appropriate evidence or receipts." },
        ],
      },
      {
        id: "bank_account",
        menu: "3.3",
        title: "Bank Account",
        tier: "standard",
        text: "**Bank Account.** All payments by the Company to you shall be remitted to your bank account, designated in {{currency}}, details of which shall be provided to the Company in a timely fashion.",
      },
      {
        id: "taxes",
        menu: "3.4",
        title: "Taxes",
        tier: "complex",
        text: "**Taxes.** All taxes and duties levied and/or payable in connection with this Agreement, the provision of the Services by you, and/or any payment contemplated under this Agreement shall be borne by you.",
      },
    ],
  },
  {
    id: "ip",
    heading: "INTELLECTUAL PROPERTY RIGHTS",
    clauses: [
      {
        id: "ip_definitions",
        menu: "4.1",
        title: "Definitions of IP",
        tier: "basic",
        text: "**Definitions.** In this Clause, the following terms are defined as follows:",
        subs: [
          { ref: null, text: "\"**Intellectual Property**\" means any property which is protected or protectable pursuant to the copyright, trademark, patent or similar legislation worldwide or any other legislation which may come into existence which creates proprietary rights in intangible objects; and" },
          { ref: null, text: "\"**Intellectual Property Rights**\" means all intellectual property rights granted in respect of the Intellectual Property including without limitation, all rights in or arising out of patents, trade, service and other marks, layout design rights, registered designs, design rights (and applications for all of the same), copyrights, rights affording equivalent protection to copyrights and design rights, moral rights, trade, product, brand and business names, rights protecting trade secrets and confidential information, get-ups and logos, inventions, discoveries, improvements, designs, techniques, computer programs, trade secrets, supply, distributorship, agency and other like agreements, technical and commercial know-how and confidential processes, all other information including rights acquired under licenses or other agreements in connection with any of the same, rights protecting goodwill and reputation and in every case, all other similar corresponding proprietary rights and all applications for the same, whether presently existing or created in the future, anywhere in the world, whether registered or not, and all benefits, privileges, rights to sue, recover damages and obtain relief for any past, current or future infringement, misappropriation or violation of any of the foregoing rights." },
        ],
      },
      {
        id: "ip_ownership",
        menu: "4.2",
        title: "Ownership of Intellectual Property Rights",
        tier: "basic",
        question: "C7",
        text: "**Ownership of Intellectual Property Rights.** You acknowledge that the Company exclusively owns all Intellectual Property Rights in any material created, generated or contributed to by you in connection with or arising from the provision of the services (including the Services) under this Agreement. You warrant that the Intellectual Property in any material created, generated or contributed to by you in connection with or arising from the provision of the services (including the Services) under this Agreement does not and will not infringe the Intellectual Property or other rights of a third party, and you will indemnify the Company for any loss or damage incurred in the event that you contravene this Clause.",
      },
      {
        id: "ip_assignment",
        menu: "4.3",
        title: "Assignment of Intellectual Property Rights",
        tier: "complex",
        question: "C7",
        text: "**Assignment of Intellectual Property Rights.** You assign to the Company all pre-existing and future Intellectual Property and Intellectual Property Rights in any material created, generated, used, or contributed to or by you in connection with or arising from the provision of the services (including the Services) under this Agreement. You further agree that all materials, documents or computer media containing, comprising or which are necessary for the use of such Intellectual Property and Intellectual Property Rights are the property of the Company and/or the Group.",
      },
      {
        id: "ip_obligations",
        menu: "4.4",
        title: "Obligations",
        tier: "complex",
        question: "C7",
        text: "**Obligations.** You must do all things reasonably requested by the Company to enable the Company to perfect the assignment of the Intellectual Property and Intellectual Property Rights. You severally appoint the directors of the Company (or any Group company) from time to time as your attorney to execute any documents required under this Clause.",
      },
      {
        id: "moral_rights",
        menu: "4.5",
        title: "Waiver of Moral Rights",
        tier: "complex",
        question: "C7",
        text: "**Waiver of Moral Rights.** You hereby waive any moral rights that you may have in respect of any Intellectual Property Rights and any other moral rights to which you are or may become entitled to under any legislation now existing or in future enacted anywhere in the world, in respect of the Intellectual Property Rights.",
      },
      {
        id: "ip_surviving",
        menu: "4.6",
        title: "Surviving Obligation",
        tier: "standard",
        text: "**Surviving Obligation.** The obligations set forth in this Clause shall remain in full force and effect notwithstanding the termination of this Agreement and/or the expiry of the term of this Agreement.",
      },
    ],
  },
  {
    id: "termination",
    heading: "TERMINATION",
    clauses: [
      {
        id: "term",
        menu: "5.1",
        title: "Term",
        tier: "basic",
        question: "C8a / C8b",
        text: "**Term.** The term of this Agreement will begin on the Commencement Date and shall continue until the earlier of (a) the final completion of the Services, as declared by written notice of the Company in its sole and absolute discretion; or (b) termination in accordance with this Clause (the \"**Term**\").",
      },
      {
        id: "initial_period",
        menu: "5.1A",
        title: "Initial Period",
        tier: "basic",
        question: "C14",
        fd: true,
        text: "**Initial Period.** The first three (3) months of the Term shall be an initial period during which either Party may terminate this Agreement on giving the other Party seven (7) days' notice in writing, notwithstanding {{clause:termination}}.",
      },
      {
        id: "termination",
        menu: "5.2",
        title: "Termination",
        tier: "basic",
        question: "C9a / C9b",
        text: "**Termination.** Subject to {{termination_subject}}, each Party may at any time (without specifying any reasons) terminate this Agreement on giving the other Party {{notice_period}} notice in writing{{pay_in_lieu}}.",
      },
      {
        id: "breach",
        menu: "5.3",
        title: "Breach of Agreement",
        tier: "standard",
        question: "C10 / C11",
        text: "**Breach of Agreement.** If you, as determined in the reasonable opinion of the board of directors of the Company:",
        subs: [
          { ref: "(a)", id: "br_serious_breach", text: "commit a breach of this Agreement which in the sole and absolute opinion of the Company is material;" },
          { ref: "(b)", id: "br_misconduct", text: "are guilty of misconduct where such conduct is inconsistent with the due and faithful discharge of your duties;" },
          { ref: "(c)", id: "br_neglect", text: "are guilty of any default, misconduct or neglect in the discharge of your duties hereunder or in connection with or affecting the business of the Company or any company in the Group;" },
          { ref: "(d)", id: "br_incapacity", text: "become of unsound mind or a person whose person or estate is liable to be dealt with in any way under the law relating to mental disorder;" },
          { ref: "(e)", id: "br_criminal", text: "are charged or convicted of any criminal offence (other than an offence which, in the sole and absolute opinion of the Company, does not affect your position or adversely reflect upon your character or integrity);" },
          { ref: "(f)", id: "br_assignment", text: "assign your rights otherwise than in accordance with this Agreement;" },
          { ref: "(g)", id: "br_confidentiality", text: "breach any undertaking under this Agreement, whether of confidentiality or otherwise; or" },
          { ref: "(h)", id: "br_insolvency", text: "are served with any bankruptcy notice or become bankrupt or if you shall apply for a receiving order or have a receiving order made against you or shall enter into any arrangement or composition with your creditors generally," },
          { ref: null, text: "then the Company shall, without prejudice to any other rights or remedies available to it, have the right:" },
          { ref: "(i)", id: "rm_terminate", text: "at any time to terminate the Agreement with immediate effect;" },
          { ref: "(ii)", id: "rm_damages", text: "to recover from you any damages, losses, costs and expenses which the Company may sustain or incur in consequence of such termination. All damages, losses, costs and expenses which are or become recoverable by the Company under this Agreement may be deducted from any money that may then be due to you and any balance remaining unpaid shall be a debt due from you to the Company, and may be set off against any other monies which may be or become due to you by the Company; and" },
          { ref: "(iii)", id: "rm_replace", text: "to carry out and complete the services (including the Services) on its own or contract other person(s) to carry out and complete the Services and you shall be liable for any reasonable expenses incurred, together with any loss sustained by the Company." },
        ],
      },
      {
        id: "assets",
        menu: "5.4",
        title: "Assets",
        tier: "complex",
        text: "**Assets.** For the avoidance of doubt, you shall return any assets of the Company in good working condition to the Company immediately upon the termination of this Agreement.",
      },
    ],
  },
  {
    id: "post_termination",
    heading: "POST-TERMINATION OBLIGATIONS",
    clauses: [
      {
        id: "obligations_on_termination",
        menu: "6.1",
        title: "Obligations Upon Termination",
        tier: "basic",
        text: "**Obligations Upon Termination.** On the termination of your appointment hereunder howsoever so arising, you shall:",
        subs: [
          { ref: "(a)", text: "(where applicable) at any time or from time to time thereafter at the request of the Company resign from office as a director of the Company and all offices (whether as director, officer or otherwise) held by you in any company in the Group without any claim for compensation (save for any claim you may have against the Company hereunder) and in the event of your failure so to do the Company is hereby irrevocably authorised to appoint some person in your name and on your behalf to sign and deliver such resignation or resignations and you shall transfer without payment to the Company or as the Company may direct any shares held by you in trust or as nominee for the Company or any company in the Group. Should you fail to do so, the Company is hereby irrevocably authorised to appoint such person in your name and on your behalf to sign and do any documents or things necessary or requisite to give effect thereto;" },
          { ref: "(b)", text: "forthwith deliver, transfer or cause to be delivered or transferred to the Company or as the Company may direct all books, documents, papers, materials, credit cards, motorcars, club memberships and other property of or relating to the business of the Company and any company in the Group which may be in your possession or under your power or control or held in your name; and" },
          { ref: "(c)", text: "not at any time thereafter represent yourself still to be connected with the Company or any member of the Group." },
        ],
      },
      {
        id: "continuing_obligations",
        menu: "6.2",
        title: "Continuing Obligations",
        tier: "complex",
        question: "C12",
        text: "**Continuing Obligations.**",
        subs: [
          { ref: "(a)", id: "co_no_data", text: "**Handling of Company Property.** You shall not access, download, copy or transfer any data or information which you were provided access to because of your appointment as an independent contractor to the Company. This includes, but is not limited to, information on the websites or electronic portals of any third parties." },
          { ref: "(b)", id: "co_no_disparagement", text: "**Non-Disparagement.** You undertake not to, directly or indirectly, in any manner (orally or in writing) make or publish any statement that would libel, slander, disparage, denigrate, ridicule or criticise the Company or the Company's employees, officers or directors." },
        ],
      },
      {
        id: "pt_surviving",
        menu: "6.3",
        title: "Surviving Obligation",
        tier: "complex",
        text: "**Surviving Obligation.** The obligations set forth in this Clause shall remain in full force and effect notwithstanding the termination of this Agreement and/or the expiry of the Term.",
      },
      {
        id: "restrictive_covenants",
        menu: "6.4",
        title: "Restrictive Covenants",
        tier: "complex",
        question: "C13a / C13b / C13c",
        text: "**Restrictive Covenants.**",
        subs: [
          {
            ref: "(a)",
            text: "**Definitions.** In this {{clause:restrictive_covenants}} (Restrictive Covenants), the following terms are defined as follows:",
            subs: [
              { ref: null, text: "\"**Competitive Activity**\" means any business activity that is directly or indirectly competitive or potentially competitive with products, services, projects or research about which you learned Confidential Information while providing services to the Company. You shall be deemed to be associated with a Competitive Activity if you act as an officer, director, proprietor, employee, partner, investor (other than as a passive holder of less than five per cent. (5%) of the outstanding capital stock of a publicly traded corporation), consultant, advisor, agent, representative, or licenser / sub licensor, or in any other individual or representative capacity with any individual, partnership, corporation or other organisation that is engaged in a Competitive Activity; and" },
              { ref: null, text: "\"**Restricted Territory**\" means {{restricted_territory}} and/or such other jurisdictions that the Company may have a presence in from time to time." },
            ],
          },
          {
            ref: "(b)",
            text: "**Non-Compete and Non-Solicitation.** In consideration of the mutual obligations set out herein, you shall not, during the Term and for a period of {{restricted_months}} after the termination of this Agreement, engage in any of the following activities, directly or indirectly, except on behalf of the Company or the Group:",
            subs: [
              { ref: "(i)", text: "become associated with a Competitive Activity in the Restricted Territory; or" },
              { ref: "(ii)", text: "without the Company's prior written consent, directly or indirectly, solicit any of the Company's employees, officers or consultants to leave their service with the Company or a company in the Group, or attempt to solicit any such persons, either for yourself or for any other person or entity." },
            ],
          },
          { ref: "(c)", text: "**Acknowledgement.** You acknowledge and agree that the obligations under this Clause are necessary to protect the Company's legitimate proprietary interest and to guard against the appropriation of its valuable Confidential Information and consequently to preserve the value, business and goodwill of the Company." },
          { ref: "(d)", text: "**Severance.** The covenants contained in this Clause shall be construed as a series of separate covenants, one for each city, county and state of any geographic area in the Restricted Territory. If, in any judicial or administrative proceeding, a court or arbitrator refuses to enforce any of such separate covenants (or any part thereof), then such unenforceable covenant (or such part) shall be eliminated from this Agreement to the extent necessary to permit the remaining separate covenants (or portions thereof) to be enforced. In the event the provisions of the subsections above are deemed to exceed the time, geographic or scope limitations permitted by applicable law, then such provisions shall be reformed to the maximum time, geographic or scope limitations, as the case may be, then permitted by such law." },
          { ref: "(e)", text: "**Trade Secrets and Confidential Information.** Since you also may obtain in the course of your appointment by reason of services rendered for any other company in the Group knowledge of the trade secrets or other confidential information of such company, you hereby agree that you will at the request and cost of the Company enter into a direct agreement or undertaking with such company whereby you will accept restrictions corresponding to the restrictions herein contained (or such of them as may be appropriate in the circumstances) in relation to such products and services and such area and for such period as such company may reasonably require for the protection of its legitimate interests." },
        ],
      },
    ],
  },
  {
    id: "liability",
    heading: "LIABILITY AND INDEMNITY",
    clauses: [
      {
        id: "liability_indemnity",
        menu: "7.1",
        title: "Liability and Indemnity",
        tier: "standard",
        text: "**Liability and Indemnity.**",
        subs: [
          {
            ref: "(a)",
            text: "You shall be solely responsible for, and shall indemnify, defend, and hold harmless the Company, its affiliates, and their respective directors, officers, employees, agents, and representatives from and against any and all claims, demands, actions, suits, proceedings, damages, losses, liabilities, costs, fines, penalties, and expenses (including legal fees on a full indemnity basis) (collectively, \"**Losses**\") arising out of or in connection with:",
            subs: [
              { ref: "(i)", text: "any breach by you of this Agreement, including any failure to perform your obligations;" },
              { ref: "(ii)", text: "any negligent, reckless, fraudulent, or willful misconduct by you or your employees, agents, or subcontractors;" },
              { ref: "(iii)", text: "any violation of applicable laws, regulations, or third-party rights (including intellectual property or data protection rights) by you; or" },
              { ref: "(iv)", text: "any claim that any work, service, or deliverable provided by you infringes upon, misappropriates, or violates any third-party intellectual property or proprietary rights." },
            ],
          },
          { ref: "(b)", text: "You shall not be responsible for Losses to the extent they are caused directly by the Company's gross negligence or willful misconduct." },
          { ref: "(c)", text: "Your indemnification obligations shall survive termination or expiration of this Agreement." },
        ],
      },
      {
        id: "determination_of_liability",
        menu: "7.2",
        title: "Determination of Liability",
        tier: "standard",
        text: "**Determination of Liability.**",
        subs: [
          { ref: "(a)", text: "You hereby agree that a certificate signed by any duly authorised officer of the Company shall, in the absence of manifest error, be conclusive against you as to the amount of any loss, damage, costs (including legal costs on a full indemnity basis), expense, fine and penalty incurred or suffered by the Company or any company in the Group (as appropriate)." },
          { ref: "(b)", text: "You waive any right to contest such determination except where you can demonstrate manifest error with clear and convincing evidence." },
        ],
      },
      {
        id: "limitation_of_liability",
        menu: "7.3",
        title: "Limitation of Liability",
        tier: "complex",
        text: "**Limitation of Liability.** In no event shall the Company be liable to you or to any other party for any indirect, incidental, special or consequential damages, or damages for lost profits or loss of business, however caused and under any theory of liability, whether based in contract, tort (including negligence) or other theory of liability.",
      },
    ],
  },
  {
    id: "general",
    heading: "GENERAL",
    clauses: [
      {
        id: "nature_of_relationship",
        menu: "8.1",
        title: "Nature of Relationship",
        tier: "basic",
        text: "**Nature of Relationship.** Nothing in this Agreement shall create, or be deemed to create, a partnership, employment relationship, a relationship of principal and agent, or any other relationship of a similar nature between the Parties.",
      },
      {
        id: "confidentiality",
        menu: "8.2",
        title: "Confidentiality",
        tier: "standard",
        question: "C15",
        text: "**Confidentiality.**{{confidentiality_period}}",
        subs: [
          {
            ref: "(a)",
            text: "**Definition.** In this Clause, the following terms shall have the meaning set out below:",
            subs: [
              { ref: null, text: "\"**Confidential Information**\" means all Information furnished to or acquired by you for the purpose of this Agreement or in the discharge of your duties under this Agreement or the performance of the Services, whether before or after the date hereof, but does not include information which (a) is or becomes generally available to the public other than as a result of a disclosure by you or any of your servants or agents in breach of any of your duties or obligations to the Company; or (b) becomes available to you otherwise than for the purpose of or in the course of the provision of services (including the Services) or the discharge of your duties under this Agreement." },
              { ref: null, text: "\"**Information**\" means information whether written or oral or any other form, including, but not limited to, documentation, training manuals, equipment manuals, operations and maintenance manuals, instruction manuals, specifications, reports, data, notes, drawings, models, patterns, samples, software, computer outputs, designs, circuit diagrams or inventions, whether patentable or not and know-how." },
            ],
          },
          {
            ref: "(b)",
            text: "**Permitted Disclosure.** You shall maintain and cause to be maintained the confidentiality of all Confidential Information and shall not without the Company's prior written consent, copy or use or disclose or permit the use by or disclosure to any person of any such Confidential Information, save and to the extent that such use or disclosure is necessary:",
            subs: [
              { ref: "(i)", text: "for the discharge of your obligations or the performance of any services (including the Services) under this Agreement; or" },
              { ref: "(ii)", text: "to comply with any statutory requirements in {{law}}." },
            ],
          },
          { ref: "(c)", text: "**Return of Information.** You shall, upon the expiry of the Term, return to the Company all documents, files, tapes, disks and any other things on or in which any such Confidential Information may be recorded or contained." },
          {
            ref: "(d)",
            text: "**Handling User Information.**",
            subs: [
              { ref: "(i)", text: "**Confidentiality of Client Data.** You acknowledge that in your provision of the services (including the Services) under this Agreement to the Company, the personal data of the Company's users, customers, partners, content creators, influencers and clients (\"**User Information**\") may be made available to you and that you shall treat such User Information with strict confidentiality and with the highest degree of diligence and care." },
              {
                ref: "(ii)",
                text: "**Undertakings.** You undertake that you shall not, without the prior written consent of the Company:",
                subs: [
                  { ref: "(A)", text: "transfer User Information to your personal devices, other than as is strictly required in accordance with your obligations under this Agreement;" },
                  { ref: "(B)", text: "disclose any User Information, directly or indirectly, whether verbally, in writing or such other modes of communication, to any third parties or online social media;" },
                  { ref: "(C)", text: "handle any User Information in any manner or form which may be inconsistent with the applicable laws, including but not limited to the laws on personal data and data protection; and/or" },
                  { ref: "(D)", text: "retain any User Information (whether electronically or physical copies) after the termination of this Agreement." },
                ],
              },
              { ref: "(iii)", text: "**Post-Termination Undertakings.** On the termination of your appointment hereunder howsoever so arising, you shall destroy and/or delete all User Information and shall not make reference to the same in any medium or whatsoever. You shall also provide a signed written confirmation to the Company stating that such User Information has been deleted." },
              { ref: "(iv)", text: "**Surviving Provision.** The obligations set forth in this {{clause:confidentiality}}(d) (Handling User Information) shall remain in full force and effect notwithstanding the termination of this Agreement and/or the expiry of the Term." },
            ],
          },
        ],
      },
      {
        id: "data_protection",
        menu: "8.3",
        title: "Data Protection",
        tier: "complex",
        question: "C16",
        text: "**Data Protection.**",
        subs: [
          {
            ref: "(a)",
            text: "**Definitions.** In this Clause, the following terms are defined as follows:",
            subs: [
              { ref: null, text: "\"**Personal Data**\" means any information about you, including but not limited to your name, address, references, bank details, work skills and career achievements, benefits, work records, management and organisational appraisals and data held for legal purposes, and shall include information about any next of kin, if appropriate, and/or other persons about whom data may be collected." },
              { ref: null, text: "\"**Processing**\" or \"**Process**\" means carrying out any operation or set of operations on Personal Data including, but not limited to, collecting, obtaining, organising, consulting, using, disclosing or destroying." },
            ],
          },
          { ref: "(b)", text: "**Processing of Personal Data.** You acknowledge that the Company, by itself or through third parties, will Process Personal Data and that this Personal Data may be used for personnel, administration and management purposes in connection with this Agreement. You agree that the Company may use Personal Data for, amongst others, administering and maintaining records, paying and reviewing service payments, providing information to current and/or future partners and/or purchasers of the Company or any of its business, and disciplinary and grievance matters." },
          { ref: "(c)", text: "**Transfer of Personal Data.** You further understand and agree that Personal Data may, if necessary for the above-mentioned purposes, be transferred to third parties, including advisors and third parties providing products and services, such as IT systems suppliers and payroll administrators, as well as regulatory authorities as required by law and relevant stock exchange rules. If Personal Data is transferred to a country or territory outside {{law_country}}, the Company will ensure that the recipients thereof provide a standard of protection to the personal data so transferred that is comparable to that which is provided under the applicable personal data protection laws and regulations." },
          { ref: "(d)", text: "**Consent.** By signing this Agreement, you expressly consent to the Processing and transfer of Personal Data during and after the Term." },
        ],
      },
      {
        id: "notices",
        menu: "8.4",
        title: "Notices",
        tier: "complex",
        text: "**Notices.** All notices and communications given under this Agreement must be in writing and will be delivered, sent by post or sent by email to the postal address or the email address as set out in the signature page (or at such other address as notified from time to time by the relevant Party). The default mode of communication under this Agreement is by way of email communication.",
      },
      {
        id: "waiver",
        menu: "8.5",
        title: "Waiver",
        tier: "complex",
        text: "**Waiver.** No failure on the part of either Party to exercise, and no delay on its or your part in exercising, any right or remedy under this Agreement will operate as a waiver thereof, nor will any single or partial exercise of any right or remedy preclude any other or further exercise thereof or the exercise of any other right or remedy. The rights and remedies provided in this Agreement are cumulative and not exclusive of any other rights or remedies (whether provided by law or otherwise).",
      },
      {
        id: "amendments",
        menu: "8.6",
        title: "Amendments",
        tier: "basic",
        text: "**Amendments.** Any provision of this Agreement may be amended, varied or supplemented only if the Parties so agree in writing and any provision or breach of any provision of this Agreement may be waived only if the relevant Party so agrees in writing. Any waiver or consent given by the relevant Party under any provision of this Agreement must also be in writing. Any such waiver or consent may be given subject to any conditions thought fit by that Party and shall be effective only in the instance and for the purpose for which it is given.",
      },
      {
        id: "assignment",
        menu: "8.7",
        title: "Assignment",
        tier: "basic",
        text: "**Assignment.** All rights and benefits hereunder are personal to the Parties hereto and may not be assigned at law or in equity without the prior written consent of the other Party hereto, save that the Company may assign this Agreement to any Company in the Group without your consent.",
      },
      {
        id: "third_parties",
        menu: "8.8",
        title: "Third Parties",
        tier: "complex",
        text: "**Third Parties.** A person who is not a Party to this Agreement (other than a permitted assignee to whom rights have been assigned in accordance with {{clause:assignment}} (Assignment)) shall have no right under {{third_party_statute}} to enforce any of the terms of this Agreement.",
      },
      {
        id: "partial_invalidity",
        menu: "8.9",
        title: "Partial Invalidity",
        tier: "basic",
        text: "**Partial Invalidity.** The illegality, invalidity or unenforceability of any provision of this Agreement under the laws of any jurisdiction shall not affect its legality, validity or enforceability under the laws of any other jurisdiction nor the legality, validity or enforceability of any other provision of this Agreement.",
      },
      {
        id: "survival",
        menu: "8.10",
        title: "Survival",
        tier: "complex",
        text: "**Survival.** The termination of this Agreement shall not affect or discharge any rights, obligations and liabilities accrued or incurred prior to or upon termination of this Agreement. The termination of this Agreement shall not relieve the Parties of their respective obligations hereunder that by their nature should survive such expiration or termination.",
      },
      {
        id: "entire_agreement",
        menu: "8.11",
        title: "Entire Agreement",
        tier: "complex",
        text: "**Entire Agreement.** This Agreement contains the entire Agreement between the Parties with respect to its subject-matter and all previous written or oral understanding discussions representations correspondence and communications between the Parties relating to the matters covered by this Agreement are superseded.",
      },
      {
        id: "governing_law",
        menu: "8.12",
        title: "Governing Law",
        tier: "basic",
        question: "C1a",
        text: "**Governing Law.** This Agreement shall be governed by, and construed in accordance with, the laws of {{governing_law}}.",
      },
      {
        id: "dispute_resolution",
        menu: "8.13",
        title: "Dispute Resolution",
        tier: "basic",
        question: "C1a / C1b",
        text: "**Dispute Resolution.** {{dispute_resolution}}",
      },
      {
        id: "counterparts",
        menu: "8.14",
        title: "Counterparts",
        tier: "complex",
        text: "**Counterparts.** This Agreement may be signed in counterpart, each of which shall be deemed an original, with the same force and effectiveness as though executed in a single document.",
      },
      {
        id: "anti_bribery",
        menu: "8.15",
        title: "Anti-Bribery",
        tier: "complex",
        text: "**Anti-Bribery.** Each Party hereby undertakes that, as of the Commencement Date, such Party and/or its directors, officers or employees have not offered, promised, given, authorised, solicited or accepted any undue pecuniary or other advantage of any kind (or implied that they will or might do any such thing at any time in the future) in any way connected with this Agreement and they have taken reasonable measures to prevent subcontractors, agents or any other third parties, subject to its control or determining influence, from doing so.",
      },
    ],
  },
];

/* ── wording the questionnaire calls for that the master does not have ── */

/** 2.2 when the engagement is not exclusive (C4). The master's own 2.2 has
 *  only the exclusive wording, with brackets; this is the other permutation
 *  the Master Menu asks for. */
export const NON_EXCLUSIVE_TEXT =
  "**Non-Exclusivity.** This Agreement is not exclusive. You may provide services to other persons during the Term, provided that doing so does not conflict with your obligations under this Agreement, your obligations of confidentiality to the Company or your ability to perform the Services.";

/** 4.2 when the Contractor keeps the IP and licenses it (C7). */
export const IP_LICENCE_TEXT =
  "**Licence of Intellectual Property Rights.** You retain ownership of the Intellectual Property Rights in any material created, generated or contributed to by you in connection with or arising from the provision of the services (including the Services) under this Agreement, and you hereby grant to the Company and the Group a perpetual, irrevocable, worldwide, royalty-free, non-exclusive licence to use, copy, modify and distribute such material for the purposes of the business of the Company and the Group. You warrant that such material does not and will not infringe the Intellectual Property or other rights of a third party, and you will indemnify the Company for any loss or damage incurred in the event that you contravene this Clause.";

/** 5.1 by how long the engagement lasts (C8a). */
export const TERM_TEXT: Record<string, { text: string; fd?: boolean }> = {
  until_complete: {
    text: "**Term.** The term of this Agreement will begin on the Commencement Date and shall continue until the earlier of (a) the final completion of the Services, as declared by written notice of the Company in its sole and absolute discretion; or (b) termination in accordance with this Clause (the \"**Term**\").",
  },
  fixed: {
    text: "**Term.** The term of this Agreement will begin on the Commencement Date and shall continue until the earlier of (a) {{end_date}}, when it shall end automatically without the need for notice; or (b) termination in accordance with this Clause (the \"**Term**\").",
    fd: true,
  },
  until_terminated: {
    text: "**Term.** The term of this Agreement will begin on the Commencement Date and shall continue until it is terminated in accordance with this Clause (the \"**Term**\").",
    fd: true,
  },
};

/** 5.2 when either side may end it without notice (C9a). */
export const NO_NOTICE_TEXT =
  "**Termination.** Subject to {{termination_subject}}, either Party may terminate this Agreement at any time (without specifying any reasons) with immediate effect by notifying the other Party in writing, without any period of notice and without any payment in lieu of notice.";

/** 5.2's payment-in-lieu tail (C9a). */
export const PAY_IN_LIEU_TAIL = " or giving a payment of {{notice_period}} Service Fee in lieu of notice thereof";

/** 8.2's opening sentence by how long confidentiality lasts (C15). Blank
 *  for "forever": the master's clause is unlimited in time as it stands. */
export const CONFIDENTIALITY_PERIOD: Record<string, { text: string; fd?: boolean }> = {
  forever: { text: "" },
  while_engaged: { text: " The obligations in this Clause apply during the Term only.", fd: true },
  "5y": { text: " The obligations in this Clause apply during the Term and for a period of five (5) years after its termination or expiry (and, in respect of any trade secret, without limit in point of time).", fd: true },
  "2y": { text: " The obligations in this Clause apply during the Term and for a period of two (2) years after its termination or expiry (and, in respect of any trade secret, without limit in point of time).", fd: true },
};

/** 8.13 when the Company and the Contractor are in the same country: the
 *  courts, as the Master Menu directs ("exclusive jurisdiction of the
 *  courts; SIAC only where there is a cross-border element"). */
export const COURTS_TEXT =
  "Any dispute arising out of or in connection with this Agreement, including any question regarding its existence, validity or termination, shall be referred to and governed by the exclusive jurisdiction of the courts of {{governing_law}}.";

/** 8.13 when there is a cross-border element: the master's arbitration
 *  clause, with the institution and seat for the governing law. */
export const ARBITRATION_TEXT =
  "Any dispute arising out of or in connection with this Agreement, including any question regarding its existence, validity or termination, shall be referred to and finally resolved by arbitration administered by {{arbitral_institution}} (\"**{{arbitral_short}}**\") in accordance with the arbitration rules of the {{arbitral_short}} for the time being in force, which rules are deemed to be incorporated by reference in this Clause. The seat of the arbitration shall be {{arbitration_seat}}. The language of the arbitration shall be English.";

/* ── the close ───────────────────────────────────────────────────────── */

export const CLOSING: string[] = [
  "Please confirm your acceptance of the above terms and conditions by signing in the acknowledgement portion and returning to us the signed copy of this Agreement.",
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
  "I, {{acceptor}}, have read, understood and hereby accept and agree to be bound by the terms and conditions of this Agreement.",
];

/** Under the acceptance: the Contractor signs and dates it. */
export const ACCEPTANCE_SIGN: string[] = [
  "___________________________",
  "**Signature**",
  "**Name:** {{acceptor_name}}",
  "**Email:** {{contractor_email}}",
  "**Date:**",
];
