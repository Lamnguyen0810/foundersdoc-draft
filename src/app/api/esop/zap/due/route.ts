import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { alertText, confirmText, loadDue, newApprovalLink, optionsOf } from "@/lib/esop/zap";
import { sendApprovalEmail } from "@/lib/esop/approval";
import { testModeFields } from "@/lib/esop/test-mode";

/**
 * GET /api/esop/zap/due?company=hitpay&days=7      who vests in 7 days
 * GET /api/esop/zap/due?company=hitpay&ref=B99-T1   one Ref (after Rachel's ✅)
 *
 * For Zapier: `Authorization: Bearer <company key>` (supabase/106). Reads the
 * ESOP dashboard's own list, so the alerts follow every change made there.
 * Answers with the first match as plain fields (ref, holder_names, alert_text,
 * …), its `holders` as line items for a loop, and every match under `items`.
 * `found` is false when nothing vests: put a Filter on it. Without the right
 * key it answers 404.
 *
 * &send_approval=1 (117): also email the client's contact the approval email
 * ("Approve issuance of Option Certificates", no login) for the first vesting
 * that is not approved yet. At most once every 20 hours per vesting, so a
 * re-run or a Zap test does not email twice. `approval_email` says what
 * happened: sent / already_sent / failed / not_needed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The simulation inbox of an item (esop_item puts it in contact_email while simulation is on). */
function simTo(it: unknown): string | null {
  const o = it as { simulation?: boolean; contact_email?: string };
  return o.simulation ? o.contact_email || "simulation" : null;
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (key.length < 24) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const slug = (sp.get("company") ?? "").toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return NextResponse.json({ error: "Give ?company=<slug>." }, { status: 400 });
  const ref = sp.get("ref")?.trim().toUpperCase() || null;
  if (ref && !/^B\d{1,3}-T\d{1,2}$/.test(ref)) return NextResponse.json({ error: "Ref looks like B99-T1." }, { status: 400 });
  const days = Math.max(0, Math.min(60, Number.parseInt(sp.get("days") ?? "7", 10) || 0));

  const { data, error } = await loadDue(key, slug, days, ref);
  if (error) {
    if (/not allowed/.test(error.message ?? "")) return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("[esop due] failed:", error.message);
    return NextResponse.json({ error: "Could not read the list." }, { status: 500 });
  }
  const items = data?.items ?? [];
  const first = items[0];
  const company = data?.company ?? slug;

  let approvalEmail: "sent" | "already_sent" | "failed" | "not_needed" | "off" = "off";
  if (sp.get("send_approval") === "1") {
    approvalEmail = "not_needed";
    if (first && !first.done && first.holders.length) {
      const made = await newApprovalLink(key, slug, first.ref);
      if (made.error) {
        console.error("[esop due] approval link failed:", made.error);
        approvalEmail = "failed";
      } else if (made.item?.skipped) approvalEmail = "already_sent";
      else if (made.item) approvalEmail = (await sendApprovalEmail(made.item, `${req.nextUrl.origin}/approve/${made.token}`)) ? "sent" : "failed";
    }
  }

  return NextResponse.json({
    found: Boolean(first),
    approval_email: approvalEmail,
    /* 0199: Slack channel + email copies, switched to the tester's own while simulation is on */
    ...testModeFields(first ? simTo(first) : null),
    count: items.length,
    company,
    today: data?.today,
    ...(first
      ? {
          ref: first.ref,
          batch: first.batch,
          tranche: first.tranche,
          vest_date: first.vest_date,
          vest_date_text: first.vest_date_text,
          days_left: first.days_left,
          done: first.done,
          invoice_no: first.invoice_no,
          holders_count: first.holders.length,
          options_total: first.holders.reduce((s, h) => s + optionsOf(h), 0),
          holder_names: first.holders.map((h) => h.name).join(", "),
          holder_emails: first.holders.map((h) => h.email).filter(Boolean).join(", "),
          leaver_names: first.leavers.map((l) => `${l.name} (${l.leaver_type})`).join(", "),
          alert_text: items.map((it) => alertText(company, it, `${req.nextUrl.origin}/esop/${slug}?ref=${it.ref}`)).join("\n\n"),
          confirm_text: confirmText(company, first),
          holders: first.holders.map((h) => ({ ...h, tranche: first.tranche, vest_date_text: first.vest_date_text, ref: first.ref })),
          leavers: first.leavers,
        }
      : {}),
    items,
  });
}
