import { NextRequest, NextResponse } from "next/server";
import { FOLDER_COLOURS } from "@/lib/sign/account";
import { ctx, fail, UUID } from "../common";

/** POST /api/fd-sign/folders { name } — a new folder · DELETE { id } — remove a folder (its documents stay, in no folder). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Give the folder a name." }, { status: 400 });
  try {
    const existing = await c.store.folders(c.me.id);
    if (existing.length >= 50) return NextResponse.json({ error: "You can have up to 50 folders." }, { status: 400 });
    const id = await c.store.addFolder(c.me.id, name, FOLDER_COLOURS[existing.length % FOLDER_COLOURS.length]);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof Error && e.message === "duplicate folder") return NextResponse.json({ error: "You already have a folder with that name." }, { status: 409 });
    return fail(e, "add folder");
  }
}

export async function DELETE(req: NextRequest) {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = String(body.id ?? "");
  if (!UUID.test(id)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  try {
    await c.store.deleteFolder(c.me.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "delete folder");
  }
}
