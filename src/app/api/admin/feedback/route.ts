/**
 * Feedback and lessons, from the admin dashboard.
 *
 *   GET                              feedback (newest first) and live/retired lessons
 *   POST { action:"lesson", scope, rule, feedbackId? }   a rule, from feedback or from nothing
 *   POST { action:"dismiss", feedbackId }
 *   POST { action:"toggle", lessonId, live }
 *   POST { action:"edit", lessonId, rule }
 *
 * Admin only; the SQL functions check again.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { FEEDBACK_COLUMNS, LESSON_COLUMNS, type FeedbackRow, type LessonRow } from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPE = /^(\*|[a-z0-9_-]{1,64})$/;
const UUID = /^[0-9a-f-]{36}$/i;

function missing(message: string): boolean {
  return /draft_feedback|playbook_lessons|add_lesson|dismiss_feedback/.test(message) && /does not exist|not find|schema cache/i.test(message);
}
function fail(error: { message: string }, fallback: string) {
  console.error("[admin/feedback]", error.message);
  return NextResponse.json(
    { error: missing(error.message) ? "Feedback is not switched on yet — run supabase/045_feedback_and_lessons.sql." : fallback },
    { status: 500 },
  );
}
async function gate() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return null;
}

export async function GET() {
  const closed = await gate();
  if (closed) return closed;
  const supabase = await createClient();
  const [fb, ls] = await Promise.all([
    supabase.from("draft_feedback").select(FEEDBACK_COLUMNS).order("created_at", { ascending: false }).limit(200),
    supabase.from("playbook_lessons").select(LESSON_COLUMNS).order("created_at", { ascending: false }).limit(500),
  ]);
  if (fb.error) return fail(fb.error, "Could not read feedback.");
  if (ls.error) return fail(ls.error, "Could not read lessons.");
  return NextResponse.json({ feedback: (fb.data ?? []) as FeedbackRow[], lessons: (ls.data ?? []) as LessonRow[] });
}

export async function POST(req: NextRequest) {
  const closed = await gate();
  if (closed) return closed;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const supabase = await createClient();

  if (body?.action === "lesson") {
    const scope = typeof body.scope === "string" && SCOPE.test(body.scope) ? body.scope : "*";
    const rule = typeof body.rule === "string" ? body.rule.trim() : "";
    const feedbackId = typeof body.feedbackId === "string" && UUID.test(body.feedbackId) ? body.feedbackId : null;
    if (!rule) return NextResponse.json({ error: "Write the rule." }, { status: 400 });
    const { data, error } = await supabase.rpc("add_lesson", { p_scope: scope, p_rule: rule, p_feedback: feedbackId });
    if (error) return fail(error, "Could not save the rule.");
    return NextResponse.json({ ok: true, lesson: data as LessonRow });
  }

  if (body?.action === "dismiss") {
    const feedbackId = typeof body.feedbackId === "string" && UUID.test(body.feedbackId) ? body.feedbackId : null;
    if (!feedbackId) return NextResponse.json({ error: "Which feedback?" }, { status: 400 });
    const { error } = await supabase.rpc("dismiss_feedback", { p_feedback: feedbackId });
    if (error) return fail(error, "Could not dismiss that.");
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "toggle") {
    const lessonId = typeof body.lessonId === "string" && UUID.test(body.lessonId) ? body.lessonId : null;
    if (!lessonId) return NextResponse.json({ error: "Which rule?" }, { status: 400 });
    const { error } = await supabase.from("playbook_lessons").update({ live: Boolean(body.live) }).eq("id", lessonId);
    if (error) return fail(error, "Could not change that rule.");
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "edit") {
    const lessonId = typeof body.lessonId === "string" && UUID.test(body.lessonId) ? body.lessonId : null;
    const rule = typeof body.rule === "string" ? body.rule.trim().slice(0, 2000) : "";
    if (!lessonId || !rule) return NextResponse.json({ error: "Which rule, and what should it say?" }, { status: 400 });
    const { error } = await supabase.from("playbook_lessons").update({ rule }).eq("id", lessonId);
    if (error) return fail(error, "Could not change that rule.");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
