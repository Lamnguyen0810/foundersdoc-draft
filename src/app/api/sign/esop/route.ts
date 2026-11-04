import { NextRequest, NextResponse } from "next/server";
import { esopSource } from "@/lib/sign/esop";
import { adminEmail } from "@/lib/sign/http";

/**
 * GET /api/sign/esop            — admin: approved vestings (e.g. B8-T2)
 * GET /api/sign/esop?ref=B8-T2  — admin: that vesting's holders, ready for certificates
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await adminEmail())) return NextResponse.json({ error: "Founders Doc admins only." }, { status: 403 });
  const src = esopSource();
  if (!src) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  const ref = req.nextUrl.searchParams.get("ref");
  try {
    if (!ref) return NextResponse.json({ runs: await src.runs() });
    const prep = await src.prepare(ref);
    if (!prep) return NextResponse.json({ error: "That vesting was not found." }, { status: 404 });
    return NextResponse.json(prep);
  } catch (e) {
    console.error("[sign] esop prepare failed:", e);
    return NextResponse.json({ error: "Could not read the ESOP dashboard." }, { status: 500 });
  }
}
