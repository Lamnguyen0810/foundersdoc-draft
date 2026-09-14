import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./config";

/**
 * Paths reachable without a session. Everything else requires one.
 *
 * The marketing site and FD AI share a domain and a deployment, so this list is
 * what keeps foundersdoc.com readable by the public while the drafting
 * workspace stays behind the gate. A page missing from this list does not leak
 * — it redirects to /login, which is the safe direction to fail.
 */
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth",
  // Event recording must work for visitors who are not signed in — a page view
  // on the public website is the commonest event there is. It spends no AI
  // quota and writes through a function that decides what a row may contain,
  // so it is safe to leave open in a way that /api/generate is not.
  "/api/events",
  // Joining the waitlist happens before anyone has an account, by definition.
  "/api/waitlist",
  // Stripe posts here from its own servers with no cookie and no session. It
  // authenticates with a signature instead, which the route verifies before it
  // reads a single byte — see the route's own notes.
  "/api/billing/webhook",
];

/** The static marketing pages, served from `public/` (see next.config.ts). */
const SITE_PAGES = [
  "/",
  "/about",
  "/contact",
  "/fd-consult",
  "/resources",
  "/podcast",
  "/coming-soon",
  "/terms-of-service",
  "/nda-vs-confidentiality-agreement",
  "/before-you-sign-an-nda",
];

function isPublic(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (SITE_PAGES.includes(path)) return true;
  // The rewrite target, in case anyone reaches the file directly.
  if (path.endsWith(".html")) return true;
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Refreshes the auth cookie on every request and redirects anonymous users to
 * /login. When Supabase is not configured the app runs unauthenticated, so this
 * is a no-op — see config.ts for why.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  try {
    return await checkSession(request);
  } catch (err) {
    // NOTHING thrown in here may reach Vercel. Middleware runs before every
    // route, so an uncaught throw is MIDDLEWARE_INVOCATION_FAILED on every URL
    // on the domain — the marketing site included — which is a far worse
    // outcome than a broken login. Fail towards a readable public site: serve
    // the public pages, and send gated ones to /login (itself public, so no
    // redirect loop) where the person sees a real message instead of a 500.
    console.error("[middleware] auth check failed; serving without a session.", err);
    if (isPublic(request.nextUrl.pathname)) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    url.searchParams.set("error", "auth-unavailable");
    return NextResponse.redirect(url);
  }
}

async function checkSession(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl()!, supabasePublishableKey()!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not put any logic between createServerClient and getUser(): it is what
  // refreshes an expired token, and skipping it logs users out at random.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
