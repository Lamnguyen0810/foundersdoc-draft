import "server-only";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { isThrowaway } from "./disposable";

/**
 * Inviting a waitlist address, by hand, from the admin console.
 *
 * ── THIS IS NOT THE MAIN DOOR ANY MORE ──────────────────────────────────────
 * People who sign up choose a password on the page they are already looking
 * at — see RegisterForm — and that path uses Supabase's ordinary sign-up with
 * no admin key anywhere near it. What stops a stranger there is a trigger in
 * the database: an account may be created only for an address on the waitlist,
 * whichever provider asks. See 035_only_the_waitlist_may_register.sql.
 *
 * This remains for the case that path cannot cover: somebody already on the
 * list, from before any of it existed, whom FD wants to reach out to. It
 * creates the account and emails them an invitation, which is a thing only the
 * admin API can do.
 *
 * ── SO THE ADMIN KEY IS STILL HERE, AND STILL DELIBERATE ────────────────────
 * Second home for SUPABASE_SECRET_KEY after the Stripe webhook. The route that
 * calls it checks isAdmin() first, and this checks the waitlist again, because
 * a check belongs where the account is made rather than where the button is
 * drawn. An invited row is also the one case the trigger waves through —
 * GoTrue sets invited_at — so the two agree by construction.
 *
 * ── THE CREDITS ARE NOT GRANTED HERE ────────────────────────────────────────
 * Three credits, fourteen days, by the trigger on auth.users from
 * 004_billing.sql — the same trigger that has always run. So there is no
 * window in which somebody is signed in with an empty wallet, and no way to
 * get a second trial by calling this twice: a repeat is `already`, and no
 * second auth row is created.
 */

export type AccountOutcome =
  /** A new account exists and the invitation email has gone. */
  | "created"
  /** There was already an account for this address. Nothing was changed. */
  | "already"
  /** Not on the waitlist. No account, no email. */
  | "not_on_list"
  /** A throwaway inbox. */
  | "throwaway"
  /** SUPABASE_SECRET_KEY is not set on this deployment. */
  | "not_configured"
  /** Supabase refused to send any more email for now. */
  | "rate_limited"
  /** Something else went wrong; it is in the server log. */
  | "failed";

/** Did Supabase mean "that address already has an account"? */
function meansExists(err: { code?: string; status?: number; message?: string }): boolean {
  if (err.code === "email_exists" || err.code === "user_already_exists") return true;
  return /already (been )?registered|already exists/i.test(err.message ?? "");
}

/** Did Supabase mean "I am not sending any more email this hour"? */
function meansRateLimited(err: { code?: string; status?: number; message?: string }): boolean {
  if (err.status === 429) return true;
  if (err.code === "over_email_send_rate_limit") return true;
  return /rate limit|too many requests/i.test(err.message ?? "");
}

export async function createAccountFor(
  email: string,
  options: { name?: string | null; origin: string },
): Promise<AccountOutcome> {
  const address = email.trim().toLowerCase();

  if (!isAdminClientConfigured()) {
    console.error("[signup] SUPABASE_SECRET_KEY is not set — cannot create accounts.");
    return "not_configured";
  }
  if (isThrowaway(address)) return "throwaway";

  const db = supabaseAdmin();

  /* The gate, checked here rather than trusted from the caller. */
  const { data: onList, error: listError } = await db.rpc("waitlist_has", { p_email: address });
  if (listError) {
    console.error("[signup] waitlist_has failed:", listError.message);
    return /waitlist_has/.test(listError.message) ? "not_configured" : "failed";
  }
  if (onList !== true) return "not_on_list";

  /* ── WHERE THE INVITATION LANDS ────────────────────────────────────────
     /auth/welcome, not /auth/confirm, and the difference is the difference
     between working and not.

     Supabase's DEFAULT invite email — the one every project has until custom
     SMTP is configured, because templates cannot be edited before that —
     sends the person to Supabase, which verifies the token itself and then
     redirects here with the session in the URL's HASH. A hash never reaches a
     server, so /auth/confirm, which reads query parameters, sees an empty
     request and says "bad link". /auth/welcome reads it in the browser.

     A project that HAS edited the template to use {{ .TokenHash }} sends
     people to /auth/confirm instead, which still works and is the better of
     the two. Both are live; neither has to be chosen in advance.

     They have no password yet, and that is survivable: "Forgot your password?"
     on the sign-in screen sets one, and the confirmation on the form says so.
     Sending them to /settings to choose one first would be tidier, and would
     also be the first thing FD AI ever asked of somebody who came to try it. */
  const { error } = await db.auth.admin.inviteUserByEmail(address, {
    redirectTo: `${options.origin}/auth/welcome?next=%2Fdraft`,
    data: options.name ? { full_name: options.name } : undefined,
  });

  if (error) {
    const err = error as { code?: string; status?: number; message?: string };

    /* Already an account. Record it against the waitlist row anyway — the row
       may pre-date all of this, and the admin table should say what is true. */
    if (meansExists(err)) {
      try {
        await db.rpc("waitlist_account_made", { p_email: address });
      } catch {
        /* Bookkeeping only. The answer to the caller is the same either way. */
      }
      return "already";
    }

    if (meansRateLimited(err)) {
      console.error(
        "[signup] Supabase refused to send the invitation: email rate limit. " +
          "Set custom SMTP in Supabase → Project Settings → Auth → SMTP; the built-in " +
          "sender allows only a handful an hour and is not meant for production.",
      );
      return "rate_limited";
    }

    console.error("[signup] invite failed:", err.code, err.status, err.message);
    return "failed";
  }

  const { error: markError } = await db.rpc("waitlist_account_made", { p_email: address });
  if (markError) {
    /* The account exists and the email has gone; only the bookkeeping failed.
       Saying "failed" here would be a lie that makes the caller try again and
       send a second invitation. */
    console.error("[signup] account made but waitlist not marked:", markError.message);
  }

  return "created";
}

/**
 * Is registration open? A row, not a constant.
 *
 * The same row the database trigger reads, which is what makes it a real
 * switch: turning it off does not merely hide a form, it makes the database
 * refuse the account the form would have asked for.
 *
 * ── WHY THIS DEFAULTS TO OPEN AND autoAccountOn() DEFAULTS TO CLOSED ────────
 * They read the same column and disagree about what silence means, on purpose.
 *
 * autoAccountOn() answers "should joining the waitlist hand out an account?",
 * and there the safe failure is no: a waitlist that is not yet handing out
 * accounts is a Tuesday, whereas one handing them out without the switch that
 * closes it again is a problem.
 *
 * This one answers "may a stranger sign up?" on a product that is open, and
 * the safe failure is the other way. A missing secret key, a network blip, a
 * config row somebody deleted — none of those are FD deciding to close the
 * door, and treating them as though they were would take the sign-up form off
 * the front of the product with no error, no log and nobody the wiser until
 * somebody asked why the week had been quiet.
 *
 * 038's trigger makes the same choice (`coalesce(v_auto, true)`), and the two
 * have to agree: a page that hides the form while the database would have
 * accepted it is a lie in one direction, and a page that offers a form the
 * database will refuse is a lie in the other.
 */
export async function registrationOpen(): Promise<boolean> {
  if (!isAdminClientConfigured()) return true;
  try {
    const { data, error } = await supabaseAdmin()
      .from("signup_config")
      .select("auto_account")
      .maybeSingle();

    // Cannot ask, or nothing to read: stay open. See above.
    if (error || !data) return true;
    return data.auto_account !== false;
  } catch {
    return true;
  }
}

/**
 * Does joining the waitlist lead straight to a password? A row, not a constant.
 *
 * Still read by the waitlist API route, which is still reachable for anything
 * outside this application that posts to it. The sign-up screen no longer uses
 * it — see registrationOpen() above for why the two differ.
 */
export async function autoAccountOn(): Promise<boolean> {
  if (!isAdminClientConfigured()) return false;
  try {
    const { data, error } = await supabaseAdmin()
      .from("signup_config")
      .select("auto_account")
      .maybeSingle();

    /* 034 has not been run. The safe direction is OFF: a waitlist that is not
       yet handing out accounts is a Tuesday, whereas one handing them out
       without the switch that closes it again is a problem. */
    if (error || !data) return false;
    return data.auto_account === true;
  } catch {
    return false;
  }
}
