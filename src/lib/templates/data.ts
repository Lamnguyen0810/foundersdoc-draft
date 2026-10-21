/**
 * The template pages (foundersdoc.com/templates/…): one page per document,
 * and one per document and country, each answering a search people make
 * ("NDA template Singapore") and leading to FD AI.
 *
 * PILOT: the NDA for Singapore, the UK and the US. Every fact on a country
 * page describes what FD AI actually offers for that law (the NDA's
 * governing-law question, doctypes.data.mjs) or a general legal point a
 * lawyer has checked. The wording is Founders Doc's own. Before a new page
 * goes live, a Founders Doc lawyer checks it.
 *
 * Adding a page = adding an entry here; the routes, sitemap and links read
 * this list.
 */

import { draftHref } from "@/lib/doc-links";

export interface Faq {
  q: string;
  a: string;
}

export interface CountryPage {
  /** In the address: /templates/nda/<slug>. */
  slug: string;
  /** As it follows "for": "Singapore", "the UK". */
  name: string;
  /** For headings and the menu: "Singapore", "UK". */
  short: string;
  flag: string;
  /** The search this page answers; also the page title's start. */
  searchPhrase: string;
  /** Page title (≤ 60 characters) and description (≤ 155). */
  title: string;
  description: string;
  /** The opening line under the heading. */
  lead: string;
  /** Which governing-law choices FD AI offers for this country. */
  lawChoice: string;
  /** Local points, in plain English. */
  lawPoints: { label: string; text: string }[];
  faqs: Faq[];
}

export interface TemplateDoc {
  /** In the address: /templates/<slug>. */
  slug: string;
  /** FD AI's own slug, for the "Draft it free" link. */
  docSlug: string;
  short: string;
  name: string;
  title: string;
  description: string;
  lead: string;
  /** What the document covers, as FD AI drafts it. */
  covers: { label: string; text: string }[];
  /** When someone needs one. */
  whenNeeded: string[];
  faqs: Faq[];
  /** Blog articles about this document. */
  reading: { title: string; href: string }[];
  countries: CountryPage[];
}

export const TEMPLATES: TemplateDoc[] = [
  {
    slug: "nda",
    docSlug: "nda",
    short: "NDA",
    name: "Non-Disclosure Agreement (NDA)",
    title: "NDA Template — Draft a Non-Disclosure Agreement Free",
    description:
      "Draft a mutual or one-way NDA online in minutes for Singapore, the UK, the US and more. Founders Doc's lawyer-backed wording, Word download, free to start.",
    lead: "An NDA keeps the information you share private. FD AI drafts one around your deal in a few minutes — mutual or one-way, under the law you choose.",
    covers: [
      { label: "Mutual or one-way", text: "Choose whether both sides share information, or only one. It changes who owes the duty to keep things private." },
      { label: "What is confidential", text: "Described from your own words — customer lists, pricing, code, plans — so there is no argument later about what was covered." },
      { label: "What the information may be used for", text: "Limited to the purpose you describe, such as exploring a partnership or an investment." },
      { label: "How long it lasts", text: "Two years unless you choose otherwise, or no time limit at all." },
      { label: "Personal data", text: "If personal data will be shared, a data protection clause is added." },
      { label: "Law and disputes", text: "The law of the place you choose, with disputes going to the courts or to arbitration." },
      { label: "No hidden extras", text: "FD AI does not slip in a non-compete or other aggressive terms you did not ask for." },
    ],
    whenNeeded: [
      "Before you show your product, plans or numbers to a potential partner, supplier or buyer",
      "When a freelancer or agency will see your confidential information",
      "Before due diligence for an investment or a sale",
      "When two companies explore working together and both will share information",
    ],
    faqs: [
      { q: "Mutual or one-way: which do I need?", a: "If only you will share confidential information, a one-way NDA is enough. If both sides will share, choose mutual so the same duties apply to both." },
      { q: "Do investors sign NDAs?", a: "Many professional investors decline to sign NDAs at the first meeting, because they see many similar ideas. An NDA is more usual later, for due diligence, or with partners and suppliers." },
      { q: "How long should an NDA last?", a: "Two to five years is common for business information. Some information, such as trade secrets, may need protection for longer — FD AI lets you choose a period or no time limit." },
      { q: "Can I edit the NDA after FD AI drafts it?", a: "Yes. You can change any wording in the draft before you download it as a Word document, and ask FD AI to explain any clause." },
    ],
    reading: [
      { title: "Before You Sign an NDA", href: "/resources/before-you-sign-an-nda" },
      { title: "NDA vs Confidentiality Agreement", href: "/resources/nda-vs-confidentiality-agreement" },
      { title: "Can Breaching an NDA Be Expensive?", href: "/resources/can-breaching-an-nda-be-expensive" },
      { title: "How to Draft an NDA Online in Minutes", href: "/resources/how-to-draft-an-nda-online" },
    ],
    countries: [
      {
        slug: "singapore",
        name: "Singapore",
        short: "Singapore",
        flag: "🇸🇬",
        searchPhrase: "NDA template Singapore",
        title: "NDA Template Singapore — Draft a Singapore NDA Free",
        description:
          "Draft a Singapore-law NDA online in minutes: mutual or one-way, Singapore courts or arbitration, data protection when needed. Lawyer-backed, free to start.",
        lead: "Create a Non-Disclosure Agreement governed by Singapore law in a few minutes. FD AI asks plain-English questions and drafts the NDA from Founders Doc's own wording — a Singapore law practice for founders.",
        lawChoice: "Choose Singapore as the governing law.",
        lawPoints: [
          { label: "Governing law", text: "The NDA is governed by Singapore law, so a Singapore court or tribunal reads it under Singapore contract law." },
          { label: "Disputes", text: "Choose the Singapore courts, or arbitration in Singapore — private, and its awards are easier to enforce abroad if the other side is overseas." },
          { label: "Third parties", text: "The NDA can make clear that only the parties can enforce it, as the Contracts (Rights of Third Parties) Act 2001 allows." },
          { label: "Signing", text: "An NDA can generally be signed electronically in Singapore under the Electronic Transactions Act 2010." },
          { label: "Personal data", text: "If personal data will be shared, the Personal Data Protection Act 2012 applies; answer Yes to the personal data question and a data protection clause is added." },
        ],
        faqs: [
          { q: "Is an NDA signed online binding in Singapore?", a: "Generally yes. Singapore law recognises electronic signatures for most contracts, including NDAs. Keep a copy of the signed version and how it was signed." },
          { q: "Should I choose the courts or arbitration?", a: "If both parties are in Singapore, the courts usually suit an NDA. If the other party is overseas, arbitration in Singapore is private and easier to enforce in many countries." },
          { q: "Can a Singapore NDA stop someone working for a competitor?", a: "An NDA protects information; it is not a non-compete. Restrictions on competing are a separate matter and must be reasonable to be enforceable." },
        ],
      },
      {
        slug: "uk",
        name: "the UK",
        short: "UK",
        flag: "🇬🇧",
        searchPhrase: "NDA template UK",
        title: "NDA Template UK — Draft an English-Law NDA Free",
        description:
          "Draft an NDA under the law of England and Wales, Scotland or Northern Ireland in minutes. Mutual or one-way, UK GDPR clause when needed. Free to start.",
        lead: "Create a Non-Disclosure Agreement for the UK in a few minutes. The UK has three legal systems, so FD AI lets you choose England and Wales, Scotland or Northern Ireland, then drafts the NDA from Founders Doc's own wording.",
        lawChoice: "Choose United Kingdom › England and Wales, Scotland or Northern Ireland as the governing law. Most business NDAs choose England and Wales.",
        lawPoints: [
          { label: "Governing law", text: "English law (England and Wales) is the most common choice for UK business contracts; Scotland and Northern Ireland have their own legal systems and can be chosen instead." },
          { label: "Disputes", text: "Choose the courts of the part of the UK you picked, or arbitration — often seated in London when the parties are in different countries." },
          { label: "Third parties", text: "The NDA can make clear that only the parties can enforce it, as the Contracts (Rights of Third Parties) Act 1999 allows in England and Wales." },
          { label: "Signing", text: "NDAs are simple contracts and can generally be signed electronically in England and Wales." },
          { label: "Personal data", text: "If personal data will be shared, the UK GDPR and the Data Protection Act 2018 apply; answer Yes to the personal data question and a data protection clause is added." },
        ],
        faqs: [
          { q: "England and Wales, Scotland or Northern Ireland?", a: "Choose where you are based or where the work happens. If you are unsure, England and Wales is the usual choice for business contracts in the UK." },
          { q: "Is an NDA signed electronically valid in the UK?", a: "Generally yes for simple contracts like NDAs. Keep the signed copy and a record of how and when it was signed." },
          { q: "Does an NDA need to be a deed in the UK?", a: "Usually not. An NDA where both sides make promises is a simple contract and does not need to be signed as a deed." },
        ],
      },
      {
        slug: "us",
        name: "the US",
        short: "US",
        flag: "🇺🇸",
        searchPhrase: "NDA template US",
        title: "NDA Template US — Draft a State-Law NDA Free",
        description:
          "Draft a US NDA under Delaware, New York, California or another state's law in minutes. Mutual or one-way, courts or arbitration. Lawyer-backed, free.",
        lead: "Create a Non-Disclosure Agreement for the United States in a few minutes. In the US, contract law is set state by state, so FD AI lets you choose the state — Delaware, New York, California, Texas and more — and drafts the NDA from Founders Doc's own wording.",
        lawChoice: "Choose United States › your state: Delaware, New York, California, Texas, Florida, Illinois, Massachusetts, Washington, Nevada or Georgia.",
        lawPoints: [
          { label: "Governing law", text: "Each state has its own contract law. Delaware and New York are common choices for business contracts; many companies choose the state where they are based." },
          { label: "Disputes", text: "Choose the courts of the state you picked, or arbitration — private, and often preferred when the parties are in different states or countries." },
          { label: "Signing", text: "Federal and state laws on electronic signatures generally allow an NDA to be signed electronically." },
          { label: "Employees and contractors", text: "If the NDA is with an individual employee or contractor, a whistleblower-immunity notice under the federal Defend Trade Secrets Act is usually recommended. Ask a US lawyer if this applies." },
          { label: "Personal data", text: "Some states have privacy laws (California's, for one). If personal data will be shared, answer Yes and a data protection clause is added." },
        ],
        faqs: [
          { q: "Which state's law should I choose?", a: "Usually the state where you or your company are based. Delaware and New York are common neutral choices for business contracts between parties in different states." },
          { q: "Is one NDA valid in every state?", a: "An NDA governed by one state's law can generally be enforced against parties in other states. The chosen state's law decides how it is read." },
          { q: "Can I use this NDA with a non-US company?", a: "Yes. Choose the governing law you agree on; for parties in different countries, arbitration is often the practical choice for disputes." },
        ],
      },
    ],
  },
];

export function templateBySlug(slug: string): TemplateDoc | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

export function countryPage(doc: string, country: string): { doc: TemplateDoc; page: CountryPage } | undefined {
  const d = templateBySlug(doc);
  const page = d?.countries.find((c) => c.slug === country);
  return d && page ? { doc: d, page } : undefined;
}

export const draftLink = (t: TemplateDoc) => draftHref(t.docSlug);

/** Every template address, for the sitemap. */
export function templatePaths(): string[] {
  return ["/templates", ...TEMPLATES.flatMap((t) => [`/templates/${t.slug}`, ...t.countries.map((c) => `/templates/${t.slug}/${c.slug}`)])];
}
