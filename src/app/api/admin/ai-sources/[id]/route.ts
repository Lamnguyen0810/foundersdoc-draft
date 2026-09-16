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
import { applyRedactions, scanPrivacy, type Redaction, type RedactionKind } from "@/lib/ai-library";

const KINDS: RedactionKind[] = ["uen", "nric", "email", "phone", "company", "name", "address", "custom"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body =
  | { action: "review"; privacy: "clear" | "redacted" | "needs_redaction"; note?: string }
  | { action: "approve" }
  | { action: "move"; folderId: string | null }
  | { action: "permit"; permitted: boolean }
  | { action: "redact"; items: Redaction[]; expectedLength: number };

function explain(message: string): string {
  if (/ai_sources_ready_requires_review/.test(message)) {
    return "A source can only be made ready after its privacy has been reviewed as clear or redacted, and it has been marked as permitted for AI use.";
  }
  if (/ai_sources/.test(message) && /does not exist/.test(message)) {
    return "The library tables are missing — run supabase/014_ai_library.sql.";
  }
  return "Could not save the change.";
}

/**
 * Read one source, text and all.
 *
 * The table deliberately lists sources WITHOUT their text — the content column
 * runs to tens of kilobytes a row and no column shows it. This is how the
 * viewer gets the words, one document at a time, only when somebody opens it.
 *
 * The text returned here is exactly the text Gemini is given, which is the
 * point: a reviewer deciding "clear" or "needs redaction" has to be looking at
 * what the model will look at.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_sources")
    .select("id,title,filename,content,bytes,privacy_flags")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: explain(error.message) }, { status: 400 });
  if (!data) return NextResponse.json({ error: "No such source." }, { status: 404 });
  return NextResponse.json({ ok: true, source: data });
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

  /* ── redaction ────────────────────────────────────────────────────────────
     The list of strings to black out comes from the viewer — what the
     detector proposed plus what the reviewer highlighted, minus what they
     un-marked. It is applied HERE, to the text as stored, with the same
     function the viewer used for its preview, so the preview and the result
     are the same by construction. The redacted text replaces the original;
     nothing keeps a copy. */
  if (body.action === "redact") {
    const items = Array.isArray(body.items)
      ? body.items
          .filter((r): r is Redaction => r && typeof r.text === "string" && KINDS.includes(r.kind))
          .map((r) => ({ text: r.text.trim().slice(0, 300), kind: r.kind }))
          .filter((r) => r.text.length >= 2)
          .slice(0, 500)
      : [];
    if (items.length === 0) return NextResponse.json({ error: "Nothing was marked for redaction." }, { status: 400 });

    const { data: row, error: readErr } = await supabase
      .from("ai_sources")
      .select("id,content,redaction_count")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: explain(readErr.message) }, { status: 400 });
    if (!row) return NextResponse.json({ error: "No such source." }, { status: 404 });

    /* The viewer says how long the text was when it was read. If somebody
       else changed the row in between, the strings may no longer line up;
       better to stop than to black out the wrong words. */
    const content = String(row.content ?? "");
    if (typeof body.expectedLength === "number" && body.expectedLength !== content.length) {
      return NextResponse.json({ error: "This document changed while you were reading it. Close it and open it again." }, { status: 409 });
    }

    const { text, count } = applyRedactions(content, items);
    if (count === 0) return NextResponse.json({ error: "None of the marked text was found in the document." }, { status: 400 });

    const { data, error } = await supabase
      .from("ai_sources")
      .update({
        content: text,
        bytes: Buffer.byteLength(text, "utf-8"),
        privacy: "redacted",
        privacy_flags: scanPrivacy(text),
        status: "reviewed",
        reviewed_by: user?.id ?? null,
        reviewed_at: now,
        redacted_at: now,
        redaction_count: Number(row.redaction_count ?? 0) + count,
      })
      .eq("id", id)
      .select("id,status,privacy,privacy_flags,permitted,folder_id,reviewed_at,approved_at,redacted_at,redaction_count,bytes")
      .maybeSingle();
    if (error) return NextResponse.json({ error: explain(error.message) }, { status: 400 });
    return NextResponse.json({ ok: true, source: data, replaced: count });
  }

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
