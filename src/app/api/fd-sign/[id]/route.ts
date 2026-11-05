import { NextRequest, NextResponse } from "next/server";
import { remind, voidEnvelope } from "@/lib/sign/service";
import { docEvents, docRow } from "@/lib/sign/mine";
import { who } from "@/lib/sign/http";
import { ctx, fail, UUID } from "../common";

/**
 * GET  /api/fd-sign/<id> — one of my requests: people, progress, activity.
 * POST /api/fd-sign/<id> { action: "remind" | "cancel" | "move", folderId? }
 * Only the account that sent it; anything else answers "Not found".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function own(id: string) {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const o = await c.store.ownerOf(id);
  if (!o || o.owner_id !== c.me.id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return { ...c, folderId: o.folder_id };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const c = await own(id);
  if (c instanceof NextResponse) return c;
  try {
    const env = (await c.store.envelope(id))!;
    const signers = await c.store.signers(id);
    const [events, viewers, folders] = await Promise.all([docEvents(c.store, id, signers), c.store.viewers(id), c.store.folders(c.me.id)]);
    return NextResponse.json({
      doc: { ...docRow({ ...env, folder_id: c.folderId, signers }, c.me.email), message: env.message, sha256: env.original_sha256 },
      copies: viewers.map((v) => ({ email: v.email, sentAt: v.sent_at })),
      events,
      folders,
    });
  } catch (e) {
    return fail(e, "detail");
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const c = await own(id);
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; folderId?: unknown };
  try {
    if (body.action === "remind") {
      const r = await remind(c.store, c.me.id, id, req.nextUrl.origin, who(req));
      return NextResponse.json({ ok: true, to: r.name, emailed: r.emailed });
    }
    if (body.action === "cancel") {
      const ok = await voidEnvelope(c.store, id, who(req), c.me.email);
      if (!ok) return NextResponse.json({ error: "Only an open request can be cancelled." }, { status: 409 });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "move") {
      const folderId = body.folderId === null || body.folderId === "" ? null : String(body.folderId ?? "");
      if (folderId && !UUID.test(folderId)) return NextResponse.json({ error: "Bad folder." }, { status: 400 });
      await c.store.setFolder(c.me.id, id, folderId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof Error && e.message === "no folder") return NextResponse.json({ error: "That folder doesn't exist." }, { status: 400 });
    return fail(e, "action");
  }
}
