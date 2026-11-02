import { NextRequest, NextResponse } from "next/server";
import { signStore } from "@/lib/sign/store";
import { SignError } from "@/lib/sign/service";
import { sendCode } from "@/lib/sign/code";
import { who } from "@/lib/sign/http";

/** POST /api/sign/code { token } — public: email the signer a 6-digit code (10 minutes). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const store = signStore();
  if (store === "no-secret-key") return NextResponse.json({ error: "Signing is not available right now." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  try {
    const res = await sendCode(store, String(body.token ?? ""), req.nextUrl.origin, who(req));
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    if (e instanceof SignError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[sign] code failed:", e);
    const m = e instanceof Error ? e.message : "";
    if (/sign_codes/.test(m)) return NextResponse.json({ error: "Signing codes are being set up. Please try again shortly." }, { status: 503 });
    return NextResponse.json({ error: "Could not send a code. Please try again." }, { status: 500 });
  }
}
