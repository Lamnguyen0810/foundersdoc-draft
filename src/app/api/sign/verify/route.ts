import { NextRequest, NextResponse } from "next/server";
import { signStore } from "@/lib/sign/store";
import { SignError } from "@/lib/sign/service";
import { CODE_COOKIE, VERIFIED_MINUTES, verifyCode } from "@/lib/sign/code";
import { who } from "@/lib/sign/http";

/** POST /api/sign/verify { token, code } — public: confirm the emailed code; this browser may then sign for 30 minutes. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const store = signStore();
  if (store === "no-secret-key") return NextResponse.json({ error: "Signing is not available right now." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; code?: unknown };
  try {
    const secret = await verifyCode(store, String(body.token ?? ""), String(body.code ?? "").slice(0, 20), who(req));
    const res = NextResponse.json({ ok: true });
    res.cookies.set(CODE_COOKIE, secret, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: VERIFIED_MINUTES * 60,
    });
    return res;
  } catch (e) {
    if (e instanceof SignError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[sign] verify failed:", e);
    return NextResponse.json({ error: "Could not check the code. Please try again." }, { status: 500 });
  }
}
