/**
 * The comprehensiveness scale: its names, lengths and what each level is for.
 * Plain constants, shared by the slider (app/draft/DetailSlider.tsx) and the
 * chat's answers (lib/draft-help.ts), so both name a level the same way.
 */

/** The five steps, in order. The NUMBER is what reaches the prompt; these
 *  words are only how it reads on screen. */
export const DETAIL_LABELS = ["Minimal", "Basic", "Standard", "Detailed", "Comprehensive"] as const;

export const DETAIL_LENGTHS = [
  "about 500–800 words",
  "about 750–1,050 words",
  "about 1,000–1,400 words",
  "about 1,250–1,750 words",
  "about 1,500–2,200 words",
] as const;

/** What each level is for, in a line — shown under the slider as it moves,
 *  so the choice is made on what the NDA will contain, not on a number. */
export const DETAIL_GUIDE = [
  "The essentials only: what is confidential, the standard exceptions and how long it lasts. For a quick, low-risk first conversation.",
  "A short, plain NDA with the usual practical protections. Suits most early-stage chats.",
  "The firm’s standard NDA: full definitions, handling rules and general clauses. Right for most deals.",
  "Adds fuller rules on who may see the information, forced disclosure and returning it. For sensitive information.",
  "The fullest version: every standard protection and procedure written out in detail. For highly sensitive information or high-value deals.",
] as const;

export type DetailLevel = 1 | 2 | 3 | 4 | 5;

/** Anything at all, clamped to a level that exists. */
export function toLevel(raw: unknown): DetailLevel {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n)) as DetailLevel;
}
