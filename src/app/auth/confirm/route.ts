import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Where Supabase's email links land.
 *
 * "Send password recovery" and "Send magic link" in the Supabase dashboard both
 * email a one-time token and send the person to this address. Without this route
 * those buttons produce a link that goes nowhere — which is exactly what they did
 * before this file existed.
 *
 * The token is exchanged for a session HERE, on the server, so the session cookie
 * is set the normal way and the page the user lands on is already signed in. A
 * recovery link then drops them on /settings to choose a new password.
 *
 * The token is single-use and short-lived: opening the link twice fails, which is
 * correct — a reset link sitting in an inbox should not stay live.
 */
export const dynamic = "force-dynamic";

type OtpType = "recovery" | "magiclink" | "email" | "invite" | "signup" | "email_change";

const ALLOWED: OtpType[] = ["recovery", "magiclink", "email", "invite", "signup", "email_change"];

function fail(req: NextRequest, reason: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(req, "not-configured");

  const params = req.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as OtpType | null;

  // `next` decides where they land afterwards. A recovery link must end on the
  // page where a password is chosen; everything else goes to the workspace.
  const rawNext = params.get("next") ?? (type === "recovery" ? "/settings" : "/draft");
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/draft";

  if (!tokenHash || !type || !ALLOWED.includes(type)) return fail(req, "bad-link");

  // Build the response first so the client can write the session cookie onto it.
  const response = NextResponse.redirect(new URL(next, req.url));

  const supabase = createServerClient(supabaseUrl()!, supabasePublishableKey()!, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // Expired, already used, or tampered with. Say which, without saying whether
    // the address exists.
    return fail(req, "link-expired");
  }

  return response;
}
