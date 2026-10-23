import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/seo";
import { TRIAL } from "@/lib/billing/plans";
import { TEMPLATES, draftLink } from "@/lib/templates/data";
import { Breadcrumbs, CtaBand, Disclaimer, TemplateLd } from "./parts";
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
  openGraph: { title: TITLE, description: DESCRIPTION, url: URL, siteName: "Founders Doc", type: "website" },
};

const CRUMBS = [
  { name: "Home", href: "/" },
  { name: "Templates", href: "/templates" },
];

export default function TemplatesHub() {
  return (
    <main className="tpl">
      <TemplateLd crumbs={CRUMBS} page={{ url: URL, name: TITLE, description: DESCRIPTION }} />
      <div className="wrap tpl-wrap">
        <Breadcrumbs items={CRUMBS} />
        <header className="tpl-hero">
          <span className="kicker">FD AI templates</span>
          <h1>Legal document templates, drafted around you</h1>
          <p className="tpl-lead">
            Not a blank form to fill in: pick a document and FD AI drafts it around your answers, from Founders Doc&rsquo;s own
            lawyer-written wording. Your first {TRIAL.credits} documents are free.
          </p>
        </header>

        <section className="tpl-section" aria-label="Documents">
          <div className="tpl-cards">
            {TEMPLATES.map((t) => (
              <article className="tpl-card" key={t.slug}>
                <h2>
                  <Link href={`/templates/${t.slug}`}>{t.name}</Link>
                </h2>
                <p>{t.lead}</p>
                <ul className="tpl-chips" aria-label={`${t.short} by country`}>
                  {t.countries.map((c) => (
                    <li key={c.slug}>
                      <Link href={`/templates/${t.slug}/${c.slug}`}>
                        <span aria-hidden="true">{c.flag}</span> {t.short} for {c.short}
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="tpl-more">
            More documents are on FD AI already — employment, services, loan, shareholders&rsquo; agreements, term sheets and
            more. <Link href="/draft">See them all</Link>.
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
