/**
 * House style for the things a term sheet says in numbers: dates, periods,
 * money. From the playbook's §4 — dates as "24 September 2026", periods as
 * "thirty (30) days", money as "USD 2,000,000". Pure functions.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** A calendar date with no time zone attached: the date the letter bears. */
export interface PlainDate {
  y: number;
  m: number; // 1–12
  d: number;
}

export function parseDate(iso: string): PlainDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

export function toIso(p: PlainDate): string {
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** "24 September 2026" — day month year, no ordinals. */
export function formatDate(p: PlainDate): string {
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

/** Today, in Singapore — where the firm is, and the date a letter drafted at
 *  11 pm there should bear. */
export function todaySingapore(now = new Date()): PlainDate {
  const t = new Date(now.getTime() + 8 * 3600 * 1000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** An ISO 8601 duration of whole days or months: P14D, P3M. */
export function parsePeriod(p: string): { n: number; unit: "D" | "M" } | null {
  const m = /^P(\d+)([DM])$/.exec(p ?? "");
  return m ? { n: Number(m[1]), unit: m[2] as "D" | "M" } : null;
}

/** date + period, or the picked date itself when `p` is a date. */
export function addPeriod(base: PlainDate, p: string): PlainDate | null {
  const picked = parseDate(p);
  if (picked) return picked;
  const per = parsePeriod(p);
  if (!per) return null;
  if (per.unit === "D") {
    const t = new Date(Date.UTC(base.y, base.m - 1, base.d + per.n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  const total = base.m - 1 + per.n;
  const y = base.y + Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(base.d, daysInMonth(y, m)) };
}

export function compareDates(a: PlainDate, b: PlainDate): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${numberWords(n % 100)}` : ""}`;
  return String(n);
}

/** "thirty (30) days", "three (3) months". A picked date comes back formatted. */
export function periodWords(p: string): string {
  const picked = parseDate(p);
  if (picked) return formatDate(picked);
  const per = parsePeriod(p);
  if (!per) return p;
  const unit = per.unit === "D" ? "day" : "month";
  return `${numberWords(per.n)} (${per.n}) ${unit}${per.n === 1 ? "" : "s"}`;
}

/* ── money ─────────────────────────────────────────────────────────────── */

const SYMBOLS: Record<string, string> = {
  "US$": "USD", "S$": "SGD", "A$": "AUD", "HK$": "HKD", "NZ$": "NZD", "C$": "CAD", "RM": "MYR",
  "£": "GBP", "€": "EUR", "¥": "JPY", "₹": "INR", "₫": "VND", "Rp": "IDR", "฿": "THB", "₱": "PHP",
};

/**
 * "US$2m" → "USD 2,000,000"; "SGD 500k" → "SGD 500,000"; "1.25 million euros"
 * is left alone. Returns null when the currency cannot be told — "$2m" is
 * ambiguous and the playbook says to ask, not guess.
 */
export function normaliseMoney(raw: string): { text: string; currency: string; amount: number } | null {
  const s = raw.trim();
  let currency = "";
  let rest = s;
  const iso = /^([A-Z]{3})\s*(.+)$/.exec(s);
  if (iso) {
    currency = iso[1];
    rest = iso[2];
  } else {
    for (const [sym, code] of Object.entries(SYMBOLS).sort((a, b) => b[0].length - a[0].length)) {
      if (s.startsWith(sym)) {
        currency = code;
        rest = s.slice(sym.length);
        break;
      }
    }
    if (!currency) {
      const tail = /^(.+?)\s*([A-Z]{3})$/.exec(s);
      if (tail) {
        currency = tail[2];
        rest = tail[1];
      }
    }
  }
  if (!currency) return null;
  const m = /^\s*([\d,]+(?:\.\d+)?)\s*(k|m|mn|million|bn|billion)?\s*$/i.exec(rest);
  if (!m) return null;
  let amount = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const mult = (m[2] ?? "").toLowerCase();
  if (mult === "k") amount *= 1_000;
  else if (mult === "m" || mult === "mn" || mult === "million") amount *= 1_000_000;
  else if (mult === "bn" || mult === "billion") amount *= 1_000_000_000;
  const text = `${currency} ${amount.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
  return { text, currency, amount };
}

/** The currency codes named in a run of text, for the one-currency check. */
export function currenciesIn(text: string): string[] {
  const out = new Set<string>();
  let rest = text;
  for (const m of rest.matchAll(/\b([A-Z]{3})\s?[\d,]/g)) out.add(m[1]);
  /* Longest symbol first, and each one removed once seen, so "US$" is not
     also read as "S$". */
  for (const [sym, code] of Object.entries(SYMBOLS).sort((a, b) => b[0].length - a[0].length)) {
    if (rest.includes(sym)) {
      out.add(code);
      rest = rest.split(sym).join(" ");
    }
  }
  return Array.from(out);
}

/* ── lists ─────────────────────────────────────────────────────────────── */

/** "a, b and c" — Oxford comma off, as the map says. */
export function joinAnd(items: string[]): string {
  const xs = items.filter(Boolean);
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** "(a) …; (b) …; and (c) …" */
export function letteredList(items: string[]): string {
  const xs = items.filter(Boolean);
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  const letter = (i: number) => `(${String.fromCharCode(97 + i)})`;
  return xs.map((x, i) => `${letter(i)} ${x}`).slice(0, -1).join("; ") + `; and ${letter(xs.length - 1)} ${xs[xs.length - 1]}`;
}

export function withArticle(s: string): string {
  const t = s.trim();
  if (!t) return t;
  if (/^(a|an|the)\s/i.test(t)) return t;
  return (/^[aeiou]/i.test(t) ? "an " : "a ") + t;
}

export function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/\b([a-z])/g, (c) => c.toUpperCase());
}
