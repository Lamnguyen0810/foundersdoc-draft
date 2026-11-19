import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/seo";
import { TRIAL } from "@/lib/billing/plans";
import { TEMPLATES, TEMPLATE_GROUPS, draftLink, pageLabel } from "@/lib/templates/data";
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

        {/* 0246: grouped by what the founder is doing, with a way to jump to each group */}
        <nav className="tpl-jump" aria-label="Kinds of document">
          <ul className="tpl-chips">
            {TEMPLATE_GROUPS.map((g) => (
              <li key={g.id}>
                <a href={`#${g.id}`}>{g.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        {TEMPLATE_GROUPS.map((g) => (
        <section className="tpl-section" aria-labelledby={g.id} key={g.id}>
          <h2 id={g.id}>{g.title}</h2>
          <p className="tpl-group-text">{g.text}</p>
          <div className="tpl-cards">
            {g.slugs.map((slug) => TEMPLATES.find((t) => t.slug === slug)!).map((t) => (
              <article className="tpl-card" key={t.slug}>
                <h3>
                  <Link href={`/templates/${t.slug}`}>{t.name}</Link>
                </h3>
                <p>{t.lead}</p>
                <ul className="tpl-chips" aria-label={`${t.short} templates`}>
                  {t.countries.length === 0 && (
                    <li>
                      <Link href={`/templates/${t.slug}`}>See the {t.short.toLowerCase()} template ›</Link>
                    </li>
                  )}
                  {t.countries.map((c) => (
                    <li key={c.slug}>
                      <Link href={`/templates/${t.slug}/${c.slug}`}>
                        <span aria-hidden="true">{c.flag}</span> {pageLabel(t, c)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
        ))}
        <p className="tpl-more">
          Every template here is drafted by FD AI. <Link href="/draft">Open FD AI</Link> to start any of them, or{" "}
          <Link href="/e-signature#guides">read how to send the finished document for signing</Link>.
        </p>

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
