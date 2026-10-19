/**
 * What search engines and AI assistants are told about Founders Doc and
 * FD AI, in one place: the structured data (schema.org JSON-LD) on /draft
 * and the list of public pages for sitemap.xml.
 *
 * The homepage is a static file (public/index.html) and carries the same
 * facts written out by hand — change both together.
 *
 * Only facts the site already states: founded 2021, Singapore, lawyer-backed,
 * a Word draft in minutes, start without an account. No prices or ratings.
 */

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

/** FD AI as an application, for /draft and each document's own link. */
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
    featureList: opts.documents,
    audience: {
      "@type": "BusinessAudience",
      audienceType: "Founders and start-ups",
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
export const PUBLIC_PAGES = ["", "about", "contact", "fd-consult", "resources/all", "podcast", "terms-of-service"];
