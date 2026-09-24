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
  // Zapier has no browser session. The weekly analytics route authenticates
  // independently with ANALYTICS_REPORT_SECRET and returns aggregate counts
  // only; without this exception middleware would redirect Zapier to /login.
  "/api/analytics/weekly",
  // Feedback typed in Slack arrives from Zapier with a shared secret, which
  // the route and the database both check. No browser, no session.
  "/api/feedback/slack",
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
  "/can-breaching-an-nda-be-expensive",
];

/**
 * Sections of the marketing site that are public all the way down.
 *
 * The blog index lives at /resources and every article is linked as
 * /resources/<slug>/. Listing articles one by one in SITE_PAGES is how they came
 * to be gated: next.config.ts grew a third article and this file did not, so the
 * whole blog answered with a redirect to /login. Middleware runs BEFORE the
 * rewrites, so what arrives here is the pretty URL, not the .html target.
 *
 * A prefix cannot drift. Nothing private has ever lived under /resources.
 */
const PUBLIC_PREFIXES = ["/resources"];

/**
 * The drafting screen itself, and only itself.
 *
 * Anybody may open /draft, pick a document and answer the questions — the
 * account is asked for at Generate, not at the door (see DraftChat's guest
 * notes). Everything underneath stays gated: /draft/<id> is somebody's
 * document, and the API routes that spend credits check for a user
 * themselves. Exact match, so a trailing path never inherits the exception.
 */
const OPEN_DOOR = "/draft";

function isPublic(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === OPEN_DOOR) return true;
  if (SITE_PAGES.includes(path)) return true;
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return true;
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
