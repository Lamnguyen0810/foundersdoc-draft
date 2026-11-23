import "server-only";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/sign/notify";
import { maskEmail } from "@/lib/sign/code";
import { teamNotice } from "@/lib/sign/slack";
import { slackChannel } from "./test-mode";
import { accessCodeEmail, accessEmail } from "./access-email";

/**
 * Password-free access to an ESOP dashboard (0264, 0266).
 *
 *   invite  Founders Doc's "Email access" button: a branded email whose button opens /esop/access. It signs
 *           nobody in, so forwarding it gives nothing away.
 *   code    /esop/access: the person types their email; if it is on a dashboard, a 6-digit code goes to that
 *           address (Supabase's own one-time code). Typing it signs them in.
 *   notice  every sign-in of a client's login is posted in the ESOP Slack channel (Rachel: "even better if
 *           Zapier can let us know here that he has accessed the account"). Founders Doc logins are not.
 *
 * Emails go to that one address only: never to a simulation inbox, never copied.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESEND_MS = 30_000;
const MAX_TRIES = 5;
const lastSent = new Map<string, number>();
const tries = new Map<string, number>();

export type AccessResult = "sent" | "not_member" | "too_soon" | "failed" | "unavailable" | "bad_email";

export const cleanEmail = (raw: unknown) => String(raw ?? "").trim().toLowerCase();
export const isEmail = (e: string) => EMAIL.test(e) && e.length <= 200;

/** The dashboards this address may open, oldest first. */
export async function membershipsOf(email: string): Promise<Array<{ slug: string; name: string }>> {
  const db = supabaseAdmin();
  const m = await db.from("esop_members").select("company_id, added_at").eq("email", email).order("added_at");
  const ids = ((m.data ?? []) as Array<{ company_id: string }>).map((x) => x.company_id);
  if (!ids.length) return [];
  const c = await db.from("esop_companies").select("id, slug, name").in("id", ids);
  const rows = (c.data ?? []) as Array<{ id: string; slug: string; name: string }>;
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is { id: string; slug: string; name: string } => !!r);
}

/** Founders Doc's button: invite a person who is already on `slug`. */
export async function sendInvite(rawEmail: string, origin: string, slug: string): Promise<AccessResult> {
  const email = cleanEmail(rawEmail);
  if (!isEmail(email)) return "bad_email";
  if (!isAdminClientConfigured()) return "unavailable";
  const company = (await membershipsOf(email)).find((c) => c.slug === slug);
  if (!company) return "not_member";
  const mail = accessEmail({ company: company.name, slug: company.slug, email, origin });
  const ok = await sendEmail({ kind: "esop_access", to: email, name: "", subject: mail.subject, html: mail.html, text: mail.text, link: `${origin}/esop/access`, cc: [] });
  return ok ? "sent" : "failed";
}

/** /esop/access: a 6-digit code to this address, if it is on a dashboard. */
export async function sendCode(rawEmail: string): Promise<AccessResult> {
  const email = cleanEmail(rawEmail);
  if (!isEmail(email)) return "bad_email";
  if (!isAdminClientConfigured()) return "unavailable";
  const company = (await membershipsOf(email))[0];
  if (!company) return "not_member";
  const now = Date.now();
  if (now - (lastSent.get(email) ?? 0) < RESEND_MS) return "too_soon";
  /* Supabase makes the one-time code (and the account, the first time); it is checked by Supabase too */
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    console.error("[esop access] no code:", error?.message);
    return "failed";
  }
  lastSent.set(email, now);
  tries.delete(email);
  const mail = accessCodeEmail({ company: company.name, slug: company.slug, code, minutes: 60 });
  const ok = await sendEmail({ kind: "esop_access_code", to: email, name: "", subject: mail.subject, html: mail.html, text: mail.text, link: "", cc: [] });
  if (!ok) lastSent.delete(email);
  return ok ? "sent" : "failed";
}

/** Too many wrong codes for this address: stop until a new code is asked for. */
export function countTry(email: string): boolean {
  const n = (tries.get(email) ?? 0) + 1;
  tries.set(email, n);
  return n <= MAX_TRIES;
}

/** After a code is accepted: where to go, and tell the team when a client's login gets in. */
export async function afterSignIn(email: string, isFounder: boolean): Promise<string> {
  tries.delete(email);
  const company = (await membershipsOf(email))[0];
  if (!company) return "/esop/access";
  if (!isFounder && !/@foundersdoc\.com$/.test(email)) {
    await teamNotice(`🔓 ${maskEmail(email)} has just signed in to the ${company.name} ESOP dashboard`, slackChannel(false)).catch(() => false);
  }
  return `/esop/${company.slug}`;
}
