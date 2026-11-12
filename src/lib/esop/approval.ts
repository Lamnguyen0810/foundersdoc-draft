import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sendEmail } from "@/lib/sign/notify";
import { testModeFields } from "./test-mode";

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
  slug?: string;
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

const ASSETS = "https://foundersdoc.com/email/hitpay-esop";
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const HEAD = "Geist,Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The approval email, in the house style of the HitPay vesting email (same
 * header, hero, step circles, sign-off and notice): everything Aditya needs
 * to decide, then one button.
 */
export function approvalEmail(it: ApprovalItem, link: string) {
  const s = approvalSummary(it);
  const company = plainCompany(it);
  const first = (it.to_name ?? "").trim().split(/\s+/)[0] || "there";
  const sim = it.simulation ? "[SIMULATION] " : "";
  const subject = `${sim}Please approve: issuance of Option Certificates for ${s.names} (vesting ${it.vest_date_text})`;
  const hitpay = (it.slug ?? "").toLowerCase() === "hitpay" || /hitpay/i.test(company);
  const url = esc(link);
  /* 0217: Modify / Cancel open the same private page with the form (only its POST records anything) */
  const modifyUrl = esc(`${link}?do=modify`);
  const cancelUrl = esc(`${link}?do=cancel`);
  const td = (css: string, inner: string) => `<td style="font-family:${FONT};${css}">${inner}</td>`;

  const logos = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><img src="${ASSETS}/fd-logo.png" width="150" height="28" alt="Founders Doc" style="display:block;width:150px;height:28px;"></td>${
    hitpay
      ? `<td valign="middle" style="padding:0 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="1" height="24" bgcolor="#dcdcd8" style="width:1px;height:24px;background-color:#dcdcd8;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td>
<td valign="middle"><img src="${ASSETS}/hitpay-logo.png" width="98" height="24" alt="HitPay" style="display:block;width:98px;height:24px;"></td>`
      : ""
  }</tr></table>`;

  const simNote = it.simulation
    ? `<tr><td class="px" style="padding:0 32px 18px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${td(
        "padding:10px 14px;background-color:#fff8e6;border:1px solid #f0dfb0;border-radius:8px;font-size:13px;line-height:19px;color:#5c4a14;",
        "&#129514; <b>Simulation</b> &middot; a practice run. Every email goes to Founders Doc, not to the client or holders.",
      )}</tr></table></td></tr>`
    : "";

  /* three figures at a glance */
  const stat = (big: string, small: string, last = false) =>
    `<td width="33%" valign="top" style="width:33%;padding:16px 16px 15px 16px;${last ? "" : "border-right:1px solid #ecebe6;"}font-family:${FONT};">
<p class="big" style="margin:0;font-family:${HEAD};font-size:24px;line-height:28px;font-weight:bold;letter-spacing:-0.6px;color:#161616;white-space:nowrap;">${big}</p>
<p style="margin:4px 0 0 0;font-size:12px;line-height:16px;color:#8a8a86;">${small}</p></td>`;
  const stats = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #ecebe6;border-radius:10px;"><tr>
${stat(String(s.certificates), s.certificates === 1 ? "Certificate" : "Certificates")}${stat(esc(fmt(s.options)), "Options")}${stat(esc(it.share_class ?? "—"), "Share class", true)}</tr></table>`;

  /* who gets one */
  const row = (left: string, right: string, muted = false, lastRow = false) =>
    `<tr><td style="padding:12px 0;${lastRow ? "" : "border-bottom:1px solid #ecebe6;"}font-family:${FONT};font-size:15px;line-height:22px;color:${muted ? "#9a9a96" : "#161616"};">${left}</td>
<td align="right" style="padding:12px 0;${lastRow ? "" : "border-bottom:1px solid #ecebe6;"}font-family:${FONT};font-size:15px;line-height:22px;white-space:nowrap;color:${muted ? "#9a9a96" : "#161616"};">${right}</td></tr>`;
  const all = [
    ...it.holders.map((h) => ({ l: `<b style="font-weight:600;">${esc(h.name)}</b>`, r: `${esc(fmt(optionsOf(h)))} options`, m: false })),
    ...it.leavers.map((l) => ({ l: `${esc(l.name)} <span style="font-size:13px;">&middot; ${esc(l.leaver_type)} leaver</span>`, r: `<span style="font-size:13px;">No certificate</span>`, m: true })),
  ];
  const list = all.map((x, i) => row(x.l, x.r, x.m, i === all.length - 1)).join("");

  const step = (n: number, title: string, text: string, top: number) => `<tr><td style="padding:${top}px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="50" valign="top" style="width:50px;"><img src="${ASSETS}/step-${n}.png" width="34" height="34" alt="${n}" style="display:block;width:34px;height:34px;"></td>
<td valign="top" style="padding-top:4px;font-family:${FONT};font-size:14.5px;line-height:22px;color:#666666;">
<p style="margin:0 0 4px 0;font-family:${HEAD};font-size:17px;line-height:24px;font-weight:bold;letter-spacing:-0.3px;color:#161616;">${title}</p>
<p style="margin:0;font-size:14.5px;line-height:22px;color:#666666;">${text}</p></td></tr></table></td></tr>`;

  const preheader = `${s.certificates} Option Certificate${s.certificates === 1 ? "" : "s"} vesting ${s.vest}: one tap to approve, no login needed.`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>Please approve: Option Certificates</title>
<style>body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;-webkit-font-smoothing:antialiased;}table{border-collapse:collapse;}img{border:0;outline:none;text-decoration:none;display:block;}p{margin:0;}
@media (max-width:480px){.px{padding-left:20px !important;padding-right:20px !important;}.big{font-size:19px !important;line-height:24px !important;}}</style></head>
<body style="margin:0;padding:0;background-color:#f6f6f4;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f6f6f4;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f4" style="width:100%;background-color:#f6f6f4;"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #ebebe8;">

<tr><td style="padding:24px 32px;">${logos}</td></tr>

<tr><td style="border-top:1px solid #ecebe6;border-bottom:1px solid #ecebe6;font-size:0;line-height:0;">
<img src="${ASSETS}/approve-hero.png" width="600" alt="Approval needed. Please approve. Option Certificates are ready to be issued." style="display:block;width:100%;max-width:600px;height:auto;"></td></tr>

<tr><td style="padding:28px 32px 0 32px;"></td></tr>
${simNote}
<tr><td class="px" style="padding:0 32px;font-family:${FONT};font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 14px 0;color:#161616;">Hi ${esc(first)},</p>
<p style="margin:0;">${esc(company)} ESOP options vest on <b style="color:#161616;">${esc(s.vest)}</b>. Please approve the issuance of the Option Certificates below.</p></td></tr>

<tr><td class="px" style="padding:22px 32px 0 32px;">${stats}</td></tr>

<tr><td class="px" style="padding:24px 32px 0 32px;font-family:${FONT};">
<p style="margin:0 0 2px 0;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.6px;color:#8a8a86;">WHO GETS A CERTIFICATE</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${list}</table></td></tr>

<tr><td class="px" style="padding:26px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="#f2c14e" style="background-color:#f2c14e;border-radius:10px;">
<a href="${url}" style="display:block;padding:16px 18px;font-family:${FONT};font-size:16px;line-height:22px;font-weight:bold;color:#161616;text-decoration:none;">${esc(s.button)} &rarr;</a></td></tr></table>
<p style="margin:10px 0 0 0;text-align:center;font-family:${FONT};font-size:13px;line-height:18px;color:#8a8a86;">&#128274; Opens a confirmation page &middot; No login needed</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>
<td width="50%" align="center" style="width:50%;padding-right:5px;"><a href="${modifyUrl}" style="display:block;padding:11px 8px;border:1px solid #dcdcd8;border-radius:9px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;color:#161616;text-decoration:none;">&#9999;&#65039; Modify</a></td>
<td width="50%" align="center" style="width:50%;padding-left:5px;"><a href="${cancelUrl}" style="display:block;padding:11px 8px;border:1px solid #dcdcd8;border-radius:9px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;color:#161616;text-decoration:none;">&#10006;&#65039; Cancel</a></td>
</tr></table></td></tr>

<tr><td class="px" style="padding:30px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #ecebe6;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
<p style="margin:20px 0 0 0;font-family:${FONT};font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.6px;color:#8a8a86;">WHAT HAPPENS NEXT</p></td></tr>
${step(1, "Approve", "Tap the button above, then Confirm. Something to change? Tap Modify; to stop this issuance, Cancel.", 16)}
${step(2, "Payment", "We'll email you the payment link for the certificates.", 20)}
${step(3, "Review &amp; sign", "Sign the certificates online through a secure link. No account needed.", 20)}

<tr><td class="px" style="padding:30px 32px 0 32px;font-family:${FONT};font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 18px 0;"><b style="color:#161616;">Something not right?</b> Tap Modify and tell us what to change. Nothing is issued until you approve.</p>
<p style="margin:0;">Best,</p><p style="margin:0;font-weight:bold;color:#161616;">Founders Doc</p></td></tr>

<tr><td class="px" style="padding:26px 32px 0 32px;"><a href="https://foundersdoc.com" style="text-decoration:none;"><img src="${ASSETS}/button.png" width="176" height="42" alt="foundersdoc.com" style="display:block;width:176px;height:42px;"></a></td></tr>

<tr><td class="px" style="padding:26px 32px 28px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-top:1px solid #ebebe8;padding-top:18px;font-family:${FONT};font-size:10px;line-height:15px;color:#9a9a96;">
<p style="margin:0 0 8px 0;">This approval button is personal to you; please don't forward this email. It works once and expires 30 days after the vesting date.</p>
<b style="color:#666666;">Confidentiality notice:</b> This message is intended only for the individual or entity to which it is addressed and may contain privileged and confidential information. If you are not the intended recipient, please notify us by return email, delete this message, and do not disseminate, distribute or copy any information contained herein.</td></tr></table></td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    `Hi ${first},`,
    "",
    `${company} ESOP options vest on ${s.vest}. Please approve the issuance of these Option Certificates:`,
    ...it.holders.map((h) => `  - ${h.name}: ${fmt(optionsOf(h))} options`),
    ...it.leavers.map((l) => `  - ${l.name} (${l.leaver_type} leaver): no certificate`),
    "",
    `${s.certificates} Option Certificate(s) · ${fmt(s.options)} options${it.share_class ? ` · ${it.share_class}` : ""}`,
    "",
    `${s.button}: ${link}`,
    "(Opens a confirmation page. No login needed.)",
    `Modify (ask for a change): ${link}?do=modify`,
    `Cancel this issuance: ${link}?do=cancel`,
    "",
    "What happens next: 1. Approve  2. Payment link  3. Review & sign online",
    "",
    "Something not right? Use Modify and tell us what to change. Nothing is issued until you approve.",
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
    /* 0199: Slack channel + email copies follow the simulation */
    ...testModeFields(item.simulation ? String(item.contact_email || "simulation") : null),
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
