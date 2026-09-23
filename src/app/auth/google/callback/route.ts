import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import {
  COOKIE,
  claimsAreOurs,
  decodeHandshake,
  exchangeCode,
  readClaims,
  siteOrigin,
} from "@/lib/auth/google";

/**
 * Step two of "Continue with Google": Google sends the browser back here.
 *
 * ── WHAT HAPPENS, IN ORDER ──────────────────────────────────────────────────
 *   1. The cookie from step one is read and the `state` compared. No cookie,
 *      or a different state, and this is not the answer to a press we made:
 *      back to the sign-in screen.
 *   2. Google's one-time code is swapped for an ID token, server to server,
 *      with our client secret. The browser never sees the secret or the token.
 *   3. The token's claims are checked: our client, our nonce, not expired.
 *   4. THE QUESTION THAT USED TO NEED A WORKAROUND. If the button was on the
 *      sign-in screen, the database is asked whether an account exists for
 *      this email. If not, nothing is created — the person is told to sign up
 *      first. 039 used to answer this by letting Supabase create the account
 *      and then deleting it; now it is answered before anything exists.
 *   5. The token is handed to Supabase, which verifies Google's signature,
 *      creates or loads the account, and writes the session cookie through
 *      the same server client the rest of the app uses.
 *   6. On to `next`.
 *
 * ── WHAT DID NOT CHANGE ─────────────────────────────────────────────────────
 * Supabase still owns the account. 038's gate (registration paused) still
 * runs on the insert and still refuses; 037 still announces the new account
 * in Slack; 004 still grants the trial credits. This route only changed who
 * talks to Google.
 *
 * ── FAILING ────────────────────────────────────────────────────────────────
 * Towards the sign-in screen with a reason it can show, never towards a
 * blank page. The one place it fails OPEN is step 4: if the account check
 * cannot be made (no secret key on the server, 042 not run), the person is
 * signed in as before rather than locked out by a missing migration.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = siteOrigin(req.headers, req.nextUrl.origin);
  const q = req.nextUrl.searchParams;

  const back = (to: string) => {
    const res = NextResponse.redirect(`${origin}${to}`);
    res.cookies.set(COOKIE, "", { path: "/auth/google", maxAge: 0 });
    return res;
  };

  const handshake = decodeHandshake(req.cookies.get(COOKIE)?.value);
  const from = handshake?.intent === "sign-up" ? "/signup" : "/login";

  /* Google's own refusals arrive as ?error=. `access_denied` is the person
     pressing Cancel on Google's screen — not an error of ours, so no message. */
  const googleError = q.get("error");
  if (googleError) {
    return back(googleError === "access_denied" ? from : `${from}?error=google`);
  }

  const code = q.get("code") ?? "";
  const state = q.get("state") ?? "";
  if (!handshake || !code || !state || state !== handshake.state) {
    return back("/login?error=google");
  }

  if (!isSupabaseConfigured()) return back("/login?error=not-configured");

  const idToken = await exchangeCode(origin, code);
  if (!idToken) return back(`${from}?error=google`);

  const claims = readClaims(idToken);
  if (!claims || !claimsAreOurs(claims, handshake.nonce)) {
    console.error("[auth/google] ID token failed the local checks");
    return back(`${from}?error=google`);
  }

  const email = (claims.email ?? "").trim().toLowerCase();

  /* ── 4. sign-in screen, no account: stop here ─────────────────────────── */
  if (handshake.intent === "sign-in" && email && isAdminClientConfigured()) {
    try {
      const { data, error } = await supabaseAdmin().rpc("account_exists", { p_email: email });
      if (error) {
        console.error(
          "[auth/google] could not check whether an account exists — has " +
            "supabase/042_google_on_our_domain.sql been run? " + error.message,
        );
      } else if (data === false) {
        return back("/login?error=no-account");
      }
    } catch (e) {
      console.error("[auth/google] account check threw", e);
    }
  }

  /* ── 5. hand the token to Supabase ────────────────────────────────────── */
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: handshake.nonce,
  });

  if (error) {
    /* 038's gate said no: registration is paused and this would have been a
       new account. Said plainly on the sign-in screen, as before. */
    const refused = /registration_closed|database error|saving new user/i.test(error.message ?? "");
    if (refused) return back("/login?error=registration-closed");
    console.error("[auth/google] signInWithIdToken failed:", error.message);
    return back(`${from}?error=google`);
  }

  return back(handshake.next);
}
