import type { NextRequest } from "next/server";

/**
 * The team's own devices — Lam's, Rachel's — are not counted.
 *
 * Two ways to recognise one, either is enough:
 *
 *   · THE DEVICE MARK. Opening /api/team-device?key=… once in a browser sets
 *     a cookie (fd_team) for that browser, for 400 days. Works on any
 *     network — office, home, phone data — which an IP address does not.
 *     /api/team-device?off=1 removes it.
 *   · THE ADDRESS. TEAM_IPS in the environment, comma-separated: an exact
 *     address (203.0.113.7), an IPv4 range (203.0.113.0/24) or a prefix
 *     ending in * (2001:db8:1234:*). Good for the office's fixed line; a
 *     home or mobile address changes, so the mark is the reliable one.
 *
 * A team request is not recorded at all: no page view, no visitor, no
 * "started" (so Slack is not told either). Nothing about the address is
 * stored — it is compared here and dropped, as /api/events already does.
 */

export const TEAM_COOKIE = "fd_team";

/** The caller's address, as Vercel passes it on. */
export function clientIp(req: NextRequest): string {
  return ((req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "").trim();
}

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/** Does this address match one entry of TEAM_IPS? */
export function ipMatches(ip: string, pattern: string): boolean {
  const a = ip.trim().toLowerCase().replace(/^::ffff:/, "");
  const p = pattern.trim().toLowerCase();
  if (!a || !p) return false;
  if (p.endsWith("*")) return a.startsWith(p.slice(0, -1));
  const cidr = /^([\d.]+)\/(\d{1,2})$/.exec(p);
  if (cidr) {
    const ipN = ipv4ToInt(a);
    const base = ipv4ToInt(cidr[1]);
    const bits = Number(cidr[2]);
    if (ipN === null || base === null || bits > 32) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((ipN & mask) >>> 0) === ((base & mask) >>> 0);
  }
  return a === p;
}

export function teamIps(): string[] {
  return (process.env.TEAM_IPS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function isTeamIp(ip: string): boolean {
  return Boolean(ip) && teamIps().some((p) => ipMatches(ip, p));
}

export function hasTeamMark(req: NextRequest): boolean {
  return req.cookies.get(TEAM_COOKIE)?.value === "1";
}

/** A request from one of the team's devices: marked, or from a team address. */
export function isTeamRequest(req: NextRequest): boolean {
  return hasTeamMark(req) || isTeamIp(clientIp(req));
}
