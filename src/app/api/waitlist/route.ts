import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { notifyWaitlistWebhook } from "@/lib/waitlist/notify";
import { autoAccountOn, createAccountFor } from "@/lib/waitlist/account";
import { isThrowaway } from "@/lib/waitlist/disposable";

/**
 * Joining the waitlist — which now also means getting an account.
 *
 * Open to anyone — it has to be, nobody has an account yet. Four things keep
 * that from being a liability:
 *
 *   The database function is the only way in, and it decides what a row may
 *   contain. This route cannot write an arbitrary record even if it wanted to.
 *
 *   The reply is identical whether the address was new or already on the list.
 *   Otherwise this becomes a way to check, one address at a time, who has shown
 *   interest in a law firm's product. It stays identical now that an account is
 *   created too, which matters MORE than it did: the reply would otherwise
 *   answer "does this person already use FD AI".
 *
 *   The welcome email is sent by the firm's Zap, which receives every new
 *   signup from this route (see the end). Nothing here waits on a mail
 *   provider: being on the list is what the person came for.
 *
 *   Whether an account is made at all is a row in signup_config, not a
 *   constant here. If the free credits are being farmed, FD closes it with one
 *   UPDATE and no deploy.
 *
 * ── THE ORDER MATTERS ───────────────────────────────────────────────────────
 * The waitlist row is written FIRST and the account second, because
 * createAccountFor refuses any address that is not already on the list. That
 * ordering is also what makes a retry safe: the row is there, the account
 * either exists or does not, and neither step can produce a second of anything.
 */
export const dynamic = "force-dynamic";

const OK = { ok: true } as const;

/** What join_waitlist said — see the note above the webhook call. */
function readAnswer(answer: unknown): { isNew: boolean; total: number | null } {
  if (answer && typeof answer === "object") {
    const a = answer as { new?: unknown; total?: unknown };
    const total = typeof a.total === "number" && Number.isFinite(a.total) ? a.total : null;
    return { isNew: a.new !== false, total };
  }
  return { isNew: answer !== false, total: null };
}

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

  /* ── A THROWAWAY INBOX ────────────────────────────────────────────────────
     Refused before the row is written, not after, so the list does not fill
     with addresses that were never going to read anything sent to them. Said
     plainly rather than vaguely: this one is the person's own mistake to fix,
     and a silent "you're on the list" would leave them waiting for an email
     that could not arrive. */
  if (isThrowaway(email)) {
    return NextResponse.json(
      {
        error:
          "That looks like a temporary inbox. Please use an address you will still have " +
          "in a fortnight — your three free documents are sent to it.",
        code: "throwaway",
      },
      { status: 400 },
    );
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
  const { data: answer, error } = await supabase.rpc("join_waitlist", {
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

  /* ── THE WELCOME EMAIL IS ZAPIER'S ───────────────────────────────────────
     This route used to send the welcome itself, through Resend. FD moved
     that to the Zap that receives the webhook below (Email by Zapier, step
     3), so it is sent from one place only; sending it here as well gave
     every signup two welcomes. The Resend template is kept in
     src/lib/email/waitlist-welcome.ts should it ever come back. */

  /* ── THE FIRM'S AUTOMATION ────────────────────────────────────────────────
     A new person is announced to WAITLIST_WEBHOOK_URL (Zapier), once, with
     how many people are on the list at that moment. What the function
     answers depends on which SQL files have been run:
       021_waitlist_total.sql   {new, total}   — the total is real
       019_waitlist_new_flag.sql  true/false   — no total; sent blank
       before 019                 nothing      — everyone announced, no total
     The total is never guessed: when the database has not said, the field
     is empty. The visitor's reply is the same in every case. */
  const { isNew, total } = readAnswer(answer);
  if (isNew) {
    await notifyWaitlistWebhook({ email, name, company, note, source, total });
  }

  /* ── AND THE ACCOUNT ──────────────────────────────────────────────────────
     Attempted for a repeat submission as well as a new one, on purpose:
     somebody who joined the list last month, before any of this existed,
     should get an account the next time they ask rather than being told they
     are already on a list that now means something different.

     createAccountFor answers with what happened. None of it is returned to the
     browser — the reply below is the same three characters whatever occurred —
     because the difference between "created" and "already" is the answer to
     "does this person have an FD AI account", and that is not a question a
     stranger with a form gets to ask. */
  let outcome: Awaited<ReturnType<typeof createAccountFor>> | "off" = "off";
  if (await autoAccountOn()) {
    outcome = await createAccountFor(email, { name, origin: req.nextUrl.origin });
  }

  /* One line in the server log per sign-up, so a launch morning where nobody
     can get in is diagnosable without a debugger: it will say rate_limited, or
     not_configured, on every row. */
  console.log(`[waitlist] ${isNew ? "new" : "repeat"} · account: ${outcome}`);

  /* The one case the person must be told about, because it is the one where
     doing nothing leaves them waiting for an email that is never coming.
     It says nothing about whether they have an account. */
  if (outcome === "rate_limited") {
    return NextResponse.json(
      {
        ok: true,
        note:
          "You are on the list. Our email service is busy, so the link to sign in may take " +
          "a little longer to arrive than usual.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json(OK);
}
