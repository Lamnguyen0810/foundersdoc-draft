import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/onpoint/logo (0271, public): the logo shown at the top of OnPoint's reminder emails. Mail apps
 * cannot show the data: image stored in the workspace, so they load it from here. Only a PNG or JPEG that was
 * checked on upload is ever returned; otherwise the default OnPoint mark (0273: the email shows the name beside it).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const fallback = NextResponse.redirect(new URL("/onpoint/logo-mark.png", req.nextUrl.origin), 302);
  if (!isSupabaseConfigured() || !isAdminClientConfigured()) return fallback;
  const r = await supabaseAdmin().from("onpoint_workspaces").select("logo_data").eq("slug", "onpoint").maybeSingle();
  const data = (r.data as { logo_data: string | null } | null)?.logo_data ?? "";
  const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!m) return fallback;
  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
