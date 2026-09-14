/**
 * The money meter (mini version of sprint 2.4).
 *
 * Costs nothing to run today on the free tier, but records the number that
 * Phase 2 pricing is built on: what a draft WOULD cost on the paid model.
 *
 * Prices are USD per million tokens and are planning estimates only — check the
 * provider's pricing page before quoting them to anyone.
 */

export interface Price {
  label: string;
  inputPerM: number;
  outputPerM: number;
}

export const PRICES: Record<string, Price> = {
  "gemini-2.5-flash": { label: "Gemini 2.5 Flash (paid tier)", inputPerM: 0.3, outputPerM: 2.5 },
  "gemini-2.5-pro": { label: "Gemini 2.5 Pro", inputPerM: 1.25, outputPerM: 10 },
  "mock-echo-1": { label: "Mock (no cost)", inputPerM: 0, outputPerM: 0 },
  ollama: { label: "Local model (electricity only)", inputPerM: 0, outputPerM: 0 },
};

/** The model the firm would move to at swap register item 1. Used for the "would cost" figure. */
export const PAID_BENCHMARK: Price = {
  label: "Sonnet-class paid model",
  inputPerM: 3,
  outputPerM: 15,
};

export function costUsd(price: Price, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * price.inputPerM + (outputTokens / 1_000_000) * price.outputPerM;
}

export function priceFor(model: string): Price {
  if (PRICES[model]) return PRICES[model];
  if (model.startsWith("gemini")) return PRICES["gemini-2.5-flash"];
  return { label: model, inputPerM: 0, outputPerM: 0 };
}

export function formatUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
