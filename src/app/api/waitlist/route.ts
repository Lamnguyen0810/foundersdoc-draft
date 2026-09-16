import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { sendMail } from "@/lib/email/send";
import { waitlistWelcome } from "@/lib/email/waitlist-welcome";
import { siteUrl } from "@/lib/billing/stripe";
import { notifyWaitlistWebhook } from "@/lib/waitlist/notify";

/**
 * Joining the waitlist.
 *
 * Open to anyone — it has to be, nobody has an account yet. Three things keep
 * that from being a liability:
 *
 *   The database function is the only way in, and it decides what a row may
 *   contain. This route cannot write an arbitrary record even if it wanted to.
 *
 *   The reply is identical whether the address was new or already on the list.
 *   Otherwise this becomes a way to check, one address at a time, who has shown
 *   interest in a law firm's product.
 *
 *   The welcome email is best-effort and never blocks the answer. Being on the
 *   list is what the person came for; the email is a courtesy. If the mail
 *   provider is down or not configured, they are still on the list and still
 *   see the confirmation.
 */
export const dynamic = "force-dynamic";

const OK = { ok: true } as const;

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not available yet." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

  const email = str(body.email, 200);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const name = str(body.name, 120);
  const supabase = createServerClient(supabaseUrl()!, supabasePublishableKey()!, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {},
    },
  });

  const company = str(body.company, 160);
  const note = str(body.note, 1000);
  const source = str(body.source, 80) ?? "signup_modal";
  const { data: joined, error } = await supabase.rpc("join_waitlist", {
    p_email: email,
    p_name: name,
    p_company: company,
    p_note: note,
    p_source: source,
  });

  if (error) {
    // A missing function means 005_waitlist.sql has not been run.
    console.error("[waitlist] join failed:", error.code, error.message);
    return NextResponse.json(
      { error: "We could not add you just now. Please try again, or contact us directly." },
      { status: 500 },
    );
  }

  /* ── THE EMAIL MUST BE AWAITED ────────────────────────────────────────────
     This was written as fire-and-forget — `void sendMail(...)` — on the
     reasoning that a slow mail provider should not hold up the form. That
     reasoning is right on a long-running server and WRONG here: on Vercel the
     function is frozen the instant the response is returned, so a request that
     has not finished is simply killed. The person saw the confirmation, the row
     was written, and the email was never sent. It failed silently, every time.

     So it is awaited — but with a ceiling. If the mail provider has not
     answered in four seconds, we stop waiting and still confirm: being on the
     list is what the person came for, and no email is better than a form that
     appears to hang. */
  const origin = siteUrl(req.nextUrl.origin);
  const mailed = await Promise.race([
    sendMail(waitlistWelcome(email, name, origin)),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
  ]).catch(() => false);

  if (!mailed) {
    // Loud, because a waitlist nobody hears back from looks like a broken firm.
    console.warn(`[waitlist] joined but no welcome email reached ${email}.`);
  }

  /* ── THE FIRM'S AUTOMATION ────────────────────────────────────────────────
     A new person is announced to WAITLIST_WEBHOOK_URL (Zapier), once. Since
     019_waitlist_new_flag.sql the function says whether the row was new;
     before it, it says true for everyone, and a repeat signup would be
     announced again — run the file and it stops. The visitor's reply is the
     same either way. */
  if (joined !== false) {
    await notifyWaitlistWebhook({ email, name, company, note, source });
  }

  return NextResponse.json({ ...OK, mailed });
}
