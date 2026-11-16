import type { Faq } from "@/lib/templates/data";

/**
 * /e-signature/is-e-signature-legal-in-singapore (0238): what Singapore's Electronic Transactions
 * Act 2010 says about e-signatures, in plain English. Every legal point is tied to a section of the
 * Act (read on Singapore Statutes Online on LAW_CHECKED). Never say FD Sign is a "secure electronic
 * signature" under s 18: that depends on a specified or agreed security procedure, not on us.
 */

export const LAW_PATH = "/e-signature/is-e-signature-legal-in-singapore";
export const LAW_CHECKED = "16 November 2026";
export const ETA_URL = "https://sso.agc.gov.sg/Act/ETA2010";

export const LAW = {
  title: "Is E-Signature Legal in Singapore? The Law Explained | FD Sign",
  description:
    "Yes, for most contracts. What Singapore's Electronic Transactions Act 2010 says about e-signatures, which documents still need wet ink, and how to e-sign safely.",
  h1: "Is e-signature legal in Singapore?",
  lead:
    "Yes, for most business documents. Singapore's Electronic Transactions Act 2010 says a record can't be refused legal effect just because it is electronic, and an electronic signature meets a legal need for a signature when it identifies the signer and shows they meant to sign. A short list of documents is excluded, such as wills and documents that sell or transfer land.",
};

/** The four rules that make e-signing work (ETA Part 2). */
export const RULES: { label: string; text: string; ref: string }[] = [
  { label: "Electronic records count", text: "Information is not denied legal effect, validity or enforceability only because it is in electronic form.", ref: "s 6" },
  { label: "Electronic records can be “in writing”", text: "Where the law needs something in writing, an electronic record is enough if it can be opened and used again later.", ref: "s 7" },
  { label: "Electronic signatures can be signatures", text: "Where the law needs a signature, an electronic signature is enough if it meets the two tests below.", ref: "s 8" },
  { label: "Contracts can be made electronically", text: "An offer and its acceptance can be made electronically, and the contract is not invalid only because of that.", ref: "s 11" },
];

/** The s 8 tests, in plain English. */
export const TESTS: { label: string; text: string }[] = [
  { label: "1. Who and why", text: "The method used must identify the person signing and show their intention about the document, for example that they approve it." },
  {
    label: "2. Reliable enough",
    text: "The method must be as reliable as is appropriate for the purpose of the document, in all the circumstances (including anything the parties agreed), or be proven in fact to have identified the signer and shown their intention, on its own or with other evidence.",
  },
];

/** ETA First Schedule (s 4): Part 2 does not apply to these. */
export const EXCLUDED: string[] = [
  "Making or signing a will",
  "Making, performing or enforcing an indenture (a deed between parties), a declaration of trust or a power of attorney. Implied, constructive and resulting trusts, and lasting powers of attorney under the Mental Capacity Act 2008, are not excluded.",
  "A contract to sell or otherwise dispose of immovable property (land and buildings), or any interest in it",
  "Conveying immovable property, or transferring any interest in it",
];

export const CHECKLIST: string[] = [
  "Check the document is not on the excluded list, and that no other law or regulator asks for a particular form, witnesses, a seal or a notary.",
  "Check the contract itself: if it says it must be signed in wet ink, or in a set way, follow it.",
  "Make sure the right person signs, with the authority to sign (for a company, usually a director or another authorised officer).",
  "Use a method that records who signed, when, and which version they signed, and keep that record with the signed copy.",
  "Send the final version only: no blanks, placeholders or tracked changes left in.",
];

/** What FD Sign records, stated as facts about the product, not as a legal conclusion. */
export const FD_SIGN_RECORD: { label: string; text: string }[] = [
  { label: "Who", text: "Each signer opens a private link sent to their email and confirms a 6-digit code sent to the same address before signing." },
  { label: "Intention", text: "The signer reviews the document, agrees to sign electronically and adopts their signature before it is placed." },
  { label: "Which version", text: "The SHA-256 fingerprint of the original file is recorded, so any later change to it can be detected." },
  { label: "When and how", text: "Every step (sent, opened, code confirmed, signed) is logged with its time, and each signer's steps with their IP address and browser, in an audit trail attached to the signed PDF." },
];

export const LAW_FAQS: Faq[] = [
  {
    q: "Is an e-signature legally binding in Singapore?",
    a: "For most contracts, yes. Under section 8 of the Electronic Transactions Act 2010, an electronic signature meets a legal need for a signature if the method identifies the signer, shows their intention, and is reliable enough for the purpose (or is proven to have done so). A few documents, such as wills and land transfers, are excluded.",
  },
  {
    q: "Which documents can't be signed electronically in Singapore?",
    a: "The Act's First Schedule excludes wills; indentures, declarations of trust and powers of attorney (except implied, constructive and resulting trusts, and lasting powers of attorney); contracts to sell or dispose of immovable property or an interest in it; and conveyances or transfers of immovable property. Other laws may also set their own formalities.",
  },
  {
    q: "Can I e-sign an employment contract, NDA or shareholders' agreement?",
    a: "These are not on the Act's excluded list, so they can usually be signed electronically. Check the document itself and any other rule that applies, for example if it is made as a deed or must be witnessed.",
  },
  {
    q: "Is a typed name or a scanned signature an e-signature?",
    a: "It can be. The Act does not require a particular form: what matters is whether the method identifies the signer, shows their intention and is reliable enough. A typed name alone is weaker evidence than a signature backed by a verified email and an audit trail.",
  },
  {
    q: "What is a secure electronic signature?",
    a: "Under section 18, it is one that a specified or agreed commercially reasonable security procedure can verify was unique to the signer, identified them, was under their sole control and is linked to the record so that changing the record would invalidate it. In court, a secure electronic signature is presumed to be the signer's and to have been made with the intention of signing (section 19). Other e-signatures are proved with evidence such as an audit trail.",
  },
  {
    q: "Can the other side refuse an e-signature?",
    a: "Yes. Section 5 lets parties agree not to use electronic signatures, or to add their own requirements. Agreement to sign electronically can also be inferred from how the parties act, for example by signing through an e-signature link.",
  },
  {
    q: "Does FD Sign work for Singapore contracts?",
    a: "FD Sign is built for the s 8 tests: each signer is identified by a private link and a code sent to their email, agrees to sign electronically, and every step is recorded in an audit trail attached to the signed PDF. Whether a particular document can be e-signed still depends on the document, so check the exceptions first.",
  },
];
