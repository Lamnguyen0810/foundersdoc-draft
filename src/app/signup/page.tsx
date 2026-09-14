import { redirect } from "next/navigation";
import Link from "next/link";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import WaitlistForm from "./WaitlistForm";
import LoginBackdrop from "../login/LoginBackdrop";

export const metadata = { title: "Join the FD AI waitlist — Founders Doc" };
export const dynamic = "force-dynamic";

/**
 * The waitlist, not a sign-up.
 *
 * FD AI is not open yet: only the firm's own accounts can sign in. So the
 * "Sign up here" link does not create an account — it takes a name and an
 * address and puts them in a queue the admin workspace can see.
 *
 * This deliberately reuses the login screen's card, scrim and blurred
 * catalogue, because a visitor clicking a link on the sign-in card should feel
 * they have moved one step sideways, not landed somewhere else.
 */
export default async function SignupPage() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) redirect("/login");
  // Someone already signed in has no business on a waitlist.
  if (await getUser()) redirect("/draft");

  return (
    <div className="login-stage">
      <LoginBackdrop />
      <div className="login-scrim" aria-hidden="true" />

      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="waitlist-title">
        <p className="kicker">FD AI</p>
        <h1 id="waitlist-title">Join the waitlist</h1>
        <p className="sub">
          FD AI is not open to everyone yet. Leave your details and we will email you the moment
          your place is ready.
        </p>

        <WaitlistForm />

        <p className="login-note">
          <b>Need something drafted now?</b> You do not have to wait for the software —{" "}
          <Link href="/contact">book a consultation</Link> and speak to a lawyer this week.
        </p>

        <p className="login-note" style={{ borderTop: "none", paddingTop: 0, marginTop: 10 }}>
          Already have an account? <Link href="/login">Sign in</Link>.
        </p>
      </div>
    </div>
  );
}
