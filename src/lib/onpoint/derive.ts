import type { Cell, Sheet } from "./xlsx";
import { addMonths, daysBetween, isIso } from "./dates";
import type { DeadlineStatus, ReminderType } from "./types";

/**
 * OnPoint's sheets → clients and deadlines (0267). Pure, so the rules can be read and tested in one place.
 *
 * MASTER LIST ("Pte Ltd": Company Name, UEN, FYE, Acc, FS/Tax, Sec, Date of FS, AGM Date, AR Date, ECI…, Tax Comp)
 *   The dates in the sheet are when the work was DONE (the 2025 list is mostly filled in, the 2026 list mostly
 *   empty). So each due date is worked out from the FYE, by the usual Singapore rules, and a date in the sheet
 *   marks that item done:
 *     ECI   FYE + 3 months                 if FS/Tax is x   done: the ECI "Date"
 *     FS    FYE + 6 months (for the AGM)   if Acc or FS/Tax done: "Date of FS"; "Exempted" = not applicable
 *     AGM   FYE + 6 months                 if Sec is x      done: "AGM Date"
 *     AR    FYE + 7 months                 if Sec is x      done: "AR Date"
 *   Words instead of a date: "Managed by client" / "Managed by Acconate" = not applicable (not OnPoint's work),
 *   "Waiver" (Tax Comp) = ECI waived, "To strike off" = cancelled.
 * NOMINEE SERVICE (any sheet with "Date expire"): each row's expiry is a Corp-Sec expiry deadline (secretary,
 *   nominee director / shareholder, registered address, QBO). Only a client's latest expiry per sheet is live;
 *   an expiry more than 180 days past is treated as an old record, not a live deadline.
 * JOB SCHEDULE: Accounts (Last Completed + its Frequency), Payroll (Last filed + 1 month), GST ("Next Due").
 * CONTACTS (any sheet with an email column next to a company / client name): the reminder's recipient. The
 *   master sheets have no email addresses, and none is ever made up.
 */

export interface ClientRow {
  key: string;
  name: string;
  uen?: string | null;
  fye?: string | null;
  services?: string[];
}
export interface DeadlineRow {
  client_key: string;
  type: ReminderType;
  label: string | null;
  due_date: string;
  source: string;
  source_key: string;
  derived: boolean;
  status: DeadlineStatus;
  done_on: string | null;
}
export interface ContactRow {
  client_key: string;
  name: string;
  contact_name: string | null;
  contact_email: string;
}
export interface Derived {
  kinds: string[];
  clients: ClientRow[];
  deadlines: DeadlineRow[];
  contacts: ContactRow[];
  skipped: string[];
}

/** One key per company across all sheets: "Abc Pte. Ltd." = "ABC PTE LTD" = "Abc Private Limited" */
export function clientKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bprivate\s+limited\b/g, "pte ltd")
    .replace(/\bpte\.?\s*ltd\.?/g, "pte ltd")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const s = (c: Cell | undefined) => (c == null ? "" : String(c).trim());
const lc = (c: Cell | undefined) => s(c).toLowerCase();
const isX = (c: Cell | undefined) => lc(c) === "x" || c === true;
const dateOf = (c: Cell | undefined) => (isIso(c) ? c : null);
const EMAIL = /[^\s@<>,;()"']+@[^\s@<>,;()"']+\.[a-z]{2,}/i;

/** the header row (within the first 6) that has all of `need`, by lower-case name */
function headerIn(rows: Cell[][], need: RegExp[]): { at: number; cols: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const cols = (rows[i] ?? []).map(lc);
    if (need.every((re) => cols.some((c) => re.test(c)))) return { at: i, cols };
  }
  return null;
}
const col = (cols: string[], re: RegExp) => cols.findIndex((c) => re.test(c));

/** words in a date cell: what they mean for that item */
function wordStatus(word: string): DeadlineStatus | null {
  const w = word.toLowerCase();
  if (!w) return null;
  if (/strike\s*off|struck/.test(w)) return "cancelled";
  if (/waiv/.test(w)) return "waived";
  if (/managed by|exempt|n\.?\s*a\.?$|not applicable|dormant/.test(w)) return "not_applicable";
  return null;
}

const MONTHS: Array<[RegExp, number]> = [
  [/month/, 1],
  [/quarter/, 3],
  [/half|semi|bi-?annual/, 6],
  [/year|annual/, 12],
];
const periodOf = (freq: string) => MONTHS.find(([re]) => re.test(freq.toLowerCase()))?.[1] ?? null;

const NOMINEE_LABEL: Array<[RegExp, string]> = [
  [/^secretary/i, "Corp-sec renewal"],
  [/director/i, "Nominee director renewal"],
  [/shareholder/i, "Nominee shareholder renewal"],
  [/address/i, "Registered address renewal"],
  [/qbo|quickbooks/i, "QuickBooks subscription renewal"],
];

export function derive(fileLabel: string, sheets: Sheet[], today: string): Derived {
  const out: Derived = { kinds: [], clients: [], deadlines: [], contacts: [], skipped: [] };
  const clients = new Map<string, ClientRow>();
  const client = (name: string, more: Partial<ClientRow> = {}) => {
    const key = clientKey(name);
    if (!key) return null;
    const had = clients.get(key);
    clients.set(key, { ...(had ?? { key, name: name.replace(/\s+/g, " ").trim() }), ...Object.fromEntries(Object.entries(more).filter(([, v]) => v != null && v !== "")) });
    return key;
  };
  const add = (d: DeadlineRow) => out.deadlines.push(d);

  for (const sh of sheets) {
    const src = `${fileLabel} · ${sh.name}`;
    const rows = sh.rows;

    /* ── Master List, companies ─────────────────────────────────────────── */
    const ml = headerIn(rows, [/^company name$/, /^fye$/, /^agm date$/]);
    if (ml) {
      out.kinds.push("Master List");
      const c = ml.cols;
      const iName = col(c, /^company name$/), iUen = col(c, /^uen$/), iFye = col(c, /^fye$/);
      const iAcc = col(c, /^acc$/), iFsTax = col(c, /^fs\s*\/\s*tax$/), iSec = col(c, /^sec$/);
      const iFs = col(c, /^date of fs$/), iAgm = col(c, /^agm date$/), iAr = col(c, /^ar date$/), iEci = col(c, /^eci$/), iTax = col(c, /^tax comp$/);
      /* the ECI date sits under "ECI" in the sub-header row: Revenue · Profit · Date */
      const sub = (rows[ml.at + 1] ?? []).map(lc);
      const iEciDate = iEci >= 0 ? sub.findIndex((v, i) => i >= iEci && v === "date") : -1;
      for (let r = ml.at + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const name = s(row[iName]);
        const fye = dateOf(row[iFye]);
        if (!name || !fye) continue;
        const services = [isX(row[iAcc]) && "acc", isX(row[iFsTax]) && "fs_tax", isX(row[iSec]) && "sec"].filter(Boolean) as string[];
        const key = client(name, { uen: s(row[iUen]) || null, fye, services })!;
        const strike = [row[iFs], row[iAgm], row[iAr], row[iTax]].some((v) => wordStatus(s(v)) === "cancelled");
        const item = (type: ReminderType, months: number, done: Cell | undefined, also: DeadlineStatus | null = null) => {
          const doneOn = dateOf(done);
          const word = doneOn ? null : wordStatus(s(done));
          const status: DeadlineStatus = strike ? "cancelled" : doneOn ? "completed" : (word ?? also ?? "active");
          add({ client_key: key, type, label: null, due_date: addMonths(fye, months), source: src, source_key: `ML:${type}:${key}:${fye}`, derived: true, status, done_on: doneOn });
        };
        const managed = wordStatus(s(row[iAgm])) === "not_applicable" ? "not_applicable" : null;
        const tax = wordStatus(s(row[iTax]));
        if (services.includes("fs_tax")) item("ECI", 3, iEciDate >= 0 ? row[iEciDate] : null, tax);
        if (services.includes("fs_tax") || services.includes("acc")) item("FS", 6, row[iFs]);
        if (services.includes("sec")) {
          item("AGM", 6, row[iAgm]);
          item("AR", 7, row[iAr], managed);
        }
      }
      continue;
    }

    /* ── Nominee Service: anything with an expiry ────────────────────────── */
    const ns = headerIn(rows, [/^name$/, /^date\s*expire$/]);
    if (ns) {
      if (!out.kinds.includes("Nominee Service")) out.kinds.push("Nominee Service");
      const iName = col(ns.cols, /^name$/), iExp = col(ns.cols, /^date\s*expire$/);
      const label = NOMINEE_LABEL.find(([re]) => re.test(sh.name))?.[1] ?? `${sh.name} renewal`;
      const latest = new Map<string, string>();
      const seen: Array<{ key: string; date: string }> = [];
      for (let r = ns.at + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const name = s(row[iName]);
        const date = dateOf(row[iExp]);
        if (!name || !date || /^clients?\b/i.test(name)) continue;
        const key = client(name)!;
        seen.push({ key, date });
        if (!latest.has(key) || latest.get(key)! < date) latest.set(key, date);
      }
      for (const { key, date } of seen) {
        const old = latest.get(key) !== date || daysBetween(date, today) > 180;
        add({ client_key: key, type: "CORP_SEC_EXPIRY", label, due_date: date, source: src, source_key: `NS:${sh.name}:${key}:${date}`, derived: false, status: old ? "cancelled" : "active", done_on: null });
      }
      continue;
    }

    /* ── Job Schedule ────────────────────────────────────────────────────── */
    const js = headerIn(rows, [/^client$/]);
    if (js && js.cols.some((c) => /^(next due|last completed|last filed)$/.test(c))) {
      if (!out.kinds.includes("Job Schedule")) out.kinds.push("Job Schedule");
      const cl = js.cols;
      const iName = col(cl, /^client$/), iNext = col(cl, /^next due$/), iLast = col(cl, /^last completed$/), iFiled = col(cl, /^last filed$/);
      const iFreq = col(cl, /^frequency$/), iQ = col(cl, /^quarter ending$/);
      for (let r = js.at + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const name = s(row[iName]);
        if (!name) continue;
        let due: string | null = null;
        let label = sh.name;
        let derived = true;
        if (iNext >= 0 && dateOf(row[iNext])) {
          due = dateOf(row[iNext]);
          derived = false;
          label = `${sh.name} return${iQ >= 0 && s(row[iQ]) ? ` (quarter ending ${s(row[iQ])})` : ""}`;
        } else if (iLast >= 0 && dateOf(row[iLast])) {
          const months = periodOf(s(row[iFreq])) ?? 1;
          due = addMonths(dateOf(row[iLast])!, months);
          label = `${sh.name} (${s(row[iFreq]) || "monthly"})`;
        } else if (iFiled >= 0 && dateOf(row[iFiled])) {
          due = addMonths(dateOf(row[iFiled])!, 1);
          label = `${sh.name} (monthly)`;
        }
        if (!due) continue;
        const key = client(name)!;
        add({ client_key: key, type: "RECURRING_JOB", label, due_date: due, source: src, source_key: `JS:${sh.name}:${key}`, derived, status: "active", done_on: null });
      }
      continue;
    }

    /* ── Contacts: an email column next to a company / client name ──────── */
    const ct = headerIn(rows, [/e-?mail/, /company|client|^name$|entity/]);
    if (ct) {
      if (!out.kinds.includes("Contacts")) out.kinds.push("Contacts");
      const iMail = col(ct.cols, /e-?mail/);
      const iName = col(ct.cols, /company|client|entity/) >= 0 ? col(ct.cols, /company|client|entity/) : col(ct.cols, /^name$/);
      const iPerson = col(ct.cols, /contact|attention|person|director|^to$/);
      for (let r = ct.at + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const name = s(row[iName]);
        const email = EMAIL.exec(s(row[iMail]))?.[0]?.toLowerCase();
        if (!name || !email) continue;
        const key = client(name)!;
        out.contacts.push({ client_key: key, name, contact_name: iPerson >= 0 && iPerson !== iMail ? s(row[iPerson]) || null : null, contact_email: email });
      }
      continue;
    }

    out.skipped.push(sh.name);
  }
  out.clients = [...clients.values()];
  /* one row per source key (a company listed twice in a sheet): the later row wins, as it would on re-import */
  out.deadlines = [...new Map(out.deadlines.map((d) => [d.source_key, d])).values()];
  out.contacts = [...new Map(out.contacts.map((c) => [c.client_key, c])).values()];
  return out;
}
