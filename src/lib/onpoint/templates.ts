import { countdown, daysBetween, fmtDate } from "./dates";
import { TYPE_NAME, type ReminderType } from "./types";

/**
 * Reminder templates and their tokens (0267). Pure: the page previews with exactly what the server sends.
 * Tokens: {contact} {company} {uen} {type} {due_date} {countdown} {days_left} (spec §9).
 */

export const TOKENS = ["{contact}", "{company}", "{uen}", "{type}", "{due_date}", "{countdown}", "{days_left}"] as const;

const SIGN = "\n\nIf this has already been taken care of, please disregard this email. If you have any questions, simply reply to this email.\n\nBest regards,\nOnPoint Consulting";

export const DEFAULT_TEMPLATES: Record<ReminderType, { subject: string; body: string }> = {
  AR: {
    subject: "Reminder: Annual Return for {company} due {due_date}",
    body: "Hi {contact},\n\nThis is a friendly reminder that the Annual Return (ACRA) for {company} (UEN {uen}) is due on {due_date}, {countdown}.\n\nTo help us file on time, please send us any updates to the company's officers, shareholders or registered address, and confirm that the AGM has been held or dispensed with." + SIGN,
  },
  ECI: {
    subject: "Reminder: ECI for {company} due {due_date}",
    body: "Hi {contact},\n\nThis is a friendly reminder that the Estimated Chargeable Income (ECI) for {company} (UEN {uen}) is due to IRAS on {due_date}, {countdown}.\n\nPlease send us the company's revenue and estimated profit for the financial year, so that we can prepare and file the ECI on time." + SIGN,
  },
  AGM: {
    subject: "Reminder: AGM for {company} due {due_date}",
    body: "Hi {contact},\n\nThis is a friendly reminder that {company} must hold its Annual General Meeting (or circulate the financial statements to its members) by {due_date}, {countdown}.\n\nPlease let us know a suitable date, and we will prepare the AGM documents for signing." + SIGN,
  },
  FS: {
    subject: "Reminder: Financial Statements for {company} due {due_date}",
    body: "Hi {contact},\n\nThis is a friendly reminder that the Financial Statements for {company} need to be ready by {due_date}, {countdown}, ahead of the AGM.\n\nPlease send us any outstanding bank statements, invoices and supporting documents for the financial year." + SIGN,
  },
  CORP_SEC_EXPIRY: {
    subject: "Reminder: {type} for {company} renews {due_date}",
    body: "Hi {contact},\n\nThis is a friendly reminder that the {type} service for {company} expires on {due_date}, {countdown}.\n\nTo continue the service without interruption, please let us know if you would like to renew. We will send the renewal invoice once confirmed." + SIGN,
  },
  RECURRING_JOB: {
    subject: "Reminder: {type} for {company} due {due_date}",
    body: "Hi {contact},\n\nThis is a friendly reminder that the next {type} for {company} is due on {due_date}, {countdown}.\n\nPlease send us the documents for this period at your earliest convenience." + SIGN,
  },
};

export const DEFAULT_LEADS: Record<ReminderType, number[]> = {
  AR: [30, 14, 7],
  ECI: [30, 14, 7],
  AGM: [30, 14, 7],
  FS: [30, 14],
  CORP_SEC_EXPIRY: [60, 30, 14],
  RECURRING_JOB: [7, 3],
};

/** {tokens} that are not supported, so they can be flagged before saving */
export function unknownTokens(text: string): string[] {
  const all = text.match(/\{[^{}\s]{0,40}\}/g) ?? [];
  return [...new Set(all.filter((t) => !(TOKENS as readonly string[]).includes(t)))];
}

export interface RenderInput {
  type: ReminderType;
  label: string | null;
  company: string;
  uen: string | null;
  contact: string | null;
  due: string;
  today: string;
}

/**
 * Fill in a template. A missing value is never made up: {uen} with no UEN stays visible as "[UEN missing]" and
 * is reported, so the email cannot be sent. A missing contact name greets "there" ("Hi there,"), which names
 * nobody, and is reported as a note only.
 */
export function render(tpl: { subject: string; body: string }, v: RenderInput) {
  const n = daysBetween(v.today, v.due);
  const typeName = v.type === "CORP_SEC_EXPIRY" || v.type === "RECURRING_JOB" ? (v.label?.trim() || TYPE_NAME[v.type]) : TYPE_NAME[v.type];
  const missing: string[] = [];
  const notes: string[] = [];
  const map: Record<string, string> = {
    "{contact}": v.contact?.trim() || "there",
    "{company}": v.company,
    "{uen}": v.uen?.trim() || "[UEN missing]",
    "{type}": typeName,
    "{due_date}": fmtDate(v.due),
    "{countdown}": countdown(v.due, v.today),
    "{days_left}": n >= 0 ? String(n) : `${-n} days overdue`,
  };
  const fill = (s: string) => s.replace(/\{[a-z_]+\}/g, (t) => map[t] ?? t);
  const both = tpl.subject + tpl.body;
  if (both.includes("{uen}") && !v.uen?.trim()) missing.push("UEN");
  if (both.includes("{contact}") && !v.contact?.trim()) notes.push("No contact name on file, so the greeting reads “Hi there”.");
  const unknown = unknownTokens(both);
  return { subject: fill(tpl.subject).replace(/\s+/g, " ").trim(), body: fill(tpl.body), missing, unknown, notes };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email as HTML: the body's own words, paragraph by paragraph, nothing else added */
export function bodyHtml(body: string, banner?: string): string {
  const paras = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const top = banner ? `<p style="margin:0 0 18px 0;padding:10px 12px;background:#fff8e6;border:1px solid #f0dfb0;border-radius:6px;font-size:13px;color:#5c4a14;">${esc(banner)}</p>` : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#222;">${top}${paras}</body></html>`;
}
