import { redirect } from "next/navigation";
import Link from "next/link";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import { TRIAL } from "@/lib/billing/plans";
import { autoAccountOn } from "@/lib/waitlist/account";
import WaitlistForm from "./WaitlistForm";
import LoginBackdrop from "../login/LoginBackdrop";

export const metadata = { title: "Start with FD AI — Founders Doc" };
export const dynamic = "force-dynamic";

/**
 * The waitlist, which is now also the sign-up — both steps on one screen.
 *
 * Leaving an address here puts a row on the waitlist as it always did, and
 * then, while signup_config.auto_account is on, offers a password straight
 * away. No email in between. What stops a stranger is a trigger in the
 * database — an account may be created only for an address on the waitlist —
 * rather than Supabase's sign-up toggle, which had to be off for the old
 * arrangement and made both a password field and Google sign-in impossible.
 *
 * ── THE PAGE READS THE SWITCH ───────────────────────────────────────────────
 * Because it can be turned off, and a page that promises an account while the
 * database is handing out queue tickets is worse than either. The words follow
 * the setting; nobody has to remember to change them.
 *
 * ── GOOGLE ─────────────────────────────────────────────────────────────────
 * Offered only where NEXT_PUBLIC_GOOGLE_AUTH is set, because the button is
 * useless — worse than useless, it is a dead end on the first screen of the
 * product — until the provider is configured in Supabase with credentials from
 * Google Cloud. One environment variable turns it on once that is done.
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

  const instant = await autoAccountOn();
  const google = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

  return (
    <div className="login-stage">
      <LoginBackdrop />
      <div className="login-scrim" aria-hidden="true" />

      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="waitlist-title">
        <p className="kicker">FD AI</p>
        <h1 id="waitlist-title">{instant ? "Start drafting free" : "Join the waitlist"}</h1>
        <p className="sub">
          {instant ? (
            <>
              Register below and choose a password — your account opens with {TRIAL.credits}{" "}
              documents to use over the next {TRIAL.days} days. No card, no obligation.
            </>
          ) : (
            <>
              FD AI is not open to everyone yet. Leave your details and we will email you the
              moment your place is ready.
            </>
          )}
        </p>

        <WaitlistForm
          instant={instant}
          supabaseUrl={url}
          supabaseKey={key}
          google={google}
        />

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
