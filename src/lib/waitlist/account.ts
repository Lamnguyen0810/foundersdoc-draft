import "server-only";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { isThrowaway } from "./disposable";

/**
 * Turning a waitlist address into an account.
 *
 * ── WHY THIS USES THE ADMIN KEY, WHICH NOTHING ELSE MAY ─────────────────────
 * Supabase's own sign-up is switched OFF, and it stays off. That is what makes
 * the waitlist a real gate rather than a label: with public sign-up on, anyone
 * could create an account by talking to Supabase directly and the list would
 * guard nothing.
 *
 * With it off, there is exactly one way to create an account — the admin API —
 * and exactly one place that may do it: here. Every caller has already checked
 * that the address is on the list, and this checks again, because the check
 * belongs where the account is made and not where the button is drawn.
 *
 * This is the second home for SUPABASE_SECRET_KEY, after the Stripe webhook.
 * It is not a convenience: there is no policy that can express "create a user",
 * because the user does not exist yet to have permissions.
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

/** Does joining the waitlist create the account at once? A row, not a constant. */
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
