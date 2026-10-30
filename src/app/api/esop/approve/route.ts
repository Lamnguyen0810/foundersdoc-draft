import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";

/**
 * POST /api/esop/approve  { "company": "hitpay", "ref": "B99-T1" }
 *
 * The dashboard's Approve button. Runs with the signed-in person's session:
 * esop_approve() (supabase/107) checks they may approve, records who and
 * when, and gives each holder the next running certificate number. Then the
 * vesting is handed to Zapier (ESOP_APPROVE_HOOK_URL, a Zapier "Catch Hook"
 * address kept in Vercel, never in code), which makes the payment link,
 * certificates and emails. If Zapier cannot be reached the approval stays
 * recorded and the button offers "Send again" (same certificate numbers).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let body: { company?: unknown; ref?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const slug = String(body.company ?? "").toLowerCase();
  const ref = String(body.ref ?? "").toUpperCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !/^B\d{1,3}-T\d{1,2}$/.test(ref)) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("esop_approve", { p_slug: slug, p_ref: ref });
  if (error) {
    const m = error.message ?? "";
    if (/not allowed/.test(m)) return NextResponse.json({ error: "Only Founders Doc or an approver can approve." }, { status: 403 });
    if (/already sent/.test(m)) return NextResponse.json({ error: "This vesting was already approved and sent." }, { status: 409 });
    if (/bad ref/.test(m)) return NextResponse.json({ error: "That vesting does not exist." }, { status: 400 });
    console.error("[esop approve] failed:", m);
    return NextResponse.json({ error: "Could not approve." }, { status: 500 });
  }

  const item = (data ?? {}) as Record<string, unknown> & { holders?: Array<Record<string, unknown>> };
  const holders = item.holders ?? [];
  const payload = {
    ...item,
    approved_by: item.approved_by ?? user.email,
    holders_count: holders.length,
    options_total: holders.reduce((s, h) => s + (Number(h.options) || 0), 0),
    holder_names: holders.map((h) => h.name).join(", "),
    dashboard_url: `${req.nextUrl.origin}/esop/${slug}?ref=${ref}`,
    holders: holders.map((h) => ({ ...h, ref, tranche: item.tranche, batch: item.batch, vest_date_text: item.vest_date_text })),
  };

  const hook = process.env.ESOP_APPROVE_HOOK_URL?.trim();
  if (!hook || !/^https:\/\/hooks\.zapier\.com\//.test(hook)) {
    return NextResponse.json({ ok: false, sent: false, approved: true, error: "Approved, but ESOP_APPROVE_HOOK_URL is not set in Vercel, so nothing was sent yet." }, { status: 502 });
  }
  try {
    const res = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Zapier answered ${res.status}`);
  } catch (e) {
    console.error("[esop approve] hand-over failed:", e);
    return NextResponse.json({ ok: false, sent: false, approved: true, error: "Approved, but Zapier could not be reached. Press Send again." }, { status: 502 });
  }

  await supabase.rpc("esop_mark_sent", { p_slug: slug, p_ref: ref });
  return NextResponse.json({ ok: true, sent: true, approved_by: payload.approved_by, holders_count: holders.length });
}
