import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/seo";
import { SIGN_LIVE } from "@/lib/products/compare";
import { ETA_URL, GUIDES, GUIDES_CHECKED, GUIDE_RELATED, guideBySlug, guidePath } from "@/lib/products/esign-guides";
import { Breadcrumbs, Disclaimer, Faqs, TemplateLd } from "../../templates/parts";
import TemplateCta from "../../templates/TemplateCta";
import "../../templates/templates.css";

/** /e-signature/<guide> (0242): the FD Sign guides — how to sign a PDF online, electronic vs digital
 *  signatures, witnesses. The words are in lib/products/esign-guides.ts. */

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ guide: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ guide: string }> }): Promise<Metadata> {
  const g = guideBySlug((await params).guide);
  if (!g) return {};
  const url = `${SITE}${guidePath(g)}`;
  return {
    title: { absolute: g.title },
    description: g.description,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: { title: g.title, description: g.description, url, siteName: "Founders Doc", type: "article", ...(firstImage(g) ? { images: [{ url: `${SITE}${firstImage(g)!.src}`, width: firstImage(g)!.width, height: firstImage(g)!.height, alt: firstImage(g)!.alt }] } : {}) },
  };
}

function firstImage(g: NonNullable<ReturnType<typeof guideBySlug>>) {
  for (const s of g.sections) for (const st of s.steps ?? []) if (st.image) return st.image;
  return undefined;
}

export default async function GuidePage({ params }: { params: Promise<{ guide: string }> }) {
  const g = guideBySlug((await params).guide);
  if (!g) notFound();
  const url = `${SITE}${guidePath(g)}`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "FD Sign", href: "/e-signature" },
    { name: g.short, href: guidePath(g) },
  ];
  const cta = SIGN_LIVE ? "Send a document for signing" : "Try FD Sign free";
  const source = `guide:${g.slug}`;
  const others = GUIDES.filter((x) => x.slug !== g.slug);

  return (
    <main className="tpl">
      <TemplateLd crumbs={crumbs} faqs={g.faqs} page={{ url, name: g.title, description: g.description }} />
      <div className="wrap tpl-wrap">
        <Breadcrumbs items={crumbs} />
        <header className="tpl-hero">
          <span className="kicker">{g.kicker}</span>
          <h1>{g.h1}</h1>
          <p className="tpl-lead">{g.lead}</p>
          <div className="tpl-hero-actions">
            <TemplateCta href="/fd-sign/new" label={cta} source={source} />
            <a className="tpl-link" href={`#${g.sections[0].id}`}>
              {g.sections[0].h2} ›
            </a>
          </div>
          {g.basis && (
            <span className="tpl-small">
              Based on the{" "}
              <a href={ETA_URL} rel="noopener" target="_blank">
                {g.basis}
              </a>
              , as read on Singapore Statutes Online, {GUIDES_CHECKED}
            </span>
          )}
        </header>

        {g.sections.map((s) => (
          <section className="tpl-section" aria-labelledby={s.id} key={s.id}>
            <h2 id={s.id}>{s.h2}</h2>
            {s.intro && <p style={{ marginBottom: 14 }}>{s.intro}</p>}
            {s.paras?.map((p) => (
              <p key={p.slice(0, 40)} style={{ marginBottom: 12 }}>
                {p}
              </p>
            ))}
            {s.steps && (
              <ol className="tpl-guide-steps">
                {s.steps.map((st, i) => (
                  <li key={st.title}>
                    <div>
                      <span className="tpl-step-n" aria-hidden="true">
                        {i + 1}
                      </span>
                      <h3>{st.title}</h3>
                      <p>{st.text}</p>
                    </div>
                    {st.image && (
                      /* eslint-disable-next-line @next/next/no-img-element -- a plain image: sized, lazy, described, no optimiser needed */
                      <img src={st.image.src} alt={st.image.alt} width={st.image.width} height={st.image.height} loading={i === 0 && s === g.sections[0] ? "eager" : "lazy"} decoding="async" />
                    )}
                  </li>
                ))}
              </ol>
            )}
            {s.points && (
              <dl className={s.gold ? "tpl-points tpl-points-law" : "tpl-points"}>
                {s.points.map((p) => (
                  <div key={p.label}>
                    <dt>{p.label}</dt>
                    <dd>{p.text}</dd>
                  </div>
                ))}
              </dl>
            )}
            {s.list && (
              <ul className="tpl-list">
                {s.list.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            {s.image && (
              <figure className="tpl-guide-figure">
                {/* eslint-disable-next-line @next/next/no-img-element -- a plain image: sized, lazy, described */}
                <img src={s.image.src} alt={s.image.alt} width={s.image.width} height={s.image.height} loading="lazy" decoding="async" />
                {s.caption && <figcaption>{s.caption}</figcaption>}
              </figure>
            )}
            {s.note && (
              <p className="tpl-small" style={{ marginTop: 12 }}>
                {s.note}
              </p>
            )}
          </section>
        ))}

        <Faqs items={g.faqs} />

        <section className="tpl-section" aria-labelledby="guide-related">
          <h2 id="guide-related">Related</h2>
          <ul className="tpl-reading tpl-related">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={guidePath(o)}>{o.h1}</Link>
              </li>
            ))}
            {GUIDE_RELATED.map((r) => (
              <li key={r.href}>
                <Link href={r.href}>{r.title}</Link> — {r.text}
              </li>
            ))}
          </ul>
        </section>

        <section className="tpl-band" aria-label={cta}>
          <h2>{g.band.title}</h2>
          <p>{g.band.text}</p>
          <div className="tpl-band-actions">
            <TemplateCta href="/fd-sign/new" label={cta} source={`${source}:end`} />
            <Link className="tpl-link" href="/fd-consult">
              Talk to a lawyer ›
            </Link>
          </div>
        </section>
        <Disclaimer />
      </div>
    </main>
  );
}
