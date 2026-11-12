/**
 * "Before you go" on the FD Sign send page (0233), the same box as drafting's (app/draft/ExitFeedback.tsx)
 * with reasons that fit sending for signature. Pure: the page and the progress route both use it.
 * The answer goes to Slack with the "left at step …" line (lib/sign/slack.ts senderStep), nowhere else.
 */
export const SIGN_EXIT_REASONS = [
  { code: "just_looking", emoji: "👀", label: "Just having a look for now" },
  { code: "not_final", emoji: "📄", label: "The document isn't final yet" },
  { code: "signers", emoji: "👥", label: "I need the signers' details first" },
  { code: "price", emoji: "💳", label: "I'd like to know more about pricing" },
  { code: "want_lawyer", emoji: "🧑‍⚖️", label: "I'd like a lawyer to check it first" },
  { code: "not_working", emoji: "🛠️", label: "Something didn't work as expected" },
  { code: "other", emoji: "💬", label: "Something else" },
] as const;

export type SignExitReason = (typeof SIGN_EXIT_REASONS)[number]["code"];

export const isSignExitReason = (v: unknown): v is SignExitReason => typeof v === "string" && SIGN_EXIT_REASONS.some((r) => r.code === v);

export const signExitLabel = (v: SignExitReason) => {
  const r = SIGN_EXIT_REASONS.find((x) => x.code === v)!;
  return `${r.emoji} ${r.label}`;
};
