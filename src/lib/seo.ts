/**
 * What search engines and AI assistants are told about Founders Doc and
 * FD AI, in one place: the structured data (schema.org JSON-LD) on /draft
 * and the list of public pages for sitemap.xml.
 *
 * The homepage is a static file (public/index.html) and carries the same
 * facts written out by hand — change both together.
 *
 * Only facts the site already states: founded 2021, Singapore, lawyer-backed,
 * a Word draft in minutes, start without an account. Prices come from the
 * price list (billing/plans.ts) and are shown on the public /pricing page,
 * which Google requires before it accepts them here. No ratings: those need
 * real reviews.
 */

import { MEMBERSHIPS, PACKS, TRIAL } from "./billing/plans";

export const SITE = "https://foundersdoc.com";

export const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE}/#organization`,
  name: "Founders Doc",
  url: SITE,
  foundingDate: "2021",
  foundingLocation: "Singapore",
  description:
    "Founders Doc is a legal practice for founders and start-ups, founded in Singapore in 2021, advising early-stage companies around the world.",
  sameAs: [
    "https://www.linkedin.com/company/foundersdoc/",
    "https://www.instagram.com/foundersdoc/",
    "https://www.youtube.com/channel/UCYQebtLCvD2esHthgPAxrFg",
  ],
} as const;

const sgd = (cents: number) => (cents / 100).toFixed(2);

/** What FD AI costs, as schema.org offers: the free trial, pay as you go and the memberships. */
export function fdAiOffers() {
  return [
    {
      "@type": "Offer",
      name: `Free trial — ${TRIAL.credits} documents over ${TRIAL.days} days`,
      price: "0",
      priceCurrency: "SGD",
      url: `${SITE}/pricing#trial`,
    },
    ...PACKS.map((p) => ({
      "@type": "Offer",
      name: p.label,
      price: sgd(p.amountCents),
      priceCurrency: "SGD",
      url: `${SITE}/pricing#credits`,
    })),
    ...MEMBERSHIPS.map((m) => ({
      "@type": "Offer",
      name: `${m.label} membership`,
      price: sgd(m.amountCents),
      priceCurrency: "SGD",
      url: `${SITE}/pricing#memberships`,
      priceSpecification: { "@type": "UnitPriceSpecification", price: sgd(m.amountCents), priceCurrency: "SGD", billingDuration: "P1M", unitText: "month" },
    })),
  ];
}

/** FD AI as an application, for /draft, each document's own link and /pricing. */
export function fdAiLd(opts: { url: string; description: string; documents: string[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${SITE}/draft#fd-ai`,
    name: "FD AI",
    alternateName: "FD AI by Founders Doc",
    url: opts.url,
    description: opts.description,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Legal document drafting",
    operatingSystem: "Any (runs in a web browser)",
    browserRequirements: "Requires JavaScript",
    inLanguage: "en",
    ...(opts.documents.length ? { featureList: opts.documents } : {}),
    offers: fdAiOffers(),
    audience: {
      "@type": "Audience",
      audienceType: "Individuals and businesses",
    },
    creator: ORGANIZATION,
    publisher: { "@id": ORGANIZATION["@id"] },
  };
}

/** JSON for a <script type="application/ld+json">, safe inside HTML. */
export function ldJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The marketing pages served from public/ that should be found (not coming-soon). */
export const PUBLIC_PAGES = ["", "pricing", "about", "contact", "fd-consult", "resources/all", "podcast", "terms-of-service"];
