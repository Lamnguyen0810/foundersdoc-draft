/**
 * "Before you go" answers from a drafting screen (app/draft/ExitFeedback.tsx).
 *
 *   POST { doc, step, total, reason, rating, comment, trigger, anon_id }
 *
 * Open to visitors without an account (most people who leave have none), so
 * it is listed in the middleware's public paths. Everything is checked again
 * in the database by leave_exit_feedback() (supabase/102), which also limits
 * how often one visitor can send. The team's own devices are not recorded.
 * Always answers 204: a feedback box must never stop someone leaving.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isTeamRequest } from "@/lib/team-device";
import { isExitReason } from "@/lib/exit-feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CONTENT = () => new NextResponse(null, { status: 204 });
const int = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured() || isTeamRequest(req)) return NO_CONTENT();
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NO_CONTENT();

  const doc = typeof b.doc === "string" && /^[a-z_]{2,30}$/.test(b.doc) ? b.doc : null;
  const reason = isExitReason(b.reason) ? b.reason : null;
  const rating = int(b.rating, 5);
  const comment = typeof b.comment === "string" ? b.comment.trim().slice(0, 1000) : "";
  if (!doc || (!reason && !rating && !comment)) return NO_CONTENT();

  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_exit_feedback", {
    p_doc: doc,
    p_step: int(b.step, 500),
    p_total: int(b.total, 500),
    p_reason: reason,
    p_rating: rating && rating >= 1 ? rating : null,
    p_comment: comment || null,
    p_trigger: b.trigger === "exit_intent" || b.trigger === "link" ? b.trigger : null,
    p_anon: typeof b.anon_id === "string" ? b.anon_id.slice(0, 40) : null,
  });
  if (error) console.error("[exit-feedback]", error.message);
  return NO_CONTENT();
}
