import { NextRequest, NextResponse } from "next/server";
import { orderOf } from "@/lib/sign/service";
import { ctx, fail, UUID } from "../../common";

/**
 * GET /api/fd-sign/<id>/edit (0310): a saved draft, to open it again in the wizard ("Edit draft").
 * Everything it was saved with: title, message, folder, people (and what each one does), boxes,
 * copies, key controllers, supplemental document lines and daily reminders. The PDF itself comes
 * from /api/sign/file?e=<id> (the owner may read it). Only the account that saved it; drafts only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const o = await c.store.ownerOf(id);
    const env = o?.owner_id === c.me.id ? await c.store.envelope(id) : null;
    if (!env) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (env.status !== "draft") return NextResponse.json({ error: "Only a draft can be edited. This one has been sent." }, { status: 409 });
    const signers = (await c.store.signers(id)).sort((a, b) => a.position - b.position);
    const [fields, viewers, controllers, events, order, phones] = await Promise.all([
      c.store.fields(id),
      c.store.viewers(id),
      c.store.controllers(id).catch(() => [] as string[]),
      c.store.events(id),
      orderOf(c.store, id, signers.length),
      Promise.all(signers.map((s) => c.store.signerPhone(s.id).catch(() => ({ phone: null, channel: "email" as const })))),
    ]);
    return NextResponse.json({
      title: env.title,
      fileName: env.file_name,
      message: env.message,
      folderId: o?.folder_id ?? null,
      signers: signers.map((s, i) => ({ name: s.name, email: s.email, role: s.role, channel: phones[i]!.channel, phone: phones[i]!.phone })),
      fields: fields.map((f) => ({ position: f.position, kind: f.kind, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, label: f.label ?? undefined, required: f.required, value: f.value ?? undefined })),
      cc: viewers.map((v) => v.email),
      controllers,
      supplements: events.filter((e) => e.event === "supplement").map((e) => e.detail ?? "").filter(Boolean),
      order,
      remindDaily: events.some((e) => e.event === "remind_daily"),
    });
  } catch (e) {
    return fail(e, "edit draft");
  }
}
