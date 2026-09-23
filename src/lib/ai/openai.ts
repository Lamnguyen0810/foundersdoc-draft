/**
 * OpenAI GPT via the Chat Completions API.
 *
 * Added after the September 2026 drafting test, where the GPT-5.6 family
 * produced the drafts that followed the firm's rules most closely: Sol wrote
 * the best NDA of eight models and Luna came within a hair of it at a
 * sixteenth of the price.
 *
 * To switch:
 *   AI_PROVIDER=openai
 *   OPENAI_API_KEY=sk-...
 *   OPENAI_MODEL=gpt-5.6-sol        (or gpt-5.6-terra, gpt-5.6-luna)
 *   OPENAI_REASONING=low            (optional; see below)
 *
 * The model id is deliberately NOT defaulted, for the same reason as the
 * Anthropic adapter: names change, and a stale default fails at request time
 * with an error that looks like a broken app.
 *
 * ── REASONING ───────────────────────────────────────────────────────────────
 * GPT-5.6 "thinks" before it answers, and the thinking is billed as output
 * tokens. OPENAI_REASONING sets how much: none, low, medium (OpenAI's
 * default), high. Drafting from a complete set of facts does not need much,
 * so this adapter defaults to LOW: cheaper and faster than medium, still
 * enough to hold the rules under pressure. Set it to "none" for the fastest
 * and cheapest run, or "medium" if the trap-case QC shows the model slipping.
 *
 * Two consequences the caller cannot see:
 *   • temperature is only accepted when reasoning is "none", so it is sent
 *     only then; at other levels the model picks its own.
 *   • the output cap (max_completion_tokens) includes thinking, so it is
 *     set higher than the Anthropic adapter's 8,192 — a draft that ran out
 *     of room mid-clause would be worse than a few cents of extra thinking.
 */

import type { DraftStream, GenerateInput, GenerateResult, ProviderImpl } from "./types";
import { ModelNotFoundError, ProviderNotConfiguredError, RateLimitedError } from "./types";
import { readError, sseJson } from "./http";

const URL = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1/chat/completions";

type Reasoning = "none" | "low" | "medium" | "high";
const REASONING_LEVELS: Reasoning[] = ["none", "low", "medium", "high"];

/* Thinking counts against this, so it is roomier than a plain-text cap. */
const DEFAULT_MAX_COMPLETION_TOKENS = 16_000;

function config() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ProviderNotConfiguredError("openai", "OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL?.trim();
  if (!model) throw new ProviderNotConfiguredError("openai", "OPENAI_MODEL");
  const raw = (process.env.OPENAI_REASONING ?? "low").trim().toLowerCase();
  const reasoning: Reasoning = (REASONING_LEVELS as string[]).includes(raw) ? (raw as Reasoning) : "low";
  return { apiKey, model, reasoning };
}

function body(input: GenerateInput, model: string, reasoning: Reasoning, stream: boolean) {
  return {
    model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    max_completion_tokens: Math.max(input.maxTokens ?? 0, DEFAULT_MAX_COMPLETION_TOKENS),
    reasoning_effort: reasoning,
    /* Only accepted with reasoning off; sent otherwise, the API rejects the
       whole request rather than ignoring the field. */
    ...(reasoning === "none" ? { temperature: input.temperature ?? 0.3 } : {}),
    stream,
    /* Without this the streamed response never reports token usage, and the
       money meter records a draft as free. */
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  };
}

async function call(input: GenerateInput, stream: boolean) {
  const { apiKey, model, reasoning } = config();
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body(input, model, reasoning, stream)),
    signal: input.signal,
  });
  if (res.status === 429) throw new RateLimitedError("openai");
  if (res.status === 404) throw new ModelNotFoundError("openai", model, "OPENAI_MODEL");
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await readError(res)}`);
  return { res, model };
}

type Usage = { prompt_tokens?: number; completion_tokens?: number };

type Chunk = {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: Usage | null;
};

export const openai: ProviderImpl = {
  name: "openai",

  async generate(input): Promise<GenerateResult> {
    const { res, model } = await call(input, false);
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: Usage;
    };
    return {
      text: json.choices?.[0]?.message?.content ?? "",
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      provider: "openai",
      model,
    };
  },

  async *stream(input): DraftStream {
    const { res, model } = await call(input, true);
    if (!res.body) throw new Error("OpenAI returned an empty response body.");

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const raw of sseJson(res.body)) {
      const chunk = raw as Chunk;
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield { type: "text", value: text };
      /* Arrives once, in a final chunk with an empty choices array. */
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
      }
    }

    yield { type: "done", usage: { provider: "openai", model, inputTokens, outputTokens } };
  },
};
