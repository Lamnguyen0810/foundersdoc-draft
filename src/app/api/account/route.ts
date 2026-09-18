/**
 * Closing your own account.
 *
 * Two doors, and the difference matters:
 *
 *   deactivate — the account is suspended. Sign-in is refused; nothing is
 *                deleted. FD can open it again by clearing one column.
 *   delete     — the same, and a thirty-day clock starts. After that
 *                prune_closed_accounts() removes the auth user and everything
 *                cascades away with it: drafts, versions, answers, settings.
 *
 * Either way the person cannot sign in from the moment they press it, so the
 * thirty days are the FIRM's window to undo a mistake, not theirs. That is
 * what the dialog says, and it is the truth.
 *
 * ── WHAT THIS ROUTE DOES NOT DO ─────────────────────────────────────────────
 * It does not cancel the subscription. /api/billing/cancel already does that
 * properly — it refunds the unused part of the month, leaves bought credits
 * alone, and records the reason — and money is not a thing to reimplement for
 * a second caller. The settings page calls that route first and this one after,
 * so a person with a live plan is cancelled and refunded before the door shuts.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: unknown; confirm?: unknown };
  const action = body.action === "deactivate" || body.action === "delete" ? body.action : null;
  if (!action) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  /* Deleting asks the person to type their own email address. Not theatre: it
     is the one confirmation that cannot be clicked through by accident, and
     this is the only irreversible button in the application. */
  if (action === "delete") {
    const typed = typeof body.confirm === "string" ? body.confirm.trim().toLowerCase() : "";
    if (typed !== (user.email ?? "").trim().toLowerCase()) {
      return NextResponse.json(
        { error: "Type your email address exactly to confirm." },
        { status: 400 },
      );
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_my_account", {
    p_kind: action === "delete" ? "deleted" : "deactivated",
  });

  if (error) {
    const missing = /close_my_account|closed_at|closed_kind/.test(error.message);
    console.error("[/api/account]", error.message);
    return NextResponse.json(
      {
        error: missing
          ? "Closing an account needs supabase/033_photo_and_closing_an_account.sql to be run first."
          : "Could not close the account. Nothing has changed.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, action });
}
