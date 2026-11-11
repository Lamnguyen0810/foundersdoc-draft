import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/seo";
import { TRIAL } from "@/lib/billing/plans";
import { TEMPLATES, draftLink, inSentence, pageLabel, templateBySlug } from "@/lib/templates/data";
import { Breadcrumbs, CtaBand, Disclaimer, Faqs, MoreTemplates, RelatedTemplates, Steps, TemplateLd } from "../parts";
import TemplateCta from "../TemplateCta";
import "../templates.css";

/** /templates/<doc> — one document: what it covers, when you need one, and its countries. */

export const dynamicParams = false;

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ doc: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const t = templateBySlug((await params).doc);
  if (!t) return {};
  const url = `${SITE}/templates/${t.slug}`;
  return {
    title: { absolute: t.title },
    description: t.description,
    /* The root layout hides every page from Google; these pages are meant to be found. */
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: {
      title: t.title,
      description: t.description,
      url,
      siteName: "Founders Doc",
      type: "website",
    },
  };
}

export default async function TemplateDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const t = templateBySlug((await params).doc);
  if (!t) notFound();
  const url = `${SITE}/templates/${t.slug}`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Templates", href: "/templates" },
    { name: `${t.short} template`, href: `/templates/${t.slug}` },
  ];
  const href = draftLink(t);
  const label = `Draft my ${inSentence(t)} free`;
  const source = `template:${t.slug}`;
  const countries = t.countries.filter((c) => c.kind !== "type");
  const kinds = t.countries.filter((c) => c.kind === "type");

  return (
    <main className="tpl">
      <TemplateLd crumbs={crumbs} faqs={t.faqs} page={{ url, name: t.title, description: t.description }} />
      <div className="wrap tpl-wrap">
        <Breadcrumbs items={crumbs} />
        <header className="tpl-hero">
          <span className="kicker">{t.short} template</span>
          <h1>{t.h1 ?? `${t.short} template — draft a ${t.name.replace(/ \(.*\)$/, "")} in minutes`}</h1>
          <p className="tpl-lead">{t.lead}</p>
          <div className="tpl-hero-actions">
            <TemplateCta href={href} label={label} source={source} />
            <span className="tpl-small">
              {t.beta && (
                <span className="tpl-beta" title="This document is in Beta on FD AI: it works, and we are still refining it.">
                  Beta
                </span>
              )}
              {TRIAL.credits} free documents · no card needed
            </span>
          </div>
          {t.law && (
            <p className="tpl-tip">
              <strong>In FD AI:</strong> {t.law}
            </p>
          )}
        </header>

        {kinds.length > 0 && (
          <section className="tpl-section" aria-labelledby="tpl-kind">
            <h2 id="tpl-kind">Mutual or one-way?</h2>
            <ul className="tpl-countries tpl-kinds">
              {kinds.map((c) => (
                <li key={c.slug}>
                  <Link href={`/templates/${t.slug}/${c.slug}`}>
                    <span className="tpl-flag" aria-hidden="true">
                      {c.flag}
                    </span>
                    <strong>{pageLabel(t, c)}</strong>
                    <span>{c.lead.split(". ")[0]}.</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {countries.length > 0 && (
          <section className="tpl-section" aria-labelledby="tpl-country">
            <h2 id="tpl-country">Choose your country</h2>
            <ul className="tpl-countries">
              {countries.map((c) => (
                <li key={c.slug}>
                  <Link href={`/templates/${t.slug}/${c.slug}`}>
                    <span className="tpl-flag" aria-hidden="true">
                      {c.flag}
                    </span>
                    <strong>{pageLabel(t, c)}</strong>
                    <span>{c.lawChoice.replace(/^Choose /, "")}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="tpl-small">Somewhere else? FD AI offers many more countries and US states — choose yours in the governing-law question.</p>
          </section>
        )}

        <section className="tpl-section" aria-labelledby="tpl-covers">
          <h2 id="tpl-covers">What your {inSentence(t)} covers</h2>
          <dl className="tpl-points">
            {t.covers.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd>{c.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="tpl-section" aria-labelledby="tpl-when">
          <h2 id="tpl-when">When you need one</h2>
          <ul className="tpl-list">
            {t.whenNeeded.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>

        <Steps docShort={inSentence(t)} />
        <Faqs items={t.faqs} />
        <RelatedTemplates items={t.related} />
        <Reading items={t.reading} />
        <MoreTemplates current={t.slug} />
        <CtaBand href={href} label={label} source={`${source}:end`} title={`Ready to draft your ${inSentence(t)}?`} />
        <Disclaimer />
      </div>
    </main>
  );
}

function Reading({ items }: { items: { title: string; href: string }[] }) {
  if (!items.length) return null;
  return (
    <section className="tpl-section" aria-labelledby="tpl-read">
      <h2 id="tpl-read">Related reading</h2>
      <ul className="tpl-reading">
        {items.map((r) => (
          <li key={r.href}>
            <a href={r.href}>{r.title}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
