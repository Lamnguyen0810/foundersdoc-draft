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

const nextConfig: NextConfig = {
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
