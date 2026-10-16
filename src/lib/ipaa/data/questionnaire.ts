/**
 * The IP Assignment Agreement questionnaire.
 *
 * The base is the FD Lite question bank for the IP assignment agreement —
 * two pathways, the Recipient's (the business receiving the IP) and the
 * Creator's (the person or firm making it) — and the FD Lite menu's three
 * versions:
 *
 *   basic     the essentials: past and future IP assigned in full to the
 *             Recipient, moral rights waived, perfection of the assignment
 *             and confidentiality;
 *   standard  adds the licence back to the Creator (and the licence of any
 *             background IP built into the work) and independent advice;
 *   complex   every option: who owns the IP (the Recipient, both jointly,
 *             or the Creator with a licence to the Recipient), the scope of
 *             any licence, the right to sue, the Creator's warranties,
 *             completion (delivery of the work) and permitted disclosure.
 *
 * Basic and Standard assign the IP 100% to the Recipient, as the FD Lite
 * assumptions say; joint ownership and the Creator keeping the IP are
 * Complex only.
 *
 * FD AI drafts for any country: the FD Lite "based in Singapore" check is
 * the governing-law question here, whose answer sets the moral rights law,
 * the third-party rights statute, how the document is signed and the courts
 * or arbitration (data/master.ts → JURISDICTIONS).
 *
 * A question asked only at some levels says so (asked_at); at the others it
 * takes its usual answer, or the answer the level sets (fixed). Where the
 * two sides would answer differently, the usual answer follows the side
 * (default_by), and a question can read differently for each side
 * (text_by, and label_by on an option).
 *
 * Data, not code: the screen asks these in order, the server checks them,
 * the assembler reads them by id, and the admin console lists them.
 */

const NUM = { pattern: "^(?!\\s*\\d[\\d,]*(\\.\\d+)?\\s*$)", message: "A number only, please (e.g. 5,000)." };
const PCT = { pattern: "^(?!\\s*\\d{1,2}(\\.\\d{1,2})?\\s*%?\\s*$)", message: "A percentage only, please (e.g. 60)." };
const INT = { pattern: "^(?!\\s*\\d{1,3}\\s*$)", message: "A whole number only, please (e.g. 6)." };
const SIDE = (creator: unknown, recipient: unknown) => ({ q: "IP1", map: { creator, recipient } });
const BY_SIDE = (recipient: string, creator: string) => ({ q: "IP1", map: { recipient, creator } });
const NOT_BASIC = ["standard", "complex"] as const;
const ONLY_COMPLEX = ["complex"] as const;
const REC = { q: "IP1", eq: "recipient" } as const;
const CRE = { q: "IP1", eq: "creator" } as const;
/** The Creator keeps the IP and licenses it to the Recipient. */
const CREATOR_OWNS = { any: [{ q: "IP11", eq: "creator" }, { q: "IP12", in: ["creator_perpetual", "creator_limited"] }] } as const;
const JOINT = { any: [{ q: "IP11", eq: "joint" }, { q: "IP12", eq: "joint" }] } as const;

export const IPAA_QUESTIONNAIRE = {
  id: "FD_IPAA_QUESTIONNAIRE",
  version: "1.0",
  for_master: "FD IP Assignment Agreement (FD Lite menu: Basic, Standard, Complex)",
  status: "Live",
  questions: [
    /* ── the basics ── */
    {
      id: "IP0",
      key: "level",
      section: "The basics",
      type: "scale",
      required: true,
      default: "standard",
      text: "Level of Detail. How detailed should the agreement be?",
      help: "Pro Tip: Move the slider to choose. Basic and Standard assign the IP 100% to the recipient; Complex also lets you choose joint ownership or the creator keeping the IP, and adds warranties. You can change the level later from the list on the right; your answers are kept.",
      options: [
        { value: "basic", label: "Basic" },
        { value: "standard", label: "Standard", recommended: true },
        { value: "complex", label: "Complex" },
      ],
    },
    {
      id: "IP1",
      key: "side",
      section: "The basics",
      type: "single_choice",
      required: true,
      text: "Your Side. Are you the creator of the IP, or the person receiving the IP created?",
      help: "Pro Tip: The agreement stays fair to both sides, but where the usual position differs — what the creator may still do with the work, which promises the creator gives — the usual answer leans to your side. You can change any of them.",
      options: [
        { value: "creator", label: "Creator of the IP – I am making it" },
        { value: "recipient", label: "Receiving the IP created – it is being made for me" },
      ],
    },
    {
      id: "IP2",
      key: "law",
      section: "The basics",
      type: "single_choice",
      required: true,
      default: "sg",
      text: "Governing Law. Which country's law governs the agreement?",
      help: "Pro Tip: Usually where the recipient is based, or where the IP will mainly be used. The answer sets the moral rights law, the third-party rights statute, how the document is signed and the courts or arbitration. Outside Singapore, have a lawyer qualified there confirm it.",
      options: [
        { value: "sg", label: "Singapore", recommended: true },
        { value: "ew", label: "England and Wales" },
        { value: "hk", label: "Hong Kong" },
        { value: "de", label: "Delaware (United States)" },
        { value: "ny", label: "New York (United States)" },
        { value: "other", label: "Another country – type it" },
      ],
    },
    { id: "IP2a", key: "law_other", section: "The basics", type: "free_text", required: true, max_length: 60, show_if: { q: "IP2", eq: "other" }, text: "Which country's law?", placeholder: "e.g. Malaysia" },

    /* ── the people ── */
    {
      id: "IP3",
      key: "creator_role",
      section: "The people",
      type: "single_choice",
      required: true,
      show_if: REC,
      text: "The Creator. Who is building or creating the IP?",
      help: "Pro Tip: This sets the background to the agreement. For an employee, much of what they create at work may already belong to you by law — the agreement confirms it and covers anything that does not.",
      options: [
        { value: "employee", label: "An employee" },
        { value: "contractor", label: "A contractor" },
        { value: "consultant", label: "A consultant" },
        { value: "provider", label: "A third-party service provider" },
        { value: "other", label: "Others – specify" },
      ],
    },
    { id: "IP3a", key: "creator_role_other", section: "The people", type: "free_text", required: true, max_length: 80, show_if: { all: [REC, { q: "IP3", eq: "other" }] }, text: "Who is creating the IP?", placeholder: "e.g. an adviser to the company" },
    {
      id: "IP4",
      key: "creator_type",
      section: "The people",
      type: "single_choice",
      required: true,
      show_if: CRE,
      text: "About You. Tell us more about yourself.",
      options: [
        { value: "contractor", label: "I’m a contractor" },
        { value: "consultant", label: "I’m a consultant" },
        { value: "freelancer", label: "I’m a freelancer" },
        { value: "consulting_co", label: "I represent a consulting company" },
        { value: "provider", label: "I represent a third-party service provider" },
        { value: "other", label: "Others – specify" },
      ],
    },
    { id: "IP4a", key: "creator_type_other", section: "The people", type: "free_text", required: true, max_length: 80, show_if: { all: [CRE, { q: "IP4", eq: "other" }] }, text: "What do you do?", placeholder: "e.g. a design studio" },
    {
      id: "IP5",
      key: "aim",
      section: "The people",
      type: "single_choice",
      required: true,
      default: "project",
      show_if: CRE,
      text: "Your Aim. Tell us more about what you want out of this document.",
      help: "Pro Tip: For a template, leave the recipient's details blank — they are marked [●] for you to fill in for each client.",
      options: [
        { value: "template", label: "A template I can use for my clients / customers" },
        { value: "project", label: "A specific project – to protect the IP interests", recommended: true },
        { value: "jv", label: "A joint venture with another person – to record who owns the IP" },
      ],
    },
    {
      id: "IP6",
      key: "with_others",
      section: "The people",
      type: "single_choice",
      required: true,
      default: "solo",
      text: "Others Involved. Is the person working with others to create the IP?",
      text_by: BY_SIDE("Others Involved. Is the person working with others to create the IP?", "Others Involved. Are you working with others to create the IP?"),
      help: "Pro Tip: Anyone else who contributes — staff, subcontractors, a co-creator — may own their part. If so, the agreement makes the creator get their rights in writing, so the whole IP ends up in the right hands.",
      options: [
        { value: "solo", label: "No, it’s a solo project", label_by: { creator: "No, everything will be created by us / myself" }, recommended: true },
        { value: "others", label: "Yes, working with others – both parties will contribute to the IP", label_by: { creator: "Yes, working with others to create the IP" } },
        { value: "undetermined", label: "Undetermined" },
      ],
    },

    /* ── the IP ── */
    {
      id: "IP7",
      key: "ip_types",
      section: "The IP",
      type: "multi_choice",
      required: true,
      text: "Type of IP. What type of IP are you engaging the person for?",
      text_by: BY_SIDE("Type of IP. What type of IP are you engaging the person for?", "Type of IP. What type of IP are you creating?"),
      help: "Pro Tip: Choose all that apply. Each one gets its own line in Schedule 1, where you can list the items — the more specific the list, the easier it is to prove who owns what later.",
      options: [
        { value: "coding", label: "Coding" },
        { value: "artwork", label: "Artwork – e.g. logos, trade marks, infographics, videos" },
        { value: "proprietary", label: "Proprietary information" },
        { value: "other", label: "Others – specify" },
      ],
    },
    { id: "IP7a", key: "ip_types_other", section: "The IP", type: "free_text", required: true, max_length: 80, show_if: { q: "IP7", has: "other" }, text: "What other type of IP?", placeholder: "e.g. product formulas" },
    {
      id: "IP8",
      key: "work",
      section: "The IP",
      type: "free_text",
      required: true,
      max_length: 300,
      text: "The Work. Describe what is being created, in a sentence.",
      help: "Pro Tip: Be as specific as you can — the product or app, the version, the deliverables. It goes into the agreement and Schedule 1, and a clear description makes ownership easier to prove later, for example to an investor.",
      placeholder: "e.g. the source code, designs and documentation for the Northwind delivery app (version 1.0)",
    },
    {
      id: "IP9",
      key: "project",
      section: "The IP",
      type: "single_choice",
      required: true,
      default: "one_off",
      default_by: { q: "IP5", map: { template: "ongoing", project: "one_off", jv: "collab" } },
      text: "The Project. Tell us more about the project.",
      help: "Pro Tip: This sets the Project Period — the time in which everything the creator makes for the project is covered, including work done before the agreement is signed.",
      options: [
        { value: "one_off", label: "It is a one-off project" },
        { value: "fixed", label: "It is a project carried out for a fixed period of time" },
        { value: "ongoing", label: "It is an ongoing project that will take some time" },
        { value: "collab", label: "We are entering into a collaboration / joint venture that will be rather permanent" },
      ],
    },
    { id: "IP9a", key: "months", section: "The IP", type: "free_text", required: true, max_length: 3, show_if: { q: "IP9", eq: "fixed" }, text: "For how many months?", placeholder: "e.g. 6", reject: [INT] },
    {
      id: "IP10",
      key: "confidential",
      section: "The IP",
      type: "single_choice",
      required: true,
      default: "yes",
      text: "Confidential Information. Will the person be receiving confidential information from you in order to create the IP?",
      text_by: BY_SIDE(
        "Confidential Information. Will the person be receiving confidential information from you in order to create the IP?",
        "Confidential Information. Will you receive confidential information from the person engaging you, in order to create the IP?",
      ),
      help: "Pro Tip: Both sides keep each other's confidential information secret either way. If information is handed over for the work, the creator must also use it only for the project and return or destroy it at the end.",
      options: [
        { value: "yes", label: "Yes", recommended: true },
        { value: "no", label: "No" },
        { value: "maybe", label: "Maybe" },
      ],
    },

    /* ── ownership and licence ── */
    {
      id: "IP11",
      asked_at: ONLY_COMPLEX,
      fixed: { basic: "recipient", standard: "recipient" },
      key: "owner",
      section: "Ownership and licence",
      type: "single_choice",
      required: true,
      default: "recipient",
      show_if: REC,
      text: "Ownership. Who owns the IP that is created?",
      help: "Pro Tip: Owning the IP outright is what investors and buyers usually expect for anything core to the business. Joint ownership is harder to use: neither owner can license or sell it without the other.",
      options: [
        { value: "joint", label: "Jointly owned by the creator and ourselves" },
        { value: "recipient", label: "By us (the recipient)", recommended: true },
        { value: "creator", label: "By the creator, who licenses the IP created to us" },
      ],
    },
    {
      id: "IP11a",
      asked_at: ONLY_COMPLEX,
      key: "licence_kind",
      section: "Ownership and licence",
      type: "single_choice",
      required: true,
      default: "perpetual",
      show_if: { all: [REC, { q: "IP11", eq: "creator" }] },
      text: "The Licence. What licence does the creator give you?",
      options: [
        { value: "perpetual", label: "Perpetual and royalty-free – for any purpose of our business", recommended: true },
        { value: "limited", label: "Limited – only for this project, while it lasts" },
      ],
    },
    {
      id: "IP12",
      asked_at: ONLY_COMPLEX,
      fixed: { basic: "recipient", standard: "recipient" },
      key: "owner_creator",
      section: "Ownership and licence",
      type: "single_choice",
      required: true,
      default: "recipient_showcase",
      default_by: { q: "IP5", map: { jv: "joint" } },
      show_if: CRE,
      text: "Ownership. Who owns the IP that is created?",
      help: "Pro Tip: Keeping the IP and licensing it lets you reuse your work for other clients; a client paying for something core to its business will usually want to own it.",
      options: [
        { value: "creator_perpetual", label: "By us – with a perpetual, royalty-free licence for the recipient to use it" },
        { value: "creator_limited", label: "By us – with a limited licence for the recipient to use it" },
        { value: "recipient_licence", label: "By the person who engaged us – but we may licence it back for any purpose" },
        { value: "recipient_showcase", label: "By the person who engaged us – but we may showcase it in our portfolio" },
        { value: "joint", label: "Jointly by us and the person who engaged us" },
        { value: "recipient", label: "By the person who engaged us – we keep no rights" },
      ],
    },
    {
      id: "IP12a",
      asked_at: ONLY_COMPLEX,
      key: "buy_back",
      section: "Ownership and licence",
      type: "single_choice",
      required: true,
      default: "no",
      show_if: { all: [CRE, { q: "IP12", in: ["recipient_licence", "recipient_showcase"] }] },
      text: "Buy-Back. Would you like the option to buy over / have the IP assigned to yourself if requested?",
      help: "Pro Tip: If you ask, the recipient must sell the IP back to you at its fair market value — agreed, or set by an independent valuer.",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No, this won’t be feasible" },
      ],
    },
    {
      id: "IP13",
      key: "shares",
      section: "Ownership and licence",
      type: "single_choice",
      required: true,
      default: "equal",
      show_if: JOINT,
      text: "Shares. How is the jointly owned IP shared?",
      options: [
        { value: "equal", label: "Equally – 50 : 50", recommended: true },
        { value: "other", label: "In other shares – type the creator's percentage" },
      ],
    },
    { id: "IP13a", key: "creator_share", section: "Ownership and licence", type: "free_text", required: true, max_length: 6, show_if: { all: [JOINT, { q: "IP13", eq: "other" }] }, text: "The creator's share (%)?", placeholder: "e.g. 40", reject: [PCT] },
    {
      id: "IP14",
      asked_at: NOT_BASIC,
      fixed: { basic: "none" },
      key: "licence_back",
      section: "Ownership and licence",
      type: "single_choice",
      required: true,
      default_by: SIDE("showcase", "none"),
      show_if: {
        any: [
          { all: [REC, { q: "IP11", eq: "recipient" }] },
          { all: [CRE, { q: "IP12", eq: "recipient" }, { q: "IP0", not_in: ["complex"] }] },
        ],
      },
      text: "Licence Back. After the IP is assigned to you, may the creator still use it?",
      text_by: BY_SIDE("Licence Back. After the IP is assigned to you, may the creator still use it?", "Licence Back. After the IP is assigned, may you still use it?"),
      help: "Pro Tip: A portfolio licence lets the creator show the work to win other clients, without disclosing anything confidential. A licence for any purpose lets them reuse it — even for others.",
      options: [
        { value: "none", label: "No – only we use it", label_by: { creator: "No – only the person who engaged us uses it" } },
        { value: "showcase", label: "Only to showcase it in a portfolio or case study" },
        { value: "any", label: "For any purpose, non-exclusively" },
      ],
    },
    {
      id: "IP15",
      asked_at: ONLY_COMPLEX,
      key: "exclusivity",
      section: "Ownership and licence",
      type: "single_choice",
      required: true,
      default_by: SIDE("non_exclusive", "exclusive"),
      show_if: CREATOR_OWNS,
      text: "Scope of Licence. Is the recipient's licence exclusive?",
      help: "Pro Tip: Exclusive means no one else may use the IP — not even the creator. Sole means the creator may use it but licenses no one else. Non-exclusive leaves the creator free to license it to others.",
      options: [
        { value: "exclusive", label: "Exclusive – not even the creator may use it", label_by: { creator: "Exclusive – not even we may use it" } },
        { value: "sole", label: "Sole – the creator may use it, but no one else", label_by: { creator: "Sole – we may use it, but license no one else" } },
        { value: "non_exclusive", label: "Non-exclusive – the creator may license it to others too", label_by: { creator: "Non-exclusive – we may license it to others too" } },
      ],
    },

    /* ── payment and signing ── */
    {
      id: "IP16",
      key: "fee",
      section: "Payment and signing",
      type: "single_choice",
      required: true,
      default: "none",
      text: "Payment. Is the recipient paying a fee for the IP itself?",
      help: "Pro Tip: When no separate fee is paid for the IP — common when it is part of an employment or services contract — the document is signed as a deed, which is binding without payment. With a fee it is a plain agreement. Under US law it is always an agreement.",
      options: [
        { value: "none", label: "No separate fee", recommended: true },
        { value: "fee", label: "Yes – a fee for the IP" },
      ],
    },
    {
      id: "IP16a",
      key: "currency",
      section: "Payment and signing",
      type: "single_choice",
      required: true,
      default: "SGD",
      default_by: { q: "IP2", map: { sg: "SGD", ew: "GBP", hk: "HKD", de: "USD", ny: "USD" } },
      show_if: { q: "IP16", eq: "fee" },
      text: "Currency. What currency is the fee in?",
      options: [
        { value: "SGD", label: "Singapore dollars (S$)" },
        { value: "USD", label: "US dollars (US$)" },
        { value: "GBP", label: "Pounds sterling (£)" },
        { value: "HKD", label: "Hong Kong dollars (HK$)" },
        { value: "EUR", label: "Euros (€)" },
      ],
    },
    { id: "IP16b", key: "fee_amount", section: "Payment and signing", type: "free_text", required: true, max_length: 20, show_if: { q: "IP16", eq: "fee" }, text: "How much is the fee?", placeholder: "e.g. 5,000", reject: [NUM] },

    /* ── promises and disputes ── */
    {
      id: "IP17",
      asked_at: ONLY_COMPLEX,
      fixed: { basic: ["none"], standard: ["none"] },
      key: "warranties",
      section: "Promises and disputes",
      type: "multi_choice",
      required: true,
      default_by: SIDE(["ownership", "originality"], ["ownership", "non_infringement", "validity", "originality"]),
      text: "Warranties. What does the creator promise about the IP?",
      text_by: BY_SIDE("Warranties. What does the creator promise about the IP?", "Warranties. What do you promise about the IP?"),
      help: "Pro Tip: If a promise turns out to be untrue, the recipient can claim for its loss. Choose all that apply.",
      options: [
        { value: "ownership", label: "Ownership – the creator owns it, free of anyone else's rights" },
        { value: "non_infringement", label: "Non-infringement – it does not infringe anyone else's IP" },
        { value: "validity", label: "Validity – nothing makes it invalid or unenforceable" },
        { value: "originality", label: "Originality – it is the creator's own original work" },
        { value: "none", label: "None", exclusive: true },
      ],
    },
    {
      id: "IP17a",
      asked_at: ONLY_COMPLEX,
      key: "knowledge",
      section: "Promises and disputes",
      type: "single_choice",
      required: true,
      default_by: SIDE("knowledge", "absolute"),
      show_if: { any: [{ q: "IP17", has: "non_infringement" }, { q: "IP17", has: "validity" }] },
      text: "Knowledge. Are the non-infringement and validity promises limited to what the creator knows?",
      options: [
        { value: "knowledge", label: "Yes – so far as the creator is aware, after reasonable enquiry" },
        { value: "absolute", label: "No – absolute promises" },
      ],
    },
    {
      id: "IP18",
      asked_at: NOT_BASIC,
      fixed: { basic: "courts" },
      key: "disputes",
      section: "Promises and disputes",
      type: "single_choice",
      required: true,
      default: "courts",
      text: "Disputes. After 30 days of talks or mediation, how are disputes resolved?",
      help: "Pro Tip: The courts are often cheaper when both sides are in the same country; arbitration is private and easier to enforce abroad.",
      options: [
        { value: "courts", label: "The courts of the governing law", recommended: true },
        { value: "arbitration", label: "Arbitration, under the governing law's usual rules" },
      ],
    },
  ],
} as const;
