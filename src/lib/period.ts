/**
 * The NDA's one length question (062): how long the confidentiality
 * obligations last — years and months (either or both), or Perpetual.
 *
 * Stored as the words the drafter reads: "2 years", "1 year and 3 months",
 * "18 months", "Perpetual". These two functions turn that into the
 * question's boxes and back.
 */

export interface Period {
  perpetual: boolean;
  /** "" while the box is empty. */
  years: string;
  months: string;
}

export function parsePeriod(value: string | undefined): Period {
  const v = (value ?? "").trim();
  if (/^perpetual$/i.test(v)) return { perpetual: true, years: "", months: "" };
  const y = /(\d{1,3})\s*(?:years?|yrs?)\b/i.exec(v);
  const m = /(\d{1,3})\s*(?:months?|mths?)\b/i.exec(v);
  /* A bare number, as stored before months were offered: years. */
  const bare = !y && !m ? /^(\d{1,3})$/.exec(v) : null;
  return { perpetual: false, years: y?.[1] ?? bare?.[1] ?? "", months: m?.[1] ?? "" };
}

export function formatPeriod(p: Period): string {
  if (p.perpetual) return "Perpetual";
  const y = Number(p.years) || 0;
  const m = Number(p.months) || 0;
  const parts = [
    y ? `${y} ${y === 1 ? "year" : "years"}` : "",
    m ? `${m} ${m === 1 ? "month" : "months"}` : "",
  ].filter(Boolean);
  return parts.join(" and ");
}
