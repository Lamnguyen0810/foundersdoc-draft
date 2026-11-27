/**
 * 0304 (Rachel's envelopes): who signs when, and who only fills in.
 *  - steps: one number per signer, in order. Signers with the same step sign AT THE SAME TIME (parallel), e.g.
 *    four directors [1, 1, 1, 1] and then the cosec [2]. Default: one after another (1, 2, 3 …).
 *  - fill: a person who only fills in boxes (a date on the dating line), with no signature.
 * Kept as one "order" line in the audit trail (no new table): "steps 1-1-1-1-2 · fill-in 5". Pure.
 */

export interface Order {
  steps: number[];
  /** positions (1 = first person) who only fill in */
  fill: number[];
}

/** steps from "same time as the person above" ticks: [false, true, true, true, false] → [1, 1, 1, 1, 2] */
export function stepsFrom(withAbove: boolean[]): number[] {
  const out: number[] = [];
  withAbove.forEach((w, i) => out.push(i === 0 ? 1 : w ? out[i - 1]! : out[i - 1]! + 1));
  return out;
}

/** valid steps: one per signer, start at 1, never go down, never skip */
export function cleanSteps(raw: unknown, n: number): number[] | null {
  if (!Array.isArray(raw) || raw.length !== n) return null;
  const s = raw.map((x) => Number(x));
  if (s[0] !== 1) return null;
  for (let i = 1; i < n; i++) if (!Number.isInteger(s[i]) || (s[i] !== s[i - 1] && s[i] !== s[i - 1]! + 1)) return null;
  return s;
}

const plain = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** the audit-trail line, or null when it is the default (one after another, everyone signs) */
export function orderLine(o: Order): string | null {
  const parallel = o.steps.some((s, i) => s !== i + 1);
  if (!parallel && !o.fill.length) return null;
  return [parallel ? `steps ${o.steps.join("-")}` : "", o.fill.length ? `fill-in ${o.fill.join(",")}` : ""].filter(Boolean).join(" · ").slice(0, 200) || null;
}

/** read the line back; anything unreadable is the default */
export function parseOrder(detail: string | null | undefined, n: number): Order {
  const steps = /steps ([\d-]+)/.exec(detail ?? "")?.[1]?.split("-").map(Number) ?? [];
  const fill = (/fill-in ([\d,]+)/.exec(detail ?? "")?.[1]?.split(",").map(Number) ?? []).filter((p) => Number.isInteger(p) && p >= 1 && p <= n);
  return { steps: cleanSteps(steps, n) ?? plain(n), fill };
}

/** what the "order" line means, in words, for the audit trail */
export function orderText(o: Order, names: string[]): string {
  const groups: string[][] = [];
  o.steps.forEach((s, i) => (groups[s - 1] ??= []).push(names[i] ?? `Person ${i + 1}`));
  const parts = groups.map((g) => (g.length > 1 ? `${g.join(", ")} (at the same time)` : g[0]!));
  const fill = o.fill.map((p) => names[p - 1] ?? `Person ${p}`);
  return `${parts.join(", then ")}${fill.length ? `. Fill in only, no signature: ${fill.join(", ")}` : ""}`;
}
