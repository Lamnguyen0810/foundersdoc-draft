import "server-only";

/**
 * Emails go out through Zapier (SIGN_HOOK_URL, a "Catch Hook" address kept in
 * Vercel, never in code): the Zap sends each email (Gmail today, an FD mailbox
 * later). If the hook is not set, nothing is sent and the admin page shows the
 * links to copy instead.
 */

export interface SignMail {
  kind: "invite" | "completed";
  to: string;
  name: string;
  role: string;
  link: string;
  documents: string[];
  message: string | null;
}

export function isHookConfigured(): boolean {
  return /^https:\/\/hooks\.zapier\.com\//.test(process.env.SIGN_HOOK_URL?.trim() ?? "");
}

export async function notify(mail: SignMail): Promise<boolean> {
  const hook = process.env.SIGN_HOOK_URL?.trim();
  if (!hook || !isHookConfigured()) return false;
  const n = mail.documents.length;
  const what = n === 1 ? mail.documents[0] : `${n} documents`;
  const payload = {
    ...mail,
    documents_text: mail.documents.join("\n"),
    count: n,
    subject: mail.kind === "invite" ? `Please sign: ${what}` : `Signed: ${what}`,
    heading: mail.kind === "invite" ? `${mail.name.split(/\s+/)[0]}, please review and sign` : "All parties have signed",
    button: mail.kind === "invite" ? (n === 1 ? "Review & sign" : `Review & sign ${n} documents`) : "Download the signed copy",
    from_name: "Founders Doc",
    reply_to: "legal@foundersdoc.com",
  };
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
