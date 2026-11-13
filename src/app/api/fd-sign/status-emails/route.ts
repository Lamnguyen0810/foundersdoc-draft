import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { signStore } from "@/lib/sign/store";
import { tierOf } from "@/lib/sign/allowance";
import { digestFrequency, isMondaySgt, senderDigest } from "@/lib/sign/digest";
import { sendEmail } from "@/lib/sign/notify";
import { isPremium, SIGN_PLANS } from "@/lib/billing/sign-plans";
import { isQuietAccount } from "@/lib/quiet";
import { SITE } from "@/lib/seo";

/**
 * GET /api/fd-sign/status-emails, once a day (vercel.json, 01:00 UTC = 9am Singapore), with
 * `Authorization: Bearer <CRON_SECRET>`. 0236 (Rachel, 12 Nov).
 *
 * Every premium sender (Sign Standard, Sign Business, FD AI Pro, Unlimited) with documents still being signed,
 * or completed in the period, gets their status email: daily, or weekly on Mondays (the default), unless
 * they turned it off. The team's own accounts are skipped. ?dry=1 counts without sending.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isAdminClientConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  const store = signStore();
  if (store === "no-secret-key") return NextResponse.json({ error: "Not available." }, { status: 503 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const db = supabaseAdmin();
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();

  /* senders with something to report: documents still out, or completed in the last week */
  const e = await db
    .from("sign_envelopes")
    .select("owner_id, owner_email, owner_name")
    .not("owner_id", "is", null)
    .or(`status.eq.sent,and(status.eq.completed,completed_at.gte.${weekAgo})`)
    .limit(2000);
  if (e.error) return NextResponse.json({ error: e.error.message }, { status: 500 });
  const owners = new Map<string, { email: string; name: string }>();
  for (const r of (e.data ?? []) as Array<{ owner_id: string; owner_email: string | null; owner_name: string | null }>) {
    if (r.owner_email && !owners.has(r.owner_id)) owners.set(r.owner_id, { email: r.owner_email, name: r.owner_name || r.owner_email.split("@")[0] });
  }

  const sent: string[] = [];
  let skipped = 0;
  for (const [id, o] of owners) {
    if (isQuietAccount(o.email)) { skipped++; continue; }
    const tier = await tierOf(id).catch(() => "none" as const);
    if (!isPremium(tier)) { skipped++; continue; }
    const freq = await digestFrequency(id).catch(() => "weekly" as const);
    if (freq === "off" || (freq === "weekly" && !isMondaySgt(now))) { skipped++; continue; }
    const last = await db.from("sign_digest").select("last_sent_at").eq("user_id", id).maybeSingle();
    const lastAt = (last.data as { last_sent_at?: string | null } | null)?.last_sent_at;
    if (lastAt && now - Date.parse(lastAt) < 20 * 3_600_000) { skipped++; continue; } // a re-run the same morning
    const mail = await senderDigest(store, { id, name: o.name }, freq, SIGN_PLANS[tier].label, SITE, now).catch(() => null);
    if (!mail) { skipped++; continue; }
    if (dry) { sent.push(id); continue; }
    const ok = await sendEmail({ kind: "status_update", to: o.email, name: o.name, subject: mail.subject, html: mail.html, text: mail.text, link: `${SITE}/fd-sign` });
    if (ok) {
      sent.push(id);
      await db.from("sign_digest").upsert({ user_id: id, frequency: freq, last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    }
  }
  return NextResponse.json({ ok: true, dry, senders: owners.size, sent: sent.length, skipped });
}
