import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sendEmail } from "@/lib/sign/notify";

/**
 * Approve from the email (SQL 117). Rachel (4 Nov): "the email itself says all
 * the info, then he just has to tap approve". The email lists who gets a
 * certificate and how many options, the leavers and the totals; the button
 * opens /approve/<token>, a one-button Confirm page (no login). Only signing
 * opens the platform (FD Sign).
 */

export const newApprovalToken = () => randomBytes(32).toString("base64url");
export const hashApprovalToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const isApprovalToken = (t: string) => /^[A-Za-z0-9_-]{40,60}$/.test(t);

export interface ApprovalItem {
  ref: string;
  batch: number;
  tranche: number;
  vest_date: string; // 2026-12-01
  vest_date_text: string; // 1 Dec 2026
  done?: boolean;
  approved_by?: string | null;
  approved_at?: string | null;
  company?: string;
  company_legal_name?: string;
  share_class?: string;
  simulation?: boolean;
  to?: string;
  to_name?: string;
  holders: Array<{ name: string; options: string | number; options_number?: number }>;
  leavers: Array<{ name: string; leaver_type: string }>;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-12-01" -> "1 December 2026" */
export function longDate(iso: string): string {
  const [y, m, d] = (iso ?? "").slice(0, 10).split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
}
const optionsOf = (h: ApprovalItem["holders"][number]) => h.options_number ?? (Number(String(h.options).replace(/,/g, "")) || 0);
const fmt = (n: number) => n.toLocaleString("en-GB");
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plainCompany = (it: ApprovalItem) => (it.company ?? "").replace(/\s*\(test\)\s*/i, "").trim() || "the company";

/** "Ann Lee, Bo Tan and Cy Ong" (or "5 option holders" when it gets long) */
export function namesText(names: string[]): string {
  if (names.length > 3) return `${names.length} option holders`;
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function approvalSummary(it: ApprovalItem) {
  const certificates = it.holders.length;
  const options = it.holders.reduce((s, h) => s + optionsOf(h), 0);
  const button = `Approve issuance of ${certificates} Option Certificate${certificates === 1 ? "" : "s"}`;
  return { certificates, options, button, vest: longDate(it.vest_date), names: namesText(it.holders.map((h) => h.name)) };
}

/** The approval email: everything Aditya needs to decide, then one button. */
export function approvalEmail(it: ApprovalItem, link: string) {
  const s = approvalSummary(it);
  const company = plainCompany(it);
  const first = (it.to_name ?? "").trim().split(/\s+/)[0] || "there";
  const sim = it.simulation ? "[SIMULATION] " : "";
  const subject = `${sim}Please approve: issuance of Option Certificates for ${s.names} (vesting ${it.vest_date_text})`;
  const rows = it.holders
    .map(
      (h) =>
        `<tr><td style="padding:7px 0;font-size:15px;line-height:22px;color:#161616;">&#9989;&nbsp; <b>${esc(h.name)}</b></td><td align="right" style="padding:7px 0;font-size:15px;line-height:22px;color:#161616;white-space:nowrap;">${esc(fmt(optionsOf(h)))} options</td></tr>`,
    )
    .join("");
  const leavers = it.leavers
    .map(
      (l) =>
        `<tr><td colspan="2" style="padding:7px 0;font-size:14px;line-height:21px;color:#8a8a86;">&#10134;&nbsp; ${esc(l.name)} has left (${esc(l.leaver_type)} leaver), so no certificate this time</td></tr>`,
    )
    .join("");
  const simNote = it.simulation
    ? `<tr><td style="padding:16px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0;padding:10px 12px;background-color:#fff8e6;border:1px solid #f0dfb0;font-size:13px;line-height:19px;color:#5c4a14;">&#129514; <b>Simulation</b>: this is a practice run. Every email goes to Founders Doc, not to the client or holders.</p></td></tr>`
    : "";
  const url = esc(link);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Please approve</title></head>
<body style="margin:0;padding:0;background-color:#f6f6f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f4" style="width:100%;background-color:#f6f6f4;"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #ebebe8;">
<tr><td style="padding:22px 32px;border-bottom:1px solid #ecebe6;"><img src="https://foundersdoc.com/email/hitpay-esop/fd-logo.png" width="150" height="28" alt="Founders Doc" style="display:block;width:150px;height:28px;border:0;"></td></tr>${simNote}
<tr><td style="padding:28px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0;font-size:12px;font-weight:bold;letter-spacing:2px;color:#a07a00;">FD x ${esc(company.toUpperCase())} &middot; ESOP</p>
<p style="margin:10px 0 0 0;font-size:23px;line-height:30px;font-weight:bold;color:#161616;">Please approve: Option Certificates vesting ${esc(it.vest_date_text)}</p></td></tr>
<tr><td style="padding:16px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#444444;">
<p style="margin:0 0 10px 0;">Hi ${esc(first)},</p>
<p style="margin:0;">These ${esc(company)} ESOP options vest on <b style="color:#161616;">${esc(s.vest)}</b>. Founders Doc will issue one Option Certificate for each person below.</p></td></tr>
<tr><td style="padding:14px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#fafaf7;border:1px solid #ecebe6;border-radius:8px;"><tr><td style="padding:8px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-family:Arial,Helvetica,sans-serif;">${rows}${leavers}</table></td></tr></table></td></tr>
<tr><td style="padding:12px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#161616;">
<p style="margin:0;"><b>${s.certificates} Option Certificate${s.certificates === 1 ? "" : "s"}</b> &middot; ${esc(fmt(s.options))} options in total${it.share_class ? ` &middot; ${esc(it.share_class)} shares` : ""}</p></td></tr>
<tr><td style="padding:20px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#f2c14e" style="background-color:#f2c14e;border-radius:8px;">
<a href="${url}" style="display:block;padding:15px 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#161616;text-decoration:none;">&#9989; ${esc(s.button)}</a></td></tr></table>
<p style="margin:8px 0 0 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8a8a86;">One tap, then Confirm. No login needed.</p></td></tr>
<tr><td style="padding:16px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#444444;">
<p style="margin:0;">Once approved, we'll send the payment link, and then the certificates for your signature.</p></td></tr>
<tr><td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9a9a96;">
<p style="margin:0;">This button is personal to you; please don't forward this email. It works once and expires 30 days after the vesting date.</p></td></tr>
<tr><td style="padding:22px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 14px 0;"><b style="color:#161616;">Something not right?</b> Just reply to this email and we'll fix it before anything is issued.</p><p style="margin:0;">Best,</p><p style="margin:0;font-weight:bold;color:#161616;">Founders Doc</p><p style="margin:0;font-size:13px;color:#9a9a96;">ESOP Administration</p></td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `Hi ${first},`,
    "",
    `These ${company} ESOP options vest on ${s.vest}. Founders Doc will issue one Option Certificate for each person below:`,
    ...it.holders.map((h) => `  - ${h.name}: ${fmt(optionsOf(h))} options`),
    ...it.leavers.map((l) => `  - ${l.name} has left (${l.leaver_type} leaver), so no certificate this time`),
    "",
    `${s.certificates} Option Certificate(s) · ${fmt(s.options)} options in total${it.share_class ? ` · ${it.share_class} shares` : ""}`,
    "",
    `${s.button}: ${link}`,
    "(One tap, then Confirm. No login needed.)",
    "",
    "Something not right? Just reply to this email and we'll fix it before anything is issued.",
    "",
    "Best,",
    "Founders Doc",
  ].join("\n");
  return { subject, html, text };
}

export async function sendApprovalEmail(it: ApprovalItem, link: string): Promise<boolean> {
  if (!it.to) return false;
  const m = approvalEmail(it, link);
  return sendEmail({ kind: "esop_approval", to: it.to, name: it.to_name ?? "", subject: m.subject, html: m.html, text: m.text, link });
}

/**
 * After an approval (dashboard button or email link): hand the vesting to
 * Zapier (ESOP_APPROVE_HOOK_URL), which makes the payment link, the vesting
 * emails and the Slack message. Same payload as before 117.
 */
export async function handOver(item: Record<string, unknown> & { holders?: Array<Record<string, unknown>> }, origin: string, slug: string, ref: string, approvedBy: string) {
  const holders = item.holders ?? [];
  const payload = {
    ...item,
    approved_by: item.approved_by ?? approvedBy,
    holders_count: holders.length,
    options_total: holders.reduce((s, h) => s + (Number(h.options_number ?? String(h.options ?? "").replace(/,/g, "")) || 0), 0),
    holder_names: holders.map((h) => h.name).join(", "),
    dashboard_url: `${origin}/esop/${slug}?ref=${ref}`,
    holders: holders.map((h) => ({ ...h, ref, tranche: item.tranche, batch: item.batch, vest_date_text: item.vest_date_text })),
  };
  delete (payload as Record<string, unknown>).company_id;
  const hook = process.env.ESOP_APPROVE_HOOK_URL?.trim();
  if (!hook || !/^https:\/\/hooks\.zapier\.com\//.test(hook)) {
    return { sent: false, approvedBy: String(payload.approved_by), holders: holders.length, error: "Approved, but ESOP_APPROVE_HOOK_URL is not set in Vercel, so nothing was sent yet." };
  }
  try {
    const res = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Zapier answered ${res.status}`);
  } catch (e) {
    console.error("[esop approve] hand-over failed:", e);
    return { sent: false, approvedBy: String(payload.approved_by), holders: holders.length, error: "Approved, but Zapier could not be reached. Press Send again." };
  }
  return { sent: true, approvedBy: String(payload.approved_by), holders: holders.length, error: null as string | null };
}
