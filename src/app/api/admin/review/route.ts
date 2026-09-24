/**
 * The review queue: term sheets the playbook held or stopped, for a lawyer
 * to release. Admin only — the RPCs check is_admin() themselves, and the
 * route checks it first so a non-admin gets a plain 404.
 */

import { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, isAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseConfigured() || !(await isAdmin())) return Response.json({ error: "Not found." }, { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_queue");
  if (error) {
    const missing = /review_queue|does not exist/i.test(error.message);
    return Response.json({ error: missing ? "Run supabase/048_term_sheet.sql first." : error.message, missing }, { status: missing ? 200 : 500 });
  }
  return Response.json({ queue: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured() || !(await isAdmin())) return Response.json({ error: "Not found." }, { status: 404 });
  let body: { id?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return Response.json({ error: "Which draft?" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.rpc("release_draft", { p_id: body.id, p_note: (body.note ?? "").slice(0, 1000) || null });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
