/**
 * Supabase configuration, with graceful degradation.
 *
 * If Supabase is not configured the app still runs: no login, and document
 * types come from src/lib/doctypes.ts instead of the database. That keeps the
 * sprint 1 property — it works today — while sprint 2 is being wired up.
 *
 * KEY NAMING. Supabase is moving from `anon` / `service_role` keys to
 * `publishable` / `secret` keys. Both are accepted here so the app works
 * whichever your project shows you.
 *
 * The publishable (or anon) key is DESIGNED to be public: it is shipped to the
 * browser and every request it makes is constrained by row-level security. That
 * is why NEXT_PUBLIC_ is correct for it and wrong for everything else. Never put
 * a secret / service_role key in a NEXT_PUBLIC_ variable — it bypasses RLS.
 */

/**
 * The Supabase project URL, normalised and validated.
 *
 * WHY THIS IS NOT JUST `.trim()`. This value is typed by hand into a hosting
 * dashboard, and the two places it is copied FROM both hand you something that
 * is nearly-but-not-quite right: the Data API page shows the REST endpoint
 * (`https://xxx.supabase.co/rest/v1/`) and a copy-paste often carries quotes or
 * a line break. `createServerClient` calls `new URL()` on whatever it is given,
 * so a malformed value throws — and because the auth check runs in middleware,
 * that throw takes down EVERY page on the domain, marketing site included,
 * with MIDDLEWARE_INVOCATION_FAILED and no clue as to the cause.
 *
 * So: repair what is obviously repairable, reject what is not, and say so in
 * the log. Returning null makes `isSupabaseConfigured()` false, which the app
 * already handles by running unauthenticated — a degraded site beats a dead one.
 */
export function supabaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;

  // Strip wrapping quotes, then any path (`/rest/v1/`, `/auth/v1`) and trailing slashes.
  let value = raw.replace(/^['"]|['"]$/g, "").trim();
  value = value.replace(/\/+$/, "");
  value = value.replace(/\/(rest|auth|storage|realtime|functions)\/v\d.*$/i, "");

  // A bare host is a common paste; assume https rather than failing on it.
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocol");
    return parsed.origin;
  } catch {
    console.error(
      `[supabase] NEXT_PUBLIC_SUPABASE_URL is not a usable URL: ${JSON.stringify(raw)}. ` +
        "Expected the project URL, e.g. https://abcdefgh.supabase.co — no path, no quotes. " +
        "Running without Supabase until this is fixed.",
    );
    return null;
  }
}

export function supabasePublishableKey(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    null;
  if (!raw) return null;
  // Same paste hazard as the URL: dashboards happily store the quotes.
  return raw.replace(/^['"]|['"]$/g, "").trim() || null;
}

/** True when both values are present. Everything auth-related checks this first. */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

export function requireSupabaseConfig(): { url: string; key: string } {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local or in Vercel project settings.",
    );
  }
  return { url, key };
}
