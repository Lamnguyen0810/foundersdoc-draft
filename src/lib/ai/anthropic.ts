/**
 * Anthropic Claude via the Messages API.
 *
 * This is swap register item 1: the paid replacement for the Gemini free tier.
 * Paid API traffic is not used to train models, which is what lifts the
 * non-confidential-material-only restriction.
 *
 * To switch:
 *   AI_PROVIDER=anthropic
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   ANTHROPIC_MODEL=<a current model id from https://docs.claude.com/en/docs/about-claude/models>
 *
 * The model id is deliberately NOT defaulted: model names change, and a stale
 * hard-coded default fails at request time with a confusing error.
 */

import type { DraftStream, GenerateInput, GenerateResult, ProviderImpl } from "./types";
import { ProviderNotConfiguredError, RateLimitedError } from "./types";
import { readError, sseJson } from "./http";

const URL = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

function config() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new ProviderNotConfiguredError("anthropic", "ANTHROPIC_API_KEY");
  const model = process.env.ANTHROPIC_MODEL?.trim();
  if (!model) throw new ProviderNotConfiguredError("anthropic", "ANTHROPIC_MODEL");
  return { apiKey, model };
}

function body(input: GenerateInput, model: string, stream: boolean) {
  return {
    model,
    max_tokens: input.maxTokens ?? 8192,
    temperature: input.temperature ?? 0.3,
    system: input.system,
    messages: [{ role: "user", content: input.user }],
    stream,
  };
}

async function call(input: GenerateInput, stream: boolean) {
  const { apiKey, model } = config();
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": VERSION,
    },
    body: JSON.stringify(body(input, model, stream)),
  });
  if (res.status === 429) throw new RateLimitedError("anthropic");
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await readError(res)}`);
  return { res, model };
}

type AnthropicEvent = {
  type?: string;
  delta?: { text?: string };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
};

export const anthropic: ProviderImpl = {
  name: "anthropic",

  async generate(input): Promise<GenerateResult> {
    const { res, model } = await call(input, false);
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: (json.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join(""),
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
      provider: "anthropic",
      model,
    };
  },

  async *stream(input): DraftStream {
    const { res, model } = await call(input, true);
    if (!res.body) throw new Error("Anthropic returned an empty response body.");

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const raw of sseJson(res.body)) {
      const ev = raw as AnthropicEvent;
      if (ev.type === "message_start") {
        inputTokens = ev.message?.usage?.input_tokens ?? inputTokens;
      }
      if (ev.type === "content_block_delta" && ev.delta?.text) {
        yield { type: "text", value: ev.delta.text };
      }
      if (ev.type === "message_delta" && ev.usage) {
        outputTokens = ev.usage.output_tokens ?? outputTokens;
      }
    }

    yield { type: "done", usage: { provider: "anthropic", model, inputTokens, outputTokens } };
  },
};
