import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/seo";
import { BOTH, FD_SIGN_EXTRAS, PRICES_CHECKED, RIVALS, SIGN_LIVE, rivalBySlug } from "@/lib/products/compare";
import { Breadcrumbs, Disclaimer, Faqs, TemplateLd } from "../../templates/parts";
import TemplateCta from "../../templates/TemplateCta";
import "../../templates/templates.css";

/** /e-signature/<docusign|hellosign|pandadoc>-alternative (0220): FD Sign compared, for people searching for another tool. */

export const dynamicParams = false;

export function generateStaticParams() {
  return RIVALS.map((r) => ({ vs: r.slug }));
}

type Params = Promise<{ vs: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const r = rivalBySlug((await params).vs);
  if (!r) return {};
  const url = `${SITE}/e-signature/${r.slug}`;
  return {
    title: { absolute: r.title },
    description: r.description,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: { title: r.title, description: r.description, url, siteName: "Founders Doc", type: "website" },
  };
}

export default async function AlternativePage({ params }: { params: Params }) {
  const r = rivalBySlug((await params).vs);
  if (!r) notFound();
  const url = `${SITE}/e-signature/${r.slug}`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "FD Sign", href: "/e-signature" },
    { name: `${r.name} alternative`, href: `/e-signature/${r.slug}` },
  ];
  const others = RIVALS.filter((x) => x.slug !== r.slug);

  return (
    <main className="tpl">
      <TemplateLd crumbs={crumbs} faqs={r.faqs} page={{ url, name: r.title, description: r.description }} />
      <div className="wrap tpl-wrap">
        <Breadcrumbs items={crumbs} />
        <header className="tpl-hero">
          <span className="kicker">FD Sign · {r.name} alternative</span>
          <h1>{r.h1}</h1>
          <p className="tpl-lead">{r.lead}</p>
          <div className="tpl-hero-actions">
            <TemplateCta href="/fd-sign/new" label={SIGN_LIVE ? "Try FD Sign" : "Try FD Sign free"} source={`compare:${r.slug}`} />
            <Link className="tpl-link" href="/e-signature">
              How FD Sign works ›
            </Link>
          </div>
          <span className="tpl-small">{SIGN_LIVE ? "Half DocuSign's price · signers need no account" : "Free with an FD AI account · signers need no account"}</span>
        </header>

        <section className="tpl-section" aria-labelledby="cmp-price">
          <h2 id="cmp-price">FD Sign vs {r.fullName}: price</h2>
          <div className="cmp-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">What</span>
                  </th>
                  <th scope="col">FD Sign</th>
                  <th scope="col">{r.name}</th>
                </tr>
              </thead>
              <tbody>
                {r.prices.map(([what, us, them]) => (
                  <tr key={what}>
                    <th scope="row">{what}</th>
                    <td className="cmp-us">{us}</td>
                    <td>{them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tpl-small">
            {r.name} prices and limits from{" "}
            <a href={r.pricingUrl} rel="nofollow noopener" target="_blank">
              their pricing page
            </a>{" "}
            on {PRICES_CHECKED}, in US dollars; they may have changed since.
          </p>
        </section>

        <section className="tpl-section" aria-labelledby="cmp-both">
          <h2 id="cmp-both">What both do</h2>
          <ul className="tpl-list cmp-both">
            {BOTH.map((b) => (
              <li key={b}>✓ {b}</li>
            ))}
          </ul>
        </section>

        <section className="tpl-section" aria-labelledby="cmp-why">
          <h2 id="cmp-why">Why people look for a {r.name} alternative</h2>
          <dl className="tpl-points">
            {r.why.map((w) => (
              <div key={w.label}>
                <dt>{w.label}</dt>
                <dd>{w.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="tpl-section" aria-labelledby="cmp-extras">
          <h2 id="cmp-extras">What FD Sign adds</h2>
          <dl className="tpl-points">
            {FD_SIGN_EXTRAS.map((w) => (
              <div key={w.label}>
                <dt>{w.label}</dt>
                <dd>{w.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Faqs items={r.faqs} />

        <section className="tpl-section" aria-labelledby="cmp-more">
          <h2 id="cmp-more">More comparisons</h2>
          <ul className="tpl-chips">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/e-signature/${o.slug}`}>{o.name} alternative</Link>
              </li>
            ))}
            <li>
              <Link href="/e-signature">FD Sign</Link>
            </li>
            <li>
              <Link href="/templates">Free legal templates</Link>
            </li>
          </ul>
        </section>

        <section className="tpl-band" aria-label={SIGN_LIVE ? "Try FD Sign" : "Try FD Sign free"}>
          <h2>Send your next contract with FD Sign</h2>
          <p>{SIGN_LIVE ? "Half DocuSign's price, per account." : "Free with an FD AI account."} A Founders Doc lawyer is one click away if you want the document checked first.</p>
          <div className="tpl-band-actions">
            <TemplateCta href="/fd-sign/new" label={SIGN_LIVE ? "Try FD Sign" : "Try FD Sign free"} source={`compare:${r.slug}:end`} />
            <Link className="tpl-link" href="/fd-consult">
              Talk to a lawyer ›
            </Link>
          </div>
        </section>
        <p className="tpl-note">
          {r.fullName} is a trademark of its owner. Founders Doc is not affiliated with, endorsed or sponsored by them; the name is used only to compare.
        </p>
        <Disclaimer />
      </div>
    </main>
  );
}
