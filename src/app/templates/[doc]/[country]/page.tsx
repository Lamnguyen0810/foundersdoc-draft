import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/seo";
import { TEMPLATES, countryPage, draftLink, inSentence, pageLabel } from "@/lib/templates/data";
import { Aside, CtaBand, Disclaimer, Faqs, Hero, Steps, TemplateLd } from "../../parts";
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
      <Hero
        crumbs={crumbs}
        eyebrow={`${page.flag} ${pageLabel(t, page)} template`}
        title={page.h1 ?? `${t.short} template for ${page.name}`}
        lead={page.lead}
        cta={{ href, label, source }}
        chips={[t.beta ? "Beta on FD AI" : "Ready on FD AI", page.kind === "type" ? "Any country's law" : `${page.short} law`, "No card needed", "Word download"]}
      />

      <div className="wrap tpl-body">
        <div className="tpl-main">
          <p className="tpl-tip">
            <strong>In FD AI:</strong> {page.lawChoice}
          </p>

          <section className="tpl-section" aria-labelledby="tpl-law">
            <h2 id="tpl-law">{page.pointsTitle ?? `${page.short} law points to know`}</h2>
            <ul className={page.kind === "type" ? "tpl-checks" : "tpl-checks tpl-checks-law"}>
              {page.lawPoints.map((c) => (
                <li key={c.label}>
                  <strong>{c.label}</strong>
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="tpl-section" aria-labelledby="tpl-covers">
            <h2 id="tpl-covers">What this {inSentence(t)} covers</h2>
            <ul className="tpl-checks">
              {t.covers.map((c) => (
                <li key={c.label}>
                  <strong>{c.label}</strong>
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </section>

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
                <Link href={`/templates/${t.slug}`}>All countries</Link>
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
        </div>
        <Aside icon={t.icon} name={pageLabel(t, page)} href={href} label={label} source={source} beta={t.beta} />
      </div>

      <div className="wrap tpl-end">
        <CtaBand href={href} label={label} source={`${source}:end`} title={page.kind === "type" ? `Draft your ${page.short.toLowerCase()} ${inSentence(t)} now` : `Draft your ${page.short} ${inSentence(t)} now`} />
        <Disclaimer />
      </div>
    </main>
  );
}
