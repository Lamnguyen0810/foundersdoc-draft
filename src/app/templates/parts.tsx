import Link from "next/link";
import { SITE, ORGANIZATION, ldJson } from "@/lib/seo";
import { TRIAL } from "@/lib/billing/plans";
import type { Faq } from "@/lib/templates/data";
import TemplateCta from "./TemplateCta";

/** Shared pieces of the template pages (/templates, /templates/<doc>, /templates/<doc>/<country>). */

export type Crumb = { name: string; href: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="tpl-crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((c, i) => (
          <li key={c.href}>
            {i < items.length - 1 ? <Link href={c.href}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** BreadcrumbList + (optionally) FAQPage, as one JSON-LD graph. */
export function TemplateLd({ crumbs, faqs, page }: { crumbs: Crumb[]; faqs?: Faq[]; page: { url: string; name: string; description: string } }) {
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": `${page.url}#page`,
      url: page.url,
      name: page.name,
      description: page.description,
      inLanguage: "en",
      publisher: { "@id": ORGANIZATION["@id"] },
      breadcrumb: { "@id": `${page.url}#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${page.url}#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE}${c.href}` })),
    },
  ];
  if (faqs?.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${page.url}#faq`,
      mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson({ "@context": "https://schema.org", "@graph": graph }) }} />;
}

export function Faqs({ items, title = "Common questions" }: { items: Faq[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="tpl-section" aria-labelledby="tpl-faq">
      <h2 id="tpl-faq">{title}</h2>
      <div className="tpl-faqs">
        {items.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Steps({ docShort }: { docShort: string }) {
  const steps = [
    { n: "1", t: "Answer a few questions", d: "Plain English, one at a time. Skip anything you are unsure of." },
    { n: "2", t: `FD AI drafts your ${docShort}`, d: "From Founders Doc's own lawyer-written wording, shaped around your answers." },
    { n: "3", t: "Check, edit and download", d: "Change any wording, ask FD AI to explain a clause, then download it as Word." },
  ];
  return (
    <section className="tpl-section" aria-labelledby="tpl-how">
      <h2 id="tpl-how">How it works</h2>
      <ol className="tpl-steps">
        {steps.map((s) => (
          <li key={s.n}>
            <span className="tpl-step-n" aria-hidden="true">
              {s.n}
            </span>
            <strong>{s.t}</strong>
            <span>{s.d}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The closing call to action. */
export function CtaBand({ href, label, source, title }: { href: string; label: string; source: string; title: string }) {
  return (
    <section className="tpl-band" aria-label="Start drafting">
      <h2>{title}</h2>
      <p>
        Your first {TRIAL.credits} documents are free · no card needed. A Founders Doc lawyer is one click away if you want a review.
      </p>
      <div className="tpl-band-actions">
        <TemplateCta href={href} label={label} source={source} />
        <Link className="tpl-link" href="/pricing">
          Check out our pricing ›
        </Link>
      </div>
    </section>
  );
}

export function Disclaimer() {
  return (
    <p className="tpl-note">
      This page is general information, not legal advice. Every deal is different — for advice on your situation,{" "}
      <a href="/contact">talk to a Founders Doc lawyer</a>.
    </p>
  );
}
