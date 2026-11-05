import { addYears, calcHolder, fmtDay, parseDay, type EsopBatch, type EsopDocument, type EsopHolder, type HolderCalc } from "@/lib/esop/vesting";

/**
 * The ESOP dashboard's figures, worked out from what is stored (Rachel's
 * design, overview v23). Pure code: the page and the tests use the same.
 *
 * Vested options come from the batch schedule (lib/esop/vesting.ts), so the
 * register can never be "behind schedule" here; that filter stays, with 0.
 */

export interface Tranche {
  n: number;
  date: string;
  state: "vested" | "next" | "upcoming";
  cert: EsopDocument | null;
  /** "✓ Certificate" / "No certificate" / "Vested" / "Next" / "Upcoming" */
  text: string;
  tone: "ok" | "warn" | "muted";
}

export interface Grant {
  top: boolean;
  title: string;
  /** "From 1 Mar 2023 · 4 tranches" */
  sub: string;
  known: boolean;
  start: string | null;
  per: number;
  tranches: Tranche[];
  done: number;
  next: string | null;
  letters: EsopDocument[];
  certs: EsopDocument[];
  /** latest vested tranche without its certificate (active, from tranche 2) */
  certDue: number | null;
}

export interface Row {
  h: EsopHolder;
  c: HolderCalc;
  active: boolean;
  grants: Grant[];
  multi: boolean;
  topMissing: boolean;
  letters: EsopDocument[];
  certs: EsopDocument[];
  files: number;
  noLetter: boolean;
  certMissing: boolean;
  soon: boolean;
  behind: boolean;
  pct: number;
  granted: number;
  vested: number;
  since: string;
  initials: string;
  /** the full name on the documents (legal_name, else name), as in Rachel's design */
  display: string;
  /** the short name the company uses (name), shown as "Known as" when it differs */
  known: string | null;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const initialsOf = (name: string) =>
  name
    .replace(/[^\p{L}\s-]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

function grantOf(top: boolean, start: string | null, count: number, per: number, active: boolean, cut: Date, now: Date, letters: EsopDocument[], certs: EsopDocument[], title: string): Grant {
  const known = !!start;
  const dates = known ? Array.from({ length: count }, (_, i) => addYears(start!, i + 1)) : [];
  const done = dates.filter((d) => parseDay(d)! <= cut).length;
  const tranches: Tranche[] = dates.map((d, i) => {
    const n = i + 1;
    const cert = certs.find((x) => x.tranche === n) ?? null;
    if (!active) return { n, date: d, state: "upcoming", cert, text: cert ? "✓ Certificate" : "", tone: "ok" };
    const isVested = parseDay(d)! <= now;
    const isNext = !isVested && (i === 0 || parseDay(dates[i - 1])! <= now);
    return {
      n,
      date: d,
      state: isVested ? "vested" : isNext ? "next" : "upcoming",
      cert,
      text: cert ? "✓ Certificate" : isVested ? (i === 0 ? "Vested" : "No certificate") : isNext ? "Next" : "Upcoming",
      tone: cert ? "ok" : isVested && i > 0 ? "warn" : "muted",
    };
  });
  const next = dates.find((d) => parseDay(d)! > now) ?? null;
  const certDue = active && known && done >= 2 && !certs.some((x) => x.tranche === done) ? done : null;
  return {
    top,
    title,
    sub: known ? `From ${fmtDay(start)} · ${count} tranches` : top ? "Start date and schedule not recorded" : "No vesting dates recorded",
    known,
    start,
    per,
    tranches,
    done,
    next,
    letters,
    certs,
    certDue,
  };
}

function names(h: EsopHolder) {
  const legal = h.legal_name?.trim() || "";
  const other = !!legal && legal.toLowerCase() !== h.name.trim().toLowerCase();
  const display = other ? legal : h.name.trim();
  return { display, known: other ? h.name.trim() : null, initials: initialsOf(display) };
}

export function buildRows(holders: EsopHolder[], docs: EsopDocument[], batches: Map<number, EsopBatch>, now: Date): Row[] {
  return holders.map((h) => {
    const c = calcHolder(h, batches, now);
    const active = h.status === "Active";
    const mine = docs.filter((d) => d.holder_id === h.id);
    const letters = mine.filter((d) => d.kind === "letter_of_grant");
    const certs = mine.filter((d) => d.kind === "certificate");
    const cut = active ? now : (parseDay(h.last_day) ?? now);
    const isTop = (d: EsopDocument) => d.label === "Top-up";
    const hasTop = (h.top_ups ?? 0) > 0 || letters.some(isTop) || !!h.topup_start;
    const amended = letters.some((d) => d.label === "Amended");
    const grants = [
      grantOf(false, c.start, c.tranches, h.options_per_tranche, active, cut, now, letters.filter((d) => !isTop(d)), certs.filter((d) => !isTop(d)), amended ? "Original grant (amended)" : "Original grant"),
    ];
    if (hasTop) grants.push(grantOf(true, h.topup_start ?? null, c.tranches, h.topup_options_per_tranche ?? 0, active, cut, now, letters.filter(isTop), certs.filter(isTop), "Top-up grant"));
    const multi = grants.length > 1;
    const topMissing = multi && grants.some((g) => !g.known);
    const startDay = parseDay(h.grant_date ?? c.start);
    const granted = c.total;
    const vested = active ? c.vested : c.kept;
    const certMissing = active && grants[0].certDue !== null;
    return {
      h,
      c,
      active,
      grants,
      multi,
      topMissing,
      letters,
      certs,
      files: letters.length + certs.length,
      noLetter: letters.length === 0,
      certMissing,
      soon: active && c.daysToNext !== null && c.daysToNext <= 30,
      behind: false,
      pct: granted ? Math.round((c.vested / granted) * 100) : 0,
      granted,
      vested,
      since: startDay ? `${MON[startDay.getMonth()]} ${startDay.getFullYear()}` : "no start date",
      ...names(h),
    };
  });
}

/** "Mikaela, Rizqi, Tan Shi Tong" (each person's short name); "+ 2 more" after three. */
export function shortNames(names: string[]): string {
  const first = names.map((n) => n.trim()).filter(Boolean);
  return first.length > 3 ? `${first.slice(0, 3).join(", ")} + ${first.length - 3} more` : first.join(", ");
}

/** "Brandon, Raymond and Taras" style list with "and". */
export function andList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export const nf = (n: number) => Math.round(n || 0).toLocaleString("en-GB");
export const fileSize = (b: number | null | undefined) => (!b ? "" : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
