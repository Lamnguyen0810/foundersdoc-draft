/**
 * Shared types for the AI provider layer.
 *
 * Nothing outside src/lib/ai may import a model SDK or call a model HTTP API.
 * See provider.ts for the reason why.
 */

export type ProviderName = "gemini" | "anthropic" | "openai" | "ollama" | "mock";

export interface GenerateInput {
  /** System instruction: role, house style, hard rules. */
  system: string;
  /** The user turn: form answers, source text, task. */
  user: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Cancels the whole generation, retries included.
   *
   * Without one, a provider is free to spend an unbounded amount of time
   * before yielding its first token — and the caller's own watchdog, which
   * can only run between yielded chunks, never gets a turn. The request is
   * then killed by the platform instead of ending on our terms, which means
   * no refund and no explanation.
   */
  signal?: AbortSignal;
}

export interface Usage {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResult extends Usage {
  text: string;
}

export type StreamEvent =
  | { type: "text"; value: string }
  | { type: "done"; usage: Usage }
  | { type: "error"; message: string };

export type DraftStream = AsyncGenerator<StreamEvent, void, unknown>;

/** Every provider implementation exports exactly this shape. */
export interface ProviderImpl {
  name: ProviderName;
  generate(input: GenerateInput): Promise<GenerateResult>;
  stream(input: GenerateInput): DraftStream;
}

/** Thrown when a provider is selected but not configured. Surfaced to the UI as a friendly message. */
export class ProviderNotConfiguredError extends Error {
  constructor(provider: ProviderName, missing: string) {
    super(
      `AI_PROVIDER is "${provider}" but ${missing} is not set. ` +
        `Set it in .env.local (locally) or in Vercel project settings (deployed).`,
    );
    this.name = "ProviderNotConfiguredError";
  }
}

/** Thrown on a rate limit so the UI can say something useful rather than showing a 429. */
export class RateLimitedError extends Error {
  /** Which provider refused us. Kept for the server log, deliberately kept out
   *  of the message the person reads. */
  readonly provider: ProviderName;

  /** True when the DAILY allowance is gone rather than the per-minute one.
   *  The difference decides whether waiting helps at all. */
  readonly daily: boolean;

  constructor(provider: ProviderName, daily = false) {
    /* This reaches a lawyer, not a developer: no provider name, no env var,
       and the things they actually need — that nothing was charged, and when
       it is worth trying again. Telling someone to "wait a minute" when the
       day's allowance is gone sends them back every minute until midnight. */
    super(
      daily
        ? `The drafting service has used up today's allowance. Nothing was charged. ` +
            `It resets at 3pm Singapore time; until then drafting will keep failing, ` +
            `so the account needs to be moved off the free allowance.`
        : `The drafting service is busy and turned this request away. Nothing was charged. ` +
            `Wait about a minute and try again — if it keeps happening, the account needs ` +
            `its usage limit raised.`,
    );
    this.name = "RateLimitedError";
    this.provider = provider;
    this.daily = daily;
  }
}

/**
 * Thrown when the provider accepts the key but does not recognise the model id.
 * Separated from a generic error because the fix is specific and unobvious:
 * model names change, and a stale id answers 404 rather than something clearer.
 */
export class ModelNotFoundError extends Error {
  constructor(provider: ProviderName, model: string, envVar: string) {
    super(
      `The ${provider} model "${model}" was not found. Your API key works, but that ` +
        `model id does not exist for it — model names change over time. Set ${envVar} ` +
        `to a current model and redeploy. Run "node scripts/list-models.mjs" to see ` +
        `which models your key can use.`,
    );
    this.name = "ModelNotFoundError";
  }
}

/**
 * Thrown when the provider is up but temporarily has no capacity — Gemini
 * answers 503 for this, often on the free tier at busy times. Distinct from a
 * rate limit (that is your quota) and from a real fault (that is a bug).
 * The adapter retries these before giving up, so seeing this means several
 * attempts all failed.
 */
export class OverloadedError extends Error {
  constructor(provider: ProviderName, attempts: number) {
    super(
      `The ${provider} model is busy and did not respond after ${attempts} attempts. ` +
        `This is capacity on the provider's side, not a problem with the draft. ` +
        `Wait a moment and press Generate again.`,
    );
    this.name = "OverloadedError";
  }
}
