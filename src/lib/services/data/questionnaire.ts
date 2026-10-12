/**
 * The Services Agreement questionnaire.
 *
 * There is no FD Lite question bank for the services agreement. The
 * reference points are two precedents shared for this purpose (both
 * Singapore law, names redacted):
 *
 *   A  a platform / SaaS service agreement, drafted for the service
 *      provider — subscription and usage fees, a right to vary the
 *      service, a customer indemnity, a liability cap of the fees paid in
 *      the previous twelve months, a six-month claims bar and a customer
 *      non-solicit — together with an FD AI review of it from both sides
 *      (the provider's tightening and the customer's asks: fee increases by
 *      agreement, a narrower indemnity, a longer claims period, uptime and
 *      support levels, no material change without consent);
 *   B  an advisory (professional) services agreement — a monthly retainer
 *      and a success fee, deliverables in a schedule, invoices disputed
 *      within fourteen days, interest at 1% a month, a cap of the fees
 *      paid under the agreement, thirty days' notice to end it.
 *
 * The first question picks the kind of service (A or B); the second, whose
 * side the user is on. Where the two sides would answer differently, the
 * usual answer follows the side (default_by): the provider's position from
 * sample A as reviewed for the provider, the customer's from the review's
 * customer amendments.
 *
 * Data, not code: the screen asks these in order, the server checks them,
 * the assembler reads them by id, and the admin console lists them.
 */

const NUM = { pattern: "^(?!\\s*\\d[\\d,]*(\\.\\d+)?\\s*$)", message: "A number only, please (e.g. 8,000)." };
const PLATFORM = { q: "SV1", eq: "platform" } as const;
const PRO = { q: "SV1", eq: "professional" } as const;
const SIDE = (provider: unknown, customer: unknown) => ({ q: "SV2", map: { provider, customer } });

export const SERVICES_QUESTIONNAIRE = {
  id: "FD_SERVICES_QUESTIONNAIRE",
  version: "1.0",
  for_master: "Platform service agreement (A, with its review) and advisory services agreement (B), redacted",
  status: "Beta",
  questions: [
    /* ── the deal ── */
    {
      id: "SV1",
      key: "shape",
      section: "The services",
      type: "single_choice",
      required: true,
      text: "Type of Services. What is being provided?",
      help: "Pro Tip: A platform agreement gives access to software or an online service for a subscription. A professional services agreement is for work done by people — consulting, advisory, design, marketing — usually with deliverables.",
      options: [
        { value: "platform", label: "A platform or software service (SaaS) – a subscription to use it" },
        { value: "professional", label: "Professional services – consulting, advisory or other work with deliverables" },
      ],
    },
    {
      id: "SV2",
      key: "side",
      section: "The services",
      type: "single_choice",
      required: true,
      text: "Your Side. Are you providing the services, or receiving them?",
      help: "Pro Tip: The agreement stays fair to both sides, but where the usual position differs — the liability cap, indemnities, changes to the service, fee increases — the usual answer will lean to your side. You can change any of them.",
      options: [
        { value: "provider", label: "I am the Service Provider" },
        { value: "customer", label: "I am the Customer" },
      ],
    },
    {
      id: "SV3",
      key: "currency",
      section: "The services",
      type: "single_choice",
      required: true,
      default: "SGD",
      text: "Currency. What currency are the fees in?",
      options: [
        { value: "SGD", label: "Singapore dollars (S$)", recommended: true },
        { value: "USD", label: "US dollars (US$)" },
      ],
    },
    {
      id: "SV4",
      key: "description",
      section: "The services",
      type: "free_text",
      required: true,
      max_length: 300,
      text: "The Services. Describe the services in a sentence.",
      help: "Pro Tip: Say what is provided, not how good it is — e.g. “access to the route optimisation platform and related support” or “corporate finance and fundraising advisory services for the Customer’s Series A”.",
      placeholder: "e.g. access to the route optimisation platform and related support",
    },
    {
      id: "SV4a",
      key: "deliverables",
      section: "The services",
      type: "free_text_list",
      required: false,
      max_items: 10,
      show_if: PRO,
      text: "Deliverables. List what will be delivered (one at a time), or skip if there are none.",
      placeholder: "e.g. Investor pitch deck",
    },

    /* ── term ── */
    {
      id: "SV5s",
      key: "start",
      section: "Term",
      type: "single_choice",
      required: true,
      default: "signing",
      text: "Start. When do the services start?",
      options: [
        { value: "signing", label: "On the date of the agreement", recommended: true },
        { value: "date", label: "On a set date" },
      ],
    },
    { id: "SV5t", key: "start_date", section: "Term", type: "free_text", required: true, max_length: 40, show_if: { q: "SV5s", eq: "date" }, text: "Start date?", placeholder: "e.g. 1 December 2026" },
    {
      id: "SV5",
      key: "term",
      section: "Term",
      type: "single_choice",
      required: true,
      default_by: { q: "SV1", map: { platform: "12", professional: "6" } },
      text: "Term. How long does the agreement run?",
      help: "Pro Tip: Platform subscriptions usually run for twelve months at a time; advisory work for the length of the project.",
      options: [
        { value: "6", label: "6 months" },
        { value: "12", label: "12 months" },
        { value: "24", label: "24 months" },
        { value: "complete", label: "Until the services are completed" },
        { value: "other", label: "Other – please specify" },
      ],
    },
    { id: "SV5a", key: "term_months", section: "Term", type: "free_text", required: true, max_length: 4, show_if: { q: "SV5", eq: "other" }, text: "How many months?", placeholder: "e.g. 18", reject: [NUM] },
    {
      id: "SV6",
      key: "renewal",
      section: "Term",
      type: "single_choice",
      required: true,
      show_if: { q: "SV5", not_in: ["complete"] },
      default_by: SIDE("auto", "agreement"),
      text: "Renewal. What happens at the end of the term?",
      help: "Pro Tip: Automatic renewal keeps the service running unless someone gives notice; renewal by agreement means it simply ends unless both sides sign up again.",
      options: [
        { value: "auto", label: "Renews automatically for 12 months at a time, unless either side gives 30 days' notice" },
        { value: "agreement", label: "Ends, unless both sides agree in writing to renew" },
      ],
    },

    /* ── fees: platform ── */
    { id: "SV7", key: "subscription_fee", section: "Fees", type: "free_text", required: true, max_length: 20, show_if: PLATFORM, text: "Subscription Fee. How much is the subscription per month (before GST)?", placeholder: "e.g. 8,000", reject: [NUM] },
    {
      id: "SV7a",
      key: "billing",
      section: "Fees",
      type: "single_choice",
      required: true,
      default: "monthly",
      show_if: PLATFORM,
      text: "Billing. How is the subscription invoiced?",
      options: [
        { value: "monthly", label: "Monthly in advance", recommended: true },
        { value: "quarterly", label: "Quarterly in advance" },
        { value: "annually", label: "Annually in advance" },
      ],
    },
    {
      id: "SV7b",
      key: "usage",
      section: "Fees",
      type: "single_choice",
      required: true,
      default: "no",
      show_if: PLATFORM,
      text: "Usage Fees. Are there fees for usage above a limit?",
      options: [
        { value: "no", label: "No usage fees – the subscription covers it", recommended: true },
        { value: "yes", label: "Usage fees above a limit – invoiced monthly in arrears" },
      ],
    },
    { id: "SV7c", key: "usage_terms", section: "Fees", type: "free_text", required: true, max_length: 200, show_if: { all: [PLATFORM, { q: "SV7b", eq: "yes" }] }, text: "Describe the usage fees.", placeholder: "e.g. S$0.05 per route optimisation above 50,000 in a calendar month" },
    { id: "SV7d", key: "setup_fee", section: "Fees", type: "free_text", required: false, max_length: 20, show_if: PLATFORM, text: "Set-up Fee. Is there a one-off set-up fee? Enter the amount, or skip.", placeholder: "e.g. 5,000", reject: [NUM] },

    /* ── fees: professional ── */
    {
      id: "SV8",
      key: "fee_basis",
      section: "Fees",
      type: "single_choice",
      required: true,
      default: "fixed",
      show_if: PRO,
      text: "Fees. How are the services charged?",
      options: [
        { value: "fixed", label: "A fixed fee for the work", recommended: true },
        { value: "retainer", label: "A monthly retainer" },
        { value: "hourly", label: "Hourly rates, billed monthly" },
        { value: "retainer_success", label: "A monthly retainer plus a success fee" },
      ],
    },
    { id: "SV8a", key: "fee_amount", section: "Fees", type: "free_text", required: true, max_length: 20, show_if: PRO, text: "Amount. The fixed fee, the monthly retainer or the hourly rate (before GST)?", placeholder: "e.g. 10,000", reject: [NUM] },
    {
      id: "SV8b",
      key: "fixed_schedule",
      section: "Fees",
      type: "single_choice",
      required: true,
      default_by: SIDE("half", "completion"),
      show_if: { all: [PRO, { q: "SV8", eq: "fixed" }] },
      text: "When is the fixed fee paid?",
      options: [
        { value: "half", label: "50% on signing, 50% on completion" },
        { value: "upfront", label: "100% on signing" },
        { value: "completion", label: "100% on completion" },
      ],
    },
    { id: "SV8c", key: "fee_cap", section: "Fees", type: "free_text", required: false, max_length: 20, show_if: { all: [PRO, { q: "SV8", eq: "hourly" }] }, text: "Fee Cap. Is there a cap on the total fees without the Customer's written approval? Enter the amount, or skip.", placeholder: "e.g. 30,000", reject: [NUM] },
    { id: "SV8d", key: "success_fee", section: "Fees", type: "free_text", required: true, max_length: 300, show_if: { all: [PRO, { q: "SV8", eq: "retainer_success" }] }, text: "Success Fee. Describe the success fee — the amount, what triggers it and any period after the agreement ends.", help: "Pro Tip: Say exactly what counts as success and for how long after the agreement ends it can still be earned (the “tail”) — that is where disputes start.", placeholder: "e.g. 3% of the gross proceeds of any financing completed during the Term or within 12 months after it ends" },
    {
      id: "SV9",
      key: "payment_days",
      section: "Fees",
      type: "single_choice",
      required: true,
      default: "30",
      text: "Payment Terms. How long does the Customer have to pay an invoice?",
      options: [
        { value: "14", label: "14 days" },
        { value: "30", label: "30 days", recommended: true },
        { value: "45", label: "45 days" },
        { value: "60", label: "60 days" },
      ],
    },
    {
      id: "SV10",
      key: "late_interest",
      section: "Fees",
      type: "single_choice",
      required: true,
      default_by: SIDE("1pm", "none"),
      text: "Late Payment. Is interest charged on overdue invoices?",
      options: [
        { value: "1pm", label: "1% per month – on undisputed overdue amounts" },
        { value: "none", label: "No interest" },
      ],
    },
    {
      id: "SV11",
      key: "fee_increase",
      section: "Fees",
      type: "single_choice",
      required: true,
      show_if: { any: [PLATFORM, { q: "SV8", in: ["retainer", "hourly", "retainer_success"] }] },
      default_by: SIDE("notice", "mutual"),
      text: "Fee Increases. Can the fees go up during the agreement?",
      help: "Pro Tip: Customers usually ask that fees only change by agreement; providers prefer to be able to raise them on notice for each renewal, with the customer free to leave.",
      options: [
        { value: "notice", label: "On notice for a renewal – the provider may increase them on 60 days' notice, and the Customer may then end it" },
        { value: "mutual", label: "Only by agreement – both sides in writing" },
      ],
    },

    /* ── service standards ── */
    {
      id: "SV12",
      key: "service_levels",
      section: "Service standards",
      type: "single_choice",
      required: true,
      show_if: PLATFORM,
      default_by: SIDE("efforts", "standard"),
      text: "Service Levels. Does the provider commit to uptime and support response times?",
      help: "Pro Tip: The usual commitment is 99.5% monthly availability and support on Singapore business days, with response targets by priority.",
      options: [
        { value: "standard", label: "Service levels – 99.5% monthly uptime, business-hours support and response targets" },
        { value: "efforts", label: "Efforts only – no uptime or response commitment" },
      ],
    },
    {
      id: "SV13",
      key: "service_changes",
      section: "Service standards",
      type: "single_choice",
      required: true,
      show_if: PLATFORM,
      default_by: SIDE("terminate", "consent"),
      text: "Changes to the Service. Can the provider change or withdraw parts of the service?",
      help: "Pro Tip: An unlimited right to change the service can be read down by a court. A middle ground lets the provider change it, but the customer may leave if the core service is materially reduced for more than 30 days.",
      options: [
        { value: "free", label: "Freely – on notice, without restriction" },
        { value: "terminate", label: "With an exit – the Customer may end the agreement if the core service is materially reduced for 30 days" },
        { value: "consent", label: "With consent – no material change without the Customer's consent, save for security, legal, maintenance or third-party reasons" },
      ],
    },
    {
      id: "SV15",
      key: "ip",
      section: "Service standards",
      type: "single_choice",
      required: true,
      show_if: PRO,
      default_by: SIDE("licence", "assign"),
      text: "Ownership of Deliverables. Who owns the deliverables?",
      help: "Pro Tip: Either way, the provider keeps the tools, templates and know-how it brought to the work.",
      options: [
        { value: "assign", label: "The Customer – they pass to the Customer once paid for" },
        { value: "licence", label: "The provider – the Customer gets a permanent licence to use them once paid for" },
      ],
    },

    /* ── risk ── */
    {
      id: "SV16",
      key: "cap",
      section: "Risk",
      type: "single_choice",
      required: true,
      default_by: SIDE("fees_12", "fees_total"),
      text: "Liability Cap. What is the most that can be claimed under the agreement?",
      help: "Pro Tip: The cap is a total for all claims together, not per claim. Fraud, death or personal injury are never capped.",
      options: [
        { value: "fees_12", label: "The fees paid in the 12 months before the claim" },
        { value: "fees_total", label: "All the fees paid under the agreement" },
        { value: "fixed", label: "A fixed amount" },
      ],
    },
    { id: "SV16a", key: "cap_amount", section: "Risk", type: "free_text", required: true, max_length: 20, show_if: { q: "SV16", eq: "fixed" }, text: "The cap amount?", placeholder: "e.g. 100,000", reject: [NUM] },
    {
      id: "SV17",
      key: "cap_who",
      section: "Risk",
      type: "single_choice",
      required: true,
      default_by: SIDE("provider", "both"),
      text: "Whose Liability is Capped?",
      options: [
        { value: "provider", label: "The Service Provider's only" },
        { value: "both", label: "Both sides' (the Customer's fees and indemnity excepted)" },
      ],
    },
    {
      id: "SV18",
      key: "indemnity",
      section: "Risk",
      type: "single_choice",
      required: true,
      default_by: SIDE("broad", "mutual"),
      text: "Indemnities. Who covers third-party claims?",
      help: "Pro Tip: A broad customer indemnity sits outside the cap. Customers usually ask to limit it to third-party claims from their own breach, and for the provider to cover claims that the services infringe someone else's IP.",
      options: [
        { value: "broad", label: "Customer, broad – for its breach, its data and materials, its use of the services and any breach of law" },
        { value: "narrow", label: "Customer, narrow – only third-party claims from its material breach, breach of law or infringement" },
        { value: "mutual", label: "Both – the Customer as above (narrow), and the provider for IP infringement by the services" },
      ],
    },
    {
      id: "SV19",
      key: "claims_period",
      section: "Risk",
      type: "single_choice",
      required: true,
      default_by: SIDE("6", "12"),
      text: "Time Limit for Claims. How long does the Customer have to bring a claim?",
      options: [
        { value: "6", label: "6 months after the event giving rise to it" },
        { value: "12", label: "12 months after the Customer knew, or ought to have known, of it" },
        { value: "none", label: "No contractual limit – the usual legal time limits apply" },
      ],
    },
    {
      id: "SV20",
      key: "insurance",
      section: "Risk",
      type: "single_choice",
      required: true,
      default_by: SIDE("none", "provider"),
      text: "Insurance. Must either side keep insurance?",
      options: [
        { value: "provider", label: "The Service Provider – professional indemnity and public liability cover" },
        { value: "customer", label: "The Customer – appropriate insurance for its use of the services" },
        { value: "none", label: "No insurance clause" },
      ],
    },
    {
      id: "SV21",
      key: "non_solicit",
      section: "Risk",
      type: "single_choice",
      required: true,
      default_by: SIDE("customer", "none"),
      text: "Non-Solicitation. May either side hire the other's staff?",
      help: "Pro Tip: A restriction lasts during the agreement and for 12 months after; someone who left the other side at least 6 months earlier is not caught.",
      options: [
        { value: "customer", label: "The Customer may not solicit the provider's staff" },
        { value: "mutual", label: "Neither side may solicit the other's staff" },
        { value: "none", label: "No restriction" },
      ],
    },

    /* ── ending it ── */
    {
      id: "SV22",
      key: "convenience",
      section: "Ending the agreement",
      type: "single_choice",
      required: true,
      default_by: { q: "SV1", map: { platform: "90", professional: "30" } },
      text: "Ending it Early. Can either side end the agreement without a reason?",
      help: "Pro Tip: For a platform subscription, early termination usually only takes effect after the initial term.",
      options: [
        { value: "30", label: "On 30 days' notice – either side, in writing" },
        { value: "90", label: "On 3 months' notice – either side, in writing" },
        { value: "none", label: "No early exit – only for breach or insolvency" },
      ],
    },
    {
      id: "SV23",
      key: "disputes",
      section: "Ending the agreement",
      type: "single_choice",
      required: true,
      default: "courts",
      text: "Disputes. Where are disputes decided?",
      help: "Pro Tip: The Singapore courts suit most domestic agreements. Arbitration in Singapore (SIAC) is private and easier to enforce abroad, but costs more.",
      options: [
        { value: "courts", label: "The Singapore courts", recommended: true },
        { value: "siac", label: "Arbitration in Singapore (SIAC)" },
      ],
    },
  ],
} as const;
