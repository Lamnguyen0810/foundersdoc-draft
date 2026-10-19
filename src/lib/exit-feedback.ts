/**
 * Why people leave a document half-way: the choices offered in the
 * "Before you go" box (app/draft/ExitFeedback.tsx). The code is what is
 * stored and counted; the label is what the visitor sees and what Slack
 * shows. Shared by the browser, the API route and the database check (102),
 * so a new reason is added here AND in supabase/102.
 */
export const EXIT_REASONS = [
  { code: "just_looking", emoji: "👀", label: "Just having a look for now" },
  { code: "too_long", emoji: "⏳", label: "It's taking longer than I expected" },
  { code: "unsure", emoji: "🤔", label: "I'm not sure how to answer some questions" },
  { code: "wrong_doc", emoji: "📄", label: "This isn't quite the document I need" },
  { code: "price", emoji: "💳", label: "I'd like to know more about pricing" },
  { code: "want_lawyer", emoji: "🧑‍⚖️", label: "I'd feel better talking to a lawyer" },
  { code: "not_working", emoji: "🛠️", label: "Something didn't work as expected" },
  { code: "other", emoji: "💬", label: "Something else" },
] as const;

/** What each star means, shown under the stars once one is picked. */
export const RATING_WORDS = ["", "Not great", "Could be better", "It's okay", "Pretty good", "Loving it"] as const;

export type ExitReason = (typeof EXIT_REASONS)[number]["code"];

export function isExitReason(v: unknown): v is ExitReason {
  return typeof v === "string" && EXIT_REASONS.some((r) => r.code === v);
}
