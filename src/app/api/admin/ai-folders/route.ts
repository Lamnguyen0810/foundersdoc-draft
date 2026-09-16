/** Folders in the AI source library: make one, remove one. */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Give the folder a name." }, { status: 400 });

  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase
    .from("ai_folders")
    .insert({ name, created_by: user?.id ?? null })
    .select("id,name")
    .single();

  if (error) {
    return NextResponse.json(
      { error: /unique|duplicate/i.test(error.message) ? "A folder with that name exists." : "Could not create the folder." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, folder: data });
}

export async function DELETE(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which folder?" }, { status: 400 });

  /* Documents in it are not deleted — folder_id is "on delete set null", so
     they become unfiled. Deleting a folder must never delete evidence. */
  const supabase = await createClient();
  const { error } = await supabase.from("ai_folders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not delete the folder." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
