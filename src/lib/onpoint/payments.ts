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

/* ── automatic payment reminders (0282) ───────────────────────────────────── */

/** the standard schedule: 7 days before, on the due date, then 3, 10 and 30 days overdue */
export const DEFAULT_BEFORE = [7, 0];
export const DEFAULT_AFTER = [3, 10, 30];

/** days before (0 = on the due date) or after the due date: whole numbers 0–365 (after: 1–365), no repeats */
export function cleanDays(v: unknown, min: number): number[] | null {
  if (!Array.isArray(v)) return null;
  const n = v.map(Number);
  if (n.some((x) => !Number.isInteger(x) || x < min || x > 365)) return null;
  return [...new Set(n)].sort((a, b) => b - a).slice(0, 12);
}

/**
 * Is an automatic reminder due today for this invoice? "b7" = 7 days before, "b0" = on the due date,
 * "a10" = 10 days overdue. Only unpaid invoices; null = nothing today.
 */
export function autoTag(v: Pick<Invoice, "status" | "due_date">, today: string, before: number[], after: number[]): { tag: string; lead: number } | null {
  if (v.status !== "open") return null;
  const n = daysBetween(today, v.due_date);
  if (n >= 0 && before.includes(n)) return { tag: `b${n}`, lead: n };
  if (n < 0 && after.includes(-n)) return { tag: `a${-n}`, lead: n };
  return null;
}

/** the next day (today or later) an automatic reminder would go for this invoice, or null if none is left */
export function nextAuto(v: Pick<Invoice, "status" | "due_date">, today: string, before: number[], after: number[]): string | null {
  if (v.status !== "open") return null;
  const days = [...before.map((b) => -b), ...after].sort((a, b) => a - b); // offsets from the due date
  const n = daysBetween(v.due_date, today); // today's offset from the due date
  const next = days.find((d) => d >= n);
  if (next === undefined) return null;
  const [y, m, d] = v.due_date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + next * 86_400_000).toISOString().slice(0, 10);
}

/* ── reading one PDF invoice (0286) ───────────────────────────────────────── */

export interface PdfDraft {
  client: string;
  client_id: string | null;
  email: string | null;
  number: string | null;
  description: string | null;
  amount_cents: number | null;
  currency: string;
  due_date: string | null;
  issue_date: string | null;
  /** what to check before adding it (nothing is added without the person's OK) */
  problems: string[];
}

/* an amount has cents or a currency sign; dates are taken out first, so a year is never read as an amount */
const MONEY = /(?:(?:S\$|SGD|USD|US\$|\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}))(?!\s*%)/g;
const DATES = /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{4}/g;
const amounts = (s: string) =>
  [...s.replace(DATES, " ").matchAll(MONEY)].map((m) => Math.round(parseFloat((m[1] ?? m[2]).replace(/,/g, "")) * 100)).filter((n) => n > 0 && n < 100_000_000_000);
const moneyIn = (s: string): number | null => {
  const all = amounts(s);
  return all.length ? all[all.length - 1] : null;
};

/** the text after a label, on the same line ("Due Date: 13 Nov 2026") or on the next line (Xero's layout) */
function after(lines: string[], labels: RegExp, pick: (s: string) => string | null): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = labels.exec(lines[i]);
    if (!m) continue;
    const rest = lines[i].slice(m.index + m[0].length).replace(/^[\s:#.\-–]+/, "");
    const same = rest ? pick(rest) : null;
    if (same) return same;
    for (let k = 1; k <= 2 && i + k < lines.length; k++) {
      const next = pick(lines[i + k]);
      if (next) return next;
    }
  }
  return null;
}

/**
 * Read an invoice's text (from a PDF made by accounting software). Rules only, no guessing service: the client is
 * matched to a client already in the app where possible; every field can be corrected before the invoice is added.
 */
export function parseInvoiceText(text: string, clients: Array<{ id: string; name: string; key: string; contact_email: string | null }>, own: { names: string[]; emails: string[] }): PdfDraft {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const problems: string[] = [];
  const out: PdfDraft = { client: "", client_id: null, email: null, number: null, description: null, amount_cents: null, currency: "SGD", due_date: null, issue_date: null, problems };
  if (lines.join("").length < 20) {
    problems.push("No readable text in this PDF (it may be a scan or a photo): type the details in.");
    return out;
  }
  const flat = lines.join("\n");
  const firstDate = (s: string) => {
    const m = s.match(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\s-]+[A-Za-z]{3,9}[\s,-]+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/);
    return m ? dateOfCell(m[0]) : null;
  };
  out.number =
    after(lines, /\b(?:tax\s+)?invoice\s*(?:no\.?|number|num|#)/i, (s) => s.match(/^([A-Z0-9][A-Z0-9\-/_.]{1,39})\b/i)?.[1] ?? null) ??
    flat.match(/\b(INV[-\s]?[A-Z0-9][A-Z0-9\-]{1,30})\b/i)?.[1]?.replace(/\s/g, "-") ??
    null;
  if (out.number && /^(date|due|to|for)$/i.test(out.number)) out.number = null;
  out.issue_date = after(lines, /\b(?:invoice\s+date|date\s+of\s+issue|issue\s+date|date\s+issued)\b/i, firstDate) ?? after(lines, /^date\b/i, firstDate);
  out.due_date = after(lines, /\b(?:due\s+date|payment\s+due|date\s+due|due\s+by|pay\s+by)\b/i, firstDate);
  if (!out.due_date && /due\s+(?:on|upon)\s+receipt|payable\s+(?:on|upon)\s+receipt/i.test(flat)) out.due_date = out.issue_date;
  if (!out.due_date) problems.push("No due date found: pick it.");
  /* "Amount due" first; otherwise the last "Total" line with an amount on it (a table's "Total" heading comes first) */
  const dueLine = /^(?:amount\s+due|balance\s+due|total\s+due|amount\s+payable|total\s+amount\s+due|balance)\b/i;
  const totalLine = /^(?:grand\s+total|total)\b/i;
  const pick = (s: string) => {
    const n = moneyIn(s);
    return n ? String(n) : null;
  };
  const lastTotal = [...lines].reverse().find((l) => totalLine.test(l) && moneyIn(l.replace(totalLine, "")));
  const amt = after(lines, dueLine, pick) ?? (lastTotal ? pick(lastTotal.replace(totalLine, "")) : null) ?? after(lines, totalLine, pick);
  out.amount_cents = amt ? Number(amt) : null;
  if (!out.amount_cents) {
    const all = amounts(flat);
    if (all.length) {
      out.amount_cents = Math.max(...all);
      problems.push("Amount guessed (largest figure on the invoice): check it.");
    } else problems.push("No amount found: type it.");
  }
  if (/\bUSD\b|US\$/.test(flat) && !/\bSGD\b|S\$/.test(flat)) out.currency = "USD";
  /* the client: one already in the app whose name is on the invoice (the longest match), not OnPoint itself */
  const ownKeys = own.names.map(clientKey).filter(Boolean);
  const textKey = ` ${clientKey(flat)} `;
  const hit = clients
    .filter((c) => c.key && c.key.length >= 4 && !ownKeys.includes(c.key) && textKey.includes(` ${c.key} `))
    .sort((a, b) => b.key.length - a.key.length)[0];
  if (hit) {
    out.client = hit.name;
    out.client_id = hit.id;
  } else {
    /* a company name on the invoice that is not OnPoint ("… Pte. Ltd.", "… LLP"), else the line under "Bill to" */
    const COMPANY = /([A-Z0-9][\w&.,'()\- ]{1,80}?\b(?:Pte\.?\s*Ltd\.?|Private\s+Limited|Limited|Ltd\.?|LLP|LLC|Inc\.?|Sdn\.?\s*Bhd\.?|Corporation|Corp\.?))/gi;
    const named = lines
      .flatMap((l) => [...l.matchAll(COMPANY)].map((m) => m[1].trim().replace(/^(?:to|bill(?:ed)?\s+to|invoice\s+to|attn:?|attention:?)\s+/i, "")))
      .filter((n) => !/invoice|date|due|attention/i.test(n) && !ownKeys.some((k) => clientKey(n).endsWith(k) || k.endsWith(clientKey(n))));
    const billTo = after(lines, /^(?:bill(?:ed)?\s+to|invoice\s+to|to|customer|client)\b/i, (s) => (s.length >= 3 && !/@|^\d|invoice|date|due|\b[A-Z]+-\d/i.test(s) ? s.slice(0, 120) : null));
    const guess = named[0] ?? (billTo && !ownKeys.includes(clientKey(billTo)) ? billTo : "");
    if (guess) out.client = guess;
    problems.push(out.client ? "New client (not in your list yet): check the name." : "Client not found: type the name.");
  }
  /* the email: the client's own on file first, otherwise one on the invoice that is not OnPoint's */
  const ownDomains = own.emails.map((e) => e.split("@")[1]?.toLowerCase()).filter(Boolean);
  const emails = [...new Set((flat.match(/[^\s@<>,;()"']+@[^\s@<>,;()"']+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase()))];
  out.email = (hit?.contact_email ?? emails.find((e) => !own.emails.includes(e) && !ownDomains.includes(e.split("@")[1]))) ?? null;
  /* what it is for: the first line under a "Description" heading */
  const di = lines.findIndex((l) => /^(?:qty\s+)?(?:description|item|particulars|details)\b/i.test(l));
  if (di >= 0) {
    /* the first line under the heading that is not the heading's own wrap ("Price", "Total"); without the quantity in
       front and the price and amount columns at the end */
    const line = lines.slice(di + 1, di + 5).find((l) => !/^(?:unit\s+)?(?:price|total|amount|qty|quantity|rate)(?:\s+\w+)?$/i.test(l));
    const d = (line ?? "").replace(/^\d+(?:\.\d+)?\s+(?=[A-Za-z])/, "").replace(/(\s+(?:(?:S\$|SGD|\$)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+\.\d{1,2}))+$/, "").trim();
    if (d.length >= 3 && /[A-Za-z]{3}/.test(d)) out.description = d.slice(0, 160);
  }
  if (!out.number) problems.push("No invoice number found (optional).");
  return out;
}

/* ── a PDF that lists many invoices in a table (0287) ──────────────────────── */

export interface PdfItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

/**
 * Rebuild a table from a PDF's text pieces and their positions (a printed invoice list, an aged receivables
 * report, a statement): the header row names the columns (client, invoice no., due date, amount), and every
 * piece below goes to the nearest column. Where the client is a heading above its invoices (Xero's aged
 * receivables) instead of a column, it is carried down into a "Client" column. Null if there is no such table.
 */
export function tableFromPdf(pages: PdfItem[][]): Cell[][] | null {
  let cols: Array<{ name: string; c: number }> | null = null;
  let addClient = false;
  let group = "";
  const out: Cell[][] = [];
  for (const items of pages) {
    /* lines, top to bottom; pieces on a line merged into cells where the gap is small */
    const lines: PdfItem[][] = [];
    for (const it of items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
      const line = lines.find((l) => Math.abs(l[0].y - it.y) < 2.5);
      if (line) line.push(it);
      else lines.push([it]);
    }
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const cells: PdfItem[] = [];
      for (const it of line) {
        const last = cells[cells.length - 1];
        if (last && it.x - (last.x + last.w) < 6) cells[cells.length - 1] = { str: `${last.str} ${it.str}`.replace(/\s+/g, " "), x: last.x, y: last.y, w: it.x + it.w - last.x };
        else cells.push({ ...it, str: it.str.trim() });
      }
      const names = cells.map((c) => norm(c.str));
      const has = (k: Key) => names.some((n) => H[k].test(n));
      if (cells.length >= 3 && has("due") && (has("owing") || has("total")) && (has("client") || has("number"))) {
        cols = cells.map((c) => ({ name: c.str, c: c.x + c.w / 2 }));
        addClient = !has("client");
        if (!out.length) out.push([...(addClient ? ["Client"] : []), ...cols.map((c) => c.name)]);
        continue;
      }
      if (!cols) continue;
      const text = cells.map((c) => c.str).join(" ");
      if (/^(sub)?total\b|^balance\s+(due|owing)\b/i.test(text)) continue;
      if (cells.length === 1 && !/\d{2,}/.test(text)) {
        group = text.slice(0, 160);
        continue;
      }
      if (cells.length < 2) continue;
      const row: Cell[] = cols.map(() => "");
      for (const c of cells) {
        const mid = c.x + c.w / 2;
        let best = 0;
        for (let i = 1; i < cols.length; i++) if (Math.abs(cols[i].c - mid) < Math.abs(cols[best].c - mid)) best = i;
        row[best] = row[best] ? `${row[best]} ${c.str}` : c.str;
      }
      out.push(addClient ? [group, ...row] : row);
    }
  }
  return out.length > 1 ? out : null;
}
