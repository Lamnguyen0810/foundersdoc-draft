import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/seo";
import { COMPARE_PATH, SIGN_LIVE } from "@/lib/products/compare";
import { GUIDES, guidePath } from "@/lib/products/esign-guides";
import { CHECKLIST, ETA_URL, EXCLUDED, FD_SIGN_RECORD, LAW, LAW_CHECKED, LAW_FAQS, LAW_PATH, RULES, TESTS } from "@/lib/products/esign-law";
import { Breadcrumbs, Disclaimer, Faqs, TemplateLd } from "../../templates/parts";
import TemplateCta from "../../templates/TemplateCta";
import "../../templates/templates.css";

/** /e-signature/is-e-signature-legal-in-singapore (0238): the Electronic Transactions Act 2010 in plain English. */

const url = `${SITE}${LAW_PATH}`;

export const metadata: Metadata = {
  title: { absolute: LAW.title },
  description: LAW.description,
  robots: { index: true, follow: true },
  alternates: { canonical: url },
  openGraph: { title: LAW.title, description: LAW.description, url, siteName: "Founders Doc", type: "article" },
};

export default function ESignLawPage() {
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "FD Sign", href: "/e-signature" },
    { name: "Is e-signature legal in Singapore?", href: LAW_PATH },
  ];
  const cta = SIGN_LIVE ? "Send a document for signing" : "Try FD Sign free";

  return (
    <main className="tpl">
      <TemplateLd crumbs={crumbs} faqs={LAW_FAQS} page={{ url, name: LAW.title, description: LAW.description }} />
      <div className="wrap tpl-wrap">
        <Breadcrumbs items={crumbs} />
        <header className="tpl-hero">
          <span className="kicker">FD Sign · Singapore law</span>
          <h1>{LAW.h1}</h1>
          <p className="tpl-lead">{LAW.lead}</p>
          <div className="tpl-hero-actions">
            <TemplateCta href="/fd-sign/new" label={cta} source="law:singapore" />
            <a className="tpl-link" href="#excluded">
              What can&rsquo;t be e-signed ›
            </a>
          </div>
          <span className="tpl-small">
            Based on the{" "}
            <a href={ETA_URL} rel="noopener" target="_blank">
              Electronic Transactions Act 2010
            </a>{" "}
            as read on Singapore Statutes Online, {LAW_CHECKED}
          </span>
        </header>

        <section className="tpl-section" aria-labelledby="law-rules">
          <h2 id="law-rules">What the Electronic Transactions Act says</h2>
          <dl className="tpl-points tpl-points-law">
            {RULES.map((r) => (
              <div key={r.ref}>
                <dt>{r.label}</dt>
                <dd>
                  {r.text} <span className="tpl-small">({r.ref})</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="tpl-section" aria-labelledby="law-tests">
          <h2 id="law-tests">When an e-signature counts as a signature</h2>
          <p style={{ marginBottom: 14 }}>Section 8 sets two tests. The Act does not ask for a particular kind of signature: a drawn, typed or clicked signature can all qualify.</p>
          <dl className="tpl-points">
            {TESTS.map((t) => (
              <div key={t.label}>
                <dt>{t.label}</dt>
                <dd>{t.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="tpl-section" aria-labelledby="excluded">
          <h2 id="excluded">Documents that still need a traditional signature</h2>
          <p style={{ marginBottom: 14 }}>The Act&rsquo;s rules on electronic records and signatures do not apply to these (section 4 and the First Schedule):</p>
          <ul className="tpl-list">
            {EXCLUDED.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="tpl-small">Other laws can also set their own formalities, such as witnesses, a company seal, notarisation or a set filing form. Check those for the document you are signing.</p>
        </section>

        <section className="tpl-section" aria-labelledby="law-secure">
          <h2 id="law-secure">E-signatures and secure electronic signatures</h2>
          <p>
            Most business contracts are signed with an ordinary electronic signature. If it is ever disputed, it is proved with evidence: who received the link, who confirmed
            the code, when, and which version they signed. A <strong>secure electronic signature</strong> (section 18) goes further: a specified or agreed commercially
            reasonable security procedure verifies it was unique to the signer, under their sole control and linked to the record so that any change would invalidate it.
            In court it is then presumed to be the signer&rsquo;s, made with the intention of signing (section 19).
          </p>
        </section>

        <section className="tpl-section" aria-labelledby="law-agree">
          <h2 id="law-agree">Both sides can set the rules</h2>
          <p>
            Section 5 lets the parties agree not to use electronic signatures, or to add their own requirements. If a contract says it must be signed in wet ink, follow
            it. Agreement to sign electronically can also be shown by how the parties act, for example by signing through an e-signature link.
          </p>
        </section>

        <section className="tpl-section" aria-labelledby="law-check">
          <h2 id="law-check">A checklist before you e-sign</h2>
          <ul className="tpl-list">
            {CHECKLIST.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>

        <section className="tpl-section" aria-labelledby="law-fdsign">
          <h2 id="law-fdsign">What FD Sign records for every signature</h2>
          <dl className="tpl-points">
            {FD_SIGN_RECORD.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.text}</dd>
              </div>
            ))}
          </dl>
          <p className="tpl-small">
            Before you send, FD Sign&rsquo;s signing-ready check flags blanks, placeholders, tracked changes and wording that needs wet ink. It is a checklist, not legal advice.
          </p>
        </section>

        <Faqs items={LAW_FAQS} />

        <section className="tpl-section" aria-labelledby="law-related">
          <h2 id="law-related">Related</h2>
          <ul className="tpl-reading tpl-related">
            <li>
              <Link href="/e-signature">FD Sign: e-signature for PDF and Word</Link> — how sending for signature works, step by step
            </li>
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link href={guidePath(g)}>{g.h1}</Link>
              </li>
            ))}
            <li>
              <Link href={COMPARE_PATH}>Best DocuSign alternatives</Link> — DocuSign, Dropbox Sign, PandaDoc and FD Sign compared
            </li>
            <li>
              <Link href="/templates/nda/singapore">Free NDA template Singapore</Link> — draft it, then send it for signing
            </li>
            <li>
              <Link href="/templates/employment-contract/singapore">Employment contract template Singapore</Link> — ready for e-signature
            </li>
            <li>
              <Link href="/fd-consult">Book a call with a Singapore lawyer</Link> — check a document before it is signed
            </li>
          </ul>
        </section>

        <section className="tpl-band" aria-label={cta}>
          <h2>Send your next contract with FD Sign</h2>
          <p>Signers need no account: a private link, an email code and an audit trail. A Founders Doc lawyer is one click away if you want the document checked first.</p>
          <div className="tpl-band-actions">
            <TemplateCta href="/fd-sign/new" label={cta} source="law:singapore:end" />
            <Link className="tpl-link" href="/fd-consult">
              Talk to a lawyer ›
            </Link>
          </div>
        </section>
        <Disclaimer />
      </div>
    </main>
  );
}
