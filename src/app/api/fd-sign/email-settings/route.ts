import { NextRequest, NextResponse } from "next/server";
import { digestFrequency, isFrequency, setDigestFrequency } from "@/lib/sign/digest";
import { allowance } from "@/lib/sign/allowance";
import { ctx, fail } from "../common";

/** GET / POST /api/fd-sign/email-settings  { frequency: "daily" | "weekly" | "off" }  (0236): the sender's status emails. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  try {
    const [frequency, a] = await Promise.all([digestFrequency(c.me.id), allowance(c.me, c.store)]);
    return NextResponse.json({ frequency, premium: a.premium });
  } catch (e) {
    return fail(e, "email settings");
  }
}

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  const b = (await req.json().catch(() => ({}))) as { frequency?: unknown };
  if (!isFrequency(b.frequency)) return NextResponse.json({ error: "Choose daily, weekly or off." }, { status: 400 });
  try {
    await setDigestFrequency(c.me.id, b.frequency);
    return NextResponse.json({ ok: true, frequency: b.frequency });
  } catch (e) {
    return fail(e, "email settings");
  }
}
