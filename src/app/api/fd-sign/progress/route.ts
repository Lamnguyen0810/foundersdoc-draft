import { NextRequest, NextResponse } from "next/server";
import { senderStep } from "@/lib/sign/slack";
import { ctx } from "../common";

/**
 * POST /api/fd-sign/progress  { "kind": "started" | "left", "step": 1-4 }   (0221)
 *
 * The send page tells Founders Doc when someone starts a signing request and, if they
 * leave before sending, at which step (Rachel, 12 Nov). Only the account's name and the
 * step go to Slack (FD_SIGN_SLACK_CHANNEL): never the title, the file or the signers.
 * "sent" is posted by the send route itself.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEPS = ["Document", "People", "Fields", "Review and send"];
/* one post per person and kind per minute, so a reload loop can't flood the channel */
const last = new Map<string, number>();

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  const { me } = c;
  const b = (await req.json().catch(() => ({}))) as { kind?: unknown; step?: unknown };
  const kind = b.kind === "started" || b.kind === "left" ? b.kind : null;
  const step = Number(b.step);
  if (!kind) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const key = `${me.id}:${kind}`;
  const now = Date.now();
  if ((last.get(key) ?? 0) > now - 60_000) return NextResponse.json({ ok: true, skipped: true });
  last.set(key, now);
  if (last.size > 5000) last.clear();
  const s = Number.isInteger(step) && step >= 1 && step <= STEPS.length ? step : 1;
  await senderStep(me.name, me.email, kind, { step: s, label: STEPS[s - 1] });
  return NextResponse.json({ ok: true });
}
