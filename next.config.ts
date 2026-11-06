import type { NextConfig } from "next";

/**
 * The marketing site and FD AI are ONE deployment on ONE domain.
 *
 * The nine static pages of foundersdoc.com live in `public/` untouched — same
 * markup, same inline stylesheets, same assets. These rewrites give them their
 * clean URLs back (`/about` rather than `/about.html`), which is what the old
 * standalone deployment did with `vercel.json`'s `cleanUrls`.
 *
 * `beforeFiles` matters: it runs ahead of the App Router, so `/` resolves to the
 * marketing homepage rather than being claimed by a Next.js page. Everything the
 * app owns — /draft, /login, /history, /usage, /api/* — is untouched here and
 * falls through to the App Router as normal.
 */
const SITE_PAGES = [
  "about",
  "contact",
  "fd-consult",
  "resources",
  "podcast",
  "coming-soon",
  "terms-of-service",
  "nda-vs-confidentiality-agreement",
  "before-you-sign-an-nda",
  "can-breaching-an-nda-be-expensive",
  "what-is-a-term-sheet",
  "is-a-term-sheet-legally-binding",
  "term-sheet-checklist",
  "term-sheet-mistakes",
  "how-to-draft-an-nda-online",
];

const RESOURCE_ARTICLES = [
  "nda-vs-confidentiality-agreement",
  "before-you-sign-an-nda",
  "can-breaching-an-nda-be-expensive",
  "what-is-a-term-sheet",
  "is-a-term-sheet-legally-binding",
  "term-sheet-checklist",
  "term-sheet-mistakes",
  "how-to-draft-an-nda-online",
];

/**
 * Pages the old WordPress site had and every footer still links to. Until
 * each has a real page, a visitor lands somewhere sensible instead of a 404:
 * the terms go to the Terms of Service, the other two to "Coming soon".
 * Temporary (307) so search engines don't treat the stand-in as the page.
 * When a real page is built, delete its line here and add it to SITE_PAGES.
 */
const STAND_INS = [
  { source: "/terms-conditions", destination: "/terms-of-service" },
  { source: "/privacy-policy", destination: "/coming-soon?f=Our%20privacy%20policy" },
  { source: "/community-guidelines", destination: "/coming-soon?f=Our%20community%20guidelines" },
];

/**
 * Old WordPress addresses that search engines still list (6 Nov 2026: About Us,
 * Services, the template shop, Infographics, FD MXMN...). Since the new site went
 * live they were 404s, so Google was dropping them and the trust they had built
 * was lost. Permanent (308) redirects pass that on to the matching new page.
 * Add more from Search Console > Pages > "Not found (404)".
 */
const OLD_SITE = [
  { source: "/about-us", destination: "/about" },
  { source: "/contact-us", destination: "/contact" },
  { source: "/services", destination: "/fd-consult" },
  { source: "/services/:path*", destination: "/fd-consult" },
  { source: "/product/:path*", destination: "/templates" },
  { source: "/shop", destination: "/templates" },
  { source: "/shop/:path*", destination: "/templates" },
  { source: "/infographics", destination: "/resources/all" },
  { source: "/resources/fundraising", destination: "/resources/all" },
  { source: "/blog", destination: "/resources/all" },
  { source: "/category/:path*", destination: "/resources/all" },
  { source: "/tag/:path*", destination: "/resources/all" },
  { source: "/fd-mxmn", destination: "/" },
  { source: "/my-account", destination: "/login" },
  { source: "/my-account/:path*", destination: "/login" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [...STAND_INS.map((r) => ({ ...r, permanent: false })), ...OLD_SITE.map((r) => ({ ...r, permanent: true }))];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        ...SITE_PAGES.map((p) => ({ source: `/${p}`, destination: `/${p}.html` })),
        // Trailing-slash variants, because links out in the wild have both.
        ...SITE_PAGES.map((p) => ({ source: `/${p}/`, destination: `/${p}.html` })),
        { source: "/resources/all", destination: "/resources.html" },
        { source: "/resources/all/", destination: "/resources.html" },
        ...RESOURCE_ARTICLES.map((p) => ({
          source: `/resources/${p}`,
          destination: `/${p}.html`,
        })),
        ...RESOURCE_ARTICLES.map((p) => ({
          source: `/resources/${p}/`,
          destination: `/${p}.html`,
        })),
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
