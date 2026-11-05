import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";

/**
 * FD Sign for everyone: the signed-in FD AI account (free accounts included).
 * Without Supabase (local preview) everyone is one "Preview" person, so the
 * pages can be tried end to end.
 */
export interface SignAccount {
  id: string;
  email: string;
  name: string;
  /** email confirmed: needed to sign from the account ("Sign now") */
  confirmed: boolean;
}

export const PREVIEW_ACCOUNT: SignAccount = { id: "00000000-0000-4000-8000-00000000f00d", email: "preview@foundersdoc.com", name: "Preview User", confirmed: true };

export async function signAccount(): Promise<SignAccount | null> {
  if (!isSupabaseConfigured()) return PREVIEW_ACCOUNT;
  const user = await getUser();
  if (!user?.email) return null;
  let name = "";
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    name = String((data as { full_name?: string | null } | null)?.full_name ?? "").trim();
  } catch {
    /* name is optional */
  }
  const meta = user.user_metadata as { full_name?: unknown } | undefined;
  if (!name && typeof meta?.full_name === "string") name = meta.full_name.trim();
  return { id: user.id, email: user.email.toLowerCase(), name: (name || user.email.split("@")[0]).slice(0, 160), confirmed: Boolean(user.email_confirmed_at) };
}

/** How many requests one account can send per day while FD Sign is free (Beta). */
export function dailyLimit(): number {
  const n = Number(process.env.FD_SIGN_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 && n <= 1000 ? n : 20;
}

/** Start of today in Singapore, as an ISO time (for the daily limit). */
export function startOfDaySgt(now = new Date()): string {
  const sgt = new Date(now.getTime() + 8 * 3_600_000);
  sgt.setUTCHours(0, 0, 0, 0);
  return new Date(sgt.getTime() - 8 * 3_600_000).toISOString();
}

export const FOLDER_COLOURS = ["#3b82f6", "#8b5cf6", "#10b981", "#ef6c4a", "#64748b", "#d946ef", "#0ea5a4", "#c9962a"];
