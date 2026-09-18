"use client";

import { useEffect } from "react";
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
  useEffect(() => {
    /* No state is set here, deliberately: the markup below is the same before
       and after, so there is nothing to re-render and nothing to get out of
       step with the browser's own idea of where it is going. */
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);

    const leave = (to: string) => window.location.replace(to);

    /* An expired or already-used link. Supabase says so in the hash rather
       than by failing, and the sign-in screen already knows this word. */
    if (params.get("error") || params.get("error_code")) {
      leave("/login?error=link-expired");
      return;
    }

    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    /* Nothing in the hash at all. Somebody typed the address, or a mail client
       stripped the fragment. Either way there is no session to establish, and
       the sign-in screen is where they should be. */
    if (!access_token || !refresh_token) {
      leave("/login?error=bad-link");
      return;
    }

    const supabase = createBrowserClient(supabaseUrl, supabaseKey);
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
  }, [supabaseUrl, supabaseKey, next]);

  return (
    <p className="sub" style={{ marginTop: 18 }}>
      One moment — opening your account…
    </p>
  );
}
