/**
 * PATCH /api/termsheet/[id] — the AI's fields, confirmed or edited by the
 * user, and the letter assembled again around them. Free: no model call.
 */

import { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { cleanAi, reassemble } from "@/lib/termsheet/server";
import { DOCUMENT_TITLES } from "@/lib/termsheet/data/master";
import type { Flag } from "@/lib/termsheet/types";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Saving needs Supabase." }, { status: 501 });
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await ctx.params;
  let body: { ai?: unknown; documentTitle?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }
  const ai = cleanAi(body.ai);
  if (!ai) return Response.json({ error: "Nothing to save." }, { status: 400 });
  const documentTitle =
    typeof body.documentTitle === "string" && DOCUMENT_TITLES.includes(body.documentTitle.toUpperCase())
      ? body.documentTitle.toUpperCase()
      : undefined;

  const supabase = await createClient();
  /* RLS: another person's draft is simply not found. */
  const { data } = await supabase
    .from("drafts")
    .select("id,answers,status,flags,title,doc_types(slug)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as unknown as {
    id: string; answers: Record<string, unknown>; status: string; flags: Flag[] | null; title: string | null;
    doc_types: { slug: string } | { slug: string }[] | null;
  } | null;
  const slug = Array.isArray(row?.doc_types) ? row?.doc_types[0]?.slug : row?.doc_types?.slug;
  if (!row || slug !== "term") return Response.json({ error: "Not found." }, { status: 404 });

  const out = await reassemble(row, ai, documentTitle);
  if (!out) return Response.json({ error: "Could not save the changes." }, { status: 500 });
  return Response.json({ ok: true, ...out });
}
