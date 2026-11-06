import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { HolderError, holderStore } from "@/lib/esop/holder";

/** Shared bits of the "My share options" routes (124). */
export function who(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
  return { ip: ip ? ip.slice(0, 64) : null, ua: (req.headers.get("user-agent") ?? "").slice(0, 300) || null };
}

export function store() {
  const s = holderStore();
  if (!s) throw new HolderError("Not available: SUPABASE_SECRET_KEY is not set.", 503);
  return s;
}

export function fail(e: unknown) {
  if (e instanceof HolderError) return NextResponse.json({ error: e.message }, { status: e.status });
  const m = e instanceof Error ? e.message : String(e);
  if (/esop_holder_(links|devices|opens)/.test(m)) return NextResponse.json({ error: "Not ready yet: supabase/124_esop_my_options.sql must be run first." }, { status: 503 });
  console.error("[my-options]", m);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function body(req: NextRequest): Promise<Record<string, unknown>> {
  return ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}
