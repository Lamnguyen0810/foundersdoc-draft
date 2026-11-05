import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { signAccount } from "@/lib/sign/account";
import { draftPdf } from "@/lib/sign/draft-pdf";
import { signFonts } from "@/lib/sign/certificate";
import { SAMPLE_DRAFT } from "@/lib/sign/draft-sample";

/**
 * GET /api/fd-sign/drafts/<id> — one of my FD AI drafts as a PDF to sign (0190).
 * The PDF in the body; in the "x-fds-draft" header (base64url JSON): title, pages,
 * where each signature block's boxes go, and how many gaps are still unfilled.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const me = await signAccount();
  if (!me) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  let draft: { title: string | null; output: string | null } | null = null;
  if (!isSupabaseConfigured()) draft = id === SAMPLE_DRAFT.id ? SAMPLE_DRAFT : null;
  else {
    const supabase = await createClient();
    const { data } = await supabase.from("drafts").select("title, output").eq("id", id).eq("user_id", me.id).maybeSingle();
    draft = (data as typeof draft) ?? null;
  }
  if (!draft?.output?.trim()) return NextResponse.json({ error: "That draft wasn't found, or it's empty." }, { status: 404 });
  try {
    const title = (draft.title || "Document").slice(0, 200);
    const fonts = await signFonts(req.nextUrl.origin).catch(() => null);
    const out = await draftPdf({ title, text: draft.output, fonts });
    const meta = Buffer.from(JSON.stringify({ title, pages: out.pages, blocks: out.blocks, blanks: out.blanks, notes: out.notes })).toString("base64url");
    return new NextResponse(Buffer.from(out.pdf), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "x-fds-draft": meta },
    });
  } catch (e) {
    console.error("[fd-sign] draft pdf failed:", e);
    return NextResponse.json({ error: "Could not turn this draft into a PDF." }, { status: 500 });
  }
}
