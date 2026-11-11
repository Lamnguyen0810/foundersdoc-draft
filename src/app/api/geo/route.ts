import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geo — the visitor's country as Vercel sees it (2 letters, e.g. "SG"), or null.
 * Used once, at sign-up, for the "Came from: … · Country" line in Slack (0215).
 * Only the country: no city, no IP address, nothing stored here.
 */
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const c = req.headers.get("x-vercel-ip-country")?.toUpperCase() ?? "";
  return NextResponse.json({ country: /^[A-Z]{2}$/.test(c) ? c : null }, { headers: { "Cache-Control": "private, no-store" } });
}
