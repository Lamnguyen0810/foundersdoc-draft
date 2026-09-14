import type { Metadata } from "next";
import "./globals.css";
import { AppNav, SiteFooter } from "@/components/SiteChrome";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "FD AI — Drafting", template: "%s · FD AI" },
  description:
    "Draft legal documents in minutes. Built by Founders Doc, reviewed by practising lawyers.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const user = configured ? await getUser() : null;

  return (
    <html lang="en-GB">
      <head>
        {/* Paints the theme before the first frame, so a visitor who chose dark
            never sees a white flash. Byte-for-byte the script foundersdoc.com
            runs, including the same storage key and the same light default —
            two copies of one behaviour, which is why it is inline rather than a
            component. It must stay ahead of the stylesheet link below. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add("js");(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem("fd-theme")}catch(e){}if(t!=="light"&&t!=="dark")t="light";d.setAttribute("data-theme",t)})();`,
          }}
        />

        {/* Same two families, same source as foundersdoc.com, so the app and the
            site render identically. Loaded here rather than via next/font so the
            build never depends on reaching Google. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font --
            The rule targets the Pages Router, where a font link in one page
            loads only for that page. This is the App Router root layout, so it
            applies to every route. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@500;600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f0f0f" media="(prefers-color-scheme: dark)" />
      </head>
      <body>
        <p className="strip-warn">
          <strong>AI-generated draft</strong> — must be reviewed by a qualified lawyer before use.
          Do not enter confidential client material while a free-tier API key is in use.
        </p>

        {!configured && (
          <p className="strip-dark">
            Running without accounts — nothing is saved. See SETUP_SUPABASE.md to enable sign-in.
          </p>
        )}

        <AppNav signedIn={Boolean(user)} userEmail={user?.email} />

        {children}

        <SiteFooter />
      </body>
    </html>
  );
}
