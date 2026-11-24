import { countdown, daysBetween, fmtDate, isIso } from "./dates";
import { clientKey } from "./derive";
import { emailHtml } from "./templates";
import { serialToIso, type Cell, type Sheet } from "./xlsx";

/**
 * Payment reminders (0280): OnPoint's unpaid invoices and the emails that chase them. Pure, so the page
 * previews with exactly what the server sends, and the invoice-list reader can be tested.
 *
 * Invoices come from an invoice list (Excel or CSV, e.g. Xero's invoice export or any sheet with a client,
 * an amount and a due date) or are added by hand. Each reminder is sent with a button for now; automatic
 * reminders before and after the due date come later.
 */

export type InvoiceStatus = "open" | "paid" | "cancelled";
export interface Invoice {
  id: string;
  client_id: string;
  number: string | null;
  description: string | null;
  amount_cents: number;
  currency: string;
  issue_date: string | null;
  due_date: string;
  status: InvoiceStatus;
  paid_on: string | null;
  source: string;
}

export const PAY_TOKENS = ["{contact}", "{company}", "{invoice_no}", "{amount}", "{description}", "{due_date}", "{countdown}", "{days_left}"] as const;

export const DEFAULT_PAY = {
  subject: "Payment reminder: invoice {invoice_no} for {company}, {amount} due {due_date}",
  body:
    "Hi {contact},\n\nThis is a friendly reminder that our invoice {invoice_no} for {company}, for {amount}, is due on {due_date} ({countdown}).\n\nIf payment has already been made, please disregard this email, and thank you. If you have any questions about this invoice, simply reply to this email.\n\nBest regards,\nOnPoint Consulting",
};

/** "S$1,234.50" for Singapore dollars, "USD 1,234.50" otherwise */
export function money(cents: number, currency = "SGD"): string {
  const cur = (currency || "SGD").toUpperCase();
  const n = (cents / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur === "SGD" ? `S$${n}` : `${cur} ${n}`;
}

export function unknownPayTokens(text: string): string[] {
  const all = text.match(/\{[^{}\s]{0,40}\}/g) ?? [];
  return [...new Set(all.filter((t) => !(PAY_TOKENS as readonly string[]).includes(t)))];
}

export interface PayInput {
  company: string;
  contact: string | null;
  number: string | null;
  description: string | null;
  amount_cents: number;
  currency: string;
  due: string;
  today: string;
}

/**
 * Fill in the payment template. Nothing is made up: with no invoice number, "{invoice_no}" is left out
 * ("our invoice for …"); with no description, its paragraph is left out; no contact name greets "there".
 */
export function renderPayment(tpl: { subject: string; body: string }, v: PayInput) {
  const n = daysBetween(v.today, v.due);
  const num = v.number?.trim() || "";
  const desc = v.description?.trim() || "";
  const map: Record<string, string> = {
    "{contact}": v.contact?.trim() || "there",
    "{company}": v.company,
    "{invoice_no}": num,
    "{amount}": money(v.amount_cents, v.currency),
    "{description}": desc,
    "{due_date}": fmtDate(v.due),
    "{countdown}": countdown(v.due, v.today),
    "{days_left}": n >= 0 ? String(n) : `${-n} days overdue`,
  };
  /* past the due date, "is due on" reads "was due on" */
  const fill = (s: string) =>
    (num ? s : s.replace(/\s*\{invoice_no\}/g, ""))
      .replace(/\bis due on \{due_date\}/g, n < 0 ? "was due on {due_date}" : "is due on {due_date}")
      .replace(/\{[a-z_]+\}/g, (t) => map[t] ?? t);
  const both = tpl.subject + tpl.body;
  const notes: string[] = [];
  if (both.includes("{invoice_no}") && !num) notes.push("No invoice number, so it is left out of this email.");
  if (both.includes("{contact}") && !v.contact?.trim()) notes.push("No contact name on file, so the greeting reads “Hi there”.");
  const body = fill(tpl.body)
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .join("\n\n");
  return { subject: fill(tpl.subject).replace(/\s+/g, " ").replace(/\s+,/g, ",").trim(), body, unknown: unknownPayTokens(both), notes, overdue: n < 0 };
}

/** The designed payment email: same look as the filing reminders, with the invoice in the card */
export function paymentHtml(body: string, o: { logoUrl: string; sender: string; brandName?: string; company: string; number: string | null; description: string | null; amount_cents: number; currency: string; due: string; today: string; banner?: string }) {
  const amount = money(o.amount_cents, o.currency);
  const rows: Array<[string, string]> = [["Company", o.company]];
  if (o.number?.trim()) rows.push(["Invoice", o.number.trim()]);
  if (o.description?.trim()) rows.push(["For", o.description.trim()]);
  rows.push(["Amount", amount]);
  const late = daysBetween(o.today, o.due) < 0;
  return emailHtml(body, {
    logoUrl: o.logoUrl,
    sender: o.sender,
    brandName: o.brandName,
    banner: o.banner,
    deadline: { type: "Payment", company: o.company, uen: null, due: o.due, today: o.today },
    kicker: late ? "Payment overdue" : "Payment reminder",
    headline: `${amount} ${late ? "was due" : "due"} ${fmtDate(o.due)}`,
    rows,
    footer: "Payment reminders by OnPoint Workflows · powered by FD AI",
  });
}

/* ── reading an invoice list (Excel or CSV) ───────────────────────────────── */

export interface InvoiceRow {
  client: string;
  client_key: string;
  email: string | null;
  contact: string | null;
  number: string | null;
  description: string | null;
  amount_cents: number;
  currency: string;
  issue_date: string | null;
  due_date: string;
  source_key: string;
}
export interface InvoiceList {
  invoices: InvoiceRow[];
  /** invoices the file shows as paid (or nothing left to pay): marked paid if we have them */
  paid: string[];
  skipped: string[];
  sheet: string | null;
}

const norm = (c: Cell | undefined) => String(c ?? "").toLowerCase().replace(/[^a-z0-9#]/g, "");
const txt = (c: Cell | undefined) => (c == null ? "" : String(c).trim());
const EMAIL = /[^\s@<>,;()"']+@[^\s@<>,;()"']+\.[a-z]{2,}/i;

const H = {
  client: /^(contactname|customer|customername|client|clientname|company|companyname|name|billto|debtor|contact)$/,
  number: /^(invoicenumber|invoiceno|invoice#|invoice|invno|inv#|invoicenum|documentno|docno)$/,
  due: /^(duedate|due|datedue|paymentdue|paymentduedate|duedateofpayment)$/,
  owing: /^(amountdue|invoiceamountdue|balance|balancedue|outstanding|amountoutstanding|dueamount|amountowing|owing|unpaid)$/,
  total: /^(total|invoicetotal|amount|totalamount|grandtotal|fee|fees|amountsgd|totalsgd|totalinclgst|totalincgst)$/,
  line: /^(lineamount|linetotal)$/,
  paid: /^(invoiceamountpaid|amountpaid|paid|paidamount)$/,
  issue: /^(invoicedate|date|issuedate|dateissued|billed|lastbilled)$/,
  email: /^(emailaddress|email|contactemail|clientemail|customeremail)$/,
  person: /^(contactperson|attention|attn|contactname2)$/,
  desc: /^(description|reference|item|service|details|particulars)$/,
  status: /^(status|invoicestatus)$/,
  currency: /^(currency|currencycode)$/,
};
type Key = keyof typeof H;

/** "S$1,234.50" / "(100)" / 1234.5 → cents; null if not a positive amount */
export function centsOf(c: Cell | undefined): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? Math.round(c * 100) : null;
  const s = txt(c);
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  const m = s.replace(/[,\s]/g, "").match(/\d+(\.\d+)?/);
  if (!m) return null;
  const v = Math.round(parseFloat(m[0]) * 100);
  return neg ? -v : v;
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const ok = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
/** a date cell: already "YYYY-MM-DD", an Excel day number, "31/12/2026" (day first, as in Singapore), "31 Dec 2026" */
export function dateOfCell(c: Cell | undefined): string | null {
  if (isIso(c)) return c;
  if (typeof c === "number") return c > 20000 && c < 80000 ? serialToIso(c) : null;
  const s = txt(c);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return ok(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]+([a-z]{3,9})[\s,-]+(\d{4})$/i);
  if (m && MON[m[2].slice(0, 3).toLowerCase()]) return ok(+m[3], MON[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m && MON[m[1].slice(0, 3).toLowerCase()]) return ok(+m[3], MON[m[1].slice(0, 3).toLowerCase()], +m[2]);
  return null;
}

/** the header row (within the first 10) with a client, a due date and an amount column */
function header(rows: Cell[][]): { at: number; col: Partial<Record<Key, number>> } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cols = (rows[i] ?? []).map(norm);
    const col: Partial<Record<Key, number>> = {};
    for (const k of Object.keys(H) as Key[]) {
      const at = cols.findIndex((c, j) => H[k].test(c) && !Object.values(col).includes(j));
      if (at >= 0) col[k] = at;
    }
    if (col.client !== undefined && col.due !== undefined && (col.owing !== undefined || col.total !== undefined || col.line !== undefined)) return { at: i, col };
  }
  return null;
}

/**
 * Read an invoice list. One row per invoice, or one row per line (Xero's export repeats the invoice on each
 * line: rows with the same invoice number become one invoice). Paid, voided and draft invoices are not reminded.
 */
export function readInvoiceList(sheets: Sheet[], label: string): InvoiceList {
  const out: InvoiceList = { invoices: [], paid: [], skipped: [], sheet: null };
  for (const sh of sheets) {
    const h = header(sh.rows);
    if (!h) continue;
    out.sheet = sh.name;
    const { col } = h;
    const get = (r: Cell[], k: Key) => (col[k] === undefined ? undefined : r[col[k]!]);
    type Work = InvoiceRow & { lines: number; owingSet: boolean };
    const byNum = new Map<string, Work>();
    const order: Work[] = [];
    let rowNo = h.at + 1;
    for (const r of sh.rows.slice(h.at + 1)) {
      rowNo++;
      const client = txt(get(r, "client")).replace(/\s+/g, " ");
      if (!client) continue;
      const number = txt(get(r, "number")) || null;
      const status = txt(get(r, "status")).toLowerCase();
      const due = dateOfCell(get(r, "due"));
      const owing = centsOf(get(r, "owing"));
      const total = centsOf(get(r, "total"));
      const line = centsOf(get(r, "line"));
      const paidAmt = centsOf(get(r, "paid"));
      const key = number ? `INV:${number.toLowerCase()}` : due ? `INV:${clientKey(client)}|${due}|${owing ?? total ?? line ?? 0}` : "";
      if (/void|delet|draft|cancel/.test(status)) continue;
      if (/^paid$|fully paid/.test(status) || owing === 0 || (owing === null && total !== null && paidAmt !== null && paidAmt >= total && total > 0)) {
        if (key) out.paid.push(key);
        continue;
      }
      if (!due) {
        out.skipped.push(`Row ${rowNo} (${client}): no due date`);
        continue;
      }
      const prev = number ? byNum.get(key) : undefined;
      if (prev) {
        /* another line of the same invoice */
        if (!prev.owingSet && owing === null && total === null && line !== null) prev.amount_cents += line;
        prev.lines++;
        const d = txt(get(r, "desc"));
        if (d && prev.description && prev.lines <= 3 && !prev.description.includes(d)) prev.description = `${prev.description}; ${d}`.slice(0, 300);
        continue;
      }
      const amount = owing ?? (total !== null && paidAmt !== null ? total - paidAmt : total) ?? line;
      if (amount === null || amount <= 0) {
        out.skipped.push(`Row ${rowNo} (${client}): no amount`);
        continue;
      }
      const email = txt(get(r, "email")).match(EMAIL)?.[0]?.toLowerCase() ?? null;
      const cur = txt(get(r, "currency")).toUpperCase();
      const row = {
        client,
        client_key: clientKey(client),
        email,
        contact: txt(get(r, "person")) || null,
        number,
        description: txt(get(r, "desc")).slice(0, 300) || null,
        amount_cents: amount,
        currency: /^[A-Z]{3}$/.test(cur) ? cur : "SGD",
        issue_date: dateOfCell(get(r, "issue")),
        due_date: due,
        source_key: key,
        lines: 1,
        owingSet: owing !== null || total !== null,
      };
      if (number) byNum.set(key, row);
      order.push(row);
    }
    out.invoices = order.map(({ lines, owingSet, ...row }) => (void lines, void owingSet, row));
    break;
  }
  if (!out.sheet) out.skipped.push(`${label}: no sheet with a client, a due date and an amount column was found.`);
  return out;
}

/** a small CSV reader (quotes, commas inside quotes, CRLF) → one sheet */
export function readCsv(text: string, name = "CSV"): Sheet[] {
  const rows: Cell[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return [{ name, rows: rows.filter((r) => r.some((c) => String(c).trim())) }];
}
