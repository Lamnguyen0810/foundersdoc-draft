/**
 * Google Gemini via the Generative Language REST API.
 * The free tier needs no card. Get a key at https://aistudio.google.com/apikey
 *
 * ⚠️ FREE TIER AND CONFIDENTIALITY
 * Google's Gemini API terms provide that content submitted to the UNPAID services
 * is used to improve and develop Google products, that human reviewers may read
 * it, and that sensitive, confidential or personal information should not be
 * submitted. Use anonymised, non-confidential material only until a paid key is
 * in place. See README.md.
 */

import type { DraftStream, GenerateInput, GenerateResult, ProviderImpl } from "./types";
import {
  ModelNotFoundError,
  OverloadedError,
  ProviderNotConfiguredError,
  RateLimitedError,
} from "./types";
import { readError, sseJson } from "./http";

/** Overridable so the retry ladder can be exercised against a local server in
 *  tests, and so a proxy can be put in front of Google if that is ever needed. */
const BASE =
  process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta";

/**
 * Default model.
 *
 * "gemini-flash-latest" is an ALIAS that always points at the current Flash
 * release. A pinned id like "gemini-2.5-flash" goes stale: Google ships new
 * model lines, older ids stop resolving for newly-created keys, and the API
 * answers 404 — which reads like a broken app rather than a stale model name.
 * Pin a specific version via GEMINI_MODEL when you want reproducible output
 * (for example while scoring the gold-standard test set).
 */
const DEFAULT_MODEL = "gemini-flash-latest";

/**
 * Second choice, tried only after the primary model has exhausted its retries
 * with 503s. Lite models carry more free-tier capacity and are shed less often
 * when Google is busy — a slightly weaker draft beats no draft. Set
 * GEMINI_FALLBACK_MODEL to "" to disable, or to a specific id to change it.
 */
const DEFAULT_FALLBACK = "gemini-flash-lite-latest";

function config() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ProviderNotConfiguredError("gemini", "GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const fallback =
    process.env.GEMINI_FALLBACK_MODEL === undefined
      ? DEFAULT_FALLBACK
      : process.env.GEMINI_FALLBACK_MODEL.trim();
  return { apiKey, model, fallback };
}

function body(input: GenerateInput) {
  return {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts: [{ text: input.user }] }],
    generationConfig: {
      maxOutputTokens: input.maxTokens ?? 8192,
      temperature: input.temperature ?? 0.3,
    },
  };
}

type GeminiChunk = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

function textOf(chunk: GeminiChunk): string {
  const parts = chunk.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

/** Statuses worth retrying: the service is up but momentarily unable to answer. */
const TRANSIENT = new Set([500, 502, 503, 504]);

/** 4 tries over roughly 7 seconds. A lawyer will wait 7 seconds; they will not
 *  accept an error they have to click through. */
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [800, 2000, 4000];

/**
 * How long one attempt may take to produce RESPONSE HEADERS.
 *
 * fetch() has no timeout of its own, so a request Google never answers hangs
 * until the platform kills the whole function. With two models and four
 * attempts each, eight such requests queue up behind 13.6 seconds of
 * deliberate backoff — which is how a minute disappears before a single token
 * has been generated.
 *
 * This covers headers ONLY. Once headers arrive the timer is cleared, because
 * a streaming response legitimately takes far longer than this to finish.
 */
const ATTEMPT_TIMEOUT_MS = 20_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * A signal for one attempt: aborts if the caller gives up, OR if headers have
 * not arrived in time. `headersIn()` retires the second half so the response
 * body can stream for as long as it needs.
 */
function attemptSignal(outer: AbortSignal | undefined) {
  const ac = new AbortController();
  const timer = setTimeout(
    () => ac.abort(new Error("gemini_attempt_timeout")),
    ATTEMPT_TIMEOUT_MS,
  );
  const onOuter = () => {
    clearTimeout(timer);
    ac.abort(outer?.reason);
  };
  outer?.addEventListener("abort", onOuter, { once: true });

  return {
    signal: ac.signal,
    /** Headers arrived: stop the header clock, keep following the caller. */
    headersIn() {
      clearTimeout(timer);
    },
    /** This attempt is over: release everything. */
    release() {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    },
  };
}

/**
 * Calls the API, retrying transient failures with exponential backoff.
 *
 * Gemini answers 503 when the model has no capacity — common on the free tier
 * at busy times, and usually gone a second later. Surfacing that to a lawyer as
 * an error would be wrong: nothing is broken and the fix is to wait. Retrying
 * is safe here because this runs before any output has been streamed, so an
 * attempt either fully succeeds or produces nothing at all.
 *
 * Every wait is bounded and every wait watches the caller's signal, so the
 * ladder can always be cut short rather than run to its full length inside a
 * request that has already run out of time.
 */
/**
 * What one model's attempts came to.
 *
 * "exhausted" has to be distinct from "unavailable": a 429 means THIS model's
 * quota is spent, which says nothing at all about the next model's. Quotas are
 * counted per model, so a second model is a fresh allowance rather than a
 * retry — the thing the old code could not express, and so did not try.
 */
type Attempted =
  | { kind: "ok"; res: Response }
  | { kind: "exhausted"; daily: boolean }
  | { kind: "unavailable" };

/** One model, with retries. */
async function tryModel(
  model: string,
  path: string,
  payload: string,
  apiKey: string,
  isPrimary: boolean,
  signal: AbortSignal | undefined,
): Promise<Attempted> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw signal.reason ?? new Error("aborted");

    const guard = attemptSignal(signal);
    let res: Response;

    try {
      res = await fetch(`${BASE}/models/${model}:${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: payload,
        signal: guard.signal,
      });
    } catch (err) {
      guard.release();
      // The caller ran out of time. Stop — another attempt cannot help.
      if (signal?.aborted) throw signal.reason ?? err;
      // This one attempt hung. Treat it exactly like a 503.
      console.warn(
        `[gemini] ${model} attempt ${attempt}/${MAX_ATTEMPTS} produced no headers within ${ATTEMPT_TIMEOUT_MS}ms`,
      );
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BACKOFF_MS[attempt - 1] ?? 4000, signal);
        continue;
      }
      return { kind: "unavailable" };
    }

    if (res.ok) {
      guard.headersIn();
      if (!isPrimary) console.warn(`[gemini] served by fallback model ${model}`);
      return { kind: "ok", res };
    }

    guard.release();

    /* Your quota, not their capacity — retrying makes it worse.
       Google names the quota it refused on in the body, and the distinction
       matters enormously to the person waiting: a per-minute limit clears by
       itself, while the daily one does not clear until midnight Pacific. Same
       429, completely different advice. The raw body goes to the log so
       whoever is fixing it can see exactly which quota ran out. */
    if (res.status === 429) {
      const detail = await readError(res);
      console.warn(`[gemini] 429 from ${model}: ${detail}`);
      const daily = /per\s*day|PerDay|RequestsPerDay/i.test(detail);
      return { kind: "exhausted", daily };
    }

    // Almost never "the service is down" — the model id does not exist for this
    // key. Say so on the primary; on the fallback just give up quietly.
    if (res.status === 404) {
      if (isPrimary) throw new ModelNotFoundError("gemini", model, "GEMINI_MODEL");
      console.warn(`[gemini] fallback model ${model} does not exist for this key`);
      return { kind: "unavailable" };
    }

    if (TRANSIENT.has(res.status)) {
      console.warn(`[gemini] ${model} ${res.status} on attempt ${attempt}/${MAX_ATTEMPTS}`);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BACKOFF_MS[attempt - 1] ?? 4000, signal);
        continue;
      }
      return { kind: "unavailable" };
    }

    throw new Error(`Gemini API error ${res.status}: ${await readError(res)}`);
  }
  return { kind: "unavailable" };
}

/**
 * Calls the API, retrying transient failures and then falling back to a
 * lighter model.
 *
 * Gemini answers 503 when a model has no capacity — common on the free tier at
 * busy times. Surfacing that to a lawyer would be wrong: nothing is broken and
 * the fix is to wait. Retrying is safe because this runs before any output has
 * streamed, so an attempt either fully succeeds or produces nothing at all.
 */
async function call(path: string, input: GenerateInput): Promise<Response> {
  const { apiKey, model, fallback } = config();
  const payload = JSON.stringify(body(input));
  const startedAt = Date.now();

  const primary = await tryModel(model, path, payload, apiKey, true, input.signal);
  if (primary.kind === "ok") return primary.res;

  /* ── A SPENT QUOTA IS NOT A DEAD SERVICE ──────────────────────────────
     Free-tier quotas are counted per model, and the lighter model's
     allowance is far larger — hundreds of requests a day against the main
     model's couple of dozen. So when the main model says "you have had your
     share today", the right move is not to give up: it is to ask the other
     model, whose allowance is barely touched.

     This is NOT a retry. Retrying a model that has refused you on quota only
     wastes time and makes the next refusal arrive sooner. Asking a DIFFERENT
     model draws on a different allowance entirely. */
  if (primary.kind === "exhausted") {
    console.warn(
      `[gemini] ${model} is out of ${primary.daily ? "today's" : "this minute's"} quota`,
    );
  }

  if (fallback && fallback !== model) {
    console.warn(
      `[gemini] ${model} gave up after ${Date.now() - startedAt}ms; trying ${fallback}`,
    );
    const second = await tryModel(fallback, path, payload, apiKey, false, input.signal);
    if (second.kind === "ok") return second.res;

    /* Both models are out. Only now is this the customer's problem, and the
       message should reflect the WORSE of the two: if either allowance is
       spent for the day, waiting a minute will not help. */
    if (second.kind === "exhausted") {
      throw new RateLimitedError(
        "gemini",
        second.daily || (primary.kind === "exhausted" && primary.daily),
      );
    }
  }

  if (primary.kind === "exhausted") throw new RateLimitedError("gemini", primary.daily);

  throw new OverloadedError("gemini", MAX_ATTEMPTS);
}

export const gemini: ProviderImpl = {
  name: "gemini",

  async generate(input): Promise<GenerateResult> {
    const { model } = config();
    const res = await call("generateContent", input);
    const json = (await res.json()) as GeminiChunk;
    return {
      text: textOf(json),
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      provider: "gemini",
      model,
    };
  },

  async *stream(input): DraftStream {
    const { model } = config();
    const res = await call("streamGenerateContent?alt=sse", input);
    if (!res.body) throw new Error("Gemini returned an empty response body.");

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const raw of sseJson(res.body)) {
      const chunk = raw as GeminiChunk;
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
        outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
      }
      const text = textOf(chunk);
      if (text) yield { type: "text", value: text };
    }

    yield { type: "done", usage: { provider: "gemini", model, inputTokens, outputTokens } };
  },
};
