import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { notifyWaitlistWebhook } from "@/lib/waitlist/notify";
import { autoAccountOn } from "@/lib/waitlist/account";
import { isThrowaway } from "@/lib/waitlist/disposable";

/**
 * Joining the waitlist — which is now step one of signing up.
 *
 * Open to anyone — it has to be, nobody has an account yet. Four things keep
 * that from being a liability:
 *
 *   The database function is the only way in, and it decides what a row may
 *   contain. This route cannot write an arbitrary record even if it wanted to.
 *
 *   The reply is identical whether the address was new or already on the list,
 *   and says nothing about whether it already has an account. Otherwise this
 *   becomes a way to check, one address at a time, who has shown interest in a
 *   law firm's product — and, worse, who is already using it.
 *
 *   The welcome email is sent by the firm's Zap, which receives every new
 *   signup from this route (see the end). Nothing here waits on a mail
 *   provider: being on the list is what the person came for.
 *
 *   Whether registration follows at all is a row in signup_config, not a
 *   constant here. If the free credits are being farmed, FD closes it with one
 *   UPDATE and no deploy — and the same row is read by the database trigger
 *   that actually refuses the account, so closing it is not a matter of the
 *   browser agreeing to hide a button.
 *
 * ── THE ORDER MATTERS ───────────────────────────────────────────────────────
 * The waitlist row is written FIRST and the password chosen second, because
 * the trigger in 035 refuses to create an account for an address that is not
 * already on the list. That ordering is also what makes a retry safe: joining
 * twice changes nothing, and registering twice is refused by Supabase.
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

  /* ── MAY THEY GO STRAIGHT ON AND REGISTER? ────────────────────────────────
     The row now exists, so the database will let this address create an
     account — and the browser is told to show the password field.

     Note what is NOT said: nothing about whether an account already exists.
     That is the answer to "does this person use FD AI", and this form is open
     to the whole internet. The second step is therefore offered to everybody,
     and Supabase — which answers a repeat sign-up with a lookalike success on
     purpose — is the one that decides.

     No account is created here and no invitation is sent. The person is about
     to choose their own password on the page they are already looking at, and
     an account made now would be an account they cannot then sign up for.

     Read from the database rather than taken from the page, because the switch
     can have moved since the page was rendered. */
  const canRegister = await autoAccountOn();

  /* One line per sign-up. A launch morning where nobody can get in should be
     diagnosable from the log rather than from a debugger. */
  console.log(`[waitlist] ${isNew ? "new" : "repeat"} · register: ${canRegister ? "open" : "closed"}`);

  return NextResponse.json({ ...OK, canRegister });
}
