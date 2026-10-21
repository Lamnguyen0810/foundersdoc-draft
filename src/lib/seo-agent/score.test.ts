import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseWeights, scoreKeyword } from "./score";

const base = { relevance: 3, intent: "unknown" as const, search_volume: null, volume_source: null, impressions: null, our_position: null, position_source: null, difficulty: null, difficulty_source: null, effort: "medium" as const };

test("a number without a source is ignored", () => {
  const a = scoreKeyword({ ...base, search_volume: 50000 });
  const b = scoreKeyword(base);
  assert.equal(a.score, b.score);
  assert.equal(a.measured, false);
  assert.ok(a.reasons.some((r) => r.includes("no reliable figure")));
});

test("sourced demand raises the score and counts as measured", () => {
  const a = scoreKeyword({ ...base, search_volume: 5000, volume_source: "Google Keyword Planner" });
  assert.ok(a.score > scoreKeyword(base).score);
  assert.equal(a.measured, true);
});

test("position 4-20 is the quick win, top 3 scores lower", () => {
  const near = scoreKeyword({ ...base, our_position: 12, position_source: "Search Console" });
  const top = scoreKeyword({ ...base, our_position: 2, position_source: "Search Console" });
  assert.ok(near.score > top.score);
});

test("buying intent and high relevance come first", () => {
  const hot = scoreKeyword({ ...base, relevance: 5, intent: "transactional", effort: "small" });
  const cold = scoreKeyword({ ...base, relevance: 1, intent: "navigational", effort: "large" });
  assert.ok(hot.score > 70 && cold.score < 40, `${hot.score} / ${cold.score}`);
});

test("weights are clamped and default when missing", () => {
  const w = normaliseWeights({ relevance: 99, intent: -1, demand: 4 } as never);
  assert.equal(w.relevance, 3);
  assert.equal(w.intent, 2);
  assert.equal(w.demand, 4);
  const zero = scoreKeyword(base, { relevance: 0, intent: 0, demand: 0, position: 0, competition: 0, effort: 0 });
  assert.ok(Number.isFinite(zero.score));
});
