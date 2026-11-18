/**
 * More template pages (0242, 18 Nov 2026).
 *
 * FD AI drafts fourteen documents; nine had a template page. These are the
 * other five — co-founder, share purchase, investment, IP assignment and
 * joint venture agreements — and six pages for searches the existing
 * documents already answer under another name: a personal loan, a director's
 * loan, a freelance contract, a consulting agreement, a SaaS agreement and a
 * convertible note.
 *
 * The same rules as data.ts. Every "covers" point is something the FD AI
 * questionnaire for that document really asks (lib/<doc>/data). Every legal
 * point is general, worded cautiously, and where it names a statute it was
 * read on Singapore Statutes Online on 18 Nov 2026:
 *   Moneylenders Act 2008  s 2 ("excluded moneylender": lends solely to
 *                          corporations), s 3 (lending for a larger sum is
 *                          presumed moneylending), s 5 (licence);
 *   Companies Act 1967     s 162 (a company's loans to its own directors);
 *   Stamp Duties Act 1929  s 46 (stamping within 14 days of signing in Singapore).
 * Before these pages go live, a Founders Doc lawyer checks them.
 */

import type { CountryPage, TemplateDoc } from "./data";

const EDIT = { q: "Can I edit the agreement after FD AI drafts it?", a: "Yes. Change any wording before you download it as a Word document, and ask FD AI to explain any clause." };

export const MORE_TEMPLATES: TemplateDoc[] = [
  {
    slug: "co-founder-agreement",
    icon: "🚀",
    summary: "Who owns what, who decides, and what happens if a co-founder leaves.",
    docSlug: "cofounder",
    short: "Co-founder agreement",
    name: "Co-Founder Agreement",
    h1: "Co-founder agreement template — draft one in minutes",
    beta: true,
    law: "Written for a Singapore company, whether it is incorporated yet or not.",
    title: "Co-Founder Agreement Template Singapore — Free | FD AI",
    description:
      "Draft a co-founder agreement online: equity split, vesting, roles, decisions, deadlock and leavers. For Singapore start-ups. Lawyer-backed. Start free.",
    lead: "A co-founder agreement records who owns what, who decides, and what happens if a founder stops contributing or leaves. FD AI asks plain-English questions and drafts one from Founders Doc's own lawyer-written master.",
    covers: [
      { label: "Shares and vesting", text: "Each co-founder's starting share, and whether shares are earned over time or by milestones, so someone who leaves early does not keep a full share." },
      { label: "Roles and commitment", text: "Whether co-founders must work full-time, whether they put money in, and what a person must do to count as a co-founder." },
      { label: "Who decides", text: "Who has the final say, who sits on the board, and which decisions need every co-founder to agree." },
      { label: "Deadlock", text: "What happens if the co-founders cannot agree, including a buy-out and how the price is set." },
      { label: "Not pulling their weight", text: "What the others may do if a co-founder is not meeting expectations, and at what price their shares can be bought." },
      { label: "Leavers", text: "Good leaver and bad leaver terms: what counts as leaving on bad terms and what happens to vested and unvested shares." },
      { label: "Share transfers and new shares", text: "Limits on selling founder shares, and the rules when the company issues new ones." },
      { label: "IP and confidentiality", text: "Whether everything a co-founder creates belongs to the company, and a duty to keep company information private." },
      { label: "After leaving", text: "Optional limits on competing or poaching, conflicts of interest and bad-mouthing." },
      { label: "Selling or closing", text: "Optional clauses for when the company is sold or the co-founders agree to close it." },
    ],
    whenNeeded: [
      "When two or more people start building a company together, before or just after it is incorporated",
      "Before the first investor comes in, when they will ask how founder shares vest",
      "When a new co-founder joins, or one moves from part-time to full-time",
      "While everyone is still on good terms: it is much harder to agree once there is money or a dispute",
    ],
    faqs: [
      { q: "Is a co-founder agreement the same as a shareholders' agreement?", a: "No. A co-founder agreement is made between the founders, usually at the very start. A shareholders' agreement covers every shareholder, including investors. Once investors come in, the shareholders' agreement and the constitution take over much of it." },
      { q: "Should founder shares vest?", a: "Vesting means a founder earns their shares over time or by milestones. Investors usually expect it, because a founder who leaves early should not keep a full share. FD AI lets you choose the schedule and flags answers that go against what investors usually expect." },
      { q: "What if we split the shares 50:50?", a: "A 50:50 split needs a way to break a tie. FD AI asks what happens when the co-founders cannot agree, and flags a 50:50 split with no tie-breaker for your lawyer to check." },
      { q: "Can we sign one before the company is incorporated?", a: "Yes. FD AI's co-founder agreement is written for a Singapore company whether it is incorporated yet or not." },
      { q: "Who owns the IP the founders create?", a: "Investors usually expect the company to own it. FD AI asks whether IP created by a co-founder belongs to the company and flags it if the answer is no. IP created before the company existed may need its own IP assignment agreement." },
      EDIT,
    ],
    reading: [],
    related: [
      { title: "Shareholders' agreement template", href: "/templates/shareholders-agreement", text: "When investors join, a shareholders' agreement covers every shareholder and takes over much of the co-founder agreement." },
      { title: "IP assignment agreement template", href: "/templates/ip-assignment-agreement", text: "Move IP a founder created before the company existed into the company, so investors can see who owns it." },
      { title: "Term sheet template for Singapore start-ups", href: "/templates/term-sheet/singapore", text: "Raising your first round? Agree the main terms in a term sheet first." },
    ],
    countries: [],
  },
  {
    slug: "share-purchase-agreement",
    icon: "🏷️",
    summary: "Buy or sell shares in a Singapore company: price, conditions, warranties and Closing.",
    docSlug: "spa",
    short: "Share purchase agreement",
    name: "Share Purchase Agreement",
    h1: "Share purchase agreement template Singapore",
    beta: true,
    law: "Written for the sale of shares in a Singapore company.",
    title: "Share Purchase Agreement Template Singapore | FD AI",
    description:
      "Draft a Singapore share purchase agreement online: price, conditions, Closing, warranties, indemnities and seller restrictions. Lawyer-backed. Start free.",
    lead: "A share purchase agreement sets the terms on which existing shares in a company change hands. FD AI drafts one for a Singapore company in about 15 minutes, for the whole company or a stake.",
    covers: [
      { label: "Buyer and sellers", text: "One seller or several, with each seller's shares and price in a schedule. The buyer can be a company or an individual." },
      { label: "The whole company or a stake", text: "A sale of every share, or only some of them." },
      { label: "Price and payment", text: "Paid in full at Closing, part later, or with a deposit, and an optional adjustment for the company's cash and debts at Closing." },
      { label: "Conditions and long-stop date", text: "What must happen before the sale can close, such as approvals or key people staying, and the date the deal falls away if it does not." },
      { label: "Until Closing", text: "Whether the sellers must keep the company running as usual, and when the buyer may walk away." },
      { label: "Closing", text: "What each side hands over, whether seller-directors resign, and a confirmation that the sellers have no claims against the company." },
      { label: "Warranties", text: "The full set of business warranties (accounts, assets, IP, contracts, employees, tax, litigation), or title only for a small stake." },
      { label: "Limits on claims", text: "How long the buyer has to claim, a cap on the sellers' liability, and whether several sellers are liable together or each for their own share." },
      { label: "Indemnities and restrictions", text: "Optional pound-for-pound cover for named risks, and limits on what the sellers may do after Closing, such as competing." },
      { label: "Stamp duty and disputes", text: "Who pays the stamp duty on the transfer, and how disputes are resolved." },
    ],
    whenNeeded: [
      "When a founder or early shareholder sells shares to an incoming investor or another shareholder",
      "When someone buys the whole company",
      "When a departing co-founder's shares are bought back by the others",
      "Whenever existing shares change hands and the price, promises and timing should be in writing",
    ],
    faqs: [
      { q: "Share purchase agreement or share subscription agreement?", a: "In a purchase, an existing shareholder sells shares they already own and the money goes to them. In a subscription, the company issues new shares and the money goes to the company." },
      { q: "Does every seller have to sign?", a: "Yes. The agreement only sells the shares of the people who are parties to it, so each seller must sign." },
      { q: "Is stamp duty payable on a share transfer in Singapore?", a: "Yes. A transfer of existing shares in a Singapore company is subject to stamp duty, and the transfer document must generally be stamped with IRAS within 14 days of being signed in Singapore. The transfer is then lodged with ACRA. FD AI asks who pays the duty." },
      { q: "What should we check before signing?", a: "Check the company's constitution and any shareholders' agreement for pre-emption rights and transfer restrictions. If they apply, the shares must be offered to the other shareholders first, or the rights must be waived." },
      { q: "What warranties does a seller usually give?", a: "On a sale of the whole company, buyers usually ask for full business warranties. On the sale of a small stake, a seller often gives title warranties only: that they own the shares and can sell them. FD AI lets you choose." },
      EDIT,
    ],
    reading: [],
    related: [
      { title: "Share subscription agreement template", href: "/templates/share-subscription-agreement", text: "Is the company issuing new shares instead? Use a share subscription agreement." },
      { title: "Shareholders' agreement template", href: "/templates/shareholders-agreement", text: "A new shareholder usually signs or joins the shareholders' agreement at Closing." },
      { title: "Term sheet template", href: "/templates/term-sheet", text: "Agree the price and main terms of the sale in a term sheet before the full agreement." },
      { title: "NDA template", href: "/templates/nda", text: "Sign an NDA before the buyer looks at the company's books." },
    ],
    countries: [],
  },
  {
    slug: "investment-agreement",
    icon: "💸",
    summary: "An investor puts money into your Singapore company for new shares.",
    docSlug: "ia",
    short: "Investment agreement",
    name: "Investment Agreement",
    h1: "Investment agreement template Singapore",
    beta: true,
    law: "Written for a Singapore company issuing new shares to an investor.",
    title: "Investment Agreement Template Singapore — Free | FD AI",
    description:
      "Draft a Singapore investment agreement online: new shares for one investor or a lead investor, conditions, warranties, board seat, SAFE conversion. Free.",
    lead: "An investment agreement sets the terms on which an investor puts money into your company for new shares. FD AI drafts one for a single investor on simple terms, or for a lead investor with conditions, founder warranties and a board seat.",
    covers: [
      { label: "Simple or lead investor", text: "One investor on simple terms, or a lead investor who sets conditions, takes founder warranties and may nominate a director." },
      { label: "The shares", text: "Ordinary or preference shares. For preference shares: what they receive first on a sale or liquidation, whether they vote, and whether they convert into ordinary shares." },
      { label: "Completion", text: "When the money is paid and the shares are issued, and what each side delivers." },
      { label: "Conditions", text: "For a lead investor, what must be satisfied before they pay, and when a party may walk away if it is not." },
      { label: "Board seat and other documents", text: "Whether the lead investor nominates a director, whether the investor signs a shareholders' agreement, and whether the company adopts an amended constitution." },
      { label: "Warranties", text: "Who gives the promises about the company, the company alone or with the founders, for how long a claim can be made, and a cap on each founder's liability." },
      { label: "Investor undertakings", text: "Optional promises by the investor, for example to support an ESOP, further fundraising or a sale of the company." },
      { label: "SAFE conversion", text: "If the investor already holds a SAFE, the agreement converts it on this investment." },
    ],
    whenNeeded: [
      "When an angel or early-stage investor buys new shares in your company",
      "When a lead investor wants conditions, founder warranties and a board seat written down",
      "When an investor's SAFE converts into shares in a priced round",
      "When the round uses preference shares and their rights need setting out",
    ],
    faqs: [
      { q: "Investment agreement or share subscription agreement?", a: "Both issue new shares for money. FD AI's share subscription agreement is written for a simple early investment with up to five investors. The investment agreement is for one investor, or a lead investor who wants conditions, founder warranties and a board seat, and it can convert the investor's SAFE." },
      { q: "What if the investor is buying existing shares?", a: "Then the money goes to the selling shareholder, not the company, and you need a share purchase agreement instead." },
      { q: "Do preference shares need a change to the constitution?", a: "Yes. The rights of preference shares must be written into the company's constitution, so the agreement has the company adopt an amended constitution at completion." },
      { q: "Where do vetoes, board rights and transfer rules go?", a: "In the shareholders' agreement. The investment agreement deals with the investment itself and gives way to the shareholders' agreement on how the company is run." },
      { q: "Do founders have to give warranties?", a: "A lead investor often asks the founders to stand behind the company's warranties. FD AI lets you choose who gives them, for how long, and a cap on what each founder can be liable for." },
      EDIT,
    ],
    reading: [
      { title: "What Is a Term Sheet?", href: "/resources/what-is-a-term-sheet" },
      { title: "Term Sheet Checklist", href: "/resources/term-sheet-checklist" },
    ],
    related: [
      { title: "Term sheet template for Singapore start-ups", href: "/templates/term-sheet/singapore", text: "Agree valuation and the main terms in a term sheet before the investment agreement." },
      { title: "Share subscription agreement template", href: "/templates/share-subscription-agreement", text: "A simple early round with up to five investors? The share subscription agreement may fit better." },
      { title: "Shareholders' agreement template", href: "/templates/shareholders-agreement", text: "Usually signed with the investment agreement: board, vetoes, transfers and exits." },
      { title: "Convertible loan agreement template", href: "/templates/convertible-loan-agreement", text: "Not ready to set a valuation? Raise on a convertible loan that turns into shares later." },
    ],
    countries: [],
  },
  {
    slug: "ip-assignment-agreement",
    icon: "💡",
    summary: "Make sure the code, designs and content your business pays for belong to it.",
    docSlug: "ipaa",
    short: "IP assignment agreement",
    name: "IP Assignment Agreement",
    h1: "IP assignment agreement template — draft one in minutes",
    beta: true,
    law: "Choose Singapore, England and Wales, Hong Kong, Delaware, New York or another law.",
    title: "IP Assignment Agreement Template — Draft Free | FD AI",
    description:
      "Draft an IP assignment agreement online: code, designs and content assigned to your company, moral rights, licence back. Choose the law. Start free.",
    lead: "An IP assignment agreement moves ownership of intellectual property, such as code, designs or content, from the person who created it to the business that should own it. FD AI drafts one in about 5 minutes, whether you are the creator or the recipient.",
    covers: [
      { label: "Your side", text: "Tell FD AI whether you are the creator or the person receiving the IP, and the usual answers lean your way." },
      { label: "What is assigned", text: "The project and the IP, such as code, artwork or proprietary information, listed in a schedule. Past, existing and future IP is covered." },
      { label: "Who owns it", text: "Assigned in full to the recipient, or, in the Complex version, owned jointly or kept by the creator under a licence." },
      { label: "Moral rights", text: "Dealt with under the law you choose, so the recipient can use and change the work freely." },
      { label: "Licence back", text: "Whether the creator may still use the work, for their portfolio or for any purpose." },
      { label: "Background IP", text: "A licence of anything the creator already owned and built into the work." },
      { label: "Payment", text: "A fee for the IP, or none. When no fee is paid, the agreement is signed as a deed and FD AI sets out the signature blocks." },
      { label: "Warranties", text: "What the creator promises about the IP, and whether those promises are limited to what they know." },
      { label: "Basic, Standard or Complex", text: "Basic assigns everything and keeps it confidential. Standard adds licences and independent advice. Complex adds joint ownership, the right to sue and warranties." },
    ],
    whenNeeded: [
      "When a founder built the product before the company was incorporated",
      "When a freelancer, agency or contractor created code, designs or content for you",
      "Before a funding round or sale, when investors and buyers check who owns the IP",
      "When a co-founder or early team member leaves and their work must stay with the company",
    ],
    faqs: [
      { q: "Why do I need an IP assignment agreement?", a: "The person who creates a work often owns it unless it is assigned in writing. Without an assignment, IP made by a founder or freelancer may stay with them, which investors and buyers will ask about." },
      { q: "Do my employees need to sign one?", a: "An employment contract usually deals with IP created in the job. An IP assignment agreement is more often used for founders, freelancers and contractors, or for work done before someone was employed." },
      { q: "Why is it signed as a deed when no fee is paid?", a: "A promise made without anything given in return may not be enforceable as an ordinary contract, but a deed is. A deed has its own signing formalities, and FD AI sets out the signature blocks for the law you choose." },
      { q: "Can the creator still show the work in their portfolio?", a: "Only if the agreement allows it. FD AI's Standard version can add a licence back to the creator, for their portfolio only or for any purpose." },
      { q: "Which law should govern it?", a: "Usually the law of the place where the company that will own the IP is based. Outside Singapore, have a lawyer qualified in that law confirm the local points before signing." },
      EDIT,
    ],
    reading: [],
    signNote: "Signed as a deed (when no fee is paid for the IP)? Sign it on paper with a witness: Singapore's e-signature rules do not cover deeds between parties.",
    related: [
      { title: "Contractor agreement template", href: "/templates/contractor-agreement", text: "Engaging a freelancer? Deal with IP in the contractor agreement from the start." },
      { title: "Co-founder agreement template", href: "/templates/co-founder-agreement", text: "Set out that IP the founders create belongs to the company." },
      { title: "Employment contract template", href: "/templates/employment-contract", text: "For employees, the employment contract covers IP created in the job." },
      { title: "NDA template", href: "/templates/nda", text: "Keep ideas private before any work starts." },
    ],
    countries: [],
  },
  {
    slug: "joint-venture-agreement",
    icon: "🌉",
    summary: "Two parties, one company: shares, the board, deadlock and how to leave.",
    docSlug: "jva",
    short: "Joint venture agreement",
    name: "Joint Venture Agreement",
    h1: "Joint venture agreement template — draft one in minutes",
    beta: true,
    law: "Choose where the joint venture company is incorporated: Singapore, England and Wales, Hong Kong, Delaware, New York or another law.",
    title: "Joint Venture Agreement Template — Draft Free | FD AI",
    description:
      "Draft a joint venture agreement online: 50:50 or majority, shares and funding, the board, reserved matters, deadlock and exit. Choose the law. Start free.",
    lead: "A joint venture agreement sets out how two parties own and run a company together. FD AI drafts one in about 8 minutes: the shares and investment, the board, the decisions that need you both, what happens if you cannot agree, and how a party can leave.",
    covers: [
      { label: "50:50 or a majority partner", text: "Equal ownership, or one party holding more. If so, tell FD AI which side you are on and the usual answers lean your way." },
      { label: "The company and its business", text: "A joint venture company that is already set up or about to be, and what it will do." },
      { label: "Shares and investment", text: "What each party pays for its shares at the start, and whether they must put in more money later, up to a limit." },
      { label: "The board", text: "How many directors each party appoints, and whether the chair has a casting vote." },
      { label: "Reserved matters", text: "The decisions that need both parties' written consent, such as borrowing above a set amount." },
      { label: "Deadlock", text: "What happens if the parties still cannot agree on an important matter." },
      { label: "Selling shares", text: "Whether a party may sell to an outsider, a lock-in period, and tag-along and drag-along where one party holds the majority." },
      { label: "Leaving on bad terms", text: "What happens if a party seriously breaches the agreement or becomes insolvent, including a buy-out at a discount." },
      { label: "Competing, dividends and conduct", text: "Whether a party may compete with the joint venture, what happens to profits, and an optional anti-corruption promise." },
      { label: "Basic, Standard or Complex", text: "Basic covers the essentials. Standard adds further funding, the full list of reserved matters, the business plan and dividends. Complex adds tag- and drag-along and anti-corruption." },
    ],
    whenNeeded: [
      "When two businesses set up a new company for a project or a new market",
      "When a local partner and an overseas partner go into business together",
      "When two founders' companies combine a product and a customer base",
      "Before either side puts money or assets into the joint company",
    ],
    faqs: [
      { q: "Is a joint venture agreement the same as a shareholders' agreement?", a: "It is a kind of shareholders' agreement, written for two parties who set up a company together for a shared business. It focuses on what each party puts in, joint decisions, deadlock and exit." },
      { q: "Do we need to set up a new company?", a: "FD AI's joint venture agreement is for a joint venture company, already incorporated or about to be. A joint venture run purely by contract, without a company, needs a different agreement." },
      { q: "What is deadlock, and why does it matter?", a: "Deadlock is when the parties cannot agree on an important decision. In a 50:50 joint venture neither side can outvote the other, so the agreement should say what happens next. FD AI asks you to choose a route." },
      { q: "Should the company's constitution match the agreement?", a: "Yes. The agreement binds the parties, but the constitution binds the company. The constitution should be amended to match, so the two do not pull against each other." },
      { q: "Which law should we choose?", a: "Usually the law of the place where the joint venture company is incorporated. Outside Singapore, have a lawyer qualified in that law confirm the local points before signing." },
      EDIT,
    ],
    reading: [],
    related: [
      { title: "NDA template", href: "/templates/nda/mutual", text: "Both sides will share plans and numbers in the talks: sign a mutual NDA first." },
      { title: "Term sheet template", href: "/templates/term-sheet", text: "Agree the main terms of the partnership in a term sheet before the full agreement." },
      { title: "Shareholders' agreement template", href: "/templates/shareholders-agreement", text: "More than two shareholders, or investors coming in? A shareholders' agreement fits better." },
      { title: "Services agreement template", href: "/templates/services-agreement", text: "If a partner will also supply services to the joint venture, put those terms in their own agreement." },
    ],
    countries: [],
  },
];

/** Pages for a search an existing document already answers under another name, by the document's slug. */
export const MORE_VARIANTS: Record<string, CountryPage[]> = {
  "loan-agreement": [
    {
      slug: "personal",
      kind: "type",
      label: "Personal loan agreement",
      name: "a personal loan",
      short: "Personal",
      flag: "👪",
      searchPhrase: "personal loan agreement template",
      h1: "Personal loan agreement template — for family and friends",
      pointsTitle: "Lending to family or friends: points to know",
      title: "Personal Loan Agreement Template Singapore | FD AI",
      description:
        "Draft a personal loan agreement for family or friends: amount, repayment, interest or interest-free, in plain English. Singapore law. Start free.",
      lead: "Lending to a friend or relative, or borrowing from one? A short written agreement keeps the amount, the repayment and any interest clear. FD AI drafts one under Singapore law in a few minutes.",
      lawChoice: "Choose the Simple level and \"An individual\" as the Borrower. The Simple version is a personal loan with no company involved.",
      lawPoints: [
        { label: "Put it in writing", text: "A short agreement records how much was lent, when it is repaid and whether interest applies. It protects the friendship as much as the money." },
        { label: "Interest and the Moneylenders Act", text: "Under the Moneylenders Act 2008, a person who lends money and is repaid a larger sum is presumed to be a moneylender, and moneylending needs a licence unless an exclusion applies. A one-off loan to a friend is very different from running a lending business, but if you charge interest, check this with a lawyer. FD AI flags it." },
        { label: "Interest-free", text: "Choose interest-free and the borrower repays only what was lent." },
        { label: "How it is repaid", text: "In full on a set date, in equal monthly or quarterly instalments, or within 30 days of the lender asking after the term ends." },
        { label: "Kept short", text: "The Simple version leaves out clauses a loan between people who know each other can do without, such as confidentiality and limits on liability." },
      ],
      faqs: [
        { q: "Is a loan agreement between family members legally binding?", a: "A signed written agreement shows both sides meant it to be binding and is far easier to rely on than a verbal promise. Courts can treat informal family arrangements as not intended to create legal duties, so writing it down matters." },
        { q: "Can I charge interest on a loan to a friend?", a: "You can agree interest, but in Singapore a person who lends for a larger sum back is presumed to be a moneylender unless an exclusion applies. For a one-off loan, many people keep it interest-free. If you want interest, ask a lawyer first." },
        { q: "Does a personal loan agreement need a witness?", a: "No. A loan agreement does not need a witness to be valid. Both sides sign and each keeps a copy. If you sign with FD Sign, an audit trail records who signed and when." },
      ],
    },
    {
      slug: "director-loan",
      kind: "type",
      label: "Director's loan agreement",
      name: "a director's loan",
      short: "Director's loan",
      flag: "🏢",
      searchPhrase: "director's loan agreement template",
      h1: "Director's loan agreement template — lending to your own company",
      pointsTitle: "A director or shareholder lending to the company: points to know",
      title: "Director's Loan Agreement Template Singapore | FD AI",
      description:
        "Draft a director's or shareholder's loan to a Singapore company: amount, interest, repayment and board approval. Lawyer-backed, Word in minutes.",
      lead: "When a director or shareholder lends money to their own company, a written agreement shows it is a loan, not share capital, and says when it is repaid. FD AI drafts one under Singapore law.",
      lawChoice: "Choose \"A company\" as the Borrower, then name the director or shareholder as the Lender.",
      lawPoints: [
        { label: "A loan, not shares", text: "The agreement records that the money is to be repaid, not exchanged for shares. That keeps the company's accounts clear and answers the question investors will ask later." },
        { label: "Board approval", text: "With a company as the Borrower, the agreement asks for a board resolution approving the loan before the money is paid over." },
        { label: "Lending to a company", text: "Under the Moneylenders Act 2008, a person who lends only to companies is an excluded moneylender, so that lending does not need a licence. FD AI notes this for you to confirm." },
        { label: "The other direction is different", text: "A company lending to its own director is restricted under the Companies Act 1967 (section 162). This template is for money going into the company. Ask a lawyer before the company lends to a director." },
        { label: "Interest and repayment", text: "A fixed rate a year, a floating rate or interest-free, repaid on a set date, in instalments or on request." },
        { label: "If investors come in", text: "Investors may ask for a shareholder loan to be repaid later than theirs or turned into shares. If the loan is meant to convert, use a convertible loan agreement instead." },
      ],
      faqs: [
        { q: "Should I lend to my company or buy more shares?", a: "A loan is repaid and does not change who owns the company. Shares are not repaid and do change it. Many founders lend at the start because it is simpler, then decide later whether to convert the loan." },
        { q: "Can a director's loan be interest-free?", a: "Yes. Choose interest-free in FD AI. Speak to your accountant about how the loan is shown in the company's accounts." },
        { q: "Does the company need to approve the loan?", a: "The directors should approve it by a board resolution, and a director with an interest in the loan should declare it. FD AI's agreement makes the board resolution a condition of the loan." },
      ],
    },
  ],
  "contractor-agreement": [
    {
      slug: "freelance",
      kind: "type",
      label: "Freelance contract",
      name: "a freelance contract",
      short: "Freelance",
      flag: "🧑‍🎨",
      searchPhrase: "freelance contract template",
      h1: "Freelance contract template — for freelancers and clients",
      pointsTitle: "What a freelance contract should settle",
      title: "Freelance Contract Template — Draft One Free | FD AI",
      description:
        "Draft a freelance contract online: the work, fees, expenses, who owns the IP and how it ends. Singapore, UK, Hong Kong or US law. Start free.",
      lead: "A freelance contract sets out the work, the fee and who owns what is created. FD AI drafts one from Founders Doc's lawyer-written wording. The questions call the client \"the Company\" and the freelancer \"the Contractor\", so either side can prepare it.",
      lawChoice: "Choose Basic for a short contract, and \"An individual\" when asked how the Contractor is signing.",
      lawPoints: [
        { label: "The work", text: "What will be delivered, the standard expected, and progress updates when the client asks." },
        { label: "Fees and expenses", text: "How the freelancer is paid, and whether expenses the client approved in advance are paid back." },
        { label: "Who owns the work", text: "Full ownership passes to the client, or the freelancer keeps it and gives the client a licence. Agree this before the work starts." },
        { label: "Other clients", text: "Free to work for others, or exclusive, with the client's written consent needed for other work." },
        { label: "How it ends", text: "When the work is done, on a set date, or on notice from either side, and straight away for serious problems." },
        { label: "Freelancer or employee?", text: "FD AI flags answers that make the freelancer look like an employee, such as fixed monthly pay, because that can bring extra legal duties." },
      ],
      faqs: [
        { q: "Do freelancers need a written contract?", a: "A written contract is not always required by law, but it settles the scope, the fee and who owns the work before anything goes wrong. Most disputes with freelancers are about one of those three." },
        { q: "Who owns the work if nothing is agreed?", a: "It depends on the country and the kind of work. In many places the person who creates a work keeps the copyright unless it is assigned in writing, so the contract should say who owns it." },
        { q: "Can a freelancer work for other clients?", a: "Yes, unless the contract says otherwise. FD AI asks whether the freelancer works exclusively for the client and flags exclusivity as a sign of employment." },
      ],
    },
    {
      slug: "consulting",
      kind: "type",
      label: "Consulting agreement",
      name: "a consulting agreement",
      short: "Consulting",
      flag: "🧭",
      searchPhrase: "consulting agreement template",
      h1: "Consulting agreement template — engage a consultant",
      pointsTitle: "What a consulting agreement should settle",
      title: "Consulting Agreement Template — Draft Free | FD AI",
      description:
        "Draft a consulting agreement online: scope, fees, confidentiality, IP, conflicts and notice. Individual or company consultant. Lawyer-backed. Start free.",
      lead: "A consulting agreement sets out what a consultant will do, how they are paid and what stays confidential. FD AI drafts one from Founders Doc's lawyer-written wording, for a consultant signing personally or through their own company.",
      lawChoice: "Choose Standard for the fuller protections, then say whether the consultant signs as an individual or on behalf of a company.",
      lawPoints: [
        { label: "Individual or company", text: "The consultant can sign personally or through their own company. It changes who is responsible if something goes wrong." },
        { label: "Scope", text: "The key things the consultant will do, and the standard expected." },
        { label: "Conflicts", text: "A confirmation that the consultant has no other agreement or commitment that could get in the way, and whether they work for you exclusively." },
        { label: "Confidentiality", text: "How long the consultant must keep your information confidential after the work ends." },
        { label: "IP", text: "Whether everything the consultant creates belongs to your company." },
        { label: "Ending it and after", text: "Notice from either side, ending straight away for serious problems, and optional limits on working with competitors or recruiting your team afterwards." },
      ],
      faqs: [
        { q: "Consulting agreement or services agreement?", a: "Use the consulting (contractor) agreement to engage a person, or their one-person company, to work with your team. Use the services agreement when a business sells services with fees, renewals and liability caps, from the provider's or the customer's side." },
        { q: "Should a consultant sign personally or through their company?", a: "Either works. If they sign through a company, the company owes the duties, so check who will actually do the work and that confidentiality and IP terms bind that person too." },
        { q: "Can I stop a consultant working for competitors?", a: "During the engagement, exclusivity can be agreed. After it ends, a restriction is only likely to be enforced if it is reasonable in length, area and scope. FD AI lets you choose a period and flags the risk." },
      ],
    },
  ],
  "services-agreement": [
    {
      slug: "saas",
      kind: "type",
      label: "SaaS agreement",
      name: "a SaaS agreement",
      short: "SaaS",
      flag: "☁️",
      searchPhrase: "SaaS agreement template",
      h1: "SaaS agreement template — software subscriptions",
      pointsTitle: "What a SaaS agreement should settle",
      title: "SaaS Agreement Template Singapore — Draft Free | FD AI",
      description:
        "Draft a SaaS subscription agreement online: fees, billing, renewal, uptime and support, liability cap. Provider or customer side. Singapore law. Free.",
      lead: "A SaaS agreement sets the terms on which a customer subscribes to your software: what they pay, how long for and what you commit to. FD AI drafts one under Singapore law, from the provider's or the customer's side.",
      lawChoice: "Choose \"A platform or software service (SaaS)\" in the first question, then say whether you are providing the service or receiving it.",
      lawPoints: [
        { label: "Subscription fee and billing", text: "A monthly fee invoiced monthly, quarterly or yearly in advance, with an optional one-off set-up fee and fees for usage above a limit." },
        { label: "Term and renewal", text: "6, 12 or 24 months or another period, renewing automatically unless either side gives notice, or ending unless both agree to renew." },
        { label: "Uptime and support", text: "Whether the provider commits to service levels: uptime and support response times." },
        { label: "Changes and price rises", text: "Whether the provider may change or withdraw parts of the service, and whether fees can go up during the term." },
        { label: "Liability", text: "A cap on what can be claimed, whose liability it limits, who covers third-party claims, and how long the customer has to bring a claim." },
        { label: "Payment and ending early", text: "How long the customer has to pay an invoice, interest on late payment, and whether either side can end the agreement without a reason." },
      ],
      faqs: [
        { q: "SaaS agreement or online terms of service?", a: "Terms of service are the same for every user and accepted with a click. A SaaS agreement is signed with one customer and can be negotiated: its own fee, term, service levels and liability cap. Larger customers usually ask for one." },
        { q: "Should a SaaS agreement include an SLA?", a: "Customers often ask for uptime and support commitments. FD AI lets you include service levels or leave them out, and the usual answer follows the side you are on." },
        { q: "Can the provider raise the price during the term?", a: "Only if the agreement allows it. FD AI asks whether fees can go up during the agreement, so both sides know before signing." },
      ],
    },
  ],
  "convertible-loan-agreement": [
    {
      slug: "convertible-note",
      kind: "type",
      label: "Convertible note",
      name: "a convertible note",
      short: "Convertible note",
      flag: "📝",
      searchPhrase: "convertible note template",
      h1: "Convertible note template — a loan that turns into shares",
      pointsTitle: "Convertible notes: the terms that matter",
      title: "Convertible Note Template Singapore — Draft Free | FD AI",
      description:
        "Draft a convertible note online: amount, interest, maturity, valuation cap, discount and conversion. Company or investor side. Lawyer-backed. Free.",
      lead: "A convertible note is a loan that turns into shares at the next funding round. In Singapore it is usually written as a convertible loan agreement. FD AI drafts one from your answers, from the company's or the investor's side.",
      lawChoice: "Start the Convertible Loan Agreement. The questions cover the note's amount, interest, maturity, valuation cap and discount.",
      lawPoints: [
        { label: "Note or loan agreement", text: "\"Convertible note\" and \"convertible loan\" describe the same deal: money lent now that converts into shares later. FD AI's document is a convertible loan agreement." },
        { label: "Valuation cap", text: "The highest company valuation at which the note converts, set before or after the new money comes in. A lower cap gives the investor more shares." },
        { label: "Discount", text: "A discount on the next round's price, such as 10%, 15% or 20%, to reward the investor for coming in early." },
        { label: "Interest and maturity", text: "Simple, compounded or interest-free, with a maturity date of one, two or three years or another period if the note has not converted." },
        { label: "When it converts", text: "At a qualifying round, a sale or a listing, or at maturity, automatically or only if the investor chooses." },
      ],
      faqs: [
        { q: "Is a convertible note the same as a convertible loan?", a: "Yes, in substance. Both are loans that convert into shares at a later funding round. \"Note\" is the more common word in the US; in Singapore the document is usually called a convertible loan agreement." },
        { q: "What is a valuation cap?", a: "It is the maximum valuation used to work out the investor's conversion price. If the next round values the company above the cap, the investor converts at the cap and so receives more shares for their money." },
        { q: "What discount should a convertible note have?", a: "It is a commercial point for the company and the investor to agree. FD AI offers 10%, 15% or 20%, another figure, or no discount." },
      ],
    },
  ],
};
