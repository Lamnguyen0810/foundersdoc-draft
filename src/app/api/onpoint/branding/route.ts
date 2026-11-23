import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorJson, guard, OpError } from "@/lib/onpoint/server";

/**
 * PATCH /api/onpoint/branding { name?, logo? }: the sidebar's company name and logo (a PNG or JPEG as a data: URL,
 * up to 500 KB; checked by its first bytes, not its name). DELETE: back to the default (0267).
 * SVG is not accepted: it can carry script, and a raster logo shows the same.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkLogo(v: string): string {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m) throw new OpError("Upload a PNG or JPG image.");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length === 0) throw new OpError("That image is empty.");
  if (bytes.length > 500 * 1024) throw new OpError("The logo must be 500 KB or smaller.");
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((m[1] === "png" && !png) || (m[1] === "jpeg" && !jpg)) throw new OpError("That file is not a readable PNG or JPG.");
  return v;
}

export async function PATCH(req: NextRequest) {
  try {
    const m = await guard("admin");
    const b = (await req.json().catch(() => ({}))) as { name?: unknown; logo?: unknown };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const name = String(b.name ?? "").replace(/\s+/g, " ").trim();
    if (name) {
      if (name.length > 120) throw new OpError("The company name is too long (120 characters at most).");
      patch.custom_name = name;
    }
    if (typeof b.logo === "string" && b.logo) {
      patch.logo_data = checkLogo(b.logo);
      patch.logo_updated_at = new Date().toISOString();
    }
    if (Object.keys(patch).length === 1) throw new OpError("Nothing to save.");
    const r = await supabaseAdmin().from("onpoint_workspaces").update(patch).eq("id", m.ws.id);
    if (r.error) throw new OpError(r.error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE() {
  try {
    const m = await guard("admin");
    const r = await supabaseAdmin().from("onpoint_workspaces").update({ custom_name: null, logo_data: null, logo_updated_at: null, updated_at: new Date().toISOString() }).eq("id", m.ws.id);
    if (r.error) throw new OpError(r.error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
