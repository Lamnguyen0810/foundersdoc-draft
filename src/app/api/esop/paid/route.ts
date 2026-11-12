import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";

/**
 * POST /api/esop/paid  { "company": "hitpay", "ref": "B8-T2", "paid": true }
 *
 * The dashboard's "Mark as paid" (and "Undo"), 0217 / SQL 129. Founders Doc admins
 * only (esop_mark_paid checks again). Paid locks the batch's holders until every
 * certificate of that tranche is signed, and lets the certificates go out for signing.
 * A Zap can set the same from Stripe: /api/esop/zap/record with action "paid".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Only Founders Doc can mark a payment." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    company?: unknown;
    ref?: unknown;
    paid?: unknown;
  };
  const slug = String(body.company ?? "").toLowerCase();
  const ref = String(body.ref ?? "").toUpperCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !/^B\d{1,3}-T\d{1,2}$/.test(ref)) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("esop_mark_paid", {
    p_slug: slug,
    p_ref: ref,
    p_paid: body.paid !== false,
  });
  if (error) {
    const m = error.message ?? "";
    if (/not allowed/.test(m)) return NextResponse.json({ error: "Only Founders Doc can mark a payment." }, { status: 403 });
    if (/not approved/.test(m)) return NextResponse.json({ error: `${ref} isn't approved and sent yet.` }, { status: 409 });
    if (/esop_mark_paid/.test(m)) return NextResponse.json({ error: "Run supabase/129_esop_lock_in.sql first." }, { status: 503 });
    console.error("[esop paid] failed:", m);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
  const out = (data ?? {}) as {
    paid_at?: string | null;
    paid_by?: string | null;
  };
  return NextResponse.json({
    ok: true,
    ref,
    paid_at: out.paid_at ?? null,
    paid_by: out.paid_by ?? null,
  });
}
