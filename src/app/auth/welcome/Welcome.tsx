"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Where Supabase's OWN email links land.
 *
 * ── WHY THIS EXISTS BESIDE /auth/confirm ────────────────────────────────────
 * There are two shapes of Supabase email link, and which one arrives depends
 * on a template FD may not be able to edit.
 *
 *   {{ .TokenHash }} — the template this codebase prefers. The token comes
 *      back as a QUERY parameter, /auth/confirm exchanges it on the server,
 *      and the person arrives already signed in. Editing templates in Supabase
 *      requires custom SMTP, so this is not available on every project.
 *
 *   {{ .ConfirmationURL }} — the DEFAULT template, which cannot be changed
 *      until SMTP is set up. It sends the person to Supabase, which verifies
 *      the token itself and then redirects here with the session in the URL
 *      HASH: #access_token=…&refresh_token=….
 *
 * A hash is never sent to a server. No amount of work in a route handler can
 * see it — which is why the default link, pointed at /auth/confirm, produced
 * "bad link" and nothing else. It has to be read in the browser, and this is
 * the browser.
 *
 * So both templates work, and FD can set SMTP up when it suits rather than
 * before anybody can sign in at all.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 * It does not decide anything. The token was already verified by Supabase
 * before this page was ever loaded; all this does is hand the tokens to the
 * client library, which writes the session cookie the rest of the app reads.
 * A forged hash produces a session Supabase will not honour on the next
 * request, which is the same answer as no session at all.
 *
 * ── AND IT DRAWS NOTHING ────────────────────────────────────────────────────
 * Normally this is on screen for about a fifth of a second, so anything it
 * said would be a flicker the person had no time to read and no reason to
 * want. It renders null and gets out of the way.
 *
 * The exception is when it is NOT quick. An exchange that hangs — a slow
 * network, Supabase having a bad minute — would otherwise leave somebody
 * looking at an empty page with no idea whether it was working. After four
 * seconds, and only then, one quiet line appears.
 */
export default function Welcome({
  supabaseUrl,
  supabaseKey,
  next,
}: {
  supabaseUrl: string;
  supabaseKey: string;
  next: string;
}) {
  /* Nothing is shown until this turns true, which in the normal case never
     happens because the browser has already left. */
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    /* Set from a timer rather than during the effect, so the first paint is
       empty and stays empty for as long as this is behaving. */
    const tooLong = setTimeout(() => setSlow(true), 4000);

    /* ── TWO SHAPES OF ANSWER, AND THEY ARRIVE IN DIFFERENT PLACES ─────────
       Google and the email links do not come back the same way, and reading
       only one of them is how half the ways into this product break while the
       other half look fine.

         GOOGLE, and any OAuth provider, goes through PKCE. Supabase sends the
         browser back with `?code=…` as a QUERY parameter, and that code has
         to be exchanged for a session using a verifier this browser stored on
         its way out.

         AN EMAIL LINK on the default template comes back with the session
         itself in the URL's HASH — #access_token=…&refresh_token=… — which
         never reaches a server at all.

       So both are read, and errors are looked for in both, because a refusal
       arrives as a query parameter on one path and a fragment on the other. */
    const url = new URL(window.location.href);
    const query = url.searchParams;
    const fragment = new URLSearchParams(
      window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "",
    );
    const pick = (key: string) => query.get(key) ?? fragment.get(key);

    const leave = (to: string) => {
      clearTimeout(tooLong);
      window.location.replace(to);
    };

    /* Something went wrong, and Supabase says so in the URL rather than by
       failing. Two cases are worth telling apart, because the answers are
       opposite: "open the link again" and "you are not on the list". */
    const errorCode = pick("error_code") ?? "";
    const errorText = pick("error_description") ?? pick("error") ?? "";
    if (errorCode || errorText) {
      /* The gate refused. Nearly always Google: signing in with Google for the
         first time IS creating an account, the trigger raised, GoTrue turned
         that into a database error, and the person is standing on the first
         screen of the product with no idea why. */
      const refused =
        /not_on_waitlist|registration_closed|database error|saving new user/i.test(
          `${errorCode} ${errorText}`,
        );
      leave(refused ? "/login?error=not-on-waitlist" : "/login?error=link-expired");
      return;
    }

    const supabase = createBrowserClient(supabaseUrl, supabaseKey);

    /* ── THE GOOGLE PATH ──────────────────────────────────────────────────
       Exchanged in the browser, by the same client that started the sign-in,
       because it is the only one holding the verifier that proves this is the
       browser the code was issued to. */
    const code = query.get("code");
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          if (!error) {
            leave(next);
            return;
          }
          /* The trigger can also refuse HERE rather than at the redirect,
             depending on where in the dance the account would have been
             created — so the same reading is done again on the message. */
          const refused = /not_on_waitlist|registration_closed|database error|saving new user/i.test(
            error.message ?? "",
          );
          leave(refused ? "/login?error=not-on-waitlist" : "/login?error=link-expired");
        })
        .catch(() => leave("/login?error=link-expired"));
      return;
    }

    /* ── THE EMAIL-LINK PATH ──────────────────────────────────────────────── */
    const access_token = fragment.get("access_token");
    const refresh_token = fragment.get("refresh_token");

    /* Nothing in either place. Somebody typed the address, or a mail client
       stripped the fragment. Either way there is no session to establish, and
       the sign-in screen is where they should be. */
    if (!access_token || !refresh_token) {
      leave("/login?error=bad-link");
      return;
    }

    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          leave("/login?error=link-expired");
          return;
        }
        /* replace, not assign: the URL still carries the tokens in its hash,
           and it should not be sitting in the back button afterwards. */
        leave(next);
      })
      .catch(() => leave("/login?error=link-expired"));

    return () => clearTimeout(tooLong);
  }, [supabaseUrl, supabaseKey, next]);

  if (!slow) return null;

  return (
    <p className="sub" style={{ margin: "80px auto", maxWidth: 440, textAlign: "center" }}>
      Still signing you in — one moment.
    </p>
  );
}
