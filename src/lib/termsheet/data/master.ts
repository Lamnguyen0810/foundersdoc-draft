/**
 * FD Master Term Sheet v4.0 — letter form, jurisdiction-neutral.
 *
 * The approved wording, as data. The assembler fills the {{fields}}, chooses
 * between the alternatives and drops what does not apply; it never rewrites
 * a sentence. The reviewer guide and the blue drafting notes in the Word
 * file are not here — they are for the platform and the lawyer, not the
 * client — but the points they make are enforced in assemble.ts.
 *
 * Markup, as the master defines it:
 *   {{field}}      fill in
 *   [A / B]        choose one          (resolved in assemble.ts, by clause)
 *   [text]         optional            (resolved in assemble.ts, by clause)
 *   **bold**       bold, as the master has it (defined terms, party names)
 *
 * Laws are always included and cannot be removed: 1, 2, 3, 10, 11, 12.
 * Conventions may be included, tweaked or removed for each deal: 4–9.
 * Paragraphs 7, 8 and 9 are binding if included, and 3.1 lists them.
 */

export interface MasterSub {
  /** "(a)", "(b)" … or null for an unnumbered continuation line. */
  ref: string | null;
  text: string;
}

export interface MasterClause {
  number: string;
  text: string;
  subparagraphs?: MasterSub[];
}

export interface MasterParagraph {
  number: string;
  heading: string;
  tier: "LAW" | "CONVENTION";
  binding: boolean;
  clauses: MasterClause[];
}

export const MASTER_VERSION = "4.0";

/** Above the first paragraph. One entry per line of the letterhead. */
export const HEADER: string[] = [
  "**STRICTLY PRIVATE AND CONFIDENTIAL**",
  "**SUBJECT TO CONTRACT**",
  "{{date}}",
  "**{{recipient_name}}**",
  "{{recipient_address}}",
  "Attention: {{recipient_contact}}",
  "Dear {{salutation}},",
  "**{{document_title}} – {{transaction_title}}**",
  "We refer to our recent discussions and are pleased to set out below the principal terms on which the Parties propose to proceed with the Proposed Transaction (as defined below) (this letter, the **“Term Sheet”**).",
];

/** 1.1(a)/(b), and the company form for any further party. */
export const PARTY_COMPANY =
  "**{{name}}** ({{registration_label}}: {{reg_no}}), a {{entity_type}} incorporated in {{jurisdiction}} with its registered office at {{address}} (the **“{{role}}”**)";

/** The individual form for a party who is a person. Never described as incorporated. */
export const PARTY_INDIVIDUAL = "**{{name}}**, holder of {{id_type}} number {{id_no}}, of {{address}} (the **“{{role}}”**)";

export const PARAGRAPHS: MasterParagraph[] = [
  {
    number: "1",
    heading: "Parties",
    tier: "LAW",
    binding: false,
    clauses: [
      {
        number: "1.1",
        text: "This Term Sheet is entered into between:",
        subparagraphs: [
          /* (a), (b) and any further party are built from PARTY_COMPANY /
             PARTY_INDIVIDUAL by the assembler; then this line. */
          { ref: null, text: "(each a **“Party”** and together the **“Parties”**)." },
        ],
      },
      {
        number: "1.2",
        text: "In this Term Sheet, references to **“we”**, **“us”** and **“our”** are to the {{party_1_role}}, and references to **“you”** and **“your”** are to the {{party_2_role}}.",
      },
    ],
  },
  {
    number: "2",
    heading: "The Proposed Transaction",
    tier: "LAW",
    binding: false,
    clauses: [
      { number: "2.1", text: "**Nature.** The Parties propose to enter into {{transaction_description}} (the **“Proposed Transaction”**)." },
      { number: "2.2", text: "**Subject Matter.** The subject matter of the Proposed Transaction is {{subject_matter}}." },
      { number: "2.3", text: "**Structure.** The Proposed Transaction shall be structured as follows: {{structure}}." },
      {
        number: "2.4",
        text: "**Definitive Agreements.** The Proposed Transaction shall be documented in {{definitive_agreements}} and such other documents as the Parties may agree (together, the **“Definitive Agreements”**).",
      },
    ],
  },
  {
    number: "3",
    heading: "Legal Effect",
    tier: "LAW",
    binding: true,
    clauses: [
      {
        number: "3.1",
        text: "Save for this paragraph 3 and the paragraphs headed {{binding_provisions}} (together, the **“Binding Provisions”**), this Term Sheet is not legally binding and does not constitute an offer or a commitment by any Party to enter into the Proposed Transaction.",
      },
      { number: "3.2", text: "The Binding Provisions shall be legally binding on the Parties from the date on which this Term Sheet is accepted." },
      {
        number: "3.3",
        text: "This Term Sheet is not exhaustive. No Party shall be obliged to proceed with the Proposed Transaction unless and until the Definitive Agreements have been signed. If there is any inconsistency between this Term Sheet and the Definitive Agreements, the Definitive Agreements shall prevail.",
      },
    ],
  },
  {
    number: "4",
    heading: "Key Commercial Terms",
    tier: "CONVENTION",
    binding: false,
    clauses: [
      {
        number: "4.1",
        text: "The principal commercial terms of the Proposed Transaction are as follows:",
        /* One line per key term, built by the assembler: "**Heading:** text;"
           … the last ending with a full stop. */
        subparagraphs: [],
      },
    ],
  },
  {
    number: "5",
    heading: "Conditions and Due Diligence",
    tier: "CONVENTION",
    binding: false,
    clauses: [
      { number: "5.1", text: "Completion of the Proposed Transaction shall be conditional upon {{conditions}}." },
      {
        /* Optional: only when due diligence is one of the conditions. */
        number: "5.2",
        text: "The {{party_2_role}} shall give the {{party_1_role}} and its advisers reasonable access to its information, records, premises and management for the purposes of due diligence.",
      },
    ],
  },
  {
    number: "6",
    heading: "Timetable",
    tier: "CONVENTION",
    binding: false,
    clauses: [
      {
        number: "6.1",
        text: "The Parties shall use reasonable endeavours to sign the Definitive Agreements within {{signing_period}} of the date of this Term Sheet and to complete the Proposed Transaction by {{completion_date}}.",
      },
    ],
  },
  {
    number: "7",
    heading: "Exclusivity",
    tier: "CONVENTION",
    binding: true,
    clauses: [
      {
        number: "7.1",
        text: "During the period of {{exclusivity_period}} from the date on which this Term Sheet is accepted (the **“Exclusivity Period”**), the {{party_2_role}} shall not, and shall procure that its directors, officers, employees, shareholders and advisers shall not, directly or indirectly, solicit, encourage or enter into any discussions or negotiations with any person other than the {{party_1_role}} in relation to any transaction similar to or competing with the Proposed Transaction.",
      },
      {
        number: "7.2",
        text: "The {{party_2_role}} shall promptly notify the {{party_1_role}} of any approach it receives during the Exclusivity Period in relation to such a transaction.",
      },
    ],
  },
  {
    number: "8",
    heading: "Confidentiality",
    tier: "CONVENTION",
    binding: true,
    clauses: [
      {
        number: "8.1",
        text: "Each Party shall keep confidential the existence and terms of this Term Sheet, the fact of the negotiations and all information received from another Party in connection with the Proposed Transaction, save for disclosure:",
        subparagraphs: [
          {
            ref: "(a)",
            text: "to its Affiliates and to its and their officers, employees and professional advisers, on a need-to-know basis and subject to equivalent obligations of confidence;",
          },
          { ref: "(b)", text: "with the prior written consent of the other Parties; or" },
          { ref: "(c)", text: "as required by law or by any regulatory authority or stock exchange." },
        ],
      },
      {
        number: "8.2",
        text: "In this Term Sheet, **“Affiliate”** means, in relation to a person, any entity which controls, is controlled by or is under common control with that person.",
      },
    ],
  },
  {
    number: "9",
    heading: "Costs",
    tier: "CONVENTION",
    binding: true,
    clauses: [
      {
        /* [own costs / {{costs_allocation}}] — chosen by the assembler. */
        number: "9.1",
        text: "[Each Party shall bear its own costs and expenses incurred in connection with the Proposed Transaction, whether or not it proceeds. / {{costs_allocation}}]",
      },
    ],
  },
  {
    number: "10",
    heading: "Expiry",
    tier: "LAW",
    binding: true,
    clauses: [
      { number: "10.1", text: "This Term Sheet shall lapse if it is not accepted by {{expiry_date}}." },
      {
        number: "10.2",
        text: "Once accepted, this Term Sheet shall terminate on the earliest of:",
        subparagraphs: [
          { ref: "(a)", text: "the signing of the Definitive Agreements;" },
          { ref: "(b)", text: "{{long_stop_date}}; and" },
          { ref: "(c)", text: "written notice by any Party to the other Parties that it does not wish to proceed with the Proposed Transaction." },
        ],
      },
      {
        number: "10.3",
        text: "Termination shall not affect any rights or liabilities accrued before termination. The paragraphs headed “Legal Effect”, “Confidentiality”, “Costs”, “Governing Law and Disputes” and “General” (to the extent included) shall survive termination.",
      },
    ],
  },
  {
    number: "11",
    heading: "Governing Law and Disputes",
    tier: "LAW",
    binding: true,
    clauses: [
      { number: "11.1", text: "This Term Sheet shall be governed by and construed in accordance with the laws of {{governing_law}}." },
      {
        /* [courts / arbitration] — chosen by the assembler. */
        number: "11.2",
        text: "[The Parties shall first attempt in good faith to resolve any dispute arising out of or in connection with this Term Sheet within one (1) month. Failing that, the dispute shall be finally resolved by the courts of {{court_jurisdiction}}, which shall have exclusive jurisdiction. / Any dispute arising out of or in connection with this Term Sheet, including any question regarding its existence, validity or termination, shall be referred to and finally resolved by arbitration administered by {{arbitral_institution}} in accordance with its rules in force at the time. The seat of the arbitration shall be {{arbitration_seat}}, the tribunal shall consist of one (1) arbitrator and the language of the arbitration shall be {{arbitration_language}}.]",
      },
    ],
  },
  {
    number: "12",
    heading: "General",
    tier: "LAW",
    binding: true,
    clauses: [
      {
        /* [, whether under {{third_party_rights_statute}} or otherwise] — kept
           only when the lookup has a statute for the governing law. */
        number: "12.1",
        text: "A person who is not a Party shall have no right to enforce any term of this Term Sheet[, whether under {{third_party_rights_statute}} or otherwise].",
      },
      {
        number: "12.2",
        text: "This Term Sheet may be signed in any number of counterparts, each of which is an original and which together constitute one document. Signatures may be exchanged by email or electronic signature, and each Party agrees to be bound by its electronic signature.",
      },
    ],
  },
];

/** After the last paragraph. */
export const CLOSING: string[] = [
  "Please confirm your acceptance of this Term Sheet by signing and returning a copy of this letter to us by {{expiry_date}}.",
  "Yours faithfully,",
];

/** The issuing party signs first; the others accept. An individual signs in
 *  their own name — no "For and on behalf of", no Title. */
export const SIGNATURE_COMPANY = ["SIGNED by **{{NAME}}**", "___________________________", "For and on behalf of {{name}}", "Name:", "Title:", "Email:"];
export const SIGNATURE_INDIVIDUAL = ["SIGNED by **{{NAME}}**", "___________________________", "Name:", "Email:"];
export const ACCEPTANCE = ["**ACCEPTANCE**", "We acknowledge and agree to the terms of this Term Sheet."];
export const ACCEPTANCE_DATE = "Date:";

/** The title may follow local practice; the defined term stays "Term Sheet". */
export const DOCUMENT_TITLES = ["TERM SHEET", "HEADS OF TERMS", "LETTER OF INTENT", "MEMORANDUM OF UNDERSTANDING"];
