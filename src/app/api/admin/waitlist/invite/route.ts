/**
 * Letting somebody off the waitlist, by hand.
 *
 * The same account, the same three credits and the same invitation email that
 * a sign-up produces on its own — but chosen, one address at a time, by an
 * administrator. It is the path that matters when signup_config.auto_account
 * is off, and it is the only way the people already on the list from before
 * any of this existed ever get in.
 *
 * ── TWO LOCKS ───────────────────────────────────────────────────────────────
 * isAdmin() here, and createAccountFor refuses any address that is not on the
 * waitlist. Neither is enough alone: the first says who may press the button,
 * the second says what the button is allowed to do — so an administrator with
 * a typo invites nobody rather than creating an account for an address the
 * firm has never heard of.
 *
 * Unlike the public sign-up route, this one says exactly what happened. There
 * is no address-harvesting concern when the caller is already an administrator
 * who can read the whole list on the page they pressed it from, and FD needs
 * to know whether the email went.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAccountFor, type AccountOutcome } from "@/lib/waitlist/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAID: Record<AccountOutcome, { ok: boolean; status: number; message: string }> = {
  created: { ok: true, status: 200, message: "Account created. The invitation is on its way." },
  already: { ok: true, status: 200, message: "That address already had an account." },
  not_on_list: {
    ok: false,
    status: 404,
    message: "That address is not on the waitlist, so no account was made.",
  },
  throwaway: {
    ok: false,
    status: 400,
    message: "That is a temporary inbox. The invitation would not reach anybody.",
  },
  not_configured: {
    ok: false,
    status: 503,
    message:
      "This deployment cannot create accounts: SUPABASE_SECRET_KEY is missing, or " +
      "supabase/034_waitlist_becomes_signup.sql has not been run.",
  },
  rate_limited: {
    ok: false,
    status: 429,
    message:
      "Supabase will not send any more email just now. Set custom SMTP in " +
      "Project Settings → Auth → SMTP; the built-in sender allows only a few an hour.",
  },
  failed: {
    ok: false,
    status: 500,
    message: "Could not create the account. The reason is in the server log.",
  },
};

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Administrators only." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That is not an email address." }, { status: 400 });
  }

  const outcome = await createAccountFor(email, { name: null, origin: req.nextUrl.origin });
  const said = SAID[outcome];

  return NextResponse.json(
    said.ok ? { ok: true, outcome, message: said.message } : { error: said.message, outcome },
    { status: said.status },
  );
}
