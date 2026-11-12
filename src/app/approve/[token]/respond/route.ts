import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { hashApprovalToken, isApprovalToken } from "@/lib/esop/approval";
import { notifyResponse, type Response } from "@/lib/esop/respond";
import { who } from "@/lib/sign/http";

/**
 * POST /approve/<token>/respond: Modify or Cancel on the approval page (0217, SQL 129).
 * Form fields: kind = modify | cancel, note (required for modify).
 * Records the answer (the link then stops working), tells the right people
 * (lib/esop/respond.ts), then shows the thank-you page.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/approve/${isApprovalToken(token) ? token : "x"}${q}`, req.nextUrl.origin), 303);
  if (!isApprovalToken(token)) return back("");

  const form = await req.formData().catch(() => null);
  const kind = String(form?.get("kind") ?? "");
  const note = String(form?.get("note") ?? "").slice(0, 2000);
  if (kind !== "modify" && kind !== "cancel") return back("");
  if (kind === "modify" && !note.trim()) return back("?do=modify&e=note");
  if (!isSupabaseConfigured()) return back(`?done=${kind}`); // local preview
  if (!isAdminClientConfigured()) return back(`?do=${kind}&e=1`);

  const w = who(req);
  const { data, error } = await supabaseAdmin().rpc("esop_approval_link_respond", {
    p_token_hash: hashApprovalToken(token),
    p_kind: kind,
    p_note: note,
    p_ip: w.ip,
    p_ua: w.ua,
  });
  if (error) {
    const m = error.message ?? "";
    if (/already approved/.test(m)) return back("?done=1");
    if (/already responded/.test(m)) return back("");
    if (/expired link/.test(m)) return back("?e=expired");
    if (/invalid link/.test(m)) return back("");
    if (/note needed/.test(m)) return back("?do=modify&e=note");
    if (/esop_approval_link_respond/.test(m)) console.error("[approve] run supabase/129_esop_lock_in.sql");
    console.error("[approve] respond failed:", m);
    return back(`?do=${kind}&e=1`);
  }
  const out = await notifyResponse(data as Response, req.nextUrl.origin).catch((e) => {
    console.error("[approve] respond notify failed:", e);
    return null;
  });
  if (!out || (!out.emailed && !out.slack)) console.error("[approve] nobody was told about a", kind, "on", (data as Response)?.ref);
  return back(`?done=${kind}`);
}
