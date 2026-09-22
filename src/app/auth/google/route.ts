import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Which screen was the Google button on?
 *
 * ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
 * Signing in with Google and signing up with Google are the same request.
 * Google says who the person is; Supabase, meeting a Google identity for the
 * first time, creates an account for it. So "Sign in with Google" on the
 * SIGN-IN screen, pressed by somebody with no account — or whose account was
 * deleted an hour ago — quietly made one and let them in. The sign-in screen
 * could never say "you have no account yet".
 *
 * Nothing on Google's round trip carries which of our screens the person
 * started from. So this route remembers it for them, in two steps:
 *
 *   LEAVING — the button, before it sends the browser to Google, posts here
 *      with the screen it is on. A cookie is set holding the server's clock
 *      and that intent. The server's clock, not the browser's: a laptop five
 *      minutes slow would otherwise misjudge every account below.
 *
 *   ARRIVED — /auth/welcome, having exchanged Google's code for a session,
 *      posts here again. The cookie says where they started; the session says
 *      when the account was created. An account created AFTER the button was
 *      pressed was created BY that press — and if the press was on the
 *      sign-in screen, it should not have been. The account is removed
 *      (039's function, which checks the same facts again from its side) and
 *      the caller is told to sign the person out and send them to sign up.
 *
 * ── WHAT IT NEVER DOES ──────────────────────────────────────────────────────
 * Touch an account that existed before the button was pressed. That is the
 * whole test, and it has no tolerance in the dangerous direction: "created
 * after started" is a comparison of two server clocks a couple of seconds
 * apart, and a real account is minutes or months old.
 *
 * Fail towards letting people in. No cookie, an unreadable cookie, a
 * database that has not had 039 run on it — the person gets the behaviour
 * they had before this route existed. The one exception is a missing 039:
 * they are still signed out and sent to sign up, because that is right and
 * possible without it; only the tidying-up is lost.
 *
 * ── WHY /auth AND NOT /api ──────────────────────────────────────────────────
 * The LEAVING step is posted by somebody who is not signed in yet. Everything
 * under /auth is public in the middleware; /api is not.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "fdai_google_from";
/* Long enough for a slow Google round trip and a "choose an account" screen
   somebody walked away from; short enough that a stale one is gone before it
   could describe a different press. */
const COOKIE_SECONDS = 10 * 60;
/* Two servers' clocks. Vercel and Supabase both keep good time, but "equal"
   is not a thing to rely on between machines. */
const CLOCK_SLACK_MS = 2000;

type Intent = "sign-in" | "sign-up";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { step?: unknown; intent?: unknown };

  if (body.step === "leaving") {
    const intent: Intent = body.intent === "sign-up" ? "sign-up" : "sign-in";
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, `${Date.now()}:${intent}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_SECONDS,
    });
    return res;
  }

  if (body.step !== "arrived") {
    return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  }

  /* Read once, then gone: a cookie that outlives the press it describes
     would describe the next one wrongly. */
  const raw = req.cookies.get(COOKIE)?.value ?? "";
  const [startedText, intentText] = raw.split(":");
  const started = Number(startedText);
  const intent: Intent = intentText === "sign-up" ? "sign-up" : "sign-in";

  const reply = (account: "ok" | "none") => {
    const res = NextResponse.json({ account });
    res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  if (!isSupabaseConfigured()) return reply("ok");
  if (intent === "sign-up") return reply("ok");
  if (!Number.isFinite(started) || started <= 0) return reply("ok");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const provider = (user.app_metadata as { provider?: string } | undefined)?.provider;
  const createdAt = Date.parse(user.created_at ?? "");
  const bornByThisPress =
    provider === "google" && Number.isFinite(createdAt) && createdAt >= started - CLOCK_SLACK_MS;

  if (!bornByThisPress) return reply("ok");

  /* 039. Refuses on its own if the facts above do not hold from the
     database's side. An error here is almost always "039 not run yet". */
  const { error } = await supabase.rpc("leave_without_an_account");
  if (error) {
    console.error(
      "[auth/google] could not remove the account created by a sign-in press — " +
        "has supabase/039_no_account_no_entry.sql been run? " +
        error.message,
    );
  }
  return reply("none");
}
