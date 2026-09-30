/**
 * The jurisdictions the NDA's governing-law question offers.
 *
 * By JURISDICTION, not country: where contract law is set state by state or
 * part by part — the United States, Australia, Canada, the United Kingdom —
 * the choice is the state or part, listed under its country ("United States ›
 * California"). Anywhere else the country is the jurisdiction. Anything not
 * listed is typed in under "Other".
 *
 * The list lives in the question's options (admin-editable), one string per
 * choice: "Singapore", or "United States › California" for a state. These
 * helpers read that shape; the answer stored is what the drafter reads —
 * "Singapore", "California, United States".
 */

import { JURISDICTIONS } from "./doctypes.data.mjs";

export const SEP = " › ";

/* The list itself is in doctypes.data.mjs (plain JS, so the seed generator
   can read it too). */
export const DEFAULT_JURISDICTIONS: string[] = JURISDICTIONS;

export interface JurisdictionGroup {
  /** The country. */
  name: string;
  /** Its states or parts, when it is chosen by them; empty when the country is the choice. */
  parts: string[];
}

/** The options, grouped by country, in the order given. */
export function groupJurisdictions(options: string[]): JurisdictionGroup[] {
  const out: JurisdictionGroup[] = [];
  for (const raw of options) {
    const [country, part] = raw.split(SEP).map((s) => s.trim());
    if (!country) continue;
    let g = out.find((x) => x.name === country);
    if (!g) {
      g = { name: country, parts: [] };
      out.push(g);
    }
    if (part) g.parts.push(part);
  }
  return out;
}

/**
 * The ones asked for most, shown first under "Popular" in this order; the
 * rest follow A–Z. Countries, not choices: the United Kingdom and the
 * United States bring their parts and states with them.
 */
export const POPULAR_COUNTRIES = ["Singapore", "United Kingdom", "United States"];

/** Popular first (in POPULAR_COUNTRIES order, parts as listed), then every
 *  other country A–Z with its parts A–Z. */
export function orderJurisdictions(groups: JurisdictionGroup[]): { popular: JurisdictionGroup[]; rest: JurisdictionGroup[] } {
  const popular = POPULAR_COUNTRIES.map((n) => groups.find((g) => g.name === n)).filter((g): g is JurisdictionGroup => Boolean(g));
  const rest = groups
    .filter((g) => !POPULAR_COUNTRIES.includes(g.name))
    .map((g) => ({ ...g, parts: [...g.parts].sort((a, b) => a.localeCompare(b, "en-GB")) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  return { popular, rest };
}

/** The answer for a choice: "Singapore", "California, United States". */
export function jurisdictionValue(country: string, part?: string): string {
  return part ? `${part}, ${country}` : country;
}

/** Whether an answer is one of the listed choices (otherwise it was typed). */
export function isListedJurisdiction(value: string, options: string[]): boolean {
  return groupJurisdictions(options).some((g) =>
    g.parts.length ? g.parts.some((p) => jurisdictionValue(g.name, p) === value) : g.name === value,
  );
}
