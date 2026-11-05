import "server-only";
import { NextResponse } from "next/server";
import { signStore, type SignStore } from "@/lib/sign/store";
import { signAccount, type SignAccount } from "@/lib/sign/account";
import { SignError } from "@/lib/sign/service";

/** Every FD Sign (for everyone) route: a signed-in account and a store with SQL 119 run. */
export async function ctx(): Promise<{ me: SignAccount; store: SignStore } | NextResponse> {
  const me = await signAccount();
  if (!me) return NextResponse.json({ error: "Please sign in to use FD Sign." }, { status: 401 });
  const store = signStore();
  if (store === "no-secret-key") return NextResponse.json({ error: "FD Sign is not available right now." }, { status: 503 });
  if (!(await store.ownersReady().catch(() => false))) return NextResponse.json({ error: "FD Sign is being set up (run supabase/119_fd_sign_for_everyone.sql)." }, { status: 503 });
  return { me, store };
}

export function fail(e: unknown, what: string): NextResponse {
  if (e instanceof SignError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`[fd-sign] ${what} failed:`, e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
