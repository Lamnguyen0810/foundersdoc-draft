import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "./config";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Reads and writes the session cookie, so the user's identity is established
 * on the server — never trusted from the browser.
 */
export async function createClient() {
  const { url, key } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session instead, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * The signed-in user, or null. Uses getUser() rather than getSession() because
 * getUser() revalidates the token with Supabase; a session read from a cookie
 * alone can be forged.
 */
export async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/**
 * Is the signed-in person an administrator?
 *
 * Asks the DATABASE, via the same `is_admin()` function the row-level security
 * policies use. That matters: if this used its own idea of who is an admin —
 * an email allow-list in code, say — then the page's answer and the database's
 * answer could disagree, and a page that shows a button the database will not
 * honour is worse than no button.
 *
 * Fails closed. Anything unexpected means "not an admin".
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("is_admin");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
