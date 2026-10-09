import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;
const TZ = "Asia/Singapore";

/* Written out rather than taken from the locale. en-GB renders September as
   "Sept", which is four letters where every other month is three and looks
   like a typo in a column of dates. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A moment as a person in Singapore would write it: "4 Sep 2026, 6:00pm".
 *
 * The firm is in Singapore and so is the week being reported. An ISO instant
 * ending in Z is correct and unreadable; worse, it is SIX HOURS out from the
 * day it belongs to, so a Friday-evening boundary reads as Friday morning and
 * somebody checking the figures against the calendar concludes the report is
 * broken when it is not.
 */
export function inSingapore(when: Date | string): string {
  const d = typeof when === "string" ? new Date(when) : when;
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  /* Through Number, because `day: "numeric"` still comes back zero-padded when
     other fields in the same format are 2-digit — Intl decides padding for the
     group, not the field, and "04 Sep" is not how anybody writes it. */
  const day = String(Number(get("day")));
  const month = MONTHS[Number(get("month")) - 1] ?? "";
  const year = get("year");

  /* hour12:false gives 00–23, which is unambiguous to read back but not how
     anybody writes half past six in the evening. Converted here rather than
     asking Intl for hour12, because some locales answer that with a space and
     a full stop ("6:00 p.m.") and the column stops lining up. */
  const h24 = Number(get("hour"));
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  return `${day} ${month} ${year}, ${h12}:${get("minute")}${suffix}`;
}

/* "More than three times" — four separate sittings or more. The same rule the
   dashboard uses (supabase/028_frequent_visitors.sql); change it in both or
   the weekly email and the screen will disagree with each other. */
const FREQUENT_VISITS = 4;

export interface WeeklyReport {
  /** The window's edges as ISO instants. Machine-readable; not for people. */
  period_start: string;
  period_end: string;
  /** The same two moments written out, Singapore time: "4 Sep 2026, 6:00pm". */
  period_start_text: string;
  period_end_text: string;
  /**
   * The whole window in one string, already in the right order.
   *
   * ── WHY THIS FIELD EXISTS ─────────────────────────────────────────────
   * The Slack message read "For the week from 2026-09-11 ... to
   * 2026-09-04" — the end date first and the start date second, a week
   * running backwards. Nothing in this file was wrong; the two ISO fields
   * had been mapped into the Zap the wrong way round, which is an easy
   * thing to do with two fields that look identical and no way to tell
   * which is which by looking.
   *
   * One field cannot be put in the wrong order. Use this one in the Zap and
   * the mistake is not available to make.
   */
  period_label: string;
  drafts_generated: number;
  documents_uploaded: number;
  documents_downloaded: number;
  page_views: number;
  accounts_created: number;
  /** Frequent visitors: people who came more than three separate times.
   *  Counted in `visitors` too. */
  frequent_visitors: number;
  /** The same figure as `frequent_visitors`, under its old name, kept so an
   *  existing Zap does not break. */
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

/** The daily report's cut-off: 5pm in Singapore, when the Zap sends it. */
export const DAILY_CUTOFF_HOUR = 17;
/* A scheduler that fires a few minutes early still reports the day that is
   ending, not the one before it. */
const DAILY_EARLY_MS = 15 * 60 * 1000;

/**
 * The latest completed 24 hours ending at 5pm Singapore time: yesterday 5pm
 * to today 5pm. Back to back, so nothing is missed or counted twice from one
 * report to the next — the weekly report's Friday 6pm cut-off, daily.
 */
export function completedDailyWindow(now = new Date()): { start: Date; end: Date } {
  const t = now.getTime() + DAILY_EARLY_MS;
  const singapore = new Date(t + SINGAPORE_OFFSET_MS);
  let endMs =
    Date.UTC(singapore.getUTCFullYear(), singapore.getUTCMonth(), singapore.getUTCDate(), DAILY_CUTOFF_HOUR) -
    SINGAPORE_OFFSET_MS;
  if (endMs > t) endMs -= DAY_MS;
  return { start: new Date(endMs - DAY_MS), end: new Date(endMs) };
}

export async function getWeeklyReport(
  client: SupabaseClient,
  now = new Date(),
): Promise<WeeklyReport> {
  const { start, end } = completedWeeklyWindow(now);
  const report = await reportFor(client, start, end);
  /* En dash, and the timezone named once at the end: the reader should not
     have to wonder whose Friday evening this is. */
  return { ...report, period_label: `${report.period_start_text} – ${report.period_end_text} (Singapore time)` };
}

/** The figures for any window. The weekly and daily reports are the same
 *  counts over different spans, so they cannot disagree about what a
 *  "visitor" or a "draft" is. */
async function reportFor(client: SupabaseClient, start: Date, end: Date): Promise<WeeklyReport> {
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

  const startText = inSingapore(start);
  const endText = inSingapore(end);

  return {
    period_start: from,
    period_end: to,
    period_start_text: startText,
    period_end_text: endText,
    period_label: `${startText} – ${endText} (Singapore time)`,
    drafts_generated: drafts,
    documents_uploaded: uploads,
    documents_downloaded: downloads,
    page_views: views.length,
    accounts_created: accounts,
    frequent_visitors: frequent,
    unique_visitors: frequent,
    visitors: arrivals,
    visits: arrivals,
    waitlist_signups: waitlist,
  };
}

/* ── THE DAILY REPORT ──────────────────────────────────────────────────────
   The 24 hours to 5pm Singapore time, with the 24 hours before beside it
   so a number means something on its own. Same fields as the weekly report,
   so a Zap built for one can be copied for the other, plus a ready-made
   Slack message — one field to map, nothing to put in the wrong order. */

export interface DailyReport extends WeeklyReport {
  /** The day the report ends on: "Wed 30 Sep 2026". */
  day_text: string;
  /** The same figures for the 24 hours before, for comparison. */
  previous: Omit<WeeklyReport, "period_start" | "period_end" | "period_start_text" | "period_end_text" | "period_label">;
  /** The whole report as a Slack message (Slack's own *bold* markup). */
  slack_text: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayText(start: Date): string {
  const sg = new Date(start.getTime() + SINGAPORE_OFFSET_MS);
  return `${WEEKDAYS[sg.getUTCDay()]} ${sg.getUTCDate()} ${MONTHS[sg.getUTCMonth()]} ${sg.getUTCFullYear()}`;
}

/** "12 (▲ 3 on the day before)", "12 (same as the day before)". */
function withChange(now: number, before: number): string {
  const d = now - before;
  if (d === 0) return `${now} (same as the day before)`;
  return `${now} (${d > 0 ? "▲" : "▼"} ${Math.abs(d)} on the day before)`;
}

export async function getDailyReport(client: SupabaseClient, now = new Date()): Promise<DailyReport> {
  const { start, end } = completedDailyWindow(now);
  const [today, before] = await Promise.all([
    reportFor(client, start, end),
    reportFor(client, new Date(start.getTime() - DAY_MS), start),
  ]);
  const day = dayText(end);
  const lines = [
    `*FD AI daily report · ${day}*`,
    `_${inSingapore(start)} – ${inSingapore(end)}, Singapore time_`,
    ``,
    `*Drafts generated:* ${withChange(today.drafts_generated, before.drafts_generated)}`,
    `*Documents downloaded:* ${withChange(today.documents_downloaded, before.documents_downloaded)}`,
    `*Documents uploaded:* ${withChange(today.documents_uploaded, before.documents_uploaded)}`,
    `*Accounts created:* ${withChange(today.accounts_created, before.accounts_created)}`,
    `*Waitlist sign-ups:* ${withChange(today.waitlist_signups, before.waitlist_signups)}`,
    `*Visitors:* ${withChange(today.visitors, before.visitors)}`,
    `*Page views:* ${withChange(today.page_views, before.page_views)}`,
  ];
  const {
    period_start: _a, period_end: _b, period_start_text: _c, period_end_text: _d, period_label: _e,
    ...previous
  } = before;
  void _a; void _b; void _c; void _d; void _e;
  return {
    ...today,
    period_label: `${inSingapore(start)} – ${inSingapore(end)} (Singapore time)`,
    day_text: day,
    previous,
    slack_text: lines.join("\n"),
  };
}
