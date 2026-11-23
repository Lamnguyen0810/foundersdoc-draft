import "server-only";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/sign/notify";
import { accessEmail } from "./access-email";

/**
 * One-press access to an ESOP dashboard (0264).
 *
 * Only for someone who is a member of that dashboard (esop_members, Settings → Access). The email
 * goes to that address and nowhere else: never to a simulation inbox, never copied, because the
 * button signs in AS that person. The link is one-time (Supabase's own sign-in token, landing on
 * /auth/confirm) and lasts as long as the project's "Email OTP Expiration" (Supabase → Auth).
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESEND_MS = 60_000;
const lastSent = new Map<string, number>();

export type AccessResult = "sent" | "not_member" | "too_soon" | "failed" | "unavailable" | "bad_email";

/** The dashboards this address may open, oldest first. */
async function membershipsOf(email: string): Promise<Array<{ slug: string; name: string }>> {
  const db = supabaseAdmin();
  const m = await db.from("esop_members").select("company_id, added_at").eq("email", email).order("added_at");
  const ids = ((m.data ?? []) as Array<{ company_id: string }>).map((x) => x.company_id);
  if (!ids.length) return [];
  const c = await db.from("esop_companies").select("id, slug, name").in("id", ids);
  const rows = (c.data ?? []) as Array<{ id: string; slug: string; name: string }>;
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is { id: string; slug: string; name: string } => !!r);
}

/** A one-time sign-in link for this address that lands on `next` (makes the account if there is none yet). */
async function signInLink(email: string, origin: string, next: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) {
    console.error("[esop access] could not make a sign-in link:", error?.message);
    return null;
  }
  const type = data.properties.verification_type || "magiclink";
  return `${origin}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=${encodeURIComponent(type)}&next=${encodeURIComponent(next)}`;
}

/**
 * Email `email` a button that opens their dashboard. `slug` given (Founders Doc's button in Settings):
 * that dashboard, and only if they are on it. No slug (the public /esop/access page): their first one.
 */
export async function sendAccess(rawEmail: string, origin: string, slug?: string): Promise<AccessResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return "bad_email";
  if (!isAdminClientConfigured()) return "unavailable";
  const mine = await membershipsOf(email);
  const company = slug ? mine.find((c) => c.slug === slug) : mine[0];
  if (!company) return "not_member";
  const now = Date.now();
  if (now - (lastSent.get(email) ?? 0) < RESEND_MS) return "too_soon";
  const link = await signInLink(email, origin, `/esop/${company.slug}`);
  if (!link) return "failed";
  lastSent.set(email, now);
  const mail = accessEmail({ company: company.name, slug: company.slug, link, origin });
  /* to that address only: the button signs in as them */
  const ok = await sendEmail({ kind: "esop_access", to: email, name: "", subject: mail.subject, html: mail.html, text: mail.text, link: `${origin}/esop/${company.slug}`, cc: [] });
  if (!ok) lastSent.delete(email);
  return ok ? "sent" : "failed";
}
