import { NextRequest, NextResponse } from "next/server";
import { signStore } from "@/lib/sign/store";
import { reissueLink } from "@/lib/sign/service";
import { adminEmail, who } from "@/lib/sign/http";

/** POST /api/sign/link { envelopeId, signerId } — admin: a new link for a signer whose turn it is. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await adminEmail())) return NextResponse.json({ error: "Founders Doc admins only." }, { status: 403 });
  const store = signStore();
  if (store === "no-secret-key") return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { envelopeId?: unknown; signerId?: unknown };
  const res = await reissueLink(store, String(body.signerId ?? ""), req.nextUrl.origin, who(req), String(body.envelopeId ?? ""));
  if (!res) return NextResponse.json({ error: "Only someone whose turn it is can get a new link." }, { status: 409 });
  return NextResponse.json({ ok: true, link: res.link });
}
