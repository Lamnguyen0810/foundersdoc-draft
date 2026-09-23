/**
 * ⭐ THE SWAP POINT.
 *
 * This is the only module in the application that knows which AI provider is in
 * use. Every other file calls generateDraft() / generateDraftStream() and is
 * provider-blind. That is what makes "free now, paid later" a configuration
 * change rather than a rewrite: to move from the Gemini free tier to a paid
 * Anthropic key, change AI_PROVIDER and add one env var. No other file changes.
 *
 * Do not import a model SDK or call a model HTTP endpoint anywhere else.
 */

import type {
  DraftStream,
  GenerateInput,
  GenerateResult,
  ProviderImpl,
  ProviderName,
} from "./types";
import { gemini } from "./gemini";
import { anthropic } from "./anthropic";
import { openai } from "./openai";
import { ollama } from "./ollama";
import { mock } from "./mock";

const IMPLS: Record<ProviderName, ProviderImpl> = {
  gemini,
  anthropic,
  openai,
  ollama,
  mock,
};

export function currentProviderName(): ProviderName {
  const raw = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  if (raw in IMPLS) return raw as ProviderName;
  throw new Error(
    `Unknown AI_PROVIDER "${raw}". Expected one of: ${Object.keys(IMPLS).join(", ")}.`,
  );
}

function impl(): ProviderImpl {
  return IMPLS[currentProviderName()];
}

/** One-shot generation. Used by the smoke test and by any non-streaming caller. */
export function generateDraft(input: GenerateInput): Promise<GenerateResult> {
  return impl().generate(input);
}

/** Streaming generation. Used by the /api/generate route. */
export function generateDraftStream(input: GenerateInput): DraftStream {
  return impl().stream(input);
}
