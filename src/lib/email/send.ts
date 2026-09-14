import "server-only";

/**
 * Sending email, without making it a launch blocker.
 *
 * Resend is used because its free tier (3,000 a month) covers a waitlist many
 * times over, and it is one HTTPS call — no SDK, no SMTP credentials sitting in
 * an environment variable, no mail server to run.
 *
 * THE IMPORTANT PROPERTY: if RESEND_API_KEY is not set, this does nothing and
 * says so once in the log. A person joining the waitlist still joins the
 * waitlist. Email is the nice-to-have; being on the list is the thing that
 * matters, and it must not fail because a mail provider has not been set up
 * yet. FD said "if free, apply now; if not, wait" — this does exactly that,
 * and switches itself on the moment the key appears.
 */

let warned = false;

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** The address messages come from. Must be on a domain verified in Resend. */
function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "Founders Doc <onboarding@resend.dev>";
}

export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    if (!warned) {
      warned = true;
      console.warn(
        "[email] RESEND_API_KEY is not set — no email is being sent. " +
          "Everything else works; add the key to switch sending on.",
      );
    }
    return false;
  }

  try {
    /* The base URL is overridable so the send path can be exercised against a
       local stand-in. Unset — which is everywhere except a test — it is Resend. */
    const base = process.env.RESEND_BASE_URL?.trim() || "https://api.resend.com";
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress(),
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[email] send failed:", res.status, detail.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] could not reach the mail service:", err);
    return false;
  }
}
