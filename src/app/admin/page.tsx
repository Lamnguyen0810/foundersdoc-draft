import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import CreditsPanel, { type Action } from "./CreditsPanel";
import { ago, day, fmt, stamp } from "./parts";
import FilterSelect from "./FilterSelect";
import AiFiles from "./AiFiles";
import Questions, { type DocTypeForEditor, type FieldRow, type GroupRow } from "./Questions";
import Playbook, { type PlaybookInitial } from "./Playbook";
import Feedback, { type FeedbackInitial } from "./Feedback";
import Review, { type ReviewInitial } from "./Review";
import { FEEDBACK_COLUMNS, LESSON_COLUMNS } from "@/lib/feedback";
import { PLAYBOOK_COLUMNS } from "@/lib/playbook";
import PeriodSelect from "./PeriodSelect";
import InviteButton from "./InviteButton";
import type { FolderRow, SourceRow } from "@/lib/ai-library";
import { getWeeklyReport, type WeeklyReport } from "@/lib/weekly-report";
import "./dashboard.css";
import "./admin.css";
import { nameFallback } from "@/lib/draft-name";

/**
 * The admin console.
 *
 * ── WHAT CHANGED, AND WHY ───────────────────────────────────────────────────
 * This used to be the designer's admin prototype, served whole from a route
 * handler so the design stayed byte-for-byte. That was the right call while the
 * design WAS the page. It stopped being right for two reasons: the prototype's
 * numbers were invented — a random traffic generator, six fictional files, made
 * -up countries and devices — and the three-tab structure the firm actually
 * needs does not exist in it. Patching sample data out of a generated 78KB
 * string, one regular expression at a time, was going to be worse than owning
 * the page.
 *
 * So the page is React now, and the design's vocabulary lives in admin.css —
 * same cream, same yellow, same panels and pills — but every colour is an alias
 * of a token the rest of FD AI uses, so this screen follows the app into dark
 * mode instead of drifting away from it.
 *
 * ── THE RULE THIS PAGE IS BUILT ON ──────────────────────────────────────────
 * Every number on it is a count of rows that exist. Where there is nothing to
 * count, the panel says what would have to happen for it to fill up. Nothing is
 * modelled, estimated or seeded. A quiet month is allowed to look quiet.
 *
 * ── WHO CAN OPEN IT ─────────────────────────────────────────────────────────
 * `is_admin()` in the database decides — the same function the row-level
 * security policies use — and every RPC below asks it again for itself. The
 * check here gives a clean redirect; the check down there is the lock.
 */

export const metadata = { title: "Admin — FDAI" };
export const dynamic = "force-dynamic";

type Tab = "overview" | "weekly-report" | "documents" | "users" | "credits" | "ai-files" | "logs";

/* The design's six sections, in its order. Overview and Logs are in the
   sidebar because the design has them there; their panels say plainly that
   nothing is shown until the numbers behind them are recorded — some of
   what they draw (the drafting funnel's "downloaded Word", for one) is not
   yet an event this app records, and a figure that is not counted is not
   shown. */
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "weekly-report", label: "Weekly Report" },
  { id: "documents", label: "Documents" },
  { id: "users", label: "Users" },
  { id: "credits", label: "Credits & plans" },
  { id: "ai-files", label: "AI files" },
  { id: "logs", label: "Logs" },
];

/* Bookmarks from the three-tab console still land on the right panel. */
const OLD_TABS: Record<string, Tab> = { people: "users", billing: "credits" };

/* The periods every tab can be read over: a day, a week, a month, a quarter,
   a year. `admin_window()` in the database refuses anything beyond 365 days,
   so this list is also the outer limit of what any figure on the page can
   cover. Bookmarks holding an older value fall back to 30 days. */
const RANGES = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

/* ── row shapes, as the database returns them ────────────────────────────── */

interface DocRow {
  draft_id: string;
  owner_email: string | null;
  owner_name: string | null;
  title: string | null;
  doc_type: string;
  status: string;
  versions: number;
  created_at: string;
  updated_at: string;
}

interface AccountRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  joined_at: string;
  tier: string | null;
  sub_status: string | null;
  period_end: string | null;
  cancelling: boolean;
  balance: number;
  drafts_total: number;
  drafts_30d: number;
  last_draft_at: string | null;
}

interface WaitRow {
  email: string;
  name: string | null;
  company: string | null;
  note: string | null;
  status: string;
  created_at: string;
  /** When an account was made for this address. Null until one is. */
  account_at?: string | null;
}

interface EventRow {
  created_at: string;
  name: string;
  email: string | null;
  path: string | null;
  props: Record<string, unknown> | null;
}

interface ApprovalRow {
  title: string;
  status: string;
  approved_at: string | null;
  reviewed_at: string | null;
  uploaded_by_email: string | null;
  created_at: string;
}

/** An event name, said the way the design says it. */
function eventLabel(e: EventRow): string {
  const doc = typeof e.props?.doc_type === "string" ? String(e.props.doc_type).toUpperCase() : "a document";
  switch (e.name) {
    case "draft_generated": return `User generated ${doc === "NDA" ? "an NDA" : doc}`;
    case "draft_revised": return `User revised ${doc === "NDA" ? "an NDA" : doc}`;
    case "draft_exported": return "Word document downloaded";
    case "draft_failed": return `Generation failed (${doc})`;
    case "draft_started": return `Started answering for ${doc}`;
    case "doc_selected": return `Selected ${doc}`;
    case "ai_opened": return "Opened the catalogue";
    case "paywall_hit": return "Reached the paywall";
    case "sign_in_ok": return "Signed in";
    case "sign_in_failed": return "Sign-in failed";
    case "sign_up_started": return "Started sign-up";
    case "source_uploaded": return "Uploaded a source document";
    case "draft_abandoned": return "Left a draft unfinished";
    case "question_skipped": return "Skipped a question";
    default: return e.name.replace(/_/g, " ");
  }
}

/** One day, in Singapore time (see supabase/024_daily_and_hourly.sql). */
interface DailyRow {
  day: string;
  /** People. One person is one visitor, however often they came. */
  visitors: number;
  /** Of those, the ones who came more than three times in the period. */
  frequent: number;
  signups: number;
  visits: number;
  page_views: number;
  drafts: number;
}

/** One hour of an opened day, 0–23, in Singapore time. */
interface HourRow {
  hour: number;
  visits: number;
  page_views: number;
  signups: number;
}

/** One thing that happened on an opened day. */
interface DayEvent {
  at: string;
  kind: string;
  who: string | null;
  detail: string | null;
  country: string | null;
  device: string | null;
}

interface Breakdown {
  label: string;
  /** Arrivals. Four pages in one sitting is one visitor. */
  visitors: number;
  /** Of those, the ones who came more than three separate times. */
  frequent: number;
  /** Pages opened. */
  views: number;
}

/* The design's drafting funnel, in its order. Each step is an event the app
   already records, so the count is a count of people who did it. */
const FUNNEL_STEPS: { id: string; label: string }[] = [
  { id: "ai_opened", label: "Opened catalogue" },
  { id: "doc_selected", label: "Selected document" },
  { id: "draft_generated", label: "Generated draft" },
  { id: "draft_exported", label: "Downloaded Word" },
];

/** One line of the Logs table, whatever it was read from. */
interface LogLine {
  at: string;
  kind: "Admin" | "System" | "Billing" | "Files";
  text: string;
  who: string | null;
  status: "Success" | "Failed" | "Logged" | "Info";
}

/** The start of the selected period, as a timestamp. */
function periodStart(days: number): number {
  return Date.now() - days * 86_400_000;
}

/** One line of a breakdown table: the name, then the three figures its
 *  header names. Numbers are right-aligned and tabular so they line up. */
function BreakdownRow({ label, row, uniqueKnown }: { label: string; row: Breakdown; uniqueKnown: boolean }) {
  return (
    <div className="breakdown-row">
      <span title={label}>{label}</span>
      <b>{fmt(n(row.visitors))}</b>
      <b className="quiet">{uniqueKnown ? fmt(n(row.frequent)) : "—"}</b>
      <b className="quiet">{fmt(n(row.views))}</b>
    </div>
  );
}

/** One day. The bar behind it is that day's visits against the busiest day
 *  in view, so a quiet week is not drawn as a busy one. */
function DayRow({
  label,
  row,
  busiest,
  href,
  open,
}: {
  label: string;
  row: DailyRow;
  busiest: number;
  href: string;
  open: boolean;
}) {
  const share = Math.round((n(row.visits) / busiest) * 100);
  /* A day with arrivals but no lasting visitor code is a day from before
     unique visitors were switched on. Nought would read as "nobody came
     often", which is not what it means; a dash reads as "not recorded". */
  const unique = n(row.visitors) === 0 && n(row.visits) > 0 ? "—" : fmt(n(row.frequent));
  return (
    <Link
      className={`breakdown-row daily${open ? " open" : ""}`}
      href={href}
      style={{ backgroundImage: `linear-gradient(to right, var(--day-bar) ${share}%, transparent ${share}%)` }}
    >
      <span>{label}</span>
      <b>{fmt(n(row.visits))}</b>
      <b className="quiet">{unique}</b>
      <b className={n(row.signups) > 0 ? "lit" : "quiet"}>{fmt(n(row.signups))}</b>
      <b className="quiet">{fmt(n(row.page_views))}</b>
      <b className="quiet">{fmt(n(row.drafts))}</b>
    </Link>
  );
}

/** An event name from admin_day_events, in the firm's words. */
function dayEventLabel(kind: string): string {
  switch (kind) {
    case "signup": return "Joined the waitlist";
    case "draft": return "Started a draft";
    case "draft_generated": return "Draft generated";
    case "draft_revised": return "Draft revised";
    case "draft_exported": return "Downloaded Word";
    case "draft_failed": return "Generation failed";
    case "draft_abandoned": return "Left a draft unfinished";
    case "source_uploaded": return "Uploaded a document";
    case "paywall_hit": return "Ran out of credits";
    case "sign_up_started": return "Created an account";
    case "sign_in_ok": return "Signed in";
    case "sign_in_failed": return "Sign-in failed";
    case "contact_submit": return "Sent the enquiry form";
    case "consult_click": return "Pressed Book a consultation";
    case "launch_fdai_click": return "Pressed Launch FD AI";
    default: return kind.replace(/_/g, " ");
  }
}

/** What each column of a breakdown table means, said once under it. */
function BreakdownKey() {
  return (
    <p className="list-key">
      <b>Visitors</b>: arrivals · <b>Unique</b>: came more than three times · <b>Views</b>: pages opened
    </p>
  );
}

/** The design's summary tile. */
function SummaryCard({ label, value, note }: { label: string; value: string; note: React.ReactNode }) {
  return (
    <div className="summary-card">
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
      <div className="summary-note">{note}</div>
    </div>
  );
}

interface FunnelRow {
  step: string;
  label: string;
  people: number;
}

/** Numbers arrive from PostgREST as numbers or as numeric strings. */
function n(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number.parseFloat(v) || 0;
  return 0;
}

function tabHref(tab: Tab, days: number, q?: string): string {
  const p = new URLSearchParams({ tab, days: String(days) });
  if (q) p.set("q", q);
  return `/admin?${p.toString()}`;
}

/** A plan, said the way FD would say it out loud. */
function planLabel(row: AccountRow): { text: string; tone: string } {
  if (!row.tier) return { text: "No membership", tone: "" };
  const name = row.tier.charAt(0).toUpperCase() + row.tier.slice(1);
  if (row.sub_status === "past_due") return { text: `${name} — payment failed`, tone: "error" };
  if (row.cancelling) return { text: `${name} — ending`, tone: "review" };
  if (row.sub_status === "trialing") return { text: `${name} — trial`, tone: "approved" };
  return { text: name, tone: "ready" };
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; days?: string; q?: string; status?: string; kind?: string; wl?: string; day?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/draft");

  const user = await getUser();
  if (!user) redirect("/login?next=%2Fadmin");
  if (!(await isAdmin())) redirect("/draft");

  const sp = await searchParams;
  const asked = OLD_TABS[sp.tab ?? ""] ?? sp.tab;
  const tab: Tab = TABS.some((t) => t.id === asked) ? (asked as Tab) : "ai-files";
  const days = RANGES.some((r) => String(r.days) === sp.days) ? Number(sp.days) : 30;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const status = ["draft", "final", "failed"].includes(sp.status ?? "") ? (sp.status as string) : "";
  const kind = ["Admin", "System", "Billing", "Files"].includes(sp.kind ?? "") ? (sp.kind as string) : "";
  /* Which signups the waitlist table lists: everyone (the default — nobody
     should vanish from a list of people waiting), or only those who joined
     inside the selected period. The figures above it follow the period
     either way. */
  const waitScope: "all" | "period" = sp.wl === "period" ? "period" : "all";
  /* A day opened from the Day by day list, as YYYY-MM-DD in Singapore time.
     Anything else is ignored rather than passed to the database. */
  const openDay = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") ? (sp.day as string) : "";

  const supabase = await createClient();
  let weeklyReport: WeeklyReport | null = null;
  let weeklyReportError = false;
  if (tab === "weekly-report") {
    try {
      weeklyReport = await getWeeklyReport(supabase);
    } catch (error) {
      weeklyReportError = true;
      console.error("[admin] weekly report failed", error);
    }
  }

  /* ── AI files: the library and the catalogue's questions ──────────────
     Sources are listed WITHOUT their text: the content column can be tens of
     kilobytes a row and the table shows none of it. */
  let sources: SourceRow[] = [];
  let folders: FolderRow[] = [];
  let catalogue: DocTypeForEditor[] = [];
  let libraryMissing = false;
  let rankingMissing = false;
  let stepsMissing = false;
  let playbook: PlaybookInitial = { scope: "*", live: null, versions: [], missing: false };
  let feedbackInitial: FeedbackInitial = { feedback: [], lessons: [], missing: false };
  let reviewInitial: ReviewInitial = { queue: [], missing: false };
  if (tab === "ai-files") {
    const BASE_COLS =
      "id,folder_id,doc_type_slug,title,filename,file_ext,jurisdiction,version,privacy,privacy_flags,status,permitted,note,bytes,uploaded_by_email,reviewed_at,approved_at,created_at,updated_at";
    /* Rank and redaction columns arrive with 016. Until that has been run the
       list is read without them, and the tab says which file to run rather
       than showing an empty library. */
    let srcRes: { data: unknown; error: { message: string } | null } = await supabase
      .from("ai_sources")
      .select(`${BASE_COLS},rank,redacted_at,redaction_count`)
      .order("doc_type_slug")
      .order("rank", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (srcRes.error && /rank|redacted_at|redaction_count/.test(srcRes.error.message)) {
      rankingMissing = true;
      srcRes = await supabase.from("ai_sources").select(BASE_COLS).order("updated_at", { ascending: false });
    }
    /* The questions editor reads the live form and any saved draft. Before
       017 the draft columns are not there; the editor then works as it did,
       and says which file to run. */
    let catRes: { data: unknown; error: { message: string } | null } = await supabase
      .from("doc_types")
      .select("slug,label,fields,groups,draft,draft_saved_at,published_at")
      .eq("is_active", true)
      .order("label");
    if (catRes.error && /groups|draft|published_at/.test(catRes.error.message)) {
      stepsMissing = true;
      catRes = await supabase.from("doc_types").select("slug,label,fields").eq("is_active", true).order("label");
    }
    const folRes = await supabase.from("ai_folders").select("id,name").order("name");
    if (srcRes.error && /ai_sources/.test(srcRes.error.message)) libraryMissing = true;
    sources = ((srcRes.data as Partial<SourceRow>[] | null) ?? []).map((r) => ({
      rank: null,
      redacted_at: null,
      redaction_count: 0,
      ...r,
    })) as SourceRow[];
    folders = (folRes.data as FolderRow[] | null) ?? [];
    catalogue = (
      (catRes.data ?? []) as {
        slug: string; label: string; fields: FieldRow[] | null; groups?: GroupRow[] | null;
        draft?: { fields?: FieldRow[]; groups?: GroupRow[] } | null; draft_saved_at?: string | null; published_at?: string | null;
      }[]
    ).map((d) => ({
      slug: d.slug,
      label: d.label,
      fields: d.fields ?? [],
      groups: d.groups ?? null,
      draft: d.draft && Array.isArray(d.draft.fields) ? { fields: d.draft.fields, groups: d.draft.groups ?? null } : null,
      draftSavedAt: d.draft_saved_at ?? null,
      publishedAt: d.published_at ?? null,
    }));

    /* ── THE PLAYBOOK, FOR THE FIRST DOCUMENT TYPE ─────────────────────────
       Read here so the panel opens filled. Other scopes are fetched when
       chosen. Before 044 the table is not there; the panel then says which
       file to run and nothing else on the tab is affected. */
    const firstScope = catalogue[0]?.slug ?? "*";
    const [pbVersions, pbLive] = await Promise.all([
      supabase.from("playbooks").select(PLAYBOOK_COLUMNS).eq("scope", firstScope).order("version", { ascending: false }),
      supabase.from("playbooks").select(`${PLAYBOOK_COLUMNS},content`).eq("scope", firstScope).eq("live", true).maybeSingle(),
    ]);
    playbook = {
      scope: firstScope,
      missing: Boolean(pbVersions.error && /playbooks/.test(pbVersions.error.message)),
      live: (pbLive.data as PlaybookInitial["live"]) ?? null,
      versions: (pbVersions.data as PlaybookInitial["versions"] | null) ?? [],
    };

    /* Feedback and lessons (045), for the panel beneath the playbook. */
    const [fb, ls] = await Promise.all([
      supabase.from("draft_feedback").select(FEEDBACK_COLUMNS).order("created_at", { ascending: false }).limit(200),
      supabase.from("playbook_lessons").select(LESSON_COLUMNS).order("created_at", { ascending: false }).limit(500),
    ]);
    feedbackInitial = {
      feedback: (fb.data as FeedbackInitial["feedback"] | null) ?? [],
      lessons: (ls.data as FeedbackInitial["lessons"] | null) ?? [],
      missing: Boolean(fb.error && /draft_feedback/.test(fb.error.message)),
    };
    /* Term sheets held or stopped by the playbook (048). */
    const rq = await supabase.rpc("review_queue");
    reviewInitial = {
      queue: (rq.data as ReviewInitial["queue"] | null) ?? [],
      missing: Boolean(rq.error && /review_queue|does not exist/i.test(rq.error.message)),
    };
  }

  /* The utility strip says what needs a person. Only what is counted. */
  const { count: awaitingReview } = await supabase
    .from("ai_sources")
    .select("id", { count: "exact", head: true })
    .eq("status", "needs_review");

  /* Each tab fetches only what it shows. The alternative — one query bundle for
     the whole console — makes every tab pay for the other two. */
  /* Each tab fetches only what it shows. Overview draws on the document,
     user and plan figures together, so it asks for all three. */
  /* Document stats are read on every tab: the utility strip counts the
     period's generation failures whichever panel is open. */
  const wantDocs = true;
  const wantUsers = tab === "users" || tab === "overview" || tab === "logs";
  const wantPlans = tab === "credits" || tab === "overview" || tab === "logs";
  const wantEvents = tab === "overview" || tab === "logs";

  const [
    docStats,
    docTypes,
    uploadFormats,
    docs,
    userStats,
    funnelRes,
    pages,
    countries,
    devices,
    visitsRes,
    dailyRes,
    dayHoursRes,
    dayEventsRes,
    waitRes,
    planStats,
    accounts,
    creditLog,
    eventsRes,
    approvalsRes,
  ] = await Promise.all([
    wantDocs ? supabase.rpc("admin_document_stats", { p_days: days }) : null,
    tab === "documents" ? supabase.rpc("admin_doc_type_counts", { p_days: days }) : null,
    tab === "documents" ? supabase.rpc("admin_upload_formats", { p_days: days }) : null,
    tab === "documents"
      ? supabase.rpc("admin_documents", { p_days: days, p_limit: 100, p_search: q || null })
      : null,
    wantUsers ? supabase.rpc("admin_user_stats", { p_days: days }) : null,
    tab === "users" || tab === "overview" ? supabase.rpc("admin_funnel", { p_days: days }) : null,
    tab === "users" ? supabase.rpc("admin_event_breakdown", { p_kind: "path", p_days: days, p_limit: 50 }) : null,
    tab === "users" ? supabase.rpc("admin_event_breakdown", { p_kind: "country", p_days: days, p_limit: 50 }) : null,
    tab === "users" ? supabase.rpc("admin_event_breakdown", { p_kind: "device", p_days: days, p_limit: 5 }) : null,
    tab === "users" ? supabase.rpc("admin_visits", { p_days: days }) : null,
    tab === "users" ? supabase.rpc("admin_daily", { p_days: days }) : null,
    tab === "users" && openDay ? supabase.rpc("admin_day_hours", { p_day: openDay }) : null,
    tab === "users" && openDay ? supabase.rpc("admin_day_events", { p_day: openDay, p_limit: 200 }) : null,
    tab === "users"
      ? supabase
          .from("waitlist")
          /* `*` rather than a column list, deliberately. `account_at` arrives
             with 034, and naming it here would make this whole table go blank
             on a database where 034 has not been run yet — while blaming 005,
             which is the file the error hint below is attached to. With `*` the
             page works before and after, and the column is simply absent until
             the migration adds it. */
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200)
      : null,
    wantPlans ? supabase.rpc("admin_plan_stats", { p_days: days }) : null,
    tab === "credits" || tab === "logs" ? supabase.rpc("admin_accounts", { p_limit: 200, p_search: tab === "credits" && q ? q : null }) : null,
    tab === "logs" ? supabase.rpc("admin_recent_credit_actions", { p_limit: 50 }) : null,
    wantEvents ? supabase.rpc("admin_recent_events", { p_days: days, p_limit: tab === "logs" ? 100 : 8 }) : null,
    wantEvents
      ? supabase
          .from("ai_sources")
          .select("title,status,approved_at,reviewed_at,uploaded_by_email,created_at")
          .order("updated_at", { ascending: false })
          .limit(20)
      : null,
  ]);

  /* If a migration has not been run the page still opens and names the file to
     run, rather than throwing. An admin page that 500s tells nobody anything. */
  const problems: string[] = [];
  for (const [res, hint] of [
    [docStats, "supabase/011_admin_console.sql"],
    [docs, "supabase/011_admin_console.sql"],
    [userStats, "supabase/011_admin_console.sql"],
    [planStats, "supabase/011_admin_console.sql"],
    [accounts, "supabase/011_admin_console.sql"],
    [funnelRes, "supabase/003_events.sql"],
    [waitRes, "supabase/005_waitlist.sql"],
    [visitsRes, "supabase/022_unique_visitors.sql"],
    [dailyRes, "supabase/024_daily_and_hourly.sql"],
    [dayHoursRes, "supabase/025_day_detail.sql"],
    [dayEventsRes, "supabase/025_day_detail.sql"],
    [uploadFormats, "supabase/023_upload_stats.sql"],
    [pages, "supabase/029_breakdown_in_step.sql"],
    [eventsRes, "supabase/015_admin_activity.sql"],
  ] as const) {
    if (res?.error && !problems.includes(hint)) problems.push(hint);
  }

  const ds = (docStats?.data ?? {}) as Record<string, unknown>;
  const us = (userStats?.data ?? {}) as Record<string, unknown>;
  const ps = (planStats?.data ?? {}) as Record<string, unknown>;
  const docRows = (docs?.data as DocRow[] | null) ?? [];
  const dailyRows = (dailyRes?.data as DailyRow[] | null) ?? [];
  const dayHours = (dayHoursRes?.data as HourRow[] | null) ?? [];
  const dayEvents = (dayEventsRes?.data as DayEvent[] | null) ?? [];
  /* The busiest day sets the scale of the bars, so a quiet week does not
     draw itself as a busy one. */
  const busiestDay = Math.max(1, ...dailyRows.map((d) => n(d.visits)));
  const busiestDayHour = Math.max(1, ...dayHours.map((h) => n(h.page_views)));
  /* "Tue 17 Sep". The date arrives as a plain YYYY-MM-DD that the database has
     already worked out in Singapore time, so it is read back as UTC to keep it
     exactly that day rather than shifting it again. */
  const dayHref = (iso: string) =>
    iso === openDay
      ? `/admin?tab=users&days=${days}${waitScope === "period" ? "&wl=period" : ""}`
      : `/admin?tab=users&days=${days}${waitScope === "period" ? "&wl=period" : ""}&day=${iso}#day`;
  /* "Thursday 17 September 2026", for the heading of an opened day. */
  const dayTitle = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    });
  /* A timestamp as the clock read in Singapore. */
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Singapore" });
  const dayLabel = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
    });

  /* Which file formats people attached while drafting. Only events that
     carry a format appear — the ones recorded before the drafting screen
     started sending it are counted in the tile above, not guessed at here. */
  const formatRows = (uploadFormats?.data as { label: string; uploads: number }[] | null) ?? [];
  const formatsCounted = formatRows.reduce((a, r) => a + n(r.uploads), 0);
  const typeRows = (docTypes?.data as { label: string; drafts: number }[] | null) ?? [];
  const funnel = (funnelRes?.data as FunnelRow[] | null) ?? [];
  const pageRows = (pages?.data as Breakdown[] | null) ?? [];
  const countryRows = (countries?.data as Breakdown[] | null) ?? [];
  const deviceRows = (devices?.data as Breakdown[] | null) ?? [];
  /* The visitor counter. Countries arrive as two-letter codes from Vercel's
     header; they are shown by name. */
  const visitsRow = (Array.isArray(visitsRes?.data) ? visitsRes.data[0] : visitsRes?.data) as
    | {
        visitors: number | string;
        frequent: number | string;
        visits: number | string;
        page_views: number | string;
        countries: number | string;
        first_day: string | null;
        last_day: string | null;
        visitors_from: string | null;
      }
    | null
    | undefined;
  const visits = visitsRow
    ? {
        visitors: n(visitsRow.visitors),
        frequent: n(visitsRow.frequent),
        visits: n(visitsRow.visits),
        pageViews: n(visitsRow.page_views),
        countries: n(visitsRow.countries),
        firstDay: visitsRow.first_day,
        lastDay: visitsRow.last_day,
        visitorsFrom: visitsRow.visitors_from,
      }
    : null;
  /* Unique visitors need ANALYTICS_SALT set on the server: without it the site
     records no visitor fingerprint and the figure would be a nought that means
     "not switched on", not "nobody came". A dash says that honestly. */
  const visitorsRecorded = Boolean(visits && visits.visitors > 0);
  const countryName = (() => {
    try {
      const names = new Intl.DisplayNames(["en"], { type: "region" });
      return (code: string) => {
        if (!/^[A-Z]{2}$/.test(code)) return code;
        try {
          return names.of(code) ?? code;
        } catch {
          return code;
        }
      };
    } catch {
      return (code: string) => code;
    }
  })();
  /* Said the way the selector says it, so the two never disagree. */
  const periodLabel = `the last ${RANGES.find((r) => r.days === days)?.label ?? `${days} days`}`;
  /* When unique visitors started being counted, if that is later than the
     period itself — the reason the two figures do not match. */
  const visitorsFromLabel = (() => {
    if (!visits?.visitorsFrom || !visits.firstDay) return null;
    if (visits.visitorsFrom <= visits.firstDay) return null;
    return new Date(`${visits.visitorsFrom}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });
  })();

  /* The dates the figures actually cover: the first and last day on which
     anything was recorded inside the window, not the window's own edges. */
  const dateRange = (() => {
    if (!visits?.firstDay || !visits.lastDay) return null;
    const one = (iso: string) =>
      new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return visits.firstDay === visits.lastDay ? one(visits.firstDay) : `${one(visits.firstDay)} – ${one(visits.lastDay)}`;
  })();
  const waitlist = (waitRes?.data as WaitRow[] | null) ?? [];
  const accountRows = (accounts?.data as AccountRow[] | null) ?? [];
  const creditActions = (creditLog?.data as Action[] | null) ?? [];
  const events = (eventsRes?.data as EventRow[] | null) ?? [];
  const approvals = (approvalsRes?.data as ApprovalRow[] | null) ?? [];

  /* The Documents table's status filter and the Waitlist search are applied
     here; both lists are already bounded by the queries above. */
  const docRowsShown = status ? docRows.filter((d) => d.status === status) : docRows;
  const qLower = q.toLowerCase();
  const waitlistInScope =
    waitScope === "period" ? waitlist.filter((w) => new Date(w.created_at).getTime() >= periodStart(days)) : waitlist;
  const waitlistShown = q
    ? waitlistInScope.filter((w) =>
        [w.email, w.name, w.company, w.note].some((v) => (v ?? "").toLowerCase().includes(qLower)),
      )
    : waitlistInScope;
  const members = n(ps.members_basic) + n(ps.members_pro) + n(ps.members_unlimited);

  /* The Logs table is four sources read side by side, newest first: the
     events the app records (System), credit grants and revokes (Admin), AI
     files reviewed or approved (Files) and memberships whose payment failed
     (Billing). Nothing is invented for a quiet day. */
  /* Everyone on the list, all time: the same definition the site sends to the
     firm's Zap as `total`, so the two never disagree. */
  const onList = n(us.waitlist_waiting) + n(us.waitlist_invited);
  /* The equal period before this one, for an honest comparison rather than a
     number floating on its own. admin_user_stats counts it; where it does not
     (an older database), the line says nothing instead of guessing. */
  const joinedBefore = us.waitlist_prev === undefined || us.waitlist_prev === null ? null : n(us.waitlist_prev);
  const since = periodStart(days);
  const logRows: LogLine[] = [];
  for (const e of events) {
    logRows.push({
      at: e.created_at,
      kind: "System",
      text: eventLabel(e),
      who: e.email,
      status: /failed/.test(e.name) ? "Failed" : "Success",
    });
  }
  for (const a of creditActions) {
    if (new Date(a.created_at).getTime() < since) continue;
    logRows.push({
      at: a.created_at,
      kind: "Admin",
      text: `${a.action === "grant" ? "Granted" : "Revoked"} ${fmt(n(a.credits))} credit${n(a.credits) === 1 ? "" : "s"}${a.subject_email ? ` — ${a.subject_email}` : ""}${a.reason ? ` (${a.reason})` : ""}`,
      who: a.actor_email,
      status: "Logged",
    });
  }
  for (const f of approvals) {
    const at = f.approved_at ?? f.reviewed_at ?? f.created_at;
    if (new Date(at).getTime() < since) continue;
    logRows.push({
      at,
      kind: "Files",
      text: f.status === "ready" ? `${f.title} approved for AI` : f.status === "needs_review" ? `${f.title} uploaded` : `${f.title} reviewed`,
      who: f.uploaded_by_email,
      status: f.status === "ready" ? "Success" : "Logged",
    });
  }
  if (tab === "logs") {
    for (const a of accountRows) {
      if (a.sub_status === "past_due") {
        logRows.push({ at: a.period_end ?? a.joined_at, kind: "Billing", text: `Payment failed — ${a.tier ?? "membership"}`, who: a.email, status: "Failed" });
      }
    }
  }
  logRows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const logShown = kind ? logRows.filter((l) => l.kind === kind) : logRows;


  return (
    <main className="fdadmin">
      <div className="page">
        <section className="hero">
          <div>
            <h1>Admin Dashboard</h1>
          </div>
          <div className="hero-actions">
            <div className={tab === "ai-files" || tab === "weekly-report" ? "period-group is-hidden" : "period-group"}>
              <span className="period-label">Period</span>
              <PeriodSelect tab={tab} days={days} q={q} ranges={RANGES} />
              <Link className="btn refresh-btn" href={tabHref(tab, days, q)}>
                Refresh
              </Link>
            </div>
          </div>
        </section>

        <div className="dashboard-shell">
          <aside className="side-nav-wrap">
            <div className="side-card">
              <div className="side-card-head">
                <h3>ADMIN</h3>
              </div>
              <nav className="tabs" aria-label="Admin sections">
                {TABS.map((t) => (
                  <Link
                    key={t.id}
                    href={tabHref(t.id, days)}
                    className={t.id === tab ? "tab active" : "tab"}
                    data-panel={t.id}
                    aria-current={t.id === tab ? "page" : undefined}
                  >
                    {t.label}
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          <div className="dashboard-content">
            {problems.length > 0 && (
              <div className="setup-note">
                  <strong>Some tables or functions are missing.</strong> Run{" "}
                  {problems.map((p, i) => (
                    <span key={p}>
                      {i > 0 && ", "}
                      <code>{p}</code>
                    </span>
                  ))}{" "}
                  in the Supabase SQL editor. Figures below are incomplete until you do.
              </div>
            )}

            {/* ── OVERVIEW ──────────────────────────────────────────────── */}
            {tab === "overview" && (
              <>
                <div className="summary">
                  <SummaryCard label="Drafts" value={fmt(n(ds.period))} note="Selected period" />
                  <SummaryCard label="Active users" value={fmt(n(us.active_period))} note="Drafted in the selected period" />
                  <SummaryCard label="Credits used" value={fmt(n(ps.spent_period))} note="Selected period" />
                  <SummaryCard label="Model requests" value={fmt(n(us.ai_requests))} note="Selected period" />
                </div>
                <div className="grid-2">
                  <div className="card">
                    <div className="card-head"><div><h2>Needs attention</h2></div></div>
                    <div className="card-body">
                      <div className="attention-list">
                        <div className="attention-row">
                          <span className={n(ds.failed) > 0 ? "dot err" : "dot"} />
                          <span>{n(ds.failed) > 0 ? `${fmt(n(ds.failed))} generation failure${n(ds.failed) === 1 ? "" : "s"}` : "No generation failures"}</span>
                          {n(ds.failed) > 0 ? <Link className="btn" href={tabHref("logs", days)}>Open</Link> : <span className="badge green">Healthy</span>}
                        </div>
                        <div className="attention-row">
                          <span className={(awaitingReview ?? 0) > 0 ? "dot warn" : "dot"} />
                          <span>{(awaitingReview ?? 0) > 0 ? `${awaitingReview} AI file${awaitingReview === 1 ? "" : "s"} need${awaitingReview === 1 ? "s" : ""} review` : "No AI files waiting"}</span>
                          {(awaitingReview ?? 0) > 0 ? <Link className="btn" href={tabHref("ai-files", days)}>Review</Link> : <span className="badge green">Healthy</span>}
                        </div>
                        <div className="attention-row">
                          <span className={n(ps.past_due) > 0 ? "dot err" : "dot"} />
                          <span>{n(ps.past_due) > 0 ? `${fmt(n(ps.past_due))} failed payment${n(ps.past_due) === 1 ? "" : "s"}` : "No failed payments"}</span>
                          {n(ps.past_due) > 0 ? <Link className="btn" href={tabHref("credits", days)}>Open</Link> : <span className="badge green">Healthy</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-head"><div><h2>Drafting funnel</h2></div></div>
                    <div className="card-body">
                      <div className="funnel">
                        {FUNNEL_STEPS.map((step) => {
                          const row = funnel.find((f) => f.step === step.id);
                          return (
                            <div className="funnel-step" key={step.id}>
                              <b>{row ? fmt(n(row.people)) : "—"}</b>
                              <span>{step.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="table-card">
                  <div className="table-head">
                    <div><h2>Recent activity</h2></div>
                    <Link className="btn" href={tabHref("logs", days)}>View all logs</Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Event</th><th>User</th><th>When</th></tr></thead>
                      <tbody>
                        {events.length === 0 && (
                          <tr><td colSpan={3}><div className="empty">Nothing recorded in the selected period.</div></td></tr>
                        )}
                        {events.map((e, i) => (
                          <tr key={`${e.created_at}-${i}`}>
                            <td>{eventLabel(e)}</td>
                            <td>{e.email ?? "—"}</td>
                            <td>{ago(e.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── WEEKLY REPORT ─────────────────────────────────────────── */}
            {tab === "weekly-report" && (
              <>
                {weeklyReportError && (
                  <div className="setup-note">
                    <strong>The weekly report could not be prepared.</strong> Check the server logs and confirm the analytics tables are installed.
                  </div>
                )}
                {weeklyReport && (
                  <>
                    <div className="card">
                      <div className="card-head">
                        <div>
                          <h2>Weekly Report</h2>
                          <p>
                            {stamp(weeklyReport.period_start)} to {stamp(weeklyReport.period_end)}, Singapore time. These are the same numbers sent to Zapier.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="summary">
                      <SummaryCard label="Drafts generated" value={fmt(weeklyReport.drafts_generated)} note="Successful generations" />
                      <SummaryCard label="Documents uploaded" value={fmt(weeklyReport.documents_uploaded)} note="Files attached" />
                      <SummaryCard label="Documents downloaded" value={fmt(weeklyReport.documents_downloaded)} note="Word exports" />
                      <SummaryCard label="Page views" value={fmt(weeklyReport.page_views)} note="Admin traffic excluded" />
                    </div>
                    <div className="summary">
                      <SummaryCard label="Accounts created" value={fmt(weeklyReport.accounts_created)} note="New FD AI accounts" />
                      <SummaryCard label="Visitors" value={fmt(weeklyReport.visitors)} note="Arrivals; one sitting counts once" />
                      <SummaryCard
                        label="Unique visitors"
                        value={fmt(weeklyReport.unique_visitors)}
                        note="Came more than three times; counted in Visitors too"
                      />
                      <SummaryCard label="Waitlist sign-ups" value={fmt(weeklyReport.waitlist_signups)} note="New waitlist entries" />
                    </div>
                    <div className="card">
                      <div className="card-head"><div><h2>Zapier connection</h2></div></div>
                      <div className="card-body">
                        <p>POST <code>/api/analytics/weekly</code> with the header <code>Authorization: Bearer [ANALYTICS_REPORT_SECRET]</code>.</p>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── DOCUMENTS ─────────────────────────────────────────────── */}
            {tab === "documents" && (
              <>
                <div className="summary">
                  <SummaryCard label="Drafts" value={fmt(n(ds.period))} note={`${fmt(n(ds.total))} all time`} />
                  <SummaryCard label="Word downloads" value={fmt(n(ds.exported))} note="Selected period" />
                  <SummaryCard
                    label="Documents uploaded"
                    value={fmt(n(ds.uploaded))}
                    note={`Selected period · ${fmt(n(ds.uploaded_total))} all time, by ${fmt(n(ds.uploaders))} ${n(ds.uploaders) === 1 ? "person" : "people"}`}
                  />
                  <SummaryCard
                    label="Failures"
                    value={fmt(n(ds.failed))}
                    note={n(ds.failed) > 0 ? <span className="bad">Needs review</span> : <span className="good">None</span>}
                  />
                </div>
                <div className="grid-2">
                  <div className="card">
                    <div className="card-head"><div><h2>Document types</h2></div></div>
                    <div className="card-body">
                      <div className="simple-list">
                        {typeRows.length === 0 && <div className="empty">Nothing drafted in the selected period.</div>}
                        {typeRows.map((t) => (
                          <div className="simple-row" key={t.label}><span>{t.label}</span><strong>{fmt(n(t.drafts))}</strong></div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-head"><div><h2>Draft quality</h2></div></div>
                    <div className="card-body">
                      <div className="simple-list">
                        <div className="simple-row"><span>Right first time</span><strong>{fmt(n(ds.untouched))}</strong></div>
                        <div className="simple-row"><span>Revised at least once</span><strong>{fmt(n(ds.revisions))}</strong></div>
                        <div className="simple-row"><span>Started from an uploaded document</span><strong>{fmt(n(ds.uploaded))}</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="card">
                    <div className="card-head">
                      <div>
                        <h2>Uploaded file formats</h2>
                        <p>What people attached while drafting, {periodLabel}. File names and their contents are never recorded.</p>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="simple-list">
                        {formatRows.length === 0 && (
                          <div className="empty">
                            {n(ds.uploaded) > 0
                              ? "These uploads were recorded before the format was tracked."
                              : "Nothing uploaded in the selected period."}
                          </div>
                        )}
                        {formatRows.map((f) => (
                          <div className="simple-row" key={f.label}>
                            <span>{f.label === "docx" ? "Word (.docx)" : f.label === "pdf" ? "PDF" : f.label.toUpperCase()}</span>
                            <strong>{fmt(n(f.uploads))}</strong>
                          </div>
                        ))}
                      </div>
                      {formatRows.length > 0 && n(ds.uploaded) > formatsCounted && (
                        <p className="list-key">
                          {fmt(n(ds.uploaded) - formatsCounted)} more were uploaded before the format was recorded.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="table-card">
                  <div className="table-head">
                    <div><h2>Documents</h2></div>
                    <form className="toolbar" method="get" action="/admin">
                      <input type="hidden" name="tab" value="documents" />
                      <input type="hidden" name="days" value={days} />
                      <input className="input" name="q" defaultValue={q} placeholder="Search documents" />
                      <FilterSelect
                        name="status"
                        value={status}
                        options={[["", "All statuses"], ["draft", "Draft"], ["final", "Final"], ["failed", "Failed"]]}
                      />
                    </form>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Title</th><th>Type</th><th>User</th><th>Revisions</th><th>Status</th><th>Started</th><th>Updated</th></tr></thead>
                      <tbody>
                        {docRowsShown.length === 0 && (
                          <tr><td colSpan={7}><div className="empty">{q ? `Nothing matches “${q}”.` : "No drafts in the selected period."}</div></td></tr>
                        )}
                        {docRowsShown.map((d) => (
                          <tr key={d.draft_id}>
                            <td><b>{d.title?.trim() || nameFallback(d.doc_type, d.created_at)}</b></td>
                            <td>{d.doc_type.length <= 5 ? d.doc_type.toUpperCase() : d.doc_type}</td>
                            <td>{d.owner_email ?? "—"}</td>
                            <td>{Math.max(0, n(d.versions) - 1)}</td>
                            <td>
                              {d.status === "final" ? <span className="badge green">Final</span>
                                : d.status === "failed" ? <span className="badge red">Failed</span>
                                : <span className="badge">Draft</span>}
                            </td>
                            <td>{day(d.created_at)}</td>
                            <td>{ago(d.updated_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── USERS ─────────────────────────────────────────────────── */}
            {tab === "users" && (
              <>
                <div className="summary">
                  <SummaryCard
                    label="New accounts"
                    value={fmt(n(us.accounts_new))}
                    note={`Selected period · ${fmt(n(us.accounts))} in total, ${fmt(n(us.admins))} admin${n(us.admins) === 1 ? "" : "s"}`}
                  />
                  <SummaryCard label="Active users" value={fmt(n(us.active_period))} note="Drafted in the selected period" />
                  <SummaryCard label="Users who drafted" value={fmt(n(us.activated))} note="All time" />
                  <SummaryCard
                    label="Joined waitlist"
                    value={fmt(n(us.waitlist_new))}
                    note={`Selected period · ${fmt(onList)} on the list, ${fmt(n(us.waitlist_waiting))} waiting`}
                  />
                </div>
                <div className="grid-2">
                  <div className="card">
                    <div className="card-head"><div><h2>Drafting journey</h2></div></div>
                    <div className="card-body">
                      <div className="journey">
                        {(() => {
                          const top = Math.max(1, ...FUNNEL_STEPS.map((st) => n(funnel.find((f) => f.step === st.id)?.people ?? 0)));
                          return FUNNEL_STEPS.map((st, i) => {
                            const people = n(funnel.find((f) => f.step === st.id)?.people ?? 0);
                            const generated = n(funnel.find((f) => f.step === "draft_generated")?.people ?? 0);
                            const last = i === FUNNEL_STEPS.length - 1;
                            return (
                              <div className="journey-row" key={st.id}>
                                <div className="top"><span>{st.label}</span><b>{fmt(people)}</b></div>
                                <div className="track"><span style={{ width: `${Math.round((people / top) * 100)}%` }} /></div>
                                {last && generated > 0 && (
                                  <div className="below">{Math.round((people / generated) * 100)}% of generated drafts</div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-head"><div><h2>AI usage</h2></div></div>
                    <div className="card-body">
                      <div className="simple-list">
                        <div className="simple-row"><span>Model requests</span><strong>{fmt(n(us.ai_requests))}</strong></div>
                        <div className="simple-row"><span>People who drafted</span><strong>{fmt(n(us.active_period))}</strong></div>
                        <div className="simple-row"><span>Drafts generated</span><strong>{fmt(n(ds.period))}</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card visitors-card">
                  <div className="card-head">
                    <div>
                      <h2>Website visitors</h2>
                      <p>
                        foundersdoc.com, {periodLabel}
                        {dateRange ? ` — ${dateRange}` : ""}. Counted by the site’s own counter, with your team’s own visits left out.
                      </p>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="figure-row">
                      <div className="figure">
                        <b>{visits ? fmt(visits.visits) : "—"}</b>
                        <span>Visitors</span>
                        <small>
                          People arriving at the site. One sitting counts once — reloading or reading four pages is still one
                          visitor; coming back this evening is another.
                        </small>
                      </div>
                      <div className="figure">
                        <b>{visitorsRecorded ? fmt(visits!.frequent) : "—"}</b>
                        <span>Unique visitors</span>
                        <small>
                          Of those, the ones who came more than three separate times. They are counted in Visitors as well.
                          {visitorsRecorded
                            ? visitorsFromLabel
                              ? ` Counted from ${visitorsFromLabel}, when this was switched on.`
                              : ""
                            : " Blank until ANALYTICS_STABLE is set in Vercel — the same person cannot be recognised across days without it."}
                        </small>
                      </div>
                      <div className="figure">
                        <b>{visits ? fmt(visits.pageViews) : "—"}</b>
                        <span>Views</span>
                        <small>Pages opened altogether, refreshes included.</small>
                      </div>
                      <div className="figure">
                        <b>{visits ? fmt(visits.countries) : "—"}</b>
                        <span>Countries</span>
                        <small>How many countries those connections came from.</small>
                      </div>
                    </div>
                    <p className="worked-example">
                      <b>How they differ:</b> somebody opens four pages this morning, then comes back tonight and opens four more.
                      That is <b>2 visitors</b> and <b>8 views</b>. If they come twice more this month — four separate times in all —
                      they are also <b>1 unique visitor</b>.
                    </p>
                    {!visits && (
                      <p className="setup-line">Run <code>supabase/022_unique_visitors.sql</code> to switch this counter on.</p>
                    )}
                    {visits && !visitorsRecorded && (
                      <p className="setup-line">
                        Unique visitors are blank until <code>ANALYTICS_SALT</code> is set in Vercel and the site is redeployed. Visits and page
                        views above are counted either way, and nothing is guessed in the meantime.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid-3">
                  {(
                    [
                      ["Top pages", "Page", pageRows],
                      ["Countries", "Country", countryRows],
                      ["Devices", "Device", deviceRows],
                    ] as const
                  ).map(([title, column, rows]) => {
                    const name = (label: string) =>
                      title === "Countries"
                        ? countryName(label)
                        : title === "Devices"
                          ? label.charAt(0).toUpperCase() + label.slice(1)
                          : label;
                    return (
                      <div className="card" key={title}>
                        <div className="card-head">
                          <div>
                            <h2>{title}</h2>
                            <p>{periodLabel.replace("the ", "The ")} · your team excluded</p>
                          </div>
                        </div>
                        <div className="card-body">
                          <div className="breakdown">
                            <div className="breakdown-head">
                              <span>{column}</span>
                              <b title="Arrivals; four pages in one sitting is one visitor">Visitors</b>
                              <b title="Of those, the ones who came more than three separate times">Unique</b>
                              <b title="Pages opened">Views</b>
                            </div>
                            {rows.length === 0 && <div className="empty">Nothing recorded yet.</div>}
                            {rows.slice(0, 8).map((r) => (
                              <BreakdownRow key={r.label} label={name(r.label)} row={r} uniqueKnown={visitorsRecorded} />
                            ))}
                            {rows.length > 8 && (
                              <details className="more-rows">
                                <summary>
                                  <span className="when-closed">Show all {rows.length}</span>
                                  <span className="when-open">Show fewer</span>
                                </summary>
                                <div className="more-body">
                                  {rows.slice(8).map((r) => (
                                    <BreakdownRow key={r.label} label={name(r.label)} row={r} uniqueKnown={visitorsRecorded} />
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                          <BreakdownKey />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h2>Day by day</h2>
                      <p>
                        Each day of {periodLabel}, Singapore time, newest first. The bar behind each row is that day’s visitors
                        against the busiest day. Your team’s own visits are left out throughout.
                      </p>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="breakdown">
                      <div className="breakdown-head daily">
                        <span>Day</span>
                        <b title="People arriving; one sitting counts once">Visitors</b>
                        <b title="Of them, the ones who came more than three separate times in the period">Unique</b>
                        <b title="Waitlist signups">Signups</b>
                        <b title="Pages opened">Views</b>
                        <b title="Drafts started">Drafts</b>
                      </div>
                      {dailyRows.length === 0 && <div className="empty">Nothing recorded yet.</div>}
                      {dailyRows.slice(0, 14).map((d) => (
                        <DayRow key={d.day} label={dayLabel(d.day)} row={d} busiest={busiestDay} href={dayHref(d.day)} open={d.day === openDay} />
                      ))}
                      {dailyRows.length > 14 && (
                        <details className="more-rows">
                          <summary>
                            <span className="when-closed">Show all {dailyRows.length} days</span>
                            <span className="when-open">Show fewer</span>
                          </summary>
                          <div className="more-body">
                            {dailyRows.slice(14).map((d) => (
                              <DayRow key={d.day} label={dayLabel(d.day)} row={d} busiest={busiestDay} href={dayHref(d.day)} open={d.day === openDay} />
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                    <p className="list-key">
                      A day runs midnight to midnight in Singapore. The visitor fingerprint changes at 8am Singapore time, so
                      somebody browsing both before and after 8am counts twice in <b>Visitors</b> that day; visits, views and
                      signups are exact.
                    </p>
                  </div>
                </div>
                {openDay && (
                  <div className="card day-detail">
                    <div className="card-head">
                      <div>
                        <h2>{dayTitle(openDay)}</h2>
                        <p>Everything recorded that day, Singapore time. Page views are the hours below, not a list — a list of every page one anonymous visitor opened is a browsing history, which is not something to keep on a dashboard.</p>
                      </div>
                      <Link className="btn" href={`/admin?tab=users&days=${days}${waitScope === "period" ? "&wl=period" : ""}`}>
                        Close
                      </Link>
                    </div>
                    <div className="card-body">
                      <h3 className="sub-head">By hour</h3>
                      {dayHours.length === 0 && <div className="empty">No visits recorded that day.</div>}
                      {dayHours.length > 0 && (
                        <div className="breakdown">
                          <div className="breakdown-head">
                            <span>Hour</span>
                            <b>Visits</b>
                            <b>Views</b>
                            <b>Signups</b>
                          </div>
                          {dayHours.map((h) => {
                            const share = Math.round((n(h.page_views) / busiestDayHour) * 100);
                            return (
                              <div
                                className="breakdown-row"
                                key={h.hour}
                                style={{ backgroundImage: `linear-gradient(to right, var(--day-bar) ${share}%, transparent ${share}%)` }}
                              >
                                <span>
                                  {String(h.hour).padStart(2, "0")}:00 – {String(h.hour).padStart(2, "0")}:59
                                </span>
                                <b>{fmt(n(h.visits))}</b>
                                <b className="quiet">{fmt(n(h.page_views))}</b>
                                <b className={n(h.signups) > 0 ? "lit" : "quiet"}>{fmt(n(h.signups))}</b>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <h3 className="sub-head">What happened</h3>
                      {dayEvents.length === 0 && (
                        <div className="empty">Nothing beyond page views was recorded that day.</div>
                      )}
                      {dayEvents.length > 0 && (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr><th>Time</th><th>What</th><th>Who</th><th>Detail</th><th>Where</th></tr>
                            </thead>
                            <tbody>
                              {dayEvents.map((e, i) => (
                                <tr key={`${e.at}-${e.kind}-${i}`}>
                                  <td><b>{clock(e.at)}</b></td>
                                  <td>{dayEventLabel(e.kind)}</td>
                                  <td>{e.who ?? <span className="muted-cell">anonymous</span>}</td>
                                  <td>{e.detail ? e.detail.toUpperCase().length <= 4 ? e.detail.toUpperCase() : e.detail : "—"}</td>
                                  <td>
                                    {e.country ? countryName(e.country) : "—"}
                                    {e.device ? ` · ${e.device}` : ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="table-card">
                  <div className="table-head">
                    <div className="head-text">
                      <h2>Waitlist</h2>
                      <p>
                        The figures follow the period above; the list below shows{" "}
                        {waitScope === "period" ? `only people who joined in ${periodLabel}` : "everybody on the list"}.
                      </p>
                    </div>
                    <form method="get" action="/admin" className="toolbar">
                      <input type="hidden" name="tab" value="users" />
                      <input type="hidden" name="days" value={days} />
                      <input type="hidden" name="wl" value={waitScope} />
                      <span className="badge" title={`${fmt(n(us.waitlist_waiting))} waiting · ${fmt(n(us.waitlist_invited))} invited`}>
                        {waitlistShown.length === onList
                          ? `${fmt(onList)} joined`
                          : `${fmt(waitlistShown.length)} of ${fmt(onList)} joined`}
                      </span>
                      <input className="input" name="q" defaultValue={q} placeholder="Search waitlist" />
                    </form>
                  </div>
                  <div className="figure-row in-table">
                    <div className="figure">
                      <b>{fmt(n(us.waitlist_new))}</b>
                      <span>Joined in {periodLabel}</span>
                      <small>
                        {joinedBefore === null
                          ? "Signups dated inside the selected period."
                          : `${fmt(joinedBefore)} in the ${RANGES.find((r) => r.days === days)?.label ?? `${days} days`} before that.`}
                      </small>
                    </div>
                    <div className="figure">
                      <b>{fmt(onList)}</b>
                      <span>On the list</span>
                      <small>Everyone waiting or invited, all time — the number the site sends to your Zap.</small>
                    </div>
                    <div className="figure">
                      <b>{fmt(n(us.waitlist_waiting))}</b>
                      <span>Waiting</span>
                      <small>Signed up, not yet invited in.</small>
                    </div>
                    <div className="figure">
                      <b>{fmt(n(us.waitlist_invited))}</b>
                      <span>Invited</span>
                      <small>Given access to FD AI.</small>
                    </div>
                  </div>
                  <div className="scope-toggle" role="group" aria-label="Which signups to list">
                    <Link
                      href={`/admin?tab=users&days=${days}&wl=all${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                      className={waitScope === "all" ? "on" : ""}
                    >
                      Everybody
                    </Link>
                    <Link
                      href={`/admin?tab=users&days=${days}&wl=period${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                      className={waitScope === "period" ? "on" : ""}
                    >
                      {(RANGES.find((r) => r.days === days)?.label ?? `${days} days`).replace(/^(\d)/, "Last $1")}
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Email</th><th>Name</th><th>Company</th><th>Wants to draft</th><th>Joined</th><th>Account</th></tr></thead>
                      <tbody>
                        {waitlistShown.length === 0 && (
                          <tr>
                            <td colSpan={6}>
                              <div className="empty">
                                {q
                                  ? `Nobody on the waitlist matches “${q}”.`
                                  : waitScope === "period"
                                    ? `Nobody joined in ${periodLabel}. Choose “Everybody” to see the whole list.`
                                    : "Nobody on the waitlist yet."}
                              </div>
                            </td>
                          </tr>
                        )}
                        {waitlistShown.map((w) => (
                          <tr key={w.email}>
                            <td><b>{w.email}</b></td>
                            <td>{w.name ?? "—"}</td>
                            <td>{w.company ?? "—"}</td>
                            <td>{w.note ?? "—"}</td>
                            <td>{day(w.created_at)}</td>
                            {/* Either they have an account, or here is the button
                                that gives them one — the same account, credits and
                                invitation a self-serve sign-up produces. */}
                            <td><InviteButton email={w.email} invited={Boolean(w.account_at)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── CREDITS & PLANS ───────────────────────────────────────── */}
            {tab === "credits" && (
              <>
                <div className="summary">
                  <SummaryCard
                    label="Paying users"
                    value={fmt(members)}
                    note={members === 0 ? "No active plans" : `${fmt(n(ps.members_basic))} Basic · ${fmt(n(ps.members_pro))} Pro · ${fmt(n(ps.members_unlimited))} Unlimited`}
                  />
                  <SummaryCard label="Credits outstanding" value={fmt(n(ps.outstanding))} note="All accounts" />
                  <SummaryCard label="Credits used" value={fmt(n(ps.spent_period))} note="Selected period" />
                  <SummaryCard
                    label="Failed payments"
                    value={fmt(n(ps.past_due))}
                    note={n(ps.past_due) > 0 ? <span className="bad">Needs attention</span> : <span className="good">None</span>}
                  />
                </div>
                <div className="grid-2">
                  <div className="card">
                    <div className="card-head"><div><h2>Credit source</h2></div></div>
                    <div className="card-body">
                      <div className="simple-list">
                        <div className="simple-row"><span>Bought</span><strong>{fmt(n(ps.bought_period))}</strong></div>
                        <div className="simple-row"><span>Membership</span><strong>{fmt(n(ps.granted_period))}</strong></div>
                        <div className="simple-row"><span>Admin-issued</span><strong>{fmt(n(ps.gifted_period))}</strong></div>
                      </div>
                    </div>
                  </div>
                  <CreditsPanel accounts={accountRows} />
                </div>
                <div className="table-card">
                  <div className="table-head">
                    <div><h2>Accounts</h2></div>
                    <form method="get" action="/admin">
                      <input type="hidden" name="tab" value="credits" />
                      <input type="hidden" name="days" value={days} />
                      <input className="input" name="q" defaultValue={q} placeholder="Search accounts" />
                    </form>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Account</th><th>Plan</th><th>Credits</th><th>Drafts 30d</th><th>Total drafts</th><th>Last active</th><th>Joined</th></tr></thead>
                      <tbody>
                        {accountRows.length === 0 && (
                          <tr><td colSpan={7}><div className="empty">{q ? `No account matches “${q}”.` : "No accounts yet."}</div></td></tr>
                        )}
                        {accountRows.map((a) => {
                          const plan = planLabel(a);
                          return (
                            <tr key={a.user_id}>
                              <td>
                                <b>{a.full_name || (a.email ?? "").split("@")[0] || "—"}</b>
                                <br />
                                <span style={{ color: "var(--muted)" }}>{a.email ?? "—"}</span>
                              </td>
                              <td>
                                <span className={plan.tone === "error" ? "badge red" : plan.tone === "ready" ? "badge green" : plan.tone ? "badge" : "badge gray"}>
                                  {plan.text}
                                </span>
                              </td>
                              <td><b>{fmt(n(a.balance))}</b></td>
                              <td>{fmt(n(a.drafts_30d))}</td>
                              <td>{fmt(n(a.drafts_total))}</td>
                              <td>{a.last_draft_at ? ago(a.last_draft_at) : "Never"}</td>
                              <td>{day(a.joined_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── LOGS ──────────────────────────────────────────────────── */}
            {tab === "logs" && (
              <>
                <div className="summary">
                  <SummaryCard label="Generation errors" value={fmt(n(ds.failed))} note="Selected period" />
                  <SummaryCard label="Failed payments" value={fmt(n(ps.past_due))} note={n(ps.past_due) > 0 ? <span className="bad">Needs attention</span> : <span className="good">None</span>} />
                  <SummaryCard label="Credit changes" value={fmt(creditActions.length)} note="Manual" />
                  <SummaryCard label="Open issues" value={fmt(n(ds.failed) + n(ps.past_due) + (awaitingReview ?? 0))} note={(n(ds.failed) + n(ps.past_due) + (awaitingReview ?? 0)) > 0 ? <span className="bad">See above</span> : <span className="good">Clear</span>} />
                </div>
                <div className="table-card">
                  <div className="table-head">
                    <div><h2>Logs</h2></div>
                    <form method="get" action="/admin">
                      <input type="hidden" name="tab" value="logs" />
                      <input type="hidden" name="days" value={days} />
                      <FilterSelect
                        name="kind"
                        value={kind}
                        options={[["", "All logs"], ["Admin", "Admin"], ["System", "System"], ["Billing", "Billing"], ["Files", "Files"]]}
                      />
                    </form>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Time</th><th>Type</th><th>Event</th><th>User / admin</th><th>Status</th></tr></thead>
                      <tbody>
                        {logShown.length === 0 && (
                          <tr><td colSpan={5}><div className="empty">Nothing recorded in the selected period.</div></td></tr>
                        )}
                        {logShown.map((l, i) => (
                          <tr key={i}>
                            <td>{stamp(l.at)}</td>
                            <td>{l.kind}</td>
                            <td>{l.text}</td>
                            <td>{l.who ?? "—"}</td>
                            <td>
                              <span className={l.status === "Success" ? "badge green" : l.status === "Failed" ? "badge red" : "badge gray"}>
                                {l.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {tab === "ai-files" && (
              <>
                {libraryMissing && (
                  <div className="setup-note">
                    <strong>The AI library tables are missing.</strong> Run <code>supabase/014_ai_library.sql</code>{" "}
                    in the Supabase SQL editor. Until then drafting uses the examples built into the code.
                  </div>
                )}
                {rankingMissing && !libraryMissing && (
                  <div className="setup-note">
                    <strong>Ranking and redaction are not switched on yet.</strong> Run{" "}
                    <code>supabase/016_rank_and_redaction.sql</code> in the Supabase SQL editor. Until then the
                    library works as before, without the Rank column or the Redact button.
                  </div>
                )}
                <AiFiles
                  sources={sources}
                  folders={folders}
                  docTypes={catalogue.map((d) => ({ slug: d.slug, label: d.label }))}
                  ranking={!rankingMissing}
                />
                {/* Rules, beneath the samples they override. */}
                <Playbook docTypes={catalogue.map((d) => ({ slug: d.slug, label: d.label }))} initial={playbook} />
                {/* Term sheets waiting for a lawyer's release. */}
                <Review initial={reviewInitial} />
                {/* What the lawyers said about drafts, and the rules made from it. */}
                <Feedback docTypes={catalogue.map((d) => ({ slug: d.slug, label: d.label }))} initial={feedbackInitial} />
                {stepsMissing && !libraryMissing && (
                  <div className="setup-note">
                    <strong>Save-as-draft and step order are not switched on yet.</strong> Run{" "}
                    <code>supabase/017_question_steps.sql</code> in the Supabase SQL editor. Until then Publish
                    still updates the form directly, as before.
                  </div>
                )}
                <Questions docTypes={catalogue} versioning={!stepsMissing} />
              </>
            )}

          </div>
        </div>
      </div>
    </main>
  );
}
