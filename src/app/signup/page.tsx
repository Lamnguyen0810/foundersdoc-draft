import { redirect } from "next/navigation";
import Link from "next/link";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import { TRIAL } from "@/lib/billing/plans";
import { registrationOpen } from "@/lib/waitlist/account";
import RegisterForm from "./RegisterForm";
import LoginBackdrop from "../login/LoginBackdrop";

export const metadata = { title: "Start with FD AI — Founders Doc" };
export const dynamic = "force-dynamic";

/**
 * Signing up. One screen, one form, no queue.
 *
 * ── WHAT THIS PAGE USED TO BE ───────────────────────────────────────────────
 * Two steps in one card: leave your details for the waitlist, then choose a
 * password. That was right while FD AI was invitation-only and a database
 * trigger enforced the list. Now that anybody may register, the first step was
 * asking people to queue for something they were already allowed to have —
 * and every step between "I want to try this" and "I am trying this" loses
 * some of them.
 *
 * The waitlist table is untouched and the admin console still reads it. It is
 * a record of who asked before FD opened up, not a gate.
 *
 * ── THE PAGE STILL READS THE SWITCH ─────────────────────────────────────────
 * signup_config.auto_account is no longer a waitlist setting; it is the stop
 * switch — one UPDATE, no deploy, if registration has to be closed at an hour
 * when a deploy is not possible. The database refuses sign-ups while it is
 * off, so this page says so rather than offering a form that cannot work.
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
  // Someone already signed in has no business on a sign-up screen.
  if (await getUser()) redirect("/draft");

  const open = await registrationOpen();
  const google = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

  return (
    <div className="login-stage">
      <LoginBackdrop />
      <div className="login-scrim" aria-hidden="true" />

      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="signup-title">
        <p className="kicker">FD AI</p>
        <h1 id="signup-title">{open ? "Start drafting free" : "New accounts are paused"}</h1>
        <p className="sub">
          {open ? (
            <>
              Your account opens with {TRIAL.credits} documents to use over the next {TRIAL.days}{" "}
              days. No card, no obligation.
            </>
          ) : (
            <>
              We have had to pause new accounts for a moment. Nothing is wrong with yours if you
              already have one — sign in as usual.
            </>
          )}
        </p>

        {open && <RegisterForm supabaseUrl={url} supabaseKey={key} google={google} />}

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
