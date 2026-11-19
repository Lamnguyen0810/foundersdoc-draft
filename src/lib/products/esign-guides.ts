import type { Faq } from "@/lib/templates/data";
import { FREE_TEXT, SIGN_PLANS } from "@/lib/billing/sign-plans";
import { COMPARE_PATH } from "./compare";
import { ETA_URL, FD_SIGN_RECORD, LAW_PATH } from "./esign-law";

/**
 * FD Sign guides (0242, 18 Nov 2026): three pages for searches people make before they choose
 * an e-signature tool. Each is data: /e-signature/<slug> draws it (app/e-signature/[guide]).
 *
 * The same care as the law page (esign-law.ts):
 *   - what FD Sign does is described as it works today (the send flow, the email code, the audit
 *     trail), never more. FD Sign is an electronic signature tool, not a certificate-based
 *     digital signature service, and is never called a "secure electronic signature";
 *   - every legal point is tied to a provision read on Singapore Statutes Online on GUIDES_CHECKED:
 *     Electronic Transactions Act 2010 s 5, s 8, s 18, s 19, First Schedule, Third Schedule
 *     (paras 1 and 3); Wills Act 1838 s 6; Companies Act 1967 s 41B;
 *   - a guide, not legal advice. A Founders Doc lawyer checks each page before it goes live.
 */

export const GUIDES_CHECKED = "18 November 2026";
/** For the sitemap. */
export const GUIDES_UPDATED = "2026-11-18";

const sgd = (c: number | null) => `S$${((c ?? 0) / 100).toFixed(2).replace(/\.00$/, "")}`;
const FROM = `${sgd(SIGN_PLANS.sign_personal.amountCents)} a month`;

export interface GuideImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface GuideSection {
  id: string;
  h2: string;
  intro?: string;
  /** Numbered steps, each with an optional screen. */
  steps?: { title: string; text: string; image?: GuideImage }[];
  /** Cards: a label and a line. `gold` draws the law border. */
  points?: { label: string; text: string }[];
  gold?: boolean;
  list?: string[];
  paras?: string[];
  /** One picture for the section, with a line under it. */
  image?: GuideImage;
  caption?: string;
  note?: string;
}

export interface Guide {
  slug: string;
  /** Breadcrumb and link text. */
  short: string;
  kicker: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  /** Shown under the buttons: what the page is based on. */
  basis?: string;
  sections: GuideSection[];
  faqs: Faq[];
  band: { title: string; text: string };
}

const IMG = (name: string, alt: string, width: number, height: number): GuideImage => ({ src: `/e-signature/guide/${name}.webp`, alt, width, height });

export const GUIDES: Guide[] = [
  {
    slug: "how-to-sign-a-pdf-online",
    short: "How to sign a PDF online",
    kicker: "FD Sign · Step by step",
    title: "How to Sign a PDF Online: Step by Step | FD Sign",
    description: "Sign a PDF or Word document online in minutes, or send it to others to sign. Each step with real screens. No app or account needed for signers.",
    h1: "How to sign a PDF online",
    lead: "To sign a PDF online, upload it to an e-signature tool, add who signs, place the signature boxes and send. Each signer opens a private link, confirms a code sent to their email and signs on any device. Here is how it works in FD Sign, step by step.",
    sections: [
      {
        id: "send",
        h2: "Send a PDF for signature in four steps",
        steps: [
          {
            title: "Upload the file and check it is ready",
            text: "Upload a PDF or Word file. FD Sign's signing-ready check reads it first and flags what should not be signed yet: blanks, placeholders, notes left in the draft and tracked changes. Fix them, or carry on.",
            image: IMG("check-document", "FD Sign's signing-ready check showing a draft agreement marked \"Not ready to sign yet\" with four findings listed", 1200, 735),
          },
          {
            title: "Add who signs",
            text: "Type each signer's name and email, and set the order they sign in. Signers do not need an account. Need to sign it yourself? Press \"Add me\".",
            image: IMG("add-signers", "The \"Who needs to sign?\" step in FD Sign with one signer's name, email and role filled in", 1100, 400),
          },
          {
            title: "Place the signature boxes",
            text: "FD Sign finds the signature block and puts each signer's box on the right line. Drag a box to move it, and add boxes for dates, names, initials, text or a tick where you need them.",
            image: IMG("place-signature-box", "A signature box placed on the signature line of an agreement in FD Sign", 800, 490),
          },
          {
            title: "Review and send",
            text: "See the email your signers will get, add a short message and send. Each signer gets their own private link.",
            image: IMG("review-and-send", "FD Sign's \"Check and send\" step with the signing order, a message and a preview of the email to the signer", 1200, 735),
          },
        ],
      },
      {
        id: "sign",
        h2: "How the other person signs",
        intro: "No app and no account. It works on a phone, a tablet or a computer.",
        steps: [
          {
            title: "Open the link and confirm the code",
            text: "The signer opens the link in their email. FD Sign sends a 6-digit code to the same address, which they enter to show the email is theirs. The code lasts 10 minutes.",
            image: IMG("phone-confirm-code", "A phone showing FD Sign asking the signer to confirm a 6-digit code sent to their email", 780, 660),
          },
          {
            title: "Draw or type a signature",
            text: "The signer reads the document, agrees to sign electronically and draws their signature with a finger or types it.",
            image: IMG("phone-draw-signature", "A phone showing a signature being drawn in FD Sign's \"Adopt your signature\" box", 780, 750),
          },
          {
            title: "Finish",
            text: "They press Finish. When everyone has signed, each person gets the signed PDF by email.",
            image: IMG("signed-document", "The signature blocks of a signed agreement, with the signer's drawn signature on the signature line", 800, 260),
          },
        ],
      },
      {
        id: "proof",
        h2: "What you get back",
        intro: "The signed PDF comes with an audit trail page, so you can show who signed, when, and which version.",
        points: FD_SIGN_RECORD,
        image: IMG("audit-trail", "An FD Sign audit trail page listing the document, its SHA-256 fingerprint and each signing step with its time", 520, 700),
        caption: "The audit trail page attached to a signed PDF (sample names).",
      },
      {
        id: "before",
        h2: "Before you send: a short checklist",
        list: [
          "Send the final version only: no blanks, placeholders or tracked changes.",
          "Make sure the right person signs, with the authority to sign for their company.",
          "Check the document can be e-signed. In Singapore, wills, deeds between parties, powers of attorney and documents that sell or transfer land still need a traditional signature.",
          "If the contract itself says it must be signed in ink, follow it.",
        ],
      },
    ],
    faqs: [
      { q: "Is it free to sign a PDF online?", a: `With FD Sign, the people you send a document to never pay and need no account. For the sender: ${FREE_TEXT.charAt(0).toLowerCase() + FREE_TEXT.slice(1)}, then plans from ${FROM}.` },
      { q: "Can I sign a PDF on my phone?", a: "Yes. Open the link from the email, enter the code and sign with your finger. There is no app to install." },
      { q: "Can I send a Word document for signing?", a: "Yes. Upload a Word or PDF file. The signed copy comes back as a PDF with its audit trail." },
      { q: "Is a PDF signed online legally valid?", a: "For most contracts in Singapore, yes. The Electronic Transactions Act 2010 says an electronic signature meets a legal need for a signature when the method identifies the signer and shows they meant to sign. A short list of documents, such as wills and land transfers, is excluded." },
      { q: "How do I know the right person signed?", a: "Each signer gets a private link at the email address you entered and must confirm a 6-digit code sent to that address before signing. The audit trail records each step with its time, IP address and browser." },
      { q: "Can several people sign the same PDF?", a: "Yes. Add each signer and set the order. Each one is emailed when the person before them has signed, and everyone gets the signed copy at the end." },
    ],
    band: { title: "Send your first document for signing", text: `${FREE_TEXT}. Signers need no account: a private link, an email code and an audit trail on the signed copy.` },
  },
  {
    slug: "electronic-signature-vs-digital-signature",
    short: "Electronic vs digital signature",
    kicker: "FD Sign · Explained",
    title: "Electronic Signature vs Digital Signature | FD Sign",
    description: "An electronic signature is any signature in electronic form. A digital signature is one kind, made with cryptographic keys. What Singapore law says.",
    h1: "Electronic signature vs digital signature: what is the difference?",
    lead: "An electronic signature is any way of signing in electronic form, such as a drawn or typed name. A digital signature is one kind of electronic signature, created with a pair of cryptographic keys and usually backed by a certificate. Most business contracts are signed with ordinary electronic signatures.",
    basis: "Electronic Transactions Act 2010",
    sections: [
      {
        id: "electronic",
        h2: "What an electronic signature is",
        points: [
          { label: "What it looks like", text: "A signature drawn with a finger or mouse, a typed name, or a click on \"I agree\". The form does not matter; the method does." },
          { label: "How it shows who signed", text: "By evidence around the signature: the email the link was sent to, a code confirmed by the signer, the time, and a record of each step." },
          { label: "Where it is used", text: "Everyday business documents: NDAs, employment and contractor agreements, sales contracts, loan and shareholders' agreements." },
          { label: "The legal test", text: "It meets a legal need for a signature if the method identifies the signer, shows their intention, and is reliable enough for the purpose (section 8)." },
        ],
      },
      {
        id: "digital",
        h2: "What a digital signature is",
        points: [
          { label: "How it is made", text: "With a key pair: a private key held by the signer creates the signature, and a matching public key lets anyone verify it." },
          { label: "What it proves", text: "That the signature was made with the signer's private key, and that the record has not been changed since. The Act's Third Schedule defines it this way." },
          { label: "Certificates", text: "A certificate issued by a certification authority links the public key to a named person, so the reader knows whose key it is." },
          { label: "Where it is used", text: "Where a law, regulator or counterparty asks for certificate-based signing, and in services built on a national digital identity, such as Sign with Singpass." },
        ],
        gold: true,
      },
      {
        id: "law",
        h2: "What Singapore law says about each",
        paras: [
          "The Electronic Transactions Act 2010 does not ask for a particular kind of signature. Under section 8, any electronic signature can satisfy a legal requirement for a signature if the method identifies the signer, shows their intention and is as reliable as appropriate for the purpose, or is proven to have done so.",
          "A secure electronic signature (section 18) goes further: a specified or agreed commercially reasonable security procedure verifies that it was unique to the signer, identified them, was under their sole control and is linked to the record so that any change would invalidate it. In court it is then presumed to be the signer's, made with the intention of signing (section 19).",
          "Under the Third Schedule, a digital signature is treated as a secure electronic signature when it was created while a valid certificate was in force, is verified by the public key in that certificate, and the certificate is considered trustworthy. Other electronic signatures are not presumed: if one is ever disputed, it is proved with evidence, such as an audit trail.",
        ],
      },
      {
        id: "which",
        h2: "Which one do you need?",
        points: [
          { label: "Most contracts", text: "An ordinary electronic signature with good evidence of who signed is what most businesses use, and what most e-signature tools provide." },
          { label: "When a rule asks for more", text: "If a law, a regulator, a tender or the other side requires a digital signature or a named certificate, use a service that provides one." },
          { label: "When neither will do", text: "Wills, deeds between parties, powers of attorney and documents that sell or transfer land are outside the Act's e-signature rules and are signed in ink." },
        ],
      },
      {
        id: "fdsign",
        h2: "What FD Sign uses",
        intro: "FD Sign is an electronic signature tool. It is not a certificate-based digital signature service. For every signature it records:",
        points: FD_SIGN_RECORD,
      },
    ],
    faqs: [
      { q: "Is a digital signature more valid than an electronic signature?", a: "Both can be valid. The difference is in proof: a secure electronic signature, which a certificate-based digital signature can be, is presumed in court to be the signer's. An ordinary electronic signature has no presumption and is proved with evidence, such as who received the link, who confirmed the code and when." },
      { q: "Are e-signature and digital signature the same thing?", a: "No, though people often use the words loosely. Every digital signature is an electronic signature, but most electronic signatures are not digital signatures." },
      { q: "Do I need a digital certificate to sign a contract?", a: "Not for most contracts. Singapore's Electronic Transactions Act does not require a certificate. You need one only where a specific law, regulator or counterparty asks for it." },
      { q: "Is a typed name an electronic signature?", a: "It can be. What matters is whether the method identifies the signer, shows they meant to sign and is reliable enough. A typed name on its own is weaker evidence than a signature backed by a confirmed email and an audit trail." },
      { q: "Is FD Sign a digital signature?", a: "No. FD Sign is an electronic signature tool: signers are identified by a private link and a code sent to their email, and every step is recorded in an audit trail attached to the signed PDF." },
    ],
    band: { title: "Sign your next contract with FD Sign", text: "Electronic signatures with the evidence to back them: a private link, an email code, a fingerprint of the file and an audit trail on every signed PDF." },
  },
  {
    slug: "do-e-signatures-need-a-witness",
    short: "Do e-signatures need a witness?",
    kicker: "FD Sign · Singapore law",
    title: "Do E-Signatures Need a Witness in Singapore? | FD Sign",
    description: "Most contracts need no witness, on paper or signed electronically. Which documents do need one in Singapore, and why those are usually signed in ink.",
    h1: "Do e-signatures need a witness in Singapore?",
    lead: "Usually not. Most contracts in Singapore are valid without a witness, whether they are signed on paper or electronically. The documents that do need a witness, such as wills and many deeds, are mostly the same ones that Singapore's e-signature law does not cover, so they are signed in ink.",
    basis: "Electronic Transactions Act 2010, Wills Act 1838 and Companies Act 1967",
    sections: [
      {
        id: "no-witness",
        h2: "Contracts that need no witness",
        intro: "An ordinary contract needs agreement, not a witness. Unless the contract is made as a deed, or says itself that it must be witnessed, these are signed without one:",
        list: ["Non-disclosure agreements", "Employment and contractor agreements", "Services and sales agreements", "Loan agreements", "Shareholders' and investment agreements"],
        note: "A witness is evidence that the person named really signed. When you e-sign, the audit trail gives that evidence instead.",
      },
      {
        id: "witness",
        h2: "Documents that do need a witness",
        points: [
          { label: "Wills", text: "A will must be signed in the presence of two or more witnesses present at the same time, who then sign it in the presence of the person making it (Wills Act 1838, section 6)." },
          { label: "Deeds signed by a company", text: "A company may sign a deed without a seal by a director and the secretary, by two directors, or by one director in the presence of a witness who attests the signature (Companies Act 1967, section 41B)." },
          { label: "Deeds signed by an individual", text: "A deed signed by an individual is usually signed in front of a witness, who signs to confirm it." },
          { label: "Powers of attorney", text: "Usually made as deeds. Lasting powers of attorney have their own process." },
          { label: "Land documents", text: "Documents that sell or transfer land or an interest in it have their own signing and witnessing rules." },
          { label: "Sworn documents", text: "Statutory declarations and affidavits are signed before a commissioner for oaths or a notary, not an ordinary witness." },
        ],
        gold: true,
      },
      {
        id: "ink",
        h2: "Why witnessed documents are usually signed in ink",
        paras: [
          "The Electronic Transactions Act 2010 says an electronic signature can meet a legal need for a signature (section 8). But section 4 and the First Schedule take some documents outside that rule: wills; indentures (deeds between parties), declarations of trust and powers of attorney; contracts to sell or dispose of land; and conveyances of land.",
          "Those are largely the documents that need a witness. So for a witnessed document, the first question is not \"can the witness sign electronically?\" but \"can this document be e-signed at all?\". If it is on the excluded list, sign it on paper.",
        ],
      },
      {
        id: "contract-says",
        h2: "If your contract says it must be witnessed",
        paras: [
          "Section 5 of the Act lets the parties set their own rules. If a contract says signatures must be witnessed, or signed in ink, follow it: sign on paper with a witness, or agree in writing to change that requirement first.",
        ],
      },
      {
        id: "fdsign",
        h2: "What FD Sign records in place of a witness",
        intro: "For a document that needs no witness, this is the evidence attached to every signed PDF:",
        points: FD_SIGN_RECORD,
      },
    ],
    faqs: [
      { q: "Does an NDA need a witness?", a: "No. An NDA is an ordinary contract and is valid without a witness, on paper or e-signed, unless it is made as a deed or says it must be witnessed." },
      { q: "Does an employment contract need a witness in Singapore?", a: "No. An employment contract does not need a witness to be valid. Both sides sign, and each keeps a copy." },
      { q: "Can a deed be e-signed in Singapore?", a: "The Electronic Transactions Act's e-signature rules do not apply to indentures, which are deeds between parties, so deeds are normally signed in ink with the usual formalities. Ask a lawyer before e-signing a deed." },
      { q: "Can a witness sign electronically?", a: "Where the law requires a witness, check the rule for that document. Many witnessed documents are outside the Electronic Transactions Act, and a witness usually has to be present when the document is signed. Ask a lawyer." },
      { q: "Is an audit trail as good as a witness?", a: "They do the same job in different ways. A witness can say they saw the person sign. An audit trail records who received the link, who confirmed the code, when each step happened and which version was signed. Where a law requires a witness, an audit trail does not replace one." },
    ],
    band: { title: "Send your next contract with FD Sign", text: "For the contracts that need no witness: a private link, an email code and an audit trail attached to the signed PDF." },
  },
];

/** 0246: the guides as a block of their own near the top of the FD Sign page (/e-signature#guides), which the
 *  menu's "E-signature guides", the Templates page and the Resources page all lead to. One line each. */
export const GUIDE_CARDS: { href: string; title: string; text: string }[] = [
  { href: "/e-signature/how-to-sign-a-pdf-online", title: "How to sign a PDF online", text: "Each step, with the real screens." },
  { href: "/e-signature/electronic-signature-vs-digital-signature", title: "Electronic vs digital signature", text: "What each one is, and which you need." },
  { href: "/e-signature/do-e-signatures-need-a-witness", title: "Do e-signatures need a witness?", text: "Which documents do, and why those are signed in ink." },
  { href: LAW_PATH, title: "Is e-signature legal in Singapore?", text: "The Electronic Transactions Act in plain English." },
  { href: COMPARE_PATH, title: "Best DocuSign alternatives", text: "DocuSign, Dropbox Sign, PandaDoc and FD Sign compared." },
];

export const guidePath = (g: Guide) => `/e-signature/${g.slug}`;
export const guideBySlug = (slug: string): Guide | undefined => GUIDES.find((g) => g.slug === slug);

/** Where each guide sends the reader next. */
export const GUIDE_RELATED: { title: string; href: string; text: string }[] = [
  { title: "FD Sign: e-signature for PDF and Word", href: "/e-signature", text: "what it does and what it costs" },
  { title: "Is e-signature legal in Singapore?", href: LAW_PATH, text: "the Electronic Transactions Act in plain English" },
  { title: "Best DocuSign alternatives", href: COMPARE_PATH, text: "DocuSign, Dropbox Sign, PandaDoc and FD Sign compared" },
  { title: "Free legal templates", href: "/templates", text: "draft the document first, then send it for signing" },
];

export { ETA_URL };
