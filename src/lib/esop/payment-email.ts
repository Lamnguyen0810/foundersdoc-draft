/**
 * The HitPay ESOP payment email, in Founders Doc's house style (0202).
 *
 * Rachel, 6 Nov 2026, on the old plain email from the Zap: make it prettier;
 * the subject should be about the upcoming vesting for the option holders, not
 * just payment; payment links should also go to the client's finance team; and
 * the certificates go out for signing only once paid. Same look as the approval
 * email (lib/esop/approval.ts): FD | HitPay header, figures, holders, one gold
 * button, "What happens next".
 *
 * Pure (no server code), so it can be previewed and tested on its own.
 */

const ASSETS = "https://foundersdoc.com/email/hitpay-esop";
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const HEAD = "Geist,Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface PaymentItem {
  ref: string;
  vest_date: string; // 2026-12-01
  vest_date_text: string; // 1 Dec 2026
  company?: string; // "HitPay"
  slug?: string;
  contact_name?: string;
  simulation?: boolean;
  holders: Array<{ name: string; options: string | number; options_number?: number }>;
  leavers?: Array<{ name: string; leaver_type: string }>;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number) => n.toLocaleString("en-GB");
const optionsOf = (h: PaymentItem["holders"][number]) => h.options_number ?? (Number(String(h.options).replace(/,/g, "")) || 0);
export function longDate(iso: string): string {
  const [y, m, d] = (iso ?? "").slice(0, 10).split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
}
const plain = (c?: string) => (c ?? "").replace(/\s*\(test\)\s*/i, "").trim() || "the company";

export function paymentSubject(it: PaymentItem): string {
  const n = it.holders.length;
  return `${it.simulation ? "[SIMULATION] " : ""}Upcoming ESOP vesting on ${it.vest_date_text}: ${n} option ${n === 1 ? "holder" : "holders"} · payment to issue certificates`;
}

/** `copyFor`: a copy sent to the client's finance team (Settings → Finance copies). */
export function paymentEmail(it: PaymentItem, link: string, copyFor?: "finance") {
  const company = plain(it.company);
  const hitpay = (it.slug ?? "").toLowerCase() === "hitpay" || /hitpay/i.test(company);
  const n = it.holders.length;
  const total = it.holders.reduce((s, h) => s + optionsOf(h), 0);
  const vest = longDate(it.vest_date);
  const first = copyFor ? "" : (it.contact_name ?? "").trim().split(/\s+/)[0];
  const subject = paymentSubject(it);
  const url = esc(link);
  const td = (css: string, inner: string) => `<td style="font-family:${FONT};${css}">${inner}</td>`;

  const logos = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><img src="${ASSETS}/fd-logo.png" width="150" height="28" alt="Founders Doc" style="display:block;width:150px;height:28px;"></td>${
    hitpay
      ? `<td valign="middle" style="padding:0 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="1" height="24" bgcolor="#dcdcd8" style="width:1px;height:24px;background-color:#dcdcd8;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td>
<td valign="middle"><img src="${ASSETS}/hitpay-logo.png" width="98" height="24" alt="HitPay" style="display:block;width:98px;height:24px;"></td>`
      : ""
  }</tr></table>`;

  const note = (bg: string, border: string, color: string, inner: string) =>
    `<tr><td class="px" style="padding:0 32px 18px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${td(
      `padding:10px 14px;background-color:${bg};border:1px solid ${border};border-radius:8px;font-size:13px;line-height:19px;color:${color};`,
      inner,
    )}</tr></table></td></tr>`;
  const simNote = it.simulation ? note("#fff8e6", "#f0dfb0", "#5c4a14", "&#129514; <b>Simulation</b> &middot; a practice run. Every email goes to Founders Doc, not to the client.") : "";
  const copyNote = copyFor ? note("#f4f6fb", "#dfe5f2", "#2f3b57", `&#128188; <b>Copy for ${esc(company)} Finance.</b> The same email has gone to ${esc(it.contact_name || "the company's contact")}; only one payment is needed.`) : "";

  const stat = (big: string, small: string, last = false) =>
    `<td width="33%" valign="top" style="width:33%;padding:16px 16px 15px 16px;${last ? "" : "border-right:1px solid #ecebe6;"}font-family:${FONT};">
<p class="big" style="margin:0;font-family:${HEAD};font-size:24px;line-height:28px;font-weight:bold;letter-spacing:-0.6px;color:#161616;white-space:nowrap;">${big}</p>
<p style="margin:4px 0 0 0;font-size:12px;line-height:16px;color:#8a8a86;">${small}</p></td>`;
  const stats = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #ecebe6;border-radius:10px;"><tr>
${stat(String(n), n === 1 ? "Option holder" : "Option holders")}${stat(esc(fmt(total)), "Options vesting")}${stat(esc(it.vest_date_text.replace(/\s\d{4}$/, "")), "Vesting date", true)}</tr></table>`;

  const rows = [
    ...it.holders.map((h) => ({ l: `<b style="font-weight:600;">${esc(h.name)}</b>`, r: `${esc(fmt(optionsOf(h)))} options`, m: false })),
    ...(it.leavers ?? []).map((l) => ({ l: `${esc(l.name)} <span style="font-size:13px;">&middot; ${esc(l.leaver_type)} leaver</span>`, r: `<span style="font-size:13px;">No certificate</span>`, m: true })),
  ];
  const list = rows
    .map(
      (x, i) => `<tr><td style="padding:12px 0;${i === rows.length - 1 ? "" : "border-bottom:1px solid #ecebe6;"}font-family:${FONT};font-size:15px;line-height:22px;color:${x.m ? "#9a9a96" : "#161616"};">${x.l}</td>
<td align="right" style="padding:12px 0;${i === rows.length - 1 ? "" : "border-bottom:1px solid #ecebe6;"}font-family:${FONT};font-size:15px;line-height:22px;white-space:nowrap;color:${x.m ? "#9a9a96" : "#161616"};">${x.r}</td></tr>`,
    )
    .join("");

  const step = (icon: string, title: string, text: string, done: boolean, top: number) => `<tr><td class="px" style="padding:${top}px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="50" valign="top" style="width:50px;">${icon}</td>
<td valign="top" style="padding-top:4px;font-family:${FONT};">
<p style="margin:0 0 4px 0;font-family:${HEAD};font-size:17px;line-height:24px;font-weight:bold;letter-spacing:-0.3px;color:${done ? "#9a9a96" : "#161616"};">${title}</p>
<p style="margin:0;font-size:14.5px;line-height:22px;color:${done ? "#9a9a96" : "#666666"};">${text}</p></td></tr></table></td></tr>`;
  const tick = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="34" height="34" align="center" valign="middle" bgcolor="#e6f4ea" style="width:34px;height:34px;border-radius:17px;background-color:#e6f4ea;color:#1e7a3c;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">&#10003;</td></tr></table>`;
  const num = (k: number) => `<img src="${ASSETS}/step-${k}.png" width="34" height="34" alt="${k}" style="display:block;width:34px;height:34px;">`;

  const preheader = `${n} ${company} option ${n === 1 ? "holder" : "holders"} vest on ${vest}. Pay securely to issue their Option Certificates.`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
<style>body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}table{border-collapse:collapse;}img{border:0;outline:none;text-decoration:none;display:block;}p{margin:0;}
@media (max-width:480px){.px{padding-left:20px !important;padding-right:20px !important;}.big{font-size:19px !important;line-height:24px !important;}.hero{font-size:24px !important;line-height:30px !important;}}</style></head>
<body style="margin:0;padding:0;background-color:#f6f6f4;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f6f6f4;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f4" style="width:100%;background-color:#f6f6f4;"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #ebebe8;">

<tr><td style="padding:24px 32px;">${logos}</td></tr>

<tr><td class="px" bgcolor="#161616" style="background-color:#161616;padding:30px 32px;font-family:${FONT};">
<p style="margin:0;"><span style="display:inline-block;background-color:#f2c14e;color:#161616;font-size:11px;font-weight:bold;letter-spacing:1.6px;padding:5px 10px;border-radius:4px;">PAYMENT DUE</span></p>
<p class="hero" style="margin:14px 0 0 0;font-family:${HEAD};font-size:28px;line-height:34px;font-weight:bold;letter-spacing:-0.8px;color:#ffffff;">Upcoming option vesting<br>on ${esc(vest)}</p>
<p style="margin:8px 0 0 0;font-size:15px;line-height:22px;color:#bdbdb8;">Approved &#10003; &middot; one payment to issue the Option Certificates</p></td></tr>

<tr><td style="padding:28px 0 0 0;"></td></tr>
${simNote}${copyNote}
<tr><td class="px" style="padding:0 32px;font-family:${FONT};font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 14px 0;color:#161616;">Hi ${esc(first || (copyFor ? "Finance team" : "there"))},</p>
<p style="margin:0;">Thank you for approving. ${esc(company)} ESOP options for <b style="color:#161616;">${n} option ${n === 1 ? "holder" : "holders"}</b> vest on <b style="color:#161616;">${esc(vest)}</b>. Please make the payment below so we can issue their Option Certificates on time.</p></td></tr>

<tr><td class="px" style="padding:22px 32px 0 32px;">${stats}</td></tr>

<tr><td class="px" style="padding:24px 32px 0 32px;font-family:${FONT};">
<p style="margin:0 0 2px 0;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.6px;color:#8a8a86;">OPTION HOLDERS VESTING</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${list}</table></td></tr>

<tr><td class="px" style="padding:26px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="#f2c14e" style="background-color:#f2c14e;border-radius:10px;">
<a href="${url}" style="display:block;padding:16px 18px;font-family:${FONT};font-size:16px;line-height:22px;font-weight:bold;color:#161616;text-decoration:none;">Pay securely now &rarr;</a></td></tr></table>
<p style="margin:10px 0 0 0;text-align:center;font-family:${FONT};font-size:13px;line-height:18px;color:#8a8a86;">&#128274; Secure payment by Stripe &middot; receipt by email</p>
<p style="margin:8px 0 0 0;text-align:center;font-family:${FONT};font-size:12px;line-height:17px;color:#9a9a96;word-break:break-all;">Or copy this link: <a href="${url}" style="color:#666666;">${url}</a></p></td></tr>

<tr><td class="px" style="padding:30px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #ecebe6;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
<p style="margin:20px 0 0 0;font-family:${FONT};font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.6px;color:#8a8a86;">WHAT HAPPENS NEXT</p></td></tr>
${step(tick, "Approved", `The ${n} Option ${n === 1 ? "Certificate is" : "Certificates are"} approved.`, true, 16)}
${step(num(2), "Payment", "Pay with the button above. We'll confirm as soon as it's received.", false, 18)}
${step(num(3), "Review &amp; sign", "Once paid, the Option Certificates go out for signing online: the Director signs first, then each option holder. No account needed.", false, 18)}

<tr><td class="px" style="padding:30px 32px 0 32px;font-family:${FONT};font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 18px 0;"><b style="color:#161616;">Something not right?</b> Just reply to this email and we'll fix it before anything is issued.</p>
<p style="margin:0;">Best,</p><p style="margin:0;font-weight:bold;color:#161616;">Founders Doc</p></td></tr>

<tr><td class="px" style="padding:26px 32px 0 32px;"><a href="https://foundersdoc.com" style="text-decoration:none;"><img src="${ASSETS}/button.png" width="176" height="42" alt="foundersdoc.com" style="display:block;width:176px;height:42px;"></a></td></tr>

<tr><td class="px" style="padding:26px 32px 28px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-top:1px solid #ebebe8;padding-top:18px;font-family:${FONT};font-size:10px;line-height:15px;color:#9a9a96;">
<p style="margin:0 0 8px 0;">This payment link is for ${esc(company)}'s ESOP administration with Founders Doc. Please don't forward it outside your company.</p>
<b style="color:#666666;">Confidentiality notice:</b> This message is intended only for the individual or entity to which it is addressed and may contain privileged and confidential information. If you are not the intended recipient, please notify us by return email, delete this message, and do not disseminate, distribute or copy any information contained herein.</td></tr></table></td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    `Hi ${first || (copyFor ? "Finance team" : "there")},`,
    "",
    copyFor ? `(Copy for ${company} Finance. Only one payment is needed.)\n` : "",
    `Thank you for approving. ${company} ESOP options for ${n} option ${n === 1 ? "holder" : "holders"} vest on ${vest}. Please make the payment so we can issue their Option Certificates on time.`,
    "",
    ...it.holders.map((h) => `  - ${h.name}: ${fmt(optionsOf(h))} options`),
    ...(it.leavers ?? []).map((l) => `  - ${l.name} (${l.leaver_type} leaver): no certificate`),
    "",
    `Pay securely (Stripe): ${link}`,
    "",
    "What happens next: 1. Approved  2. Payment  3. Review & sign online (Director first, then each option holder)",
    "",
    "Something not right? Just reply to this email and we'll fix it before anything is issued.",
    "",
    "Best,",
    "Founders Doc",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
  return { subject, html, text };
}
