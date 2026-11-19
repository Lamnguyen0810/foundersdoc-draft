import "server-only";
import { createSign } from "node:crypto";
import { REGION_GROUPS, countryName, type CountryRow, type QueryRow, type RegionUpload } from "./figures";

/**
 * Search Console, read automatically (0248): the same figures the upload box takes, fetched each morning.
 *
 * HOW IT IS ALLOWED TO. A Google "service account" (a robot account, free) is added in Search Console as a
 * Restricted user, and its key is kept in Vercel as GSC_SERVICE_ACCOUNT_JSON (a secret: never in code, Slack
 * or a pull request). With the key this file signs a short-lived request, Google answers with a one-hour
 * token, and the token reads Search Console's Search Analytics. Read-only: the scope asked for cannot change
 * anything in Search Console.
 *
 * WHAT IT READS, once a day:
 *   - every country's clicks, impressions and position            → the region table
 *   - the busiest 1,000 searches across all countries             → the followed searches, all regions
 *   - the busiest 1,000 searches in each country of a region group → the followed searches, per country
 * Only countries, searches and counts. No person is in any of it.
 *
 * Not set up = nothing happens: the upload box on Admin → SEO still works by hand.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
/** The property as Search Console names it. A domain property is "sc-domain:<domain>". */
const site = () => process.env.GSC_SITE?.trim() || "sc-domain:foundersdoc.com";
export const AUTO = "Search Console (automatic)";

interface Key {
  client_email: string;
  private_key: string;
}

/** The service account's key from Vercel, or null when it is not set or not a key. Never logged. */
export function gscKey(): Key | null {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const k = JSON.parse(raw) as Partial<Key>;
    if (typeof k.client_email !== "string" || typeof k.private_key !== "string" || !k.private_key.includes("PRIVATE KEY")) return null;
    return { client_email: k.client_email, private_key: k.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}
export const gscConfigured = () => gscKey() !== null;

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** The signed request Google swaps for a token: who is asking, for what, for the next hour. */
export function assertion(key: Key, nowSeconds: number): string {
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key.private_key);
  return `${head}.${claims}.${b64(signature)}`;
}

/** The last 7 full days Search Console has: it runs about 2 days behind, so the period ends 3 days ago. */
export function period(now: Date): { start: string; end: string } {
  const day = (back: number) => new Date(now.getTime() - back * 86_400_000).toISOString().slice(0, 10);
  return { start: day(9), end: day(3) };
}

export class GscError extends Error {}

async function token(key: Key): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assertion(key, Math.floor(Date.now() / 1000)) }),
    signal: AbortSignal.timeout(15_000),
  });
  const out = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !out.access_token) throw new GscError(`Google did not accept the key: ${out.error_description || out.error || res.status}`);
  return out.access_token;
}

type Row = { keys?: string[]; clicks?: number; impressions?: number; position?: number };

async function analytics(access: string, body: Record<string, unknown>): Promise<Row[]> {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site())}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const out = (await res.json().catch(() => ({}))) as { rows?: Row[]; error?: { message?: string } };
  if (!res.ok) {
    /* 403 here nearly always means the service account was not added in Search Console (Settings → Users and permissions) */
    throw new GscError(res.status === 403 ? `Search Console refused: add ${"the service account"} as a user of ${site()} (Settings → Users and permissions). ${out.error?.message ?? ""}` : `Search Console answered ${res.status}: ${out.error?.message ?? ""}`);
  }
  return out.rows ?? [];
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
const position = (v: unknown) => Math.round(n(v) * 10) / 10;

/** Google's rows → what is stored (the same shapes the upload box makes). */
export function countryRows(rows: Row[]): CountryRow[] {
  return rows.map((r) => ({ country: countryName(r.keys?.[0] ?? ""), clicks: n(r.clicks), impressions: n(r.impressions), position: position(r.position) })).filter((r) => r.country);
}
export function queryRows(rows: Row[]): QueryRow[] {
  return rows.map((r) => ({ query: String(r.keys?.[0] ?? "").slice(0, 200), clicks: n(r.clicks), impressions: n(r.impressions), position: position(r.position) })).filter((r) => r.query);
}

/** Today's figures: one upload for every country, then one for each country of a region group that had any impressions. */
export async function fetchRegionUploads(now: Date = new Date()): Promise<RegionUpload[]> {
  const key = gscKey();
  if (!key) throw new GscError("GSC_SERVICE_ACCOUNT_JSON is not set.");
  const access = await token(key);
  const { start, end } = period(now);
  const base = { startDate: start, endDate: end, dataState: "final" };
  const [byCountry, bySearch] = await Promise.all([
    analytics(access, { ...base, dimensions: ["country"], rowLimit: 300 }),
    analytics(access, { ...base, dimensions: ["query"], rowLimit: 1000 }),
  ]);
  const countries = countryRows(byCountry);
  const out: RegionUpload[] = [{ date_from: start, date_to: end, country: null, countries, queries: queryRows(bySearch) }];
  const seen = new Set(countries.filter((c) => c.impressions > 0).map((c) => c.country));
  /* Google names a country by its three-letter code; ask for each country we follow that showed at all */
  const code = new Map(byCountry.map((r) => [countryName(r.keys?.[0] ?? ""), r.keys?.[0] ?? ""]));
  for (const name of REGION_GROUPS.flatMap((g) => g.countries)) {
    if (!seen.has(name) || !code.get(name)) continue;
    const rows = await analytics(access, { ...base, dimensions: ["query"], rowLimit: 1000, dimensionFilterGroups: [{ filters: [{ dimension: "country", operator: "equals", expression: code.get(name) }] }] });
    out.push({ date_from: start, date_to: end, country: name, countries: countries.filter((c) => c.country === name), queries: queryRows(rows) });
  }
  return out;
}
