import { type NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clientIp, hasTeamMark, isTeamIp, TEAM_COOKIE } from "@/lib/team-device";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdmin } from "@/lib/supabase/server";

/**
 * Mark this browser as one of the team's devices, so it is not counted in
 * the analytics and not announced in Slack (see lib/team-device.ts).
 *
 *   /api/team-device             — what this device is: its address, and
 *                                  whether it is marked or on TEAM_IPS
 *   /api/team-device?key=…       — mark it (the key is TEAM_DEVICE_KEY);
 *                                  an admin who is signed in needs no key
 *   /api/team-device?off=1       — unmark it
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAYS_400 = 400 * 24 * 60 * 60;

function sameKey(given: string, want: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function page(title: string, lines: string[]): string {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · FD AI</title>
<style>body{font:16px/1.55 system-ui,-apple-system,Segoe UI,Arial,sans-serif;margin:0;background:#faf8f3;color:#1c1b19}main{max-width:560px;margin:12vh auto;padding:28px;background:#fff;border:1px solid #e8e2d4;border-radius:14px}h1{font-size:20px;margin:0 0 12px}p{margin:8px 0}code{background:#f3efe4;padding:2px 6px;border-radius:6px}a{color:#8a6a10}</style></head>
<body><main><h1>${esc(title)}</h1>${lines.map((l) => `<p>${l}</p>`).join("")}<p><a href="/draft">Back to FD AI</a></p></main></body></html>`;
}

function html(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const marked = hasTeamMark(req);
  const onList = isTeamIp(ip);
  const params = req.nextUrl.searchParams;

  if (params.get("off") === "1") {
    const res = html(page("This device is counted again", [
      "Visits, starts and downloads from this browser are counted and sent to Slack again.",
      onList ? `Its address <code>${esc(ip)}</code> is still on the team list (TEAM_IPS), so on this network it stays uncounted.` : "",
    ].filter(Boolean)));
    res.cookies.set(TEAM_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const key = params.get("key");
  if (key !== null) {
    const want = (process.env.TEAM_DEVICE_KEY ?? "").trim();
    const admin = isSupabaseConfigured() ? await isAdmin().catch(() => false) : false;
    const ok = admin || (want.length >= 8 && sameKey(key.trim(), want));
    if (!ok) return html(page("That link did not work", ["The key is not right. Ask Lam for the team link."]), 403);
    const res = html(page("This device is marked as Founders Doc team", [
      "From now on, this browser's visits, document starts and downloads are <b>not counted</b> in the analytics and <b>not sent to Slack</b>.",
      "It lasts 400 days, on any network. Do this once on each browser you test with (computer and phone).",
      `Your address right now: <code>${esc(ip || "unknown")}</code>.`,
      `To undo: <a href="/api/team-device?off=1">count this device again</a>.`,
    ]));
    res.cookies.set(TEAM_COOKIE, "1", { path: "/", maxAge: DAYS_400, sameSite: "lax", secure: req.nextUrl.protocol === "https:", httpOnly: true });
    return res;
  }

  return html(page("This device", [
    `Address: <code>${esc(ip || "unknown")}</code> — ${onList ? "on the team list (TEAM_IPS): not counted" : "not on the team list"}.`,
    `Device mark: ${marked ? "<b>marked as team</b> — not counted" : "not marked"}.`,
    marked || onList ? "Visits, starts and downloads from here are not counted and not sent to Slack." : "Visits from here are counted like any visitor's.",
    marked ? `<a href="/api/team-device?off=1">Count this device again</a>` : "",
  ].filter(Boolean)));
}
