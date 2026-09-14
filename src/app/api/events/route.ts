import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cleanProps, isEventName } from "@/lib/events";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Where events are recorded.
 *
 * WHY A SERVER ROUTE AND NOT A DIRECT CALL FROM THE BROWSER
 *   Three things can only be decided here, away from anything a visitor can
 *   edit: the country and device are read from request headers rather than
 *   trusted from the page, the path is stripped of its query string before it
 *   is stored, and the signed-in user is taken from the session cookie instead
 *   of being claimed by the caller.
 *
 * WHY IT NEVER RETURNS AN ERROR TO THE PAGE
 *   Analytics is the least important thing happening on any screen it runs on.
 *   A failed insert must never colour a button red or block a draft, so every
 *   outcome is 204. Problems go to the server log, where they belong.
 */
export const dynamic = "force-dynamic";

const NO_CONTENT = new NextResponse(null, { status: 204 });

/** Phones and tablets, from the UA string. Coarse on purpose: three buckets is
 *  all a design decision ever needs, and finer detail is fingerprinting. */
function deviceOf(ua: string): "mobile" | "tablet" | "desktop" {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s)) return "mobile";
  return "desktop";
}

/** Host only. A full referrer carries search terms and private link ids. */
function refHost(referrer: unknown, selfHost: string): string | null {
  if (typeof referrer !== "string" || referrer === "") return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host === selfHost.replace(/^www\./, "") ? "direct" : host.slice(0, 120);
  } catch {
    return null;
  }
}

/** Path without the query string: /draft/7f3c… must not become a report row. */
function cleanPath(path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  return path.split(/[?#]/)[0].slice(0, 200);
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NO_CONTENT;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NO_CONTENT;
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  if (!isEventName(payload.name)) return NO_CONTENT;

  const anonId =
    typeof payload.anon_id === "string" ? payload.anon_id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40) : null;

  // Vercel puts the country on the request; the browser is never asked.
  const country = req.headers.get("x-vercel-ip-country");
  const device = deviceOf(req.headers.get("user-agent") ?? "");

  const supabase = createServerClient(supabaseUrl()!, supabasePublishableKey()!, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      // The route never signs anyone in or out, so it has nothing to write back.
      setAll() {},
    },
  });

  const { error } = await supabase.rpc("record_event", {
    p_name: payload.name,
    p_anon_id: anonId,
    p_path: cleanPath(payload.path),
    p_referrer_host: refHost(payload.referrer, req.nextUrl.hostname),
    p_country: country,
    p_device: device,
    p_props: cleanProps(payload.props),
  });

  if (error) {
    // A missing function means 003_events.sql has not been run yet. Say so
    // once, clearly, rather than leaving a silent hole in the reports.
    console.error("[events] could not record:", error.message);
  }

  return NO_CONTENT;
}
