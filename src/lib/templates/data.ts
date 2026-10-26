/**
 * The template pages (foundersdoc.com/templates/…): one page per document,
 * and one per document and country, each answering a search people make
 * ("NDA template Singapore") and leading to FD AI.
 *
 * PILOT: the NDA for Singapore, the UK and the US; then (0157) one page each
 * for the employment contract, loan, shareholders', contractor and services
 * agreements, the five most-searched documents with no guide yet. Every fact on a country
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
  /** An emoji for the cards. */
  icon: string;
  /** One short line for the cards on /templates. */
  summary: string;
  /** The page heading; without it, "<short> template — draft a <name> in minutes". */
  h1?: string;
  /** Still in Beta on FD AI (draft/beta.tsx): the page says so. */
  beta?: boolean;
  /** Which law FD AI drafts it under, in plain English (shown as "In FD AI: …"). */
  law?: string;
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
    icon: "🔒",
    summary: "Keep what you share private — mutual or one-way, under the law you choose.",
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
  {
    slug: "employment-contract",
    icon: "💼",
    summary: "Hire in any country: probation, notice, IP, confidentiality and restrictions.",
    docSlug: "employment",
    short: "Employment contract",
    name: "Employment Agreement",
    h1: "Employment contract template — draft one in minutes",
    beta: true,
    law: "Hire in any country. FD AI uses the law of the place where the employee works and flags local rules you should check.",
    title: "Employment Contract Template — Draft One Free | FD AI",
    description:
      "Draft an employment contract online in minutes: permanent or fixed-term, probation, notice, IP and restrictions after leaving. Any country. Free to start.",
    lead: "An employment contract sets out the job, the pay and the rules both sides agree to. FD AI asks about ten plain-English questions and drafts one from Founders Doc's own lawyer-written wording.",
    covers: [
      { label: "Type of role", text: "A regular employee or a senior manager, so the protections that apply to each are handled correctly." },
      { label: "Permanent or fixed-term", text: "An open-ended job, or one that ends on a set date." },
      { label: "Probation and notice", text: "A probation period such as three or six months, and how much notice each side gives, during and after probation." },
      { label: "Misconduct", text: "A standard list of reasons for dismissal without notice, or your own list, which FD AI words clearly." },
      { label: "Restrictions after leaving", text: "Optional limits on competing, approaching clients or hiring away staff, for a period you choose." },
      { label: "Confidentiality and IP", text: "How long the duty of confidence lasts, and whether the company owns all work or only work-related creations." },
      { label: "Outside work and privacy", text: "Whether the employee may work elsewhere, and an optional clause on handling their personal data." },
      { label: "Disputes", text: "Local courts or private arbitration." },
    ],
    whenNeeded: [
      "Before a new hire's first day, so the terms are agreed in writing",
      "When you change someone's role, pay or working hours",
      "When a contractor becomes an employee",
      "When you hire your first employee in a new country",
    ],
    faqs: [
      { q: "Do I need a written employment contract?", a: "In many countries certain terms must be given in writing. In Singapore, for example, most employees must receive their Key Employment Terms in writing within 14 days of starting. A full contract avoids disputes later." },
      { q: "Can I add a non-compete?", a: "You can, but in many countries, including Singapore and the UK, a restriction on competing is only enforceable if it is reasonable in length, area and scope. FD AI lets you choose a short period and flags the risk." },
      { q: "Which country's law applies?", a: "Usually the law of the place where the employee works. If the employer and employee are in different countries, both may matter; FD AI flags the mismatch." },
      { q: "Can I edit the contract after FD AI drafts it?", a: "Yes. Change any wording before you download it as a Word document, and ask FD AI to explain any clause." },
    ],
    reading: [],
    countries: [],
  },
  {
    slug: "loan-agreement",
    icon: "💰",
    summary: "Lend or borrow money with clear repayment, interest and security terms.",
    docSlug: "loan",
    short: "Loan agreement",
    name: "Loan Agreement",
    h1: "Loan agreement template — draft one in minutes",
    beta: true,
    law: "Drafted under Singapore law, in Singapore or US dollars.",
    title: "Loan Agreement Template — Draft One Free | FD AI",
    description:
      "Draft a loan agreement online in minutes: one or several lenders, interest or interest-free, repayment in full or in instalments. Free to start.",
    lead: "A loan agreement records who lends what, when it is paid back and what interest applies. FD AI drafts one from your answers, from the lender's or the borrower's side.",
    covers: [
      { label: "Lender or borrower", text: "Tell FD AI which side you are on, and the usual answers lean your way." },
      { label: "Who is lending", text: "One lender, or several lending together through an authorised representative, to an individual or a company." },
      { label: "Founder loans", text: "A founder lending to, or borrowing for, their own company, or a personal loan with no company involved." },
      { label: "Amount and term", text: "Singapore or US dollars, paid on signing or on a set date, for 6, 12 or 24 months or another period." },
      { label: "Repayment", text: "In full at the end, in equal instalments, or on request — with or without the right to repay early." },
      { label: "Interest", text: "A rate a year, a flat charge, a total that steps up over time, or interest-free, plus optional extra interest on late payment." },
      { label: "Security", text: "Unsecured, or backed by a guarantee or charge set out in a separate document." },
    ],
    whenNeeded: [
      "When you lend money to, or borrow from, a friend, family member or business partner",
      "When a founder or shareholder lends money to the company",
      "When a company lends to another company in the same group",
      "Whenever you want the repayment terms clear before money changes hands",
    ],
    faqs: [
      { q: "Does a loan between friends or family need an agreement?", a: "It is not always required, but a written agreement makes the amount, repayment date and any interest clear, which avoids arguments later." },
      { q: "Can the loan be interest-free?", a: "Yes. Choose interest-free, or a rate a year, a flat charge or interest that steps up over time." },
      { q: "Is the loan secured?", a: "By default it is unsecured. If the lender wants a guarantee or a charge over assets, that is set out in a separate document, and the agreement refers to it." },
      { q: "Can I edit the agreement after FD AI drafts it?", a: "Yes. Change any wording before you download it as a Word document, and ask FD AI to explain any clause." },
    ],
    reading: [],
    countries: [],
  },
  {
    slug: "shareholders-agreement",
    icon: "🤝",
    summary: "How the company is run, and what happens when shareholders join, sell or leave.",
    docSlug: "sha",
    short: "Shareholders' agreement",
    name: "Shareholders' Agreement",
    h1: "Shareholders' agreement template — draft one in minutes",
    beta: true,
    law: "Drafted for a Singapore company, under Singapore law.",
    title: "Shareholders' Agreement Template — Draft Free | FD AI",
    description:
      "Draft a shareholders' agreement online: board, voting, share transfers, tag- and drag-along, exits and leavers. For Singapore companies. Free to start.",
    lead: "A shareholders' agreement sets out how a company is run and what happens when shareholders join, sell or leave. FD AI drafts one from your answers, from Founders Doc's own lawyer-written wording.",
    covers: [
      { label: "Shareholders and share classes", text: "Founders, investors and others, with one class of shares or several." },
      { label: "The board", text: "Who may appoint and remove directors, how many must attend a meeting, how decisions pass, and whether the chair has a casting vote." },
      { label: "Shareholder meetings", text: "Who must attend for a meeting to go ahead and what happens if too few do." },
      { label: "Key decisions", text: "Matters that need the agreement of a set majority of shareholders before the company acts." },
      { label: "New shares and transfers", text: "Rights to take up new shares first, to be offered shares before outsiders, and tag-along and drag-along on a sale." },
      { label: "Founders and leavers", text: "Founder vesting, and what happens to shares when someone leaves on good or bad terms." },
      { label: "Exits and defaults", text: "How shareholders can exit, and what happens if one breaks the agreement." },
    ],
    whenNeeded: [
      "When two or more people start a company together",
      "Before taking in an investor",
      "When a new shareholder joins or one is about to leave",
      "When the company has grown and the original handshake deal no longer covers how decisions are made",
    ],
    faqs: [
      { q: "Is a shareholders' agreement the same as the company constitution?", a: "No. The constitution is the company's public rule book. A shareholders' agreement is a private contract between the shareholders and usually goes into more detail, for example on transfers and leavers." },
      { q: "When should founders sign one?", a: "Ideally when the company is set up, before anyone invests or leaves. It is much easier to agree the rules while everyone is on good terms." },
      { q: "What are tag-along and drag-along?", a: "Tag-along lets smaller shareholders join a sale on the same terms as a majority seller. Drag-along lets a majority make the others sell, so a buyer can acquire the whole company." },
      { q: "Can I edit the agreement after FD AI drafts it?", a: "Yes. Change any wording before you download it as a Word document, and ask FD AI to explain any clause." },
    ],
    reading: [],
    countries: [],
  },
  {
    slug: "contractor-agreement",
    icon: "🧑‍💻",
    summary: "Engage a freelancer or consultant: scope, fees, IP and how it ends.",
    docSlug: "contractor",
    short: "Contractor agreement",
    name: "Contractor Agreement",
    h1: "Contractor agreement template — draft one in minutes",
    beta: true,
    law: "Engage a freelancer or consultant in any country; choose the law and the courts in the questions.",
    title: "Contractor Agreement Template — Draft One Free | FD AI",
    description:
      "Draft a freelance or contractor agreement online: scope, fees, expenses, IP, confidentiality and ending it. Any country, Word in minutes. Free to start.",
    lead: "A contractor agreement sets out the work a freelancer or consultant will do and on what terms. FD AI drafts one in a Basic, Standard or Complex version, from Founders Doc's own lawyer-written wording.",
    covers: [
      { label: "Who the contractor is", text: "An individual or a company." },
      { label: "The work", text: "What will be delivered, the standard expected, and progress updates when asked." },
      { label: "Exclusivity", text: "Free to work for other clients, or exclusive with your written consent needed for other work." },
      { label: "Fees and expenses", text: "How the contractor is paid, and whether pre-approved expenses are reimbursed." },
      { label: "Intellectual property", text: "Full ownership passes to the company, or the contractor keeps it and grants a licence." },
      { label: "How long and how it ends", text: "Until the work is done, for a fixed period or until either side ends it, with notice or straight away for serious problems." },
      { label: "After it ends", text: "Optional limits on approaching clients or staff, and on misusing company data." },
      { label: "Contractor or employee?", text: "FD AI flags answers that make the contractor look like an employee, which can bring extra legal duties." },
    ],
    whenNeeded: [
      "Before a freelancer, consultant or agency starts work",
      "When a contractor will create something you want to own, such as code, designs or content",
      "When a contractor will see confidential information",
      "When you engage someone in another country",
    ],
    faqs: [
      { q: "What is the difference between a contractor and an employee?", a: "A contractor runs their own business and decides how to do the work; an employee works under the company's control. Calling someone a contractor does not settle it — the real arrangement does. FD AI flags answers that point towards employment." },
      { q: "Who owns the work a contractor creates?", a: "It depends on the contract. Without a clear clause, the contractor may keep ownership. FD AI lets you choose a full assignment to the company or a licence." },
      { q: "Basic, Standard or Complex — which do I need?", a: "Basic suits a short, simple job. Standard covers most engagements. Complex adds more detailed terms for larger or riskier work." },
      { q: "Can I edit the agreement after FD AI drafts it?", a: "Yes. Change any wording before you download it as a Word document, and ask FD AI to explain any clause." },
    ],
    reading: [],
    countries: [],
  },
  {
    slug: "services-agreement",
    icon: "🧾",
    summary: "Sell or buy a software subscription or professional services.",
    docSlug: "services",
    short: "Services agreement",
    name: "Services Agreement",
    h1: "Services agreement template — draft one in minutes",
    beta: true,
    law: "Drafted under Singapore law, in Singapore or US dollars.",
    title: "Services Agreement Template — Draft One Free | FD AI",
    description:
      "Draft a services agreement online: software subscriptions or professional services, fees, renewal and ending it. From the provider's or customer's side.",
    lead: "A services agreement sets out what one business provides to another and what it costs. FD AI drafts one for a software subscription or for professional work, leaning to your side as the provider or the customer.",
    covers: [
      { label: "Type of service", text: "A platform or software subscription (SaaS), or professional services such as consulting or advisory work." },
      { label: "Your side", text: "Tell FD AI whether you are the service provider or the customer, and the usual answers lean your way." },
      { label: "Start and length", text: "Starting on signing or a set date, for 6, 12 or 24 months, or until the work is done." },
      { label: "Renewal", text: "Renewing automatically each year unless either side gives notice, or ending unless both agree to renew." },
      { label: "Fees", text: "Subscriptions paid monthly, quarterly or yearly in advance, with optional usage fees; or a fixed fee or monthly retainer for professional work." },
      { label: "Currency", text: "Singapore or US dollars." },
    ],
    whenNeeded: [
      "When you sell a software subscription to business customers",
      "When you take on a consulting or advisory client",
      "When you buy a service and want clear terms on what you get and what you pay",
      "When a project has grown beyond an email or a quote",
    ],
    faqs: [
      { q: "Is a services agreement the same as terms and conditions?", a: "They overlap. Terms and conditions are usually standard terms for many customers; a services agreement is often signed with one customer and can reflect what you agreed with them." },
      { q: "Should the agreement renew automatically?", a: "Automatic renewal suits ongoing subscriptions, because the service carries on unless someone gives notice. For one-off projects, ending unless both sides agree to renew is usually simpler." },
      { q: "Does FD AI favour the provider or the customer?", a: "Whichever side you are on. The default answers lean to your side, and you can change any of them." },
      { q: "Can I edit the agreement after FD AI drafts it?", a: "Yes. Change any wording before you download it as a Word document, and ask FD AI to explain any clause." },
    ],
    reading: [],
    countries: [],
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

/** The short name inside a sentence: "your employment contract", but "your NDA". */
export const inSentence = (t: TemplateDoc) => (/^[A-Z]{2}/.test(t.short) ? t.short : t.short.charAt(0).toLowerCase() + t.short.slice(1));

/** Every template address, for the sitemap. */
export function templatePaths(): string[] {
  return ["/templates", ...TEMPLATES.flatMap((t) => [`/templates/${t.slug}`, ...t.countries.map((c) => `/templates/${t.slug}/${c.slug}`)])];
}
