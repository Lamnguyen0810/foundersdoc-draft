/**
 * The SEO agent's records, as stored in Supabase (104_seo_agent.sql) and
 * passed between the admin API and the SEO tab. Shared by client and server.
 */

export type Certainty = "verified" | "estimate";
export type Confidence = "high" | "medium" | "low";
export type Intent = "informational" | "commercial" | "transactional" | "navigational" | "unknown";
export type Effort = "small" | "medium" | "large";
export type RecStatus = "proposed" | "approved" | "rejected" | "in_progress" | "done" | "measuring";

export interface Evidence {
  url: string;
  title?: string;
  retrieved_at?: string;
}

export interface Weights {
  relevance: number;
  intent: number;
  demand: number;
  position: number;
  competition: number;
  effort: number;
}

export const DEFAULT_WEIGHTS: Weights = { relevance: 3, intent: 2, demand: 2, position: 2, competition: 1, effort: 1 };

export interface SeoSettings {
  site_url: string;
  business: string;
  audience: string;
  goals: string;
  countries: string[];
  languages: string[];
  categories: string[];
  competitors: string[];
  seed_keywords: string[];
  platform: string;
  frequency: "daily" | "weekdays" | "weekly" | "paused";
  monthly_budget_sgd: number;
  scoring: Weights;
  updated_at: string;
}

export interface SeoRun {
  id: string;
  created_at: string;
  source: "website_scan" | "daily_research" | "weekly_summary" | "manual";
  status: "ok" | "partial" | "failed";
  summary: string | null;
  stats: Record<string, unknown>;
  limitations: string | null;
  cost_sgd: number;
}

export interface SeoFinding {
  id: string;
  run_id: string | null;
  found_at: string;
  last_seen_at: string;
  seen_count: number;
  kind: "keyword" | "competitor" | "content_gap" | "technical" | "question" | "trend" | "page_improvement";
  title: string;
  detail: string | null;
  page_url: string | null;
  keyword: string | null;
  evidence: Evidence[];
  confidence: Confidence;
  certainty: Certainty;
}

export interface SeoKeyword {
  id: string;
  keyword: string;
  country: string;
  language: string;
  intent: Intent;
  variations: string[];
  page_url: string | null;
  search_volume: number | null;
  volume_source: string | null;
  difficulty: number | null;
  difficulty_source: string | null;
  our_position: number | null;
  position_source: string | null;
  impressions: number | null;
  competitor_pages: string[];
  content_type: string | null;
  relevance: number;
  effort: Effort;
  next_action: string | null;
  first_seen: string;
  updated_at: string;
}

export interface ScoredKeyword extends SeoKeyword {
  score: number;
  reasons: string[];
  /** True when at least one number behind the score was measured, not guessed. */
  measured: boolean;
}

export interface SeoRecommendation {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  page_url: string | null;
  new_page: boolean;
  keyword: string | null;
  intent: string | null;
  why: string | null;
  impact: "high" | "medium" | "low";
  effort: Effort;
  cost_note: string | null;
  priority: 1 | 2 | 3;
  steps: string[];
  validation: string | null;
  evidence: Evidence[];
  status: RecStatus;
  status_note: string | null;
  decided_at: string | null;
  done_at: string | null;
}

export interface SeoOverview {
  settings: SeoSettings | null;
  hasKey: boolean | null;
  runs: SeoRun[];
  findings: SeoFinding[];
  keywords: ScoredKeyword[];
  recommendations: SeoRecommendation[];
  missing: boolean;
}
