import { redirect } from "next/navigation";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import LoginBackdrop from "../../login/LoginBackdrop";
import Welcome from "./Welcome";

export const metadata = { title: "Opening your account — FD AI" };
export const dynamic = "force-dynamic";

/**
 * The landing pad for Supabase's default email links.
 *
 * It is a page rather than a route handler because the thing it has to read —
 * the session in the URL's hash — is never sent to a server. See the note at
 * the top of Welcome.tsx.
 *
 * It looks like the sign-in card on purpose. This is a person opening an email
 * link at an unknown moment on an unknown device; a blank white page with a
 * spinner on it would be indistinguishable from a broken one, and the redirect
 * that follows is usually fast enough that the card is all they see.
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
     open redirect on the end of an email link is how a sign-in page ends up
     hosted on somebody else's domain. */
  const raw = (await searchParams).next ?? "/draft";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/draft";

  return (
    <div className="login-stage">
      <LoginBackdrop />
      <div className="login-scrim" aria-hidden="true" />

      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <p className="kicker">FD AI</p>
        <h1 id="welcome-title">Welcome to FD AI</h1>
        <Welcome supabaseUrl={url} supabaseKey={key} next={next} />
        <noscript>
          <p className="note note-warn" style={{ marginTop: 16 }}>
            This page needs JavaScript to finish signing you in. Turn it on and open the link
            again, or use <b>Forgot your password?</b> on the sign-in screen.
          </p>
        </noscript>
      </div>
    </div>
  );
}
