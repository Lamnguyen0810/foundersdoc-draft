/**
 * Paid annual leave the law guarantees, in working days a year, for a
 * full-time employee in their first year — on top of public holidays, which
 * is how the master grants leave ("in addition to all public holidays").
 *
 * The screen will not accept fewer days than this for the place the
 * employee works, and the back end flags it red if it ever gets through.
 * Places not listed have no floor here; the lawyer's review covers them.
 *
 * FD to confirm the figures and add places. Keys are the country, or the
 * state or part for the countries the jurisdiction picker splits.
 */
export const LEAVE_MINIMUM_DAYS: Record<string, number> = {
  "United Kingdom": 20,
  "England and Wales": 20,
  Scotland: 20,
  "Northern Ireland": 20,
  Ireland: 20,
  Singapore: 7,
  Malaysia: 8,
  "Hong Kong": 7,
  Australia: 20,
  "New Zealand": 20,
  Germany: 20,
  France: 25,
  Netherlands: 20,
  Belgium: 20,
  Spain: 22,
  Italy: 20,
  Portugal: 22,
  Austria: 25,
  Denmark: 25,
  Sweden: 25,
  Norway: 21,
  Finland: 24,
  Poland: 20,
  India: 12,
  Indonesia: 12,
  Philippines: 5,
  Thailand: 6,
  Vietnam: 12,
  Japan: 10,
  "South Korea": 15,
  China: 5,
  "United Arab Emirates": 30,
  Canada: 10,
};

/** The floor for a jurisdiction answer ("California, United States" → none;
 *  "England and Wales, United Kingdom" → 20), or null when none is set. */
export function leaveFloor(jurisdiction: string): number | null {
  const parts = jurisdiction.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of [parts[0], parts[parts.length - 1]]) {
    if (p && p in LEAVE_MINIMUM_DAYS) return LEAVE_MINIMUM_DAYS[p];
  }
  return null;
}
