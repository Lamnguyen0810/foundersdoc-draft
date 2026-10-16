/**
 * IP Assignment Agreement — the wording FD AI assembles from.
 *
 * Founders Doc's own wording, built on the FD Lite menu for the IP
 * assignment agreement and its three versions:
 *
 *   Basic     Assignment (past / existing and future IP, waiver of moral
 *             rights) · Further Assurance (perfection of assignment) ·
 *             Confidentiality (confidentiality obligation)
 *   Standard  + IP Licence (grant of licence to use assigned IP rights) ·
 *             Others (independent advice)
 *   Complex   + IP Rights (distribution of IP rights) · right to sue ·
 *             scope of licence · Warranties (ownership, non-infringement,
 *             validity, originality) · completion of assignment ·
 *             permitted disclosure
 *
 * Written for any jurisdiction: the governing law picks a row of
 * JURISDICTIONS, which supplies the moral rights law, the third-party rights
 * statute, the courts or arbitration, the title guarantee (England and
 * Wales) and how a deed is signed. Under US law there is no deed: the
 * assignment recites its consideration and adds a "work made for hire"
 * clause. Where no fee is paid for the IP the document is a deed, so it
 * binds without payment.
 *
 * Markup, as the other masters: {{field}}, {{clause:id}}, {{section:id}},
 * **bold**. Where a point has versions, each is kept and keyed (`when`);
 * the assembler picks by the answers and the level.
 */

export const MASTER_VERSION = "IP-V1";
export const MASTER_LOADED = true;

export interface MasterSub {
  ref: string | null;
  text: string;
  subs?: MasterSub[];
  id?: string;
  when?: string;
}

export interface MasterClause {
  id: string;
  when?: string;
  text: string;
  subs?: MasterSub[];
  tail?: string;
}

export interface MasterSection {
  id: string;
  heading: string;
  when?: string;
  clauses: MasterClause[];
}

/* ── the jurisdictions ────────────────────────────────────────────────── */

export interface Jurisdiction {
  /** As it follows "the laws of". */
  law: string;
  /** Moral Rights: "… anywhere in the world{{moral_law}}"; "" when not known. */
  moralLaw: string;
  /** Third Party Rights: "has no right under {{tp_statute}} or otherwise"; "" when there is no statute. */
  tpStatute: string;
  /** Business Days. */
  city: string;
  /** Arbitration: seat, rules and institution. */
  seat: string;
  rules: string;
  institution: string;
  /** The courts, when the parties choose courts over arbitration. */
  courts: string;
  /** United States law: no deed, consideration recited, work made for hire. */
  us: boolean;
  /** ", with full title guarantee," — England and Wales only. */
  titleGuarantee: string;
  /** An individual's deed: "SIGNED, SEALED AND DELIVERED as a DEED by". */
  deedIndividual: string;
  /** A company's deed: the words after the company's name. */
  deedCompany: string;
  /** What a lawyer there should check. */
  checkLocally: string;
}

export const JURISDICTIONS: Record<string, Jurisdiction> = {
  sg: {
    law: "Singapore",
    moralLaw: ", including under Part 7 of the Copyright Act 2021 of Singapore",
    tpStatute: "the Contracts (Rights of Third Parties) Act 2001 of Singapore",
    city: "Singapore",
    seat: "Singapore",
    rules: "the Arbitration Rules of the Singapore International Arbitration Centre",
    institution: "the Singapore International Arbitration Centre",
    courts: "the courts of Singapore",
    us: false,
    titleGuarantee: "",
    deedIndividual: "SIGNED, SEALED AND DELIVERED as a DEED by",
    deedCompany: "in accordance with section 41B of the Companies Act 1967, by:",
    checkLocally: "that each individual author signs the waiver of moral rights (section 382 of the Copyright Act 2021 requires a written waiver signed by the author), and whether any registered patents, trade marks or designs need the assignment recorded with IPOS",
  },
  ew: {
    law: "England and Wales",
    moralLaw: ", including under Chapter IV of Part I of the Copyright, Designs and Patents Act 1988",
    tpStatute: "the Contracts (Rights of Third Parties) Act 1999",
    city: "London, United Kingdom",
    seat: "London",
    rules: "the LCIA Arbitration Rules",
    institution: "the London Court of International Arbitration",
    courts: "the courts of England and Wales",
    us: false,
    titleGuarantee: ", with full title guarantee,",
    deedIndividual: "SIGNED as a DEED by",
    deedCompany: "acting by:",
    checkLocally: "any statutory compensation for employee inventions under the Patents Act 1977, and recording the assignment of any registered rights at the UK Intellectual Property Office",
  },
  hk: {
    law: "Hong Kong",
    moralLaw: ", including under the Copyright Ordinance (Cap. 528) of Hong Kong",
    tpStatute: "the Contracts (Rights of Third Parties) Ordinance (Cap. 623) of Hong Kong",
    city: "Hong Kong",
    seat: "Hong Kong",
    rules: "the HKIAC Administered Arbitration Rules",
    institution: "the Hong Kong International Arbitration Centre",
    courts: "the courts of Hong Kong",
    us: false,
    titleGuarantee: "",
    deedIndividual: "SIGNED, SEALED AND DELIVERED as a DEED by",
    deedCompany: "acting by:",
    checkLocally: "the execution formalities for a deed, any stamp duty, and recording the assignment of any registered rights with the Intellectual Property Department",
  },
  ny: {
    law: "the State of New York",
    moralLaw: ", including under 17 U.S.C. § 106A",
    tpStatute: "",
    city: "New York, United States",
    seat: "New York, New York",
    rules: "the International Arbitration Rules of the International Centre for Dispute Resolution",
    institution: "the International Centre for Dispute Resolution",
    courts: "the state and federal courts located in the Borough of Manhattan, New York",
    us: true,
    titleGuarantee: "",
    deedIndividual: "",
    deedCompany: "",
    checkLocally: "state laws that limit the assignment of inventions an employee makes in their own time, and recording the assignment with the US Copyright Office or the USPTO",
  },
  de: {
    law: "the State of Delaware",
    moralLaw: ", including under 17 U.S.C. § 106A",
    tpStatute: "",
    city: "Wilmington, Delaware, United States",
    seat: "Wilmington, Delaware",
    rules: "the International Arbitration Rules of the International Centre for Dispute Resolution",
    institution: "the International Centre for Dispute Resolution",
    courts: "the state and federal courts located in the State of Delaware",
    us: true,
    titleGuarantee: "",
    deedIndividual: "",
    deedCompany: "",
    checkLocally: "state laws that limit the assignment of inventions an employee makes in their own time, and recording the assignment with the US Copyright Office or the USPTO",
  },
};

/** "Other": entries left as [●] for a lawyer there. */
export const OTHER_JURISDICTION: Omit<Jurisdiction, "law"> = {
  moralLaw: "",
  tpStatute: "",
  city: "",
  seat: "",
  rules: "the Arbitration Rules of the International Chamber of Commerce",
  institution: "the International Chamber of Commerce",
  courts: "",
  us: false,
  titleGuarantee: "",
  deedIndividual: "SIGNED, SEALED AND DELIVERED as a DEED by",
  deedCompany: "acting by:",
  checkLocally: "whether moral rights can be waived, how a deed (or an assignment without payment) must be signed, and whether registered rights must have the assignment recorded",
};

/* ── the head ─────────────────────────────────────────────────────────── */

export const MADE_ON = "This {{title_words}} (this \"**{{doc}}**\") is made on {{date}}";
export const BETWEEN = "Between:";
export const PARTY_COMPANY = "{{name}} (Registration Number {{id_no}}), a company incorporated in {{jurisdiction}} with its registered address at {{address}}";
export const PARTY_INDIVIDUAL = "{{name}} (identity card / passport number {{id_no}}), of {{address}}";
export const PARTIES_COLLECTIVE = "(each a \"**Party**\" and together the \"**Parties**\").";
export const BACKGROUND = "BACKGROUND";

/** Recital (A): how the Creator comes to make the Work Product. */
export const RELATIONSHIP: Record<string, string> = {
  employee: "The Creator is employed by the Recipient, and works on the Project in the course of that employment.",
  contractor: "The Recipient has engaged the Creator as an independent contractor to work on the Project.",
  consultant: "The Recipient has engaged the Creator as a consultant to work on the Project.",
  freelancer: "The Recipient has engaged the Creator as a freelancer to work on the Project.",
  consulting_co: "The Recipient has engaged the Creator, a consulting company, to provide consulting services on the Project.",
  provider: "The Recipient has engaged the Creator to provide services on the Project.",
  other: "The Creator works with the Recipient on the Project as {{role_other}}.",
  collab: "The Parties are collaborating on the Project.",
};

/** Recital (B): who is to own the Project IP. */
export const OWNERSHIP_RECITAL: Record<string, string> = {
  recipient: "The Parties have agreed that all Intellectual Property Rights in the Work Product shall belong to the Recipient, on the terms of this {{doc}}.",
  joint: "The Parties have agreed that the Intellectual Property Rights in the Work Product shall be owned by them jointly, in the shares and on the terms set out in this {{doc}}.",
  creator: "The Parties have agreed that the Intellectual Property Rights in the Work Product shall remain with the Creator, who shall license them to the Recipient on the terms of this {{doc}}.",
};

export const AGREED: Record<"agreement" | "deed", string> = {
  agreement: "It is agreed as follows:",
  deed: "This Deed witnesses as follows:",
};

/* ── the definitions ──────────────────────────────────────────────────── */

export interface Definition {
  term: string;
  text: string;
  subs?: string[];
  when?: string;
}

export const DEFINITIONS: Definition[] = [
  { term: "Background IP", when: "background", text: "has the meaning given to it in {{clause:background}} (Background IP);" },
  { term: "Business Day", when: "business_day", text: "means a day (other than a Saturday, a Sunday or a public holiday) on which banks are open for general business in {{city}};" },
  {
    term: "Confidential Information",
    text: "means, for each Party, all information of a confidential nature (in whatever form) that the Party, or anyone on its behalf, discloses or makes available to the other Party in connection with the Project or this {{doc}}, and the terms of this {{doc}}; and the Work Product is the Confidential Information of {{wp_owner}}{{wp_except}};",
  },
  { term: "Fee", when: "fee", text: "has the meaning given to it in {{clause:fee}} (Fee);" },
  {
    term: "Intellectual Property Rights",
    text: "means patents, rights to inventions, copyright and related rights (including in software, source code and object code), trade marks, service marks, business names and domain names, rights in get-up and goodwill and the right to sue for passing off, rights in designs, database rights, rights in confidential information (including know-how and trade secrets) and all other intellectual property rights, in each case whether registered or unregistered, including all applications for, and renewals or extensions of, those rights, and all similar or equivalent rights or forms of protection anywhere in the world;",
  },
  { term: "Licence", when: "creator_owns", text: "has the meaning given to it in {{clause:grant}} (Grant of Licence);" },
  { term: "Moral Rights", text: "means the right to be identified as the author of a work, the right to object to derogatory treatment of a work, the right not to have a work falsely attributed, and any similar right anywhere in the world{{moral_law}};" },
  { term: "Project", text: "means the project under which {{project_who}} {{work}}, as further described in Schedule 1;" },
  { term: "Project IP", text: "means all Intellectual Property Rights in the Work Product;" },
  { term: "Project Period", text: "means {{project_period}};" },
  {
    term: "Work Product",
    text: "means all works, materials, inventions, software (in source code and object code), designs, artwork, documents, data, information and other output that {{wp_who}} creates, writes, develops or conceives, alone or with others, in the course of or in connection with the Project during the Project Period, including those described in Schedule 1.",
  },
];

/** The Project Period, by the kind of project (IP9). */
export const PROJECT_PERIOD: Record<string, string> = {
  one_off: "the period beginning on the date the Creator first started work on the Project (whether before or after the date of this {{doc}}) and ending when the Project is completed",
  fixed: "the period of {{months_words}} beginning on the date of this {{doc}}, together with any earlier period in which the Creator worked on the Project",
  ongoing: "the period beginning on the date the Creator first started work on the Project (whether before or after the date of this {{doc}}) and ending when the Creator stops working on the Project",
  collab: "the period beginning on the date the Parties first started work on the Project (whether before or after the date of this {{doc}}) and ending when the Parties stop collaborating on it",
};

export const INTERPRETATION: string[] = [
  "The headings in this {{doc}} are for convenience only and do not affect its interpretation.",
  "References to Clauses and Schedules are to the clauses of, and the schedules to, this {{doc}}, and the Schedules form part of this {{doc}}.",
  "A \"person\" includes an individual, a company, a partnership, a trust and any other body, whether or not it has a separate legal personality, and a reference to a Party includes its successors and permitted assigns.",
  "Words in the singular include the plural and vice versa, and \"including\" and similar words do not limit the words before them.",
  "A reference to a law is to that law as amended or replaced from time to time, and \"writing\" includes email.",
];

/* ── the clauses ──────────────────────────────────────────────────────── */

const CONTRIBUTORS_START =
  "**Contributors.** Where anyone other than the Creator contributes to the Work Product on the Creator's behalf (including the Creator's employees, subcontractors and other personnel), the Creator shall ensure, before that person starts work on the Project, that the person assigns to the Creator in writing all Intellectual Property Rights in their contribution and waives in writing their Moral Rights in it, so that the Creator can";

export const SECTIONS: MasterSection[] = [
  {
    id: "interpretation",
    heading: "INTERPRETATION",
    clauses: [
      { id: "definitions", text: "**Definitions.** In this {{doc}}, unless the context requires otherwise:" },
      { id: "interpretation", text: "**Interpretation.** In this {{doc}}:" },
    ],
  },
  {
    id: "assignment",
    heading: "ASSIGNMENT",
    when: "assign",
    clauses: [
      {
        id: "existing",
        text: "**Assignment of Past and Existing IP Rights.** {{lead}}{{title_guarantee}} hereby assigns to the Recipient absolutely{{share_of}} all of its right, title and interest in and to the Project IP that exists at the date of this {{doc}}, including in all Work Product created before that date.",
      },
      {
        id: "future",
        text: "**Assignment of Future IP Rights.** The Creator{{title_guarantee}} hereby assigns to the Recipient, by way of a present assignment of future rights,{{share_of}} all of its right, title and interest in and to the Project IP that comes into existence after the date of this {{doc}}, with effect from the moment each such right comes into existence. To the extent that any such right does not vest in the Recipient when it comes into existence, the Creator shall hold it on trust for the Recipient{{trust_share}} until it is assigned under {{clause:perfection}} (Perfection of Assignment).",
      },
      {
        id: "hire",
        when: "us_hire",
        text: "**Works Made for Hire.** To the extent permitted by law, all copyrightable Work Product is a \"work made for hire\" for the Recipient within the meaning of the United States Copyright Act of 1976, owned by the Recipient from its creation. Any Work Product that is not a work made for hire is assigned under {{clause:existing}} and {{clause:future}}.",
      },
      {
        id: "sue",
        when: "sue",
        text: "**Assignment of Right to Sue.** The assignments in this {{section:assignment}} include the right to bring proceedings for, and to recover and keep damages and all other remedies in respect of, any infringement or misuse of the Project IP{{assigned_share}}, whether it occurred before, on or after the date of this {{doc}}.",
      },
      { id: "contributors", when: "contributors_assign", text: `${CONTRIBUTORS_START} give full effect to this {{doc}}.{{recipient_contribution}}` },
      {
        id: "moral",
        text: "**Waiver of Moral Rights.** The Creator irrevocably and unconditionally waives, and shall ensure that each individual author of any part of the Work Product waives in writing, all Moral Rights in the Work Product in favour of the Recipient and its licensees and successors in title, to the extent permitted by law. Where a Moral Right cannot be waived, the Creator agrees not to assert it, and consents to any act or omission by any of those persons that would otherwise infringe it.",
      },
    ],
  },
  {
    id: "distribution",
    heading: "IP RIGHTS",
    when: "complex",
    clauses: [
      {
        id: "distribution",
        when: "recipient_owns",
        text: "**Distribution of IP Rights.** As between the Parties, the Recipient owns all Project IP. The Creator acquires no right, title or interest in the Project IP except as expressly set out in this {{doc}}, and shall not register, or apply to register, any of it in its own name.",
      },
      {
        id: "distribution",
        when: "joint",
        text: "**Distribution of IP Rights.** The Parties own the Project IP jointly, as to {{creator_share}} by the Creator and {{recipient_share}} by the Recipient.",
      },
      {
        id: "joint_terms",
        when: "joint",
        text: "**Joint Ownership.** Unless the Parties agree otherwise in writing:",
        subs: [
          { ref: "(a)", text: "each Party may use the Project IP for its own business purposes without accounting to the other Party;" },
          { ref: "(b)", text: "neither Party may assign, charge, license or otherwise deal with the Project IP, or its share in it, without the other Party's prior written consent (which shall not be unreasonably withheld or delayed);" },
          { ref: "(c)", text: "any net income from licensing or otherwise exploiting the Project IP with third parties shall be shared between the Parties in the shares set out in {{clause:distribution}};" },
          { ref: "(d)", text: "the Parties shall decide together whether to apply for, register, maintain and enforce any of the Project IP, and shall share the costs of doing so in the same shares; and" },
          { ref: "(e)", text: "anything the Recipient contributes to the Work Product forms part of the Project IP and is owned by the Parties in the same shares, and the Recipient shall sign any document the Creator reasonably requires to give effect to this." },
        ],
      },
      {
        id: "distribution",
        when: "creator_owns",
        text: "**Distribution of IP Rights.** The Creator owns all Project IP. Nothing in this {{doc}} assigns any Project IP to the Recipient, whose rights in it are those of a licensee under {{clause:grant}} (Grant of Licence).",
      },
      { id: "contributors", when: "contributors_creator", text: `${CONTRIBUTORS_START} grant the Licence in full.{{recipient_contribution}}` },
      {
        id: "buy_back",
        when: "buy_back",
        text: "**Buy-Back Option.** The Creator may at any time, by written notice to the Recipient, require the Recipient to assign all (or the part specified in the notice) of the Project IP to the Creator. The price is the fair market value of the Project IP concerned, as agreed by the Parties or, failing agreement within thirty (30) days after the notice, as determined by an independent valuer appointed jointly by the Parties, whose fees the Parties shall share equally. Within ten (10) Business Days after the price is paid, the Recipient shall assign that Project IP to the Creator, and the Recipient shall then have a non-exclusive, perpetual and royalty-free licence to continue using any Work Product it was using at the date of the notice.",
      },
    ],
  },
  {
    id: "licence",
    heading: "IP LICENCE",
    when: "licence_section",
    clauses: [
      {
        id: "background",
        when: "background",
        text: "**Background IP.** Intellectual Property Rights that the Creator owned before the Project started, or develops independently of it (\"**Background IP**\"), are not assigned by this {{doc}}. To the extent that any Background IP is included in the Work Product, the Creator grants the Recipient a non-exclusive, perpetual, irrevocable, royalty-free and worldwide licence (with the right to sub-license) to use, copy, modify and exploit that Background IP as part of the Work Product.",
      },
      {
        id: "grant",
        when: "back_showcase",
        text: "**Grant of Licence to Use Assigned IP Rights.** The Recipient grants the Creator a non-exclusive, non-transferable, royalty-free and worldwide licence to reproduce and display the Work Product, and extracts and images of it, in the Creator's portfolio, website, case studies and marketing materials to show the work the Creator has done, provided that the Creator does not disclose any other Confidential Information of the Recipient and removes any item on the Recipient's reasonable written request.",
      },
      {
        id: "grant",
        when: "back_any",
        text: "**Grant of Licence to Use Assigned IP Rights.** The Recipient grants the Creator a non-exclusive, perpetual, royalty-free and worldwide licence to use, copy, modify and exploit the Work Product for any purpose, provided that the Creator does not disclose any other Confidential Information of the Recipient.",
      },
      {
        id: "grant",
        when: "licence_perpetual",
        text: "**Grant of Licence.** {{lead}} grants the Recipient {{a_exclusivity}}, perpetual, irrevocable, royalty-free and worldwide licence to use, copy, modify, adapt and exploit the Project IP for any purpose of the Recipient's business (the \"**Licence**\").",
      },
      {
        id: "grant",
        when: "licence_limited",
        text: "**Grant of Licence.** {{lead}} grants the Recipient {{a_exclusivity}}, non-transferable and royalty-free licence to use and copy the Project IP solely for the purposes of the Project, during the Project Period and for so long afterwards as is reasonably needed to use the Work Product delivered to it for those purposes (the \"**Licence**\").",
      },
      {
        id: "scope",
        when: "scope_back",
        text: "**Scope of Licence.** The licence in {{clause:grant}}:",
        subs: [
          { ref: "(a)", text: "is personal to the Creator, who may not sub-license, assign or transfer it without the Recipient's prior written consent;" },
          { ref: "(b)", text: "does not permit the Creator to register, or claim ownership of, any of the Project IP, or to use the Recipient's name or trade marks other than to identify the Recipient as its client;" },
          { ref: "(c)", text: "may be ended by the Recipient by written notice if the Creator materially breaches this {{doc}} and does not remedy the breach within thirty (30) days after being asked in writing to do so; and" },
          { ref: "(d)", text: "otherwise continues after the Project Period ends." },
        ],
      },
      {
        id: "scope",
        when: "scope_licence",
        text: "**Scope of Licence.** The Licence:",
        subs: [
          { ref: "(a)", when: "exclusive", text: "is exclusive: while it continues, the Creator shall not use the Project IP itself, or license or permit anyone else to use it;" },
          { ref: "(a)", when: "sole", text: "is sole: while it continues, the Creator may use the Project IP itself, but shall not license or permit anyone else to use it;" },
          { ref: "(a)", when: "non_exclusive", text: "is non-exclusive: the Creator may continue to use the Project IP and license it to others;" },
          { ref: "(b)", text: "allows the Recipient to sub-license its rights to its affiliates, and to contractors acting for the Recipient, solely for the Recipient's benefit;" },
          { ref: "(c)", text: "may not be assigned or transferred by the Recipient except to a successor to the whole or substantially the whole of its business; and" },
          { ref: "(d)", text: "extends to the whole world." },
        ],
      },
      {
        id: "moral_licence",
        when: "creator_owns",
        text: "**Moral Rights.** To the extent permitted by law, the Creator waives, and shall ensure that each individual author of any part of the Work Product waives in writing, all Moral Rights in the Work Product in respect of any use of it by the Recipient under the Licence. Where a Moral Right cannot be waived, the Creator agrees not to assert it against the Recipient or its sub-licensees.",
      },
    ],
  },
  {
    id: "fee",
    heading: "FEE",
    when: "fee",
    clauses: [
      {
        id: "fee",
        text: "**Fee.** In consideration of the {{fee_for}} under this {{doc}}, the Recipient shall pay the Creator {{fee}} ({{fee_words}}) (the \"**Fee**\") within thirty (30) days after the date of this {{doc}}. The Fee is the whole of the payment due for those rights, and no royalty or other sum is payable for them.",
      },
      { id: "taxes", text: "**Taxes.** The Fee is exclusive of any goods and services tax, value added tax or similar tax, which the Recipient shall pay in addition on receipt of a valid tax invoice." },
    ],
  },
  {
    id: "warranties",
    heading: "WARRANTIES",
    when: "warranties",
    clauses: [
      {
        id: "warranties",
        text: "**Warranties.** The Creator warrants to the Recipient that, at the date of this {{doc}} and when each item of Work Product is created:",
        subs: [
          { ref: "(a)", when: "w_ownership", text: "**Ownership of IP:** the Creator is (or will be when it is created) the sole legal and beneficial owner of the Project IP in the Work Product it creates, subject only to this {{doc}}, free from any licence, charge, claim or other encumbrance, and has full right and authority to enter into this {{doc}};" },
          { ref: "(b)", when: "w_non_infringement", text: "**Non-Infringement of IP:**{{knowledge}} the Work Product, and its use as permitted by this {{doc}}, does not and will not infringe the Intellectual Property Rights or other rights of any third party;" },
          { ref: "(c)", when: "w_validity", text: "**Validity of IP:**{{knowledge}} nothing has been done or omitted by or with the authority of the Creator that would make any of the Project IP invalid or unenforceable, or prevent it from being registered; and" },
          { ref: "(d)", when: "w_originality", text: "**Originality of Work:** the Work Product is the original work of the Creator (or of the Creator's personnel), and has not been copied wholly or substantially from any other work, except for third-party or open-source material that the Creator has disclosed to the Recipient in writing." },
        ],
      },
    ],
  },
  {
    id: "assurance",
    heading: "FURTHER ASSURANCE",
    clauses: [
      {
        id: "perfection",
        when: "assign",
        text: "**Perfection of Assignment.** The Creator shall, at the Recipient's request and cost, promptly sign all documents and do all other things that the Recipient reasonably requires to perfect, register, record, maintain, defend or enforce the Recipient's rights in the Project IP{{assigned_share}} anywhere in the world, including signing confirmatory assignments and applications for registration. The Creator shall not challenge the validity of, or the Recipient's rights in, the Project IP.",
      },
      {
        id: "perfection",
        when: "creator_owns",
        text: "**Further Assurance.** Each Party shall, at the request and cost of the other, sign all documents and do all other things reasonably required to give full effect to this {{doc}}, including any registration or recording of the Licence.",
      },
      {
        id: "completion",
        when: "completion_recipient",
        text: "**Completion of Assignment.** Within ten (10) Business Days after the end of the Project Period, or earlier on the Recipient's written request, the Creator shall deliver to the Recipient all Work Product in its possession or control, in its current form and in any reasonable format the Recipient asks for{{code_tail}}, together with any passwords, credentials or keys needed to access it. The Creator shall not keep any copy, except {{keep_copy}}.",
      },
      {
        id: "completion",
        when: "completion_joint",
        text: "**Completion of Assignment.** Within ten (10) Business Days after the end of the Project Period, or earlier on the Recipient's written request, the Creator shall deliver to the Recipient a copy of all Work Product in its possession or control, in its current form and in any reasonable format the Recipient asks for{{code_tail}}, together with any passwords, credentials or keys needed to access it.",
      },
      {
        id: "completion",
        when: "completion_creator",
        text: "**Completion.** Within ten (10) Business Days after the end of the Project Period, or earlier on the Recipient's written request, the Creator shall deliver to the Recipient a copy of all Work Product that the Recipient reasonably needs to exercise the Licence{{code_tail}}.",
      },
    ],
  },
  {
    id: "confidentiality",
    heading: "CONFIDENTIALITY",
    clauses: [
      {
        id: "confidentiality",
        text: "**Confidentiality Obligation.** Each Party shall keep the other Party's Confidential Information confidential, use it only for the Project and to perform this {{doc}}, and not disclose it to any other person{{conf_except}}. This {{section:confidentiality}} continues to apply after the Project Period ends.",
      },
      {
        id: "permitted",
        when: "complex",
        text: "**Permitted Disclosure.** A Party may disclose the other Party's Confidential Information:",
        subs: [
          { ref: "(a)", text: "to its officers, employees, contractors, professional advisers, investors, prospective investors and prospective acquirers who need to know it for the purposes of this {{doc}} or the Party's business, and who are bound by duties of confidentiality no less protective than this {{section:confidentiality}};" },
          { ref: "(b)", text: "where required by law, by a court, by any governmental or regulatory authority or by the rules of a stock exchange, provided that (where lawful) it gives the other Party prompt notice of the requirement; and" },
          { ref: "(c)", text: "with the other Party's prior written consent." },
        ],
        tail: "{{clause:confidentiality}} does not apply to information that is or becomes public other than through a breach of this {{doc}}, that the receiving Party already lawfully had without any duty of confidence, or that the receiving Party develops independently without using the Confidential Information.",
      },
      {
        id: "return",
        when: "conf_return",
        text: "**Return of Information.** When the Project Period ends, or earlier on the Recipient's written request, the Creator shall return or destroy (as the Recipient chooses) all Confidential Information of the Recipient in its possession or control, except for any copy it must keep by law{{or_licence_copy}}, which remains subject to this {{section:confidentiality}}.",
      },
    ],
  },
  {
    id: "general",
    heading: "GENERAL",
    clauses: [
      { id: "advice", when: "advice", text: "**Independent Advice.** Each Party confirms that it has read and understood this {{doc}}, that it has had the opportunity to take independent legal advice on it before signing, and that it enters into this {{doc}} freely." },
      {
        id: "entire",
        text: "**Entire Agreement.** This {{doc}} contains the whole agreement between the Parties about the Project IP and supersedes any earlier understanding about it. If any other agreement between the Parties (including any employment or services agreement) deals with the Project IP differently, this {{doc}} prevails. Each Party confirms that it has not relied on any statement that is not set out in this {{doc}}, but nothing in this Clause limits liability for fraud.",
      },
      { id: "relationship", text: "**Relationship.** Nothing in this {{doc}} creates a partnership or agency between the Parties, or changes any other terms on which the Creator works with the Recipient." },
      {
        id: "transfer",
        when: "recipient_owns",
        text: "**Transfer.** The Recipient may assign or transfer its rights under this {{doc}} to any person to whom it transfers the Project IP. The Creator may not assign or transfer its rights or obligations under this {{doc}} without the Recipient's prior written consent.",
      },
      {
        id: "transfer",
        when: "not_recipient_owns",
        text: "**Transfer.** Except as set out in this {{doc}}, neither Party may assign or transfer its rights or obligations under this {{doc}} without the other Party's prior written consent.",
      },
      { id: "amendments", text: "**Amendments.** This {{doc}} may only be amended in writing signed by both Parties." },
      { id: "waiver", text: "**Waiver.** A failure or delay in exercising a right or remedy under this {{doc}} is not a waiver of it, and a single or partial exercise of a right or remedy does not prevent its further exercise." },
      { id: "severance", text: "**Severance.** If any provision of this {{doc}} is or becomes invalid, illegal or unenforceable under the law of any jurisdiction, that does not affect the rest of this {{doc}}, or that provision under the law of any other jurisdiction." },
      { id: "costs", text: "**Costs.** Each Party bears its own costs of negotiating, preparing and entering into this {{doc}}, except as set out in it." },
      {
        id: "notices",
        text: "**Notices.** A notice under this {{doc}} must be in writing and in English, and may be delivered by hand, sent by post or sent by email to the Party at the address or email address below, or any other address or email address the Party notifies in writing:",
        subs: [
          { ref: null, text: "Creator: Address: {{cr_address}}; Email: {{cr_email}}" },
          { ref: null, text: "Recipient: Address: {{re_address}}; Email: {{re_email}}" },
        ],
      },
      {
        id: "third_party",
        text: "**Third Party Rights.**",
        subs: [
          { ref: "(a)", text: "Unless expressly provided to the contrary in this {{doc}}, a person who is not a Party has no right {{tp_under}}to enforce or enjoy the benefit of any term of this {{doc}}." },
          { ref: "(b)", text: "Notwithstanding any term of this {{doc}}, the consent of any person who is not a Party is not required to rescind or vary this {{doc}}." },
        ],
      },
      {
        id: "counterparts",
        when: "agreement",
        text: "**Counterparts.** This Agreement may be signed in any number of counterparts, which together are one agreement. To the extent permitted by the governing law, this Agreement may be signed by electronic signature, and a signed counterpart may be delivered by email.",
      },
      { id: "counterparts", when: "deed", text: "**Counterparts.** This Deed may be executed in any number of counterparts, each of which is an original and which together are one deed." },
      { id: "delivery", when: "deed", text: "**Delivery.** This Deed is delivered on the date written at the start of it." },
      {
        id: "law",
        when: "arbitration",
        text: "**Governing Law & Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "This {{doc}} shall be governed by, and construed in accordance with, the laws of {{law}}." },
          { ref: "(b)", text: "If any dispute, controversy or claim arises out of or in connection with this {{doc}}, the Parties shall first try in good faith to resolve it by consultation or mediation, beginning as soon as practicable after one Party gives the other written notice of the dispute." },
          { ref: "(c)", text: "If the dispute is not settled within thirty (30) days after that notice, it shall be referred to and finally resolved by arbitration seated in {{seat}} in accordance with {{rules}} administered by {{institution}} for the time being in force (the \"**Rules**\"). The tribunal shall consist of one arbitrator appointed in accordance with the Rules, and the language of the arbitration shall be English." },
          { ref: "(d)", text: "Nothing in this Clause prevents a Party from seeking urgent interim or injunctive relief from any court of competent jurisdiction." },
        ],
      },
      {
        id: "law",
        when: "courts",
        text: "**Governing Law & Dispute Resolution.**",
        subs: [
          { ref: "(a)", text: "This {{doc}} shall be governed by, and construed in accordance with, the laws of {{law}}." },
          { ref: "(b)", text: "If any dispute, controversy or claim arises out of or in connection with this {{doc}}, the Parties shall first try in good faith to resolve it by consultation or mediation, beginning as soon as practicable after one Party gives the other written notice of the dispute." },
          { ref: "(c)", text: "If the dispute is not settled within thirty (30) days after that notice, {{courts}} shall have exclusive jurisdiction to settle it." },
          { ref: "(d)", text: "Nothing in this Clause prevents a Party from seeking urgent interim or injunctive relief from any court of competent jurisdiction." },
        ],
      },
    ],
  },
];

export const IN_WITNESS: Record<"agreement" | "deed", string> = {
  agreement: "IN WITNESS WHEREOF the Parties have signed this Agreement on the date written above.",
  deed: "IN WITNESS WHEREOF this Deed has been executed by the Parties and is delivered on the date written above.",
};

/* ── Schedule 1 ───────────────────────────────────────────────────────── */

export const SCHEDULE_TITLE = "THE PROJECT AND THE WORK PRODUCT";

/** One line for each type of IP (IP7), for the parties to list the items. */
export const SCHEDULE_ITEMS: Record<string, string> = {
  coding: "Software (names, versions, repositories and libraries)",
  artwork: "Artwork and designs, including logos, trade marks, infographics and videos (titles, file names and formats)",
  proprietary: "Proprietary information and know-how (a description of each item)",
};
