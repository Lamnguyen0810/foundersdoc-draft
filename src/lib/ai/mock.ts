/**
 * A fake provider that needs no API key and no network.
 *
 * Purpose: prove the whole pipeline — form, prompt assembly, streaming, editor,
 * token accounting — before anyone has signed up for anything. Set
 * AI_PROVIDER=mock and the app runs end to end offline.
 *
 * It is NOT a model. It echoes the assembled prompt back inside a skeleton
 * document so you can see exactly what would have been sent. If a draft looks
 * wrong, read the mock output first: nine times out of ten the prompt is wrong,
 * not the model.
 */

import type { DraftStream, GenerateInput, GenerateResult, ProviderImpl } from "./types";

const MODEL = "mock-echo-1";

/** Crude but honest: ~4 characters per token is close enough for a cost estimate. */
function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function render(input: GenerateInput): string {
  return [
    "MOCK DRAFT — NO MODEL WAS CALLED",
    "",
    "AI_PROVIDER is set to \"mock\", so this text is generated locally instead of by a",
    "model. Set AI_PROVIDER=gemini and add GEMINI_API_KEY to get a real draft.",
    "",
    "Everything below is the prompt that WOULD have been sent. Read it as a",
    "prompt-debugging tool: if a field is missing here, the form is wrong; if a rule",
    "is missing here, the system prompt is wrong.",
    "",
    "=== SYSTEM INSTRUCTION (" + approxTokens(input.system) + " tokens approx.) ===",
    "",
    input.system,
    "",
    "=== USER MESSAGE (" + approxTokens(input.user) + " tokens approx.) ===",
    "",
    input.user,
    "",
    "---",
    "DRAFTER'S NOTES:",
    "- This is mock output. No legal content has been generated.",
    "- [[TO CONFIRM: switch AI_PROVIDER to a real provider before judging quality]]",
  ].join("\n");
}

export const mock: ProviderImpl = {
  name: "mock",

  async generate(input): Promise<GenerateResult> {
    const text = render(input);
    return {
      text,
      inputTokens: approxTokens(input.system + input.user),
      outputTokens: approxTokens(text),
      provider: "mock",
      model: MODEL,
    };
  },

  async *stream(input): DraftStream {
    const text = render(input);
    // Stream in small pieces so the UI's streaming path is genuinely exercised.
    const chunks = text.match(/[\s\S]{1,40}/g) ?? [];
    for (const value of chunks) {
      yield { type: "text", value };
      await new Promise((r) => setTimeout(r, 12));
    }
    yield {
      type: "done",
      usage: {
        provider: "mock",
        model: MODEL,
        inputTokens: approxTokens(input.system + input.user),
        outputTokens: approxTokens(text),
      },
    };
  },
};
