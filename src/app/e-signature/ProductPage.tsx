import Link from "next/link";
import type { Metadata } from "next";
import { SITE, ORGANIZATION, ldJson } from "@/lib/seo";
import type { Product } from "@/lib/products/data";
import { RIVALS } from "@/lib/products/compare";
import { Breadcrumbs, Disclaimer, Faqs, MoreTemplates, TemplateLd } from "../templates/parts";
import TemplateCta from "../templates/TemplateCta";
import "../templates/templates.css";

/** A public product page (FD Sign, the ESOP dashboard), in the template pages' look. */

export function productMetadata(p: Product): Metadata {
  const url = `${SITE}/${p.slug}`;
  return {
    title: { absolute: p.title },
    description: p.description,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: { title: p.title, description: p.description, url, siteName: "Founders Doc", type: "website" },
  };
}

export default function ProductPage({ p }: { p: Product }) {
  const url = `${SITE}/${p.slug}`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: p.name, href: `/${p.slug}` },
  ];
  const app = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: p.name,
    url,
    description: p.description,
    applicationCategory: p.category,
    operatingSystem: "Web",
    publisher: ORGANIZATION,
  };
  return (
    <main className="tpl">
      <TemplateLd crumbs={crumbs} faqs={p.faqs} page={{ url, name: p.title, description: p.description }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(app) }} />
      <div className="wrap tpl-wrap">
        <Breadcrumbs items={crumbs} />
        <header className="tpl-hero">
          <span className="kicker">{p.kicker}</span>
          <h1>{p.h1}</h1>
          <p className="tpl-lead">{p.lead}</p>
          <div className="tpl-hero-actions">
            <TemplateCta href={p.cta.href} label={p.cta.label} source={`product:${p.slug}`} />
            <Link className="tpl-link" href={p.second.href}>
              {p.second.label}
            </Link>
          </div>
          <span className="tpl-small">{p.small}</span>
        </header>

        <section className="tpl-section" aria-labelledby="pp-features">
          <h2 id="pp-features">What {p.inSentence ?? p.name} does</h2>
          <dl className="tpl-points">
            {p.features.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="tpl-section" aria-labelledby="pp-steps">
          <h2 id="pp-steps">{p.stepsTitle}</h2>
          <ol className="tpl-steps">
            {p.steps.map((s, i) => (
              <li key={s.t}>
                <span className="tpl-step-n" aria-hidden="true">
                  {i + 1}
                </span>
                <strong>{s.t}</strong>
                <span>{s.d}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="tpl-section" aria-labelledby="pp-points">
          <h2 id="pp-points">{p.pointsTitle}</h2>
          <dl className="tpl-points tpl-points-law">
            {p.points.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Faqs items={p.faqs} />

        {p.slug === "e-signature" && (
          <section className="tpl-section" aria-labelledby="pp-compare">
            <h2 id="pp-compare">Compare FD Sign</h2>
            <ul className="tpl-chips">
              {RIVALS.map((r) => (
                <li key={r.slug}>
                  <Link href={`/e-signature/${r.slug}`}>FD Sign vs {r.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="tpl-section" aria-labelledby="pp-related">
          <h2 id="pp-related">Also from Founders Doc</h2>
          <ul className="tpl-chips">
            {p.related.map((r) => (
              <li key={r.href}>
                <Link href={r.href}>{r.label}</Link>
              </li>
            ))}
          </ul>
        </section>
        <MoreTemplates current="" />

        <section className="tpl-band" aria-label={p.cta.label}>
          <h2>{p.cta.label}</h2>
          <p>{p.small}. A Founders Doc lawyer is one click away if you want help.</p>
          <div className="tpl-band-actions">
            <TemplateCta href={p.cta.href} label={p.cta.label} source={`product:${p.slug}:end`} />
            <Link className="tpl-link" href="/contact">
              Talk to us ›
            </Link>
          </div>
        </section>
        <Disclaimer />
      </div>
    </main>
  );
}
