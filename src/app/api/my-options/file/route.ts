import { NextRequest, NextResponse } from "next/server";
import { cookieName, holderFile } from "@/lib/esop/holder";
import { fail, store, who } from "../common";

/** GET /api/my-options/file?t=<link>&d=<document> — one of the holder's own files, through a 60-second link (124). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const t = req.nextUrl.searchParams.get("t") ?? "";
    const d = req.nextUrl.searchParams.get("d") ?? "";
    const url = await holderFile(store(), t, (id) => req.cookies.get(cookieName(id))?.value, d, who(req));
    return NextResponse.redirect(url, { status: 303 });
  } catch (e) {
    return fail(e);
  }
}
