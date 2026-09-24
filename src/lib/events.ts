/**
 * The vocabulary of things worth counting.
 *
 * Both ends of the wire import this file: the browser can only ask for a name
 * that appears here, and the API route refuses anything that does not. An
 * allow-list rather than free text is the point — analytics tables rot when
 * every new feature invents its own event name, and reports built on a typo
 * quietly read zero forever.
 *
 * ── THE RULE THAT MATTERS ──────────────────────────────────────────────────
 * No value a user typed may ever appear in an event. `question_skipped` carries
 * the question's KEY ("governing_law"), never the answer. This file is the
 * place that rule is enforced, because it is the only place every event passes
 * through.
 */

export const EVENTS = {
  // ── the public website ───────────────────────────────────────────────────
  page_view: "A marketing page was opened",
  consult_click: "Book a consultation was pressed",
  contact_submit: "The enquiry form was sent",
  launch_fdai_click: "Launch FD AI was pressed",
  article_read: "A blog article was read to the end",
  podcast_play: "A podcast episode was started",

  // ── the drafting workspace ───────────────────────────────────────────────
  ai_opened: "The document catalogue was opened",
  doc_selected: "A document type was chosen",
  draft_started: "The first question was answered",
  question_skipped: "A question was skipped",
  draft_with_what_i_have: "Drafting was forced before the questions ended",
  source_uploaded: "An existing document was uploaded as a starting point",
  draft_generated: "A draft came back from the AI",
  draft_failed: "Generation returned an error",
  draft_revised: "A draft was changed by asking FD AI",
  draft_exported: "A draft was downloaded as Word",
  draft_abandoned: "The flow was left without generating",
  paywall_hit: "Someone ran out of credits mid-draft",
  signup_gate: "A visitor without an account pressed Generate (or attach) and was sent to sign up",

  // ── accounts ─────────────────────────────────────────────────────────────
  waitlist_joined: "Someone joined the FD AI waitlist",
  sign_up_started: "Someone created an account",
  sign_in_ok: "Someone signed in",
  sign_in_failed: "A sign-in attempt was rejected",
} as const;

export type EventName = keyof typeof EVENTS;

export const EVENT_NAMES = Object.keys(EVENTS) as EventName[];

export function isEventName(v: unknown): v is EventName {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(EVENTS, v);
}

/**
 * The only property keys an event may carry.
 *
 * Anything else is dropped silently at the API route. The absent keys are the
 * important ones: there is no `answer`, no `value`, no `text`, no `email`, and
 * no `title` — a draft's title is typed by a lawyer and can name a client.
 */
export const ALLOWED_PROP_KEYS = [
  "doc_type", // "nda"
  "question_key", // "governing_law" — the key, never the answer
  "step", // how far through the questions, as a number
  "total_steps",
  "seconds", // how long generation took
  "words", // length of the draft produced
  "format", // "docx"
  "reason", // a short code, e.g. "email_not_confirmed"
  "source", // which page a click came from
  "count",
] as const;

export type EventProps = Partial<Record<(typeof ALLOWED_PROP_KEYS)[number], string | number | boolean>>;

/** Keep only whitelisted keys, and only small scalars. */
export function cleanProps(input: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;

  for (const key of ALLOWED_PROP_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.round(v * 100) / 100;
    else if (typeof v === "boolean") out[key] = v;
    else if (typeof v === "string" && v.length > 0) out[key] = v.slice(0, 80);
  }
  return out;
}
