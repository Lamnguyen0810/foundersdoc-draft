import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;

/* "More than three times" — four separate sittings or more. The same rule the
   dashboard uses (supabase/028_frequent_visitors.sql); change it in both or
   the weekly email and the screen will disagree with each other. */
const FREQUENT_VISITS = 4;

export interface WeeklyReport {
  period_start: string;
  period_end: string;
  drafts_generated: number;
  documents_uploaded: number;
  documents_downloaded: number;
  page_views: number;
  accounts_created: number;
  /** People who came more than three separate times. Counted in `visitors` too. */
  unique_visitors: number;
  /** Arrivals. Four pages in one sitting is one visitor. */
  visitors: number;
  /** The same figure as `visitors`, kept so an existing Zap does not break. */
  visits: number;
  waitlist_signups: number;
}

/** The latest completed Friday 6pm → Friday 6pm reporting window in Singapore. */
export function completedWeeklyWindow(now = new Date()): { start: Date; end: Date } {
  const singapore = new Date(now.getTime() + SINGAPORE_OFFSET_MS);
  const daysSinceFriday = (singapore.getUTCDay() - 5 + 7) % 7;
  let endMs =
    Date.UTC(
      singapore.getUTCFullYear(),
      singapore.getUTCMonth(),
      singapore.getUTCDate() - daysSinceFriday,
      18,
    ) - SINGAPORE_OFFSET_MS;

  if (endMs > now.getTime()) endMs -= WEEK_MS;
  return { start: new Date(endMs - WEEK_MS), end: new Date(endMs) };
}

async function countRows(
  client: SupabaseClient,
  table: string,
  start: string,
  end: string,
  eventName?: string,
): Promise<number> {
  let query = client
    .from(table)
    .select("id", { count: "exact", head: true })
    .gte("created_at", start)
    .lt("created_at", end);
  if (eventName) query = query.eq("name", eventName);
  const { count, error } = await query;
  if (error) throw new Error(`${table}${eventName ? `/${eventName}` : ""}: ${error.message}`);
  return count ?? 0;
}

/* visitor_id is the lasting code — the one that recognises the same person on
   Monday and again on Friday. visitor_hash carries the date inside it, so it
   changes every midnight; counting distinct hashes over a week would report
   one regular reader as five different people, which is what this used to do. */
type PageView = { user_id: string | null; visitor_id: string | null; anon_id: string | null };

async function pageViews(
  client: SupabaseClient,
  start: string,
  end: string,
  adminIds: Set<string>,
): Promise<PageView[]> {
  const rows: PageView[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("events")
      .select("user_id,visitor_id,anon_id")
      .eq("name", "page_view")
      .gte("created_at", start)
      .lt("created_at", end)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`events/page_view: ${error.message}`);
    const batch = (data ?? []) as PageView[];
    rows.push(...batch.filter((row) => !row.user_id || !adminIds.has(row.user_id)));
    if (batch.length < pageSize) break;
  }
  return rows;
}

export async function getWeeklyReport(
  client: SupabaseClient,
  now = new Date(),
): Promise<WeeklyReport> {
  const { start, end } = completedWeeklyWindow(now);
  const from = start.toISOString();
  const to = end.toISOString();

  const { data: admins, error: adminsError } = await client
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  if (adminsError) throw new Error(`profiles/admins: ${adminsError.message}`);
  const adminIds = new Set((admins ?? []).map((row) => String(row.id)));

  const [drafts, uploads, downloads, accounts, waitlist, views] = await Promise.all([
    countRows(client, "events", from, to, "draft_generated"),
    countRows(client, "events", from, to, "source_uploaded"),
    countRows(client, "events", from, to, "draft_exported"),
    countRows(client, "profiles", from, to),
    countRows(client, "waitlist", from, to),
    pageViews(client, from, to, adminIds),
  ]);

  /* How many sittings each person had this week, so "more than three times"
     can be answered. Somebody with no lasting code — a visit recorded before
     ANALYTICS_STABLE was set — cannot be counted here and is left out rather
     than guessed at. */
  const sittingsPerPerson = new Map<string, Set<string>>();
  for (const row of views) {
    if (!row.visitor_id || !row.anon_id) continue;
    const seen = sittingsPerPerson.get(row.visitor_id) ?? new Set<string>();
    seen.add(row.anon_id);
    sittingsPerPerson.set(row.visitor_id, seen);
  }
  let frequent = 0;
  for (const sittings of sittingsPerPerson.values()) {
    if (sittings.size >= FREQUENT_VISITS) frequent += 1;
  }
  const arrivals = new Set(views.map((row) => row.anon_id).filter(Boolean)).size;

  return {
    period_start: from,
    period_end: to,
    drafts_generated: drafts,
    documents_uploaded: uploads,
    documents_downloaded: downloads,
    page_views: views.length,
    accounts_created: accounts,
    unique_visitors: frequent,
    visitors: arrivals,
    visits: arrivals,
    waitlist_signups: waitlist,
  };
}
