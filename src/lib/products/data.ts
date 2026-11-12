import type { Faq } from "@/lib/templates/data";
import { FREE_SIGN } from "@/lib/billing/sign-plans";

/** 0224: FD Sign is paid once FD_SIGN_PRICING=on (lib/billing/sign-plans.ts); until then it is free (Beta). */
const SIGN_PAID = (process.env.FD_SIGN_PRICING ?? "").trim().toLowerCase() === "on";

/**
 * The public product pages (0197): FD Sign and the ESOP dashboard can only be
 * opened after signing in, so search engines never see them. These two pages
 * describe them for people searching ("e-signature Singapore", "ESOP management
 * software") and lead to sign-up. Founders Doc's own wording; the legal points are
 * general and were kept cautious; a Founders Doc lawyer checks them before they go live.
 */
export interface Product {
  slug: string;
  name: string;
  /** inside a sentence: "the ESOP dashboard" */
  inSentence?: string;
  kicker: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  cta: { href: string; label: string };
  second: { href: string; label: string };
  small: string;
  features: { label: string; text: string }[];
  stepsTitle: string;
  steps: { t: string; d: string }[];
  pointsTitle: string;
  points: { label: string; text: string }[];
  faqs: Faq[];
  related: { href: string; label: string }[];
  /** schema.org applicationCategory */
  category: string;
}

export const PRODUCTS: Record<"sign" | "esop", Product> = {
  sign: {
    slug: "e-signature",
    name: "FD Sign",
    kicker: "FD Sign · e-signature",
    title: SIGN_PAID ? "E-Signature at Half DocuSign's Price | FD Sign" : "Free E-Signature for Singapore Businesses | FD Sign",
    description: SIGN_PAID
      ? "Send PDF or Word files for e-signature at half DocuSign's price. Signers need no account: a private link, a one-time code, an audit trail."
      : "Send PDF or Word files for e-signature in minutes. Signers need no account: a private link, an email code and an audit trail. By Founders Doc. Start free.",
    h1: "Sign documents online with FD Sign",
    lead: "Upload a contract, add who signs and in what order, and send. Each person signs on their phone or computer, and everyone gets the signed copy, with a full audit trail.",
    cta: { href: "/fd-sign/new", label: "Send a document for signing" },
    second: { href: "/templates", label: "Or draft one first with FD AI ›" },
    small: SIGN_PAID ? `First ${FREE_SIGN} signing requests free · then half DocuSign's price` : "Free to start with an FD AI account · signers need no account",
    features: [
      { label: "Signing-ready check (new)", text: "Before you send, FD Sign's AI check flags blanks, [placeholders], tracked changes, notes to draft, missing schedules and wording that needs wet ink, so nobody signs an unfinished version." },
      { label: "PDF or Word", text: "Upload a PDF or a Word file up to 10 MB, or send a draft you made with FD AI straight to signing." },
      { label: "Signers need no account", text: "Each person gets a private link by email and confirms a 6-digit code before signing, so you know it is really them." },
      { label: "Order and copies", text: "Choose who signs first and who just gets a copy. The next person is emailed as soon as the one before has signed." },
      { label: "Fields placed for you", text: "Signature, initials, date, name, text and tick boxes go on the signature lines by themselves; drag any of them to adjust." },
      { label: "Audit trail", text: "Every signed PDF ends with a page recording who signed, when, from which IP address and browser, and the document's fingerprint." },
      { label: "My documents", text: "Waiting for me, waiting for others, completed: with folders, search and one-click reminders, so signed documents are easy to find." },
    ],
    stepsTitle: "How it works",
    steps: [
      { t: "Upload", d: "A PDF, a Word file or an FD AI draft." },
      { t: "Add the signers", d: "Names, emails and the order they sign in. The boxes are placed for you." },
      { t: "Send and track", d: "Everyone signs from the email; you see each step and get the signed copy." },
    ],
    pointsTitle: "E-signatures in Singapore",
    points: [
      { label: "Legally recognised", text: "Singapore's Electronic Transactions Act 2010 generally recognises electronic signatures, so most business contracts can be signed online." },
      { label: "Proof of who signed", text: "What matters is showing who signed and that they meant to. FD Sign's email code and audit trail record both." },
      { label: "A few exceptions", text: "Some documents, such as wills and certain property documents, still need a traditional signature or formalities. Check before you use an e-signature for them." },
    ],
    faqs: [
      { q: "Is an e-signature legally binding in Singapore?", a: "For most business contracts, yes: Singapore's Electronic Transactions Act 2010 generally recognises electronic signatures. A few documents, such as wills, still need a traditional signature." },
      { q: "Do the people signing need an account?", a: "No. They get a private link by email, confirm a code sent to the same email, and sign. Only the sender uses an FD AI account." },
      { q: "What can I send for signing?", a: "A PDF or a Word file up to 10 MB, or a document you drafted with FD AI. Word files are converted to PDF first, so check the layout before you send." },
      { q: "Can FD Sign check a contract before I send it?", a: "Yes. The signing-ready check reads your PDF or Word file and lists anything that should be fixed first, such as blanks, placeholders, tracked changes, notes to draft or missing schedules. It is a checklist, not legal advice." },
      { q: "How do I prove who signed?", a: "Download the signed PDF with its audit trail: it records each signer's email, the time, IP address and browser, and a fingerprint of the document." },
      SIGN_PAID
        ? { q: "How much does FD Sign cost?", a: `Your first ${FREE_SIGN} signing requests are free. After that, FD Sign plans are exactly half of DocuSign's price, per account rather than per user, with more signing requests. FD AI memberships include FD Sign too.` }
        : { q: "Is FD Sign free?", a: "You can start free with an FD AI account. Founders Doc clients also use it for documents such as ESOP option certificates." },
    ],
    related: [
      { href: "/esop-software", label: "ESOP dashboard" },
      { href: "/templates", label: "Free legal templates" },
      { href: "/draft", label: "Draft with FD AI" },
    ],
    category: "BusinessApplication",
  },
  esop: {
    slug: "esop-software",
    name: "ESOP dashboard",
    inSentence: "the ESOP dashboard",
    kicker: "ESOP dashboard",
    title: "ESOP Management Software Singapore | Founders Doc",
    description:
      "Track option holders, vesting dates and certificates in one dashboard, with approvals, vesting alerts and e-signing built in. By Founders Doc's lawyers.",
    h1: "Run your employee share option plan in one place",
    lead: "Every option holder, grant, vesting date and certificate, kept up to date for you. The right people approve, the right people are reminded, and every document is one click away.",
    cta: { href: "/esop?new=1", label: "Create your ESOP dashboard" },
    second: { href: "/contact", label: "Or let Founders Doc set it up ›" },
    small: "Free to start · invite your team after",
    features: [
      { label: "Register of option holders", text: "Each holder's grants, including top-ups, options per tranche, what has vested and what is next, for active holders and leavers." },
      { label: "Vesting worked out for you", text: "Enter each batch's vesting start once; every tranche date follows, with the next vesting and who is in it always on screen." },
      { label: "Alerts before each vesting", text: "Choose who is emailed and when: four weeks, two weeks, one week before, on the day, or any number of days." },
      { label: "Approvals", text: "Choose your approvers. They approve the issue of option certificates on the dashboard or straight from an email, and the date and approver are recorded." },
      { label: "Certificates and signing", text: "Certificates are numbered in sequence and can be signed online with FD Sign, then filed on each holder's record." },
      { label: "All the documents", text: "ESOP rules, resolutions, Letters of Grant and option certificates in one place, searchable, and downloadable as a zip." },
      { label: "Access you control", text: "Admins, editors and view-only access for your team; on Premium, each holder can see their own options and nobody else's." },
    ],
    stepsTitle: "Getting started",
    steps: [
      { t: "Create your dashboard", d: "Sign in with an FD AI account and name your company." },
      { t: "Add batches and holders", d: "One by one, or import them from a spreadsheet." },
      { t: "Choose approvers and alerts", d: "Who approves, who can open it, and who is reminded before each vesting." },
    ],
    pointsTitle: "What a well-run ESOP keeps track of",
    points: [
      { label: "The plan and its approvals", text: "The ESOP rules and the board or shareholder resolutions that set up the plan and the option pool." },
      { label: "Each grant", text: "A Letter of Grant for each holder, with the number of options, the vesting schedule and any top-up grants." },
      { label: "Vesting and certificates", text: "Which tranches have vested, and an option certificate for each, numbered and signed." },
      { label: "Leavers", text: "What a good or bad leaver keeps under the plan rules, recorded on the day they leave." },
    ],
    faqs: [
      { q: "Who is the ESOP dashboard for?", a: "Companies with an employee share option plan, from a first handful of holders to many batches, and the lawyers or finance team who look after it." },
      { q: "Can my team use it?", a: "Yes. Add people by email as Admin, Editor or View only, and choose who approves certificates and who gets vesting alerts." },
      { q: "Can employees see their own options?", a: "On Premium, holder access lets each option holder sign in and see only their own options, vesting dates and documents." },
      { q: "Can Founders Doc set it up for us?", a: "Yes. Founders Doc can load your existing register and documents and run the vesting process with you. Contact us to arrange it." },
      { q: "Does it replace legal advice on the plan?", a: "No. It keeps your plan's records and process in order. For the plan rules themselves, or a leaver dispute, talk to a Founders Doc lawyer." },
    ],
    related: [
      { href: "/e-signature", label: "FD Sign e-signature" },
      { href: "/fd-consult", label: "Talk to a lawyer" },
      { href: "/templates", label: "Free legal templates" },
    ],
    category: "BusinessApplication",
  },
};
