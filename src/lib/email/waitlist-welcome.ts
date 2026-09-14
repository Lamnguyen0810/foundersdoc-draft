import type { Mail } from "./send";

/**
 * The email someone gets for joining the waitlist.
 *
 * Written to be short and to say exactly one true thing: you are on the list,
 * and here is how to reach a human sooner. It makes no promise about a date,
 * because the firm has not made one — a welcome email that implies imminent
 * access is a complaint waiting to happen.
 *
 * Plain text is sent alongside the HTML, not as an afterthought: a fair number
 * of business inboxes strip HTML, and a blank email from a law firm is worse
 * than no email.
 */
export function waitlistWelcome(to: string, name: string | null, siteUrl: string): Mail {
  const hello = name ? `Hi ${name},` : "Hello,";
  const consult = `${siteUrl}/contact`;

  const text = [
    hello,
    "",
    "Thank you for your interest in FD AI — you are on the waitlist.",
    "",
    "FD AI drafts first-pass legal documents and marks anything it is unsure of as [[TO CONFIRM]], so a lawyer knows exactly what to check. We are opening it up gradually, and we will email this address as soon as your place is ready.",
    "",
    "If you need something drafted or reviewed before then, you do not have to wait for the software. Book a consultation with us here:",
    consult,
    "",
    "Founders Doc",
    siteUrl.replace(/^https?:\/\//, ""),
    "",
    "You are receiving this because you asked to join the FD AI waitlist. We will only email you about FD AI.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f5f1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e6e4dd;border-radius:14px">
<tr><td style="padding:32px 32px 8px">
  <div style="border-top:2px solid #111;border-bottom:2px solid #111;display:inline-block;padding:6px 0;font:600 13px/1.2 Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#111">Founders Doc</div>
</td></tr>
<tr><td style="padding:20px 32px 0;font:400 16px/1.6 Helvetica,Arial,sans-serif;color:#1a1a1a">
  <p style="margin:0 0 16px">${escapeHtml(hello)}</p>
  <p style="margin:0 0 16px">Thank you for your interest in <b style="font-weight:600">FD AI</b> — you are on the waitlist.</p>
  <p style="margin:0 0 16px">FD AI drafts first-pass legal documents and marks anything it is unsure of as <code style="background:#f2f0ea;padding:1px 5px;border-radius:4px;font-size:14px">[[TO CONFIRM]]</code>, so a lawyer knows exactly what to check. We are opening it up gradually, and we will email this address as soon as your place is ready.</p>
  <p style="margin:0 0 24px">If you need something drafted or reviewed before then, you do not have to wait for the software.</p>
  <p style="margin:0 0 28px">
    <a href="${consult}" style="display:inline-block;background:#e9b03c;color:#111;text-decoration:none;font:600 15px/1 Helvetica,Arial,sans-serif;padding:14px 24px;border-radius:8px">Book a consultation</a>
  </p>
</td></tr>
<tr><td style="padding:0 32px 28px;border-top:1px solid #eeece6">
  <p style="margin:18px 0 0;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:#6b6b76">
    You are receiving this because you asked to join the FD AI waitlist. We will only email you about FD AI.
  </p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { to, subject: "You're on the FD AI waitlist", html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
