import "server-only";
import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser, isAdmin } from "@/lib/supabase/server";
import type { Who } from "./service";

/** IP and browser, for the audit trail. */
export function who(req: NextRequest | Headers): Who {
  const h = req instanceof Headers ? req : req.headers;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip: ip ? ip.slice(0, 64) : null, ua: (h.get("user-agent") ?? "").slice(0, 300) || null };
}

/** The signed-in Founders Doc admin's email, "Preview" without Supabase, or null. */
export async function adminEmail(): Promise<string | null> {
  if (!isSupabaseConfigured()) return "Preview";
  const user = await getUser();
  if (!user || !(await isAdmin())) return null;
  return user.email ?? "admin";
}
