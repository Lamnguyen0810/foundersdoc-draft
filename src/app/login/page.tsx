import { Suspense } from "react";
import { redirect } from "next/navigation";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";
import LoginBackdrop from "./LoginBackdrop";

export const metadata = { title: "Sign in — FD AI" };

/**
 * Must be dynamic. Prerendered at build time this page would freeze whichever
 * configuration state existed during the build — which showed "not configured"
 * on a correctly configured deployment. Env vars are read per request here.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();

  if (!url || !key) {
    return (
      <main className="wrap" style={{ maxWidth: 560, paddingTop: 72 }}>
        <p className="kicker">FD AI</p>
        <h1 style={{ fontSize: 28, marginTop: 10 }}>Sign-in is not configured</h1>
        <p className="sub" style={{ marginTop: 12 }}>
          Supabase environment variables are not set, so FD AI is running without accounts. Add{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to enable it. See SETUP_SUPABASE.md.
        </p>
      </main>
    );
  }

  if (await getUser()) redirect("/draft");

  /**
   * The sign-in card floats over the catalogue you are about to reach, blurred
   * and inert behind it. It shows people what they are signing in TO rather
   * than making them take it on trust — and it makes the gate feel like a step
   * in the journey rather than a wall in front of it.
   *
   * The backdrop is decorative: aria-hidden, not focusable, pointer-events off.
   */
  return (
    <div className="login-stage">
      <LoginBackdrop />

      <div className="login-scrim" aria-hidden="true" />

      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <p className="kicker">FD AI</p>
        {/* The firm's name is one thing, so it breaks as one thing. Without the
            non-breaking space the card wrapped after "Founders", leaving "Doc
            account" stranded on the next line — the heading still fits, it just
            chooses a different place to fold. */}
        <h1 id="login-title">Log in to your Founders&nbsp;Doc account</h1>

        <Suspense fallback={null}>
          <LoginForm
            supabaseUrl={url}
            supabaseKey={key}
            /* Read on the server, per request. A NEXT_PUBLIC_ variable read
               inside the client component would be baked in at build time, so
               turning Google on would need a redeploy rather than a setting. */
            google={process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1"}
          />
        </Suspense>

        {/* Not "sign up" — FD AI is not open yet, and only the firm's own
            accounts can sign in. This says what is actually on offer to a
            stranger: a place in the queue. */}
        <p className="login-note">
          <b>AI drafting is coming soon.</b> Be among the first to try it when it launches. Join
          the waitlist today and we will let you know as soon as it is ready.{" "}
          <a href="/signup">Sign up here.</a>
        </p>
      </div>
    </div>
  );
}
