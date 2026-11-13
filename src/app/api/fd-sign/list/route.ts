import { NextResponse } from "next/server";
import { docRow } from "@/lib/sign/mine";
import { allowance } from "@/lib/sign/allowance";
import { ctx, fail } from "../common";

/** GET /api/fd-sign/list — My documents: own requests, folders, and other people's requests waiting for me. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  const { me, store } = c;
  try {
    const [own, folders, waiting, allow] = await Promise.all([store.mine(me.id, 500), store.folders(me.id), store.waitingFor(me.email), allowance(me, store)]);
    const rows = own.map((e) => docRow(e, me.email));
    const mineIds = new Set(rows.map((r) => r.id));
    return NextResponse.json({
      me: { name: me.name, email: me.email },
      folders: folders.map((f) => ({ ...f, count: rows.filter((r) => r.folderId === f.id).length })),
      docs: rows,
      /* someone else's request where it's my turn (own requests show as "waiting_me" in docs) */
      forMe: waiting.filter((w) => !mineIds.has(w.envelope_id)).map((w) => ({ signerId: w.signer_id, id: w.envelope_id, title: w.title, from: w.from_name || w.from_email, at: w.invited_at, pages: w.page_count })),
      /* 0223: the day's Beta limit, or the month's plan (FD_SIGN_PRICING=on) */
      today: allow.used,
      limit: allow.limit,
      plan: { live: allow.live, label: allow.label, per: allow.per, premium: allow.premium, endsAt: allow.endsAt ?? null },
    });
  } catch (e) {
    return fail(e, "list");
  }
}
