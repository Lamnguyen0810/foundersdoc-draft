/**
 * A scan, summed up for Slack: the score, the counts, and the top things to
 * fix, grouped by kind (twelve broken links are one line, not twelve).
 * Plain English, for the whole team.
 */

import type { Finding, Level } from "./checks";
import type { ScanReport } from "./scan";

const NAME: Record<string, string> = {
  status: "Pages that do not load",
  redirect: "Sitemap lists redirecting addresses",
  noindex: "Pages hidden from Google but in the sitemap",
  "title-missing": "Missing page title",
  "title-long": "Title too long for Google",
  "title-short": "Title too short",
  "desc-missing": "Missing description",
  "desc-long": "Description too long",
  "desc-short": "Description too short",
  "h1-missing": "No main heading",
  "h1-many": "More than one main heading",
  "canonical-missing": "No main address (canonical)",
  "og-missing": "No share preview text",
  "jsonld-invalid": "Broken structured data",
  "jsonld-missing": "No structured data on a key page",
  "img-alt": "Images without a description",
  "lang-missing": "Language not set",
  thin: "Very little text",
  slow: "Slow to load",
  heavy: "Very large page",
  "dup-title": "Pages with the same title",
  "dup-desc": "Pages with the same description",
  orphan: "Pages nothing links to",
  sitemap: "Sitemap unreadable",
  robots: "robots.txt unreadable",
  "robots-block": "robots.txt blocks Google",
  "robots-sitemap": "robots.txt does not point to the sitemap",
  llms: "llms.txt unreadable",
  "broken-link": "Links that lead nowhere",
};

export const findingName = (code: string) => NAME[code] ?? code;

export interface Group {
  code: string;
  name: string;
  level: Level;
  count: number;
  example: string;
  fix: string;
}

const ORDER: Level[] = ["problem", "improve", "idea"];

export function groupFindings(r: ScanReport): Group[] {
  const all: Finding[] = [...r.site, ...r.pages.flatMap((p) => p.findings)];
  const by = new Map<string, Group>();
  for (const f of all) {
    const g = by.get(f.code);
    if (g) g.count += 1;
    else by.set(f.code, { code: f.code, name: findingName(f.code), level: f.level, count: 1, example: f.what, fix: f.fix });
  }
  return Array.from(by.values()).sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || b.count - a.count);
}

function sgDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short" });
}

/** The Slack message: plain text with mrkdwn, short enough to read on a phone. */
export function slackText(r: ScanReport, adminUrl: string): string {
  const groups = groupFindings(r);
  const icon: Record<Level, string> = { problem: "🔴", improve: "🟡", idea: "💡" };
  const verdict = r.score >= 85 ? "Good" : r.score >= 60 ? "Fair" : "Needs work";
  const lines = [
    `*🌐 Website scan — ${sgDate(r.scannedAt)}*`,
    `Score *${r.score}/100* (${verdict}) · ${r.counts.pages} pages read · 🔴 ${r.counts.problem} problems · 🟡 ${r.counts.improve} to improve · 💡 ${r.counts.idea + r.opportunities.length} ideas`,
    "",
  ];
  const top = groups.filter((g) => g.level !== "idea").slice(0, 6);
  if (top.length) {
    lines.push("*Fix first*");
    for (const g of top) lines.push(`${icon[g.level]} *${g.name}*${g.count > 1 ? ` (${g.count})` : ""} — ${g.fix}`);
  } else {
    lines.push("✅ Nothing to fix today.");
  }
  if (r.opportunities.length) {
    lines.push("", "*Ideas for more visitors*");
    for (const o of r.opportunities.slice(0, 3)) lines.push(`💡 ${o.title}`);
    if (r.opportunities.length > 3) lines.push(`…and ${r.opportunities.length - 3} more`);
  }
  lines.push("", `Full list, page by page: ${adminUrl}`, "_Automatic daily scan of our own website. Free; nothing is changed on the site._");
  return lines.join("\n");
}
