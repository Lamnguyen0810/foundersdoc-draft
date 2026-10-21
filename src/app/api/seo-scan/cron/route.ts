import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { scanSite } from "@/lib/seo-audit/scan";
import { slackText } from "@/lib/seo-audit/summary";

/**
 * GET /api/seo-scan/cron — the website scans itself every morning.
 *
 * Vercel Cron calls this once a day (vercel.json, 01:00 UTC = 9am Singapore)
 * with `Authorization: Bearer <CRON_SECRET>`. It reads every page of the
 * live site (lib/seo-audit/scan.ts) and posts a short summary to Slack
 * through an incoming webhook (SEO_SLACK_WEBHOOK_URL). Free: Vercel's daily
 * cron and Slack incoming webhooks cost nothing, and nothing is stored.
 *
 * Without CRON_SECRET the route refuses everyone; without the webhook it
 * still scans and returns the summary, so it can be tried by hand.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://foundersdoc.com";

function authorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  /* The live site, unless this is a preview deployment scanning itself. */
  const origin = process.env.VERCEL_ENV === "production" || !process.env.VERCEL_ENV ? SITE : req.nextUrl.origin;
  try {
    const report = await scanSite(origin);
    const text = slackText(report, `${SITE}/admin?tab=seo`);
    let posted = false;
    const hook = process.env.SEO_SLACK_WEBHOOK_URL?.trim();
    if (hook && hook.startsWith("https://hooks.slack.com/")) {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, unfurl_links: false }),
        signal: AbortSignal.timeout(10_000),
      });
      posted = res.ok;
      if (!res.ok) console.error("[seo-scan cron] Slack said", res.status);
    }
    return NextResponse.json({ ok: true, posted, score: report.score, counts: report.counts, text }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[seo-scan cron] failed", err);
    return NextResponse.json({ error: "The scan could not finish." }, { status: 500 });
  }
}
