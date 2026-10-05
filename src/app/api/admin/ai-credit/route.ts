/**
 * The AI credit meter's two writes, from the admin Overview.
 *
 *   topup  "we paid US$5 in"           → adds to the balance
 *   set    "the provider's page says   → stores the difference as an
 *           US$3.90 is left"             adjustment, so the meter matches
 *
 * Same two locks as the credits route: isAdmin() here for a clean answer,
 * is_admin() again inside admin_ai_credit_record() (supabase/078) because
 * that is the check that actually holds.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  kind?: "topup" | "set";
  amount?: number | string;
  note?: string;
  /** YYYY-MM-DD from the form; today when left out. */
  date?: string;
  provider?: string;
};

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const kind = body.kind === "set" ? "set" : body.kind === "topup" ? "topup" : null;
  const amount = Number(String(body.amount ?? "").replace(/[^0-9.]/g, ""));
  if (!kind) return NextResponse.json({ error: "Choose top-up or set balance." }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) {
    return NextResponse.json({ error: "Enter an amount in US dollars, like 5 or 3.90." }, { status: 400 });
  }
  if (kind === "topup" && amount <= 0) {
    return NextResponse.json({ error: "A top-up must be more than zero." }, { status: 400 });
  }

  /* The date the admin typed, taken as midday in Singapore so it lands on
     the right day whichever side of midnight the server is on. */
  let at: string | null = null;
  if (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) at = `${body.date}T12:00:00+08:00`;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_ai_credit_record", {
    p_provider: (body.provider ?? "").trim() || null,
    p_kind: kind,
    p_amount: amount,
    p_note: (body.note ?? "").trim() || null,
    p_at: at ?? new Date().toISOString(),
  });

  if (error) {
    if (/not_admin/.test(error.message)) return NextResponse.json({ error: "That account is not an administrator." }, { status: 403 });
    if (/admin_ai_credit_record/.test(error.message) && /does not exist|not find/.test(error.message)) {
      return NextResponse.json({ error: "Run supabase/078_ai_credit_meter.sql first." }, { status: 500 });
    }
    return NextResponse.json({ error: "Could not save that. Details are in the server logs." }, { status: 500 });
  }
  return NextResponse.json({ meter: data });
}
