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
 * The waitlist, which is now also the sign-up.
 *
 * Leaving an address here puts a row on the waitlist as it always did, and —
 * while signup_config.auto_account is on — creates the account too, with three
 * documents to use over a fortnight. Supabase's own sign-up stays off, so this
 * form is the only door there is.
 *
 * ── THE PAGE READS THE SWITCH ───────────────────────────────────────────────
 * Because it can be turned off, and a page that promises an account while the
 * database is handing out queue tickets is worse than either. The words follow
 * the setting; nobody has to remember to change them.
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
              Leave your address and we will email you a link to your account — with{" "}
              {TRIAL.credits} documents to use over the next {TRIAL.days} days. No card, no
              obligation.
            </>
          ) : (
            <>
              FD AI is not open to everyone yet. Leave your details and we will email you the
              moment your place is ready.
            </>
          )}
        </p>

        <WaitlistForm instant={instant} />

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
