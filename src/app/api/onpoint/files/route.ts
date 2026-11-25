import { NextRequest, NextResponse } from "next/server";
import { errorJson, guard, OpError } from "@/lib/onpoint/server";
import { fileLink, removeFile } from "@/lib/onpoint/files";

/**
 * OnPoint's file folder (0286).
 * GET ?id=…     opens the file (a private link that works for one minute)
 * DELETE ?id=…  removes the file from the folder (the invoice it became stays)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const m = await guard("view");
    return NextResponse.redirect(await fileLink(m, String(req.nextUrl.searchParams.get("id") ?? "")), 303);
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const m = await guard("edit");
    const id = String(req.nextUrl.searchParams.get("id") ?? "");
    if (!id) throw new OpError("Which file?");
    await removeFile(m, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
