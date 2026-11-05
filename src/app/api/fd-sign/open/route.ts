import { NextRequest, NextResponse } from "next/server";
import { openForMe } from "@/lib/sign/service";
import { who } from "@/lib/sign/http";
import { ctx, fail, UUID } from "../common";

/** POST /api/fd-sign/open { signerId } — "Sign now": my own request opens straight away; someone else's is emailed to me again (lib/sign/service.ts openForMe). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { signerId?: unknown };
  const signerId = String(body.signerId ?? "");
  if (!UUID.test(signerId)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await openForMe(c.store, c.me, signerId, req.nextUrl.origin, who(req))) });
  } catch (e) {
    return fail(e, "open");
  }
}
