import { NextRequest, NextResponse } from "next/server";
import { TRUST_DAYS, cookieName, verifyHolderCode } from "@/lib/esop/holder";
import { body, fail, store, who } from "../common";

/** POST /api/my-options/verify { token, code } — check the code; this browser is then trusted for 30 days (124). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { token, code } = await body(req);
    const { linkId, secret } = await verifyHolderCode(store(), String(token ?? ""), String(code ?? ""), who(req));
    const res = NextResponse.json({ ok: true });
    res.cookies.set(cookieName(linkId), secret, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: TRUST_DAYS * 86400 });
    return res;
  } catch (e) {
    return fail(e);
  }
}
