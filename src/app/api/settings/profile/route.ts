/**
 * The person's own name on their profile. Email and role are not accepted
 * here — and since 018, the database refuses them from anyone but an
 * administrator whatever route they arrive by.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    full_name?: unknown;
    avatar_url?: unknown;
  };

  const patch: Record<string, unknown> = {};

  if (body.full_name !== undefined) {
    const fullName = typeof body.full_name === "string" ? body.full_name.trim().slice(0, 120) : "";
    if (!fullName) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    patch.full_name = fullName;
  }

  /* ── WHERE A PHOTO IS ALLOWED TO COME FROM ────────────────────────────────
     The browser uploads straight to storage, so by the time this route sees
     anything the file is already there and all that is left is to record where.
     That makes this field an open door unless it is checked: without the test
     below, a person could set their photo to any URL on the internet — an image
     that changes later, or a one-pixel tracker that reports to somebody else
     every time this page is opened beside their name.

     So only two values are accepted: null, and a public URL inside this
     project's avatars bucket, in the folder named after this user. The storage
     policy in 033 enforces the same thing from the other end. */
  if (body.avatar_url !== undefined) {
    if (body.avatar_url === null || body.avatar_url === "") {
      patch.avatar_url = null;
    } else if (typeof body.avatar_url === "string") {
      const base = (supabaseUrl() ?? "").replace(/\/+$/, "");
      const mine = `${base}/storage/v1/object/public/avatars/${user.id}/`;
      if (!base || !body.avatar_url.startsWith(mine)) {
        return NextResponse.json({ error: "That is not a photo we stored." }, { status: 400 });
      }
      patch.avatar_url = body.avatar_url.slice(0, 500);
    } else {
      return NextResponse.json({ error: "That is not a photo we stored." }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) {
    const missing = /avatar_url/.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "Photos need supabase/033_photo_and_closing_an_account.sql to be run first."
          : "Could not save your profile.",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({
    ok: true,
    full_name: patch.full_name ?? undefined,
    avatar_url: patch.avatar_url ?? null,
  });
}
