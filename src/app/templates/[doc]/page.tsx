import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/seo";
import { TEMPLATES, draftLink, inSentence, templateBySlug } from "@/lib/templates/data";
import { Aside, CtaBand, Disclaimer, Faqs, Hero, Steps, TemplateLd } from "../parts";
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
  const chips = [t.beta ? "Beta on FD AI" : "Ready on FD AI", "No card needed", "Word download"];

  return (
    <main className="tpl">
      <TemplateLd crumbs={crumbs} faqs={t.faqs} page={{ url, name: t.title, description: t.description }} />
      <Hero
        crumbs={crumbs}
        eyebrow={`${t.short} template`}
        title={t.h1 ?? `${t.short} template — draft a ${t.name.replace(/ \(.*\)$/, "")} in minutes`}
        lead={t.lead}
        cta={{ href, label, source }}
        chips={chips}
      />

      <div className="wrap tpl-body">
        <div className="tpl-main">
          {t.law && (
            <p className="tpl-tip">
              <strong>In FD AI:</strong> {t.law}
            </p>
          )}

          {t.countries.length > 0 && (
            <section className="tpl-section" aria-labelledby="tpl-country">
              <h2 id="tpl-country">Choose your country</h2>
              <ul className="tpl-countries">
                {t.countries.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/templates/${t.slug}/${c.slug}`}>
                      <span className="tpl-flag" aria-hidden="true">
                        {c.flag}
                      </span>
                      <strong>
                        {t.short} for {c.short}
                      </strong>
                      <span>{c.lawChoice.replace(/^Choose /, "")}</span>
                      <span className="tpl-go" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="tpl-small">Somewhere else? FD AI offers many more countries and US states — choose yours in the governing-law question.</p>
            </section>
          )}

          <section className="tpl-section" aria-labelledby="tpl-covers">
            <h2 id="tpl-covers">What your {inSentence(t)} covers</h2>
            <ul className="tpl-checks">
              {t.covers.map((c) => (
                <li key={c.label}>
                  <strong>{c.label}</strong>
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="tpl-section" aria-labelledby="tpl-when">
            <h2 id="tpl-when">When you need one</h2>
            <ul className="tpl-when">
              {t.whenNeeded.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>

          <Steps docShort={inSentence(t)} />
          <Faqs items={t.faqs} />
          <Reading items={t.reading} />
        </div>
        <Aside icon={t.icon} name={t.short} href={href} label={label} source={source} beta={t.beta} />
      </div>

      <div className="wrap tpl-end">
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
