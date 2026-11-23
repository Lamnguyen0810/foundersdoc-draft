import { esopTag } from "./subjects";

/**
 * The emails that let a client open their ESOP dashboard without a password (0264, 0266).
 *
 * Rachel, 23 Nov 2026: "Press the email and key in his email then he can access", then, once it was live:
 * "how do we know if he forwarded to someone else … can we add a layer of security so that he has to key in
 * his email and enter e.g. a verification code?" So the invitation carries NO sign-in at all: its button opens
 * /esop/access, where the person types their email and gets a 6-digit code at that address. A forwarded
 * invitation is useless to anyone who cannot read that inbox.
 *
 * Pure, so it can be previewed and tested on its own.
 */

const ASSETS = "https://foundersdoc.com/email/hitpay-esop";
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (c?: string | null) => (c ?? "").replace(/\s*\(test\)\s*/i, "").trim() || "your company";

function shell(p: { slug: string; company: string; title: string; preheader: string; body: string }) {
  const hitpay = p.slug.toLowerCase() === "hitpay" || /hitpay/i.test(p.company);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(p.title)}</title>
<style>body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;}table{border-collapse:collapse;}img{border:0;outline:none;text-decoration:none;display:block;}p{margin:0;}</style>
</head>
<body style="margin:0;padding:0;background-color:#f6f6f4;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f6f6f4;">${esc(p.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f4" style="width:100%;background-color:#f6f6f4;"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #ebebe8;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #ecebe6;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><img src="${ASSETS}/fd-logo.png" width="150" height="28" alt="Founders Doc" style="display:block;width:150px;height:28px;"></td>${
    hitpay
      ? `<td valign="middle" style="padding:0 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="1" height="24" bgcolor="#dcdcd8" style="width:1px;height:24px;background-color:#dcdcd8;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td>
<td valign="middle"><img src="${ASSETS}/hitpay-logo.png" width="98" height="24" alt="HitPay" style="display:block;width:98px;height:24px;"></td>`
      : ""
  }</tr></table></td></tr>
${p.body}
<tr><td style="padding:26px 32px 28px 32px;font-family:${FONT};font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 14px 0;"><b style="color:#161616;">Questions?</b> Just reply to this email.</p>
<p style="margin:0;">Best,</p><p style="margin:0;font-weight:bold;color:#161616;">Founders Doc</p></td></tr>
</table></td></tr></table></body></html>`;
}

/** The invitation: a button to the sign-in page (with the email filled in). It signs nobody in by itself. */
export function accessEmail(p: { company?: string | null; slug: string; email: string; origin?: string }) {
  const company = plain(p.company);
  const page = `${p.origin ?? "https://foundersdoc.com"}/esop/access?email=${encodeURIComponent(p.email)}`;
  const subject = `${esopTag(p.company)}: Your Dashboard Access`;
  const html = shell({
    slug: p.slug,
    company,
    title: subject,
    preheader: `Your ${company} ESOP dashboard is ready. Press the button to open it.`,
    body: `<tr><td style="padding:32px 32px 0 32px;font-family:${FONT};">
<p style="margin:0;font-size:26px;line-height:32px;font-weight:bold;letter-spacing:-0.4px;color:#161616;">Your ESOP dashboard is ready</p>
<p style="margin:16px 0 0 0;font-size:15px;line-height:23px;color:#161616;">Hi there,</p>
<p style="margin:12px 0 0 0;font-size:15px;line-height:23px;color:#666666;">You now have access to the ${esc(company)} ESOP dashboard: every option holder, their tranches and vesting dates, and upcoming vestings to approve.</p></td></tr>
<tr><td style="padding:24px 32px 0 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#F5B82E" style="background-color:#F5B82E;border-radius:8px;">
<a href="${esc(page)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:bold;color:#161616;text-decoration:none;">Open the dashboard &rarr;</a></td></tr></table></td></tr>
<tr><td style="padding:18px 32px 0 32px;font-family:${FONT};font-size:13px;line-height:20px;color:#666666;">
<p style="margin:0;">No password needed: press the button, confirm your email, and type the 6-digit code we send to it.</p>
<p style="margin:10px 0 0 0;"><b style="color:#161616;">Next time</b>, open <a href="${esc(page.split("?")[0])}" style="color:#161616;">${esc(page.split("?")[0].replace(/^https?:\/\//, ""))}</a> and do the same.</p></td></tr>`,
  });
  const text = [
    "Hi there,",
    "",
    `You now have access to the ${company} ESOP dashboard: every option holder, their tranches and vesting dates, and upcoming vestings to approve.`,
    "",
    `Open the dashboard: ${page}`,
    "",
    "No password needed: open the link, confirm your email, and type the 6-digit code we send to it.",
    `Next time, open ${page.split("?")[0]} and do the same.`,
    "",
    "Questions? Just reply to this email.",
    "",
    "Best,",
    "Founders Doc",
  ].join("\n");
  return { subject, html, text };
}

/** The 6-digit code, in the subject too, so it can be read off a phone's notification. */
export function accessCodeEmail(p: { company?: string | null; slug: string; code: string; minutes: number }) {
  const company = plain(p.company);
  const subject = `${esopTag(p.company)}: Your Sign-in Code ${p.code}`;
  const html = shell({
    slug: p.slug,
    company,
    title: subject,
    preheader: `Your sign-in code is ${p.code}.`,
    body: `<tr><td style="padding:32px 32px 0 32px;font-family:${FONT};">
<p style="margin:0;font-size:24px;line-height:30px;font-weight:bold;color:#161616;">Your sign-in code</p>
<p style="margin:12px 0 0 0;font-size:15px;line-height:23px;color:#666666;">Type this code on the sign-in page to open the ${esc(company)} ESOP dashboard:</p></td></tr>
<tr><td style="padding:18px 32px 0 32px;"><p style="margin:0;display:inline-block;padding:14px 22px;background-color:#f4f4f2;border-radius:10px;font-family:'Courier New',Courier,monospace;font-size:32px;line-height:36px;font-weight:bold;letter-spacing:8px;color:#161616;">${esc(p.code)}</p></td></tr>
<tr><td style="padding:16px 32px 0 32px;font-family:${FONT};font-size:13px;line-height:20px;color:#666666;">
<p style="margin:0;">It works once, for ${p.minutes} minutes. Didn't ask for it? You can ignore this email: nobody can sign in without the code. Never share it with anyone, including Founders Doc.</p></td></tr>`,
  });
  const text = [`Your sign-in code: ${p.code}`, "", `Type it on the sign-in page to open the ${company} ESOP dashboard. It works once, for ${p.minutes} minutes.`, "", "Didn't ask for it? You can ignore this email. Never share the code with anyone, including Founders Doc.", "", "Founders Doc"].join("\n");
  return { subject, html, text };
}
