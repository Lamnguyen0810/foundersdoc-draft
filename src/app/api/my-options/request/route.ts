import { NextRequest, NextResponse } from "next/server";
import { requestLink } from "@/lib/esop/holder";
import { body, fail, store, who } from "../common";

/**
 * POST /api/my-options/request { email } — "Send me my link" (124). Emails a fresh
 * link to that address only if it is on a holder's row at a company with holder
 * access, and always answers the same, so nobody can find out who holds options.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email } = await body(req);
    const out = await requestLink(store(), String(email ?? ""), req.nextUrl.origin, who(req));
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return fail(e);
  }
}
