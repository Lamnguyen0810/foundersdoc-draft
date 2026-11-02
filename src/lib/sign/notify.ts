import "server-only";

/**
 * Emails go out through Zapier (SIGN_HOOK_URL, a "Catch Hook" address kept in
 * Vercel, never in code): the Zap sends each email (Gmail today, an FD mailbox
 * later). If the hook is not set, nothing is sent and the admin page shows the
 * links to copy instead.
 */

export interface SignMail {
  kind: "invite" | "completed" | "code";
  to: string;
  name: string;
  role: string;
  link: string;
  documents: string[];
  message: string | null;
  /** kind "code": the 6-digit code */
  code?: string;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The whole email, ready for the Zap's Gmail step (Body = this one field). */
export function emailHtml(p: { heading: string; documents: string[]; message: string | null; link: string; button: string }): string {
  const docs = p.documents.map(esc).join("<br>");
  const link = esc(p.link);
  const msg = p.message ? `<p style="margin:14px 0 0 0;white-space:pre-line;">${esc(p.message)}</p>` : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FD Sign</title></head>
<body style="margin:0;padding:0;background-color:#f6f6f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f4" style="width:100%;background-color:#f6f6f4;"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #ebebe8;">
<tr><td style="padding:22px 32px;border-bottom:1px solid #ecebe6;"><img src="https://foundersdoc.com/email/hitpay-esop/fd-logo.png" width="150" height="28" alt="Founders Doc" style="display:block;width:150px;height:28px;border:0;"></td></tr>
<tr><td style="padding:30px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0;display:inline-block;background-color:#161616;color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:2px;padding:5px 10px;">FD SIGN</p>
<p style="margin:14px 0 0 0;font-size:24px;line-height:30px;font-weight:bold;color:#161616;">${esc(p.heading)}</p></td></tr>
<tr><td style="padding:14px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 10px 0;">${p.documents.length > 1 ? "Documents:" : "Document:"}</p>
<p style="margin:0;padding:12px 14px;background-color:#f4f4f4;border-radius:8px;color:#161616;font-weight:bold;">${docs}</p>${msg}</td></tr>
<tr><td style="padding:22px 32px 0 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#161616" style="background-color:#161616;border-radius:8px;">
<a href="${link}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(p.button)} &rarr;</a></td></tr></table></td></tr>
<tr><td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9a9a96;">
<p style="margin:0;">Or open this private link: <a href="${link}" style="color:#666666;word-break:break-all;">${link}</a></p>
<p style="margin:10px 0 0 0;">This link is personal to you; please don't forward it. Electronic signatures are recognised in Singapore under the Electronic Transactions Act 2010.</p></td></tr>
<tr><td style="padding:24px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 14px 0;"><b style="color:#161616;">Questions?</b> Just reply to this email.</p><p style="margin:0;">Best,</p><p style="margin:0;font-weight:bold;color:#161616;">Founders Doc</p></td></tr>
</table></td></tr></table></body></html>`;
}

/** The code email: the code large, what it is for, and that it expires. */
export function codeHtml(p: { name: string; code: string; documents: string[] }): string {
  const docs = p.documents.map(esc).join("<br>");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FD Sign code</title></head>
<body style="margin:0;padding:0;background-color:#f6f6f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f4" style="width:100%;background-color:#f6f6f4;"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #ebebe8;">
<tr><td style="padding:22px 32px;border-bottom:1px solid #ecebe6;"><img src="https://foundersdoc.com/email/hitpay-esop/fd-logo.png" width="150" height="28" alt="Founders Doc" style="display:block;width:150px;height:28px;border:0;"></td></tr>
<tr><td style="padding:30px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0;display:inline-block;background-color:#161616;color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:2px;padding:5px 10px;">FD SIGN</p>
<p style="margin:14px 0 0 0;font-size:24px;line-height:30px;font-weight:bold;color:#161616;">Your signing code</p>
<p style="margin:10px 0 0 0;font-size:15px;line-height:23px;color:#666666;">Hi ${esc(p.name.split(/\s+/)[0] ?? "")}, enter this code on the signing page to confirm it's you:</p></td></tr>
<tr><td style="padding:18px 32px 0 32px;"><p style="margin:0;display:inline-block;padding:14px 22px;background-color:#f4f4f4;border-radius:10px;font-family:'Courier New',Courier,monospace;font-size:32px;line-height:36px;font-weight:bold;letter-spacing:8px;color:#161616;">${esc(p.code)}</p></td></tr>
<tr><td style="padding:16px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#666666;">
<p style="margin:0;">It works for 10 minutes. For: <b style="color:#161616;">${docs}</b></p>
<p style="margin:12px 0 0 0;font-size:12px;line-height:18px;color:#9a9a96;">Didn't ask for this? You can ignore this email: nobody can sign without the code. Never share it with anyone, including Founders Doc.</p></td></tr>
<tr><td style="padding:24px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#666666;"><p style="margin:0;">Best,</p><p style="margin:0;font-weight:bold;color:#161616;">Founders Doc</p></td></tr>
</table></td></tr></table></body></html>`;
}

export function isHookConfigured(): boolean {
  return /^https:\/\/hooks\.zapier\.com\//.test(process.env.SIGN_HOOK_URL?.trim() ?? "");
}

export async function notify(mail: SignMail): Promise<boolean> {
  const hook = process.env.SIGN_HOOK_URL?.trim();
  if (!hook || !isHookConfigured()) return false;
  const n = mail.documents.length;
  const what = n === 1 ? mail.documents[0] : `${n} documents`;
  if (mail.kind === "code") {
    return post(hook, {
      ...mail,
      documents_text: mail.documents.join("\n"),
      count: n,
      subject: `Your FD Sign code: ${mail.code}`,
      heading: "Your signing code",
      button: "",
      from_name: "Founders Doc",
      reply_to: "legal@foundersdoc.com",
      html: codeHtml({ name: mail.name, code: mail.code ?? "", documents: mail.documents }),
    });
  }
  const heading = mail.kind === "invite" ? `${mail.name.split(/\s+/)[0]}, please review and sign` : "All parties have signed";
  const button = mail.kind === "invite" ? (n === 1 ? "Review & sign" : `Review & sign ${n} documents`) : "Download the signed copy";
  const payload = {
    ...mail,
    documents_text: mail.documents.join("\n"),
    count: n,
    subject: mail.kind === "invite" ? `Please sign: ${what}` : `Signed: ${what}`,
    heading,
    button,
    from_name: "Founders Doc",
    reply_to: "legal@foundersdoc.com",
    /* the finished email: the Gmail step's Body is just this field */
    html: emailHtml({ heading, documents: mail.documents, message: mail.message, link: mail.link, button }),
  };
  return post(hook, payload);
}

async function post(hook: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch (e) {
    console.error("[sign] email hand-over failed:", e);
    return false;
  }
}
