import { ccEmails } from "./test-mode";

/**
 * The note each option holder gets when their options vest (0256): "A Milestone Worth Celebrating".
 *
 * Until now this email lived inside a Zap (an Outlook step in a loop). On 20 Nov 2026 that step
 * failed for all three holders while Slack still said "Vesting email sent". Here it is sent by the
 * website, through the same route as the approval and payment emails, so a CC line works and the
 * Slack line is posted only once the emails have really gone.
 *
 * The words and the look are the ones Rachel approved in the Zap, unchanged. Pure, so it can be
 * previewed and tested on its own.
 */

const ASSETS = "https://foundersdoc.com/email/hitpay-esop";
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The CC line: Founders Doc's own addresses, then the client's contact; never the holder themself; nobody in a simulation. */
export function noteCc(holderEmail: string, contactEmail: string | null | undefined, simulation: boolean): string[] {
  if (simulation) return [];
  const to = holderEmail.trim().toLowerCase();
  const all = [...ccEmails(null).split(","), contactEmail ?? ""].map((x) => x.trim().toLowerCase()).filter((x) => EMAIL.test(x) && x !== to);
  return [...new Set(all)];
}

export function holderNoteEmail(p: { company?: string; slug?: string }) {
  const company = (p.company ?? "").replace(/\s*\(test\)\s*/i, "").trim() || "Your company";
  const hitpay = (p.slug ?? "").toLowerCase() === "hitpay" || /hitpay/i.test(company);
  const subject = `\u{1F389} A Milestone Worth Celebrating | ${company} ESOP`;
  const lead = `Your ${company} ESOP options have vested. Here's what to expect next.`;
  const step = (n: 1 | 2, pad: number, title: string, body: string) => `<tr><td style="padding:${pad}px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="50" valign="top" style="width:50px;"><img src="${ASSETS}/step-${n}.png" width="34" height="34" alt="${n}" style="display:block;width:34px;height:34px;"></td>
<td valign="top" style="padding-top:4px;font-family:${FONT};font-size:14.5px;line-height:22px;color:#666666;">
<p style="margin:0 0 6px 0;font-size:18px;line-height:26px;font-weight:bold;letter-spacing:-0.3px;color:#161616;">${title}</p>
<p style="margin:0;font-size:14.5px;line-height:22px;color:#666666;">${body}</p></td></tr></table></td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(`Your ${company} ESOP options have vested`)}</title>
<style>body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;-webkit-font-smoothing:antialiased;}table{border-collapse:collapse;}img{border:0;outline:none;text-decoration:none;display:block;}p{margin:0;}</style>
</head>
<body style="margin:0;padding:0;background-color:#f6f6f4;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f6f6f4;">${esc(lead)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f4" style="width:100%;background-color:#f6f6f4;"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #ebebe8;">

<tr><td style="padding:24px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><img src="${ASSETS}/fd-logo.png" width="150" height="28" alt="Founders Doc" style="display:block;width:150px;height:28px;"></td>${
    hitpay
      ? `<td valign="middle" style="padding:0 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="1" height="24" bgcolor="#dcdcd8" style="width:1px;height:24px;background-color:#dcdcd8;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td>
<td valign="middle"><img src="${ASSETS}/hitpay-logo.png" width="98" height="24" alt="HitPay" style="display:block;width:98px;height:24px;"></td>`
      : ""
  }</tr></table></td></tr>

<tr><td style="border-top:1px solid #ecebe6;border-bottom:1px solid #ecebe6;font-size:0;line-height:0;">
<img src="${ASSETS}/hero.png" width="600" alt="Vested. Congratulations. Your ${esc(company)} ESOP options have vested." style="display:block;width:100%;max-width:600px;height:auto;"></td></tr>

<tr><td style="padding:30px 32px 6px 32px;font-family:${FONT};font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 14px 0;font-size:15px;line-height:23px;color:#161616;">Hi there,</p>
<p style="margin:0;font-size:15px;line-height:23px;color:#666666;">We're pleased to share that your ${esc(company)} ESOP options have vested. Here's what to expect next.</p></td></tr>

${step(1, 26, "Signing request", "You will receive a separate email from Founders Doc shortly with a secure link to your Option Certificate.")}
${step(2, 24, "Review &amp; sign", "Once you receive it, please review your Option Certificate and sign it electronically if everything is in order.")}

<tr><td style="padding:30px 32px 0 32px;font-family:${FONT};font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 18px 0;font-size:15px;line-height:23px;color:#666666;"><b style="color:#161616;">Questions?</b> Just reply to this email. We're happy to help.</p>
<p style="margin:0;font-size:15px;line-height:23px;color:#666666;">Best,</p>
<p style="margin:0;font-size:15px;line-height:23px;font-weight:bold;color:#161616;">Founders Doc</p></td></tr>

<tr><td style="padding:26px 32px 0 32px;"><a href="https://www.foundersdoc.com" style="text-decoration:none;"><img src="${ASSETS}/button.png" width="176" height="42" alt="foundersdoc.com" style="display:block;width:176px;height:42px;"></a></td></tr>

<tr><td style="padding:26px 32px 28px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-top:1px solid #ebebe8;padding-top:18px;font-family:${FONT};font-size:10px;line-height:15px;color:#9a9a96;">
<b style="color:#666666;">Confidentiality notice:</b> This message is intended only for the individual or entity to which it is addressed and may contain privileged and confidential information. If you are not the intended recipient, please notify us by return email, delete this message, and do not disseminate, distribute or copy any information contained herein.</td></tr></table></td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    "Hi there,",
    "",
    `We're pleased to share that your ${company} ESOP options have vested. Here's what to expect next.`,
    "",
    "1. Signing request: you will receive a separate email from Founders Doc shortly with a secure link to your Option Certificate.",
    "2. Review & sign: once you receive it, please review your Option Certificate and sign it electronically if everything is in order.",
    "",
    "Questions? Just reply to this email. We're happy to help.",
    "",
    "Best,",
    "Founders Doc",
  ].join("\n");
  return { subject, html, text };
}
