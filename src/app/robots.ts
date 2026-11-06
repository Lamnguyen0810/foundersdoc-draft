import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/**
 * /robots.txt — the public site and /draft may be read by search engines
 * and AI assistants; the signed-in parts of FD AI may not. (Those pages
 * already say noindex; this saves crawlers the trip.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/auth/",
          "/billing",
          "/history",
          "/settings",
          "/usage",
          "/login",
          "/signup",
          "/zzqa",
          "/draft/",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
