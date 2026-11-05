import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { signAccount } from "@/lib/sign/account";
import { SAMPLE_DRAFT } from "@/lib/sign/draft-sample";

/**
 * GET /api/fd-sign/drafts — my saved FD AI drafts, to send one for signing (0190).
 * Read with the person's own session, so row-level security only returns their drafts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await signAccount();
  if (!me) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ drafts: [{ id: SAMPLE_DRAFT.id, title: SAMPLE_DRAFT.title, updatedAt: SAMPLE_DRAFT.updated_at, gaps: 1 }] });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drafts")
    .select("id, title, output, updated_at")
    .eq("user_id", me.id)
    .not("output", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[fd-sign] drafts:", error.message);
    return NextResponse.json({ error: "Could not load your drafts." }, { status: 500 });
  }
  const rows = (data ?? []) as Array<{ id: string; title: string | null; output: string | null; updated_at: string }>;
  return NextResponse.json({
    drafts: rows
      .filter((r) => (r.output ?? "").trim().length > 200)
      .map((r) => ({ id: r.id, title: r.title || "Untitled draft", updatedAt: r.updated_at, gaps: ((r.output ?? "").split("DRAFTER")[0].match(/\[●\]|\[\[[^\]]+\]\]/g) ?? []).length })),
  });
}
