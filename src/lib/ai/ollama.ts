/**
 * Ollama — a model running on a machine you control.
 *
 * Two uses:
 *   1. A free local brain today, if you have a capable GPU (AI_PROVIDER=ollama).
 *   2. The Phase 3 private tier: confidential documents drafted without leaving
 *      the office. The routing rule that decides local vs cloud lives above this
 *      file; this file only knows how to talk to Ollama.
 *
 *   AI_PROVIDER=ollama
 *   OLLAMA_BASE_URL=http://127.0.0.1:11434
 *   OLLAMA_MODEL=qwen3:30b
 */

import type { DraftStream, GenerateInput, GenerateResult, ProviderImpl } from "./types";
import { ProviderNotConfiguredError } from "./types";
import { ndjson, readError } from "./http";

function config() {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  if (!baseUrl) throw new ProviderNotConfiguredError("ollama", "OLLAMA_BASE_URL");
  const model = process.env.OLLAMA_MODEL?.trim();
  if (!model) throw new ProviderNotConfiguredError("ollama", "OLLAMA_MODEL");
  return { baseUrl: baseUrl.replace(/\/$/, ""), model };
}

function body(input: GenerateInput, model: string, stream: boolean) {
  return {
    model,
    stream,
    options: {
      temperature: input.temperature ?? 0.3,
      num_predict: input.maxTokens ?? 8192,
    },
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  };
}

async function call(input: GenerateInput, stream: boolean) {
  const { baseUrl, model } = config();
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body(input, model, stream)),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await readError(res)}`);
  return { res, model };
}

type OllamaChunk = {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
};

export const ollama: ProviderImpl = {
  name: "ollama",

  async generate(input): Promise<GenerateResult> {
    const { res, model } = await call(input, false);
    const json = (await res.json()) as OllamaChunk;
    return {
      text: json.message?.content ?? "",
      inputTokens: json.prompt_eval_count ?? 0,
      outputTokens: json.eval_count ?? 0,
      provider: "ollama",
      model,
    };
  },

  async *stream(input): DraftStream {
    const { res, model } = await call(input, true);
    if (!res.body) throw new Error("Ollama returned an empty response body.");

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const raw of ndjson(res.body)) {
      const chunk = raw as OllamaChunk;
      if (chunk.message?.content) yield { type: "text", value: chunk.message.content };
      if (chunk.done) {
        inputTokens = chunk.prompt_eval_count ?? inputTokens;
        outputTokens = chunk.eval_count ?? outputTokens;
      }
    }

    yield { type: "done", usage: { provider: "ollama", model, inputTokens, outputTokens } };
  },
};
