import { NextRequest, NextResponse } from "next/server";
import { sendHolderCode } from "@/lib/esop/holder";
import { body, fail, store, who } from "../common";

/** POST /api/my-options/code { token } — email the holder a 6-digit code (124). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { token } = await body(req);
    return NextResponse.json({ ok: true, ...(await sendHolderCode(store(), String(token ?? ""), who(req))) });
  } catch (e) {
    return fail(e);
  }
}
