/**
 * The NDA's one length question (062): how long the confidentiality
 * obligations last — a number of years or months, or Perpetual.
 *
 * Stored as the words the drafter reads: "2 years", "1 year", "18 months",
 * "Perpetual". These two functions turn that into the question's controls
 * and back.
 */

export type PeriodUnit = "years" | "months";

export interface Period {
  perpetual: boolean;
  /** "" while the box is empty. */
  n: string;
  unit: PeriodUnit;
}

export function parsePeriod(value: string | undefined): Period {
  const v = (value ?? "").trim();
  if (/^perpetual$/i.test(v)) return { perpetual: true, n: "", unit: "years" };
  const m = /^(\d{1,3})\s*(years?|yrs?|months?|mths?)?$/i.exec(v);
  if (!m) return { perpetual: false, n: "", unit: "years" };
  return { perpetual: false, n: m[1], unit: /^m/i.test(m[2] ?? "") ? "months" : "years" };
}

export function formatPeriod(p: Period): string {
  if (p.perpetual) return "Perpetual";
  const n = p.n.trim();
  if (!n) return "";
  const one = Number(n) === 1;
  return `${n} ${p.unit === "months" ? (one ? "month" : "months") : one ? "year" : "years"}`;
}
