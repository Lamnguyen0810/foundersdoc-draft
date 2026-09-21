import { redirect } from "next/navigation";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import Welcome from "./Welcome";

export const metadata = { title: "Signing you in — FD AI" };
export const dynamic = "force-dynamic";

/**
 * The landing pad for Google and for Supabase's email links.
 *
 * ── IT SHOWS NOTHING, AND THAT IS THE POINT ─────────────────────────────────
 * This used to draw the sign-in card with "Welcome to FD AI — one moment".
 * It was on screen for about a fifth of a second, and in that time it said
 * hello, congratulated the person on arriving, and made them read a sentence
 * about waiting. A step that exists only for technical reasons should not
 * announce itself: the person pressed a button expecting to land in the
 * product, and the product is where they should appear to go.
 *
 * So the page renders nothing at all. The work still happens — see
 * Welcome.tsx — it simply happens behind an empty frame, and the browser moves
 * on before there is anything to look at.
 *
 * ── WHY THE PAGE STILL EXISTS AT ALL ────────────────────────────────────────
 * Because it cannot be removed. Google comes back through PKCE with a `?code=`
 * that must be exchanged by the browser holding the verifier, and an email
 * link comes back with the session in the URL's HASH, which no server ever
 * sees. Both need a browser. This is that browser, doing it silently.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) redirect("/login");

  /* Same rule as /auth/confirm: a relative path on this site, or nothing. An
     open redirect on the end of a sign-in link is how a sign-in page ends up
     hosted on somebody else's domain. */
  const raw = (await searchParams).next ?? "/draft";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/draft";

  return (
    <main
      /* The app's own background, so the moment it is on screen reads as the
         page still loading rather than as a page that arrived empty. */
      style={{ minHeight: "60vh", background: "var(--bg, transparent)" }}
    >
      <Welcome supabaseUrl={url} supabaseKey={key} next={next} />

      {/* The only thing ever drawn here, and only when the one thing this page
          depends on is switched off. */}
      <noscript>
        <p className="note note-warn" style={{ margin: "80px auto", maxWidth: 440 }}>
          This page needs JavaScript to finish signing you in. Turn it on and open the link
          again, or use <b>Forgot your password?</b> on the sign-in screen.
        </p>
      </noscript>
    </main>
  );
}
