import { NextRequest, NextResponse } from "next/server";
import { signStore } from "@/lib/sign/store";
import { SignError, submitSignature } from "@/lib/sign/service";
import { who } from "@/lib/sign/http";
import { CODE_COOKIE, codeRequired, isVerified } from "@/lib/sign/code";

/**
 * POST /api/sign/submit — a signer signs (public: the private link is the key).
 * { token, consent: true, kind: "draw", png: "data:image/png;base64,…" } or { …, kind: "type", typed: "Full Name" }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const store = signStore();
  if (store === "no-secret-key") return NextResponse.json({ error: "Signing is not available right now." }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 700_000) return NextResponse.json({ error: "That signature is too large." }, { status: 413 });
  let b: { token?: unknown; consent?: unknown; kind?: unknown; png?: unknown; typed?: unknown; values?: unknown };
  try {
    b = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (b.consent !== true) return NextResponse.json({ error: "Please tick the box to agree to sign electronically." }, { status: 400 });
  const kind = b.kind === "type" ? "type" : b.kind === "draw" ? "draw" : null;
  if (!kind) return NextResponse.json({ error: "Draw or type your signature." }, { status: 400 });
  let png: Uint8Array | null = null;
  let typed: string | null = null;
  if (kind === "draw") {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.png ?? ""));
    if (!m) return NextResponse.json({ error: "Draw your signature first." }, { status: 400 });
    png = new Uint8Array(Buffer.from(m[1], "base64"));
    if (png.length < 200 || png[0] !== 0x89 || png[1] !== 0x50) return NextResponse.json({ error: "Draw your signature first." }, { status: 400 });
  } else {
    typed = String(b.typed ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (typed.length < 2) return NextResponse.json({ error: "Type your full name." }, { status: 400 });
  }
  /* text / checkbox boxes: { "<field id>": "what they typed" | "yes" } */
  const values: Record<string, string> = {};
  if (b.values && typeof b.values === "object" && !Array.isArray(b.values))
    for (const [k, v] of Object.entries(b.values as Record<string, unknown>).slice(0, 100))
      if (/^[0-9a-f-]{36}$/i.test(k) && typeof v === "string") values[k] = v.slice(0, 500);
  const token = String(b.token ?? "");
  if (codeRequired(store) && !(await isVerified(store, token, req.cookies.get(CODE_COOKIE)?.value)))
    return NextResponse.json({ error: "Please confirm the code we emailed you first.", needCode: true }, { status: 401 });
  try {
    const res = await submitSignature(store, { token, kind, png, typed, values, origin: req.nextUrl.origin, who: who(req) });
    return NextResponse.json({ ok: true, completed: res.completed.length > 0 });
  } catch (e) {
    if (e instanceof SignError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[sign] submit failed:", e);
    return NextResponse.json({ error: "Could not save your signature. Please try again." }, { status: 500 });
  }
}
