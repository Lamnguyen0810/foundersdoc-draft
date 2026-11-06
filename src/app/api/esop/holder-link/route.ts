import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { DEMO_HOLDERS } from "@/app/esop/demo";
import { HolderError, holderStore, issueLink } from "@/lib/esop/holder";
import { fail, who } from "../../my-options/common";

/**
 * POST /api/esop/holder-link { company, holderId } or { company, all: true }
 *
 * The dashboard's "Send their link" / "Email every holder their link" (124). Only a
 * company Admin or Founders Doc (esop_can_manage, 123), and only while Holder access
 * is on. Each holder gets their own private link by email.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const b = ((await req.json().catch(() => ({}))) ?? {}) as { company?: unknown; holderId?: unknown; all?: unknown };
    const slug = String(b.company ?? "").toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new HolderError("Bad request.", 400);
    const store = holderStore();
    if (!store) throw new HolderError("Not available: SUPABASE_SECRET_KEY is not set.", 503);

    let by = "Preview";
    let ids: string[];
    if (!isSupabaseConfigured()) {
      ids = b.all ? DEMO_HOLDERS.filter((h) => h.status === "Active" && h.email).map((h) => h.id) : [String(b.holderId ?? "")];
    } else {
      const user = await getUser();
      if (!user) throw new HolderError("Please sign in.", 401);
      by = user.email ?? "admin";
      const supabase = await createClient();
      const c = await supabase.from("esop_companies").select("id").eq("slug", slug).maybeSingle();
      const companyId = (c.data as { id?: string } | null)?.id;
      if (!companyId) throw new HolderError("Not found.", 404);
      const can = await supabase.rpc("esop_can_manage", { p_company: companyId });
      if (can.error || can.data !== true) throw new HolderError("Only an Admin can send holders their links.", 403);
      if (b.all) {
        const hs = await supabase.from("esop_holders").select("id, email").eq("company_id", companyId).eq("status", "Active");
        ids = ((hs.data ?? []) as Array<{ id: string; email: string | null }>).filter((h) => (h.email ?? "").includes("@")).map((h) => h.id);
      } else {
        const id = String(b.holderId ?? "");
        const h = await supabase.from("esop_holders").select("id").eq("id", id).eq("company_id", companyId).maybeSingle();
        if (!h.data) throw new HolderError("Holder not found.", 404);
        ids = [id];
      }
    }
    if (ids.length > 300) throw new HolderError("Too many holders at once. Please contact Founders Doc.", 400);
    let sent = 0;
    const failed: string[] = [];
    let devLink: string | undefined;
    let to: string | undefined;
    for (const id of ids) {
      try {
        const out = await issueLink(store, id, req.nextUrl.origin, by, who(req));
        sent++;
        devLink ??= out.devLink;
        to ??= out.to;
      } catch (e) {
        if (!b.all) throw e;
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
    return NextResponse.json({ ok: true, sent, failed: failed.length, to, devLink });
  } catch (e) {
    return fail(e);
  }
}
