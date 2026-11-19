/**
 * SEO by region (0247): where foundersdoc.com shows up in Google, region by region, worked out from a
 * Search Console export. Pure code: the upload box, the Admin page and the tests share it.
 *
 * WHY BY REGION. What someone sees depends on where they search from. The daily SEO check used a free web
 * search run from the United States and reported "not found" for searches where we are first in Singapore.
 * Search Console is Google's own record, by country, so it is the source here.
 *
 * WHAT AN EXPORT HOLDS (Performance → Export → Download CSV, a zip):
 *   Countries.csv   Country, Clicks, Impressions, CTR, Position
 *   Queries.csv     Top queries, Clicks, Impressions, CTR, Position
 *   Dates.csv       Date, …            (the period covered)
 *   Filters.csv     Filter, Value      (a Country row when the export was made for one country)
 * An export with no Country filter covers every country. One made with a Country filter gives that
 * country's search phrases.
 */

export interface CountryRow {
  country: string;
  clicks: number;
  impressions: number;
  position: number;
}
export interface QueryRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}
export interface RegionUpload {
  id?: string;
  uploaded_at?: string;
  uploaded_by?: string | null;
  date_from: string | null;
  date_to: string | null;
  /** null = every country; otherwise the one country the export was filtered to */
  country: string | null;
  countries: CountryRow[];
  queries: QueryRow[];
}

/** The same groups, in the same order, as the daily Slack report. */
export const REGION_GROUPS: { id: string; name: string; countries: string[] }[] = [
  { id: "sg", name: "Singapore", countries: ["Singapore"] },
  { id: "sea", name: "Southeast Asia", countries: ["Vietnam", "Malaysia", "Indonesia", "Thailand", "Philippines"] },
  { id: "hk", name: "Hong Kong", countries: ["Hong Kong"] },
  { id: "uk", name: "UK", countries: ["United Kingdom"] },
  { id: "us", name: "US", countries: ["United States"] },
  { id: "anz-in", name: "Australia and India", countries: ["Australia", "India"] },
];
export const OTHER_REGION = { id: "other", name: "Everywhere else" };

/** The names Search Console and people use for the same place. */
const ALIASES: Record<string, string> = {
  "viet nam": "vietnam",
  uk: "united kingdom",
  "great britain": "united kingdom",
  usa: "united states",
  us: "united states",
  "united states of america": "united states",
  "hong kong sar china": "hong kong",
  "hong kong sar": "hong kong",
};
export const countryKey = (name: string) => {
  const k = name.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[k] ?? k;
};

/** The searches we follow: the same list as the daily check. */
export const PHRASES: { phrase: string; brand?: boolean }[] = [
  { phrase: "draft NDA online" },
  { phrase: "NDA template Singapore" },
  { phrase: "non disclosure agreement template Singapore" },
  { phrase: "mutual NDA template" },
  { phrase: "term sheet template Singapore" },
  { phrase: "employment contract template Singapore" },
  { phrase: "employment contract template UK" },
  { phrase: "contractor agreement template Singapore" },
  { phrase: "shareholders agreement template Singapore" },
  { phrase: "share purchase agreement template Singapore" },
  { phrase: "share subscription agreement template Singapore" },
  { phrase: "convertible loan agreement template Singapore" },
  { phrase: "loan agreement template Singapore" },
  { phrase: "services agreement template Singapore" },
  { phrase: "IP assignment agreement template" },
  { phrase: "joint venture agreement template Singapore" },
  { phrase: "AI legal document drafting Singapore" },
  { phrase: "Founders Doc", brand: true },
  { phrase: "FD AI Founders Doc", brand: true },
];

export interface RegionRow {
  id: string;
  name: string;
  showing: boolean;
  impressions: number;
  clicks: number;
  /** average position, weighted by impressions; null when there were none */
  position: number | null;
  /** impressions now minus impressions in the upload before; null when there is none to compare */
  change: number | null;
  /** the countries behind the row that had any impressions, most first */
  from: string[];
}

function groupOf(country: string): string {
  const k = countryKey(country);
  return REGION_GROUPS.find((g) => g.countries.some((c) => countryKey(c) === k))?.id ?? OTHER_REGION.id;
}

function sums(rows: CountryRow[]): Map<string, { impressions: number; clicks: number; weighted: number; from: Array<[string, number]> }> {
  const out = new Map<string, { impressions: number; clicks: number; weighted: number; from: Array<[string, number]> }>();
  for (const r of rows) {
    const id = groupOf(r.country);
    const g = out.get(id) ?? { impressions: 0, clicks: 0, weighted: 0, from: [] };
    g.impressions += r.impressions;
    g.clicks += r.clicks;
    g.weighted += r.position * r.impressions;
    if (r.impressions > 0) g.from.push([r.country, r.impressions]);
    out.set(id, g);
  }
  return out;
}

/** One row per region group, in the fixed order, from an all-countries upload (and the one before it, for the change). */
export function regionTable(now: RegionUpload, before?: RegionUpload | null): RegionRow[] {
  const a = sums(now.countries);
  const b = before ? sums(before.countries) : null;
  return [...REGION_GROUPS, OTHER_REGION].map((g) => {
    const s = a.get(g.id);
    const impressions = s?.impressions ?? 0;
    return {
      id: g.id,
      name: g.name,
      showing: impressions > 0,
      impressions,
      clicks: s?.clicks ?? 0,
      position: s && impressions > 0 ? Math.round((s.weighted / impressions) * 10) / 10 : null,
      change: b ? impressions - (b.get(g.id)?.impressions ?? 0) : null,
      from: (s?.from ?? []).sort((x, y) => y[1] - x[1]).map((x) => x[0]),
    };
  });
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

export interface PhraseRow {
  phrase: string;
  brand: boolean;
  /** how many searches the phrase stands for: the exact one plus those that hold every word of it */
  matches: number;
  impressions: number;
  clicks: number;
  position: number | null;
  /** the search behind most of the impressions, when it is not the phrase itself */
  mostly: string | null;
}

/** Where each followed search stands in one upload. A search counts when it has every word of the phrase. */
export function phraseTable(upload: RegionUpload): PhraseRow[] {
  const rows = upload.queries.map((q) => ({ q, set: new Set(words(q.query)) }));
  return PHRASES.map(({ phrase, brand }) => {
    const want = words(phrase);
    const hits = rows.filter((r) => want.every((w) => r.set.has(w))).map((r) => r.q);
    const impressions = hits.reduce((n, h) => n + h.impressions, 0);
    const top = [...hits].sort((x, y) => y.impressions - x.impressions)[0];
    return {
      phrase,
      brand: !!brand,
      matches: hits.length,
      impressions,
      clicks: hits.reduce((n, h) => n + h.clicks, 0),
      position: impressions > 0 ? Math.round((hits.reduce((n, h) => n + h.position * h.impressions, 0) / impressions) * 10) / 10 : null,
      mostly: top && words(top.query).join(" ") !== want.join(" ") ? top.query : null,
    };
  });
}

/* ── reading the export ─────────────────────────────────────────────────────────── */

/** A CSV file as rows of cells (quotes, commas inside quotes and doubled quotes handled). */
export function csvRows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) out.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) out.push(row);
  return out;
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[%,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** The rows of Countries.csv or Queries.csv: the first column is the name, the rest are found by their headings. */
function table(text: string): Array<{ name: string; clicks: number; impressions: number; position: number }> {
  const rows = csvRows(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const at = (name: string) => head.findIndex((h) => h === name);
  const [c, i, p] = [at("clicks"), at("impressions"), at("position")];
  if (i < 0) return [];
  return rows
    .slice(1)
    .map((r) => ({ name: (r[0] ?? "").trim(), clicks: c < 0 ? 0 : num(r[c]), impressions: num(r[i]), position: p < 0 ? 0 : num(r[p]) }))
    .filter((r) => r.name);
}

export class ExportError extends Error {}

/**
 * The files of one export, by name (as unzipped, or dropped one by one) → what is stored.
 * Needs Countries.csv or Queries.csv; the period and the country filter are read when their files are there.
 */
export function readExport(files: Record<string, string>): RegionUpload {
  const find = (name: string) => Object.entries(files).find(([k]) => k.toLowerCase().replace(/^.*[\\/]/, "").startsWith(name))?.[1];
  const countries = table(find("countries") ?? "").map((r) => ({ country: r.name, clicks: r.clicks, impressions: r.impressions, position: r.position }));
  const queries = table(find("queries") ?? "").map((r) => ({ query: r.name, clicks: r.clicks, impressions: r.impressions, position: r.position }));
  if (!countries.length && !queries.length)
    throw new ExportError("This doesn't look like a Search Console export. In Search Console open Performance, press Export, choose Download CSV, and drop the zip file here.");
  const days = csvRows(find("dates") ?? "")
    .slice(1)
    .map((r) => (r[0] ?? "").trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const filter = csvRows(find("filters") ?? "").find((r) => (r[0] ?? "").trim().toLowerCase() === "country");
  return {
    date_from: days[0] ?? null,
    date_to: days.at(-1) ?? null,
    country: filter?.[1]?.trim() || null,
    countries: countries.slice(0, 300),
    /* the busiest 1,000 searches are plenty, and keep a row small */
    queries: queries.sort((a, b) => b.impressions - a.impressions).slice(0, 1000),
  };
}
