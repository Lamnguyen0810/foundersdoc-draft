import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import CreditsPanel, { type Action } from "./CreditsPanel";
import { ago, day, fmt, money, stamp } from "./parts";
import FilterSelect from "./FilterSelect";
import AiFiles from "./AiFiles";
import Questions, { type DocTypeForEditor, type FieldRow, type GroupRow } from "./Questions";
import PeriodSelect from "./PeriodSelect";
import type { FolderRow, SourceRow } from "@/lib/ai-library";
import "./dashboard.css";
import "./admin.css";

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

type Tab = "overview" | "documents" | "users" | "credits" | "ai-files" | "logs";

/* The design's six sections, in its order. Overview and Logs are in the
   sidebar because the design has them there; their panels say plainly that
   nothing is shown until the numbers behind them are recorded — some of
   what they draw (the drafting funnel's "downloaded Word", for one) is not
   yet an event this app records, and a figure that is not counted is not
   shown. */
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "users", label: "Users" },
  { id: "credits", label: "Credits & plans" },
  { id: "ai-files", label: "AI files" },
  { id: "logs", label: "Logs" },
];

/* Bookmarks from the three-tab console still land on the right panel. */
const OLD_TABS: Record<string, Tab> = { people: "users", billing: "credits" };

const RANGES = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
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

interface Breakdown {
  label: string;
  people: number;
  hits: number;
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

/** A breakdown row: visits in bold, page loads beside them in grey. */
function BreakdownRow({ label, people, hits }: { label: string; people: number; hits: number }) {
  return (
    <div className="simple-row">
      <span>{label}</span>
      <strong>
        {fmt(people)} <small title={`${fmt(hits)} page load${hits === 1 ? "" : "s"}`}>{fmt(hits)}</small>
      </strong>
    </div>
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
  searchParams: Promise<{ tab?: string; days?: string; q?: string; status?: string; kind?: string }>;
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

  const supabase = await createClient();

  /* ── AI files: the library and the catalogue's questions ──────────────
     Sources are listed WITHOUT their text: the content column can be tens of
     kilobytes a row and the table shows none of it. */
  let sources: SourceRow[] = [];
  let folders: FolderRow[] = [];
  let catalogue: DocTypeForEditor[] = [];
  let libraryMissing = false;
  let rankingMissing = false;
  let stepsMissing = false;
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
    docs,
    userStats,
    funnelRes,
    pages,
    countries,
    devices,
    visitsRes,
    waitRes,
    planStats,
    accounts,
    creditLog,
    eventsRes,
    approvalsRes,
  ] = await Promise.all([
    wantDocs ? supabase.rpc("admin_document_stats", { p_days: days }) : null,
    tab === "documents" ? supabase.rpc("admin_doc_type_counts", { p_days: days }) : null,
    tab === "documents"
      ? supabase.rpc("admin_documents", { p_days: days, p_limit: 100, p_search: q || null })
      : null,
    wantUsers ? supabase.rpc("admin_user_stats", { p_days: days }) : null,
    tab === "users" || tab === "overview" ? supabase.rpc("admin_funnel", { p_days: days }) : null,
    tab === "users" ? supabase.rpc("admin_event_breakdown", { p_kind: "path", p_days: days, p_limit: 50 }) : null,
    tab === "users" ? supabase.rpc("admin_event_breakdown", { p_kind: "country", p_days: days, p_limit: 50 }) : null,
    tab === "users" ? supabase.rpc("admin_event_breakdown", { p_kind: "device", p_days: days, p_limit: 5 }) : null,
    tab === "users" ? supabase.rpc("admin_visits", { p_days: days }) : null,
    tab === "users"
      ? supabase
          .from("waitlist")
          .select("email,name,company,note,status,created_at")
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
    [visitsRes, "supabase/020_admin_visits.sql"],
    [eventsRes, "supabase/015_admin_activity.sql"],
  ] as const) {
    if (res?.error && !problems.includes(hint)) problems.push(hint);
  }

  const ds = (docStats?.data ?? {}) as Record<string, unknown>;
  const us = (userStats?.data ?? {}) as Record<string, unknown>;
  const ps = (planStats?.data ?? {}) as Record<string, unknown>;
  const docRows = (docs?.data as DocRow[] | null) ?? [];
  const typeRows = (docTypes?.data as { label: string; drafts: number }[] | null) ?? [];
  const funnel = (funnelRes?.data as FunnelRow[] | null) ?? [];
  const pageRows = (pages?.data as Breakdown[] | null) ?? [];
  const countryRows = (countries?.data as Breakdown[] | null) ?? [];
  const deviceRows = (devices?.data as Breakdown[] | null) ?? [];
  /* The visitor counter. Countries arrive as two-letter codes from Vercel's
     header; they are shown by name. */
  const visitsRow = (Array.isArray(visitsRes?.data) ? visitsRes.data[0] : visitsRes?.data) as
    | { visits: number | string; page_loads: number | string; countries: number | string }
    | null
    | undefined;
  const visits = visitsRow ? { visits: n(visitsRow.visits), pageLoads: n(visitsRow.page_loads), countries: n(visitsRow.countries) } : null;
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
  const periodLabel = days === 1 ? "the last 24 hours" : `the last ${days} days`;
  const waitlist = (waitRes?.data as WaitRow[] | null) ?? [];
  const accountRows = (accounts?.data as AccountRow[] | null) ?? [];
  const creditActions = (creditLog?.data as Action[] | null) ?? [];
  const events = (eventsRes?.data as EventRow[] | null) ?? [];
  const approvals = (approvalsRes?.data as ApprovalRow[] | null) ?? [];

  /* The Documents table's status filter and the Waitlist search are applied
     here; both lists are already bounded by the queries above. */
  const docRowsShown = status ? docRows.filter((d) => d.status === status) : docRows;
  const qLower = q.toLowerCase();
  const waitlistShown = q
    ? waitlist.filter((w) =>
        [w.email, w.name, w.company, w.note].some((v) => (v ?? "").toLowerCase().includes(qLower)),
      )
    : waitlist;
  /* The money meter only has something to say when the model has actually been
     called: the figure is a sum of per-request costs, so with no requests there
     is no figure — and a zero would read as "we spent nothing", which is a
     claim, not a count. Nothing recorded, nothing shown. */
  const aiRecorded = n(us.ai_requests) > 0;

  const members = n(ps.members_basic) + n(ps.members_pro) + n(ps.members_unlimited);

  /* The Logs table is four sources read side by side, newest first: the
     events the app records (System), credit grants and revokes (Admin), AI
     files reviewed or approved (Files) and memberships whose payment failed
     (Billing). Nothing is invented for a quiet day. */
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
            <div className={tab === "ai-files" ? "period-group is-hidden" : "period-group"}>
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
                  <SummaryCard label="Active users" value={fmt(n(us.active_period))} note="Drafted at least once" />
                  <SummaryCard label="Credits used" value={fmt(n(ps.spent_period))} note="Selected period" />
                  <SummaryCard label="AI cost" value={aiRecorded ? money(n(us.ai_cost_usd)) : "—"} note={aiRecorded ? "Actual spend" : "Nothing recorded yet"} />
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

            {/* ── DOCUMENTS ─────────────────────────────────────────────── */}
            {tab === "documents" && (
              <>
                <div className="summary">
                  <SummaryCard label="Drafts" value={fmt(n(ds.period))} note={`${fmt(n(ds.total))} all time`} />
                  <SummaryCard label="Revised drafts" value={fmt(n(ds.revisions))} note="Drafts revised at least once" />
                  <SummaryCard label="Word downloads" value={fmt(n(ds.exported))} note="Selected period" />
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
                      </div>
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
                            <td><b>{d.title || "Untitled draft"}</b></td>
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
                  <SummaryCard label="Accounts" value={fmt(n(us.accounts))} note={`${fmt(n(us.admins))} admin${n(us.admins) === 1 ? "" : "s"}`} />
                  <SummaryCard label="Active users" value={fmt(n(us.active_period))} note="Selected period" />
                  <SummaryCard label="Users who drafted" value={fmt(n(us.activated))} note="All time" />
                  <SummaryCard label="Waitlist" value={fmt(n(us.waitlist_waiting))} note="Waiting" />
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
                        <div className="simple-row"><span>Actual cost</span><strong>{aiRecorded ? money(n(us.ai_cost_usd)) : "—"}</strong></div>
                        <div className="simple-row"><span>Commercial equivalent</span><strong>{aiRecorded ? money(n(us.ai_benchmark_usd)) : "—"}</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card visitors-card">
                  <div className="card-head">
                    <div>
                      <h2>Website visitors</h2>
                      <p>Visits to foundersdoc.com in {periodLabel}, counted from page loads by the site’s own counter. Your team’s own visits are left out. A visit is one browser session, so the same person on another day, or in another tab, counts again — this is visits, not unique people.</p>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="visitors-row">
                      <div className="visitors-number">
                        <strong>{visits ? fmt(visits.visits) : "—"}</strong>
                        <span>website visits</span>
                      </div>
                      <div className="visitors-meta">
                        <div><b>{visits ? fmt(visits.pageLoads) : "—"}</b><span>page loads</span></div>
                        <div><b>{visits ? fmt(visits.countries) : "—"}</b><span>countries</span></div>
                      </div>
                    </div>
                    {!visits && <div className="empty" style={{ textAlign: "left", padding: "10px 0 0" }}>Run supabase/020_admin_visits.sql to switch this counter on.</div>}
                  </div>
                </div>
                <div className="grid-3">
                  {([["Top pages", pageRows], ["Countries", countryRows], ["Devices", deviceRows]] as const).map(([title, rows]) => (
                    <div className="card" key={title}>
                      <div className="card-head"><div><h2>{title}</h2><p>Visits, last {days === 1 ? "24 hours" : `${days} days`} · your team excluded</p></div></div>
                      <div className="card-body">
                        <div className="simple-list">
                          {rows.length === 0 && <div className="empty">Nothing recorded yet.</div>}
                          {rows.slice(0, 8).map((r) => (
                            <BreakdownRow key={r.label} label={title === "Countries" ? countryName(r.label) : title === "Devices" ? r.label.charAt(0).toUpperCase() + r.label.slice(1) : r.label} people={n(r.people)} hits={n(r.hits)} />
                          ))}
                          {rows.length > 8 && (
                            <details className="more-rows">
                              <summary>Show {rows.length - 8} more</summary>
                              {rows.slice(8).map((r) => (
                                <BreakdownRow key={r.label} label={title === "Countries" ? countryName(r.label) : r.label} people={n(r.people)} hits={n(r.hits)} />
                              ))}
                            </details>
                          )}
                        </div>
                        <p className="list-key"><b>Visits</b> · page loads in grey</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="table-card">
                  <div className="table-head">
                    <div><h2>Waitlist</h2></div>
                    <form method="get" action="/admin" className="toolbar">
                      <input type="hidden" name="tab" value="users" />
                      <input type="hidden" name="days" value={days} />
                      <span className="badge" title={`${fmt(n(us.waitlist_waiting))} waiting · ${fmt(n(us.waitlist_invited))} invited`}>
                        {fmt(n(us.waitlist_waiting) + n(us.waitlist_invited))} joined
                      </span>
                      <input className="input" name="q" defaultValue={q} placeholder="Search waitlist" />
                    </form>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Email</th><th>Name</th><th>Company</th><th>Wants to draft</th><th>Joined</th><th>Status</th></tr></thead>
                      <tbody>
                        {waitlistShown.length === 0 && (
                          <tr><td colSpan={6}><div className="empty">{q ? `Nobody on the waitlist matches “${q}”.` : "Nobody on the waitlist yet."}</div></td></tr>
                        )}
                        {waitlistShown.map((w) => (
                          <tr key={w.email}>
                            <td><b>{w.email}</b></td>
                            <td>{w.name ?? "—"}</td>
                            <td>{w.company ?? "—"}</td>
                            <td>{w.note ?? "—"}</td>
                            <td>{day(w.created_at)}</td>
                            <td>{w.status === "invited" ? <span className="badge green">Invited</span> : <span className="badge">Waiting</span>}</td>
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
