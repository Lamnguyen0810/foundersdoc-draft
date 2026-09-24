/**
 * The document map (v1.0, brought up to master v4.0): how answers become the
 * term sheet. Which paragraphs are included, the fixed wordings that answers
 * resolve to, and the starter lookup tables by jurisdiction.
 *
 * Taken from the firm's document_map.json. The lookups are starter data —
 * the file itself says every entry is to be verified with local counsel
 * before production use — and the assembler flags any draft that falls
 * through to a default rather than pretending it knew.
 */

import type { Condition } from "../conditions";

export type DealType = "investment" | "loan" | "acquisition" | "project" | "other";

/** party_1 is the side sending the term sheet; party_2 the side receiving it. */
export const ROLES: Record<DealType, [string, string]> = {
  investment: ["Investor", "Company"],
  loan: ["Lender", "Borrower"],
  acquisition: ["Buyer", "Seller"],
  project: ["Lead Party", "Partner"],
  other: ["First Party", "Second Party"],
};

/** Paragraph 2.2, by the Q4 answer. `{{target_name}}` and `{{project_subject}}`
 *  are filled from the parties and the deal summary. */
export const SUBJECT: Record<string, string> = {
  new_shares: "newly issued shares in the capital of the Company",
  existing_shares:
    "existing shares in the capital of the Company to be sold by one or more of its current shareholders",
  safe: "a simple agreement for future equity (SAFE) to be issued by the Company",
  convertible_note: "a convertible note to be issued by the Company",
  term_loan: "a term loan to be made available by the Lender to the Borrower",
  revolving: "a revolving credit facility to be made available by the Lender to the Borrower",
  convertible_loan: "a loan to be made by the Lender to the Borrower, convertible into shares of the Borrower",
  shareholder_loan: "a loan to be made by the Lender, as shareholder, to the Borrower",
  all_shares: "all the issued shares in the capital of {{target_name}}",
  some_shares: "shares in the capital of {{target_name}}",
  business: "the business of {{target_name}} and its assets, excluding its liabilities unless agreed otherwise",
  specific_assets: "certain assets of the Seller, to be specified in the Definitive Agreements",
  joint_development: "the joint development of {{project_subject}}",
  joint_venture: "the establishment of a joint venture company to carry on {{project_subject}}",
  distribution:
    "the appointment of the Partner to distribute or represent the products or services of the Lead Party",
  services: "the provision of services by one Party to the other",
};

/** Paragraph 5.1, by the Q9 values. */
export const CONDITIONS: Record<string, string> = {
  due_diligence: "due diligence satisfactory to the {{party_1_role}}",
  corporate_approvals: "all necessary board and shareholder approvals",
  regulatory_approvals: "all necessary regulatory approvals",
};

/** Paragraph 4 headings for the three structured answers, by deal type:
 *  amount (Q8b), pricing (Q8c), payment (Q8d). null = no such line. */
export const KEY_TERM_HEADINGS: Record<DealType, [string, string | null, string | null]> = {
  investment: ["Investment Amount", "Valuation", "Payment"],
  loan: ["Loan Amount", "Interest and Term", "Repayment"],
  acquisition: ["Price", "Pricing Basis", "Payment"],
  project: ["Contributions", "Revenue and Cost Sharing", null],
  other: ["Consideration", null, "Payment"],
};

/** Q8d values that stand for a fixed phrase. Anything else is the user's words. */
export const PAYMENT_PHRASES: Record<string, string> = {
  completion: "in full on completion",
  bullet: "in one payment at the end of the loan term",
};

/** Q8c (acquisition) values, as paragraph 4 words them. */
export const PRICING_BASIS: Record<string, string> = {
  fixed: "a fixed price",
  adjusted: "adjusted for cash, debt and working capital at completion",
  earn_out: "part of the price depends on future performance (earn-out)",
};

export interface ParagraphRule {
  para: string;
  heading: string;
  tier: "LAW" | "CONVENTION";
  binding?: boolean;
  include?: "always";
  include_if?: Condition;
}

/** Which paragraphs of the master go in. The Laws always; the Conventions by
 *  the answers. Paragraphs 7, 8 and 9 bind if included, and 3.1 lists them. */
export const PARAGRAPH_RULES: ParagraphRule[] = [
  { para: "1", heading: "Parties", tier: "LAW", include: "always" },
  { para: "2", heading: "The Proposed Transaction", tier: "LAW", include: "always" },
  { para: "3", heading: "Legal Effect", tier: "LAW", include: "always" },
  {
    para: "4",
    heading: "Key Commercial Terms",
    tier: "CONVENTION",
    include_if: { any: [{ q: "Q8a", in: ["yes", "partly"] }, { q: "Q8e", not_empty: true }] },
  },
  {
    para: "5",
    heading: "Conditions and Due Diligence",
    tier: "CONVENTION",
    include_if: { q: "Q9", not_in_only: ["none"] },
  },
  {
    para: "6",
    heading: "Timetable",
    tier: "CONVENTION",
    include_if: { any: [{ q: "Q10a", not_in: ["unsure", null] }, { q: "Q10b", not_in: ["unsure", null] }] },
  },
  { para: "7", heading: "Exclusivity", tier: "CONVENTION", binding: true, include_if: { q: "Q11", not_in: ["no", null] } },
  { para: "8", heading: "Confidentiality", tier: "CONVENTION", binding: true, include_if: { q: "Q12", eq: "yes" } },
  { para: "9", heading: "Costs", tier: "CONVENTION", binding: true, include: "always" },
  { para: "10", heading: "Expiry", tier: "LAW", include: "always" },
  { para: "11", heading: "Governing Law and Disputes", tier: "LAW", include: "always" },
  { para: "12", heading: "General", tier: "LAW", include: "always" },
];

/* ── lookups ───────────────────────────────────────────────────────────── */

export const REGISTRATION_LABEL: Record<string, string> = {
  Singapore: "UEN",
  "England and Wales": "Company Number",
  Scotland: "Company Number",
  "Northern Ireland": "Company Number",
  "Hong Kong": "Company Number",
  Australia: "ACN",
  "New Zealand": "Company Number",
  India: "CIN",
  Malaysia: "Company Registration No.",
  Indonesia: "NIB",
  Philippines: "SEC Registration No.",
  Vietnam: "Enterprise Code",
  Thailand: "Registration No.",
  "United States": "State File Number",
  Germany: "Commercial Register No.",
  default: "Registration Number",
};

/** Paragraph 12.1. No entry = the optional bracket is left out, never guessed. */
export const THIRD_PARTY_RIGHTS_STATUTE: Record<string, string> = {
  Singapore: "the Contracts (Rights of Third Parties) Act 2001 of Singapore",
  "England and Wales": "the Contracts (Rights of Third Parties) Act 1999",
  "Northern Ireland": "the Contracts (Rights of Third Parties) Act 1999",
  "Hong Kong": "the Contracts (Rights of Third Parties) Ordinance (Cap. 623) of Hong Kong",
  "New Zealand": "Part 2, Subpart 1 of the Contract and Commercial Law Act 2017 of New Zealand",
  Scotland: "the Contract (Third Party Rights) (Scotland) Act 2017",
};

export interface Arbitration {
  institution: string;
  seat: string;
  /** Set on the default entry: the seat is a guess a lawyer must confirm. */
  review?: string;
}

export const ARBITRATION: Record<string, Arbitration> = {
  Singapore: { institution: "the Singapore International Arbitration Centre", seat: "Singapore" },
  "Hong Kong": { institution: "the Hong Kong International Arbitration Centre", seat: "Hong Kong" },
  "England and Wales": { institution: "the London Court of International Arbitration", seat: "London" },
  "New South Wales": { institution: "the Australian Centre for International Commercial Arbitration", seat: "Sydney" },
  Victoria: { institution: "the Australian Centre for International Commercial Arbitration", seat: "Melbourne" },
  "New York": { institution: "the International Centre for Dispute Resolution", seat: "New York" },
  default: {
    institution: "the International Chamber of Commerce",
    seat: "{{governing_law}}",
    review: "Seat defaults to the governing-law jurisdiction; lawyer to confirm a city.",
  },
};

export const FEDERAL_COUNTRIES = ["United States", "Australia", "Canada"];

export const ARBITRATION_LANGUAGE = "English";

/** The states and provinces offered for Q7a_state. Others may be typed. */
export const STATES: Record<string, string[]> = {
  "United States": [
    "Delaware", "New York", "California", "Texas", "Florida", "Illinois", "Massachusetts", "Washington", "Nevada", "Georgia",
  ],
  Australia: ["New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia", "Tasmania", "Australian Capital Territory"],
  Canada: ["Ontario", "British Columbia", "Alberta", "Quebec"],
};

/** The chips offered for Q7a: the laws the firm's clients choose most. Others may be typed. */
export const TOP_COUNTRIES = ["Singapore", "England and Wales", "Hong Kong", "United States", "Australia", "India", "Malaysia", "Indonesia", "Vietnam"];

/** The countries offered for the parties' incorporation. Others may be typed. */
export const COUNTRIES = [
  "Singapore", "Malaysia", "Indonesia", "Vietnam", "Thailand", "Philippines", "Hong Kong", "China", "India", "Japan", "South Korea",
  "Australia", "New Zealand", "England and Wales", "Scotland", "Northern Ireland", "Ireland", "United States", "Canada",
  "Germany", "France", "Netherlands", "Switzerland", "United Arab Emirates", "Cayman Islands", "British Virgin Islands",
];
