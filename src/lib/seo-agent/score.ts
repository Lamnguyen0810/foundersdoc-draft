/**
 * Which keywords to work on first: a transparent score from 0 to 100.
 *
 * Six factors, each from 0 to 1, weighted by the settings (Admin → SEO →
 * Settings; defaults in types.ts). Every factor says why it scored what it
 * did, and a factor with no real data scores in the middle and says so —
 * it never pretends to know.
 *
 *   relevance    how close the keyword is to what we sell (1–5, set by a person
 *                or the research)
 *   intent       what the searcher wants: to get a document (best), compare,
 *                learn, or find a brand
 *   demand       searches a month or Search Console impressions, only when a
 *                real source gave them
 *   position     where we rank now, if measured: 4–20 is the quick win
 *   competition  difficulty from a trusted source, if any
 *   effort       how much work the page or change takes
 */

import { DEFAULT_WEIGHTS, type Effort, type Intent, type SeoKeyword, type Weights } from "./types";

const INTENT: Record<Intent, { v: number; why: string }> = {
  transactional: { v: 1, why: "the searcher wants a document now" },
  commercial: { v: 0.8, why: "the searcher is comparing options" },
  informational: { v: 0.5, why: "the searcher wants to learn (good for guides)" },
  navigational: { v: 0.2, why: "the searcher is looking for a particular site" },
  unknown: { v: 0.4, why: "intent not worked out yet" },
};
const EFFORT: Record<Effort, number> = { small: 1, medium: 0.6, large: 0.3 };

export function normaliseWeights(w: Partial<Weights> | null | undefined): Weights {
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(out) as (keyof Weights)[]) {
    const v = Number(w?.[k]);
    if (Number.isFinite(v) && v >= 0 && v <= 10) out[k] = v;
  }
  return out;
}

export function scoreKeyword(k: Pick<SeoKeyword, "relevance" | "intent" | "search_volume" | "volume_source" | "impressions" | "our_position" | "position_source" | "difficulty" | "difficulty_source" | "effort">, weights?: Partial<Weights>) {
  const w = normaliseWeights(weights);
  const reasons: string[] = [];
  let measured = false;

  const rel = Math.min(5, Math.max(1, Math.round(k.relevance || 3)));
  const fRel = (rel - 1) / 4;
  reasons.push(`Relevance ${rel}/5`);

  const it = INTENT[k.intent] ?? INTENT.unknown;
  reasons.push(`Intent: ${it.why}`);

  let fDemand = 0.3;
  if (k.search_volume != null && k.volume_source) {
    fDemand = Math.min(1, Math.log10(k.search_volume + 1) / 4);
    reasons.push(`Demand: ${k.search_volume.toLocaleString("en-GB")} searches a month (${k.volume_source})`);
    measured = true;
  } else if (k.impressions != null) {
    fDemand = Math.min(1, Math.log10(k.impressions + 1) / 4);
    reasons.push(`Demand: ${k.impressions.toLocaleString("en-GB")} impressions (Search Console)`);
    measured = true;
  } else {
    reasons.push("Demand: no reliable figure yet (scored as average)");
  }

  let fPos = 0.5;
  if (k.our_position != null && k.position_source) {
    const p = k.our_position;
    measured = true;
    if (p <= 3) {
      fPos = 0.3;
      reasons.push(`We already rank ${p} (${k.position_source}) — little to gain`);
    } else if (p <= 20) {
      fPos = 1;
      reasons.push(`We rank ${p} (${k.position_source}) — close to the top, a quick win`);
    } else if (p <= 50) {
      fPos = 0.6;
      reasons.push(`We rank ${p} (${k.position_source})`);
    } else {
      fPos = 0.4;
      reasons.push(`We rank ${p} (${k.position_source}) — far down`);
    }
  } else {
    reasons.push("Position: not measured yet");
  }

  let fComp = 0.5;
  if (k.difficulty != null && k.difficulty_source) {
    fComp = 1 - k.difficulty / 100;
    reasons.push(`Difficulty ${k.difficulty}/100 (${k.difficulty_source})`);
    measured = true;
  } else {
    reasons.push("Competition: no trusted difficulty score (scored as average)");
  }

  const fEff = EFFORT[k.effort] ?? EFFORT.medium;
  reasons.push(`Effort: ${k.effort}`);

  const total = w.relevance + w.intent + w.demand + w.position + w.competition + w.effort || 1;
  const raw = w.relevance * fRel + w.intent * it.v + w.demand * fDemand + w.position * fPos + w.competition * fComp + w.effort * fEff;
  return { score: Math.round((100 * raw) / total), reasons, measured };
}
