/**
 * The employment contract questionnaire — "AI Employment Contract Tool — The
 * 10 Questions", universal (any country), plus the two switch-on modules.
 *
 * Data, not code: the screen asks these in order, the assembler reads the
 * answers by id, and the admin console lists them read-only. Hidden
 * questions (show_if) are not asked and their answer is empty.
 *
 * Condition language: {q, eq} | {q, in} | {q, not_in} | {q, has} / {q, lacks} (a
 * multi-choice answer includes, or does not include, the value) | {all} | {any}.
 *
 * Who the employer and employee are, and the job itself (title, pay, start
 * date, hours, leave), are not in the ten questions: the screen asks them in
 * two steps of their own straight after E1b, as the term sheet asks for its
 * parties. Anything left blank there is a [●] in the draft.
 */

export const EMPLOYMENT_QUESTIONNAIRE = {
  id: "FD_EMP_QUESTIONNAIRE",
  version: "1.2",
  for_master: "FD Master Employment Agreement (GENERIC)",
  status: "Draft for FD review",
  questions: [
    /* ── 1 ── */
    {
      id: "E1a",
      key: "employer_based",
      section: "Where",
      type: "jurisdiction",
      required: true,
      text: "Where is the employer based?",
      help: "Sets the rulebook for everything below. Choose the state for the United States, Australia, Canada or the United Kingdom.",
    },
    {
      id: "E1b",
      key: "employee_based",
      section: "Where",
      type: "jurisdiction",
      allow_same: true,
      required: true,
      default: "same",
      text: "Where does the employee live and work?",
      help: "If the two are in different countries, both may apply. FD AI flags the mismatch and uses the law of the place the employee works.",
    },
    {
      id: "E1c",
      key: "employee_nationality",
      section: "Where",
      type: "country",
      required: true,
      text: "What is the employee’s nationality?",
      help: "Decides whether a work pass or visa is needed, and which rules apply to foreign employees. FD AI then gives you an overview of the employment law where they work, and checks your answers against it.",
    },
    /* ── 2 ── */
    {
      id: "E2",
      key: "protected",
      section: "The employee",
      type: "single_choice",
      required: true,
      default: "unsure",
      text: "Is this a legally “protected” employee?",
      help: "Decides which minimum rights can’t be removed (notice, leave, dismissal protection). Not sure? We apply the strongest protections.",
      options: [
        { value: "regular", label: "Regular protected employee" },
        { value: "senior", label: "Senior manager / executive" },
        { value: "unsure", label: "Not sure — apply strongest protections", recommended: true },
      ],
    },
    /* ── 3 ── */
    {
      id: "E3a",
      key: "contract_type",
      section: "Length and probation",
      type: "single_choice",
      required: true,
      default: "permanent",
      text: "Permanent or fixed-term?",
      help: "Shapes the length-of-employment clause.",
      options: [
        { value: "permanent", label: "Permanent", recommended: true },
        { value: "fixed", label: "Fixed-term" },
      ],
    },
    {
      id: "E3b",
      key: "fixed_term_end",
      section: "Length and probation",
      type: "date",
      required: true,
      show_if: { q: "E3a", eq: "fixed" },
      text: "When does the fixed term end?",
      help: "The job ends on this date without notice, unless it is ended earlier.",
    },
    {
      id: "E3c",
      key: "probation",
      section: "Length and probation",
      type: "single_choice",
      required: true,
      default: "3m",
      text: "Is there a probation period?",
      options: [
        { value: "3m", label: "3 months", recommended: true },
        { value: "6m", label: "6 months" },
        { value: "none", label: "None" },
      ],
    },
    {
      id: "E3d",
      key: "probation_notice",
      section: "Length and probation",
      type: "single_choice",
      required: true,
      default: "1w",
      show_if: { q: "E3c", not_in: ["none"] },
      text: "During probation, how much notice does either side give?",
      options: [
        { value: "1w", label: "1 week", recommended: true },
        { value: "statutory", label: "Statutory minimum" },
        { value: "same", label: "Same as after probation" },
      ],
    },
    /* ── 4 ── */
    {
      id: "E4a",
      key: "notice",
      section: "Ending the job",
      type: "single_choice",
      required: true,
      default: "1m",
      text: "How much notice must each side give to end the job?",
      help: "The termination section — where most disputes happen.",
      options: [
        { value: "statutory", label: "Statutory minimum" },
        { value: "1w", label: "1 week" },
        { value: "1m", label: "1 month", recommended: true },
        { value: "3m", label: "3 months" },
      ],
    },
    {
      id: "E4c",
      key: "dismissal_list",
      section: "Ending the job",
      type: "single_choice",
      required: true,
      default: "standard",
      text: "Which list of reasons allows instant dismissal?",
      options: [
        { value: "standard", label: "Standard misconduct list", recommended: true },
        { value: "custom", label: "Custom list" },
      ],
    },
    {
      id: "E4d",
      key: "dismissal_custom",
      section: "Ending the job",
      type: "free_text_list",
      required: true,
      max_items: 8,
      show_if: { q: "E4c", eq: "custom" },
      text: "List the reasons for instant dismissal, one at a time.",
      help: "In plain words, e.g. “Turning up to work drunk”. FD AI puts them into the contract’s wording; dismissal the law allows anyway always stays in.",
      placeholder: "One reason, then Enter",
    },
    /* ── 5 ── */
    {
      id: "E5",
      key: "garden_leave",
      section: "Ending the job",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Can the employer send them home on full pay during the notice period (garden leave)?",
      help: "It must be written in to be safe.",
      options: [
        { value: "yes", label: "Yes — reserve this right", recommended: true },
        { value: "no", label: "No" },
      ],
    },
    /* ── 6 ── */
    {
      id: "E6a",
      key: "restrictions",
      section: "After they leave",
      type: "multi_choice",
      required: true,
      default: ["clients", "staff"],
      text: "After leaving, what are they barred from doing?",
      help: "Courts only enforce these if reasonable. A non-compete is left out automatically for regular (non-senior) staff.",
      options: [
        { value: "compete", label: "Don’t compete" },
        { value: "clients", label: "Don’t poach clients", recommended: true },
        { value: "staff", label: "Don’t poach staff", recommended: true },
        { value: "none", label: "None", exclusive: true },
      ],
    },
    {
      id: "E6b",
      key: "restriction_months",
      section: "After they leave",
      type: "single_choice",
      required: true,
      default: "6",
      show_if: { q: "E6a", lacks: "none" },
      text: "For how long after they leave?",
      help: "Courts only enforce a restriction that is no longer than needed to protect the business. Six months is the usual ceiling; longer is rarely upheld.",
      options: [
        { value: "3", label: "3 months" },
        { value: "6", label: "6 months", recommended: true },
      ],
    },
    {
      id: "E6c",
      key: "restricted_territory",
      section: "After they leave",
      type: "free_text",
      required: false,
      max_length: 200,
      show_if: { q: "E6a", lacks: "none" },
      text: "Where do the restrictions apply?",
      help: "Name the countries or cities where the company actually does business, e.g. “Singapore and Malaysia”. A worldwide restriction is not enforceable and is not accepted. Blank leaves a [●] to fill in.",
      placeholder: "e.g. Singapore and Malaysia",
      reject: [
        { pattern: "\\b(world ?wide|global(ly)?|anywhere|everywhere|all countries|the world|international(ly)?)\\b", message: "Courts do not enforce a worldwide restriction. Name the countries or cities where the company actually does business." },
      ],
    },
    {
      id: "E6d",
      key: "restricted_industry",
      section: "After they leave",
      type: "free_text",
      required: false,
      max_length: 200,
      show_if: { q: "E6a", has: "compete" },
      text: "Which business must they not compete with?",
      help: "The specific industry or sector the company is in, e.g. “online payments for small businesses”. “Any business” is not enforceable and is not accepted. Blank leaves a [●] to fill in.",
      placeholder: "e.g. online payments for small businesses",
      reject: [
        { pattern: "\\b(any|all|every|whatever|whichever)\\b.{0,20}\\b(business|industry|sector|compan(y|ies)|field|trade)|\\b(anything|everything)\\b", message: "“Any business” cannot be enforced. Name the specific industry the company competes in." },
      ],
    },
    /* ── 7 ── */
    {
      id: "E7",
      key: "confidentiality",
      section: "Secrets and ideas",
      type: "single_choice",
      required: true,
      default: "indefinite",
      text: "How long must they keep company secrets after leaving?",
      options: [
        { value: "2y", label: "2 years after" },
        { value: "5y", label: "5 years after" },
        { value: "indefinite", label: "Indefinite (trade secrets)", recommended: true },
      ],
    },
    /* ── 8 ── */
    {
      id: "E8a",
      key: "ip_ownership",
      section: "Secrets and ideas",
      type: "single_choice",
      required: true,
      default: "work_related",
      text: "Who owns the work and ideas they create on the job?",
      help: "It is not automatically the company in every country.",
      options: [
        { value: "all", label: "Company owns all work" },
        { value: "work_related", label: "Work-related only", recommended: true },
      ],
    },
    {
      id: "E8b",
      key: "moral_rights",
      section: "Secrets and ideas",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Should they waive their moral rights as the creator?",
      help: "The right to be named as the author and to object to changes.",
      options: [
        { value: "yes", label: "Yes", recommended: true },
        { value: "no", label: "No" },
      ],
    },
    /* ── 9 ── */
    {
      id: "E9",
      key: "outside_work",
      section: "Outside work",
      type: "single_choice",
      required: true,
      default: "shares",
      text: "Can they do other work, or hold shares in competitors, while employed?",
      help: "Controls conflicts of interest and moonlighting.",
      options: [
        { value: "exclusive", label: "Fully exclusive to us" },
        { value: "consent", label: "Outside work with our consent" },
        { value: "shares", label: "Small competitor shares allowed", recommended: true },
      ],
    },
    /* ── 10 ── */
    {
      id: "E10a",
      key: "privacy_consent",
      section: "Data and disputes",
      type: "single_choice",
      required: true,
      default: "include",
      text: "Include a data privacy clause?",
      help: "Privacy laws need consent or another legal basis to handle an employee’s personal data. The clause is always subject to the data protection laws where the employee works; where consent is not a valid basis (the UK and the EU), FD AI tells you and the clause relies on another lawful basis.",
      options: [
        { value: "include", label: "Include the privacy clause", recommended: true },
        { value: "leave_out", label: "Leave it out" },
      ],
    },
    {
      id: "E10b",
      key: "disputes",
      section: "Data and disputes",
      type: "single_choice",
      required: true,
      default: "courts",
      text: "Where do disputes go?",
      help: "Where the law does not let employment claims go to arbitration (the United Kingdom, for one), FD AI tells you; either way, claims the law reserves for an employment tribunal or labour court stay there.",
      options: [
        { value: "courts", label: "Local courts", recommended: true },
        { value: "arbitration", label: "Private arbitration" },
      ],
    },
    /* ── switch on only if relevant ── */
    {
      id: "M1",
      key: "shares_module",
      section: "Optional extras",
      type: "single_choice",
      required: true,
      default: "no",
      text: "Will they get shares, options or long-term bonuses?",
      help: "Adds good-leaver / bad-leaver rules: what happens to unvested value depends on why they left.",
      options: [
        { value: "yes", label: "Yes — add leaver rules" },
        { value: "no", label: "No", recommended: true },
      ],
    },
    {
      id: "M2",
      key: "group_rely",
      section: "Optional extras",
      type: "single_choice",
      required: true,
      default: "no",
      text: "Can other companies in the group rely on the contract?",
      help: "Lets a parent or sister company enforce the confidentiality, restriction and IP clauses directly.",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No", recommended: true },
      ],
    },
  ],
} as const;
