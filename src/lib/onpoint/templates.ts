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
  return { subject: fill(tpl.subject).replace(/\s+/g, " ").trim(), body: fill(tpl.body), missing, unknown, notes, typeName };
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

export interface EmailLook {
  /** absolute URL of the logo (an email cannot show a data: image) */
  logoUrl: string;
  /** who the email is from, shown in the footer, e.g. "OnPoint Consulting" */
  sender: string;
  /** the deadline in a summary card */
  deadline: { type: string; company: string; uen: string | null; due: string; today: string };
  banner?: string;
}

/**
 * The designed reminder email (0271): logo header, a summary card for the deadline, the template's own words,
 * and a footer. Built with tables and inline styles only, so it shows the same in Outlook, Gmail and phones.
 */
export function emailHtml(body: string, look: EmailLook): string {
  const GREEN = "#3b5c2c";
  const n = daysBetween(look.deadline.today, look.deadline.due);
  const late = n < 0;
  const pill = late ? { bg: "#fdecea", fg: "#a3271b", text: countdown(look.deadline.due, look.deadline.today) } : n <= 7 ? { bg: "#fff4dc", fg: "#8a5a00", text: countdown(look.deadline.due, look.deadline.today) } : { bg: "#ebf3e6", fg: GREEN, text: countdown(look.deadline.due, look.deadline.today) };
  const paras = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px 0;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const row = (k: string, v: string, last = false) =>
    `<tr><td style="padding:10px 0;${last ? "" : "border-bottom:1px solid #e8ebe4;"}font-size:13px;color:#6b7266;width:120px;vertical-align:top;">${esc(k)}</td><td style="padding:10px 0;${last ? "" : "border-bottom:1px solid #e8ebe4;"}font-size:14px;color:#1d2219;font-weight:bold;vertical-align:top;">${v}</td></tr>`;
  const card = [
    row("Company", esc(look.deadline.company)),
    look.deadline.uen ? row("UEN", esc(look.deadline.uen)) : "",
    row("Filing", esc(look.deadline.type)),
    row("Due date", `${esc(fmtDate(look.deadline.due))} &nbsp;<span style="display:inline-block;padding:2px 9px;border-radius:999px;background:${pill.bg};color:${pill.fg};font-size:12px;font-weight:bold;">${esc(pill.text)}</span>`, true),
  ].join("");
  const banner = look.banner
    ? `<tr><td style="padding:12px 32px;background:#fff8e6;border-bottom:1px solid #f0dfb0;font-size:13px;color:#5c4a14;">${esc(look.banner)}</td></tr>`
    : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(look.deadline.type)} reminder</title></head>
<body style="margin:0;padding:0;background:#f3f4f1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f1;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e6df;border-radius:10px;border-collapse:separate;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1d2219;">
<tr><td style="height:5px;line-height:5px;font-size:0;background:${GREEN};">&nbsp;</td></tr>
${banner}
<tr><td style="padding:22px 32px 18px 32px;border-bottom:1px solid #eef0eb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle;"><img src="${esc(look.logoUrl)}" alt="${esc(look.sender)}" height="46" style="display:block;height:46px;width:auto;max-width:160px;border:0;"></td>
    <td align="right" style="vertical-align:middle;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GREEN};font-weight:bold;">Filing reminder</td>
  </tr></table>
</td></tr>
<tr><td style="padding:26px 32px 6px 32px;">
  <div style="font-size:21px;line-height:28px;font-weight:bold;color:#1d2219;">${esc(look.deadline.type)} due ${esc(fmtDate(look.deadline.due))}</div>
</td></tr>
<tr><td style="padding:14px 32px 8px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9f6;border:1px solid #e8ebe4;border-radius:8px;border-collapse:separate;"><tr><td style="padding:6px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${card}</table>
  </td></tr></table>
</td></tr>
<tr><td style="padding:20px 32px 10px 32px;font-size:15px;line-height:24px;color:#2b3127;">${paras}</td></tr>
<tr><td style="padding:16px 32px 22px 32px;border-top:1px solid #eef0eb;background:#fbfbfa;font-size:12px;line-height:18px;color:#7a8075;">
  Sent by <b style="color:#4a5145;">${esc(look.sender)}</b>. Reply to this email with any questions.<br>
  <span style="color:#a2a79c;">Filing reminders by OnPoint Workflows · powered by FD AI</span>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** where emails load the logo from; the version changes when the logo does, so mail apps fetch the new one */
export function logoUrl(origin: string, logoData: string | null | undefined): string {
  let h = 5381;
  const s = logoData ?? "";
  for (let i = 0; i < s.length; i += Math.max(1, Math.floor(s.length / 4000))) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `${origin.replace(/\/+$/, "")}/api/onpoint/logo?v=${s ? h.toString(36) : "default"}`;
}
