/**
 * Money and share numbers as people type them (0240 for the loan agreement;
 * every document since 0241).
 *
 * A reviewer typed "1.000.000" (one million, with dots for thousands) as a
 * Lender's amount; the old reader only knew "1,000,000" and the agreement
 * came out with a blank. The other documents had the same reader, and a
 * worse case: "50.000" was accepted and read as fifty. Every amount and
 * share count — a loan, an investment, a fee, a price, a cap, shares issued
 * or bought — is now read here, the same way on the screen (which refuses
 * what it cannot read) and on the server (which never guesses).
 *
 * Read:    50000 · 50,000 · 1,000,000.50 · 1.000.000 · 1.000.000,50 ·
 *          1 000 000 · 1'000'000 · 1,00,000 (lakh) · S$50,000 · USD 5m ·
 *          250k · 1.5 million · 2bn · "5,000 shares"
 * Refused: 50.000 (fifty, or fifty thousand?), words, anything else.
 *
 * Pure: no imports, so the screen and the server share it.
 */

const CODES = "sgd|usd|hkd|gbp|eur|aud|myr|inr";
const CURRENCY = new RegExp(`^(s\\$|us\\$|hk\\$|a\\$|rm|£|€|₹|\\$|${CODES})|(${CODES})$`, "gi");
const UNITS: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, mil: 1e6, mio: 1e6, million: 1e6, bn: 1e9, billion: 1e9 };

/** The text with spaces, apostrophes and a currency sign taken off. */
function bare(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\s  '’_]/g, "")
    .replace(/(ordinary)?shares?$/i, "")
    .replace(CURRENCY, "")
    .replace(CURRENCY, "");
}

/** "50.000": one dot, three digits after it and no other separator. */
function ambiguous(s: string): boolean {
  return /^\d{1,3}\.\d{3}$/.test(s);
}

/** The amount as a number; NaN when it cannot be read with certainty. */
export function parseAmount(raw: unknown): number {
  let s = bare(raw);
  if (!s) return NaN;
  let times = 1;
  const unit = /^([\d.,]+)(k|thousand|m|mn|mil|mio|million|bn|billion)$/i.exec(s);
  if (unit) {
    s = unit[1];
    times = UNITS[unit[2].toLowerCase()];
  }
  let n = NaN;
  if (/^\d+$/.test(s)) n = Number(s);
  /* 1,000,000 · 50,000 · 1,000,000.50 */
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) n = Number(s.replace(/,/g, ""));
  /* 1,00,000 · 12,50,000.50 (lakh and crore) */
  else if (/^\d{1,2}(,\d{2})+,\d{3}(\.\d{1,2})?$/.test(s)) n = Number(s.replace(/,/g, ""));
  /* 1.000.000 · 1.000.000,50 · 50.000,00 */
  else if (/^\d{1,3}(\.\d{3}){2,}(,\d{1,2})?$/.test(s) || /^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) n = Number(s.replace(/\./g, "").replace(",", "."));
  /* 1000.50 · 1.5 (with a unit: 1.5m) */
  else if (/^\d+\.\d{1,2}$/.test(s)) n = Number(s);
  /* 1000,50 · 1,5 (with a unit: 1,5m) */
  else if (/^\d+,\d{1,2}$/.test(s)) n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return Math.round(n * times * 100) / 100;
}

/** 1000000 → "1,000,000"; 1000.5 → "1,000.50". */
export function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}

/** Why an amount cannot be accepted, or null when it can. */
export function amountProblem(raw: unknown): string | null {
  const s = bare(raw);
  if (!s) return null;
  if (Number.isFinite(parseAmount(raw))) return null;
  if (ambiguous(s)) {
    const [a, b] = s.split(".");
    return `Is that ${a},${b}? Please write it as ${a},${b} or ${a}${b}.`;
  }
  return "An amount in figures, please (e.g. 50,000 or 1.5m).";
}

/** The amounts added up; NaN if any one cannot be read. */
export function sumAmounts(raws: unknown[]): number {
  let total = 0;
  for (const r of raws) {
    const n = parseAmount(r);
    if (!Number.isFinite(n)) return NaN;
    total += n;
  }
  return raws.length ? Math.round(total * 100) / 100 : NaN;
}
