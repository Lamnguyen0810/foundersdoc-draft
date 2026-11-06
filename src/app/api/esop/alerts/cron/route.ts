import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { alertEmail, alertRecipients, dueAlerts } from "@/lib/esop/alerts";
import { sendEmail } from "@/lib/sign/notify";
import type { EsopBatch, EsopHolder } from "@/lib/esop/vesting";

/**
 * GET /api/esop/alerts/cron, once a day (vercel.json, 01:30 UTC = 9:30am Singapore),
 * with `Authorization: Bearer <CRON_SECRET>`.
 *
 * For every ESOP dashboard with alert timings in Settings (123), emails the chosen
 * people the vestings that are 2 weeks / 1 week / ... away today. esop_alert_log
 * keeps one row per vesting and timing, so nobody is told twice. HitPay has no
 * timings set, so its alerts stay with the Zap until its Admin chooses some.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://foundersdoc.com";

function authorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Company = { id: string; slug: string; name: string; alert_days: number[] | null; alert_emails: string[] | null; email_override: string | null };

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isAdminClientConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  const db = supabaseAdmin();
  const origin = process.env.VERCEL_ENV === "production" || !process.env.VERCEL_ENV ? SITE : req.nextUrl.origin;

  const cs = await db.from("esop_companies").select("id, slug, name, alert_days, alert_emails, email_override").not("alert_days", "is", null);
  if (cs.error) return NextResponse.json({ error: /alert_days/.test(cs.error.message) ? "Run supabase/123_esop_settings.sql first." : cs.error.message }, { status: 500 });

  const report: Array<{ company: string; ref: string; days: number; sent: number; to: number }> = [];
  for (const c of (cs.data ?? []) as Company[]) {
    const days = c.alert_days ?? [];
    if (!days.length) continue;
    const [b, h, m] = await Promise.all([
      db.from("esop_batches").select("batch, vesting_start, tranches, note").eq("company_id", c.id),
      db.from("esop_holders").select("*").eq("company_id", c.id),
      db.from("esop_members").select("email").eq("company_id", c.id).eq("alerts", true),
    ]);
    const due = dueAlerts((h.data ?? []) as EsopHolder[], (b.data ?? []) as EsopBatch[], days);
    if (!due.length) continue;
    const to = alertRecipients(((m.data ?? []) as Array<{ email: string }>).map((x) => x.email), c.alert_emails ?? [], c.email_override);
    if (!to.length) continue;
    for (const a of due) {
      /* claim it first: if two runs overlap, only one sends */
      const claim = await db.from("esop_alert_log").insert({ company_id: c.id, ref: a.ref, days_before: a.daysBefore, recipients: to.length }).select("ref");
      if (claim.error) continue; // already sent (primary key), or 123 not run
      const mail = alertEmail(c.name.replace(/\s*\(TEST\)\s*$/i, ""), a, `${origin}/esop/${c.slug}?ref=${a.ref}`);
      let sent = 0;
      for (const email of to) {
        const ok = await sendEmail({ kind: "esop_alert", to: email, name: "", subject: mail.subject, html: mail.html, text: mail.text, link: `${origin}/esop/${c.slug}?ref=${a.ref}` });
        if (ok) sent++;
      }
      /* record how many went out (0 = the email hook is not set: see the log) */
      await db.from("esop_alert_log").update({ recipients: sent }).eq("company_id", c.id).eq("ref", a.ref).eq("days_before", a.daysBefore);
      report.push({ company: c.slug, ref: a.ref, days: a.daysBefore, sent, to: to.length });
    }
  }
  return NextResponse.json({ ok: true, alerts: report });
}
