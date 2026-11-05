import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser, isAdmin } from "@/lib/supabase/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { canResetSimulation } from "@/lib/esop/sim-reset";
import { hashApprovalToken, newApprovalToken, sendApprovalEmail, type ApprovalItem } from "@/lib/esop/approval";

/**
 * POST /api/esop/approval-email  { "company": "hitpay", "ref": "B8-T2" }
 *
 * The dashboard's "Email for approval" button (SQL 117): sends the client's
 * contact (Aditya; in a simulation the FD address) the approval email with a
 * private one-time link. Founders Doc admins only (and Rachel / Lam).
 * The daily Zapier alert can send the same email itself (?send_approval=1 on
 * /api/esop/zap/due).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured() || !isAdminClientConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isAdmin()) && !canResetSimulation(user.email)) return NextResponse.json({ error: "Only Founders Doc can send this." }, { status: 403 });

  let body: { company?: unknown; ref?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const slug = String(body.company ?? "").toLowerCase();
  const ref = String(body.ref ?? "").toUpperCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !/^B\d{1,3}-T\d{1,2}$/.test(ref)) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const token = newApprovalToken();
  const { data, error } = await supabaseAdmin().rpc("esop_approval_link_admin", { p_slug: slug, p_ref: ref, p_token_hash: hashApprovalToken(token), p_by: user.email ?? null });
  if (error) {
    const m = error.message ?? "";
    if (/already approved/.test(m)) return NextResponse.json({ error: `${ref} is already approved.` }, { status: 409 });
    if (/no certificates/.test(m)) return NextResponse.json({ error: "Nobody gets a certificate in this vesting." }, { status: 409 });
    if (/no contact email/.test(m)) return NextResponse.json({ error: "The company has no contact email yet." }, { status: 409 });
    if (/bad ref/.test(m)) return NextResponse.json({ error: "That vesting does not exist." }, { status: 400 });
    if (/esop_approval_link/.test(m)) return NextResponse.json({ error: "Run supabase/117_esop_email_approval.sql first." }, { status: 503 });
    console.error("[esop approval email] failed:", m);
    return NextResponse.json({ error: "Could not prepare the email." }, { status: 500 });
  }
  const item = data as ApprovalItem;
  const link = `${req.nextUrl.origin}/approve/${token}`;
  const sent = await sendApprovalEmail(item, link);
  /* emails off (SIGN_HOOK_URL not set): give the admin the link to try or copy */
  return NextResponse.json({ ok: true, sent, to: item.to, ...(sent ? {} : { link }) });
}
