/**
 * The contractor agreement questionnaire — FD's "Proposed Amendments to
 * Questionnaire" (TF Qns, 11 March 2025), the fifteen questions, with a
 * "Where" question first so the law and the courts are known, and before
 * it the version: the Master Menu's Basic / Standard / Complex (C0), which
 * decides which of the master's 43 clauses are in. A question whose clause
 * is not in the chosen version is not asked.
 *
 * Data, not code: the screen asks these in order, the assembler reads the
 * answers by id, and the admin console lists them read-only. Hidden
 * questions (show_if) are not asked and their answer is empty.
 *
 * Condition language: {q, eq} | {q, in} | {q, not_in} | {q, has} / {q, lacks} (a
 * multi-choice answer includes, or does not include, the value) | {all} | {any}.
 *
 * Who the Company and the Contractor are, and the engagement itself (the
 * services, the fee, the dates), are not in the fifteen: the screen asks
 * them in two steps of their own straight after C1b. Anything left blank
 * there is a [●] in the draft.
 *
 * Status: the questions are live; the master contractor agreement they
 * feed is not yet loaded (data/master.ts). Until it is, FD AI saves the
 * answers and a lawyer sends the draft.
 */

export const CONTRACTOR_QUESTIONNAIRE = {
  id: "FD_CTR_QUESTIONNAIRE",
  version: "1.0",
  for_master: "FD Master Contractor Agreement",
  status: "Draft for FD review",
  questions: [
    /* ── the version (Master Menu: Cmx / Stn / Bsc) ── */
    {
      id: "C0",
      key: "version",
      section: "Version",
      type: "scale",
      required: true,
      default: "standard",
      text: "How detailed should the agreement be?",
      help: "The firm’s master comes in three versions. Basic has the fifteen essential clauses; Standard adds exclusivity, expenses, breach, liability and confidentiality; Complex has every clause, including restrictions after the engagement and data protection.",
      options: [
        { value: "basic", label: "Basic" },
        { value: "standard", label: "Standard", recommended: true },
        { value: "complex", label: "Complex" },
      ],
    },
    /* ── where ── */
    {
      id: "C1a",
      key: "company_based",
      section: "Where",
      type: "jurisdiction",
      required: true,
      text: "Where is the Company based?",
      help: "Sets the governing law and the courts. Choose the state for the United States, Australia, Canada or the United Kingdom.",
    },
    {
      id: "C1b",
      key: "contractor_based",
      section: "Where",
      type: "jurisdiction",
      allow_same: true,
      required: true,
      default: "same",
      text: "Where is the Contractor based?",
      help: "If the two are in different countries, FD AI flags it: tax, permits and the local rules on who counts as an employee can all differ.",
    },
    /* ── 1/15 ── */
    {
      id: "C2",
      key: "contracting_entity",
      section: "The contractor",
      type: "single_choice",
      required: true,
      default: "individual",
      text: "Is the Contractor signing as an individual or on behalf of a company?",
      help: "An individual enters into the Agreement personally; a company signs on behalf of a business they own or represent.",
      options: [
        { value: "individual", label: "An individual", recommended: true },
        { value: "company", label: "A company" },
        { value: "undecided", label: "Undecided" },
      ],
    },
    /* ── 2/15 ── */
    {
      id: "C3",
      key: "obligations",
      section: "The work",
      type: "multi_choice",
      required: true,
      default: ["professional", "instructions", "updates", "compliance"],
      text: "What key obligations should the Contractor undertake?",
      help: "What the Contractor is expected to do while working with the Company, so the work is done properly, follows instructions and meets legal requirements. Choose all that apply.",
      options: [
        { value: "professional", label: "Deliver with professionalism — skill, care and diligence", recommended: true },
        { value: "instructions", label: "Follow the Company’s reasonable instructions", recommended: true },
        { value: "updates", label: "Provide progress updates and reports when asked", recommended: true },
        { value: "compliance", label: "Comply with applicable laws and regulations", recommended: true },
      ],
    },
    /* ── 3/15 ── */
    {
      id: "C4",
      key: "exclusivity",
      section: "The work",
      type: "single_choice",
      required: true,
      show_if: { q: "C0", in: ["standard", "complex"] },
      default: "non_exclusive",
      text: "Should the Contractor work exclusively for the Company?",
      help: "Exclusive: the Contractor needs the Company’s written consent before working for anyone else. Non-exclusive is usual for a contractor; a contractor who may only work for you starts to look like an employee.",
      options: [
        { value: "exclusive", label: "Yes, exclusive — written consent needed for other work" },
        { value: "non_exclusive", label: "No, non-exclusive — free to work for other clients", recommended: true },
      ],
    },
    /* ── 4/15 ── */
    {
      id: "C5",
      key: "no_conflicts",
      section: "The work",
      type: "single_choice",
      required: true,
      show_if: { q: "C0", in: ["standard", "complex"] },
      default: "yes",
      text: "Must the Contractor confirm they have no other agreements or commitments that could interfere with this work?",
      help: "Some contractors have existing contracts or relationships that could get in the way. This asks them to confirm, before signing, that there is nothing of the kind.",
      options: [
        { value: "yes", label: "Yes, the Contractor must confirm", recommended: true },
        { value: "no", label: "No, not required" },
      ],
    },
    /* ── 5/15 ── */
    {
      id: "C6",
      key: "expenses",
      section: "Money",
      type: "single_choice",
      required: true,
      show_if: { q: "C0", in: ["standard", "complex"] },
      default: "contractor",
      text: "Who pays the expenses of the Contractor’s work?",
      help: "Travel, equipment and other work-related costs. Either the Contractor covers them out of the fee, or the Company reimburses pre-approved expenses against receipts.",
      options: [
        { value: "contractor", label: "The Contractor — no reimbursement", recommended: true },
        { value: "company", label: "The Company reimburses pre-approved expenses, with receipts" },
      ],
    },
    /* ── 6/15 ── */
    {
      id: "C7",
      key: "ip",
      section: "Ownership",
      type: "single_choice",
      required: true,
      default: "assign",
      text: "Should all intellectual property the Contractor creates belong to the Company?",
      help: "Full assignment: the Company owns everything created under the Agreement and the Contractor keeps no rights. Otherwise the Contractor keeps ownership and the Company gets a limited right to use it.",
      options: [
        { value: "assign", label: "Yes, full assignment to the Company", recommended: true },
        { value: "retain", label: "No, the Contractor keeps the IP and licenses it to the Company" },
      ],
    },
    /* ── 7/15 ── */
    {
      id: "C8a",
      key: "term",
      section: "How long",
      type: "single_choice",
      required: true,
      default: "until_terminated",
      text: "How long should the Agreement last?",
      help: "When it starts and when it ends: on completion of the services, on a fixed date, or when either side ends it.",
      options: [
        { value: "until_complete", label: "Until the services are completed" },
        { value: "fixed", label: "A fixed period" },
        { value: "until_terminated", label: "Until either party ends it", recommended: true },
      ],
    },
    {
      id: "C8b",
      key: "fixed_end",
      section: "How long",
      type: "date",
      required: true,
      show_if: { q: "C8a", eq: "fixed" },
      text: "When does the fixed period end?",
      help: "The Agreement ends on this date unless it is ended earlier.",
    },
    /* ── 8/15 ── */
    {
      id: "C9a",
      key: "termination",
      section: "Ending it",
      type: "single_choice",
      required: true,
      default: "notice",
      text: "How can either party end the Agreement?",
      help: "With written notice, by paying the fee for the notice period instead of giving notice, or at any time with neither.",
      options: [
        { value: "notice", label: "Written notice", recommended: true },
        { value: "pay_in_lieu", label: "Notice, or payment instead of notice" },
        { value: "none", label: "At any time, no notice or payment" },
      ],
    },
    {
      id: "C9b",
      key: "notice_days",
      section: "Ending it",
      type: "single_choice",
      required: true,
      default: "30",
      show_if: { q: "C9a", not_in: ["none"] },
      text: "How many days’ notice?",
      options: [
        { value: "7", label: "7 days" },
        { value: "14", label: "14 days" },
        { value: "30", label: "30 days", recommended: true },
        { value: "60", label: "60 days" },
        { value: "90", label: "90 days" },
      ],
    },
    /* ── 9/15 ── */
    {
      id: "C10",
      key: "breach_grounds",
      section: "Ending it",
      type: "multi_choice",
      required: true,
      show_if: { q: "C0", in: ["standard", "complex"] },
      default: ["serious_breach", "misconduct", "incapacity", "criminal", "assignment", "confidentiality", "insolvency"],
      text: "When may the Company end the Agreement because of something the Contractor has done?",
      help: "Serious rule-breaking and confidentiality breaches usually justify immediate termination; others may need more thought. Choose all that apply.",
      options: [
        { value: "serious_breach", label: "Serious breach of the Agreement", recommended: true },
        { value: "misconduct", label: "Misconduct, carelessness or harm to the business", recommended: true },
        { value: "incapacity", label: "Legally unable to manage their own affairs", recommended: true },
        { value: "criminal", label: "Charged with or convicted of a crime that affects the work or reputation", recommended: true },
        { value: "assignment", label: "Transfers their rights under the Agreement without approval", recommended: true },
        { value: "confidentiality", label: "Leaks or misuses confidential information", recommended: true },
        { value: "insolvency", label: "Bankruptcy or serious financial trouble", recommended: true },
      ],
    },
    /* ── 10/15 ── */
    {
      id: "C11",
      key: "breach_remedies",
      section: "Ending it",
      type: "multi_choice",
      required: true,
      show_if: { q: "C0", in: ["standard", "complex"] },
      default: ["terminate", "damages", "replace"],
      text: "If the Contractor breaches the Agreement, what may the Company do?",
      help: "Choose all that apply.",
      options: [
        { value: "terminate", label: "End the Agreement immediately, without notice", recommended: true },
        { value: "damages", label: "Recover losses, including by deducting from money owed to the Contractor", recommended: true },
        { value: "replace", label: "Finish the work itself or hire someone else, at the Contractor’s cost", recommended: true },
      ],
    },
    /* ── 11/15 ── */
    {
      id: "C12",
      key: "continuing",
      section: "After it ends",
      type: "multi_choice",
      required: true,
      show_if: { q: "C0", eq: "complex" },
      default: ["no_data", "no_disparagement"],
      text: "What must the Contractor keep to after the Agreement ends?",
      help: "Some duties survive termination. Choose all that apply.",
      options: [
        { value: "no_data", label: "No access to, copying or transfer of Company data", recommended: true },
        { value: "no_disparagement", label: "No negative statements about the Company or its people", recommended: true },
      ],
    },
    /* ── 12/15 ── */
    {
      id: "C13a",
      key: "restrictions",
      section: "After it ends",
      type: "single_choice",
      required: true,
      show_if: { q: "C0", eq: "complex" },
      default: "no",
      text: "After the Agreement ends, should the Contractor be barred from working with competitors or recruiting the Company’s staff?",
      help: "If yes: no involvement with a competing business where the Company operates, and no poaching of its employees, officers or consultants, for a set period. Courts only enforce this if it is reasonable; for a contractor it is harder to justify than for an employee.",
      options: [
        { value: "yes", label: "Yes, both restrictions" },
        { value: "no", label: "No restrictions after it ends", recommended: true },
      ],
    },
    {
      id: "C13b",
      key: "restriction_months",
      section: "After it ends",
      type: "single_choice",
      required: true,
      default: "6",
      show_if: { q: "C13a", eq: "yes" },
      text: "For how long after it ends?",
      help: "Six months is the usual ceiling; longer is rarely upheld.",
      options: [
        { value: "3", label: "3 months" },
        { value: "6", label: "6 months", recommended: true },
      ],
    },
    {
      id: "C13c",
      key: "restricted_territory",
      section: "After it ends",
      type: "free_text",
      required: false,
      max_length: 200,
      show_if: { q: "C13a", eq: "yes" },
      text: "Where do the restrictions apply?",
      help: "Name the countries or cities where the Company actually does business. A worldwide restriction is not enforceable and is not accepted. Blank leaves a [●] to fill in.",
      placeholder: "e.g. Singapore and Malaysia",
      reject: [
        { pattern: "\\b(world ?wide|global(ly)?|anywhere|everywhere|all countries|the world|international(ly)?)\\b", message: "Courts do not enforce a worldwide restriction. Name the countries or cities where the Company actually does business." },
      ],
    },
    /* ── 13/15 ── */
    {
      id: "C14",
      key: "probation",
      section: "The work",
      type: "single_choice",
      required: true,
      default: "no",
      text: "Will the Contractor be subject to a probationary period?",
      help: "A trial period lets both sides see whether the arrangement works before committing. Note that probation is an employment idea; for a contractor a short initial term does the same job.",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No", recommended: true },
        { value: "maybe", label: "Maybe — decide later" },
      ],
    },
    /* ── 14/15 ── */
    {
      id: "C15",
      key: "confidentiality",
      section: "Secrets and data",
      type: "single_choice",
      required: true,
      show_if: { q: "C0", in: ["standard", "complex"] },
      default: "forever",
      text: "How long must the Contractor keep the Company’s information confidential?",
      help: "Forever gives the most protection; a time limit gives flexibility.",
      options: [
        { value: "forever", label: "Forever", recommended: true },
        { value: "while_engaged", label: "Only while engaged" },
        { value: "5y", label: "5 years after it ends" },
        { value: "2y", label: "2 years after it ends" },
        { value: "none", label: "No confidentiality obligation" },
      ],
    },
    /* ── 15/15 ── */
    {
      id: "C16",
      key: "data_processing",
      section: "Secrets and data",
      type: "single_choice",
      required: true,
      show_if: { q: "C0", eq: "complex" },
      default: "yes",
      text: "May the Company process and share the Contractor’s personal data for work-related purposes?",
      help: "Payments, record-keeping and legal compliance need the Contractor’s name, bank details and work history; some of it may go to trusted third parties such as payroll or IT providers. In the UK and EU the clause relies on a lawful basis other than consent; FD AI flags this.",
      options: [
        { value: "yes", label: "Yes, for necessary business and legal purposes only", recommended: true },
        { value: "no", label: "No" },
      ],
    },
  ],
} as const;
