import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { canResetSimulation } from "@/lib/esop/sim-reset";
import { postToSlack } from "@/lib/sign/slack";

/**
 * POST /api/esop/reset  { "company": "hitpay", "ref": "B8-T2", "dry": true }
 *
 * The dashboard's "Reset simulation" button (SQL 116). Rachel and Lam only
 * (lib/esop/sim-reset.ts), and only for an approval made while simulation was
 * on. dry: true only counts what would go (for the confirm box); without it
 * the vesting is put back to "not approved": approval, certificate numbers,
 * Slack thread link, FD Sign requests and filed certificates are removed;
 * holders and their details stay.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResetResult {
  ref: string;
  dry: boolean;
  certificate_numbers: number[];
  numbers_restored: boolean;
  next_certificate_no: number;
  documents: number;
  paths: string[];
  signing_requests: number;
  slack_ts: string | null;
  simulation_to: string;
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured() || !isAdminClientConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!canResetSimulation(user.email)) return NextResponse.json({ error: "Only Rachel can reset the simulation." }, { status: 403 });

  let body: { company?: unknown; ref?: unknown; dry?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const slug = String(body.company ?? "").toLowerCase();
  const ref = String(body.ref ?? "").toUpperCase();
  const dry = body.dry === true;
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !/^B\d{1,3}-T\d{1,2}$/.test(ref)) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  /* must be able to open this company's dashboard with their own session (row-level security) */
  const supabase = await createClient();
  const { data: company } = await supabase.from("esop_companies").select("id").eq("slug", slug).maybeSingle();
  if (!company) return NextResponse.json({ error: "No access to this dashboard." }, { status: 403 });

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("esop_reset_simulation", { p_slug: slug, p_ref: ref, p_dry: dry, p_by: user.email ?? null });
  if (error) {
    const m = error.message ?? "";
    if (/simulation off/.test(m)) return NextResponse.json({ error: "Simulation is off, so nothing can be reset." }, { status: 409 });
    if (/not a simulation/.test(m)) return NextResponse.json({ error: `${ref} was approved for real, so it can't be reset.` }, { status: 409 });
    if (/not approved/.test(m)) return NextResponse.json({ error: `${ref} isn't approved, so there is nothing to reset.` }, { status: 404 });
    if (/bad ref|no company/.test(m)) return NextResponse.json({ error: "That vesting does not exist." }, { status: 400 });
    if (/esop_reset_simulation/.test(m)) return NextResponse.json({ error: "Run supabase/116_esop_simulation_reset.sql first." }, { status: 503 });
    console.error("[esop reset] failed:", m);
    return NextResponse.json({ error: "Could not reset." }, { status: 500 });
  }
  const out = data as ResetResult;
  if (dry) return NextResponse.json({ ok: true, ...out, paths: undefined, slack_ts: undefined });

  /* the filed PDFs themselves */
  if (out.paths?.length) {
    const rm = await db.storage.from("esop-docs").remove(out.paths);
    if (rm.error) console.error("[esop reset] could not remove files:", rm.error.message);
  }
  const who = (user.email ?? "").split("@")[0];
  await postToSlack(
    `🔄 Simulation reset by ${who}: ready to approve again` +
      (out.certificate_numbers.length ? ` · certificate numbers ${range(out.certificate_numbers)} freed, next No. ${out.next_certificate_no}` : ""),
    ref,
    out.slack_ts,
    true,
  );
  return NextResponse.json({ ok: true, ...out, paths: undefined, slack_ts: undefined });
}

function range(n: number[]) {
  return n.length > 1 ? `${n[0]}–${n[n.length - 1]}` : String(n[0]);
}
