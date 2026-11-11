import "server-only";
import { sendEmail } from "@/lib/sign/notify";
import { postToSlack } from "@/lib/sign/slack";
import { ccEmails } from "./test-mode";

/**
 * Modify / Cancel from the approval email (0217, SQL 129).
 *
 * Who is told (Rachel, 11 Nov: "both"):
 *   managed client (HitPay, self_serve = false)  Founders Doc: Slack (the vesting's thread) + ESOP_CC_EMAILS
 *   self-serve dashboard                          its Admins by email, and a copy to Founders Doc (ESOP_CC_EMAILS)
 * In a simulation every email goes to the simulation inbox and Slack to the test
 * channel, so nobody else is told while testing.
 */
export interface Response {
  kind: "modify" | "cancel";
  note: string | null;
  ref: string;
  by: string;
  by_name: string;
  company: string;
  slug: string;
  vest_date_text: string;
  self_serve: boolean;
  email_override: string | null;
  admins: string[];
  slack_ts: string | null;
  holders: Array<{ name: string }>;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function responseText(r: Response) {
  const who = r.by_name ? `${r.by_name} (${r.by})` : r.by;
  const what = r.kind === "modify" ? "asked for a change" : "cancelled the issuance";
  const head = `${who} ${what}: ${r.company}, ${r.ref} (vesting ${r.vest_date_text})`;
  const next =
    r.kind === "modify"
      ? "Nothing goes out until it is fixed. Make the change on the dashboard, then send a fresh approval email."
      : "Nothing is issued or charged. To go ahead after all, send a fresh approval email from the dashboard.";
  return { head, next };
}

/** Everyone who should hear about it, and how. */
export function recipients(r: Response): { to: string[]; slack: boolean } {
  const sim = (r.email_override ?? "").trim();
  if (sim) return { to: EMAIL.test(sim) ? [sim] : [], slack: !r.self_serve };
  const fd = ccEmails(null)
    .split(",")
    .map((x) => x.trim())
    .filter((x) => EMAIL.test(x));
  const admins = r.self_serve ? r.admins.filter((x) => EMAIL.test(x)) : [];
  return {
    to: [...new Set([...admins, ...fd].map((x) => x.toLowerCase()))],
    slack: !r.self_serve,
  };
}

export function responseEmail(r: Response, dashboard: string) {
  const t = responseText(r);
  const sim = r.email_override ? "[SIMULATION] " : "";
  const subject = `${sim}${r.kind === "modify" ? "Change requested" : "Issuance cancelled"}: ${r.company} ${r.ref}`;
  const note = r.note
    ? `<p style="margin:14px 0 0 0;padding:12px 14px;background:#fafaf7;border:1px solid #ecebe6;border-radius:8px;color:#161616;white-space:pre-wrap;">${esc(r.note)}</p>`
    : "";
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 8px;background:#f6f6f4;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ebebe8;">
<tr><td style="padding:24px 28px;font-family:${FONT};font-size:15px;line-height:23px;color:#444444;">
<p style="margin:0 0 6px 0;font-size:12px;font-weight:bold;letter-spacing:1.4px;color:#a07a00;">ESOP · ${esc(r.ref)}</p>
<p style="margin:0;font-size:19px;line-height:26px;font-weight:bold;color:#161616;">${esc(t.head)}</p>${note}
<p style="margin:14px 0 0 0;">${esc(t.next)}</p>
<p style="margin:18px 0 0 0;"><a href="${esc(dashboard)}" style="display:inline-block;padding:11px 16px;background:#f2c14e;border-radius:8px;color:#161616;font-weight:bold;text-decoration:none;">Open the ESOP dashboard &rarr;</a></p>
</td></tr></table></body></html>`;
  const text = [t.head, ...(r.note ? ["", r.note] : []), "", t.next, "", `ESOP dashboard: ${dashboard}`].join("\n");
  return { subject, html, text };
}

export async function notifyResponse(r: Response, origin: string): Promise<{ emailed: number; slack: boolean }> {
  const dashboard = `${origin}/esop/${r.slug}?ref=${r.ref}`;
  const who = recipients(r);
  const m = responseEmail(r, dashboard);
  let emailed = 0;
  for (const to of who.to) {
    if (
      await sendEmail({
        kind: "esop_response",
        to,
        name: "",
        subject: m.subject,
        html: m.html,
        text: m.text,
        link: dashboard,
      })
    )
      emailed++;
  }
  if (who.slack) {
    const t = responseText(r);
    await postToSlack(
      `${r.kind === "modify" ? "✏️" : "✖️"} ${t.head}${r.note ? `\n> ${r.note.replace(/\n/g, "\n> ")}` : ""}\n${t.next}`,
      r.ref,
      r.slack_ts,
      Boolean(r.email_override),
    );
  }
  return { emailed, slack: who.slack };
}
