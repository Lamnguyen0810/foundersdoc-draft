import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/seo";
import {
  BOTH,
  CHOOSE,
  COMPARE,
  COMPARE_PATH,
  FAQS,
  FD_SIGN,
  FD_SIGN_EXTRAS,
  PRICES_CHECKED,
  PRICE_ROWS,
  RELATED,
  SIGN_LIVE,
  TOOLS,
} from "@/lib/products/compare";
import { Breadcrumbs, Disclaimer, Faqs, TemplateLd } from "../../templates/parts";
import TemplateCta from "../../templates/TemplateCta";
import "../../templates/templates.css";

/** /e-signature/docusign-alternatives (0226): DocuSign, Dropbox Sign (HelloSign), PandaDoc and FD Sign on one fair page. */

const url = `${SITE}${COMPARE_PATH}`;

export const metadata: Metadata = {
  title: { absolute: COMPARE.title },
  description: COMPARE.description,
  robots: { index: true, follow: true },
  alternates: { canonical: url },
  openGraph: { title: COMPARE.title, description: COMPARE.description, url, siteName: "Founders Doc", type: "article" },
};

export default function AlternativesPage() {
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "FD Sign", href: "/e-signature" },
    { name: "DocuSign alternatives", href: COMPARE_PATH },
  ];
  const all = [FD_SIGN, ...TOOLS];
  const cta = SIGN_LIVE ? "Try FD Sign" : "Try FD Sign free";

  return (
    <main className="tpl">
      <TemplateLd crumbs={crumbs} faqs={FAQS} page={{ url, name: COMPARE.title, description: COMPARE.description }} />
      <div className="wrap tpl-wrap">
        <Breadcrumbs items={crumbs} />
        <header className="tpl-hero">
          <span className="kicker">FD Sign · Compared</span>
          <h1>{COMPARE.h1}</h1>
          <p className="tpl-lead">{COMPARE.lead}</p>
          <div className="tpl-hero-actions">
            <TemplateCta href="/fd-sign/new" label={cta} source="compare:alternatives" />
            <a className="tpl-link" href="#prices">
              See the prices ›
            </a>
          </div>
          <span className="tpl-small">Prices from each tool&rsquo;s own pricing page, read on {PRICES_CHECKED}</span>
        </header>

        <section className="tpl-section" aria-labelledby="cmp-glance">
          <h2 id="cmp-glance">At a glance: who each one suits</h2>
          <dl className="tpl-points">
            {all.map((t) => (
              <div key={t.id}>
                <dt>
                  {t.id === "fd-sign" ? t.name : <a href={`#${t.id}`}>{t.fullName}</a>}
                </dt>
                <dd>Best for {t.bestFor.charAt(0).toLowerCase() + t.bestFor.slice(1)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="tpl-section" aria-labelledby="prices">
          <h2 id="prices">Prices compared</h2>
          <div className="cmp-wrap">
            <table className="cmp-table cmp-wide">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">What</span>
                  </th>
                  {all.map((t) => (
                    <th scope="col" key={t.id}>
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PRICE_ROWS.map(([label, key]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    {all.map((t) => (
                      <td key={t.id} className={t.id === "fd-sign" ? "cmp-us" : undefined}>
                        {t.prices[key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tpl-small">
            In US dollars unless marked S$, from each pricing page on {PRICES_CHECKED}:{" "}
            {TOOLS.map((t, i) => (
              <span key={t.id}>
                {i > 0 && " · "}
                <a href={t.pricingUrl!} rel="nofollow noopener" target="_blank">
                  {t.name}
                </a>
              </span>
            ))}
            . They may have changed since.
          </p>
        </section>

        <section className="tpl-section" aria-labelledby="cmp-both">
          <h2 id="cmp-both">What all four do</h2>
          <ul className="tpl-list cmp-both">
            {BOTH.map((b) => (
              <li key={b}>✓ {b}</li>
            ))}
          </ul>
        </section>

        {TOOLS.map((t) => (
          <section className="tpl-section" aria-labelledby={t.id} key={t.id}>
            <h2 id={t.id}>Looking for a {t.searchPhrase}?</h2>
            <p style={{ marginBottom: 14 }}>
              <strong>{t.fullName}</strong>: {t.strengths}
            </p>
            <dl className="tpl-points">
              <div>
                <dt>Best for</dt>
                <dd>{t.bestFor}</dd>
              </div>
              <div>
                <dt>Worth knowing</dt>
                <dd>{t.considerations.join(" ")}</dd>
              </div>
              <div>
                <dt>FD Sign may suit you better if</dt>
                <dd>{t.fdSignFits}</dd>
              </div>
            </dl>
          </section>
        ))}

        <section className="tpl-section" aria-labelledby="cmp-extras">
          <h2 id="cmp-extras">What FD Sign adds</h2>
          <dl className="tpl-points">
            {FD_SIGN_EXTRAS.map((w) => (
              <div key={w.label}>
                <dt>{w.label}</dt>
                <dd>{w.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="tpl-section" aria-labelledby="cmp-choose">
          <h2 id="cmp-choose">How to choose</h2>
          <dl className="tpl-points">
            {CHOOSE.map((w) => (
              <div key={w.label}>
                <dt>{w.label}</dt>
                <dd>{w.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Faqs items={FAQS} />

        <section className="tpl-section" aria-labelledby="cmp-related">
          <h2 id="cmp-related">Related</h2>
          <ul className="tpl-reading tpl-related">
            {RELATED.map((r) => (
              <li key={r.href}>
                <Link href={r.href}>{r.title}</Link> — {r.text}
              </li>
            ))}
          </ul>
        </section>

        <section className="tpl-band" aria-label={cta}>
          <h2>Send your next contract with FD Sign</h2>
          <p>
            {SIGN_LIVE ? "Half DocuSign's price, per account." : "Free with an FD AI account."} A Founders Doc lawyer is one click away if you want the
            document checked first.
          </p>
          <div className="tpl-band-actions">
            <TemplateCta href="/fd-sign/new" label={cta} source="compare:alternatives:end" />
            <Link className="tpl-link" href="/fd-consult">
              Talk to a lawyer ›
            </Link>
          </div>
        </section>
        <p className="tpl-note">
          DocuSign, Dropbox Sign, HelloSign and PandaDoc are trademarks of their owners. Founders Doc is not affiliated with, endorsed or sponsored by them; the names
          are used only to compare.
        </p>
        <Disclaimer />
      </div>
    </main>
  );
}
