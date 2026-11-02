import { NextRequest, NextResponse } from "next/server";
import { signStore } from "@/lib/sign/store";
import { voidEnvelope } from "@/lib/sign/service";
import { adminEmail, who } from "@/lib/sign/http";

/** POST /api/sign/void { envelopeId } — admin: cancel an open signing request. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await adminEmail();
  if (!admin) return NextResponse.json({ error: "Founders Doc admins only." }, { status: 403 });
  const store = signStore();
  if (store === "no-secret-key") return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { envelopeId?: unknown };
  const ok = await voidEnvelope(store, String(body.envelopeId ?? ""), who(req), admin);
  if (!ok) return NextResponse.json({ error: "Only an open request can be cancelled." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
