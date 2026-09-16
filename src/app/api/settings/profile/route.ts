/**
 * The person's own name on their profile. Email and role are not accepted
 * here — and since 018, the database refuses them from anyone but an
 * administrator whatever route they arrive by.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { full_name?: unknown };
  const fullName = typeof body.full_name === "string" ? body.full_name.trim().slice(0, 120) : "";
  if (!fullName) return NextResponse.json({ error: "Enter your name." }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Could not save your name." }, { status: 400 });
  return NextResponse.json({ ok: true, full_name: fullName });
}
