import "server-only";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/sign/notify";
import { maskEmail } from "@/lib/sign/code";
import { postToSlack } from "@/lib/sign/slack";
import { loadDue } from "./zap";
import { paymentEmail, type PaymentItem } from "./payment-email";

/**
 * Send the payment email from the website (0202), instead of the Zap's plain one.
 *
 * The Zap still makes the Stripe payment link. It hands the link back to the
 * dashboard (POST /api/esop/zap/record, action "payment", with send_email: true)
 * and the website emails it, in the house style, to the company's contact (the
 * simulation inbox while simulation is on), plus a copy to each finance address
 * in Settings (never in a simulation). Once per vesting: a re-run of the Zap
 * within 20 hours does not email again (SQL 126; before 126, no such guard).
 */
export type PaymentEmailResult = "sent" | "already_sent" | "no_contact" | "not_found" | "failed";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function sendPaymentEmail(key: string, slug: string, ref: string, link: string): Promise<{ status: PaymentEmailResult; to?: string; copies?: number }> {
  const { data, error } = await loadDue(key, slug, 0, ref);
  const item = data?.items?.[0] as (PaymentItem & { contact_email?: string; slack_ts?: string | null }) | undefined;
  if (error || !item) return { status: "not_found" };
  const to = (item.contact_email ?? "").trim();
  if (!EMAIL.test(to)) return { status: "no_contact" };

  const db = isAdminClientConfigured() ? supabaseAdmin() : null;
  let companyId: string | null = null;
  let finance: string[] = [];
  if (db) {
    const c = await db.from("esop_companies").select("id").eq("slug", slug).maybeSingle();
    companyId = (c.data as { id?: string } | null)?.id ?? null;
    if (companyId) {
      const f = await db.from("esop_companies").select("finance_emails").eq("id", companyId).maybeSingle();
      if (!f.error) finance = ((f.data as { finance_emails?: string[] | null } | null)?.finance_emails ?? []).filter((e) => EMAIL.test(e));
      const r = await db.from("esop_tranche_runs").select("payment_email_sent_at").eq("company_id", companyId).eq("ref", ref).maybeSingle();
      const at = (r.error ? null : (r.data as { payment_email_sent_at?: string | null } | null)?.payment_email_sent_at) ?? null;
      if (at && Date.now() - Date.parse(at) < 20 * 3_600_000) return { status: "already_sent", to: maskEmail(to) };
    }
  }

  const it: PaymentItem = { ...item, company: data?.company ?? item.company, slug };
  const main = paymentEmail(it, link);
  const ok = await sendEmail({ kind: "esop_payment", to, name: it.contact_name ?? "", subject: main.subject, html: main.html, text: main.text, link });
  if (!ok) return { status: "failed", to: maskEmail(to) };

  let copies = 0;
  if (!it.simulation)
    for (const f of finance.filter((e) => e.toLowerCase() !== to.toLowerCase()).slice(0, 5)) {
      const copy = paymentEmail(it, link, "finance");
      if (await sendEmail({ kind: "esop_payment_copy", to: f, name: "", subject: copy.subject, html: copy.html, text: copy.text, link })) copies++;
    }

  if (db && companyId) {
    const u = await db.from("esop_tranche_runs").update({ payment_email_sent_at: new Date().toISOString() }).eq("company_id", companyId).eq("ref", ref);
    if (u.error) console.error("[esop payment] could not stamp the payment email (run supabase/126?):", u.error.message);
  }
  await postToSlack(`💳 Payment email sent to ${maskEmail(to)}${copies ? ` + ${copies} finance ${copies === 1 ? "copy" : "copies"}` : ""}`, ref, item.slack_ts ?? null, Boolean(it.simulation));
  return { status: "sent", to: maskEmail(to), copies };
}
