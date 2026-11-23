/** Calendar dates for OnPoint, always as "YYYY-MM-DD" and always in Singapore (0267). Pure. */

export const isIso = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** today's date in Singapore (UTC+8, no summer time) */
export function sgToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const toIso = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Add calendar months the way filing deadlines are counted: from a month end to a month end
 * (31 Jan + 1 month = 28/29 Feb; 30 Jun + 6 months = 31 Dec), otherwise the same day, capped at the month's end.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const end = d === lastDay(y, m);
  return toIso(ny, nm, end ? lastDay(ny, nm) : Math.min(d, lastDay(ny, nm)));
}

/** whole calendar days from a to b (b later = positive) */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "31 Jul 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!isIso(iso)) return "–";
  const [y, m, d] = parts(iso);
  return `${d} ${MON[m - 1]} ${y}`;
}

/** "in 14 days", "due today", "3 days overdue" */
export function countdown(due: string, today: string): string {
  const n = daysBetween(today, due);
  if (n === 0) return "due today";
  if (n > 0) return `in ${n} day${n === 1 ? "" : "s"}`;
  return `${-n} day${n === -1 ? "" : "s"} overdue`;
}
