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
];

const RESOURCE_ARTICLES = [
  "nda-vs-confidentiality-agreement",
  "before-you-sign-an-nda",
  "can-breaching-an-nda-be-expensive",
  "what-is-a-term-sheet",
  "is-a-term-sheet-legally-binding",
  "term-sheet-checklist",
  "term-sheet-mistakes",
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

const nextConfig: NextConfig = {
  async redirects() {
    return STAND_INS.map((r) => ({ ...r, permanent: false }));
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
