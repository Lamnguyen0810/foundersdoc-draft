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
  /** 0308: [approver, signer] positions: the approver reviews and approves first, and only then does that signer
   *  get their link (e.g. AppWorks' legal team and Nathan approve before their director signs). The others are not held up. */
  approve?: Array<[number, number]>;
  /** 0309: signers for whom ONE approval is enough (any of their approvers); the others then need not approve */
  anyOf?: number[];
  /** 0319: approvers who ALSO sign (e.g. Nathan approves before Lin, and signs himself): their signature is
   *  their approval, so it releases the person they approve for. They have signature boxes like anyone else. */
  signs?: number[];
}

/** 0308: who must approve before this position may sign */
export const approversOf = (o: Order, position: number) => (o.approve ?? []).filter(([, t]) => t === position).map(([a]) => a);
/** 0308: does this position approve for someone (with or without also signing)? */
export const approves = (o: Order, position: number) => (o.approve ?? []).some(([a]) => a === position);
/** 0319: an approver who also signs */
export const alsoSigns = (o: Order, position: number) => approves(o, position) && (o.signs ?? []).includes(position);
/** 0319: an approver who only approves (no boxes, no signature) */
export const approvesOnly = (o: Order, position: number) => approves(o, position) && !alsoSigns(o, position);

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
  const ap = o.approve ?? [];
  if (!parallel && !o.fill.length && !ap.length) return null;
  const any = (o.anyOf ?? []).filter((t) => ap.some(([, x]) => x === t));
  const both = (o.signs ?? []).filter((a) => ap.some(([x]) => x === a));
  return [parallel ? `steps ${o.steps.join("-")}` : "", o.fill.length ? `fill-in ${o.fill.join(",")}` : "", ap.length ? `approve ${ap.map(([a, t]) => `${a}>${t}`).join(",")}` : "", any.length ? `any ${any.join(",")}` : "", both.length ? `also-sign ${both.join(",")}` : ""].filter(Boolean).join(" · ").slice(0, 200) || null;
}

/** 0308: approvals that make sense: an approver approves one signer who signs (not themselves, not another approver,
 *  not someone who only fills in), and does not come after them in the order */
export function cleanApprovals(raw: unknown, steps: number[], fill: number[]): Array<[number, number]> | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const n = steps.length;
  const out: Array<[number, number]> = [];
  for (const x of raw.slice(0, 20)) {
    if (!Array.isArray(x) || x.length !== 2) return null;
    const [a, t] = x.map(Number) as [number, number];
    if (![a, t].every((p) => Number.isInteger(p) && p >= 1 && p <= n) || a === t || fill.includes(a) || fill.includes(t)) return null;
    if (steps[a - 1]! > steps[t - 1]!) return null;
    out.push([a, t]);
  }
  const who = new Set(out.map(([a]) => a));
  if (out.some(([, t]) => who.has(t))) return null;
  if (new Set(out.map(([a]) => a)).size !== out.length) return null;
  return out;
}

/** read the line back; anything unreadable is the default */
export function parseOrder(detail: string | null | undefined, n: number): Order {
  const steps = /steps ([\d-]+)/.exec(detail ?? "")?.[1]?.split("-").map(Number) ?? [];
  const fill = (/fill-in ([\d,]+)/.exec(detail ?? "")?.[1]?.split(",").map(Number) ?? []).filter((p) => Number.isInteger(p) && p >= 1 && p <= n);
  const approve = (/approve ([\d>,]+)/.exec(detail ?? "")?.[1]?.split(",") ?? [])
    .map((x) => x.split(">").map(Number) as [number, number])
    .filter(([a, t]) => [a, t].every((p) => Number.isInteger(p) && p >= 1 && p <= n));
  const anyOf = (/(?:^|· )any ([\d,]+)/.exec(detail ?? "")?.[1]?.split(",").map(Number) ?? []).filter((p) => Number.isInteger(p) && p >= 1 && p <= n);
  const signs = (/also-sign ([\d,]+)/.exec(detail ?? "")?.[1]?.split(",").map(Number) ?? []).filter((p) => approve.some(([a]) => a === p));
  return { steps: cleanSteps(steps, n) ?? plain(n), fill, ...(approve.length ? { approve } : {}), ...(anyOf.length ? { anyOf } : {}), ...(signs.length ? { signs } : {}) };
}

/** what the "order" line means, in words, for the audit trail */
export function orderText(o: Order, names: string[]): string {
  const groups: string[][] = [];
  o.steps.forEach((s, i) => (groups[s - 1] ??= []).push(names[i] ?? `Person ${i + 1}`));
  const parts = groups.map((g) => (g.length > 1 ? `${g.join(", ")} (at the same time)` : g[0]!));
  const fill = o.fill.map((p) => names[p - 1] ?? `Person ${p}`);
  const ap = (o.approve ?? []).map(([a, t]) => `${names[a - 1] ?? `Person ${a}`} approves before ${names[t - 1] ?? `Person ${t}`}${(o.signs ?? []).includes(a) ? ", and signs" : ""}`);
  return `${parts.join(", then ")}${fill.length ? `. Fill in only, no signature: ${fill.join(", ")}` : ""}${ap.length ? `. ${ap.join("; ")}` : ""}`;
}
