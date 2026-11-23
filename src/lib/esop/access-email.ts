import { esopTag } from "./subjects";

/**
 * The email that lets a client open their ESOP dashboard with one press (0264).
 *
 * Rachel, 23 Nov 2026, on the first client login: "Can we send him an email where he can just press
 * and access the dashboard … Press the email and key in his email then he can access." The button
 * signs them in straight away (a one-time link made for that one address); next time they open
 * /esop/access, type their email and get a new one. No password to create.
 *
 * Pure, so it can be previewed and tested on its own.
 */

const ASSETS = "https://foundersdoc.com/email/hitpay-esop";
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function accessEmail(p: { company?: string | null; slug: string; link: string; origin?: string }) {
  const company = (p.company ?? "").replace(/\s*\(test\)\s*/i, "").trim() || "your company";
  const hitpay = p.slug.toLowerCase() === "hitpay" || /hitpay/i.test(company);
  const again = `${p.origin ?? "https://foundersdoc.com"}/esop/access`;
  const subject = `${esopTag(p.company)}: Your Dashboard Access`;
  const lead = `Your ${company} ESOP dashboard is ready. Press the button to open it.`;
  const url = esc(p.link);

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
<style>body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;}table{border-collapse:collapse;}img{border:0;outline:none;text-decoration:none;display:block;}p{margin:0;}</style>
</head>
<body style="margin:0;padding:0;background-color:#f6f6f4;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f6f6f4;">${esc(lead)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f4" style="width:100%;background-color:#f6f6f4;"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #ebebe8;">

<tr><td style="padding:24px 32px;border-bottom:1px solid #ecebe6;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><img src="${ASSETS}/fd-logo.png" width="150" height="28" alt="Founders Doc" style="display:block;width:150px;height:28px;"></td>${
    hitpay
      ? `<td valign="middle" style="padding:0 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="1" height="24" bgcolor="#dcdcd8" style="width:1px;height:24px;background-color:#dcdcd8;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td>
<td valign="middle"><img src="${ASSETS}/hitpay-logo.png" width="98" height="24" alt="HitPay" style="display:block;width:98px;height:24px;"></td>`
      : ""
  }</tr></table></td></tr>

<tr><td style="padding:32px 32px 0 32px;font-family:${FONT};">
<p style="margin:0;font-size:26px;line-height:32px;font-weight:bold;letter-spacing:-0.4px;color:#161616;">Your ESOP dashboard is ready</p>
<p style="margin:16px 0 0 0;font-size:15px;line-height:23px;color:#161616;">Hi there,</p>
<p style="margin:12px 0 0 0;font-size:15px;line-height:23px;color:#666666;">You now have access to the ${esc(company)} ESOP dashboard: every option holder, their tranches and vesting dates, and upcoming vestings to approve.</p></td></tr>

<tr><td style="padding:24px 32px 0 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#F5B82E" style="background-color:#F5B82E;border-radius:8px;">
<a href="${url}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:bold;color:#161616;text-decoration:none;">Open the dashboard &rarr;</a></td></tr></table></td></tr>

<tr><td style="padding:18px 32px 0 32px;font-family:${FONT};font-size:13px;line-height:20px;color:#666666;">
<p style="margin:0;">The button signs you in straight away, no password needed. It works once, and only for you, so please don't forward this email.</p>
<p style="margin:10px 0 0 0;"><b style="color:#161616;">Next time</b>, or if the button has expired: open <a href="${esc(again)}" style="color:#161616;">${esc(again.replace(/^https?:\/\//, ""))}</a> and type your email. We'll send you a new one.</p></td></tr>

<tr><td style="padding:26px 32px 28px 32px;font-family:${FONT};font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 14px 0;"><b style="color:#161616;">Questions?</b> Just reply to this email.</p>
<p style="margin:0;">Best,</p><p style="margin:0;font-weight:bold;color:#161616;">Founders Doc</p></td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    "Hi there,",
    "",
    `You now have access to the ${company} ESOP dashboard: every option holder, their tranches and vesting dates, and upcoming vestings to approve.`,
    "",
    `Open the dashboard: ${p.link}`,
    "",
    "The link signs you in straight away, no password needed. It works once, and only for you, so please don't forward this email.",
    `Next time, or if the link has expired: open ${again} and type your email. We'll send you a new one.`,
    "",
    "Questions? Just reply to this email.",
    "",
    "Best,",
    "Founders Doc",
  ].join("\n");
  return { subject, html, text };
}
