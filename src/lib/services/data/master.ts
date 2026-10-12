/**
 * Services Agreement — the wording FD AI assembles from.
 *
 * SOURCE. Two Singapore-law precedents (names redacted):
 *
 *   A  a platform service agreement drafted for the service provider, and
 *      FD AI's review of it — for the provider (aggregate cap, the
 *      indemnity outside the cap, suspension for non-payment, notices,
 *      affiliates and subcontractors, survival) and for the customer (fee
 *      increases by agreement, a narrower indemnity, a twelve-month claims
 *      period, uptime and support levels, no material change without
 *      consent);
 *   B  an advisory services agreement — appointment, reasonable skill and
 *      care, no guarantee of outcome, retainer and success fee, invoices
 *      disputed within fourteen days, 1% a month interest, the company's
 *      information duties, a cap of the fees paid, thirty days' notice.
 *
 * Both are generalised to "the Service Provider" and "the Customer" (B
 * said "the Advisor" and "the Company"). Where the two sides of a point
 * differ, both versions are kept and keyed (`when`); the assembler picks
 * by the answers. `fd: true` marks wording in neither precedent, written
 * in their style (data protection, force majeure, IP in deliverables, the
 * provider's IP indemnity …). ADAPTATIONS lists what was generalised;
 * CORRECTIONS the precedents' slips that are fixed here.
 *
 * Markup, as the other masters: {{field}}, {{clause:id}}, {{section:id}},
 * **bold**.
 */

export const MASTER_VERSION = "SV-V1";
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

export const TITLE = "SERVICES AGREEMENT";
export const MADE_ON = "This Services Agreement (the \"**Agreement**\") is made on {{date}}";
export const BETWEEN = "Between:";
export const PARTY_COMPANY =
  "{{name}} (Registration Number {{id_no}}), a company incorporated in {{jurisdiction}} with its registered office at {{address}}";
export const PARTY_INDIVIDUAL = "{{name}} (NRIC / Passport Number {{id_no}}), of {{address}}";
export const PARTIES_COLLECTIVE = "(each a \"**Party**\" and together the \"**Parties**\").";
export const BACKGROUND = "BACKGROUND";
export const RECITALS = {
  provider: "The Service Provider provides {{services_short}}.",
  wish: "The Customer wishes to engage the Service Provider to provide the Services, and the Service Provider has agreed to do so, on the terms and conditions of this Agreement.",
};
export const AGREED = "IT IS AGREED as follows:";

/* ── the definitions ──────────────────────────────────────────────────── */

export interface Definition {
  term: string;
  text: string;
  /** Keyed condition (see assemble.ts → keep()). */
  when?: string;
}

export const DEFINITIONS: Definition[] = [
  { term: "Affiliate", text: "means, in relation to a Party, any entity that directly or indirectly controls, is controlled by, or is under common control with that Party;" },
  { term: "Applicable Law", text: "means all laws, regulations and binding codes that apply to a Party or to the Services from time to time, including the PDPA;" },
  { term: "Authorised Users", text: "means the employees and contractors of the Customer whom the Customer permits to use the Platform in accordance with this Agreement;", when: "platform" },
  { term: "Background IP", text: "means all Intellectual Property Rights owned by or licensed to the Service Provider before the Commencement Date or developed independently of this Agreement, including its methodologies, templates, tools and know-how;", when: "professional" },
  { term: "Business Day", text: "means a day (other than a Saturday, Sunday or public holiday) on which banks are open for general business in Singapore;" },
  { term: "Commencement Date", text: "means {{commencement}};" },
  { term: "Confidential Information", text: "means all non-public information, in any form, relating to a Party or its Affiliates, business, customers, finances, technology or affairs, disclosed to or obtained by the other Party in connection with this Agreement, including the terms of this Agreement;" },
  { term: "Customer Data", text: "means all data, information and materials (including personal data) provided by or on behalf of the Customer, or uploaded to or processed through the Services by or for the Customer or its Authorised Users;", when: "platform" },
  { term: "Customer Materials", text: "means all information, documents, data and materials provided by or on behalf of the Customer to the Service Provider in connection with the Services;", when: "professional" },
  { term: "Deliverables", text: "means the deliverables described in Schedule 1 and all other documents, reports and materials prepared by the Service Provider specifically for the Customer in performing the Services;", when: "professional" },
  { term: "Documentation", text: "means the user guides and other documentation for the Platform made available by the Service Provider from time to time;", when: "platform" },
  { term: "Fees", text: "means the fees set out in Schedule 2;" },
  { term: "GST", text: "means goods and services tax chargeable in Singapore;" },
  { term: "Initial Term", text: "has the meaning given to it in {{clause:term_start}};", when: "fixed_term" },
  { term: "Intellectual Property Rights", text: "means patents, rights to inventions, copyright and related rights, trade marks, business names and domain names, rights in designs, rights in computer software, database rights, rights in confidential information (including know-how and trade secrets) and all other intellectual property rights, in each case whether registered or unregistered, and all similar rights anywhere in the world;" },
  { term: "Outputs", text: "means the reports, results and other output generated by the Platform from the Customer Data;", when: "platform" },
  { term: "PDPA", text: "means the Personal Data Protection Act 2012 of Singapore;" },
  { term: "Platform", text: "means the Service Provider's software platform and related online services through which the Services are provided, as described in Schedule 1, including any updates to it;", when: "platform" },
  { term: "Renewal Period", text: "has the meaning given to it in {{clause:term_renewal}};", when: "auto_renew" },
  { term: "Services", text: "means the services described in Schedule 1, as varied in accordance with this Agreement;" },
  { term: "Success Fee", text: "has the meaning given to it in Schedule 2;", when: "success" },
  { term: "Term", text: "means the period described in {{section:term}};" },
];

export const INTERPRETATION = [
  "Clause and Schedule headings are for convenience only and do not affect interpretation. The Schedules form part of this Agreement.",
  "References to a person include a body corporate and an unincorporated body; the singular includes the plural and vice versa.",
  "The words \"including\" and \"include\" are illustrative and do not limit the words before them.",
  "References to a statute include it as amended or re-enacted from time to time.",
  "\"{{cur_word}}\" means {{cur_name}}.",
];

/* ── the body ─────────────────────────────────────────────────────────── */

export const SECTIONS: MasterSection[] = [
  {
    id: "definitions",
    heading: "DEFINITIONS AND INTERPRETATION",
    clauses: [
      { id: "definitions", text: "**Definitions.** In this Agreement, unless the context otherwise requires:" },
      { id: "interpretation", text: "**Interpretation.** In this Agreement:" },
    ],
  },
  {
    id: "services",
    heading: "APPOINTMENT AND SERVICES",
    clauses: [
      { id: "appointment", text: "**Appointment.** The Customer appoints the Service Provider to provide the Services, and the Service Provider agrees to provide them, on the terms of this Agreement." },
      {
        id: "access",
        when: "platform",
        text: "**Access to the Platform.** Subject to the Customer paying the Fees and complying with this Agreement, the Service Provider grants the Customer a non-exclusive, non-transferable right during the Term for the Customer and its Authorised Users to access and use the Platform and the Documentation for the Customer's internal business purposes.",
      },
      {
        id: "standard",
        text: "**Standard of Service.** The Service Provider shall provide the Services with reasonable skill, care and diligence, in accordance with good industry practice and Applicable Law, using suitably qualified personnel, and shall keep the Customer reasonably informed of progress.",
      },
      {
        id: "no_guarantee",
        when: "pro_provider",
        text: "**No Guarantee of Outcome.** The Service Provider does not guarantee that any particular result, transaction or outcome will be achieved through the Services.",
      },
      {
        id: "deliverables_provider",
        when: "deliverables_provider",
        fd: true,
        text: "**Deliverables.** The Service Provider shall use reasonable efforts to deliver the Deliverables by any dates set out in Schedule 1. A Deliverable is accepted unless, within five (5) Business Days of delivery, the Customer notifies the Service Provider in writing, with reasons, that it does not materially conform to Schedule 1, in which case the Service Provider shall correct the non-conformity and re-deliver it.",
      },
      {
        id: "deliverables_customer",
        when: "deliverables_customer",
        fd: true,
        text: "**Deliverables.** The Service Provider shall deliver the Deliverables by the dates set out in Schedule 1 or, where none is set, within a reasonable time. If a Deliverable does not conform to Schedule 1 in any material respect, the Customer may reject it by written notice within ten (10) Business Days of delivery, and the Service Provider shall correct and re-deliver it at its own cost. This is without prejudice to the Customer's other rights and remedies.",
      },
      {
        id: "changes_free",
        when: "changes_free",
        text: "**Changes to the Services.** The Service Provider may at any time vary, enhance, suspend, replace or discontinue the Services or any part of them, including by updating Schedule 1 on written notice to the Customer.",
      },
      {
        id: "changes_terminate",
        when: "changes_terminate",
        text: "**Changes to the Services.** The Service Provider may at any time vary, enhance, suspend, replace or discontinue the Services or any part of them, including by updating Schedule 1 on written notice to the Customer. The Service Provider shall use reasonable efforts to give advance notice of any material reduction in the Services. If a material reduction (other than one caused by the Customer, a third-party licence issue, maintenance, a security risk or a legal requirement) materially and adversely affects the Customer's ability to use the core functionality of the Services for more than thirty (30) consecutive days, the Customer may terminate this Agreement by written notice as its sole and exclusive remedy for that reduction.",
      },
      {
        id: "changes_consent",
        when: "changes_consent",
        text: "**Changes to the Services.** The Service Provider may update and improve the Services from time to time, provided that it shall not materially reduce, replace, suspend or discontinue the Services or any material part of them without the Customer's prior written consent, save to the extent reasonably necessary for security, compliance with Applicable Law, planned or emergency maintenance, or a change by a third-party supplier on which the Services depend, in which case the Service Provider shall give the Customer as much notice as is reasonably practicable and use reasonable efforts to minimise the effect on the Customer.",
      },
      {
        id: "levels_standard",
        when: "levels_standard",
        text: "**Service Levels.** The Service Provider shall provide support for, and use commercially reasonable efforts to make the Platform available in accordance with, the service levels in Part 2 of Schedule 1.",
      },
      {
        id: "levels_efforts",
        when: "levels_efforts",
        text: "**Availability.** The Service Provider shall use commercially reasonable efforts to make the Platform available, save for planned maintenance, emergency maintenance and events beyond its reasonable control. The Service Provider does not warrant that the Services will be uninterrupted or error-free.",
      },
      {
        id: "subcontract_provider",
        when: "provider",
        text: "**Affiliates and Subcontractors.** The Service Provider may perform the Services through its Affiliates and subcontractors, and remains responsible for their acts and omissions as if they were its own.",
      },
      {
        id: "subcontract_customer",
        when: "customer",
        text: "**Subcontractors.** The Service Provider shall not subcontract any material part of the Services without the Customer's prior written consent (not to be unreasonably withheld), and remains responsible for the acts and omissions of its subcontractors as if they were its own.",
      },
      { id: "not_agent", text: "**No Authority.** The Service Provider is not authorised to bind the Customer, or to hold itself out as the Customer's agent, save as expressly instructed by the Customer in writing." },
    ],
  },
  {
    id: "term",
    heading: "TERM",
    clauses: [
      { id: "term_start", when: "fixed_term", text: "**Term.** This Agreement starts on the Commencement Date and, unless terminated earlier in accordance with {{section:termination}}, continues for {{term_words}} (the \"**Initial Term**\")." },
      { id: "term_complete", when: "until_complete", text: "**Term.** This Agreement starts on the Commencement Date and, unless terminated earlier in accordance with {{section:termination}}, continues until the Services have been completed." },
      {
        id: "term_renewal",
        when: "auto_renew",
        text: "**Renewal.** At the end of the Initial Term, this Agreement renews automatically for successive periods of twelve (12) months (each a \"**Renewal Period**\") unless either Party gives the other at least thirty (30) days' written notice of non-renewal before the end of the Initial Term or the then-current Renewal Period.",
      },
      { id: "term_agreed", when: "agreed_renew", text: "**Renewal.** This Agreement may be renewed or extended only by written agreement of the Parties." },
      { id: "term_licence", when: "platform_provider", text: "**Third-Party Licences.** The Term shall not extend beyond the term of any third-party software or data licence on which the Service Provider relies to provide the Services, of which the Service Provider shall give the Customer reasonable notice." },
    ],
  },
  {
    id: "fees",
    heading: "FEES AND PAYMENT",
    clauses: [
      { id: "fees_pay", text: "**Fees.** In consideration of the Services, the Customer shall pay the Fees in accordance with Schedule 2." },
      {
        id: "fees_invoices_provider",
        when: "provider",
        text: "**Invoices.** The Service Provider shall invoice the Fees as set out in Schedule 2. Each invoice is payable within {{pay_days}} of its date, without set-off, deduction or counterclaim, by bank transfer to the account notified by the Service Provider in writing.",
      },
      {
        id: "fees_invoices_customer",
        when: "customer",
        text: "**Invoices.** The Service Provider shall invoice the Fees as set out in Schedule 2, with reasonable supporting detail. Each undisputed invoice is payable within {{pay_days}} of its receipt, by bank transfer to the account notified by the Service Provider in writing.",
      },
      {
        id: "fees_dispute_provider",
        when: "provider",
        text: "**Disputed Invoices.** If the Customer disputes any part of an invoice in good faith, it shall pay the undisputed portion by the due date and notify the Service Provider in writing of the disputed portion, with reasons, within fourteen (14) days of the invoice date, failing which the invoice is deemed accepted.",
      },
      {
        id: "fees_dispute_customer",
        when: "customer",
        text: "**Disputed Invoices.** If the Customer disputes any part of an invoice in good faith, it shall pay the undisputed portion by the due date and notify the Service Provider of the disputed portion, with reasons. The Parties shall resolve the dispute in good faith, and the disputed portion is not overdue while it is being resolved.",
      },
      { id: "fees_interest", when: "interest", text: "**Late Payment.** If any undisputed sum is not paid when due, the Service Provider may charge interest on the overdue amount at the rate of one per cent (1%) per month, accruing daily from the due date until payment, both before and after any judgment." },
      { id: "fees_expenses", when: "professional", text: "**Expenses.** The Customer shall reimburse the Service Provider for reasonable out-of-pocket expenses incurred in performing the Services that the Customer has approved in advance in writing, on production of receipts." },
      { id: "fees_gst", text: "**GST.** All Fees are exclusive of GST, which, where applicable, shall be charged in addition at the prevailing rate on a valid tax invoice." },
      {
        id: "fees_increase_notice",
        when: "increase_notice",
        text: "**Fee Increases.** The Service Provider may increase the Fees with effect from the start of any Renewal Period by giving the Customer at least sixty (60) days' written notice. If the Customer does not accept the increase, it may give notice of non-renewal before the start of that Renewal Period, and the then-current Fees continue to apply until the end of the then-current Term.",
      },
      {
        id: "fees_increase_agreed_renewal",
        when: "increase_notice_no_auto",
        text: "**Fee Increases.** The Service Provider may propose revised Fees for any renewal or extension by giving reasonable prior written notice. Revised Fees apply only if agreed in writing by both Parties; failing such agreement, this Agreement expires at the end of the then-current Term unless the Parties agree in writing to renew on the then-current Fees.",
      },
      { id: "fees_increase_mutual", when: "increase_mutual", text: "**Fee Increases.** The Fees may only be increased by written agreement of both Parties. If no increase is agreed, the then-current Fees continue to apply." },
      {
        id: "fees_suspend_provider",
        when: "provider",
        text: "**Suspension for Non-Payment.** If any undisputed amount is not paid within seven (7) days after written notice that it is overdue, the Service Provider may suspend the Services (including access to the Platform) until all overdue amounts are paid in full, without prejudice to the Customer's obligation to pay the Fees accrued during the suspension and without limiting the Service Provider's other rights and remedies.",
      },
      {
        id: "fees_suspend_customer",
        when: "customer",
        text: "**Suspension for Non-Payment.** If any undisputed amount remains unpaid for more than thirty (30) days after written notice that it is overdue, the Service Provider may, on a further seven (7) days' written notice, suspend the Services until it is paid. The Service Provider shall promptly restore the Services once the overdue amount is paid.",
      },
    ],
  },
  {
    id: "customer",
    heading: "CUSTOMER OBLIGATIONS",
    clauses: [
      {
        id: "cooperate",
        text: "**Co-operation.** The Customer shall provide the Service Provider with such information, documents, access and assistance as the Service Provider reasonably requires to perform the Services, and shall ensure that all information it provides is, so far as it is aware, accurate and not misleading.",
      },
      {
        id: "users",
        when: "platform",
        text: "**Authorised Users.** The Customer shall ensure that its Authorised Users keep their log-in details confidential and use the Platform only in accordance with this Agreement and the Documentation, and is responsible for their acts and omissions as if they were its own. The Customer shall not, and shall ensure that its Authorised Users do not:",
        subs: [
          { ref: "(a)", text: "copy, modify, reverse engineer, decompile or create derivative works of the Platform, save as permitted by Applicable Law;" },
          { ref: "(b)", text: "sell, sublicense, rent or otherwise make the Platform available to any third party;" },
          { ref: "(c)", text: "use the Platform to build a competing product or service;" },
          { ref: "(d)", text: "attempt to gain unauthorised access to, or interfere with or circumvent the security of, the Platform; or" },
          { ref: "(e)", text: "use the Platform for any unlawful purpose or to upload any material that infringes the rights of any third party." },
        ],
      },
      {
        id: "data_rights",
        when: "platform",
        text: "**Customer Data.** The Customer is responsible for the accuracy, quality and legality of the Customer Data and for having all rights and consents needed for the Service Provider to use it as contemplated by this Agreement. The Customer grants the Service Provider a non-exclusive, royalty-free licence to use the Customer Data during the Term solely to provide the Services.",
      },
      {
        id: "materials_rights",
        when: "professional",
        text: "**Customer Materials.** The Customer grants the Service Provider a non-exclusive, royalty-free licence to use the Customer Materials during the Term solely to provide the Services, and warrants that it has the rights needed to grant that licence.",
      },
      { id: "customer_insurance", when: "insurance_customer", text: "**Insurance.** The Customer shall maintain, throughout the Term, insurance appropriate to its business and its use of the Services with a reputable insurer, and shall provide evidence of it on request. The Service Provider may, on written notice, suspend the Services until the Customer provides satisfactory evidence that it maintains that insurance, and such suspension does not relieve the Customer of its payment obligations." },
      {
        id: "non_solicit_customer",
        when: "solicit_customer",
        text: "**Non-Solicitation.** During the Term and for twelve (12) months after it ends, the Customer shall not, directly or indirectly, solicit or entice away, or employ or engage, any employee or contractor of the Service Provider who was involved in providing the Services, without the Service Provider's prior written consent. This does not apply to an individual who has not been employed or engaged by the Service Provider for at least six (6) months, or who responds to a general advertisement not aimed at the Service Provider's personnel.",
      },
      {
        id: "non_solicit_mutual",
        when: "solicit_mutual",
        fd: true,
        text: "**Non-Solicitation.** During the Term and for twelve (12) months after it ends, neither Party shall, directly or indirectly, solicit or entice away, or employ or engage, any employee or contractor of the other Party who was involved in the Services, without the other Party's prior written consent. This does not apply to an individual who has not been employed or engaged by the other Party for at least six (6) months, or who responds to a general advertisement not aimed at the other Party's personnel.",
      },
    ],
  },
  {
    id: "warranties",
    heading: "WARRANTIES",
    clauses: [
      { id: "authority", text: "**Authority.** Each Party warrants that it has full power and authority to enter into and perform this Agreement, and that doing so does not breach any obligation it owes to a third party." },
      {
        id: "provider_warranty",
        when: "customer",
        fd: true,
        text: "**Conformity.** The Service Provider warrants that the Services{{and_deliverables}} will conform in all material respects to Schedule 1. If they do not, the Service Provider shall, at the Customer's request and at no additional cost, promptly re-perform or correct them, without prejudice to the Customer's other rights and remedies.",
      },
      {
        id: "disclaimer",
        when: "provider",
        text: "**Exclusion of Other Warranties.** Except as expressly set out in this Agreement, all warranties, conditions and other terms implied by statute or common law are excluded to the fullest extent permitted by law.",
      },
      { id: "provider_insurance", when: "insurance_provider", fd: true, text: "**Insurance.** The Service Provider shall maintain, throughout the Term and for twelve (12) months after it ends, professional indemnity and public liability insurance with a reputable insurer, on terms and for amounts reasonable for the Services, and shall provide evidence of it on request." },
    ],
  },
  {
    id: "ip",
    heading: "INTELLECTUAL PROPERTY",
    clauses: [
      { id: "ip_platform", when: "platform", text: "**The Platform.** All Intellectual Property Rights in the Platform, the Services and the Documentation, and in any improvements to them, belong to the Service Provider or its licensors. Nothing in this Agreement transfers any of them to the Customer." },
      { id: "ip_data", when: "platform", text: "**Customer Data.** All Intellectual Property Rights in the Customer Data belong to the Customer or its licensors." },
      { id: "ip_outputs_provider", when: "platform_provider", text: "**Outputs.** Subject to payment of the Fees and compliance with this Agreement, the Customer may use the Outputs during the Term for its internal business purposes." },
      { id: "ip_outputs_customer", when: "platform_customer", fd: true, text: "**Outputs.** The Customer may use the Outputs for its business purposes during and after the Term, and the Service Provider shall not use them or disclose them to any third party save to provide the Services." },
      { id: "ip_feedback", when: "platform_provider", fd: true, text: "**Feedback.** The Service Provider may use any suggestions or feedback about the Services provided by the Customer or its Authorised Users without restriction or payment." },
      {
        id: "ip_assign",
        when: "ip_assign",
        fd: true,
        text: "**Deliverables.** Upon payment in full of the Fees for a Deliverable, all Intellectual Property Rights in that Deliverable (other than the Background IP) vest in the Customer, and the Service Provider hereby assigns them to the Customer with full title guarantee with effect from that payment. The Service Provider retains all Background IP and grants the Customer a non-exclusive, perpetual, royalty-free licence to use any Background IP incorporated in the Deliverables as part of them.",
      },
      {
        id: "ip_licence",
        when: "ip_licence",
        fd: true,
        text: "**Deliverables.** All Intellectual Property Rights in the Deliverables and the Background IP remain with the Service Provider. Upon payment in full of the Fees for a Deliverable, the Service Provider grants the Customer a non-exclusive, non-transferable, perpetual, royalty-free licence to use that Deliverable for its business purposes.",
      },
    ],
  },
  {
    id: "confidentiality",
    heading: "CONFIDENTIALITY AND DATA PROTECTION",
    clauses: [
      {
        id: "confidential",
        text: "**Confidentiality.** Each Party shall keep the other Party's Confidential Information confidential, use it only to perform or receive the Services, and disclose it only to its and its Affiliates' officers, employees, professional advisers and subcontractors who need to know it and are bound by obligations of confidence no less strict than these. These obligations do not apply to information that:",
        subs: [
          { ref: "(a)", text: "is or becomes public other than through a breach of this Agreement;" },
          { ref: "(b)", text: "was lawfully in the receiving Party's possession before disclosure, free of any obligation of confidence;" },
          { ref: "(c)", text: "is independently developed by the receiving Party; or" },
          { ref: "(d)", text: "must be disclosed by Applicable Law or by any court, regulator or stock exchange, to the extent so required and, where lawful, after notice to the other Party." },
        ],
      },
      { id: "confidential_survive", text: "**Duration.** This {{section:confidentiality}} survives termination or expiry of this Agreement for so long as the information remains confidential." },
      {
        id: "pdpa_platform",
        when: "platform",
        fd: true,
        text: "**Personal Data.** Each Party shall comply with the PDPA in connection with this Agreement. To the extent the Service Provider processes personal data in the Customer Data on the Customer's behalf, it shall:",
        subs: [
          { ref: "(a)", text: "process it only to provide the Services and in accordance with the Customer's reasonable written instructions;" },
          { ref: "(b)", text: "make reasonable security arrangements to protect it from unauthorised access, collection, use, disclosure, copying, modification, disposal or loss;" },
          { ref: "(c)", text: "notify the Customer without undue delay after becoming aware of any data breach affecting it, and give the Customer reasonable assistance;" },
          { ref: "(d)", text: "not transfer it outside Singapore unless it ensures that the recipient protects it to a standard comparable to the PDPA; and" },
          { ref: "(e)", text: "on termination or expiry of this Agreement, return or delete it at the Customer's choice, save as required by Applicable Law." },
        ],
      },
      { id: "pdpa_pro", when: "professional", fd: true, text: "**Personal Data.** Each Party shall comply with the PDPA in respect of any personal data disclosed to it in connection with this Agreement, use it only for the purposes of this Agreement, and protect it with reasonable security arrangements." },
    ],
  },
  {
    id: "indemnities",
    heading: "INDEMNITIES",
    clauses: [
      {
        id: "indemnity_broad",
        when: "indemnity_broad",
        text: "**Customer Indemnity.** The Customer shall indemnify and hold harmless the Service Provider and its Affiliates, officers, employees and licensors against all losses, claims, liabilities, damages, costs and expenses (including reasonable legal fees) arising out of or in connection with the Customer's breach of {{section:customer}}, the {{customer_inputs}}, the Customer's use of the Services{{or_outputs}}, or any breach of Applicable Law or third-party rights by the Customer. This indemnity survives termination or expiry of this Agreement, is payable on demand, and is independent of, and not limited by, {{clause:cap}} to the maximum extent permitted by law.",
      },
      {
        id: "indemnity_narrow",
        when: "indemnity_narrow",
        text: "**Customer Indemnity.** The Customer shall indemnify the Service Provider against losses, damages, costs and expenses (including reasonable legal fees) awarded against or agreed in settlement by the Service Provider in respect of any third-party claim to the extent arising from the Customer's material breach of this Agreement, its breach of Applicable Law, or the infringement of any third party's rights by the {{customer_inputs}}, save to the extent caused by the Service Provider's own breach, negligence or wilful misconduct.",
      },
      {
        id: "indemnity_provider",
        when: "indemnity_mutual",
        fd: true,
        text: "**Service Provider Indemnity.** The Service Provider shall indemnify the Customer against losses, damages, costs and expenses (including reasonable legal fees) awarded against or agreed in settlement by the Customer in respect of any third-party claim that the Services{{or_deliverables}}, as provided by the Service Provider and used in accordance with this Agreement, infringe that third party's Intellectual Property Rights. This does not apply to any claim arising from the {{customer_inputs}}, or from any modification or combination not made or approved by the Service Provider.",
      },
      {
        id: "indemnity_conduct",
        when: "indemnity_not_broad",
        fd: true,
        text: "**Conduct of Claims.** A Party seeking to be indemnified shall notify the other promptly of the claim, allow it to conduct the defence and settlement of the claim (provided no admission is made on the indemnified Party's behalf without its consent), and give it reasonable assistance at its cost.",
      },
    ],
  },
  {
    id: "liability",
    heading: "LIMITATION OF LIABILITY",
    clauses: [
      { id: "unlimited", text: "**Unlimited Liability.** Nothing in this Agreement limits or excludes either Party's liability for fraud or fraudulent misrepresentation, for death or personal injury caused by negligence, {{unlimited_extra}}or for any liability that cannot be limited or excluded by law." },
      { id: "cap", text: "**Cap.** Subject to {{clause:unlimited}}, {{cap_who}} total aggregate liability arising out of or in connection with this Agreement, whether in contract, tort (including negligence), breach of statutory duty or otherwise, shall not exceed {{cap_amount}}. This cap applies to all claims in aggregate and not separately to each claim or event." },
      { id: "indirect", text: "**Indirect Loss.** Subject to {{clause:unlimited}}, neither Party is liable for any indirect or consequential loss, or for any loss of profit, revenue, business, goodwill or anticipated savings, however arising." },
      { id: "time_bar_6", when: "claims_6", text: "**Time Limit for Claims.** The Customer must commence any claim arising out of or in connection with this Agreement within six (6) months after the event giving rise to it, failing which the claim is time-barred to the maximum extent permitted by law." },
      { id: "time_bar_12", when: "claims_12", text: "**Time Limit for Claims.** The Customer must commence any claim for breach of this Agreement within twelve (12) months after it first knew, or ought reasonably to have known, of the breach." },
    ],
  },
  {
    id: "termination",
    heading: "TERMINATION",
    clauses: [
      { id: "convenience", when: "convenience", text: "**Termination for Convenience.** Either Party may terminate this Agreement by giving the other {{notice_words}} written notice{{not_before}}." },
      {
        id: "breach",
        text: "**Termination for Cause.** Either Party may terminate this Agreement immediately by written notice if the other Party:",
        subs: [
          { ref: "(a)", text: "commits a material breach of this Agreement which is irremediable or, if remediable, is not remedied within {{cure_days}} after written notice requiring it to be remedied; or" },
          { ref: "(b)", text: "becomes insolvent or unable to pay its debts as they fall due, has a receiver, judicial manager, liquidator or similar officer appointed over it or any of its assets, enters into any arrangement with its creditors, or ceases or threatens to cease to carry on business." },
        ],
      },
      { id: "non_payment", when: "provider", text: "**Non-Payment.** The Service Provider may terminate this Agreement immediately by written notice if any undisputed amount remains unpaid for fourteen (14) days after written notice that it is overdue, without prejudice to its right to suspend the Services instead." },
      { id: "licence_end", when: "platform_provider", text: "**Third-Party Licences.** The Service Provider may terminate this Agreement immediately by written notice if any third-party licence on which it depends to provide the Services is terminated or materially restricted, and shall refund any Fees paid in advance for the period after termination." },
      {
        id: "consequences",
        text: "**Consequences of Termination.** On termination or expiry of this Agreement:",
        subs: [
          { ref: "(a)", text: "the Customer shall pay all Fees for Services provided up to the date of termination{{and_expenses}};" },
          { ref: "(b)", id: "c_access", text: "the Customer's right to access and use the Platform ends;" },
          { ref: "(c)", id: "c_refund", text: "{{refund_when}}, the Service Provider shall refund any Fees paid in advance for the period after termination;" },
          { ref: "(d)", id: "c_export", text: "the Service Provider shall, for thirty (30) days after termination, allow the Customer to export the Customer Data, and shall then delete it save as required by Applicable Law;" },
          { ref: "(e)", text: "each Party shall return or destroy the other Party's Confidential Information, save as required by Applicable Law; and" },
          { ref: "(f)", text: "termination does not affect any rights, remedies or liabilities of either Party accrued before termination." },
        ],
      },
      { id: "survival", text: "**Survival.** {{survival}}, and any other provision which by its nature is intended to survive, survive termination or expiry of this Agreement." },
    ],
  },
  {
    id: "general",
    heading: "GENERAL",
    clauses: [
      {
        id: "force_majeure",
        fd: true,
        text: "**Force Majeure.** Neither Party is liable for any delay or failure to perform its obligations (other than an obligation to pay money) caused by events beyond its reasonable control. The affected Party shall notify the other promptly and use reasonable efforts to mitigate the effect. If the event continues for more than sixty (60) days, either Party may terminate this Agreement by written notice.",
      },
      { id: "independent", text: "**Relationship.** The Service Provider is an independent contractor. Nothing in this Agreement creates a partnership, joint venture, agency or employment relationship between the Parties." },
      {
        id: "notices",
        text: "**Notices.** Notices under this Agreement shall be in writing in English and sent by email to the address notified by the recipient for notices — as at the date of this Agreement, the addresses in the signature blocks. A Party may update its notice details by written notice to the other. A notice is deemed received on the next Business Day after transmission, provided no failed-delivery notification is received.",
      },
      { id: "entire", text: "**Entire Agreement.** This Agreement, together with its Schedules, constitutes the entire agreement between the Parties relating to its subject matter and supersedes all prior discussions and understandings." },
      { id: "variation", text: "**Variation.** No variation of this Agreement is effective unless made in writing and signed by both Parties." },
      { id: "assignment_provider", when: "provider", text: "**Assignment.** Neither Party may assign or transfer this Agreement without the other's prior written consent, save that the Service Provider may assign it to an Affiliate or to a purchaser of all or substantially all of its relevant business on written notice to the Customer." },
      { id: "assignment_customer", when: "customer", text: "**Assignment.** Neither Party may assign or transfer this Agreement without the other's prior written consent (not to be unreasonably withheld)." },
      { id: "waiver", text: "**Waiver.** No failure or delay in exercising any right or remedy is a waiver of it, and no single or partial exercise of any right or remedy prevents its further exercise." },
      { id: "severance", text: "**Severance.** If any provision of this Agreement is held invalid or unenforceable, it shall be modified to the minimum extent necessary to make it valid, and the rest of this Agreement is not affected." },
      { id: "third_parties", text: "**Third-Party Rights.** A person who is not a Party has no right under the Contracts (Rights of Third Parties) Act 2001 to enforce any term of this Agreement." },
      { id: "counterparts", text: "**Counterparts.** This Agreement may be executed in counterparts and by electronic signature, each of which is an original and which together constitute one agreement." },
      { id: "law_courts", when: "courts", text: "**Governing Law and Jurisdiction.** This Agreement and any dispute or claim arising out of or in connection with it are governed by the laws of Singapore, and the Parties submit to the exclusive jurisdiction of the courts of Singapore." },
      {
        id: "law_siac",
        when: "siac",
        text: "**Governing Law and Arbitration.** This Agreement and any dispute or claim arising out of or in connection with it are governed by the laws of Singapore. Any dispute arising out of or in connection with this Agreement, including any question regarding its existence, validity or termination, shall be referred to and finally resolved by arbitration administered by the Singapore International Arbitration Centre in accordance with the Arbitration Rules of the Singapore International Arbitration Centre for the time being in force. The seat of the arbitration shall be Singapore, the tribunal shall consist of one arbitrator, and the language of the arbitration shall be English.",
      },
    ],
  },
];

export const EXECUTED = "IN WITNESS WHEREOF the Parties have executed this Agreement on the date first written above.";

/* ── Schedule 1, Part 2: the service levels (platform, from the review) ── */

export const SERVICE_LEVELS = {
  intro: "The service levels below apply from the Commencement Date.",
  support:
    "**Support hours.** Standard support is available from 9.00 a.m. to 6.00 p.m. (Singapore time), Monday to Friday, excluding Singapore public holidays, by email and through the Service Provider's support channel.",
  uptime:
    "**Availability.** The Service Provider shall use commercially reasonable efforts to make the Platform available at least 99.5% of the time in each calendar month, excluding planned maintenance notified at least forty-eight (48) hours in advance, emergency maintenance, and unavailability caused by the Customer, its Authorised Users or events beyond the Service Provider's reasonable control.",
  responses: [
    "**Priority 1** (the Platform is unavailable): a response within four (4) business hours.",
    "**Priority 2** (material degradation of the Platform): a response within one (1) Business Day.",
    "**Priority 3** (general support requests): a response within two (2) Business Days.",
  ],
  tail: "Response times run during support hours. A response is an acknowledgement and the start of work on the issue, not a guarantee of resolution within that time.",
};

/* ── for the admin console ─────────────────────────────────────────────── */

export const ADAPTATIONS: { where: string; change: string }[] = [
  { where: "Parties (both precedents)", change: "\"the Advisor\" / \"the Company\" (B) and the provider's trading name (A) read as \"the Service Provider\" and \"the Customer\" throughout, so one wording serves both kinds of service." },
  { where: "B 2.3 — exclusivity and Success Fee", change: "Not carried over: B's exclusivity and \"payable regardless of who introduced the investor\" are fundraising-specific. The success fee is the user's own description in Schedule 2, flagged for the lawyer." },
  { where: "B 4.2–4.3 — Success Fee and Tail Period", change: "Generalised into Schedule 2: the user describes the trigger, amount and any tail; payment within the payment terms after it is earned." },
  { where: "A 4.1 / Schedule 2 — fee review at renewal", change: "Split into three positions from the review: increase on notice for a renewal with a right to leave (provider), proposed increase only if agreed with expiry otherwise (provider, no auto-renewal), and increases only by agreement (customer)." },
  { where: "A 3.2 — service changes", change: "Three positions from the review: unrestricted (original), with a 30-day material-reduction exit (provider's tightened version), and no material change without consent (customer)." },
  { where: "A 5.6 — customer indemnity", change: "Broad (provider's review version, outside the cap and payable on demand) or narrow (customer's review version, third-party claims only, excluding provider fault)." },
  { where: "A 8.2 / B 9.2 — cap", change: "One clause, with the cap (12 months' fees — A; all fees paid — B and the review; or a fixed amount) and whose liability it caps chosen; always stated to be aggregate, not per claim (review)." },
  { where: "A 8.4 — claims bar", change: "Six months from the event giving rise to the claim (provider's review version) or twelve months from knowledge (customer's review version), or none." },
  { where: "A 9.6 — survival", change: "Lists the surviving clauses by number, generated from what is in the agreement (review point)." },
  { where: "A 10.7 — notices", change: "The review's version: notice details in the signature blocks, updatable by notice." },
];

export const CORRECTIONS: { where: string; was: string; now: string }[] = [
  { where: "A 2.1 — Term definition", was: "\"(the Initial Term, and together with any agreed renewal periods, the Term)\" ran the two definitions together", now: "Initial Term defined in the Term clause; Term defined separately" },
  { where: "A — last general clause", was: "Governing Law numbered 10.1 after 10.9", now: "Numbered in sequence by the assembler" },
  { where: "A 9.3 — non-payment", was: "Immediate termination on any missed payment, with no notice", now: "Suspension first, then termination fourteen days after notice of an undisputed overdue amount" },
];
