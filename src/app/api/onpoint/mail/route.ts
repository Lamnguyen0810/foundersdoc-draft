import { NextRequest, NextResponse } from "next/server";
import { siteUrl } from "@/lib/billing/stripe";
import { disconnect, mailboxStatus, makeConnectLink } from "@/lib/onpoint/mailbox";
import { errorJson, guard, OpError } from "@/lib/onpoint/server";

/**
 * The sending mailbox (0270).
 * GET                                       status (OnPoint administrators)
 * POST { action: "link", email }            → { url, expires } a 7-day connect link (Founders Doc only)
 * POST { action: "disconnect" }             forget the mailbox (Founders Doc only)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const m = await guard("admin");
    return NextResponse.json(await mailboxStatus(m.ws.id));
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const m = await guard("admin");
    if (!m.founder) throw new OpError("Only Founders Doc can change the sending mailbox.", 403);
    const b = (await req.json().catch(() => ({}))) as { action?: string; email?: string };
    if (b.action === "link") return NextResponse.json(makeConnectLink(m.ws.id, String(b.email ?? ""), siteUrl(req.nextUrl.origin)));
    if (b.action === "disconnect") {
      await disconnect(m.ws.id);
      return NextResponse.json({ ok: true });
    }
    throw new OpError("Unknown action.");
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
