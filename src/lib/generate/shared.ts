import "server-only";
import { SKIPPED, buildSystem, buildUser, type Answers } from "@/lib/prompt";
import type { DocType } from "@/lib/doctypes";
import { loadSettings, loadStyleReference } from "@/lib/settings.server";
import {
  ModelNotFoundError,
  OverloadedError,
  ProviderNotConfiguredError,
  RateLimitedError,
} from "@/lib/ai/types";

/**
 * What /api/generate and /api/generate/continue share: the time budget, the
 * prompt a draft is written from, and the small helpers of the stream.
 * One copy, so a continued draft is written from exactly the prompt that
 * began it.
 */

/**
 * Stop generating with enough time left to refund, explain and close cleanly.
 *
 * This MUST stay below whatever ceiling the platform is really enforcing, so
 * it is a setting rather than a constant: leave it alone while the function is
 * capped at 60 seconds, and raise it to 280000 once Fluid compute is on. No
 * redeploy of code needed — set GENERATE_BUDGET_MS in the Vercel dashboard.
 */
export const BUDGET_MS = (() => {
  const raw = Number(process.env.GENERATE_BUDGET_MS);
  // Anything absent, non-numeric, negative or absurd falls back to the value
  // that is safe on the smallest ceiling, rather than trusting a typo.
  if (!Number.isFinite(raw) || raw < 5_000 || raw > 290_000) return 50_000;
  return Math.floor(raw);
})();


export const DETAIL_INSTRUCTIONS = {
  1: "Draft a concise NDA of approximately 500-800 words. Consolidate boilerplate while preserving the essential confidentiality protections, exceptions and placeholders.",
  2: "Draft a standard NDA of approximately 750-1,050 words with the usual practical protections and procedures.",
  3: "Draft a detailed NDA of approximately 1,000-1,400 words with complete standard definitions, confidentiality procedures and general provisions.",
  4: "Draft a thorough NDA of approximately 1,250-1,750 words. Expand relevant definitions, handling duties, representative controls, compelled-disclosure procedure, return or destruction mechanics, remedies and general provisions.",
  5: "Draft a maximum-detail NDA of approximately 1,500-2,200 words. Cover the relevant protections and procedures comprehensively while remaining proportionate and avoiding repetition.",
} as const;

export function line(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

export function friendly(err: unknown): string {
  if (err instanceof ProviderNotConfiguredError) return err.message;
  if (err instanceof RateLimitedError) return err.message;
  if (err instanceof ModelNotFoundError) return err.message;
  if (err instanceof OverloadedError) return err.message;
  if (err instanceof Error) {
    return `The drafting service returned an error. Details are in the server logs. (${err.name})`;
  }
  return "An unexpected error occurred while drafting.";
}

export function versionFileName(answers: Answers, version: number, detailLevel: number): string {
  const clean = (value: string | undefined) =>
    ((value ?? "") === SKIPPED ? "" : (value ?? "").split("(")[0])
      .replace(/[^a-zA-Z0-9 -]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 28);
  const parties = [clean(answers.party_a), clean(answers.party_b)].filter(Boolean);
  const detailName = ["Concise", "Standard", "Detailed", "Thorough", "Maximum"]
    [detailLevel - 1] ?? "Revised";
  return ["NDA", ...parties, `V${version}`, detailName].join("-") + ".docx";
}


/**
 * The system prompt and the user message a draft is written from. The
 * person's drafting preferences are read on the server so the browser cannot
 * ask for a style it was not given; neither read may stop a draft.
 */
export async function draftPrompt(
  docType: DocType,
  answers: Answers,
  sourceText: string | undefined,
  detailLevel: 1 | 2 | 3 | 4 | 5,
): Promise<{ system: string; user: string }> {
  const { settings } = await loadSettings();
  const styleReference = await loadStyleReference(docType.slug);
  const system = buildSystem(docType, settings.ai.style);
  const base = buildUser(docType, answers, sourceText, styleReference);
  const user =
    docType.slug === "nda"
      ? [
          base,
          "",
          "REQUIRED COMPREHENSIVENESS",
          DETAIL_INSTRUCTIONS[detailLevel],
          "The selected level must materially control the length, clause coverage and procedural detail of this first draft.",
        ].join("\n")
      : base;
  return { system, user };
}

/** A draft cut off by the time limit is saved and finished by
 *  /api/generate/continue. This many continuations at most. */
export const MAX_CONTINUATIONS = 3;

/** Shorter than this is a fragment, not worth saving to continue. */
export const USABLE_CHARS = 400;
