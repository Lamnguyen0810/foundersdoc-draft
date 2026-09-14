/**
 * Granting and revoking credits, from the admin workspace.
 *
 * ── TWO LOCKS, NOT ONE ──────────────────────────────────────────────────────
 * This route checks isAdmin() before doing anything, and every database
 * function it calls checks is_admin() again for itself. That is deliberate
 * duplication. The route check gives a clean 403 and keeps the work off the
 * database; the function check is what actually holds if this route is ever
 * refactored, wrapped, or called from somewhere new. Credits are money, so the
 * guarantee lives at the bottom of the stack, not the top.
 *
 * Nothing here trusts a number from the browser beyond its type: the ceilings,
 * the "does this user exist" check and the audit line are all enforced in the
 * database, where they cannot be skipped.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  email?: string;
  userId?: string;
  credits?: number;
  reason?: string;
};

/** Turn a Postgres error into something a person can act on. */
function explain(message: string): { status: number; error: string } {
  if (message.includes("not_admin")) {
    return { status: 403, error: "That account is not an administrator." };
  }
  if (message.includes("no_such_user")) {
    return { status: 404, error: "No user with that email address." };
  }
  if (message.includes("credits must be between")) {
    return { status: 400, error: "Enter a number between 1 and 1000." };
  }
  if (message.includes("lock_not_available") || message.includes("55P03")) {
    return {
      status: 409,
      error: "That account is drafting right now. Try again in a few seconds.",
    };
  }
  return { status: 500, error: "The change could not be saved. Details are in the server logs." };
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  if (!(await isAdmin())) {
    // Same answer whether they are signed out, a lawyer, or guessing: this
    // endpoint tells nobody what it is for.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    if (body.action === "lookup") {
      const email = (body.email ?? "").trim();
      if (!email) return NextResponse.json({ error: "Enter an email address." }, { status: 400 });

      const { data, error } = await supabase.rpc("admin_lookup_user", { p_email: email });
      if (error) throw new Error(error.message);

      const row = Array.isArray(data) ? data[0] : null;
      if (!row) {
        return NextResponse.json(
          { error: "No user with that email address. Check the spelling." },
          { status: 404 },
        );
      }
      return NextResponse.json({ user: row });
    }

    if (body.action === "grant" || body.action === "revoke") {
      const userId = (body.userId ?? "").trim();
      const credits = Number(body.credits);
      if (!userId) return NextResponse.json({ error: "Look up a user first." }, { status: 400 });
      if (!Number.isInteger(credits) || credits < 1 || credits > 1000) {
        return NextResponse.json({ error: "Enter a whole number between 1 and 1000." }, { status: 400 });
      }

      const fn = body.action === "grant" ? "admin_grant_credits" : "admin_revoke_credits";
      const { data, error } = await supabase.rpc(fn, {
        p_user_id: userId,
        p_credits: credits,
        p_reason: (body.reason ?? "").trim() || null,
      });
      if (error) throw new Error(error.message);

      return NextResponse.json({ balance: data as number });
    }

    if (body.action === "recent") {
      const { data, error } = await supabase.rpc("admin_recent_credit_actions", { p_limit: 15 });
      if (error) throw new Error(error.message);
      return NextResponse.json({ actions: data ?? [] });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/admin/credits]", message);
    const { status, error } = explain(message);
    return NextResponse.json({ error }, { status });
  }
}
