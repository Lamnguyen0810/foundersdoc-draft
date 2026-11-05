import { NextResponse } from "next/server";
import { docRow } from "@/lib/sign/mine";
import { dailyLimit, startOfDaySgt } from "@/lib/sign/account";
import { ctx, fail } from "../common";

/** GET /api/fd-sign/list — My documents: own requests, folders, and other people's requests waiting for me. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  const { me, store } = c;
  try {
    const [own, folders, waiting, today] = await Promise.all([store.mine(me.id, 500), store.folders(me.id), store.waitingFor(me.email), store.sentSince(me.id, startOfDaySgt())]);
    const rows = own.map((e) => docRow(e, me.email));
    const mineIds = new Set(rows.map((r) => r.id));
    return NextResponse.json({
      me: { name: me.name, email: me.email },
      folders: folders.map((f) => ({ ...f, count: rows.filter((r) => r.folderId === f.id).length })),
      docs: rows,
      /* someone else's request where it's my turn (own requests show as "waiting_me" in docs) */
      forMe: waiting.filter((w) => !mineIds.has(w.envelope_id)).map((w) => ({ signerId: w.signer_id, id: w.envelope_id, title: w.title, from: w.from_name || w.from_email, at: w.invited_at, pages: w.page_count })),
      today,
      limit: dailyLimit(),
    });
  } catch (e) {
    return fail(e, "list");
  }
}
