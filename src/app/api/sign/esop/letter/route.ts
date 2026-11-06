import { NextRequest, NextResponse } from "next/server";
import { esopSource } from "@/lib/sign/esop";
import { readLetterOfGrant } from "@/lib/sign/letter";
import { adminEmail } from "@/lib/sign/http";

/** POST /api/sign/esop/letter { holderId, which? } — admin: read the holder's uploaded Letter of Grant
    (which "top-up" = the Supplemental Letter, to fill in the top-up schedule on the ESOP dashboard). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!(await adminEmail())) return NextResponse.json({ error: "Founders Doc admins only." }, { status: 403 });
  const src = esopSource();
  if (!src) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  const { holderId, which } = (await req.json().catch(() => ({}))) as { holderId?: string; which?: string };
  if (!holderId || !UUID.test(holderId)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  try {
    const top = which === "top-up";
    const bytes = await src.letter(holderId, top ? "top-up" : "original");
    if (!bytes) return NextResponse.json({ error: top ? "No Supplemental Letter of Grant uploaded for this holder yet." : "No Letter of Grant uploaded for this holder yet." }, { status: 404 });
    const { name, legalName, director, contact } = await src.holderNames(holderId);
    return NextResponse.json(await readLetterOfGrant(bytes, { expectNames: [name, legalName], avoidNames: [director, contact] }));
  } catch (e) {
    console.error("[sign] letter read failed:", e);
    return NextResponse.json({ error: "Could not read the Letter of Grant." }, { status: 500 });
  }
}
