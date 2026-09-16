/**
 * The table's bulk buttons: approve or delete the ticked sources.
 *
 * Approve is applied one source at a time on purpose, so that a source that
 * cannot be made ready (not yet reviewed) is reported by name rather than
 * failing the whole batch silently. Delete is one statement — there is
 * nothing to be selective about.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string").slice(0, 200) : [];
  if (ids.length === 0) return NextResponse.json({ error: "Nothing selected." }, { status: 400 });

  const supabase = await createClient();

  if (body.action === "delete") {
    const { error, count } = await supabase.from("ai_sources").delete({ count: "exact" }).in("id", ids);
    if (error) return NextResponse.json({ error: "Could not delete." }, { status: 400 });
    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  }

  if (body.action === "approve") {
    const user = await getUser();
    const now = new Date().toISOString();
    let approved = 0;
    const skipped: string[] = [];
    for (const id of ids) {
      const { data, error } = await supabase
        .from("ai_sources")
        .update({ status: "ready", approved_by: user?.id ?? null, approved_at: now })
        .eq("id", id)
        .eq("status", "reviewed")
        .select("id")
        .maybeSingle();
      if (error || !data) skipped.push(id);
      else approved++;
    }
    return NextResponse.json({ ok: true, approved, skipped });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
