import { NextResponse } from "next/server";
import { errorJson, guard, snapshot } from "@/lib/onpoint/server";

/** GET /api/onpoint/data: everything the app shows, for the signed-in OnPoint member (0267). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await snapshot(await guard("view")));
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
