import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

/**
 * A database client that bypasses row-level security. Read this before using it.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 * Everywhere else in this app, the rule is: never touch the Supabase secret
 * key. That rule is right, and it stands. There is exactly one job it cannot
 * cover.
 *
 * A Stripe webhook arrives from Stripe's servers. There is no browser, no
 * cookie and no signed-in user — yet it must add credits to somebody's account.
 * No policy can authorise that, because policies answer "what may THIS user
 * do", and there is no user. So the webhook, and only the webhook, uses this.
 *
 * ── WHAT KEEPS IT SAFE ──────────────────────────────────────────────────────
 *   1. `import "server-only"` — the build FAILS if this file is ever pulled
 *      into a client component. It cannot reach a browser by accident.
 *   2. The variable has no NEXT_PUBLIC_ prefix, so Next.js will not inline it
 *      into the bundle.
 *   3. The only caller is the webhook route, and that route refuses to act on
 *      any request whose Stripe signature does not verify. A forged POST is
 *      rejected before this client is ever constructed.
 *
 * ── WHAT MUST NEVER HAPPEN ──────────────────────────────────────────────────
 *   Do not use this to "make a query easier". If a page needs data, the answer
 *   is a policy, not this. Every use of this client is a place where one wrong
 *   `where` clause exposes every customer's billing to one customer.
 */
export function supabaseAdmin() {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. The Stripe webhook needs it to credit accounts. " +
        "Set it in Vercel as a SECRET (never NEXT_PUBLIC_).",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isAdminClientConfigured(): boolean {
  return Boolean(
    supabaseUrl() && (process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  );
}
