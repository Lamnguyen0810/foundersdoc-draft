/**
 * One source: review it, approve it, move it, delete it.
 *
 * The status machine is the design's, with the one honest simplification that
 * "processing" is not a state a source sits in — text is extracted on upload,
 * so approval goes straight to ready:
 *
 *   needs_review ──review (privacy judged)──▶ reviewed ──approve──▶ ready
 *        ▲                                          │
 *        └────── review says "needs redaction" ◀────┘
 *
 * The database enforces the rule that matters — ready requires a privacy
 * judgement of clear or redacted, and the permitted box — so this route
 * cannot be talked into skipping a step.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body =
  | { action: "review"; privacy: "clear" | "redacted" | "needs_redaction"; note?: string }
  | { action: "approve" }
  | { action: "move"; folderId: string | null }
  | { action: "permit"; permitted: boolean };

function explain(message: string): string {
  if (/ai_sources_ready_requires_review/.test(message)) {
    return "A source can only be made ready after its privacy has been reviewed as clear or redacted, and it has been marked as permitted for AI use.";
  }
  if (/ai_sources/.test(message) && /does not exist/.test(message)) {
    return "The library tables are missing — run supabase/014_ai_library.sql.";
  }
  return "Could not save the change.";
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.action) return NextResponse.json({ error: "No action." }, { status: 400 });

  const supabase = await createClient();
  const user = await getUser();
  const now = new Date().toISOString();

  let patch: Record<string, unknown>;
  switch (body.action) {
    case "review": {
      const privacy = body.privacy;
      if (!["clear", "redacted", "needs_redaction"].includes(privacy)) {
        return NextResponse.json({ error: "Choose a privacy outcome." }, { status: 400 });
      }
      patch = {
        privacy,
        note: typeof body.note === "string" ? body.note.slice(0, 2000) || null : undefined,
        status: privacy === "needs_redaction" ? "needs_review" : "reviewed",
        reviewed_by: user?.id ?? null,
        reviewed_at: now,
      };
      break;
    }
    case "approve":
      patch = { status: "ready", approved_by: user?.id ?? null, approved_at: now };
      break;
    case "move":
      patch = { folder_id: body.folderId || null };
      break;
    case "permit":
      patch = { permitted: Boolean(body.permitted) };
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ai_sources")
    .update(patch)
    .eq("id", id)
    .select("id,status,privacy,permitted,folder_id,reviewed_at,approved_at")
    .maybeSingle();

  if (error) {
    console.error("[ai-sources] update failed:", error.message);
    return NextResponse.json({ error: explain(error.message) }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: "No such source." }, { status: 404 });
  return NextResponse.json({ ok: true, source: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { error, count } = await supabase.from("ai_sources").delete({ count: "exact" }).eq("id", id);
  if (error) return NextResponse.json({ error: explain(error.message) }, { status: 400 });
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
