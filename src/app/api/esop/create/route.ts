import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";

/**
 * POST /api/esop/create  { "name": "Acme Pte. Ltd." }
 *
 * Self sign-up (123): a signed-in FD AI user creates an ESOP dashboard for their
 * company and becomes its Admin and approver. esop_create_company() checks the
 * name, makes a unique address (/esop/acme-pte-ltd) and allows 3 per person.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, slug: "acme", preview: true });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = String(body.name ?? "").trim();
  if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "Type your company's name (2 to 80 characters)." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("esop_create_company", { p_name: name });
  if (error) {
    const m = error.message ?? "";
    if (/limit/.test(m)) return NextResponse.json({ error: "You can create up to 3 dashboards. Ask Founders Doc if you need more." }, { status: 409 });
    if (/bad name/.test(m)) return NextResponse.json({ error: "Type your company's name (2 to 80 characters)." }, { status: 400 });
    if (/esop_create_company|does not exist/.test(m)) return NextResponse.json({ error: "Not ready yet: supabase/123_esop_settings.sql must be run first." }, { status: 503 });
    console.error("[esop create] failed:", m);
    return NextResponse.json({ error: "Could not create the dashboard." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, slug: String(data) });
}
