import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import CreditsPanel, { type Action } from "./CreditsPanel";
import { BarList, Kpi, Panel, ago, fmt, money, when } from "./parts";
import AiFiles from "./AiFiles";
import Questions, { type FieldRow } from "./Questions";
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

interface Breakdown {
  label: string;
  people: number;
  hits: number;
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
  searchParams: Promise<{ tab?: string; days?: string; q?: string }>;
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
  const rangeLabel = RANGES.find((r) => r.days === days)?.label ?? "30 days";

  const supabase = await createClient();

  /* ── AI files: the library and the catalogue's questions ──────────────
     Sources are listed WITHOUT their text: the content column can be tens of
     kilobytes a row and the table shows none of it. */
  let sources: SourceRow[] = [];
  let folders: FolderRow[] = [];
  let catalogue: { slug: string; label: string; fields: FieldRow[] }[] = [];
  let libraryMissing = false;
  if (tab === "ai-files") {
    const [srcRes, folRes, catRes] = await Promise.all([
      supabase
        .from("ai_sources")
        .select(
          "id,folder_id,doc_type_slug,title,filename,file_ext,jurisdiction,version,privacy,privacy_flags,status,permitted,note,bytes,uploaded_by_email,reviewed_at,approved_at,created_at,updated_at",
        )
        .order("updated_at", { ascending: false }),
      supabase.from("ai_folders").select("id,name").order("name"),
      supabase.from("doc_types").select("slug,label,fields").eq("is_active", true).order("label"),
    ]);
    if (srcRes.error && /ai_sources/.test(srcRes.error.message)) libraryMissing = true;
    sources = (srcRes.data as SourceRow[] | null) ?? [];
    folders = (folRes.data as FolderRow[] | null) ?? [];
    catalogue = ((catRes.data ?? []) as { slug: string; label: string; fields: FieldRow[] | null }[]).map(
      (d) => ({ slug: d.slug, label: d.label, fields: d.fields ?? [] }),
    );
  }

  /* The utility strip says what needs a person. Only what is counted. */
  const { count: awaitingReview } = await supabase
    .from("ai_sources")
    .select("id", { count: "exact", head: true })
    .eq("status", "needs_review");

  /* Each tab fetches only what it shows. The alternative — one query bundle for
     the whole console — makes every tab pay for the other two. */
  const [
    docStats,
    docTypes,
    docs,
    userStats,
    funnelRes,
    pages,
    countries,
    devices,
    waitRes,
    planStats,
    accounts,
    creditLog,
  ] = await Promise.all([
      tab === "documents" ? supabase.rpc("admin_document_stats", { p_days: days }) : null,
      tab === "documents" ? supabase.rpc("admin_doc_type_counts", { p_days: days }) : null,
      tab === "documents"
        ? supabase.rpc("admin_documents", { p_days: days, p_limit: 100, p_search: q || null })
        : null,
      tab === "users" ? supabase.rpc("admin_user_stats", { p_days: days }) : null,
      tab === "users" ? supabase.rpc("admin_funnel", { p_days: days }) : null,
      tab === "users"
        ? supabase.rpc("admin_event_breakdown", { p_kind: "path", p_days: days, p_limit: 8 })
        : null,
      tab === "users"
        ? supabase.rpc("admin_event_breakdown", { p_kind: "country", p_days: days, p_limit: 8 })
        : null,
      tab === "users"
        ? supabase.rpc("admin_event_breakdown", { p_kind: "device", p_days: days, p_limit: 5 })
        : null,
      tab === "users"
        ? supabase
            .from("waitlist")
            .select("email,name,company,note,status,created_at")
            .order("created_at", { ascending: false })
            .limit(200)
        : null,
      tab === "credits" ? supabase.rpc("admin_plan_stats", { p_days: days }) : null,
      tab === "credits"
        ? supabase.rpc("admin_accounts", { p_limit: 200, p_search: q || null })
        : null,
      tab === "credits" ? supabase.rpc("admin_recent_credit_actions", { p_limit: 15 }) : null,
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
  const waitlist = (waitRes?.data as WaitRow[] | null) ?? [];
  const accountRows = (accounts?.data as AccountRow[] | null) ?? [];
  const creditActions = (creditLog?.data as Action[] | null) ?? [];

  const strip =
    awaitingReview && awaitingReview > 0
      ? `${awaitingReview} AI file${awaitingReview === 1 ? "" : "s"} to review`
      : "Nothing waiting for review";

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

        <div className="utility-strip">
          <div className="utility-left">
            <span className="health">System operational</span>
            <span className="utility-text">{strip}</span>
          </div>
          <div className="utility-actions">
            <Link className="btn" href={tabHref("logs", days)}>View logs</Link>
            <Link className="btn" href={tabHref("ai-files", days)}>Review AI files</Link>
            <Link className="btn yellow" href={tabHref("credits", days)}>Adjust credits</Link>
          </div>
        </div>

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
              <div className="side-card-foot">
                <p className="side-mini">Signed in as {user.email}</p>
              </div>
            </div>
          </aside>

          <div className="dashboard-content">
            {problems.length > 0 && (
              <div className="fda-legacy fda">
                <p className="fda-note warn">
                  <strong>Some tables or functions are missing.</strong> Run{" "}
                  {problems.map((p, i) => (
                    <span key={p}>
                      {i > 0 && ", "}
                      <code>{p}</code>
                    </span>
                  ))}{" "}
                  in the Supabase SQL editor. Figures below are incomplete until you do.
                </p>
              </div>
            )}

            {(tab === "overview" || tab === "logs") && (
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>{tab === "overview" ? "Overview" : "Logs"}</h2>
                    <p>Being built. Nothing is shown here until every figure on it is a real count.</p>
                  </div>
                </div>
                <div className="card-body">
                  <div className="empty">
                    {tab === "overview"
                      ? "The drafting funnel needs events this app does not yet record. They are added in the next update, after which this panel fills from real data only."
                      : "Generation errors, failed payments and credit changes will be listed here from the real event log in the next update."}
                  </div>
                </div>
              </div>
            )}

            {tab === "ai-files" && (
              <>
                {libraryMissing && (
                  <div className="fda-legacy fda">
                    <p className="fda-note warn">
                      <strong>The AI library tables are missing.</strong> Run <code>supabase/014_ai_library.sql</code>{" "}
                      in the Supabase SQL editor. Until then drafting uses the examples built into the code.
                    </p>
                  </div>
                )}
                <AiFiles
                  sources={sources}
                  folders={folders}
                  docTypes={catalogue.map((d) => ({ slug: d.slug, label: d.label }))}
                />
                <Questions docTypes={catalogue} />
              </>
            )}

            {(tab === "documents" || tab === "users" || tab === "credits") && (
              <div className="fda-legacy fda">
      {/* ── DOCUMENTS ────────────────────────────────────────────────────── */}
      {tab === "documents" && (
        <>
          <section className="kpi-row" aria-label="Document figures">
            <Kpi
              label={`Drafts, last ${rangeLabel}`}
              value={n(ds.period)}
              previous={n(ds.previous)}
            />
            <Kpi label="Drafts, all time" value={n(ds.total)} hint="Every draft ever started" />
            <Kpi
              label="Revisions"
              value={n(ds.revisions)}
              hint={`${fmt(n(ds.untouched))} drafts needed none`}
            />
            <Kpi label="Marked final" value={n(ds.finalised)} hint={`In the last ${rangeLabel}`} />
            <Kpi
              label="Failed generations"
              value={n(ds.failed)}
              hint={`${fmt(n(ds.exported))} downloaded as Word`}
              goodWhenUp={false}
            />
          </section>

          <div className="fda-grid" style={{ marginTop: 14 }}>
            <Panel
              title="By document type"
              sub={`Drafts started in the last ${rangeLabel}`}
            >
              <BarList
                rows={typeRows.map((r) => ({ label: r.label, value: n(r.drafts) }))}
                empty={`No drafts were started in the last ${rangeLabel}.`}
              />
            </Panel>

            <Panel
              title="How much work each draft took"
              sub="Revisions are the honest measure of whether the first output was usable"
            >
              {/* Drafts and revisions are different units, so they are not put
                  on one bar scale: 341 revisions beside 62 drafts would draw a
                  comparison that does not mean anything. */}
              <BarList
                rows={[
                  { label: "Right first time", value: n(ds.untouched), note: "no revisions" },
                  {
                    label: "Revised at least once",
                    value: Math.max(0, n(ds.period) - n(ds.untouched)),
                  },
                ]}
                empty={`Nothing was drafted in the last ${rangeLabel}.`}
                unit="drafts"
              />
              <ul className="stat-list" style={{ marginTop: 14 }}>
                <li>
                  <span className="k">Revisions asked for in total</span>
                  <span className="v">{fmt(n(ds.revisions))}</span>
                </li>
                <li>
                  <span className="k">Drafts downloaded as Word</span>
                  <span className="v">{fmt(n(ds.exported))}</span>
                </li>
              </ul>
            </Panel>
          </div>

          <Panel
            title="Recent documents"
            sub={`Newest first. Metadata only — no draft content is shown here or readable from this page.`}
            aside={
              <form className="fda-search" method="get" action="/admin">
                <input type="hidden" name="tab" value="documents" />
                <input type="hidden" name="days" value={days} />
                <input
                  className="fda-input"
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Email, title or type"
                  aria-label="Search documents"
                />
                <button className="secondary" type="submit">
                  Search
                </button>
              </form>
            }
          >
            {docRows.length === 0 ? (
              <p className="fda-empty">
                {q
                  ? `Nothing matches “${q}” in the last ${rangeLabel}.`
                  : `No drafts were started in the last ${rangeLabel}. Documents appear here as soon as somebody drafts one.`}
              </p>
            ) : (
              <div className="table-card table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Drafted by</th>
                      <th className="num">Revisions</th>
                      <th>Status</th>
                      <th>Started</th>
                      <th>Last touched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docRows.map((d) => (
                      <tr key={d.draft_id}>
                        <td className="name wrap-cell">{d.title || "Untitled"}</td>
                        <td>
                          <span className="meta-pill">{d.doc_type}</span>
                        </td>
                        <td className="muted wrap-cell">{d.owner_email ?? "—"}</td>
                        <td className="num">{d.versions || "—"}</td>
                        <td>
                          <span
                            className={`status-pill ${d.status === "final" ? "ready" : "review"}`}
                          >
                            {d.status === "final" ? "Final" : "Draft"}
                          </span>
                        </td>
                        <td className="muted">{when(d.created_at)}</td>
                        <td className="muted">{ago(d.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {/* ── USER STATISTICS ──────────────────────────────────────────────── */}
      {tab === "users" && (
        <>
          <section className="kpi-row" aria-label="People figures">
            <Kpi label="Accounts" value={n(us.accounts)} hint={`${fmt(n(us.admins))} administrators`} />
            <Kpi
              label={`New accounts, last ${rangeLabel}`}
              value={n(us.accounts_new)}
              previous={n(us.accounts_prev)}
            />
            <Kpi
              label="Have drafted at least once"
              value={n(us.activated)}
              hint={
                n(us.accounts)
                  ? `${Math.round((n(us.activated) / n(us.accounts)) * 100)}% of all accounts`
                  : undefined
              }
            />
            <Kpi
              label={`Active, last ${rangeLabel}`}
              value={n(us.active_period)}
              hint="Drafted something in this period"
            />
            <Kpi
              label={`Waitlist joins, last ${rangeLabel}`}
              value={n(us.waitlist_new)}
              previous={n(us.waitlist_prev)}
            />
          </section>

          <div className="fda-grid" style={{ marginTop: 14 }}>
            <Panel
              title="The drafting journey"
              sub={`Distinct people who reached each step in the last ${rangeLabel}. It stops at the download because that is the last thing this application can see.`}
            >
              {funnel.length === 0 || funnel.every((f) => !n(f.people)) ? (
                <p className="fda-empty">
                  Nobody has opened the drafting flow in this period — or{" "}
                  <code>supabase/003_events.sql</code> has not been run.
                </p>
              ) : (
                <ol className="funnel">
                  {funnel.map((f, i) => {
                    const here = n(f.people);
                    const prev = i ? n(funnel[i - 1].people) : here;
                    /* A later step can come out bigger than an earlier one:
                       events travel by sendBeacon, and one can be blocked or
                       lost while the next arrives. The bar is clamped so that
                       never renders as a 400%-wide stripe, and the note says
                       plainly that the step before went unmeasured rather than
                       reporting a percentage of nothing. */
                    const share = prev > 0 ? Math.min(1, here / prev) : 0;
                    return (
                      <li key={f.step}>
                        <div className="funnel-top">
                          <span>{f.label}</span>
                          <strong>{fmt(here)}</strong>
                        </div>
                        <div className="funnel-track">
                          <div
                            className="funnel-bar"
                            style={{ width: `${Math.max(2, share * 100).toFixed(1)}%` }}
                          />
                        </div>
                        <div className="funnel-note">
                          {!i
                            ? "Everyone who opened the catalogue"
                            : prev === 0
                              ? "The step before recorded nothing — some events do not arrive"
                              : here > prev
                                ? `More than the step before (${fmt(prev)}) — some events did not arrive`
                                : `${Math.round(share * 100)}% of the step before`}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>

            <Panel
              title="AI usage and cost"
              sub={`What the drafting actually cost over the last ${rangeLabel}`}
            >
              {/* A list, not bars: a request count and a head count are not the
                  same unit, and drawing them to one scale invents a ratio. */}
              <ul className="stat-list">
                <li>
                  <span className="k">Requests to the model</span>
                  <span className="v">{fmt(n(us.ai_requests))}</span>
                </li>
                <li>
                  <span className="k">People who drafted</span>
                  <span className="v">{fmt(n(us.active_period))}</span>
                </li>
                <li>
                  <span className="k">What it cost</span>
                  <span className="v">{money(n(us.ai_cost_usd))}</span>
                </li>
                <li>
                  <span className="k">The same work on a paid commercial model</span>
                  <span className="v">{money(n(us.ai_benchmark_usd))}</span>
                </li>
              </ul>
              {n(us.ai_requests) === 0 && (
                <p className="sub" style={{ marginTop: 12 }}>
                  Nothing was generated in the last {rangeLabel}.
                </p>
              )}
            </Panel>
          </div>

          <div className="fda-grid" style={{ marginTop: 14 }}>
            <Panel title="Most-opened pages" sub={`Page views, last ${rangeLabel}`}>
              <BarList
                rows={pageRows.map((r) => ({
                  label: r.label,
                  value: n(r.hits),
                  note: `${fmt(n(r.people))} people`,
                }))}
                empty="No page views recorded yet. Recording began with this release, so this fills up from now on."
              />
            </Panel>

            <Panel title="Countries" sub="By distinct visits">
              <BarList
                rows={countryRows.map((r) => ({ label: r.label, value: n(r.people) }))}
                empty="No location data yet. It is read from the request on Vercel, so it only appears for visits to the deployed site."
              />
            </Panel>

            <Panel title="Devices" sub="By distinct visits">
              <BarList
                rows={deviceRows.map((r) => ({
                  label: r.label.charAt(0).toUpperCase() + r.label.slice(1),
                  value: n(r.people),
                }))}
                empty="No device data yet."
              />
            </Panel>
          </div>

          <Panel
            title="Waitlist"
            sub={`${fmt(n(us.waitlist))} people in total — ${fmt(n(us.waitlist_waiting))} waiting, ${fmt(n(us.waitlist_invited))} invited. Newest first.`}
          >
            {waitlist.length === 0 ? (
              <p className="fda-empty">
                Nobody has joined the waitlist yet. Entries appear here the moment someone signs up.
              </p>
            ) : (
              <div className="table-card table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Company</th>
                      <th>Wants to draft</th>
                      <th>Joined</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlist.map((w) => (
                      <tr key={w.email}>
                        <td className="name wrap-cell">{w.email}</td>
                        <td>{w.name || "—"}</td>
                        <td>{w.company || "—"}</td>
                        <td className="muted wrap-cell">{w.note || "—"}</td>
                        <td className="muted">{when(w.created_at)}</td>
                        <td>
                          <span
                            className={`status-pill ${w.status === "waiting" ? "review" : "ready"}`}
                          >
                            {w.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {/* ── CREDITS & PLANS ──────────────────────────────────────────────── */}
      {tab === "credits" && (
        <>
          <section className="kpi-row" aria-label="Billing figures">
            <Kpi
              label="Paying members"
              value={n(ps.members_basic) + n(ps.members_pro) + n(ps.members_unlimited)}
              hint={`${fmt(n(ps.members_basic))} Basic · ${fmt(n(ps.members_pro))} Pro · ${fmt(n(ps.members_unlimited))} Unlimited`}
            />
            <Kpi
              label="Ending soon"
              value={n(ps.cancelling)}
              hint={`${fmt(n(ps.past_due))} with a failed payment`}
              goodWhenUp={false}
            />
            <Kpi
              label="Credits outstanding"
              value={n(ps.outstanding)}
              hint="Unspent and unexpired, across every account"
            />
            <Kpi
              label={`Credits used, last ${rangeLabel}`}
              value={n(ps.spent_period)}
              hint={`${fmt(n(ps.spent_unmetered))} of them on Unlimited`}
            />
            <Kpi
              label="Trials given"
              value={n(ps.trials)}
              hint={`Fair-use cap: ${n(ps.fair_use_cap) === 0 ? "none" : `${fmt(n(ps.fair_use_cap))} a month`}`}
            />
          </section>

          <Panel
            title="Where credits came from"
            sub={`Credits added to accounts in the last ${rangeLabel}`}
          >
            <BarList
              rows={[
                { label: "Bought — bundles and top-ups", value: n(ps.bought_period) },
                { label: "Included with a membership", value: n(ps.granted_period) },
                { label: "Given by an administrator", value: n(ps.gifted_period) },
              ]}
              empty={`No credits were added in the last ${rangeLabel}.`}
              unit="credits"
            />
          </Panel>

          <CreditsPanel initialLog={creditActions} />

          <Panel
            title="Accounts"
            sub="What each person pays, what they have left, and what they use it for."
            aside={
              <form className="fda-search" method="get" action="/admin">
                <input type="hidden" name="tab" value="billing" />
                <input type="hidden" name="days" value={days} />
                <input
                  className="fda-input"
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Email or name"
                  aria-label="Search accounts"
                />
                <button className="secondary" type="submit">
                  Search
                </button>
              </form>
            }
          >
            {accountRows.length === 0 ? (
              <p className="fda-empty">
                {q ? `No account matches “${q}”.` : "No accounts yet."}
              </p>
            ) : (
              <div className="table-card table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Plan</th>
                      <th>Renews</th>
                      <th className="num">Credits</th>
                      <th className="num">Drafts, 30 days</th>
                      <th className="num">Drafts, total</th>
                      <th>Last drafted</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountRows.map((a) => {
                      const plan = planLabel(a);
                      return (
                        <tr key={a.user_id}>
                          <td className="wrap-cell">
                            <div className="name">{a.full_name || a.email || "—"}</div>
                            {a.full_name && a.email && (
                              <div className="credit-sub">{a.email}</div>
                            )}
                          </td>
                          <td>
                            <span className={`status-pill ${plan.tone}`}>{plan.text}</span>
                          </td>
                          <td className="muted">{a.period_end ? when(a.period_end) : "—"}</td>
                          <td className="num">{fmt(n(a.balance))}</td>
                          <td className="num">{fmt(n(a.drafts_30d))}</td>
                          <td className="num">{fmt(n(a.drafts_total))}</td>
                          <td className="muted">{ago(a.last_draft_at)}</td>
                          <td className="muted">{when(a.joined_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
