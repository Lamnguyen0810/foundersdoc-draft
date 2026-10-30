/**
 * ESOP dashboard: the shapes the page works with and the vesting arithmetic.
 *
 * Pure functions only (no database, no React), so the page, the CSV export and
 * any later report agree on one answer. Tables: supabase/105_esop_dashboard.sql.
 *
 * THE RULE. A batch has a vesting start date and N yearly tranches (4 unless
 * set). Tranche t vests on start + t years. A holder vests `options_per_tranche`
 * for every tranche whose date has passed: up to today for an active holder,
 * up to their last day for a leaver. A Bad leaver keeps nothing; an Unvested
 * leaver left before the first tranche, so there was nothing to keep.
 */

export interface EsopCompany {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  plan: "free" | "premium";
}

export interface EsopBatch {
  batch: number;
  vesting_start: string | null; // yyyy-mm-dd
  tranches: number;
  note: string | null;
}

export type HolderStatus = "Active" | "Leaver";
export type LeaverType = "Good" | "Bad" | "Unvested";

export interface EsopHolder {
  id: string;
  name: string;
  email: string | null;
  id_no: string | null;
  batch: number;
  options_per_tranche: number;
  status: HolderStatus;
  leaver_type: LeaverType | null;
  last_day: string | null;
  notes: string | null;
  nationality?: string | null;
  grant_date?: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type DocKind = "letter_of_grant" | "certificate";

export interface EsopDocument {
  id: string;
  holder_id: string;
  kind: DocKind;
  tranche: number | null;
  path: string | null; // an uploaded file in the private bucket, or
  url?: string | null; // a link (a certificate made by Zapier, 106)
  file_name: string;
  uploaded_at: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-04" → a local date at midnight. Null for anything else. */
export function parseDay(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "4 Nov 2026", or an en dash when there is no date. */
export function fmtDay(s: string | null | undefined): string {
  const d = parseDay(s);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "–";
}

export function addYears(s: string, years: number): string {
  const d = parseDay(s)!;
  const target = new Date(d.getFullYear() + years, d.getMonth(), d.getDate());
  // 29 Feb + 1 year rolls into March in JS; keep it on 28 Feb instead.
  if (target.getMonth() !== d.getMonth()) target.setDate(0);
  return isoDay(target);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function today(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

export interface HolderCalc {
  start: string | null;
  tranches: number;
  total: number; // granted over all tranches
  vestedTranches: number;
  vested: number;
  kept: number; // what a leaver keeps (0 for Bad)
  next: string | null; // next vesting date, active holders only
  daysToNext: number | null;
}

export function calcHolder(h: EsopHolder, batches: Map<number, EsopBatch>, now: Date = today()): HolderCalc {
  const b = batches.get(h.batch);
  const start = b?.vesting_start ?? null;
  const tranches = b?.tranches ?? 4;
  const per = Math.max(0, h.options_per_tranche || 0);
  const total = per * tranches;
  const cut = h.status === "Leaver" ? parseDay(h.last_day) ?? now : now;
  let vestedTranches = 0;
  if (start) {
    for (let t = 1; t <= tranches; t++) {
      if (parseDay(addYears(start, t))! <= cut) vestedTranches++;
    }
  }
  const vested = vestedTranches * per;
  const kept = h.status === "Leaver" && h.leaver_type === "Bad" ? 0 : vested;
  const next = h.status === "Active" && start && vestedTranches < tranches ? addYears(start, vestedTranches + 1) : null;
  return { start, tranches, total, vestedTranches, vested, kept, next, daysToNext: next ? daysBetween(now, parseDay(next)!) : null };
}

export interface ScheduleRow {
  date: string;
  batch: number;
  tranche: number;
  certificates: number; // active holders in the batch
  leavers: number;
  daysLeft: number;
}

export function schedule(holders: EsopHolder[], batches: EsopBatch[], now: Date = today()): ScheduleRow[] {
  const out: ScheduleRow[] = [];
  for (const b of batches) {
    if (!b.vesting_start) continue;
    const active = holders.filter((h) => h.status === "Active" && h.batch === b.batch).length;
    const leavers = holders.filter((h) => h.status === "Leaver" && h.batch === b.batch).length;
    for (let t = 1; t <= b.tranches; t++) {
      const date = addYears(b.vesting_start, t);
      out.push({ date, batch: b.batch, tranche: t, certificates: active, leavers, daysLeft: daysBetween(now, parseDay(date)!) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.batch - b.batch);
}

export function num(v: number | null | undefined): string {
  return v || v === 0 ? v.toLocaleString("en-GB") : "–";
}

/* ── CSV ──────────────────────────────────────────────────────────────────── */

const CSV_HEAD = ["Name", "Email", "ID no.", "Batch", "Status", "Leaver type", "Last day", "Options per tranche", "Total options", "Vested", "Kept", "Next vesting", "Notes"];

function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  // A leading = + - @ would run as a formula when the file is opened in Excel.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(holders: EsopHolder[], batches: EsopBatch[]): string {
  const map = new Map(batches.map((b) => [b.batch, b]));
  const lines = [CSV_HEAD.join(",")];
  for (const h of holders) {
    const c = calcHolder(h, map);
    lines.push(
      [h.name, h.email, h.id_no, h.batch, h.status, h.leaver_type, h.last_day, h.options_per_tranche, c.total, c.vested, c.kept, c.next, h.notes]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** Minimal CSV reader: quotes, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface ImportedHolder {
  name: string;
  email: string | null;
  id_no: string | null;
  batch: number;
  options_per_tranche: number;
  status: HolderStatus;
  leaver_type: LeaverType | null;
  last_day: string | null;
}

/**
 * Rows from a CSV with a header line. Accepts the Google Sheet's column names
 * (Name, Email, Batch, Status, Leaver type, ID no., Options per tranche) and
 * the export's (Last day). Unknown columns are ignored. Returns the rows that
 * could be read and, for the rest, why not.
 */
export function readHolderCsv(text: string): { rows: ImportedHolder[]; problems: string[] } {
  const grid = parseCsv(text);
  const problems: string[] = [];
  if (grid.length < 2) return { rows: [], problems: ["The file has no rows under the header."] };
  const head = grid[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iName = col("name", "holder");
  const iEmail = col("email");
  const iId = col("idno", "id");
  const iBatch = col("batch");
  const iStatus = col("status");
  const iType = col("leavertype");
  const iLast = col("lastday", "leftdate");
  const iPer = col("optionspertranche", "optionstranche", "options");
  if (iName < 0 || iBatch < 0) return { rows: [], problems: ['The header must have at least "Name" and "Batch".'] };

  const rows: ImportedHolder[] = [];
  grid.slice(1).forEach((r, k) => {
    const line = k + 2;
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const name = get(iName);
    const batch = Number.parseInt(get(iBatch), 10);
    if (!name) return problems.push(`Row ${line}: no name.`);
    if (!Number.isFinite(batch)) return problems.push(`Row ${line} (${name}): batch is not a number.`);
    const statusRaw = get(iStatus).toLowerCase();
    const status: HolderStatus = statusRaw.startsWith("leav") ? "Leaver" : "Active";
    const typeRaw = get(iType).toLowerCase();
    const leaver_type: LeaverType | null =
      status === "Leaver" ? (typeRaw.startsWith("bad") ? "Bad" : typeRaw.startsWith("unv") ? "Unvested" : "Good") : null;
    const last = get(iLast);
    const last_day = /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : null;
    const per = Number.parseInt(get(iPer).replace(/[^0-9]/g, ""), 10);
    rows.push({
      name: name.slice(0, 160),
      email: get(iEmail).toLowerCase() || null,
      id_no: get(iId) || null,
      batch,
      options_per_tranche: Number.isFinite(per) ? per : 0,
      status,
      leaver_type,
      last_day,
    });
  });
  return { rows, problems };
}

/**
 * A date typed into a cell: "2024-07-12", "12 Jul 2024", "12/7/2024"
 * (day first, as in Singapore). Returns yyyy-mm-dd, "" for an empty cell, or
 * null when it cannot be read.
 */
export function readTypedDay(raw: string): string | null {
  const s = raw.trim();
  if (!s || s === "–") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseDay(s) ? s : null;
  let m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return d.getDate() === Number(m[1]) ? isoDay(d) : null;
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS.findIndex((x) => x.toLowerCase() === m![2].slice(0, 3).toLowerCase());
    if (mon < 0) return null;
    const d = new Date(Number(m[3]), mon, Number(m[1]));
    return d.getDate() === Number(m[1]) ? isoDay(d) : null;
  }
  return null;
}

/** An approval of one vesting (supabase/107), for the Vesting schedule tab. */
export interface EsopRun {
  ref: string;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  payment_link: string | null;
}
