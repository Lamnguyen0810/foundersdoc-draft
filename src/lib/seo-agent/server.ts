import "server-only";

/**
 * The SEO agent on the server: reading its records for Admin → SEO, saving
 * settings and decisions (as the signed-in admin, under row-level security),
 * and the one way in for automated runs — seo_ingest(key, payload) in the
 * database, which checks the private key and every field (104).
 *
 * No admin (service-role) client: automated runs go through seo_ingest with
 * the anonymous key, like any visitor, and the database decides.
 */

import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import type { ScanReport } from "@/lib/seo-audit/scan";
import { groupFindings } from "@/lib/seo-audit/summary";
import { normaliseWeights, scoreKeyword } from "./score";
import type { RecStatus, SeoFinding, SeoKeyword, SeoOverview, SeoRecommendation, SeoRun, SeoSettings } from "./types";

const SETTINGS_COLUMNS =
  "site_url,business,audience,goals,countries,languages,categories,competitors,seed_keywords,platform,frequency,monthly_budget_sgd,scoring,updated_at";

const missingTables = (m?: string) => Boolean(m && /seo_(settings|runs|findings|keywords|recommendations)/.test(m) && /does not exist|schema cache/i.test(m));

/** Everything the SEO tab shows, in one go. */
export async function loadOverview(supabase: SupabaseClient): Promise<SeoOverview> {
  const [s, runs, findings, keywords, recs, key] = await Promise.all([
    supabase.from("seo_settings").select(SETTINGS_COLUMNS).eq("id", 1).maybeSingle(),
    supabase.from("seo_runs").select("id,created_at,source,status,summary,stats,limitations,cost_sgd").order("created_at", { ascending: false }).limit(60),
    supabase.from("seo_findings").select("*").order("last_seen_at", { ascending: false }).limit(300),
    supabase.from("seo_keywords").select("*").limit(500),
    supabase.from("seo_recommendations").select("*").order("priority").order("created_at", { ascending: false }).limit(300),
    supabase.rpc("seo_has_ingest_key"),
  ]);
  if (missingTables(s.error?.message) || missingTables(runs.error?.message)) {
    return { settings: null, hasKey: null, runs: [], findings: [], keywords: [], recommendations: [], missing: true };
  }
  const settings = s.data ? ({ ...(s.data as unknown as SeoSettings), scoring: normaliseWeights((s.data as { scoring?: unknown }).scoring as never) } as SeoSettings) : null;
  const scored = ((keywords.data as SeoKeyword[] | null) ?? [])
    .map((k) => ({ ...k, ...scoreKeyword(k, settings?.scoring) }))
    .sort((a, b) => b.score - a.score);
  return {
    settings,
    hasKey: typeof key.data === "boolean" ? key.data : null,
    runs: (runs.data as SeoRun[] | null) ?? [],
    findings: (findings.data as SeoFinding[] | null) ?? [],
    keywords: scored,
    recommendations: (recs.data as SeoRecommendation[] | null) ?? [],
    missing: false,
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, maxItems: number, maxLen: number) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n|,/) : [])
    .map((x) => str(x, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

/** Settings from the form, checked field by field. */
export function cleanSettings(raw: unknown, userId: string | null): Record<string, unknown> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const url = str(r.site_url, 200);
  const out: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId };
  if (/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url)) out.site_url = url.replace(/\/+$/, "");
  for (const k of ["business", "audience", "goals", "platform"] as const) if (typeof r[k] === "string") out[k] = str(r[k], 1000);
  for (const k of ["countries", "languages"] as const) if (r[k] !== undefined) out[k] = list(r[k], 20, 60);
  for (const k of ["categories", "seed_keywords"] as const) if (r[k] !== undefined) out[k] = list(r[k], 60, 120);
  if (r.competitors !== undefined) out.competitors = list(r.competitors, 20, 120).map((c) => c.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase());
  if (["daily", "weekdays", "weekly", "paused"].includes(String(r.frequency))) out.frequency = r.frequency;
  const budget = Number(r.monthly_budget_sgd);
  if (Number.isFinite(budget) && budget >= 0 && budget <= 100000) out.monthly_budget_sgd = budget;
  if (r.scoring && typeof r.scoring === "object") out.scoring = normaliseWeights(r.scoring as never);
  return out;
}

export async function saveSettings(supabase: SupabaseClient, raw: unknown, userId: string | null) {
  return supabase.from("seo_settings").update(cleanSettings(raw, userId)).eq("id", 1);
}

const STATUSES: RecStatus[] = ["proposed", "approved", "rejected", "in_progress", "done", "measuring"];

export async function setRecommendationStatus(supabase: SupabaseClient, id: string, status: string, note: string, userId: string | null) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !STATUSES.includes(status as RecStatus)) return { error: { message: "Bad request." } };
  const now = new Date().toISOString();
  return supabase
    .from("seo_recommendations")
    .update({
      status,
      status_note: str(note, 1000) || null,
      decided_by: userId,
      decided_at: now,
      ...(status === "done" ? { done_at: now } : {}),
    })
    .eq("id", id);
}

/* ── automated runs ────────────────────────────────────────────────── */

function anonClient(): SupabaseClient {
  return createSupabase(supabaseUrl()!, supabasePublishableKey()!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function ingest(key: string, payload: unknown) {
  const { data, error } = await anonClient().rpc("seo_ingest", { p_key: key, p_payload: payload });
  return { data: data as Record<string, unknown> | null, error };
}

/** A website scan as an ingest payload: one technical finding per kind of problem, with the pages as evidence. */
export function scanToPayload(r: ScanReport): Record<string, unknown> {
  const groups = groupFindings(r).filter((g) => g.level !== "idea");
  const byCode = new Map<string, string[]>();
  for (const p of r.pages) for (const f of p.findings) if (f.level !== "idea") byCode.set(f.code, [...(byCode.get(f.code) ?? []), p.url]);
  return {
    source: "website_scan",
    status: "ok",
    summary: `Website scan: score ${r.score}/100, ${r.counts.pages} pages, ${r.counts.problem} problems, ${r.counts.improve} to improve.`,
    stats: { score: r.score, ...r.counts },
    findings: groups.map((g) => ({
      kind: "technical",
      title: `${g.name}${g.count > 1 ? ` (${g.count})` : ""}`,
      detail: `${g.example} How to fix: ${g.fix}`,
      confidence: "high",
      /* Read straight off our own pages: measured, not guessed. */
      certainty: "verified",
      evidence: (byCode.get(g.code) ?? []).slice(0, 8).map((url) => ({ url, retrieved_at: r.scannedAt.slice(0, 10) })),
    })),
    recommendations: r.opportunities.slice(0, 12).map((o) => ({
      title: o.title,
      description: o.action,
      why: o.why,
      new_page: true,
      impact: o.kind === "country-page" ? "high" : "medium",
      effort: "medium",
      priority: o.kind === "country-page" ? 1 : 2,
      cost_note: "Free (our own time; a lawyer checks legal content)",
      steps: ["Draft the page", "Lawyer checks the legal content", "Publish and link it from related pages", "Check Search Console after 4 weeks"],
      validation: "The page is listed by Google and gets impressions in Search Console within 4–8 weeks",
    })),
  };
}
