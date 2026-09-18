import { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { tidyTypedName } from "@/lib/draft-name";

export const runtime = "nodejs";

/** Update a saved draft: the edited text, the answers, and draft/final status. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Saving needs Supabase. See SETUP_SUPABASE.md." },
      { status: 501 },
    );
  }

  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await ctx.params;

  let body: {
    output?: string;
    outputHtml?: string;
    answers?: Record<string, string>;
    status?: string;
    title?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  /* ── ONLY WRITE WHAT WAS SENT ─────────────────────────────────────────────
     This used to be `output: body.output ?? ""` and `answers: body.answers ?? {}`,
     which meant a request carrying just one of them silently BLANKED the other.
     Saving an edited document would have wiped the answers that produced it —
     and with them the ability to say how the draft was arrived at. A partial
     update must touch only the fields it names. */
  const patch: Record<string, unknown> = {};
  if (typeof body.output === "string") patch.output = body.output;
  if (typeof body.outputHtml === "string") patch.outputHtml = body.outputHtml;
  if (body.answers && typeof body.answers === "object") patch.answers = body.answers;
  if (body.status === "final" || body.status === "draft") patch.status = body.status;

  /* Renaming. An empty name is not a name, so it is refused rather than stored:
     a person who clears the box and clicks away keeps the name they had, which
     is better than being handed "Untitled draft" for their trouble. */
  if (typeof body.title === "string") {
    const name = tidyTypedName(body.title);
    if (name) patch.title = name;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to save." }, { status: 400 });
  }

  // Column name differs from the JSON field; keep the mapping in one place.
  if ("outputHtml" in patch) {
    patch.output_html = patch.outputHtml;
    delete patch.outputHtml;
  }

  const status = (patch.status as string) ?? "draft";

  const supabase = await createClient();
  // No .eq("user_id", …) needed: row-level security already restricts this to
  // the caller's own rows. Belt as well as braces would be harmless, but the
  // point of RLS is that the database refuses rather than the app remembering.
  const { error } = await supabase.from("drafts").update(patch).eq("id", id);

  if (error) {
    console.error("[/api/drafts] update failed:", error.message);
    return Response.json({ error: "Could not save this draft." }, { status: 500 });
  }

  return Response.json({ ok: true, status });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Not available." }, { status: 501 });
  }
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { error } = await supabase.from("drafts").delete().eq("id", id);
  if (error) return Response.json({ error: "Could not delete." }, { status: 500 });
  return Response.json({ ok: true });
}
