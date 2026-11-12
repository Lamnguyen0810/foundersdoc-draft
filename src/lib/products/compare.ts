import type { Faq } from "@/lib/templates/data";
import { SIGN_PLANS, signPriceRows } from "@/lib/billing/sign-plans";

/** 0223: FD Sign's own column follows lib/billing/sign-plans.ts (FD_SIGN_PRICING=on at build time). */
const LIVE = (process.env.FD_SIGN_PRICING ?? "").trim().toLowerCase() === "on";
const US = signPriceRows(LIVE);
const FREE_ANSWER = LIVE
  ? `Yes: every FD AI account can send ${SIGN_PLANS.free.requests} signing requests a month free. FD AI memberships include more (${SIGN_PLANS.basic.requests}, ${SIGN_PLANS.pro.requests} or unlimited), plus WhatsApp / SMS signing codes.`
  : "Yes, with a free FD AI account. While FD Sign is in its launch phase you can send up to 20 signing requests a day.";

/**
 * "Alternative" pages for FD Sign (0220): people search "DocuSign alternative", "HelloSign
 * alternative", "PandaDoc alternative". Rachel (11 Nov): bring them to FD Sign.
 *
 * Rules for these pages (keep them true):
 *   - Competitor prices and limits are only what each vendor's own pricing page says, with the date
 *     we read it (PRICES_CHECKED). Re-check before changing anything here.
 *   - Feature rows only list things both sides do, or FD Sign's own features; we never say a
 *     competitor lacks something unless their pricing page says so.
 *   - Names are used only to say what we compare with; no logos. The disclaimer says so.
 */
export const PRICES_CHECKED = "12 Nov 2026";

export interface Rival {
  /** /e-signature/<slug> */
  slug: string;
  /** as people search it */
  name: string;
  /** shown where the name needs explaining, e.g. "Dropbox Sign (formerly HelloSign)" */
  fullName: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  pricingUrl: string;
  /** rows of the price comparison: [what, FD Sign, them] */
  prices: Array<[string, string, string]>;
  /** why people look for another option, in fair words */
  why: { label: string; text: string }[];
  faqs: Faq[];
}

/** FD Sign as it is today (lib/sign: free with an FD AI account; FD_SIGN_DAILY_LIMIT requests a day, default 20). */
export const FD_SIGN_PRICE = "Free with an FD AI account";

/** Things FD Sign and each of these tools all do: shown with ✓ on both sides. */
export const BOTH: string[] = [
  "Signers sign without an account",
  "Signing order (one after another)",
  "Text boxes, checkboxes, initials and dates",
  "Reminders and status tracking",
  "Signed PDF with an audit trail",
];

/** FD Sign's own features, listed on their own (not claimed to be missing elsewhere). */
export const FD_SIGN_EXTRAS: { label: string; text: string }[] = [
  { label: "Signing-ready check", text: "Before you send, an AI check flags blanks, [placeholders], tracked changes, notes to draft and missing schedules, so nobody signs an unfinished version." },
  { label: "Edit before you send", text: "Remove or reorder pages, add a blank page, type or white-out text on the page, without another PDF tool." },
  { label: "Email code for every signer", text: "Each signer confirms a 6-digit code sent to their email before signing, recorded in the audit trail." },
  { label: "Draft it first with FD AI", text: "Make an NDA, term sheet or other agreement with FD AI from Founders Doc's lawyer-written wording, then send it straight to signing." },
  { label: "A lawyer one click away", text: "Founders Doc is a Singapore law practice: book a call if you want the document checked before it is signed." },
];

export const RIVALS: Rival[] = [
  {
    slug: "docusign-alternative",
    name: "DocuSign",
    fullName: "DocuSign",
    title: "DocuSign Alternative for Singapore — Free | FD Sign",
    description: "A free DocuSign alternative for Singapore businesses: send PDF or Word files for e-signature. Signers need no account; full audit trail.",
    h1: "A free DocuSign alternative for small teams",
    lead: "DocuSign is the best-known name in e-signatures, and it is built for large companies. If you send a few contracts a month and want them signed properly without per-envelope limits to watch, FD Sign does the job for free.",
    pricingUrl: "https://ecom.docusign.com/plans-and-pricing/esignature",
    prices: [
      ["Free plan", US.free, "No (free trial only)"],
      ["Entry price", US.entry, "US$11 a month (Personal, annual)"],
      ["Team price", US.team, "US$30–45 a user a month (Standard, Business Pro, annual)"],
      ["Sending limit", US.limit, "5 envelopes a month (Personal); 100 a user a year (Standard, Business Pro)"],
    ],
    why: [
      { label: "Envelope limits", text: "DocuSign's paid plans count envelopes: 5 a month on Personal and 100 a user a year on Standard and Business Pro, according to its pricing page." },
      { label: "Price per user", text: "Team plans are charged per user, which adds up when several people need to send." },
      { label: "More than you need", text: "Small teams often only need to upload, place boxes, send and get a signed copy with an audit trail." },
    ],
    faqs: [
      { q: "Is FD Sign really free?", a: FREE_ANSWER },
      { q: "Is an FD Sign e-signature as valid as a DocuSign one?", a: "For most business contracts in Singapore, the Electronic Transactions Act 2010 recognises electronic signatures whichever tool you use. What matters is showing who signed and that they meant to, which FD Sign's email code and audit trail record. A few documents, such as wills, still need a traditional signature." },
      { q: "Can I move my existing contracts over?", a: "There is nothing to move: upload the PDF or Word file you want signed and send it. Keep your DocuSign records where they are." },
      { q: "Do my signers need an account?", a: "No. They get a private link by email, confirm a code and sign on their phone or computer." },
    ],
  },
  {
    slug: "hellosign-alternative",
    name: "HelloSign",
    fullName: "Dropbox Sign (formerly HelloSign)",
    title: "HelloSign Alternative (Dropbox Sign) — Free | FD Sign",
    description: "A free HelloSign (Dropbox Sign) alternative: send PDF or Word files for e-signature. Signers need no account; signed PDF with audit trail.",
    h1: "A free HelloSign alternative",
    lead: "HelloSign is now Dropbox Sign. It is simple and well liked, and its paid plans are charged per user. FD Sign covers the same everyday signing for free, with a check that the document is ready before anyone signs.",
    pricingUrl: "https://sign.dropbox.com/products/dropbox-sign/pricing",
    prices: [
      ["Free plan", US.free, "Yes (limits on their site)"],
      ["Entry price", US.entry, "US$15 a month, or US$180 a year (Essentials, 1 user)"],
      ["Team price", US.team, "US$25 a user a month, or US$17.50 billed yearly (Standard, 2+ users)"],
      ["Sending limit", US.limit, "Unlimited signature requests on paid plans"],
    ],
    why: [
      { label: "Paying per user", text: "Dropbox Sign's team plan is charged per user, with a minimum of 2 users, according to its pricing page." },
      { label: "Checking before you send", text: "FD Sign adds a signing-ready check and page editing before sending, so the version people sign is the final one." },
      { label: "Made by lawyers", text: "FD Sign comes from Founders Doc, a Singapore law practice, so help with the document itself is one click away." },
    ],
    faqs: [
      { q: "Is HelloSign the same as Dropbox Sign?", a: "Yes. HelloSign was renamed Dropbox Sign after Dropbox bought it." },
      { q: "Is FD Sign really free?", a: FREE_ANSWER },
      { q: "Is an FD Sign e-signature legally valid in Singapore?", a: "For most business contracts, yes: the Electronic Transactions Act 2010 generally recognises electronic signatures. A few documents, such as wills, still need a traditional signature." },
      { q: "Do my signers need an account?", a: "No. They get a private link by email, confirm a code and sign on their phone or computer." },
    ],
  },
  {
    slug: "pandadoc-alternative",
    name: "PandaDoc",
    fullName: "PandaDoc",
    title: "PandaDoc Alternative for E-Signature — Free | FD Sign",
    description: "A free PandaDoc alternative for signing contracts: upload a PDF or Word file and get a signed PDF with an audit trail. No seats to buy.",
    h1: "A free PandaDoc alternative for signing",
    lead: "PandaDoc is a full proposals and documents platform for sales teams. If what you need is to get contracts signed, without seats or a sales workflow, FD Sign does that for free.",
    pricingUrl: "https://www.pandadoc.com/pricing/",
    prices: [
      ["Free plan", US.free, "Yes, 5 documents a month"],
      ["Entry price", US.entry, "US$19 a seat a month (Starter, annual)"],
      ["Team price", US.team, "US$49 a seat a month (Business, annual)"],
      ["Sending limit", US.limit, "5 a month on Free; unlimited e-signatures on Starter and up"],
    ],
    why: [
      { label: "Built for sales", text: "PandaDoc focuses on proposals, quotes, CRM links and deal rooms. Many teams only need the signing part." },
      { label: "Seats", text: "PandaDoc's paid plans are charged per seat, according to its pricing page." },
      { label: "Legal documents", text: "FD Sign sits next to FD AI, which drafts NDAs, term sheets and other agreements from Founders Doc's lawyer-written wording." },
    ],
    faqs: [
      { q: "Is FD Sign really free?", a: FREE_ANSWER },
      { q: "Can I make the document in FD Sign?", a: "Draft it with FD AI (NDA, term sheet, employment contract and more), or upload your own PDF or Word file, then send it for signing." },
      { q: "Is an FD Sign e-signature legally valid in Singapore?", a: "For most business contracts, yes: the Electronic Transactions Act 2010 generally recognises electronic signatures. A few documents, such as wills, still need a traditional signature." },
      { q: "Do my signers need an account?", a: "No. They get a private link by email, confirm a code and sign on their phone or computer." },
    ],
  },
];

export const rivalBySlug = (slug: string) => RIVALS.find((r) => r.slug === slug);
