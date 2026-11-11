import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/seo";
import { TRIAL } from "@/lib/billing/plans";
import { TEMPLATES, countryPage, draftLink, inSentence, pageLabel } from "@/lib/templates/data";
import { Breadcrumbs, CtaBand, Disclaimer, Faqs, MoreTemplates, RelatedTemplates, Steps, TemplateLd } from "../../parts";
import TemplateCta from "../../TemplateCta";
import "../../templates.css";

/** /templates/<doc>/<country> — one document under one country's law. */

export const dynamicParams = false;

export function generateStaticParams() {
  return TEMPLATES.flatMap((t) => t.countries.map((c) => ({ doc: t.slug, country: c.slug })));
}

type Params = Promise<{ doc: string; country: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { doc, country } = await params;
  const found = countryPage(doc, country);
  if (!found) return {};
  const { page } = found;
  const url = `${SITE}/templates/${doc}/${country}`;
  return {
    title: { absolute: page.title },
    description: page.description,
    /* The root layout hides every page from Google; these pages are meant to be found. */
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: { title: page.title, description: page.description, url, siteName: "Founders Doc", type: "website" },
  };
}

export default async function TemplateCountryPage({ params }: { params: Params }) {
  const { doc, country } = await params;
  const found = countryPage(doc, country);
  if (!found) notFound();
  const { doc: t, page } = found;
  const url = `${SITE}/templates/${t.slug}/${page.slug}`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Templates", href: "/templates" },
    { name: `${t.short} template`, href: `/templates/${t.slug}` },
    { name: page.short, href: `/templates/${t.slug}/${page.slug}` },
  ];
  const href = draftLink(t);
  const label = `Draft my ${inSentence(t)} free`;
  const source = `template:${t.slug}:${page.slug}`;
  const faqs = [...page.faqs, ...t.faqs];
  const others = t.countries.filter((c) => c.slug !== page.slug);

  return (
    <main className="tpl">
      <TemplateLd crumbs={crumbs} faqs={faqs} page={{ url, name: page.title, description: page.description }} />
      <div className="wrap tpl-wrap">
        <Breadcrumbs items={crumbs} />
        <header className="tpl-hero">
          <span className="kicker">
            <span aria-hidden="true">{page.flag}</span> {pageLabel(t, page)} template
          </span>
          <h1>{page.h1 ?? `${t.short} template for ${page.name}`}</h1>
          <p className="tpl-lead">{page.lead}</p>
          <div className="tpl-hero-actions">
            <TemplateCta href={href} label={label} source={source} />
            <span className="tpl-small">
              {t.beta && <span className="tpl-beta">Beta</span>}
              {TRIAL.credits} free documents · no card needed
            </span>
          </div>
          <p className="tpl-tip">
            <strong>In FD AI:</strong> {page.lawChoice}
          </p>
        </header>

        <section className="tpl-section" aria-labelledby="tpl-covers">
          <h2 id="tpl-covers">What this {inSentence(t)} covers</h2>
          <dl className="tpl-points">
            {t.covers.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd>{c.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="tpl-section" aria-labelledby="tpl-law">
          <h2 id="tpl-law">{page.pointsTitle ?? `${page.short} law points to know`}</h2>
          <dl className={page.kind === "type" ? "tpl-points" : "tpl-points tpl-points-law"}>
            {page.lawPoints.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd>{c.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        {page.keyTerms?.length ? (
          <section className="tpl-section" aria-labelledby="tpl-terms">
            <h2 id="tpl-terms">{page.keyTermsTitle ?? "Key terms"}</h2>
            <dl className="tpl-points">
              {page.keyTerms.map((c) => (
                <div key={c.label}>
                  <dt>{c.label}</dt>
                  <dd>{c.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <Steps docShort={inSentence(t)} />
        <Faqs items={faqs} />

        <section className="tpl-section" aria-labelledby="tpl-other">
          <h2 id="tpl-other">More {t.short} templates</h2>
          <ul className="tpl-chips">
            {others.map((c) => (
              <li key={c.slug}>
                <Link href={`/templates/${t.slug}/${c.slug}`}>
                  <span aria-hidden="true">{c.flag}</span> {pageLabel(t, c)}
                </Link>
              </li>
            ))}
            <li>
              <Link href={`/templates/${t.slug}`}>All {t.short} templates</Link>
            </li>
          </ul>
        </section>

        {t.reading.length > 0 && (
          <section className="tpl-section" aria-labelledby="tpl-read">
            <h2 id="tpl-read">Related reading</h2>
            <ul className="tpl-reading">
              {t.reading.map((r) => (
                <li key={r.href}>
                  <a href={r.href}>{r.title}</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <RelatedTemplates items={t.related} />
        <MoreTemplates current={t.slug} />

        <CtaBand
          href={href}
          label={label}
          source={`${source}:end`}
          title={page.kind === "type" ? `Draft your ${page.short.toLowerCase()} ${inSentence(t)} now` : `Draft your ${page.short} ${inSentence(t)} now`}
        />
        <Disclaimer />
      </div>
    </main>
  );
}
