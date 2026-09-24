/**
 * Feedback on a draft, from the person reading it.
 *
 *   POST { draftId, message, excerpt? }
 *
 * Any signed-in person may leave it (the middleware gates /api). It lands in
 * draft_feedback through leave_feedback(), which records who and checks the
 * draft is theirs; the firm reads it on the admin dashboard and turns it
 * into a rule — see supabase/045_feedback_and_lessons.sql.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { learnFromFeedback } from "@/lib/learn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await getUser())) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { draftId?: unknown; message?: unknown; excerpt?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const excerpt = typeof body?.excerpt === "string" ? body.excerpt.trim().slice(0, 2000) : "";
  const draftId = typeof body?.draftId === "string" && /^[0-9a-f-]{36}$/i.test(body.draftId) ? body.draftId : null;
  if (!message) return NextResponse.json({ error: "Say what should change." }, { status: 400 });
  if (message.length > 4000) return NextResponse.json({ error: "Keep it under 4,000 characters." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leave_feedback", {
    p_draft: draftId,
    p_message: message,
    p_excerpt: excerpt || null,
  });
  if (error) {
    console.error("[feedback]", error.message);
    const missing = /leave_feedback/.test(error.message) && /does not exist|not find|schema cache/i.test(error.message);
    return NextResponse.json(
      { error: missing ? "Feedback is not switched on yet (run supabase/045)." : "Could not send that. Try again." },
      { status: 500 },
    );
  }
  /* The drafter learns from it now — see lib/learn.ts. Needs the service
     key; without it the feedback simply waits for a person. */
  let learnt: { learnt: boolean; rule?: string; scope?: string; reason?: string } = { learnt: false, reason: "no service key" };
  if (isAdminClientConfigured()) {
    learnt = await learnFromFeedback(data as string).catch((err: unknown) => {
      console.error("[feedback] learn failed:", err);
      return { learnt: false, reason: "error" };
    });
  }
  return NextResponse.json({ ok: true, id: data as string, ...learnt });
}
