import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DOC_TYPES } from "./doctypes";
import { isQuietAccount } from "./quiet";

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
  /** How many different signed-in people each of those three were. */
  drafts_users: number;
  uploads_users: number;
  downloads_users: number;
  /** Different people (their lasting code); a person back three times is one. */
  unique_people: number;
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
  /** Drafts generated and documents downloaded, per document, most first:
   *  [{ doc: "NDA", count: 3 }]. Same people counted as the totals. */
  drafts_by_doc: DocCount[];
  downloads_by_doc: DocCount[];
}

export interface DocCount {
  doc: string;
  count: number;
  /** Different signed-in people. */
  users?: number;
  /** Every one since records began (daily report only), same people left out. */
  lifetime?: number;
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

/* ── WHO IS LEFT OUT OF THE DRAFT AND DOWNLOAD FIGURES ────────────────────
   The firm's admins and the team's test accounts (public.quiet_accounts and
   lib/quiet.ts): the same people Slack is not told about, so the report and
   the document threads count the same things. The team's own devices are
   never recorded at all (lib/team-device.ts). */
async function leftOut(client: SupabaseClient, adminIds: Set<string>): Promise<Set<string>> {
  const out = new Set(adminIds);
  const emails = new Set<string>();
  const { data: quiet } = await client.from("quiet_accounts").select("email");
  for (const row of (quiet ?? []) as { email: string | null }[]) if (row.email) emails.add(row.email.trim().toLowerCase());
  const { data: people, error } = await client.from("profiles").select("id,email");
  if (error) throw new Error(`profiles/emails: ${error.message}`);
  for (const row of (people ?? []) as { id: string; email: string | null }[]) {
    const e = (row.email ?? "").trim().toLowerCase();
    if (e && (emails.has(e) || isQuietAccount(e))) out.add(String(row.id));
  }
  return out;
}

type EventRow = { user_id: string | null; props: Record<string, unknown> | null };

/** Every event of one kind in the window, minus the people left out. */
async function eventRows(client: SupabaseClient, name: string, start: string, end: string, skip: Set<string>): Promise<EventRow[]> {
  const rows: EventRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("events")
      .select("user_id,props")
      .eq("name", name)
      .gte("created_at", start)
      .lt("created_at", end)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`events/${name}: ${error.message}`);
    const batch = (data ?? []) as EventRow[];
    rows.push(...batch.filter((row) => !row.user_id || !skip.has(row.user_id)));
    if (batch.length < pageSize) break;
  }
  return rows;
}

/* A document added since this file last changed still reads properly. */
const DOC_LABEL = new Map<string, string>([["ipaa", "IP Assignment Agreement"], ...DOC_TYPES.map((d) => [d.slug, d.label] as [string, string])]);

/** Rows → [{ doc: "NDA", count: 3 }, …], most first, then by name. */
function byDoc(rows: EventRow[]): DocCount[] {
  const counts = new Map<string, number>();
  const people = new Map<string, Set<string>>();
  for (const row of rows) {
    const slug = typeof row.props?.doc_type === "string" ? row.props.doc_type : "";
    const doc = DOC_LABEL.get(slug) ?? (slug ? slug.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Unknown document");
    counts.set(doc, (counts.get(doc) ?? 0) + 1);
    if (row.user_id) people.set(doc, (people.get(doc) ?? new Set()).add(row.user_id));
  }
  return [...counts.entries()]
    .map(([doc, count]) => ({ doc, count, users: people.get(doc)?.size ?? 0 }))
    .sort((a, b) => b.count - a.count || a.doc.localeCompare(b.doc));
}

/** Different signed-in people among the rows. */
function usersIn(rows: EventRow[]): number {
  return new Set(rows.map((r) => r.user_id).filter(Boolean)).size;
}

/**
 * A table Slack shows in line, inside a code block so the columns line up:
 * the first column to the left, the numbers to the right.
 */
export function slackTable(rows: string[][]): string {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
  const line = (r: string[]) =>
    r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("   ").trimEnd();
  return ["```", ...rows.map(line), "```"].join("\n");
}

/** The firm's admins, as a set of ids. */
async function adminIdsOf(client: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await client.from("profiles").select("id").eq("role", "admin");
  if (error) throw new Error(`profiles/admins: ${error.message}`);
  return new Set((data ?? []).map((row) => String(row.id)));
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

  const adminIds = await adminIdsOf(client);
  const skip = await leftOut(client, adminIds);
  const [draftRows, uploadRows, downloadRows, accounts, waitlist, views] = await Promise.all([
    eventRows(client, "draft_generated", from, to, skip),
    eventRows(client, "source_uploaded", from, to, skip),
    eventRows(client, "draft_exported", from, to, skip),
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
  const people = new Set(views.map((row) => row.visitor_id ?? row.anon_id).filter(Boolean)).size;

  const startText = inSingapore(start);
  const endText = inSingapore(end);

  return {
    period_start: from,
    period_end: to,
    period_start_text: startText,
    period_end_text: endText,
    period_label: `${startText} – ${endText} (Singapore time)`,
    drafts_generated: draftRows.length,
    documents_uploaded: uploadRows.length,
    documents_downloaded: downloadRows.length,
    page_views: views.length,
    accounts_created: accounts,
    frequent_visitors: frequent,
    unique_visitors: frequent,
    visitors: arrivals,
    unique_people: people,
    drafts_users: usersIn(draftRows),
    uploads_users: usersIn(uploadRows),
    downloads_users: usersIn(downloadRows),
    visits: arrivals,
    waitlist_signups: waitlist,
    drafts_by_doc: byDoc(draftRows),
    downloads_by_doc: byDoc(downloadRows),
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
  /** Since records began, to the end of the window (same people left out). */
  totals: {
    drafts_generated: number;
    documents_downloaded: number;
    documents_uploaded: number;
    accounts_created: number;
    waitlist_signups: number;
    page_views: number;
    drafts_users: number;
    downloads_users: number;
    uploads_users: number;
  };
  /** Kept for Zaps built on 0139; the same as totals.drafts_generated / documents_downloaded. */
  drafts_lifetime: number;
  downloads_lifetime: number;
  /** The whole report as a Slack message (Slack's own *bold* markup). */
  slack_text: string;
  /** The same report as ONE real Slack table (Block Kit), as a JSON string
   *  for the Slack step's "Blocks" field. slack_summary is its fallback text
   *  (the notification preview). */
  slack_blocks: string;
  slack_summary: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayText(start: Date): string {
  const sg = new Date(start.getTime() + SINGAPORE_OFFSET_MS);
  return `${WEEKDAYS[sg.getUTCDay()]} ${sg.getUTCDate()} ${MONTHS[sg.getUTCMonth()]} ${sg.getUTCFullYear()}`;
}

/** Unique visitors and visits since records began, counted by the database
 *  (101). Null when the function is not there yet: the report says "not tracked". */
async function visitorTotals(client: SupabaseClient, end: string): Promise<{ people: number; visits: number } | null> {
  try {
    const { data, error } = await client.rpc("page_view_totals", { p_end: end });
    const row = (Array.isArray(data) ? data[0] : data) as { people?: number | string; visits?: number | string } | null;
    if (error || !row) return null;
    return { people: Number(row.people ?? 0), visits: Number(row.visits ?? 0) };
  } catch {
    return null;
  }
}

/** Page views since records began, admins' own left out (counted, not fetched). */
async function pageViewTotal(client: SupabaseClient, end: string, adminIds: Set<string>): Promise<number> {
  let query = client
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("name", "page_view")
    .lt("created_at", end);
  if (adminIds.size) query = query.or(`user_id.is.null,user_id.not.in.(${[...adminIds].join(",")})`);
  const { count, error } = await query;
  if (error) throw new Error(`events/page_view total: ${error.message}`);
  return count ?? 0;
}

/* ── THE REPORT, IN THE HOUSE FORMAT ───────────────────────────────────────
   Laid out like the team's weekly status report (Rachel: "see our format"):
   a title naming the two days, a "Document Process Funnel" table and an
   "Accounts / Traffic" table — each figure as "count / unique users", the
   days as columns, a running total — then an Explanation in plain words,
   so nobody has to work anything out. Sent as real Slack tables (Block
   Kit); slack_text is the same report as lines, for anywhere tables are not
   shown. */
type Cell = string;
type Table = { head: Cell[]; rows: Cell[][] };

function beforeOf(list: DocCount[], doc: string): DocCount | undefined {
  return list.find((x) => x.doc === doc);
}

const fmt = (x: number) => x.toLocaleString("en-GB");
const plural = (x: number, one: string, many: string) => `${fmt(x)} ${x === 1 ? one : many}`;
/** "12 (by 5 people)": how many, and how many different people. "0" when none. */
const cu = (count: number, users: number) => (count === 0 ? "0" : `${fmt(count)} (by ${plural(users, "person", "people")})`);

/** "92 fewer than Sat 17 Oct (−6%)", "3 more than Sat 17 Oct", "the same as Sat 17 Oct". */
export function moreOrFewer(now: number, prev: number, than: string): string {
  const d = now - prev;
  if (d === 0) return `the same as ${than}`;
  const pct = prev > 0 ? ` (${d > 0 ? "+" : "−"}${Math.round((Math.abs(d) / prev) * 100)}%)` : "";
  return `${fmt(Math.abs(d))} ${d > 0 ? "more" : "fewer"} than ${than}${pct}`;
}

/** "2 NDA, 1 Loan Agreement". */
const docBreakdown = (list: DocCount[]) => list.map((x) => `${fmt(x.count)} ${x.doc}`).join(", ");

const cellText = (text: string) => ({ type: "raw_text", text: text || " " });
const cellBold = (text: string) => ({
  type: "rich_text",
  elements: [{ type: "rich_text_section", elements: [{ type: "text", text: text || " ", style: { bold: true } }] }],
});
const tableBlock = (t: Table) => ({
  type: "table",
  column_settings: t.head.map((_, i) => ({ align: i === 0 ? "left" : "right" })),
  rows: [t.head.map(cellBold), ...t.rows.map((r) => r.map(cellText))],
});

export interface HouseReport {
  title: string;
  subtitle: string;
  funnelHeading: string;
  funnel: Table;
  trafficHeading: string;
  traffic: Table;
  explanation: string[];
}

export function slackBlocks(r: HouseReport): unknown[] {
  const md = (text: string) => ({ type: "section", text: { type: "mrkdwn", text } });
  return [
    md(`*${r.title}*\n_${r.subtitle}_`),
    md(r.funnelHeading),
    tableBlock(r.funnel),
    md(r.trafficHeading),
    tableBlock(r.traffic),
    md(`📝 _Explanation_\n${r.explanation.map((x) => `> ${x}`).join("\n")}`),
  ];
}

/** The same report as plain Slack lines (no tables). */
function plainText(r: HouseReport): string {
  const lines = (t: Table) =>
    t.rows.map((row) => `${row[0].startsWith(" ") ? "      " : "• "}${row[0].trim()}: ${row.slice(1).map((c, i) => `${t.head[i + 1]} *${c || "–"}*`).join(" · ")}`);
  return [
    `*${r.title}*`,
    `_${r.subtitle}_`,
    ``,
    r.funnelHeading,
    ...lines(r.funnel),
    ``,
    r.trafficHeading,
    ...lines(r.traffic),
    ``,
    `📝 _Explanation_`,
    ...r.explanation.map((x) => `> ${x}`),
  ].join("\n");
}

export async function getDailyReport(client: SupabaseClient, now = new Date()): Promise<DailyReport> {
  const { start, end } = completedDailyWindow(now);
  const adminIds = await adminIdsOf(client);
  const skip = await leftOut(client, adminIds);
  const ever = "1970-01-01T00:00:00.000Z";
  const to = end.toISOString();
  const [today, before, allDrafts, allDownloads, allUploads, allAccounts, allWaitlist, allViews] = await Promise.all([
    reportFor(client, start, end),
    reportFor(client, new Date(start.getTime() - DAY_MS), start),
    eventRows(client, "draft_generated", ever, to, skip),
    eventRows(client, "draft_exported", ever, to, skip),
    eventRows(client, "source_uploaded", ever, to, skip),
    countRows(client, "profiles", ever, to),
    countRows(client, "waitlist", ever, to),
    pageViewTotal(client, to, adminIds),
  ]);
  const visitsEver = await visitorTotals(client, to);
  const totals = {
    drafts_generated: allDrafts.length,
    documents_downloaded: allDownloads.length,
    documents_uploaded: allUploads.length,
    accounts_created: allAccounts,
    waitlist_signups: allWaitlist,
    page_views: allViews,
    drafts_users: usersIn(allDrafts),
    downloads_users: usersIn(allDownloads),
    uploads_users: usersIn(allUploads),
  };

  /* Each document named today carries its total (since records began) beside it. */
  const totalOf = (rows: EventRow[]) => new Map(byDoc(rows).map((x) => [x.doc, x.count]));
  const draftsEver = totalOf(allDrafts);
  const downloadsEver = totalOf(allDownloads);
  today.drafts_by_doc = today.drafts_by_doc.map((x) => ({ ...x, lifetime: draftsEver.get(x.doc) ?? x.count }));
  today.downloads_by_doc = today.downloads_by_doc.map((x) => ({ ...x, lifetime: downloadsEver.get(x.doc) ?? x.count }));


  const day = dayText(end);
  const short = (d: Date) => dayText(d).replace(/ \d{4}$/, "");
  const dayCol = short(end);
  const prevCol = short(start);

  /* Under each event, the documents behind it ("↳ NDA"), most first. */
  const docRowsFor = (now: DocCount[], prev: DocCount[], ever: Map<string, number>, everUsers: Map<string, number>) =>
    now.map((x) => {
      const b = beforeOf(prev, x.doc);
      return [`   ↳ ${x.doc}`, cu(x.count, x.users ?? 0), b ? cu(b.count, b.users ?? 0) : "0", cu(ever.get(x.doc) ?? x.count, everUsers.get(x.doc) ?? x.users ?? 0)];
    });
  const usersEver = (rows: EventRow[]) => new Map(byDoc(rows).map((x) => [x.doc, x.users ?? 0]));

  const report: HouseReport = {
    title: `📊 FD AI Daily Report — ${dayCol} vs ${prevCol}`,
    subtitle: `Each day = the 24 hours to 5pm Singapore time (${dayCol}: ${inSingapore(start)} – ${inSingapore(end)}) · test accounts and admins not counted`,
    funnelHeading: `📄 _Document Process Funnel_ (how many, and by how many different people)`,
    funnel: {
      head: ["Event", dayCol, prevCol, "Cumulative"],
      rows: [
        ["✍️ Drafts generated", cu(today.drafts_generated, today.drafts_users), cu(before.drafts_generated, before.drafts_users), cu(totals.drafts_generated, totals.drafts_users)],
        ...docRowsFor(today.drafts_by_doc, before.drafts_by_doc, draftsEver, usersEver(allDrafts)),
        ["⬇️ Documents downloaded", cu(today.documents_downloaded, today.downloads_users), cu(before.documents_downloaded, before.downloads_users), cu(totals.documents_downloaded, totals.downloads_users)],
        ...docRowsFor(today.downloads_by_doc, before.downloads_by_doc, downloadsEver, usersEver(allDownloads)),
        ["📤 Documents uploaded for review", cu(today.documents_uploaded, today.uploads_users), cu(before.documents_uploaded, before.uploads_users), cu(totals.documents_uploaded, totals.uploads_users)],
      ],
    },
    trafficHeading: `👥 _Accounts / Traffic_`,
    traffic: {
      head: ["Metric", dayCol, prevCol, "Cumulative / running total"],
      rows: [
        ["🆕 New accounts", fmt(today.accounts_created), fmt(before.accounts_created), `${fmt(totals.accounts_created)} (${fmt(totals.accounts_created - today.accounts_created)} + ${fmt(today.accounts_created)})`],
        ["📝 Waitlist sign-ups", fmt(today.waitlist_signups), fmt(before.waitlist_signups), `${fmt(totals.waitlist_signups)} (${fmt(totals.waitlist_signups - today.waitlist_signups)} + ${fmt(today.waitlist_signups)})`],
        ["👤 Unique visitors", fmt(today.unique_people), fmt(before.unique_people), visitsEver ? fmt(visitsEver.people) : "not tracked"],
        ["🚪 Visits", fmt(today.visitors), fmt(before.visitors), visitsEver ? fmt(visitsEver.visits) : "not tracked"],
        ["📈 Total page views", fmt(today.page_views), fmt(before.page_views), fmt(totals.page_views)],
      ],
    },
    explanation: [
      `📈 *Traffic.* ${plural(today.unique_people, "person", "people")} visited the website, ${moreOrFewer(today.unique_people, before.unique_people, prevCol)}. They viewed ${plural(today.page_views, "page", "pages")}, ${moreOrFewer(today.page_views, before.page_views, prevCol)}.`,
      today.drafts_generated === 0 && today.documents_downloaded === 0
        ? `📄 *Documents.* No drafts generated and no documents downloaded. Since records began: ${plural(totals.drafts_generated, "draft", "drafts")} and ${plural(totals.documents_downloaded, "download", "downloads")}.`
        : `📄 *Documents.* ${plural(today.drafts_generated, "draft", "drafts")} generated by ${plural(today.drafts_users, "person", "people")}${today.drafts_by_doc.length ? ` (${docBreakdown(today.drafts_by_doc)})` : ""} and ${plural(today.documents_downloaded, "document", "documents")} downloaded${today.downloads_by_doc.length ? ` (${docBreakdown(today.downloads_by_doc)})` : ""}. Since records began: ${plural(totals.drafts_generated, "draft", "drafts")} and ${plural(totals.documents_downloaded, "download", "downloads")}.`,
      `🆕 *Accounts.* ${today.accounts_created === 0 ? "No new accounts" : plural(today.accounts_created, "new account", "new accounts")} and ${today.waitlist_signups === 0 ? "no waitlist sign-ups" : plural(today.waitlist_signups, "waitlist sign-up", "waitlist sign-ups")} — now ${plural(totals.accounts_created, "account", "accounts")} in total.`,
    ],
  };
  const blocks = slackBlocks(report);
  const summary = `FD AI Daily Report · ${day}: ${report.explanation.map((x) => x.replace(/\*/g, "")).join(" ")}`;
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
    totals,
    drafts_lifetime: allDrafts.length,
    downloads_lifetime: allDownloads.length,
    slack_text: plainText(report),
    slack_blocks: JSON.stringify(blocks),
    slack_summary: summary,
  };
}
