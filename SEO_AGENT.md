# SEO agent — set-up and how it works

The SEO agent finds ways for more people to find foundersdoc.com on Google,
keeps the evidence, and waits for a person to approve each change. It is
**free-first**: it uses our own website, free web research, Supabase, Vercel
and Slack. Nothing is published on the website automatically.

It lives in **Admin → SEO**.

## What it does

| Part | What | Where |
|---|---|---|
| Website health | Reads every page in the sitemap the way Google does: errors, titles, descriptions, headings, canonical, structured data, image alt text, thin text, speed, duplicate titles, pages nothing links to, broken links | `src/lib/seo-audit/` · Admin → SEO → Website health |
| Daily website scan | Runs the scan every morning (Vercel Cron, ~9am SGT), posts a summary in Slack and saves it in the history | `src/app/api/seo-scan/cron/route.ts` · `vercel.json` |
| Daily research | A scheduled Claude task (free under the Claude plan): rankings for 19 searches, competitors, one "opportunity of the day" with a page plan, a quick win, Monday page draft | Claude → scheduled tasks → "FD AI daily SEO check + growth ideas" |
| Memory | Settings, runs, findings (with sources, date, confidence, verified vs estimate), keywords (numbers only with a source), recommendations with status | `supabase/104_seo_agent.sql` |
| Keyword scoring | 0–100 from relevance, intent, demand, position, competition, effort; weights in Settings; every score lists its reasons | `src/lib/seo-agent/score.ts` |
| Dashboard | Overview · Recommendations (approve / reject / done / measuring) · Keywords · Research history · Website health · Settings | `src/app/admin/SeoAgent.tsx` |

## Set-up

1. **Run the SQL**: `supabase/104_seo_agent.sql` in the Supabase SQL editor (safe to run twice).
2. **Make a private key** (at least 24 characters, e.g. from a password manager) and set it in the database:
   ```sql
   select public.set_seo_ingest_key('<the key>');
   ```
3. **Vercel → Settings → Environment Variables** (then redeploy):

   | Name | What | Needed for |
   |---|---|---|
   | `SEO_INGEST_KEY` | The same key as step 2 | Saving scans in the history ("Save today's scan", the daily cron) |
   | `CRON_SECRET` | Any long random string | The daily website scan (Vercel sends it to the cron route) |
   | `SEO_SLACK_WEBHOOK_URL` | A Slack incoming webhook for #fdai-analytics (api.slack.com/apps → Incoming Webhooks) | Posting the daily scan to Slack |

   Never paste these values in chat or commit them.
4. **Let the daily research send findings in** (optional, for the dashboard): in Claude's admin settings → Capabilities → network access, allow `foundersdoc.com`. Then ask Claude to add the "send findings" step to the scheduled task; it will POST to `/api/seo/ingest` with the key. Until then the research keeps posting to Slack only.

## Sending findings in (`POST /api/seo/ingest`)

`Authorization: Bearer <SEO key>`, JSON body (all lists optional; extra fields are ignored):

```json
{
  "source": "daily_research",
  "status": "ok",
  "summary": "Plain-English summary of the run",
  "limitations": "What could not be checked",
  "findings": [
    { "kind": "keyword|competitor|content_gap|technical|question|trend|page_improvement",
      "title": "…", "detail": "…", "page_url": "…", "keyword": "…",
      "evidence": [{ "url": "https://…", "title": "…", "retrieved_at": "2026-10-21" }],
      "confidence": "high|medium|low", "certainty": "verified|estimate" }
  ],
  "keywords": [
    { "keyword": "NDA template Singapore", "country": "Singapore", "intent": "transactional",
      "search_volume": 1200, "volume_source": "Google Keyword Planner",
      "our_position": 14, "position_source": "Search Console",
      "relevance": 5, "effort": "medium", "next_action": "…", "competitor_pages": ["https://…"] }
  ],
  "recommendations": [
    { "title": "…", "description": "…", "page_url": "…", "new_page": true, "keyword": "…",
      "why": "…", "impact": "high|medium|low", "effort": "small|medium|large", "priority": 1,
      "steps": ["…"], "validation": "How we'll know it worked", "evidence": [ … ] }
  ]
}
```

The database (`seo_ingest`) checks the key, validates every field, caps volume
(60 findings, 100 keywords, 20 recommendations a run; 12 runs a day), counts
repeats instead of adding them, never overwrites a recommendation's status, and
**drops any number that has no source**.

## Costs

| Item | Cost |
|---|---|
| Supabase tables, Vercel route and daily cron (Hobby: once a day) | Free |
| Slack incoming webhook | Free |
| Daily research (scheduled Claude task) | Included in the Claude plan |
| Google Search Console (phase 2) | Free |
| Paid keyword tools (Semrush, Ahrefs) | Not used. Optional later; the budget setting is 0 |

## Tests

```bash
npm run test:seo
```

Covers the page rules (`checks.test.ts`) and the keyword scoring (`score.test.ts`).
The SQL was tested on a local Postgres: wrong key refused, unsourced numbers
dropped, repeats counted, statuses kept, key hash hidden from admins, non-admins
see nothing.

## What is next

- **Phase 2**: Google Search Console (real searches, clicks, positions per page) — needs site verification and a service account; then keyword positions and impressions arrive as *verified*.
- **Phase 3**: proposed changes as previews (current vs new title, description, content), applied as normal code patches or Blog drafts after approval, with history and rollback through git.
- **Phase 4**: more providers, better scoring and attribution.
