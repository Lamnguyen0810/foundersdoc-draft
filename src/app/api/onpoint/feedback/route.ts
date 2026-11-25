import { NextRequest, NextResponse } from "next/server";
import { addFeedback, deleteFeedback, editFeedback, errorJson, feedbackShot, guard, markFeedback, OpError } from "@/lib/onpoint/server";

/**
 * OnPoint's feedback, page by page, for the first 3 months (0291).
 * POST { page, message, kind } or multipart (page, kind, message, shot): any OnPoint member; 0292: kind and an
 *   optional screenshot (Founders Doc hears about it on Slack, if set up)
 * GET ?shot=<id>           opens a comment's screenshot (a one-minute private link)
 * PATCH { id, done }       Founders Doc marks a comment done
 * PATCH { id, message, kind }  0293: the writer changes their comment while it is not done
 * DELETE ?id=…             0293: the writer deletes their comment while it is not done
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const m = await guard("view");
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const fd = await req.formData();
      const f = fd.get("shot");
      const shot = f instanceof File && f.size ? { buf: Buffer.from(await f.arrayBuffer()), type: f.type } : null;
      return NextResponse.json({ ok: true, ...(await addFeedback(m, String(fd.get("page") ?? ""), String(fd.get("message") ?? ""), String(fd.get("kind") ?? "change"), shot)) });
    }
    const b = (await req.json().catch(() => ({}))) as { page?: unknown; message?: unknown; kind?: unknown };
    return NextResponse.json({ ok: true, ...(await addFeedback(m, String(b.page ?? ""), String(b.message ?? ""), String(b.kind ?? "change"))) });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}

export async function GET(req: NextRequest) {
  try {
    const m = await guard("view");
    return NextResponse.redirect(await feedbackShot(m, String(req.nextUrl.searchParams.get("shot") ?? "")), 303);
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as { id?: unknown; done?: unknown; message?: unknown; kind?: unknown };
    if (typeof b.message === "string") {
      await editFeedback(await guard("view"), String(b.id ?? ""), b.message, typeof b.kind === "string" ? b.kind : undefined);
      return NextResponse.json({ ok: true });
    }
    await markFeedback(await guard("admin"), String(b.id ?? ""), b.done === true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const m = await guard("view");
    const id = String(req.nextUrl.searchParams.get("id") ?? "");
    if (!id) throw new OpError("Which comment?");
    await deleteFeedback(m, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
