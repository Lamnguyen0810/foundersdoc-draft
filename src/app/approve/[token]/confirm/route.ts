import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { handOver, hashApprovalToken, isApprovalToken } from "@/lib/esop/approval";
import { who } from "@/lib/sign/http";

/**
 * POST /approve/<token>/confirm: the Confirm button on the approval page
 * (SQL 117). Approves exactly like the dashboard's Approve button (same
 * certificate numbers), records who/when/IP/browser, hands the vesting to
 * Zapier (payment link, vesting emails, Slack), then shows the thank-you page.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/approve/${isApprovalToken(token) ? token : "x"}${q}`, req.nextUrl.origin), 303);
  if (!isApprovalToken(token)) return back("");
  if (!isSupabaseConfigured()) return back("?done=1"); // local preview
  if (!isAdminClientConfigured()) return back("?e=1");

  const db = supabaseAdmin();
  const w = who(req);
  const { data, error } = await db.rpc("esop_approval_link_use", { p_token_hash: hashApprovalToken(token), p_ip: w.ip, p_ua: w.ua });
  if (error) {
    const m = error.message ?? "";
    if (/already approved|already sent/.test(m)) return back("?done=1");
    if (/expired link/.test(m)) return back("?e=expired");
    if (/invalid link/.test(m)) return back("");
    console.error("[approve] use failed:", m);
    return back("?e=1");
  }

  const item = (data ?? {}) as Record<string, unknown> & { holders?: Array<Record<string, unknown>>; company_id?: string; slug?: string; ref?: string };
  const slug = String(item.slug ?? "");
  const ref = String(item.ref ?? "");
  const companyId = String(item.company_id ?? "");
  const out = await handOver(item, req.nextUrl.origin, slug, ref, String(item.approved_by ?? "email"));
  if (out.sent && companyId) {
    const r = await db.from("esop_tranche_runs").update({ sent_at: new Date().toISOString() }).eq("company_id", companyId).eq("ref", ref);
    if (r.error) console.error("[approve] mark sent failed:", r.error.message);
  } else if (!out.sent) {
    /* approved and recorded; Founders Doc sees "Send again" on the dashboard */
    console.error("[approve] hand-over after email approval:", out.error);
  }
  return back("?done=1");
}
