/**
 * Feedback and lessons, from the admin dashboard.
 *
 *   GET                              feedback (newest first) and live/retired lessons
 *   POST { action:"lesson", scope, rule, feedbackId? }   a rule, from feedback or from nothing
 *   POST { action:"dismiss", feedbackId }
 *   POST { action:"toggle", lessonId, live }
 *   POST { action:"edit", lessonId, rule }
 *   POST { action:"submit", scope, ref?, message, direct? }
 *        feedback typed on the dashboard, learnt from at once — the urgent
 *        way, with no wait for Zapier to read Slack. `direct` saves the
 *        admin's own words as the rule, without asking FD AI.
 *
 * Admin only; the SQL functions check again.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { learnFromFeedback } from "@/lib/learn";
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

  if (body?.action === "submit") {
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
    const scope = typeof body.scope === "string" && SCOPE.test(body.scope) ? body.scope : "*";
    const ref = typeof body.ref === "string" ? (/([0-9a-f]{6})/i.exec(body.ref)?.[1] ?? "").toLowerCase() : "";
    const direct = body.direct === true;
    /* A file given as feedback arrives already redacted — the admin blacked
       out the private details in the browser (Redactor.tsx); the original is
       never sent. Kept with the feedback as its excerpt, so FD AI reads it
       when it learns from it. */
    const rawFile = (body.file && typeof body.file === "object" ? body.file : {}) as { name?: unknown; text?: unknown };
    const file =
      typeof rawFile.text === "string" && rawFile.text.trim()
        ? {
            name: typeof rawFile.name === "string" ? rawFile.name.replace(/[\r\n]/g, " ").slice(0, 120) : "file",
            text: rawFile.text.trim().slice(0, 30000),
          }
        : null;
    if (!message) return NextResponse.json({ error: "Say what should change." }, { status: 400 });
    if (!isAdminClientConfigured()) {
      return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set in Vercel, so feedback cannot be saved from here." }, { status: 503 });
    }
    const db = supabaseAdmin();
    const user = await getUser();

    /* "#9e546c" from a download message: the draft it is about. The 6
       characters are the start of its id; any admin may name any draft. */
    let draftId: string | null = null;
    let slug: string | null = scope === "*" ? null : scope;
    if (ref) {
      const { data: hits } = await db
        .from("drafts")
        .select("id,doc_types(slug)")
        .gte("id", `${ref}00-0000-0000-0000-000000000000`)
        .lte("id", `${ref}ff-ffff-ffff-ffff-ffffffffffff`)
        .order("created_at", { ascending: false })
        .limit(1);
      const hit = (hits?.[0] ?? null) as { id: string; doc_types: { slug: string } | { slug: string }[] | null } | null;
      if (!hit) return NextResponse.json({ error: `No draft has the reference #${ref}.` }, { status: 400 });
      draftId = hit.id;
      const dt = Array.isArray(hit.doc_types) ? hit.doc_types[0] : hit.doc_types;
      if (!slug && dt?.slug) slug = dt.slug;
    }

    const { data: row, error: insError } = await db
      .from("draft_feedback")
      .insert({
        draft_id: draftId,
        doc_type_slug: slug,
        user_id: user?.id ?? null,
        user_email: user?.email ?? "Admin",
        message,
        excerpt: file ? `[File: ${file.name} — redacted]\n${file.text}` : null,
        source: "app",
      })
      .select("id")
      .single();
    if (insError || !row) return fail(insError ?? { message: "no row" }, "Could not save the feedback.");
    const feedbackId = (row as { id: string }).id;

    if (direct) {
      /* The admin's words are the rule — no model in between. */
      const { data, error } = await supabase.rpc("add_lesson", { p_scope: slug ?? "*", p_rule: message, p_feedback: feedbackId });
      if (error) return fail(error, "Saved the feedback, but could not make it a rule.");
      return NextResponse.json({ ok: true, id: feedbackId, learnt: true, rule: (data as LessonRow).rule, scope: slug ?? "*" });
    }

    const learnt = await learnFromFeedback(feedbackId).catch((err: unknown) => {
      console.error("[admin/feedback] learn failed:", err);
      return { learnt: false, reason: "FD AI could not be reached" };
    });
    return NextResponse.json({ ok: true, id: feedbackId, ...learnt });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
