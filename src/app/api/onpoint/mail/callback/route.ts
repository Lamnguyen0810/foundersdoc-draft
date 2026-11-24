import { NextRequest, NextResponse } from "next/server";
import { siteUrl } from "@/lib/billing/stripe";
import { connect, readLink, readState } from "@/lib/onpoint/mailbox";
import { OpError } from "@/lib/onpoint/server";
import { teamNotice } from "@/lib/sign/slack";

/**
 * GET /api/onpoint/mail/callback (0270): Microsoft sends the client (or their admin) back here.
 * Signed-in client: the code is swapped for a token, kept encrypted, and the connect page says "Connected".
 * Admin approval: nothing is stored; the page tells them the client can now connect.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = siteUrl(req.nextUrl.origin);
  const q = req.nextUrl.searchParams;
  const state = readState(q.get("state"));
  const back = (t: string, extra: string) => {
    const res = NextResponse.redirect(`${origin}/onpoint/connect?t=${encodeURIComponent(t)}&${extra}`, 303);
    res.cookies.set("op_ms_n", "", { path: "/api/onpoint/mail", maxAge: 0 });
    return res;
  };
  if (!state) return NextResponse.redirect(`${origin}/onpoint/connect?err=link`, 303);
  const link = readLink(state.t);
  if (!link) return back(state.t, "err=link");

  const error = q.get("error");
  if (error) {
    const desc = (q.get("error_description") ?? "").slice(0, 300);
    const needsAdmin = /AADSTS(65001|90094|90095)|admin/i.test(desc) || error === "consent_required";
    return back(state.t, needsAdmin ? "err=admin" : error === "access_denied" ? "err=declined" : "err=other");
  }
  if (state.admin) return back(state.t, q.get("admin_consent")?.toLowerCase() === "true" ? "approved=1" : "err=other");

  /* the person who started the sign-in must be the one finishing it */
  if (!q.get("code") || req.cookies.get("op_ms_n")?.value !== state.n) return back(state.t, "err=expired");
  try {
    const { address } = await connect(link, q.get("code")!, origin);
    const channel = process.env.ONPOINT_SLACK_CHANNEL?.trim();
    if (channel) await teamNotice(`📨 OnPoint: the sending mailbox is connected (${address}). Reminders now go out from it.`, channel).catch(() => false);
    return back(state.t, "done=1");
  } catch (e) {
    if (e instanceof OpError && e.status === 403) return back(state.t, "err=wrong");
    console.error("[onpoint mail]", e);
    return back(state.t, "err=other");
  }
}
