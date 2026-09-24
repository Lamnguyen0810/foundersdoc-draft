/**
 * Feedback on drafts and the lessons made from it, as the dashboard and the
 * drafter see them. Storage is supabase/045_feedback_and_lessons.sql.
 */

export interface FeedbackRow {
  id: string;
  draft_id: string | null;
  doc_type_slug: string | null;
  user_email: string | null;
  excerpt: string | null;
  message: string;
  /** "app" — the Feedback button; "slack" — a channel message via Zapier. */
  source: "app" | "slack";
  link: string | null;
  status: "new" | "applied" | "dismissed";
  /** FD AI's one-line reason: why it made the rule it made, or made none. */
  note: string | null;
  lesson_id: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
}

export interface LessonRow {
  id: string;
  scope: string;
  rule: string;
  live: boolean;
  feedback_id: string | null;
  created_by: string | null;
  created_at: string;
}

export const FEEDBACK_COLUMNS =
  "id,draft_id,doc_type_slug,user_email,excerpt,message,source,link,status,note,lesson_id,handled_by,handled_at,created_at";
export const LESSON_COLUMNS = "id,scope,rule,live,feedback_id,created_by,created_at";
