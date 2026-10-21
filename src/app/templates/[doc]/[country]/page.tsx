import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/seo";
import { TRIAL } from "@/lib/billing/plans";
import { TEMPLATES, countryPage, draftLink } from "@/lib/templates/data";
import { Breadcrumbs, CtaBand, Disclaimer, Faqs, Steps, TemplateLd } from "../../parts";
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
  const label = `Draft my ${t.short} free`;
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
            <span aria-hidden="true">{page.flag}</span> {t.short} template · {page.short}
          </span>
          <h1>
            {t.short} template for {page.name}
          </h1>
          <p className="tpl-lead">{page.lead}</p>
          <div className="tpl-hero-actions">
            <TemplateCta href={href} label={label} source={source} />
            <span className="tpl-small">{TRIAL.credits} free documents · no card needed</span>
          </div>
          <p className="tpl-tip">
            <strong>In FD AI:</strong> {page.lawChoice}
          </p>
        </header>

        <section className="tpl-section" aria-labelledby="tpl-covers">
          <h2 id="tpl-covers">What this {t.short} covers</h2>
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
          <h2 id="tpl-law">
            {page.short} law points to know
          </h2>
          <dl className="tpl-points tpl-points-law">
            {page.lawPoints.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd>{c.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Steps docShort={t.short} />
        <Faqs items={faqs} />

        <section className="tpl-section" aria-labelledby="tpl-other">
          <h2 id="tpl-other">{t.short} templates for other countries</h2>
          <ul className="tpl-chips">
            {others.map((c) => (
              <li key={c.slug}>
                <Link href={`/templates/${t.slug}/${c.slug}`}>
                  <span aria-hidden="true">{c.flag}</span> {t.short} for {c.short}
                </Link>
              </li>
            ))}
            <li>
              <Link href={`/templates/${t.slug}`}>All countries</Link>
            </li>
          </ul>
        </section>

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

        <CtaBand href={href} label={label} source={`${source}:end`} title={`Draft your ${page.short} ${t.short} now`} />
        <Disclaimer />
      </div>
    </main>
  );
}
