import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/seo";
import { TRIAL } from "@/lib/billing/plans";
import { TEMPLATES, draftLink } from "@/lib/templates/data";
import { CtaBand, Disclaimer, Hero, TemplateLd } from "./parts";
import "./templates.css";

/**
 * /templates — every document with a template page, and the countries each
 * one has. The pages themselves live in lib/templates/data.ts.
 */

const TITLE = "Free Legal Document Templates | FD AI";
const DESCRIPTION =
  "Lawyer-backed legal templates, drafted around your answers by FD AI. Choose a document and a country, then draft it free in minutes.";
const URL = `${SITE}/templates`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  /* The root layout hides every page from Google; these pages are meant to be found. */
  robots: { index: true, follow: true },
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: URL,
    siteName: "Founders Doc",
    type: "website",
  },
};

const CRUMBS = [
  { name: "Home", href: "/" },
  { name: "Templates", href: "/templates" },
];

export default function TemplatesHub() {
  return (
    <main className="tpl">
      <TemplateLd crumbs={CRUMBS} page={{ url: URL, name: TITLE, description: DESCRIPTION }} />
      <Hero
        crumbs={CRUMBS}
        eyebrow="FD AI templates"
        title="Legal document templates, drafted around you"
        lead={`Not a blank form to fill in: pick a document and FD AI drafts it around your answers, from Founders Doc's own lawyer-written wording. Your first ${TRIAL.credits} documents are free.`}
        chips={["No card needed", "Lawyer-written wording", "Word download"]}
      />

      <div className="wrap tpl-hub">
        <section aria-label="Documents">
          <ul className="tpl-grid">
            {TEMPLATES.map((t) => (
              <li key={t.slug} className="tpl-doc">
                <div className="tpl-doc-head">
                  <span className="tpl-icon" aria-hidden="true">
                    {t.icon}
                  </span>
                  <span className={t.beta ? "tpl-tag beta" : "tpl-tag ready"}>{t.beta ? "Beta" : "Ready"}</span>
                </div>
                <h2>
                  <Link className="tpl-doc-link" href={`/templates/${t.slug}`}>
                    {t.name}
                  </Link>
                </h2>
                <p>{t.summary}</p>
                {t.countries.length > 0 && (
                  <ul className="tpl-flags" aria-label={`${t.short} by country`}>
                    {t.countries.map((c) => (
                      <li key={c.slug}>
                        <Link href={`/templates/${t.slug}/${c.slug}`} title={`${t.short} for ${c.short}`}>
                          <span aria-hidden="true">{c.flag}</span> {c.short}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="tpl-doc-foot">
                  <span>View template</span>
                  <span aria-hidden="true">→</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="tpl-more">
            More documents are on FD AI already — term sheets, share purchase and subscription, investment, convertible loan, IP assignment
            and joint venture agreements. <Link href="/draft">See them all</Link>.
          </p>
        </section>

        <CtaBand
          href={draftLink(TEMPLATES[0])}
          label={`Draft my ${TEMPLATES[0].short} free`}
          source="template:hub"
          title="Start with an NDA — most deals do"
        />
        <Disclaimer />
      </div>
    </main>
  );
}
