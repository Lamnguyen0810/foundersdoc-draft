import { NextRequest, NextResponse } from "next/server";
import { addFeedback, errorJson, guard, markFeedback } from "@/lib/onpoint/server";

/**
 * OnPoint's feedback, page by page, for the first 3 months (0291).
 * POST { page, message }   any OnPoint member (Founders Doc hears about it on Slack, if set up)
 * PATCH { id, done }       Founders Doc marks a comment done
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const m = await guard("view");
    const b = (await req.json().catch(() => ({}))) as { page?: unknown; message?: unknown };
    return NextResponse.json({ ok: true, ...(await addFeedback(m, String(b.page ?? ""), String(b.message ?? ""))) });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const m = await guard("admin");
    const b = (await req.json().catch(() => ({}))) as { id?: unknown; done?: unknown };
    await markFeedback(m, String(b.id ?? ""), b.done === true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
