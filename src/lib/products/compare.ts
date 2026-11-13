import type { Faq } from "@/lib/templates/data";
import { draftHref } from "@/lib/doc-links";
import { FREE_SIGN, FREE_SIGN_DAYS, SIGN_PLANS, signPriceRows, signPricingOn } from "@/lib/billing/sign-plans";

/**
 * ⭐ ONE COMPARISON PAGE (0226, replaces 0220's three): /e-signature/docusign-alternatives.
 * "DocuSign alternatives" is the search with the most people behind it; the page also answers
 * "HelloSign alternative" and "PandaDoc alternative" in its own sections (#dropbox-sign, #pandadoc),
 * and the old three addresses redirect here (next.config.ts).
 *
 * Rules for this page (keep them true and fair):
 *   - Each tool's prices and limits are only what its own pricing page says, with the date we read it
 *     (PRICES_CHECKED). Re-check before changing anything here.
 *   - Every tool gets its strengths first ("best for"); we never say a tool lacks something unless its
 *     pricing page says so. No logos; the note at the end says the names are only used to compare.
 *   - FD Sign's own column follows lib/billing/sign-plans.ts (FD_SIGN_PRICING=on at build time).
 */
export const PRICES_CHECKED = "12 Nov 2026";

const LIVE = signPricingOn();
const US = signPriceRows(LIVE);
/** paid plans only once FD_SIGN_PRICING=on (exported for the page's buttons) */
export const SIGN_LIVE = LIVE;

/** The address, as the search it answers (like the template pages' searchPhrase). */
export const COMPARE_SLUG = "docusign-alternatives";
export const COMPARE_PATH = `/e-signature/${COMPARE_SLUG}`;

export const COMPARE = {
  searchPhrase: "DocuSign alternatives",
  title: "Best DocuSign Alternatives in 2026, Compared | FD Sign",
  description: LIVE
    ? "DocuSign, Dropbox Sign (HelloSign), PandaDoc and FD Sign compared: prices, sending limits and who each suits. FD Sign is half DocuSign's price."
    : "DocuSign, Dropbox Sign (HelloSign), PandaDoc and FD Sign compared: prices, sending limits and who each suits, from each tool's own pricing page.",
  h1: "The best DocuSign alternatives in 2026, compared",
  lead:
    "DocuSign, Dropbox Sign (formerly HelloSign), PandaDoc and FD Sign all get contracts signed online, and each is built for a different kind of team. " +
    "Here is what each one costs, what it does best, and how to pick the right one for you.",
};

export interface Tool {
  /** section id on the page: /e-signature/docusign-alternatives#<id> */
  id: string;
  name: string;
  /** shown where the name needs explaining */
  fullName: string;
  /** the search this tool's section answers ("HelloSign alternative") */
  searchPhrase: string;
  pricingUrl: string | null;
  bestFor: string;
  /** what it does well, in fair words */
  strengths: string;
  /** why some teams look at other tools, from its own pricing page */
  considerations: string[];
  /** when FD Sign may suit better */
  fdSignFits: string;
  prices: { free: string; entry: string; team: string; limit: string; per: string };
}

export const FD_SIGN: Tool = {
  id: "fd-sign",
  name: "FD Sign",
  fullName: "FD Sign by Founders Doc",
  searchPhrase: "FD Sign",
  pricingUrl: null,
  bestFor: "Startups and small teams in Singapore that want contracts drafted and signed in one place, at a lower price.",
  strengths: "Upload a PDF or Word file, check it is ready to sign, place the boxes and send. Signers need no account and confirm a code before signing.",
  considerations: [],
  fdSignFits: "",
  prices: { free: US.free, entry: US.entry, team: US.team, limit: US.limit, per: "Per account (no seats)" },
};

export const TOOLS: Tool[] = [
  {
    id: "docusign",
    name: "DocuSign",
    fullName: "DocuSign",
    searchPhrase: "DocuSign alternative",
    pricingUrl: "https://ecom.docusign.com/plans-and-pricing/esignature",
    bestFor: "Large companies that need deep integrations, admin controls and a name everyone knows.",
    strengths: "The best-known name in e-signatures, with a wide range of integrations and enterprise features.",
    considerations: [
      "Paid plans count envelopes: 5 a month on Personal and 100 a user a year on Standard and Business Pro, according to its pricing page.",
      "Team plans are charged per user, which adds up when several people need to send.",
    ],
    fdSignFits: "You send a handful of contracts a month and want them signed properly without watching an envelope count.",
    prices: {
      free: "No (free trial only)",
      entry: "US$11 a month (Personal, annual)",
      team: "US$30–45 a user a month (Standard, Business Pro, annual)",
      limit: "5 envelopes a month (Personal); 100 a user a year (Standard, Business Pro)",
      per: "Per user",
    },
  },
  {
    id: "dropbox-sign",
    name: "Dropbox Sign",
    fullName: "Dropbox Sign (formerly HelloSign)",
    searchPhrase: "HelloSign alternative",
    pricingUrl: "https://sign.dropbox.com/products/dropbox-sign/pricing",
    bestFor: "Teams already on Dropbox who want simple, familiar signing.",
    strengths: "Simple and well liked, with a free plan and unlimited signature requests on its paid plans. HelloSign was renamed Dropbox Sign after Dropbox bought it.",
    considerations: ["The team plan is charged per user, with a minimum of 2 users, according to its pricing page."],
    fdSignFits: "You want one price for the whole account, plus a check that the document is ready before anyone signs.",
    prices: {
      free: "Yes (limits on their site)",
      entry: "US$15 a month, or US$180 a year (Essentials, 1 user)",
      team: "US$25 a user a month, or US$17.50 billed yearly (Standard, 2+ users)",
      limit: "Unlimited signature requests on paid plans",
      per: "Per user",
    },
  },
  {
    id: "pandadoc",
    name: "PandaDoc",
    fullName: "PandaDoc",
    searchPhrase: "PandaDoc alternative",
    pricingUrl: "https://www.pandadoc.com/pricing/",
    bestFor: "Sales teams that build proposals and quotes, with CRM links and approvals.",
    strengths: "A full documents platform for sales: proposals, quotes, templates, CRM integrations and e-signatures together.",
    considerations: ["Paid plans are charged per seat, according to its pricing page.", "Many teams only need the signing part, not the sales workflow."],
    fdSignFits: "What you need is to get contracts signed, without seats or a sales workflow.",
    prices: {
      free: "Yes, 5 documents a month",
      entry: "US$19 a seat a month (Starter, annual)",
      team: "US$49 a seat a month (Business, annual)",
      limit: "5 a month on Free; unlimited e-signatures on Starter and up",
      per: "Per seat",
    },
  },
];

/** The price table's rows: [label, key] */
export const PRICE_ROWS: Array<[string, keyof Tool["prices"]]> = [
  ["Free plan", "free"],
  ["Entry price", "entry"],
  ["Team price", "team"],
  ["Sending limit", "limit"],
  ["Priced", "per"],
];

/** Things all four do: shown with ✓. */
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
  { label: "A code for every signer", text: "Each signer confirms a 6-digit code before signing, recorded in the audit trail." },
  { label: "Draft it first with FD AI", text: "Make an NDA, term sheet or other agreement with FD AI from Founders Doc's lawyer-written wording, then send it straight to signing." },
  { label: "A lawyer one click away", text: "Founders Doc is a Singapore law practice: book a call if you want the document checked before it is signed." },
];

/** How to choose, in four questions. */
export const CHOOSE: { label: string; text: string }[] = [
  { label: "How many people send?", text: "If several people send, a per-account price (FD Sign) usually costs less than per-user or per-seat plans." },
  { label: "How many contracts a month?", text: "Count what you really send. DocuSign counts envelopes; Dropbox Sign and PandaDoc paid plans don't; FD Sign plans have a monthly number of requests." },
  { label: "Do you need a sales workflow?", text: "Proposals, quotes and CRM links point to PandaDoc. Plain contract signing doesn't need them." },
  { label: "Do you need the document too?", text: "If you also need the contract written, FD Sign sits next to FD AI and Founders Doc's lawyers." },
];

const PRICE_ANSWER = LIVE
  ? `Your first ${FREE_SIGN_DAYS} days are free, up to ${FREE_SIGN} signing requests. After that, FD Sign plans start at S$${(SIGN_PLANS.sign_personal.amountCents! / 100).toFixed(2)} a month: half of DocuSign's price, with more requests. FD AI memberships include it too.`
  : "FD Sign is free with an FD AI account while it is in its launch phase, up to 20 signing requests a day.";

export const FAQS: Faq[] = [
  { q: "What is the best DocuSign alternative?", a: "It depends on your team. Dropbox Sign suits teams already on Dropbox, PandaDoc suits sales teams sending proposals, and FD Sign suits startups and small teams in Singapore that want a lower price per account and help with the document itself." },
  { q: "Is HelloSign the same as Dropbox Sign?", a: "Yes. HelloSign was renamed Dropbox Sign after Dropbox bought it." },
  { q: "How much does FD Sign cost?", a: PRICE_ANSWER },
  { q: "Is an FD Sign e-signature as valid as a DocuSign one?", a: "For most business contracts in Singapore, the Electronic Transactions Act 2010 recognises electronic signatures whichever tool you use. What matters is showing who signed and that they meant to, which FD Sign's signing code and audit trail record. A few documents, such as wills, still need a traditional signature." },
  { q: "Can I move my contracts over from DocuSign?", a: "There is nothing to move: upload the PDF or Word file you want signed and send it. Keep your existing records where they are." },
  { q: "Do my signers need an account?", a: "No, with any of these tools. With FD Sign they get a private link, confirm a code and sign on their phone or computer." },
];

/** Related pages, linked by the words people search (same as the template pages' "Related templates"). */
export const RELATED: { href: string; title: string; text: string }[] = [
  { href: "/e-signature", title: "FD Sign: e-signature for PDF and Word", text: "how sending for signature works, step by step" },
  { href: "/templates/nda/singapore", title: "Free NDA template Singapore", text: "the agreement most often signed first" },
  { href: "/templates/employment-contract/singapore", title: "Employment contract template Singapore", text: "draft it, then send it for signing" },
  { href: "/templates/term-sheet/singapore", title: "Term sheet template Singapore", text: "agree the deal before the investment documents" },
  { href: draftHref("nda"), title: "Draft a non-disclosure agreement with FD AI", text: "ready to send for signing in minutes" },
  { href: "/fd-consult", title: "Book a call with a Singapore lawyer", text: "have the document checked before it is signed" },
];
