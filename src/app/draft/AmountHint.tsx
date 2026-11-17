"use client";

import { amountProblem, formatAmount, parseAmount } from "@/lib/amount";

/**
 * Under a box that takes money or a number of shares (0241): what is wrong
 * with what was typed — "Is that 50,000?" — so it is put right on the spot
 * instead of coming out of the agreement as a blank. Nothing when it reads.
 */
export default function AmountHint({ value, lenient }: { value: string | undefined; lenient?: boolean }) {
  const problem = amountProblem(value ?? "");
  /* lenient: a box that also takes words ("SGD 8,000 plus commission") only
     asks about a figure that could be read two ways. */
  if (!problem || (lenient && !problem.startsWith("Is that"))) return null;
  return <span className="ts-refuse" role="alert">{problem}</span>;
}

/** Under a typed amount in the conversation: the figure as it will be read. */
export function ReadAs({ value, sign = "" }: { value: string; sign?: string }) {
  const n = parseAmount(value);
  if (!Number.isFinite(n)) return null;
  return (
    <p className="later" style={{ flexBasis: "100%", margin: 0 }}>
      Read as <b>{sign}{formatAmount(n)}</b>
    </p>
  );
}
