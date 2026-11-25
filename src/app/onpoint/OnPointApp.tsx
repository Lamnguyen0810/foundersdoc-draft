"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ic, type IconName } from "../esop/[slug]/icons";
import { countdown, daysBetween, fmtDate } from "@/lib/onpoint/dates";
import { emailHtml, render, TOKENS, unknownTokens } from "@/lib/onpoint/templates";
import { money } from "@/lib/onpoint/payments";
import { ACTION_NAME, ACTIONS, nextReminder, whenDetail, whenTitle, type Connections, type DayNote, type Flow, type FlowAction, type FlowRun, type FlowTrigger } from "@/lib/onpoint/flows";
import { TYPE_NAME, TYPE_PICK, TYPES, type Client, type Deadline, type Delivery, type ReminderType, type Template } from "@/lib/onpoint/types";
import type { Row } from "@/lib/onpoint/xlsxWrite";

/**
 * OnPoint Workflows. 0294: every page follows the approved mock-up (OnPoint Workflows, 10 Jul 2026, with Billing):
 * Overview (Dashboard, Deadlines, Filing calendar) · Automation (Reminder emails, Rules & flows) · Records (Clients,
 * Excel sources) · Account (Billing). Payment reminders were not in the mock-up, so they are not shown.
 * Everything shown comes from /api/onpoint/data; every change goes back through the API, which checks it again.
 */

export interface Snapshot {
  me: { email: string; role: "admin" | "staff" | "viewer"; founder: boolean };
  ws: { id: string; slug: string; name: string; custom_name: string | null; logo: string | null; sender_name: string; sender_email: string | null; test_inbox: string | null; auto_send: boolean; filing_enabled: boolean; pay_subject?: string | null; pay_body?: string | null; pay_before?: number[]; pay_after?: number[]; payments_enabled?: boolean; mail_connected?: boolean; plan?: "free" | "active" | "retrying" | "none"; addon_enquired_at?: string | null; feedback_until?: string | null };
  clients: Client[];
  deadlines: Deadline[];
  deliveries: Delivery[];
  imports: Array<{ id?: number; file_name: string; kind: string; summary: Record<string, unknown>; imported_by: string | null; imported_at: string; undone_at?: string | null }>;
  templates: Record<ReminderType, Template>;
  leads: Record<ReminderType, number[]>;
  /* 0291: feedback, page by page, for the first 3 months */
  feedback?: Feedback[];
  feedback_ready?: boolean;
  /* 0294: Rules & flows, calendar notes, connections (rules_ready = supabase/148 has been run) */
  flows?: Flow[];
  runs?: FlowRun[];
  notes?: DayNote[];
  connections?: Connections;
  paused?: string[];
  rules_ready?: boolean;
  today: string;
}

type View = "dashboard" | "deadlines" | "calendar" | "reminders" | "rules" | "clients" | "client" | "sources" | "billing";

interface Feedback {
  id: string;
  page: string;
  message: string;
  created_by: string | null;
  created_at: string;
  status: "new" | "done";
  /* 0292 */
  kind?: "change" | "add" | "fix" | "question";
  shot?: boolean;
  edited_at?: string | null;
}
const KINDS: Array<["change" | "add" | "fix" | "question", string, string]> = [
  ["change", "✏️", "Change something"],
  ["add", "➕", "Add something"],
  ["fix", "⚠️", "Something is wrong"],
  ["question", "❓", "A question"],
];
/* the top bar: each page's title and one line, as in the mock-up */
const VIEW_META: Record<View, [string, string]> = {
  dashboard: ["Dashboard", "Every filing deadline, tracked from your Excel sheets"],
  deadlines: ["Deadlines", "Colour-coded by how close each due date is"],
  calendar: ["Filing calendar", "AR, AGM, ECI, FS and jobs in one view"],
  reminders: ["Reminder emails", "Sent to clients on your behalf"],
  rules: ["Rules & flows", "When a deadline nears, then take action"],
  clients: ["Clients", "Excel-driven: pulled from your Master List"],
  client: ["Client", "Client overview · all matters"],
  sources: ["Excel sources", "The sheets this system reads"],
  billing: ["Billing & plan", "Subscription, payment method and invoices"],
};
const PAGE_NAME: Record<View, string> = { dashboard: "Dashboard", deadlines: "Deadlines", calendar: "Filing calendar", reminders: "Reminder emails", rules: "Rules & flows", clients: "Clients", client: "Client page", sources: "Excel sources", billing: "Billing & plan" };
const feedbackOpen = (s: Snapshot) => !!s.feedback_ready && !!s.ws.feedback_until && s.today <= s.ws.feedback_until;

const VIEWS: View[] = ["dashboard", "deadlines", "calendar", "reminders", "rules", "clients", "sources", "billing"];
const PAGE = 50;
const DEFAULT_LOGO = "/onpoint/logo.png";
/* 0276: one calm colour per filing type, used wherever a deadline is shown */
const TAG: Record<ReminderType, string> = { AR: "t-ar", ECI: "t-eci", AGM: "t-agm", FS: "t-fs", CORP_SEC_EXPIRY: "t-cs", RECURRING_JOB: "t-job" };
const tagClass = (type: ReminderType) => `op-tag ${TAG[type] ?? ""}`;
const shortType = (d: Pick<Deadline, "type" | "label">) => (d.type === "CORP_SEC_EXPIRY" || d.type === "RECURRING_JOB" ? d.label || TYPE_PICK[d.type] : d.type === "FS" ? "FS" : d.type);
/* the mock-up's short names: Annual Return, AGM, FS, ECI, Corp-Sec Expiry, Job */
const LABEL: Record<ReminderType, string> = { AR: "Annual Return", AGM: "AGM", FS: "FS", ECI: "ECI", CORP_SEC_EXPIRY: "Corp-Sec Expiry", RECURRING_JOB: "Job" };
const SOURCE_OF: Record<ReminderType, string> = { AR: "Master List", AGM: "Master List", FS: "Master List", ECI: "Master List", CORP_SEC_EXPIRY: "Nominee Service", RECURRING_JOB: "Job Schedule" };

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  /* 0275: an answer that is not ours (a timeout or a gateway page) still says what happened */
  if (!res.ok && !j.error) j.error = `The server answered ${res.status}${res.status === 504 ? ": it took too long. Try one file at a time." : res.status === 413 ? ": the file is too large." : "."}`;
  return { ok: res.ok, status: res.status, j };
}

/** what every page needs to act on a deadline: send it now, preview it, open its client */
interface Act {
  s: Snapshot;
  byId: Map<string, Client>;
  canEdit: boolean;
  preview: boolean;
  say: (t: string) => void;
  reload: () => Promise<void>;
  sendNow: (d: Deadline) => Promise<void>;
  sent: Set<string>;
  onPreview: (d: Deadline) => void;
  quick: (clientId: string) => void;
}

/** a deadline's status, as in the mock-up: Overdue · Reminder sent · Scheduled (and Done / No email) */
function statusOf(d: Deadline, s: Snapshot, c: Client | undefined, sentFor: Set<string>): { k: "sent" | "ack" | "scheduled" | "flagged" | "done" | "noemail"; txt: string } {
  if (d.status !== "active") return { k: "done", txt: d.status === "completed" ? "Done" : d.status.replace("_", " ") };
  if (d.due_date < s.today) return { k: "flagged", txt: "Overdue" };
  if (sentFor.has(d.id)) return { k: "sent", txt: "Reminder sent" };
  if (!c?.contact_email) return { k: "noemail", txt: "No email yet" };
  return { k: "scheduled", txt: "Scheduled" };
}

export default function OnPointApp({ initial, preview = false }: { initial: Snapshot; preview?: boolean }) {
  const [s, setS] = useState(initial);
  const [view, setView] = useState<View>("dashboard");
  const [toast, setToast] = useState("");
  const [logoOpen, setLogoOpen] = useState(false);
  const [focus, setFocus] = useState<{ client: string; deadline: string } | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [back, setBack] = useState<View>("clients");
  const [quickId, setQuickId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [q, setQ] = useState("");
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((t: string) => {
    setToast(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4200);
  }, []);
  const reload = useCallback(async () => {
    if (preview) return;
    const r = await api("/api/onpoint/data");
    if (r.ok) setS(r.j as unknown as Snapshot);
    else say(String(r.j.error ?? "Could not refresh."));
  }, [preview, say]);

  const canEdit = s.me.role !== "viewer";
  const isAdmin = s.me.role === "admin";
  const byId = useMemo(() => new Map(s.clients.map((c) => [c.id, c])), [s.clients]);
  const live = useMemo(() => s.deadlines.filter((d) => d.status === "active"), [s.deadlines]);
  const overdue = live.filter((d) => d.due_date < s.today);
  const company = s.ws.custom_name || s.ws.name;
  const sentFor = useMemo(() => new Set([...s.deliveries.filter((x) => x.status === "sent" && x.deadline_id).map((x) => x.deadline_id!), ...sent]), [s.deliveries, sent]);
  const activeFlows = (s.flows ?? []).filter((f) => f.enabled).length + TYPES.filter((t) => (s.leads[t] ?? []).length && !(s.paused ?? []).includes(t) && live.some((d) => d.type === t)).length;
  const sheets = new Set(s.imports.filter((x) => !x.undone_at).flatMap((x) => x.kind.split(", ")).filter((k) => k && k !== "Not recognised")).size;

  /* coming back from Stripe (?billing=done&session_id=…) or a link to a view (?view=billing) */
  const [stripeReturn, setStripeReturn] = useState<{ sessionId: string | null; cancelled: boolean } | null>(null);
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    const v = u.get("view") as View | null;
    const billing = u.get("billing");
    if (!billing && !(v && VIEWS.includes(v))) return;
    /* eslint-disable react-hooks/set-state-in-effect -- read once from the address bar after the first render */
    if (billing) {
      setView("billing");
      setStripeReturn({ sessionId: u.get("session_id"), cancelled: billing === "cancelled" });
    } else if (v) setView(v);
    /* eslint-enable react-hooks/set-state-in-effect */
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const go = (v: View) => {
    setView(v);
    setQuickId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  /* the client page remembers where it was opened from, so Back returns there (mock-up) */
  const openClient = (id: string) => {
    setBack(view === "client" ? back : view);
    setClientId(id);
    go("client");
  };
  const openPreview = (d: Deadline) => {
    setFocus({ client: d.client_id, deadline: d.id });
    go("reminders");
  };
  const sendNow = useCallback(
    async (d: Deadline) => {
      const c = byId.get(d.client_id);
      if (!c?.contact_email) return say(`${c?.name ?? "This client"} has no email yet: add it on the client page.`);
      const where = s.ws.test_inbox ? `\n\nFor now it goes to ${s.ws.test_inbox} for a safety check.` : `\n\nIt goes to ${c.contact_email}.`;
      if (!window.confirm(`Send the ${TYPE_NAME[d.type]} reminder for ${c.name} now?${where}`)) return;
      if (preview) {
        setSent((x) => new Set(x).add(d.id));
        return say(`Reminder sent to ${c.contact_name || c.name} · ${TYPE_NAME[d.type]} (preview only)`);
      }
      const r = await api("/api/onpoint/send", { method: "POST", body: JSON.stringify({ deadline_id: d.id, request_id: crypto.randomUUID() }) });
      if (r.ok) setSent((x) => new Set(x).add(d.id));
      say(String(r.j.message ?? r.j.error ?? (r.ok ? "Sent" : "Not sent")));
      await reload();
    },
    [byId, preview, reload, s.ws.test_inbox, say],
  );
  const act: Act = { s, byId, canEdit, preview, say, reload, sendNow, sent: sentFor, onPreview: openPreview, quick: setQuickId };
  /* the top bar's search: client or UEN, shown on Deadlines (mock-up) */
  const search = (v: string) => {
    setQ(v);
    if (v && view !== "deadlines") go("deadlines");
  };

  const nav = (v: View, icon: IconName, label: string, badge?: number, soft?: boolean) => (
    <a
      href={`#${v}`}
      className={`ev-nav ${view === v ? "on" : ""}`}
      aria-current={view === v ? "page" : undefined}
      onClick={(e) => {
        e.preventDefault();
        go(v);
      }}
    >
      <Ic n={icon} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge ? <span className={`ev-badge ${soft ? "soft" : ""}`}>{badge}</span> : null}
    </a>
  );
  const [title, sub] = view === "client" ? [byId.get(clientId ?? "")?.name ?? "Client", VIEW_META.client[1]] : VIEW_META[view];

  return (
    <div className={`esop ev op ${collapsed ? "op-collapsed" : ""}`} id="top">
      {preview && <div className="op-preview">Preview with sample companies · nothing is saved or sent</div>}
      <div className="ev-body">
        <aside className="ev-side" aria-hidden={collapsed || undefined}>
          <div className="op-brand">
            <button type="button" className={`op-logo ${isAdmin ? "edit" : ""}`} onClick={() => isAdmin && setLogoOpen(true)} disabled={!isAdmin} aria-label={isAdmin ? "Change company logo" : company}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a small logo (data URL or public/) */}
              <img src={s.ws.logo || DEFAULT_LOGO} alt={`${company} logo`} />
              {isAdmin && <span aria-hidden="true">Change</span>}
            </button>
            <div>
              <b>{company}</b>
              <span>
                Workflows · <em>powered by FD AI</em>
              </span>
            </div>
            <button type="button" className="op-railbtn" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" title="Collapse sidebar">
              <Ic n="menu" s={16} />
            </button>
          </div>
          <nav aria-label="Main" className="ev-navs">
            <div className="ev-grp">
              <div className="ev-h">Overview</div>
              {nav("dashboard", "overview", "Dashboard")}
              {nav("deadlines", "esop", "Deadlines", overdue.length)}
              {nav("calendar", "calendar", "Filing calendar")}
            </div>
            <div className="ev-grp">
              <div className="ev-h">Automation</div>
              {nav("reminders", "mail", "Reminder emails")}
              {nav("rules", "flow", "Rules & flows", activeFlows, true)}
            </div>
            <div className="ev-grp">
              <div className="ev-h">Records</div>
              {nav("clients", "folder", "Clients", s.clients.length, true)}
              {nav("sources", "upload", "Excel sources")}
            </div>
            {isAdmin && (
              <div className="ev-grp">
                <div className="ev-h">Account</div>
                {nav("billing", "card", "Billing & plan")}
              </div>
            )}
          </nav>
          <div className="ev-foot">
            <div className="op-sending">
              Sending on behalf of <b>{s.ws.sender_name}</b>
              <span>
                {sheets} sheet{sheets === 1 ? "" : "s"} connected · <i className="op-live" aria-hidden="true" /> live
              </span>
            </div>
            <div className="ev-user">
              <div className="ev-uav" aria-hidden="true">
                {(s.me.email[0] ?? "U").toUpperCase()}
              </div>
              <div className="ev-uname">
                <span>{s.me.email}</span>
                <span>{s.me.founder ? "Founders Doc" : s.me.role === "admin" ? "Administrator" : s.me.role === "staff" ? "Staff" : "View only"}</span>
              </div>
            </div>
            {!preview && (
              <form action="/auth/signout" method="post">
                <button type="submit" className="op-signout">
                  Sign out
                </button>
              </form>
            )}
          </div>
        </aside>

        <main className="ev-main">
          <div className="op-topbar">
            {collapsed && (
              <button type="button" className="op-railbtn out" onClick={() => setCollapsed(false)} aria-label="Expand sidebar" title="Expand sidebar">
                <Ic n="menu" s={17} />
              </button>
            )}
            <div className="op-tbtitle">
              <b>{title}</b>
              <span>{sub}</span>
            </div>
            <label className="op-tbsearch">
              <Ic n="search" s={14} />
              <span className="ev-sr">Search client or UEN</span>
              <input value={q} placeholder="Search client, UEN…" onChange={(e) => search(e.target.value)} />
            </label>
          </div>
          <div className="ev-wrap op-view" key={view}>
            {view === "dashboard" && <Dashboard a={act} live={live} overdue={overdue} company={company} go={go} sheets={sheets} setS={setS} />}
            {view === "deadlines" && <Deadlines a={act} q={q} setQ={setQ} />}
            {view === "calendar" && <Calendar a={act} setS={setS} />}
            {view === "reminders" && <Reminders s={s} setS={setS} byId={byId} live={live} canEdit={canEdit} preview={preview} say={say} reload={reload} focus={focus} clearFocus={() => setFocus(null)} />}
            {view === "rules" && <Rules a={act} setS={setS} live={live} go={go} />}
            {view === "clients" && <Clients a={act} openClient={openClient} />}
            {view === "client" && clientId && <ClientPage key={clientId} a={act} setS={setS} id={clientId} back={() => go(back)} backLabel={PAGE_NAME[back]} />}
            {view === "sources" && <Sources s={s} setS={setS} canEdit={canEdit} preview={preview} say={say} reload={reload} byId={byId} />}
            {view === "billing" && isAdmin && <Billing preview={preview} founder={s.me.founder} enquired={s.ws.addon_enquired_at} say={say} back={stripeReturn} clients={s.clients.length} />}
            {/* 0291/0292: temporary, for the first 3 months: a Feedback button on every page */}
            {feedbackOpen(s) && <FeedbackLauncher s={s} setS={setS} page={PAGE_NAME[view]} preview={preview} say={say} reload={reload} />}
          </div>
        </main>
      </div>
      {quickId && <ClientModal a={act} id={quickId} onClose={() => setQuickId(null)} openPage={(id) => (setQuickId(null), openClient(id))} />}
      {logoOpen && <LogoModal current={s.ws.logo || DEFAULT_LOGO} name={company} preview={preview} onClose={() => setLogoOpen(false)} say={say} reload={reload} />}
      <div className={`e-toast ${toast ? "on" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

/* ── Export (mock-up: CSV, Excel, Google Sheets) ───────────────────────── */

function exportTables(s: Snapshot, byId: Map<string, Client>): Record<string, Row[]> {
  const dl = (d: Deadline): Row => {
    const c = byId.get(d.client_id);
    return {
      Company: c?.name ?? "",
      UEN: c?.uen ?? "",
      Type: d.label || TYPE_NAME[d.type],
      "Due Date": d.due_date,
      "Days Left": d.status === "active" ? daysBetween(s.today, d.due_date) : null,
      Status: d.status === "active" ? (d.due_date < s.today ? "Overdue" : "Open") : d.status === "completed" ? "Done" : d.status.replace("_", " "),
      Derived: d.derived ? "Yes" : "No",
      Contact: c?.contact_name ?? "",
      Email: c?.contact_email ?? "",
    };
  };
  const of = (t: ReminderType) => s.deadlines.filter((d) => d.type === t);
  const due = (c: Client, t: ReminderType) => s.deadlines.find((d) => d.client_id === c.id && d.type === t)?.due_date ?? "";
  return {
    Deadlines: s.deadlines.map(dl),
    Clients: s.clients.map((c) => ({ Company: c.name, UEN: c.uen ?? "", FYE: c.fye ?? "", Acc: c.services.includes("acc") ? "Yes" : "", "FS/Tax": c.services.includes("fs_tax") ? "Yes" : "", Sec: c.services.includes("sec") ? "Yes" : "", FS: due(c, "FS"), AGM: due(c, "AGM"), AR: due(c, "AR"), ECI: due(c, "ECI"), Contact: c.contact_name ?? "", Email: c.contact_email ?? "" })),
    Nominee: of("CORP_SEC_EXPIRY").map((d) => ({ Company: byId.get(d.client_id)?.name ?? "", Service: d.label ?? "Corp-sec", "Expiry Date": d.due_date, Status: d.status })),
    Jobs: of("RECURRING_JOB").map((d) => ({ Client: byId.get(d.client_id)?.name ?? "", Job: d.label ?? "Job", "Next Due": d.due_date, Status: d.status })),
  };
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ExportMenu({ s, byId, say }: { s: Snapshot; byId: Map<string, Client>; say: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  async function excel(): Promise<Blob> {
    const [{ default: JSZip }, { writeXlsx }] = await Promise.all([import("jszip"), import("@/lib/onpoint/xlsxWrite")]);
    return writeXlsx<Blob>(new JSZip(), exportTables(s, byId), "blob");
  }
  async function run(kind: "csv" | "xlsx" | "gsheets") {
    setOpen(false);
    if (kind === "csv") {
      downloadCsv(s.deadlines, byId, `OnPoint_Deadlines_${s.today}.csv`);
      return say("Deadlines exported as CSV");
    }
    const blob = await excel();
    save(blob, `OnPoint_Export_${s.today}.xlsx`);
    if (kind === "xlsx") return say("All sheets exported to Excel");
    say("Excel file downloaded: opening Google Sheets to import it (File → Import → Upload)");
    setTimeout(() => window.open("https://sheets.new", "_blank", "noopener"), 600);
  }
  return (
    <div className="op-export" ref={box}>
      <button className="ev-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <Ic n="download" s={14} />
        Export
      </button>
      {open && (
        <div className="op-exmenu" role="menu">
          <button role="menuitem" onClick={() => void run("csv")}>
            <span aria-hidden="true">📄</span> Export as CSV
          </button>
          <button role="menuitem" onClick={() => void run("xlsx")}>
            <span aria-hidden="true">📊</span> Export as Excel
          </button>
          <button role="menuitem" onClick={() => void run("gsheets")}>
            <span aria-hidden="true">🟢</span> Export to Google Sheets
          </button>
        </div>
      )}
      <span className="op-exmeta">Deadlines, clients, nominee &amp; jobs</span>
    </div>
  );
}

/* ── Dashboard (mock-up: greeting, 4 tiles, Export, Next deadlines, Reminder activity) ── */

/** "Good morning" in Singapore, the same on the server and in the browser */
const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Singapore" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

function Dashboard(p: { a: Act; live: Deadline[]; overdue: Deadline[]; company: string; go: (v: View) => void; sheets: number; setS: (fn: (s: Snapshot) => Snapshot) => void }) {
  const { s, byId } = p.a;
  const fortnight = p.live.filter((d) => d.due_date >= s.today && daysBetween(s.today, d.due_date) <= 14);
  const sent = s.deliveries.filter((d) => d.status === "sent" && d.deadline_id);
  /* mock-up: the next 7, from 30 days overdue onwards */
  const next = p.live.filter((d) => daysBetween(s.today, d.due_date) >= -30).slice(0, 7);
  const noEmail = s.clients.filter((c) => !c.contact_email && p.live.some((d) => d.client_id === c.id)).length;
  const firstNext = p.live.find((d) => d.due_date >= s.today);
  return (
    <>
      <header className="op-hero op-herorow">
        <div>
          <p className="op-eyebrow">Overview · {longDate(s.today)}</p>
          <h1>
            <span suppressHydrationWarning>{greeting()}</span>, {p.company.replace(/,?\s+(pte\.?\s*ltd\.?|private limited)$/i, "")} <span className="op-wave" aria-hidden="true">👋</span>
          </h1>
          <p>
            Here&rsquo;s where your filings stand today, automated from the <b>Master List</b>, <b>Job Schedule</b> and <b>Nominee Service</b> sheets. Reminders go to clients on your behalf before each due date, no manual chase.
          </p>
        </div>
        <ExportMenu s={s} byId={byId} say={p.a.say} />
      </header>
      {feedbackOpen(s) && (
        <div className="op-fbbanner" role="note">
          <span className="op-soontag">First 3 months</span>
          <span>
            <b>Tell us what to change, bit by bit.</b> Until {fmtDate(s.ws.feedback_until)}, press <b>Feedback</b> at the bottom right of any page, then <b>+ New feedback</b>, whenever you notice something. No call needed. This is temporary.
          </span>
        </div>
      )}
      {s.me.founder && (s.feedback ?? []).some((f) => f.status === "new") && <FeedbackInbox s={s} setS={p.setS} preview={p.a.preview} say={p.a.say} reload={p.a.reload} />}
      {s.clients.length === 0 && (
        <div className="ev-card op-empty">
          <b>No clients yet.</b> Import the Master List, Nominee Service and Job Schedule sheets on{" "}
          <a href="#sources" onClick={(e) => (e.preventDefault(), p.go("sources"))}>
            Excel sources
          </a>
          , and every deadline appears here.
        </div>
      )}
      <div className="op-stats">
        <Stat icon="clipboard" tone="gold" label="Deadlines tracked" value={p.live.length} sub={<><i className="op-live" aria-hidden="true" /> Live across {p.sheets || 0} sheet{p.sheets === 1 ? "" : "s"}</>} onClick={() => p.go("deadlines")} />
        <Stat icon="hourglass" tone="blue" label="Due this fortnight" value={fortnight.length} sub={firstNext ? `Next due ${fmtDate(firstNext.due_date)}` : "Nothing due"} onClick={() => p.go("deadlines")} />
        <Stat icon="alert" tone="red" label="Overdue" value={p.overdue.length} sub={p.overdue.length ? "Requires attention" : "All on time"} warn={p.overdue.length > 0} onClick={() => p.go("deadlines")} />
        <Stat icon="sent" tone="green" label="Reminders sent" value={sent.length} sub="This cycle, on your behalf" onClick={() => p.go("reminders")} />
      </div>
      {noEmail > 0 && (
        <div className="op-warn" role="note">
          {noEmail} client{noEmail === 1 ? "" : "s"} with a live deadline {noEmail === 1 ? "has" : "have"} no email address yet, so no reminder can reach them.{" "}
          <a href="#clients" onClick={(e) => (e.preventDefault(), p.go("clients"))}>
            Add emails
          </a>
        </div>
      )}
      <div className="op-grid2 op-dash">
        <section className="ev-card op-list">
          <div className="op-h">
            <h2>
              Next deadlines <span className="ev-sub">across the portfolio</span>
            </h2>
            <a href="#deadlines" onClick={(e) => (e.preventDefault(), p.go("deadlines"))}>
              View all →
            </a>
          </div>
          {next.length === 0 && <p className="ev-sub">Nothing to show yet.</p>}
          {next.map((d) => (
            <button key={d.id} className="op-row op-next" onClick={() => p.a.quick(d.client_id)}>
              <span className="op-name op-namechev">
                <span>{byId.get(d.client_id)?.name ?? "—"}</span>
                <Ic n="chev" s={11} />
              </span>
              <span className={tagClass(d.type)}>{LABEL[d.type]}</span>
              <span className="op-date">{fmtDate(d.due_date)}</span>
              <span className={dueClass(d.due_date, s.today)}>{shortCount(d.due_date, s.today)}</span>
            </button>
          ))}
        </section>
        <section className="ev-card op-list">
          <div className="op-h">
            <h2>Reminder activity</h2>
          </div>
          <Activity s={s} byId={byId} n={8} />
        </section>
      </div>
    </>
  );
}

/** the activity feed: reminders sent (or not), and what the flows did (Slack, Monday.com, the team, Zapier) */
function Activity({ s, byId, n }: { s: Snapshot; byId: Map<string, Client>; n: number }) {
  const flowName = new Map((s.flows ?? []).map((f) => [f.id, f.name]));
  /* the flows: one line per flow, action and run (many deadlines in one message) */
  const groups = new Map<string, { at: string; flow: string; action: FlowAction; n: number; status: string; note: string | null }>();
  for (const r of s.runs ?? []) {
    if (r.action === "email_client") continue;
    const k = `${r.flow_id}:${r.action}:${r.ran_at.slice(0, 16)}`;
    const g = groups.get(k);
    if (g) g.n++;
    else groups.set(k, { at: r.ran_at, flow: flowName.get(r.flow_id) ?? "A flow", action: r.action, n: 1, status: r.status, note: r.note });
  }
  const items = [
    ...s.deliveries.filter((x) => x.type !== "PAYMENT").map((x) => ({ at: x.requested_at, k: `d${x.id}`, x })),
    ...[...groups.entries()].map(([k, g]) => ({ at: g.at, k, g })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, n);
  if (!items.length) return <p className="ev-sub">No reminders sent yet. They appear here as they go out.</p>;
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      {items.map((it) =>
        "x" in it ? (
          <div key={it.k} className="op-act2">
            <span className={`op-acticon ${it.x.status}`} aria-hidden="true">
              <Ic n={it.x.status === "sent" ? "sent" : it.x.status === "failed" ? "bang" : "clock"} s={15} />
            </span>
            <div>
              <div>
                {it.x.status === "sent" ? "Reminder sent" : it.x.status === "failed" ? "Not sent" : it.x.status === "queued" ? "Sending" : "Skipped"} to <b>{byId.get(it.x.client_id ?? "")?.name ?? "a client"}</b>: {TYPE_NAME[it.x.type as ReminderType] ?? it.x.type}
                {it.x.trigger === "AUTOMATIC" ? <span className="op-testtag">automatic</span> : null}
                {it.x.test ? <span className="op-testtag">safety check</span> : null}
              </div>
              {it.x.error ? <div className="op-late op-small">{it.x.error}</div> : null}
              <div className="ev-sub op-small">{when(it.x.requested_at)}</div>
            </div>
          </div>
        ) : (
          <div key={it.k} className="op-act2">
            <span className={`op-acticon rule ${it.g.status}`} aria-hidden="true">
              <Ic n="flow" s={15} />
            </span>
            <div>
              <div>
                Flow <b>&ldquo;{it.g.flow}&rdquo;</b>: {it.g.status === "sent" ? (it.g.note ?? ACTION_NAME[it.g.action]) : `${ACTION_NAME[it.g.action]} skipped (${it.g.note ?? "not sent"})`} for {it.g.n} deadline{it.g.n === 1 ? "" : "s"}
              </div>
              <div className="ev-sub op-small">{when(it.g.at)}</div>
            </div>
          </div>
        ),
      )}
    </>
  );
}

/* ── Deadlines (mock-up: search, type pills, Next reminder, Status, Preview / Send now) ── */

type Pill = "all" | "AR" | "AGM" | "TAX" | "FS" | "Sec" | "Job";
const PILLS: Array<[Pill, string, string]> = [
  ["all", "All", ""],
  ["AR", "Annual Return", "#3a5a9b"],
  ["AGM", "AGM", "#b6862d"],
  ["TAX", "ECI / Tax / GST", "#3f7a4d"],
  ["FS", "Financial Statements", "#5f8f4a"],
  ["Sec", "Nominee / Corp-Sec", "#8a5bbf"],
  ["Job", "Jobs", "#2f7a86"],
];
const pillHas = (p: Pill, t: ReminderType) => (p === "all" ? true : p === "TAX" ? t === "ECI" : p === "Sec" ? t === "CORP_SEC_EXPIRY" : p === "Job" ? t === "RECURRING_JOB" : t === p);
type Show = "open" | "done" | "all";

function NextRem({ d, s }: { d: Deadline; s: Snapshot }) {
  const paused = (s.paused ?? []).includes(d.type);
  const nr = nextReminder(d, s.leads[d.type] ?? [], s.today, paused);
  if (nr.kind === "escalated") {
    const esc = (s.flows ?? []).some((f) => f.enabled && f.trigger === "overdue" && (!f.types.length || f.types.includes(d.type)));
    return <span className="op-nresc">{esc ? "escalated" : "overdue"}</span>;
  }
  if (nr.kind === "none") return <span className="ev-sub">{d.status === "active" ? (paused ? "paused" : "none set") : "–"}</span>;
  if (nr.kind === "dueday") return <span className="ev-sub">due-day</span>;
  return (
    <>
      <div className="op-date2">{fmtDate(nr.date)}</div>
      <div className="ev-sub op-small">
        {nr.inDays === 0 ? "today" : `in ${nr.inDays}d`}
        {!s.ws.auto_send ? " · automatic off" : ""}
      </div>
    </>
  );
}

function Deadlines(p: { a: Act; q: string; setQ: (v: string) => void }) {
  const { s, byId } = p.a;
  const [pill, setPill] = useState<Pill>("all");
  const [show, setShow] = useState<Show>("open");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState("");
  const q = p.q.trim().toLowerCase();
  const rows = s.deadlines
    .filter((d) => pillHas(pill, d.type) && (show === "all" || (show === "open" ? d.status === "active" : d.status !== "active")))
    .filter((d) => {
      if (!q) return true;
      const c = byId.get(d.client_id);
      return (c?.name ?? "").toLowerCase().includes(q) || (c?.uen ?? "").toLowerCase().includes(q) || TYPE_NAME[d.type].toLowerCase().includes(q) || LABEL[d.type].toLowerCase().includes(q) || (d.label ?? "").toLowerCase().includes(q);
    })
    /* mock-up: overdue first, then the soonest */
    .sort((a, b) => {
      const ao = a.status === "active" && a.due_date < s.today;
      const bo = b.status === "active" && b.due_date < s.today;
      if (ao !== bo) return ao ? -1 : 1;
      return a.due_date.localeCompare(b.due_date);
    });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  async function mark(d: Deadline, status: string) {
    if (p.a.preview) return p.a.say("Preview: not saved.");
    setBusy(d.id);
    const r = await api("/api/onpoint/deadline", { method: "PATCH", body: JSON.stringify({ id: d.id, status }) });
    setBusy("");
    if (!r.ok) return p.a.say(String(r.j.error ?? "Not saved."));
    p.a.say(status === "completed" ? "Marked done: its reminders stop" : status === "active" ? "Back to open" : "Marked not applicable");
    await p.a.reload();
  }
  return (
    <>
      <PageHead icon="esop" eyebrow="Deadlines" title="Everything we track">
        Annual Return, AGM, ECI, corp-sec expiry and recurring jobs, with the next reminder and status for each. Click a client to see all their matters.
      </PageHead>
      <div className="op-dlbar">
        <label className="op-dlsearch">
          <Ic n="search" s={15} />
          <span className="ev-sr">Search</span>
          <input value={p.q} placeholder="Search client, UEN or deadline type…" onChange={(e) => (p.setQ(e.target.value), setPage(0))} />
        </label>
        <div className="op-pills" role="group" aria-label="Deadline type">
          {PILLS.map(([k, label, dot]) => (
            <button key={k} className={pill === k ? "on" : ""} aria-pressed={pill === k} onClick={() => (setPill(k), setPage(0))}>
              {dot && <i style={{ background: dot }} aria-hidden="true" />}
              {label}
            </button>
          ))}
          <label className="ev-select op-push">
            <span className="ev-sr">Show</span>
            <select value={show} onChange={(e) => (setShow(e.target.value as Show), setPage(0))}>
              <option value="open">Open</option>
              <option value="done">Done / not applicable</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>
      </div>
      <section className="ev-card op-flush">
        <div className="ev-tablewrap">
          <table className="ev-table op-table op-dltable">
            <thead>
              <tr>
                <th>Client</th>
                <th>Deadline</th>
                <th>Due date</th>
                <th>Next reminder</th>
                <th>Status</th>
                <th className="op-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="ev-empty">
                    <div className="op-emptystate">
                      <span aria-hidden="true">
                        <Ic n="check" s={22} />
                      </span>
                      <b>No deadlines match.</b>
                      <span className="ev-sub">Try a different filter or search.</span>
                    </div>
                  </td>
                </tr>
              )}
              {shown.map((d) => {
                const c = byId.get(d.client_id);
                const st = statusOf(d, s, c, p.a.sent);
                return (
                  <tr key={d.id} className="op-click" onClick={() => p.a.quick(d.client_id)}>
                    <td>
                      <div className="op-cname">
                        {c?.name ?? "—"} <span className="op-chev">›</span>
                      </div>
                      <div className="ev-sub op-small">
                        {c?.uen ? <span className="op-mono">{c.uen}</span> : null}
                        {c?.uen && c?.contact_email ? " · " : ""}
                        {c?.contact_email ? <span className="op-email">{c.contact_email}</span> : null}
                      </div>
                    </td>
                    <td>
                      <span className={tagClass(d.type)}>{d.type === "CORP_SEC_EXPIRY" || d.type === "RECURRING_JOB" ? shortType(d) : LABEL[d.type]}</span>
                    </td>
                    <td>
                      <div className="op-date2">{fmtDate(d.due_date)}</div>
                      {d.status === "active" ? <span className={dueClass(d.due_date, s.today)}>{shortCount(d.due_date, s.today)}</span> : <span className="op-due done">{d.done_on ? `Done ${fmtDate(d.done_on)}` : "Closed"}</span>}
                    </td>
                    <td>
                      <NextRem d={d} s={s} />
                    </td>
                    <td>
                      <span className={`op-status ${st.k}`}>
                        <i aria-hidden="true" />
                        {st.txt}
                      </span>
                    </td>
                    <td className="op-right" onClick={(e) => e.stopPropagation()}>
                      <span className="op-acts">
                        {d.status === "active" ? (
                          <>
                            <button className="op-iconbtn" title="Preview email" aria-label={`Preview the email for ${c?.name ?? "this client"}`} onClick={() => p.a.onPreview(d)}>
                              <Ic n="mail" s={15} />
                            </button>
                            {p.a.canEdit && (
                              <button className={`op-iconbtn ${p.a.sent.has(d.id) ? "sent" : ""}`} title="Send now" aria-label={`Send the reminder to ${c?.name ?? "this client"} now`} onClick={() => void p.a.sendNow(d)}>
                                <Ic n="send" s={15} />
                              </button>
                            )}
                            {p.a.canEdit && (
                              <button className="op-iconbtn" title="Mark done (its reminders stop)" aria-label="Mark done" disabled={busy === d.id} onClick={() => void mark(d, "completed")}>
                                <Ic n="check" s={15} w={2.2} />
                              </button>
                            )}
                          </>
                        ) : (
                          p.a.canEdit && (
                            <button className="ev-link" disabled={busy === d.id} onClick={() => void mark(d, "active")}>
                              Reopen
                            </button>
                          )
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={rows.length} setPage={setPage} />
      </section>
    </>
  );
}

/* ── A deadline as a card (client quick view and client page, mock-up) ─── */

function DeadlineCard({ a, d, onDone }: { a: Act; d: Deadline; onDone?: () => void }) {
  const { s } = a;
  const nr = nextReminder(d, s.leads[d.type] ?? [], s.today, (s.paused ?? []).includes(d.type));
  return (
    <div className="op-dlcard">
      <div className="op-dlcardtop">
        <span className={tagClass(d.type)}>{d.type === "CORP_SEC_EXPIRY" || d.type === "RECURRING_JOB" ? shortType(d) : LABEL[d.type]}</span>
        <span className={dueClass(d.due_date, s.today)}>{shortCount(d.due_date, s.today)}</span>
      </div>
      <div className="op-dlcardgrid">
        <div>
          <span>Due date</span>
          <b>{fmtDate(d.due_date)}</b>
        </div>
        <div>
          <span>Next reminder</span>
          <b className={nr.kind === "escalated" ? "op-late" : ""}>{nr.kind === "date" ? fmtDate(nr.date) : nr.kind === "escalated" ? "escalated" : nr.kind === "dueday" ? "due-day" : "–"}</b>
        </div>
        <div>
          <span>Source</span>
          <b>{d.source || SOURCE_OF[d.type]}</b>
        </div>
      </div>
      <div className="op-chiprow">
        <button className="ev-btn sm" onClick={() => (a.onPreview(d), onDone?.())}>
          <Ic n="mail" s={13} />
          Preview email
        </button>
        {a.canEdit && (
          <button className={`ev-btn sm dark ${a.sent.has(d.id) ? "sent" : ""}`} onClick={() => void a.sendNow(d)}>
            <Ic n="send" s={13} />
            {a.sent.has(d.id) ? "Sent" : "Send now"}
          </button>
        )}
      </div>
    </div>
  );
}

/** mock-up: "Send all due reminders" = overdue, or due within 30 days */
const dueNow = (list: Deadline[], today: string) => list.filter((d) => d.status === "active" && daysBetween(today, d.due_date) <= 30);

/* ── Client quick view (mock-up's client pop-up) ───────────────────────── */

function ClientModal({ a, id, onClose, openPage }: { a: Act; id: string; onClose: () => void; openPage: (id: string) => void }) {
  const { s } = a;
  const c = a.byId.get(id);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  if (!c) return null;
  const dls = s.deadlines.filter((d) => d.client_id === id && d.status === "active").sort((x, y) => x.due_date.localeCompare(y.due_date));
  const late = dls.filter((d) => d.due_date < s.today).length;
  const due = dueNow(dls, s.today).filter(() => !!c.contact_email);
  const cats = [...new Set(dls.map((d) => LABEL[d.type]))].join(", ");
  return (
    <>
      <button className="ev-scrim top" aria-label="Close" onClick={onClose} />
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="op-qv" className="ev-pay op-modal op-quick">
        <div className="op-qvhead">
          <div>
            <h2 id="op-qv">{c.name}</h2>
            <p className="ev-sub op-mono">
              {c.uen ? `${c.uen} · ` : ""}
              <span className="op-email">{c.contact_email ?? "no email yet"}</span>
            </p>
            <div className="op-chiprow">
              <span className="op-mhpill">📄 {dls.length} deadline{dls.length === 1 ? "" : "s"} tracked</span>
              {c.fye && <span className="op-mhpill fye">🗓️ FYE {fmtDate(c.fye)}</span>}
              {late > 0 && <span className="op-mhpill warn">⚠ {late} overdue</span>}
            </div>
          </div>
          <button className="op-x" onClick={onClose} aria-label="Close">
            <Ic n="close" s={14} />
          </button>
        </div>
        <div className="op-qvbody">
          <div className="op-lab">
            Filing deadlines <span className="op-count">{dls.length}</span>
          </div>
          {dls.length === 0 && <p className="ev-sub">No open deadlines.</p>}
          {dls.slice(0, 2).map((d) => (
            <DeadlineCard key={d.id} a={a} d={d} onDone={onClose} />
          ))}
          <button className="op-viewmore" onClick={() => openPage(id)}>
            {dls.length > 2 ? `View all ${dls.length} matters →` : "Open the client page →"}
          </button>
          <div className="op-lab op-mt">Client contact</div>
          <div className="op-contactcard">
            <div>
              <span>Financial Year End (FYE)</span>
              <b>{c.fye ? fmtDate(c.fye) : "–"}</b>
            </div>
            <div>
              <span>Contact</span>
              <b>{c.contact_name || "–"}</b>
            </div>
            <div>
              <span>Email</span>
              <b>{c.contact_email || "–"}</b>
            </div>
            <div>
              <span>Categories</span>
              <b>{cats || "–"}</b>
            </div>
          </div>
        </div>
        <div className="ev-payb op-qvfoot">
          {a.canEdit && due.length > 0 ? <SendAllDeadlines ids={due.map((d) => d.id)} label={`for ${c.name}`} s={s} preview={a.preview} say={a.say} reload={a.reload} wide text={`Send all due reminders (${due.length})`} /> : <button className="ev-btn gold op-wide" onClick={() => openPage(id)}>Open client page</button>}
          <button className="ev-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
function PageHead({ icon, eyebrow, title, children }: { icon: IconName; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="op-head">
      <span className="op-headicon" aria-hidden="true">
        <Ic n={icon} s={20} />
      </span>
      <div>
        <p className="op-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children ? <p className="op-headsub">{children}</p> : null}
      </div>
    </header>
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MONTHS_LONG[m - 1]} ${y}`;
};
/** "11d overdue" · "due today" · "in 3d": the short form for badges */
const shortCount = (due: string, today: string) => {
  const n = daysBetween(today, due);
  return n === 0 ? "due today" : n < 0 ? `${-n}d overdue` : `in ${n}d`;
};
const dueClass = (due: string, today: string) => {
  const n = daysBetween(today, due);
  return n < 0 ? "op-due late" : n <= 7 ? "op-due soon" : "op-due";
};

/** a number that counts up once when it first appears (0276); still for anyone who prefers less motion */
function useCountUp(target: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = still ? 1 : Math.min(1, (t - t0) / 700);
      setN(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return n;
}

function Stat({ icon, tone, label, value, sub, warn, onClick, fmt }: { icon: IconName; tone: "gold" | "blue" | "red" | "green"; label: string; value: number; sub: ReactNode; warn?: boolean; onClick?: () => void; fmt?: (n: number) => string }) {
  const n = useCountUp(value);
  return (
    <button type="button" className="ev-card op-stat2" onClick={onClick}>
      <span className={`op-badge ${tone}`} aria-hidden="true">
        <Ic n={icon} s={20} />
      </span>
      <span className="op-statbody">
        <span className="op-statlabel">{label}</span>
        <b className={warn ? "op-late" : ""}>{fmt ? fmt(n) : n.toLocaleString("en-GB")}</b>
        <span className={`op-statsub ${warn ? "op-late" : ""}`}>{sub}</span>
      </span>
    </button>
  );
}

function Pager({ page, pages, total, setPage }: { page: number; pages: number; total: number; setPage: (n: number) => void }) {
  if (pages <= 1) return <div className="ev-sub op-pager">{total} shown</div>;
  return (
    <div className="op-pager">
      <span className="ev-sub">
        {page * PAGE + 1}–{Math.min(total, page * PAGE + PAGE)} of {total}
      </span>
      <button className="ev-btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
        <Ic n="back" s={12} />
      </button>
      <span className="ev-sub">
        Page {page + 1} of {pages}
      </span>
      <button className="ev-btn sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
        <Ic n="chev" s={12} />
      </button>
    </div>
  );
}


/* ── Reminder emails ───────────────────────────────────────────────────── */

function Reminders(p: {
  s: Snapshot;
  setS: (fn: (s: Snapshot) => Snapshot) => void;
  byId: Map<string, Client>;
  live: Deadline[];
  canEdit: boolean;
  preview: boolean;
  say: (t: string) => void;
  reload: () => Promise<void>;
  focus: { client: string; deadline: string } | null;
  clearFocus: () => void;
}) {
  const { s } = p;
  const focusDl = p.focus ? s.deadlines.find((d) => d.id === p.focus!.deadline) : undefined;
  const [type, setType] = useState<ReminderType>(focusDl?.type ?? "AR");
  const withDeadlines = useMemo(() => {
    const ids = new Set(p.live.map((d) => d.client_id));
    return s.clients.filter((c) => ids.has(c.id));
  }, [s.clients, p.live]);
  const [clientId, setClientId] = useState<string>(p.focus?.client ?? withDeadlines[0]?.id ?? "");
  const [deadlineId, setDeadlineId] = useState<string | null>(p.focus?.deadline ?? null);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState("");
  const [quick, setQuick] = useState({ name: "", email: "" });
  /* mock-up: opened from a deadline, the page is about that one client; otherwise about every client */
  const [focused, setFocused] = useState(!!p.focus);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const missingClient = p.focus && !p.byId.get(p.focus.client);

  const tpl = s.templates[type];
  const draft = drafts[type] ?? { subject: tpl.subject, body: tpl.body };
  const dirty = draft.subject !== tpl.subject || draft.body !== tpl.body;
  const client = p.byId.get(clientId);
  const mine = p.live.filter((d) => d.client_id === clientId).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const ofType = mine.filter((d) => d.type === type);
  const picked = ofType.find((d) => d.id === deadlineId) ?? [...ofType.filter((d) => d.due_date < s.today), ...ofType.filter((d) => d.due_date >= s.today)][0];
  const fallback = picked ? null : mine[0];
  const shownDl = picked ?? fallback;
  const r = shownDl && client ? render(draft, { type: shownDl.type === type ? type : shownDl.type, label: shownDl.label, company: client.name, uen: client.uen, contact: client.contact_name, due: shownDl.due_date, today: s.today }) : null;
  const bad = unknownTokens(draft.subject + draft.body);
  const canSend = !!picked && !!client?.contact_email && !dirty && !bad.length && !(r?.missing.length ?? 0) && p.canEdit;
  const leads = s.leads[type] ?? [];
  const upcoming = p.live.filter((d) => d.type === type && d.due_date >= s.today).slice(0, 6);

  const setDraft = (patch: Partial<{ subject: string; body: string }>) => setDrafts((x) => ({ ...x, [type]: { ...draft, ...patch } }));
  const pickType = (t: ReminderType) => {
    setType(t);
    setDeadlineId(null);
  };
  function insert(token: string) {
    const el = bodyRef.current;
    if (!el) return setDraft({ body: draft.body + token });
    const a = el.selectionStart ?? draft.body.length;
    const b = el.selectionEnd ?? a;
    const next = draft.body.slice(0, a) + token + draft.body.slice(b);
    setDraft({ body: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  }
  async function saveQuick() {
    if (!client) return;
    const email = quick.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return p.say("Check the email address.");
    if (p.preview) {
      p.setS((x) => ({ ...x, clients: x.clients.map((c) => (c.id === client.id ? { ...c, contact_email: email, contact_name: quick.name.trim() || c.contact_name } : c)) }));
      setQuick({ name: "", email: "" });
      return p.say("Saved (preview only)");
    }
    setBusy("quick");
    const res = await api("/api/onpoint/client", { method: "PATCH", body: JSON.stringify({ id: client.id, contact_name: quick.name.trim() || client.contact_name, contact_email: email }) });
    setBusy("");
    if (!res.ok) return p.say(String(res.j.error ?? "Not saved."));
    setQuick({ name: "", email: "" });
    p.say(`Email saved for ${client.name}`);
    await p.reload();
  }
  async function saveTemplate() {
    if (bad.length) return p.say(`Remove unsupported tokens first: ${bad.join(", ")}`);
    if (p.preview) {
      p.setS((x) => ({ ...x, templates: { ...x.templates, [type]: { ...x.templates[type], ...draft, version: x.templates[type].version + 1 } } }));
      return p.say("Saved (preview only)");
    }
    setBusy("save");
    const res = await api("/api/onpoint/template", { method: "PUT", body: JSON.stringify({ type, ...draft, version: tpl.version }) });
    setBusy("");
    if (!res.ok) return p.say(String(res.j.error ?? "Not saved: your edits are kept here."));
    p.say(`${TYPE_PICK[type]} template saved`);
    setDrafts((x) => {
      const n = { ...x };
      delete n[type];
      return n;
    });
    await p.reload();
  }
  async function saveLeads(next: number[]) {
    const uniq = [...new Set(next)].sort((a, b) => b - a);
    p.setS((x) => ({ ...x, leads: { ...x.leads, [type]: uniq } }));
    if (p.preview) return;
    const res = await api("/api/onpoint/schedule", { method: "PUT", body: JSON.stringify({ type, lead_days: uniq }) });
    if (!res.ok) {
      p.say(String(res.j.error ?? "Not saved."));
      await p.reload();
    }
  }
  function addLead(n: number) {
    if (!Number.isInteger(n) || n < 1 || n > 180) return p.say("Use a whole number of days from 1 to 180.");
    if (leads.includes(n)) return p.say(`${n} days before is already set.`);
    void saveLeads([...leads, n]);
  }
  async function send() {
    if (!picked || !client) return;
    if (p.preview) return p.say("Preview: nothing is sent.");
    if (!window.confirm(`Send the ${TYPE_PICK[type]} reminder for ${client.name} now?${s.ws.test_inbox ? `\n\nFor now it goes to ${s.ws.test_inbox} for a safety check.` : `\n\nIt goes to ${client.contact_email}.`}`)) return;
    setBusy("send");
    const res = await api("/api/onpoint/send", { method: "POST", body: JSON.stringify({ deadline_id: picked.id, request_id: crypto.randomUUID() }) });
    setBusy("");
    p.say(String(res.j.message ?? res.j.error ?? (res.ok ? "Sent" : "Not sent")));
    await p.reload();
  }

  return (
    <>
      <PageHead icon="mail" eyebrow="Automation" title={focused && client ? `Reminder emails for ${client.name}` : "Reminder emails"}>
        {focused && client ? (
          <>
            Previewing the exact email <b>{client.name}</b> will receive. Change the deadline or wording and the preview updates live.{" "}
            <button className="ev-link" onClick={() => (setFocused(false), p.clearFocus())}>
              Back to all reminders
            </button>
          </>
        ) : (
          <>The message clients receive before each deadline, sent on {s.ws.sender_name}&rsquo;s behalf. Set how many days in advance, edit the template, and preview with real client data.</>
        )}
      </PageHead>
      <AutoFiling s={s} setS={p.setS} preview={p.preview} say={p.say} reload={p.reload} />
      {missingClient && <div className="op-warn">That client or deadline is no longer there. Pick another below.</div>}
      <div className="op-grid2 wide">
        <section className="ev-card op-pad">
          <h2 className="op-h2">Template</h2>
          <div className="op-field">
            <span className="op-lab op-step"><i>1</i>Which deadline is this reminder for?</span>
            <label className="ev-select">
              <span className="ev-sr">Deadline type</span>
              <select value={type} onChange={(e) => pickType(e.target.value as ReminderType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_PICK[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="op-field">
            <span className="op-lab op-step"><i>2</i>Preview with client</span>
            {withDeadlines.length === 0 ? (
              <p className="ev-sub">No clients yet: import your sheets on Excel sources.</p>
            ) : (
              <label className="ev-select">
                <span className="ev-sr">Client</span>
                <select value={clientId} onChange={(e) => (setClientId(e.target.value), setDeadlineId(null))}>
                  {withDeadlines.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="op-field">
            <span className="op-lab op-step"><i>3</i>When to send reminders</span>
            <p className="ev-sub op-small">Reminders go out automatically this many days before each due date. Add as many as you like: most firms use 30, 14 and 7 days.</p>
            <div className="op-chiprow">
              {leads.length === 0 && <span className="op-leadempty">No reminders scheduled yet. Add one below and clients won&rsquo;t be chased automatically until you do.</span>}
              {leads.map((n) => (
                <span key={n} className="op-chip">
                  {n} day{n === 1 ? "" : "s"} before
                  {p.canEdit && (
                    <button aria-label={`Remove ${n} days before`} onClick={() => void saveLeads(leads.filter((x) => x !== n))}>
                      <Ic n="close" s={11} w={2.4} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {p.canEdit && (
              <>
                <div className="op-chiprow op-mt">
                  <span className="ev-sub op-small">Quick add:</span>
                  {[30, 14, 7, 3, 1].map((n) => (
                    <button key={n} className={`op-preset ${leads.includes(n) ? "added" : ""}`} disabled={leads.includes(n)} onClick={() => addLead(n)}>
                      {n} day{n === 1 ? "" : "s"}
                    </button>
                  ))}
                </div>
                <div className="op-leadadd">
                  <span className="op-leadin">
                    <input inputMode="numeric" placeholder="Enter a number of days" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && custom && (addLead(Number(custom)), setCustom(""))} />
                    <span>days before</span>
                  </span>
                  <button className="ev-btn gold" onClick={() => (addLead(Number(custom)), setCustom(""))} disabled={!custom}>
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="op-field">
            <label className="op-lab op-step" htmlFor="op-subject">
              <i>4</i>Subject and wording
            </label>
            <input id="op-subject" className="op-in" value={draft.subject} disabled={!p.canEdit} onChange={(e) => setDraft({ subject: e.target.value })} />
          </div>
          <div className="op-field">
            <label className="op-lab" htmlFor="op-body">
              Email
            </label>
            <textarea id="op-body" ref={bodyRef} className="op-in" rows={12} value={draft.body} disabled={!p.canEdit} onChange={(e) => setDraft({ body: e.target.value })} />
            {p.canEdit && (
              <>
              <p className="ev-sub op-small op-mt">Click to insert: each tag is replaced with the client&rsquo;s real details when the email sends.</p>
              <div className="op-chiprow" aria-label="Insert a token">
                {TOKENS.map((t) => (
                  <button key={t} className="op-token" onClick={() => insert(t)}>
                    {t}
                  </button>
                ))}
              </div>
              </>
            )}
            {bad.length > 0 && <p className="op-late">Not supported: {bad.join(", ")}</p>}
          </div>
          {p.canEdit && (
            <div className="op-chiprow">
              <button className="ev-btn gold" disabled={!dirty || busy === "save"} onClick={() => void saveTemplate()}>
                {busy === "save" ? "Saving…" : dirty ? "Save template" : "Saved"}
              </button>
              {dirty && (
                <button className="ev-link" onClick={() => setDrafts((x) => ({ ...x, [type]: { subject: tpl.subject, body: tpl.body } }))}>
                  Undo changes
                </button>
              )}
              <span className="ev-sub">Version {tpl.version || "default"}</span>
            </div>
          )}
        </section>

        <section className="ev-card op-pad">
          <h2 className="op-h2">{client ? `Email for ${client.name}` : "Preview"}</h2>
          {!picked && fallback && (
            <div className="op-warn">
              {client?.name} has no {TYPE_PICK[type]} deadline. Showing its {shortType(fallback)} deadline for context; this reminder cannot be sent.
            </div>
          )}
          {!shownDl && client && <div className="op-warn">{client.name} has no live deadlines.</div>}
          {r && client && (
            <div className="op-mail">
              <div>
                <span>From</span>
                <b>
                  {s.ws.sender_name}
                  {s.ws.sender_email ? ` <${s.ws.sender_email}>` : ""}
                </b>
              </div>
              <div>
                <span>To</span>
                {client.contact_email ? (
                  <b>
                    {client.contact_name ? `${client.contact_name} ` : ""}&lt;{client.contact_email}&gt;
                  </b>
                ) : p.canEdit ? (
                  /* 0279: type the client's email right here, then send */
                  <span className="op-quick">
                    <input className="op-in sm" placeholder="Contact name (optional)" value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} />
                    <input className="op-in sm" type="email" placeholder="client@company.com" value={quick.email} onChange={(e) => setQuick({ ...quick, email: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void saveQuick()} />
                    <button className="ev-btn sm gold" disabled={busy === "quick" || !quick.email.trim()} onClick={() => void saveQuick()}>
                      {busy === "quick" ? "Saving…" : "Save email"}
                    </button>
                  </span>
                ) : (
                  <b className="op-late">No email on file</b>
                )}
              </div>
              <div>
                <span>Subject</span>
                <b>{r.subject}</b>
              </div>
              {/* 0271: the designed email, exactly as it is sent (no scripts can run in it) */}
              <iframe
                className="op-mailframe"
                title="Email preview"
                sandbox="allow-same-origin"
                srcDoc={emailHtml(r.body, {
                  logoUrl: s.ws.logo || "",
                  sender: s.ws.custom_name || s.ws.sender_name,
                  brandName: s.ws.logo ? undefined : s.ws.custom_name || s.ws.sender_name,
                  deadline: { type: r.typeName, company: client.name, uen: client.uen, due: shownDl!.due_date, today: s.today },
                })}
                onLoad={(e) => {
                  const f = e.currentTarget;
                  const h = f.contentDocument?.documentElement.scrollHeight;
                  if (h) f.style.height = `${h}px`;
                }}
              />
            </div>
          )}
          {r?.missing.length ? <p className="op-late">Missing for this client: {r.missing.join(", ")}. Add it, or remove the token.</p> : null}
          {r?.notes.map((n) => (
            <p key={n} className="ev-sub">
              {n}
            </p>
          ))}
          {s.ws.test_inbox && <SafetyNote inbox={s.ws.test_inbox} />}
          {dirty && <p className="ev-sub">Save the template first: the email sent is always the saved version.</p>}
          {p.canEdit && (
            <button className="ev-btn gold op-mt" disabled={!canSend || busy === "send"} onClick={() => void send()}>
              <Ic n="mail" s={14} />
              {busy === "send" ? "Sending…" : "Send this reminder now"}
            </button>
          )}
          <h3 className="op-h3">Who this reaches</h3>
          {focused && client ? (
            <>
              <p className="ev-sub op-small">
                All deadlines for <b>{client.name}</b>: click one to preview its email.
              </p>
              {mine.length === 0 && <p className="ev-sub">No live deadlines for this client.</p>}
              {mine.map((d) => (
                <button
                  key={d.id}
                  className={`op-row ${shownDl?.id === d.id ? "on" : ""}`}
                  onClick={() => {
                    setType(d.type);
                    setDeadlineId(d.id);
                  }}
                >
                  <span className={tagClass(d.type)}>{shortType(d)}</span>
                  <span>{fmtDate(d.due_date)}</span>
                  <span className={d.due_date < s.today ? "op-late" : "op-soon"}>{countdown(d.due_date, s.today)}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <p className="ev-sub op-small">
                {leads.length ? (
                  <>
                    This reminder fires <b>{[...leads].sort((x, z) => z - x).join(", ")} days</b> before each {TYPE_PICK[type]} date{(s.paused ?? []).includes(type) ? " (paused on Rules & flows)" : ""}. Upcoming sends:
                  </>
                ) : (
                  <>No automatic reminders for {TYPE_PICK[type]} yet. Upcoming {TYPE_PICK[type]} dates:</>
                )}
              </p>
              {upcoming.length === 0 && <p className="ev-sub">No upcoming {TYPE_PICK[type]} deadlines.</p>}
              {upcoming.map((d) => (
                <button
                  key={d.id}
                  className={`op-reach ${shownDl?.id === d.id ? "on" : ""}`}
                  onClick={() => {
                    setClientId(d.client_id);
                    setDeadlineId(d.id);
                  }}
                >
                  <span className={`op-dot ${d.due_date < s.today ? "late" : daysBetween(s.today, d.due_date) <= 14 ? "soon" : ""}`} aria-hidden="true" />
                  <span className="op-name">{p.byId.get(d.client_id)?.name ?? "—"}</span>
                  <span className="ev-sub op-small">
                    {fmtDate(d.due_date)} · {shortCount(d.due_date, s.today)}
                  </span>
                </button>
              ))}
            </>
          )}
        </section>
      </div>
    </>
  );
}


/* ── Filing calendar (mock-up: month grid, day panel with deadlines, notes and "Send all") ── */

function Calendar({ a, setS }: { a: Act; setS: (fn: (s: Snapshot) => Snapshot) => void }) {
  const { s, byId } = a;
  const [ym, setYm] = useState(() => s.today.slice(0, 7));
  const [type, setType] = useState<"" | ReminderType>("");
  const [day, setDay] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const byDay = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    for (const d of s.deadlines) {
      if (d.status === "cancelled" || (type && d.type !== type)) continue;
      map.set(d.due_date, [...(map.get(d.due_date) ?? []), d]);
    }
    return map;
  }, [s.deadlines, type]);
  const notesBy = useMemo(() => {
    const map = new Map<string, DayNote[]>();
    for (const n of s.notes ?? []) map.set(n.day, [...(map.get(n.day) ?? []), n]);
    return map;
  }, [s.notes]);
  const move = (n: number) => {
    const t = y * 12 + (m - 1) + n;
    setYm(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  };
  /* six weeks from the Monday before the 1st, as in the mock-up (other months' days are greyed) */
  const start = Date.UTC(y, m - 1, 1 - lead);
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  const pick = (c: string) => {
    setDay(c);
    if (c.slice(0, 7) !== ym) setYm(c.slice(0, 7));
  };
  const list = day ? (byDay.get(day) ?? []).slice().sort((x, z) => (byId.get(x.client_id)?.name ?? "").localeCompare(byId.get(z.client_id)?.name ?? "")) : [];
  const open = list.filter((d) => d.status === "active");
  const sendable = open.filter((d) => byId.get(d.client_id)?.contact_email);
  const dayNotes = day ? (notesBy.get(day) ?? []) : [];
  const first = (n: string) => n.replace(/\b(pte|ltd|private|limited)\b\.?/gi, "").trim().split(/\s+/)[0] ?? n;

  async function addNote() {
    const t = note.trim();
    if (!t || !day) return;
    if (a.preview) {
      setS((x) => ({ ...x, notes: [...(x.notes ?? []), { id: `n${Date.now()}`, day, text: t, created_by: x.me.email }] }));
      setNote("");
      return a.say("Note added (preview only)");
    }
    setBusy(true);
    const r = await api("/api/onpoint/rules", { method: "POST", body: JSON.stringify({ action: "note", day, text: t }) });
    setBusy(false);
    if (!r.ok) return a.say(String(r.j.error ?? "Not saved."));
    setNote("");
    a.say("Note added");
    await a.reload();
  }
  async function removeNote(n: DayNote) {
    if (a.preview) {
      setS((x) => ({ ...x, notes: (x.notes ?? []).filter((k) => k.id !== n.id) }));
      return;
    }
    const r = await api("/api/onpoint/rules", { method: "POST", body: JSON.stringify({ action: "unnote", id: n.id }) });
    if (!r.ok) return a.say(String(r.j.error ?? "Not removed."));
    await a.reload();
  }
  return (
    <>
      <PageHead icon="calendar" eyebrow="Filing calendar" title="One view of every date">
        AR, AGM, ECI, FS and job dates across the whole portfolio. Click any day to see its deadlines, send reminders, or add a note.
      </PageHead>
      <div className="op-tools op-caltools">
        <button className="ev-btn sm" aria-label="Previous month" onClick={() => move(-1)}>
          ←
        </button>
        <h2 className="op-h2 op-month">
          {MONTHS[m - 1]} {y}
        </h2>
        <button className="ev-btn sm" aria-label="Next month" onClick={() => move(1)}>
          →
        </button>
        <button className="ev-btn sm" onClick={() => (setYm(s.today.slice(0, 7)), setDay(s.today))}>
          Today
        </button>
        <span className="op-legend op-push" aria-label="Legend">
          {(["AR", "AGM", "FS", "CORP_SEC_EXPIRY", "RECURRING_JOB"] as ReminderType[]).map((t) => (
            <span key={t} className={`op-calev op-legendtag ${TAG[t]}`}>
              {CAL_TAG[t]}
            </span>
          ))}
        </span>
        <label className="ev-select">
          <span className="ev-sr">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as ReminderType | "")}>
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_PICK[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="op-callayout">
        <section className="ev-card op-flush">
          <div className="op-cal" role="grid" aria-label={`${MONTHS[m - 1]} ${y}`}>
            {WEEK.map((w) => (
              <div key={w} className="op-calh" role="columnheader">
                {w}
              </div>
            ))}
            {cells.map((c) => {
              const l = (byDay.get(c) ?? []).filter((d) => d.status === "active");
              const ns = notesBy.get(c) ?? [];
              const other = c.slice(0, 7) !== ym;
              const more = Math.max(0, l.length - 3) + Math.max(0, ns.length - 1);
              return (
                <div
                  key={c}
                  role="gridcell"
                  tabIndex={0}
                  aria-selected={day === c}
                  aria-label={`${fmtDate(c)}: ${l.length} open${ns.length ? `, ${ns.length} note${ns.length === 1 ? "" : "s"}` : ""}`}
                  className={`op-cald ${other ? "other" : ""} ${day === c ? "on" : ""} ${c === s.today ? "today" : ""} ${c < s.today && l.length ? "late" : ""}`}
                  onClick={() => pick(c)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick(c))}
                >
                  <span className="op-caln">{Number(c.slice(8))}</span>
                  {ns.length > 0 && <span className="op-notedot" aria-hidden="true" />}
                  {l.slice(0, 3).map((d) => {
                    const name = byId.get(d.client_id)?.name ?? "";
                    return (
                      <button
                        key={d.id}
                        className={`op-calev ${TAG[d.type]}`}
                        title={`${name} · ${TYPE_NAME[d.type]}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          pick(c);
                          a.quick(d.client_id);
                        }}
                      >
                        {CAL_TAG[d.type]} · {first(name)}
                      </button>
                    );
                  })}
                  {ns.slice(0, 1).map((n) => (
                    <span key={n.id} className="op-calev note" title={n.text}>
                      📝 {n.text.length > 16 ? `${n.text.slice(0, 16)}…` : n.text}
                    </span>
                  ))}
                  {more > 0 && <span className="op-calmore">+{more} more</span>}
                </div>
              );
            })}
          </div>
        </section>
        <aside className="ev-card op-pad op-daypanel" aria-live="polite">
          {!day ? (
            <div className="op-dayempty">
              <span aria-hidden="true">🗓️</span>
              Click any day to see its deadlines, send reminders, or add a note.
            </div>
          ) : (
            <>
              <div className="op-dayhead">
                <div>
                  <b>{fmtDate(day).replace(/ \d{4}$/, "")}</b>
                  <span className="ev-sub">{longDate(day).split(",")[0]}, {day.slice(0, 4)}</span>
                </div>
                <span className="op-count">
                  {open.length} deadline{open.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="op-lab">Deadlines due</div>
              {list.length === 0 && <p className="ev-sub">No filing deadlines on this day.</p>}
              {list.map((d) => {
                const c = byId.get(d.client_id);
                return (
                  <div key={d.id} className={`op-dayitem ${d.status !== "active" ? "done" : ""}`} role="button" tabIndex={0} onClick={() => a.quick(d.client_id)} onKeyDown={(e) => e.key === "Enter" && a.quick(d.client_id)}>
                    <span className={tagClass(d.type)}>{CAL_TAG[d.type]}</span>
                    <div>
                      <b>{c?.name ?? "—"}</b>
                      <span className="ev-sub">{d.status === "active" ? c?.contact_name || c?.contact_email || "No email yet" : d.status === "completed" ? "Done" : d.status.replace("_", " ")}</span>
                    </div>
                    {d.status === "active" && a.canEdit && (
                      <button
                        className={`op-iconbtn ${a.sent.has(d.id) ? "sent" : ""}`}
                        title="Send reminder"
                        aria-label={`Send the reminder to ${c?.name ?? "this client"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void a.sendNow(d);
                        }}
                      >
                        <Ic n="send" s={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              <div className="op-lab op-mt">Notes{dayNotes.length ? ` · ${dayNotes.length}` : ""}</div>
              {dayNotes.map((n) => (
                <div key={n.id} className="op-noteitem">
                  <span aria-hidden="true">📝</span>
                  <span style={{ flex: 1 }}>{n.text}</span>
                  {a.canEdit && (
                    <button className="op-notex" aria-label="Remove note" onClick={() => void removeNote(n)}>
                      ×
                    </button>
                  )}
                </div>
              ))}
              {a.canEdit && (
                <div className="op-chiprow">
                  <input className="op-in sm" value={note} maxLength={300} placeholder="Add a note or reminder…" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addNote()} />
                  <button className="ev-btn sm gold" disabled={busy || !note.trim()} onClick={() => void addNote()}>
                    Add
                  </button>
                </div>
              )}
              {a.canEdit && sendable.length > 0 && (
                <div className="op-dayacts">
                  <SendAllDeadlines ids={sendable.map((d) => d.id)} label={`for ${fmtDate(day)}`} s={s} preview={a.preview} say={a.say} reload={a.reload} wide />
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </>
  );
}

/* ── Rules & flows (mock-up: When → Then, on/off, New flow) ────────────── */

const CHAN: Record<FlowAction, [string, string]> = { email_client: ["✉", "mail"], email_team: ["✉", "team"], slack: ["#", "slack"], monday: ["M", "monday"], zapier: ["⚡", "zap"] };
const ACTION_HINT: Record<FlowAction, string> = {
  email_client: "The reminder template for that deadline type",
  email_team: "A list of the deadlines, to OnPoint's own inbox",
  slack: "Alert the OnPoint team channel",
  monday: "A task on your Monday.com board (by its email address)",
  zapier: "Anything else, through a Zap (e.g. draft a renewal invoice)",
};
const connected = (a: FlowAction, c: Connections | undefined, ws: Snapshot["ws"]) =>
  a === "email_client" ? true : a === "email_team" ? !!(c?.team_email || ws.sender_email) : a === "slack" ? !!c?.slack : a === "monday" ? !!c?.monday_email : !!c?.zapier;

function Rules({ a, setS, live, go }: { a: Act; setS: (fn: (s: Snapshot) => Snapshot) => void; live: Deadline[]; go: (v: View) => void }) {
  const { s } = a;
  const [edit, setEdit] = useState<Partial<Flow> | null>(null);
  const [busy, setBusy] = useState("");
  const flows = s.flows ?? [];
  const paused = new Set(s.paused ?? []);
  /* the client chase per type = the days on Reminder emails (one card per type that has deadlines) */
  const chase = TYPES.filter((t) => (s.leads[t] ?? []).length && live.some((d) => d.type === t));
  const active = flows.filter((f) => f.enabled).length + chase.filter((t) => !paused.has(t)).length;
  const isAdmin = s.me.role === "admin";
  async function call(body: Record<string, unknown>, ok: string, local?: (x: Snapshot) => Snapshot) {
    if (a.preview) {
      if (local) setS(local);
      return a.say(`${ok} (preview only)`);
    }
    setBusy(String(body.action) + String(body.id ?? body.type ?? ""));
    const r = await api("/api/onpoint/rules", { method: "POST", body: JSON.stringify(body) });
    setBusy("");
    if (!r.ok) return a.say(String(r.j.error ?? "Not saved."));
    a.say(ok);
    await a.reload();
    return true;
  }
  const toggle = (f: Flow) => void call({ action: "toggle", id: f.id, on: !f.enabled }, f.enabled ? `“${f.name}” is off` : `“${f.name}” is on`, (x) => ({ ...x, flows: (x.flows ?? []).map((k) => (k.id === f.id ? { ...k, enabled: !f.enabled } : k)) }));
  const pause = (t: ReminderType) => void call({ action: "pause", type: t, paused: !paused.has(t) }, paused.has(t) ? `${LABEL[t]} reminders are on` : `${LABEL[t]} reminders are paused`, (x) => ({ ...x, paused: paused.has(t) ? (x.paused ?? []).filter((k) => k !== t) : [...(x.paused ?? []), t] }));
  const remove = (f: Flow) => window.confirm(`Delete the flow “${f.name}”?`) && void call({ action: "delete", id: f.id }, "Flow deleted", (x) => ({ ...x, flows: (x.flows ?? []).filter((k) => k.id !== f.id) }));

  const node = (kind: "When" | "Then", title: ReactNode, desc: ReactNode, chan?: FlowAction, warn?: string) => (
    <div className={`op-fnode ${kind === "When" ? "when" : "then"}`}>
      <span className="op-fnkind">{kind}</span>
      <b>
        {chan && <span className={`op-chan ${CHAN[chan][1]}`}>{CHAN[chan][0]}</span>}
        {title}
      </b>
      <span className="ev-sub op-small">{desc}</span>
      {warn && <span className="op-fwarn">{warn}</span>}
    </div>
  );
  return (
    <>
      <PageHead icon="flow" eyebrow="Automation" title="Rules & flows">
        Set what happens, and when. <b>When</b> a deadline gets close, <b>then</b> do something: email the client, post to Slack, flag OnPoint, or push a task to Monday.com. Same idea as Zapier, built around your filing dates.
      </PageHead>
      {!s.rules_ready && !a.preview && <div className="op-warn">Founders Doc: run supabase/148_onpoint_rules_flows.sql to save flows, connections and calendar notes.</div>}
      {!s.ws.auto_send && (
        <div className="op-soonbar" role="note">
          <span className="op-soontag muted">Automatic sending is off</span>
          <span>
            Flows run every morning at 8am (Singapore) once automatic reminders are switched on, on{" "}
            <a href="#reminders" onClick={(e) => (e.preventDefault(), go("reminders"))}>
              Reminder emails
            </a>
            .
          </span>
        </div>
      )}
      <div className="op-tools">
        <span className="ev-sub">
          <b>{active}</b> active flow{active === 1 ? "" : "s"}
        </span>
        {a.canEdit && (
          <button className="ev-btn gold op-push" onClick={() => setEdit({ name: "", trigger: "before", types: [], days: [21], actions: ["email_client"], enabled: true })}>
            <Ic n="plus" s={14} />
            New flow
          </button>
        )}
      </div>
      {edit && <FlowEditor a={a} f={edit} onCancel={() => setEdit(null)} onSaved={() => setEdit(null)} setS={setS} />}
      {chase.map((t) => {
        const ls = [...(s.leads[t] ?? [])].sort((x, z) => z - x);
        const on = !paused.has(t);
        return (
          <section key={t} className={`ev-card op-flowcard ${on ? "" : "off"}`}>
            <div className="op-ruletop">
              <b>
                {LABEL[t]} — {ls.join(" / ")} day chase
              </b>
              <span className="op-soontag muted">Reminder emails</span>
              {a.canEdit ? (
                <button type="button" role="switch" aria-checked={on} aria-label={`${LABEL[t]} chase`} className={`op-switch op-push ${on ? "on" : ""}`} disabled={busy === `pause${t}`} onClick={() => pause(t)}>
                  <i aria-hidden="true" />
                  <span>{on ? "On" : "Off"}</span>
                </button>
              ) : (
                <span className={`op-pill op-push ${on ? "ok" : "off"}`}>{on ? "On" : "Off"}</span>
              )}
            </div>
            <div className="op-flow">
              {node("When", `📅 ${TYPE_NAME[t]} approaching`, `Any ${LABEL[t]} date within ${ls[0]} days on your sheets`)}
              <span className="op-farrow" aria-hidden="true">→</span>
              {node(
                "Then",
                "Email the client",
                <>
                  Reminder at {ls.join(", ")} days before ·{" "}
                  <a href="#reminders" onClick={(e) => (e.preventDefault(), go("reminders"))}>
                    change the days or wording
                  </a>
                </>,
                "email_client",
              )}
            </div>
          </section>
        );
      })}
      {flows.map((f) => (
        <section key={f.id} className={`ev-card op-flowcard ${f.enabled ? "" : "off"}`}>
          <div className="op-ruletop">
            <b>{f.name}</b>
            {a.canEdit && (
              <span className="op-acts">
                <button className="ev-link" onClick={() => setEdit(f)}>
                  Edit
                </button>
                <button className="ev-link" onClick={() => remove(f)}>
                  Delete
                </button>
              </span>
            )}
            {a.canEdit ? (
              <button type="button" role="switch" aria-checked={f.enabled} aria-label={f.name} className={`op-switch op-push ${f.enabled ? "on" : ""}`} disabled={busy === `toggle${f.id}`} onClick={() => toggle(f)}>
                <i aria-hidden="true" />
                <span>{f.enabled ? "On" : "Off"}</span>
              </button>
            ) : (
              <span className={`op-pill op-push ${f.enabled ? "ok" : "off"}`}>{f.enabled ? "On" : "Off"}</span>
            )}
          </div>
          <div className="op-flow">
            {node("When", `${f.trigger === "before" ? "📅" : "⚠️"} ${whenTitle(f, (t) => LABEL[t])}`, `${whenDetail(f)}, on your sheets`)}
            {f.actions.map((x) => (
              <span key={x} className="op-fstep">
                <span className="op-farrow" aria-hidden="true">→</span>
                {node("Then", ACTION_NAME[x], ACTION_HINT[x], x, connected(x, s.connections, s.ws) ? undefined : "Not connected yet: see Connections below")}
              </span>
            ))}
          </div>
        </section>
      ))}
      {flows.length === 0 && s.rules_ready && a.canEdit && (
        <p className="ev-sub">
          No flows of your own yet.{" "}
          <button className="ev-link" onClick={() => void call({ action: "restore" }, "The suggested flows are back")}>
            Add the suggested flows
          </button>
        </p>
      )}
      <ConnectionsCard a={a} isAdmin={isAdmin} />
      <section className="ev-card op-pad">
        <h2 className="op-h2">Flow activity</h2>
        {(s.runs ?? []).length === 0 ? <p className="ev-sub">Nothing yet. Each time a flow runs, it shows here and on the Dashboard.</p> : <Activity s={{ ...s, deliveries: [] }} byId={a.byId} n={12} />}
      </section>
    </>
  );
}

function FlowEditor({ a, f, onCancel, onSaved, setS }: { a: Act; f: Partial<Flow>; onCancel: () => void; onSaved: () => void; setS: (fn: (s: Snapshot) => Snapshot) => void }) {
  const [v, setV] = useState({ name: f.name ?? "", trigger: (f.trigger ?? "before") as FlowTrigger, types: f.types ?? [], days: (f.days ?? [21]).join(", "), actions: f.actions ?? ["email_client"], enabled: f.enabled !== false });
  const [busy, setBusy] = useState(false);
  const days = v.days
    .split(/[\s,;]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= (v.trigger === "before" ? 1 : 0) && n <= 365);
  const flip = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((k) => k !== x) : [...list, x]);
  async function save() {
    const body = { action: "save", id: f.id, name: v.name.trim(), trigger: v.trigger, types: v.types, days, actions: v.actions, enabled: v.enabled };
    if (!body.name) return a.say("Give the flow a name.");
    if (!days.length) return a.say(v.trigger === "before" ? "Choose how many days before (1 to 365)." : "Choose how many days after (0 to 365).");
    if (!v.actions.length) return a.say("Choose at least one thing to do.");
    if (a.preview) {
      const nf: Flow = { id: f.id ?? `f${Date.now()}`, name: body.name, trigger: v.trigger, types: v.types, days, actions: v.actions, enabled: v.enabled };
      setS((x) => ({ ...x, flows: f.id ? (x.flows ?? []).map((k) => (k.id === f.id ? nf : k)) : [nf, ...(x.flows ?? [])] }));
      a.say("Flow saved (preview only)");
      return onSaved();
    }
    setBusy(true);
    const r = await api("/api/onpoint/rules", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) return a.say(String(r.j.error ?? "Not saved."));
    a.say(f.id ? "Flow saved" : "New flow added");
    await a.reload();
    onSaved();
  }
  return (
    <section className="ev-card op-pad op-floweditor" aria-label={f.id ? "Edit flow" : "New flow"}>
      <h2 className="op-h2">{f.id ? "Edit flow" : "New flow"}</h2>
      <div className="op-field">
        <label className="op-lab" htmlFor="op-fname">
          Name
        </label>
        <input id="op-fname" className="op-in" value={v.name} maxLength={120} placeholder="e.g. AGM — 21 day reminder" onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <div className="op-field">
        <span className="op-lab op-step">
          <i>1</i>When
        </span>
        <div className="ev-chips" role="group" aria-label="Deadline types">
          <button className={v.types.length === 0 ? "on" : ""} aria-pressed={v.types.length === 0} onClick={() => setV({ ...v, types: [] })}>
            Any deadline
          </button>
          {TYPES.map((t) => (
            <button key={t} className={v.types.includes(t) ? "on" : ""} aria-pressed={v.types.includes(t)} onClick={() => setV({ ...v, types: flip(v.types, t) })}>
              {LABEL[t]}
            </button>
          ))}
        </div>
        <div className="op-chiprow op-mt" role="radiogroup" aria-label="When">
          <label className="op-radio">
            <input type="radio" checked={v.trigger === "before"} onChange={() => setV({ ...v, trigger: "before", days: v.days === "0" ? "21" : v.days })} /> gets close:
          </label>
          <label className="op-radio">
            <input type="radio" checked={v.trigger === "overdue"} onChange={() => setV({ ...v, trigger: "overdue" })} /> passes its due date:
          </label>
          <input className="op-in sm op-days" value={v.days} aria-label="Days" onChange={(e) => setV({ ...v, days: e.target.value.replace(/[^\d,\s]/g, "") })} />
          <span className="ev-sub">{v.trigger === "before" ? "days before (e.g. 30, 14, 7)" : "days after (0 = the day after it is due)"}</span>
        </div>
      </div>
      <div className="op-field">
        <span className="op-lab op-step">
          <i>2</i>Then
        </span>
        {ACTIONS.map((x) => (
          <label key={x} className="op-check">
            <input type="checkbox" checked={v.actions.includes(x)} onChange={() => setV({ ...v, actions: flip(v.actions, x) })} />
            <span className={`op-chan ${CHAN[x][1]}`}>{CHAN[x][0]}</span>
            <span>
              <b>{ACTION_NAME[x]}</b> <span className="ev-sub">{ACTION_HINT[x]}</span>
              {!connected(x, a.s.connections, a.s.ws) && <span className="op-fwarn">not connected yet</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="op-chiprow">
        <button className="ev-btn gold" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save flow"}
        </button>
        <button className="ev-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

/** the team inbox, Monday.com, Slack and Zapier: administrators connect them; hook addresses are never shown again */
function ConnectionsCard({ a, isAdmin }: { a: Act; isAdmin: boolean }) {
  const c = a.s.connections;
  const [v, setV] = useState({ team_email: c?.team_email ?? "", monday_email: c?.monday_email ?? "", slack: "", zapier: "" });
  const [busy, setBusy] = useState("");
  async function saveOne(k: "team_email" | "monday_email" | "slack" | "zapier", value: string, ok: string) {
    if (a.preview) return a.say("Preview: not saved.");
    setBusy(k);
    const r = await api("/api/onpoint/rules", { method: "POST", body: JSON.stringify({ action: "connections", [k]: value }) });
    setBusy("");
    if (!r.ok) return a.say(String(r.j.error ?? "Not saved."));
    if (k === "slack" || k === "zapier") setV((x) => ({ ...x, [k]: "" }));
    a.say(ok);
    await a.reload();
  }
  async function test(kind: string) {
    if (a.preview) return a.say("Preview: nothing is sent.");
    setBusy(`t${kind}`);
    const r = await api("/api/onpoint/rules", { method: "POST", body: JSON.stringify({ action: "test", kind }) });
    setBusy("");
    a.say(String(r.j.message ?? r.j.error ?? (r.ok ? "Sent" : "Not sent")));
  }
  const row = (k: "team_email" | "monday_email" | "slack" | "zapier", chan: FlowAction, title: string, help: string, on: boolean, secret: boolean, placeholder: string, testKind: string) => (
    <div className="op-conn">
      <span className={`op-chan ${CHAN[chan][1]}`}>{CHAN[chan][0]}</span>
      <div className="op-connbody">
        <b>
          {title} <span className={`op-pill ${on ? "ok" : "off"}`}>{on ? "Connected" : "Not connected"}</span>
        </b>
        <span className="ev-sub op-small">{help}</span>
        {isAdmin && (
          <div className="op-chiprow">
            <input
              className="op-in sm"
              type={secret ? "password" : "email"}
              autoComplete="off"
              value={v[k]}
              placeholder={secret && on ? "Connected · paste a new address to replace it" : placeholder}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
            />
            <button className="ev-btn sm" disabled={!!busy || (!secret && v[k].trim() === ((k === "team_email" ? c?.team_email : c?.monday_email) ?? "")) || (secret && !v[k].trim())} onClick={() => void saveOne(k, v[k], `${title} saved`)}>
              {busy === k ? "Saving…" : "Save"}
            </button>
            {on && (
              <button className="ev-btn sm" disabled={!!busy} onClick={() => void test(testKind)}>
                {busy === `t${testKind}` ? "Sending…" : "Send a test"}
              </button>
            )}
            {on && secret && (
              <button className="ev-link" disabled={!!busy} onClick={() => window.confirm(`Disconnect ${title}?`) && void saveOne(k, "", `${title} disconnected`)}>
                Disconnect
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
  return (
    <section className="ev-card op-pad">
      <h2 className="op-h2">Connections</h2>
      <p className="ev-sub op-small">Where the “Then” steps go. {isAdmin ? "Webhook addresses are stored encrypted and never shown again." : "Your administrator connects these."}</p>
      {row("team_email", "email_team", "OnPoint team email", `Escalations and lists of deadlines${!c?.team_email && a.s.ws.sender_email ? ` (until set: ${a.s.ws.sender_email})` : ""}.`, !!(c?.team_email || a.s.ws.sender_email), false, "team@yourfirm.com", "email_team")}
      {row("slack", "slack", "Slack", "An incoming webhook for your #filings channel (Slack → Apps → Incoming Webhooks).", !!c?.slack, true, "https://hooks.slack.com/services/…", "slack")}
      {row("monday_email", "monday", "Monday.com", "Your board's email address (Monday.com → board → Integrations → Email): each message becomes a task.", !!c?.monday_email, false, "board-name@yourteam.monday.com", "monday")}
      {row("zapier", "zapier", "Zapier", "A Zap that starts with “Catch Hook”; it receives each flow's list of deadlines.", !!c?.zapier, true, "https://hooks.zapier.com/hooks/catch/…", "zapier")}
      {a.s.ws.test_inbox && <SafetyNote inbox={a.s.ws.test_inbox} />}
    </section>
  );
}

/* ── Clients (mock-up: a live mirror of the Master List, same columns as the sheet) ── */

function Clients({ a, openClient }: { a: Act; openClient: (id: string) => void }) {
  const { s } = a;
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  /* each client's deadline per type: the open one first, else the latest */
  const per = useMemo(() => {
    const m = new Map<string, Partial<Record<ReminderType, Deadline>>>();
    for (const d of s.deadlines) {
      const x = m.get(d.client_id) ?? {};
      const cur = x[d.type];
      if (!cur || (cur.status !== "active" && d.status === "active") || (cur.status === d.status && d.due_date > cur.due_date && d.status !== "active") || (cur.status === "active" && d.status === "active" && d.due_date < cur.due_date)) x[d.type] = d;
      m.set(d.client_id, x);
    }
    return m;
  }, [s.deadlines]);
  const master = s.imports.find((x) => !x.undone_at && x.kind.includes("Master List"));
  const qq = q.trim().toLowerCase();
  const rows = s.clients.filter((c) => (!onlyMissing || !c.contact_email) && (!qq || c.name.toLowerCase().includes(qq) || (c.uen ?? "").toLowerCase().includes(qq)));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const missing = s.clients.filter((c) => !c.contact_email).length;
  const tick = (on: boolean) => (on ? <span className="op-tick">✓</span> : <span className="op-tickno">·</span>);
  const cell = (d: Deadline | undefined) =>
    !d ? (
      <span className="op-blank">—</span>
    ) : d.status === "completed" ? (
      <span title="Done (date in the sheet)">{d.done_on ? fmtDate(d.done_on) : "Done"}</span>
    ) : d.status !== "active" ? (
      <span className="op-blank">{d.status === "waived" ? "Waiver" : "n/a"}</span>
    ) : (
      <>
        {fmtDate(d.due_date)}
        {d.derived && <span className="op-drv">derived</span>}
      </>
    );
  async function saveEmail(c: Client) {
    const email = (edit[c.id] ?? "").trim().toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return a.say("Check the email address.");
    if (a.preview) return a.say("Preview: not saved.");
    setBusy(c.id);
    const r = await api("/api/onpoint/client", { method: "PATCH", body: JSON.stringify({ id: c.id, contact_name: c.contact_name ?? "", contact_email: email }) });
    setBusy("");
    if (!r.ok) return a.say(String(r.j.error ?? "Not saved."));
    a.say(`Email saved for ${c.name}`);
    setEdit((x) => {
      const n = { ...x };
      delete n[c.id];
      return n;
    });
    await a.reload();
  }
  return (
    <>
      <PageHead icon="folder" eyebrow="Records · Excel-driven" title="Clients">
        A live mirror of your <b>Master List</b>, with the same columns as your sheet. The <b>Acc</b>, <b>FS/Tax</b> and <b>Sec</b> ticks show which services you run for each company. Dates marked <span className="op-drv">derived</span> are worked out from the FYE by ACRA and IRAS timelines until the sheet has them. Click any row for full matters.
      </PageHead>
      <div className="op-tools">
        <label className="ev-search">
          <Ic n="search" />
          <span className="ev-sr">Filter</span>
          <input value={q} placeholder="Filter by name or UEN…" onChange={(e) => (setQ(e.target.value), setPage(0))} />
        </label>
        <div className="ev-chips">
          <button className={!onlyMissing ? "on" : ""} onClick={() => (setOnlyMissing(false), setPage(0))}>
            All <span>{s.clients.length}</span>
          </button>
          <button className={onlyMissing ? "on" : ""} onClick={() => (setOnlyMissing(true), setPage(0))}>
            No email <span>{missing}</span>
          </button>
        </div>
        <span className="op-srcbadge op-push">📊 Source: {master ? master.file_name : "no Master List imported yet"}</span>
      </div>
      <section className="ev-card op-flush">
        <div className="ev-tablewrap">
          <table className="ev-table op-table op-mirror">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>UEN</th>
                <th>FYE</th>
                <th className="op-ctr">Acc</th>
                <th className="op-ctr">FS/Tax</th>
                <th className="op-ctr">Sec</th>
                <th>Date of FS</th>
                <th>AGM Date</th>
                <th>AR Date</th>
                <th>Tax Comp (ECI)</th>
                <th>Status</th>
                <th>Reminder email</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={12} className="ev-empty">
                    {s.clients.length ? `No clients match “${q}”.` : "No clients yet: import your Master List on Excel sources."}
                  </td>
                </tr>
              )}
              {shown.map((c) => {
                const x = per.get(c.id) ?? {};
                const ar = x.AR?.status === "active" ? daysBetween(s.today, x.AR.due_date) : null;
                const editing = edit[c.id] !== undefined;
                return (
                  <tr key={c.id} className="op-click" onClick={() => openClient(c.id)}>
                    <td>
                      <span className="op-cname">
                        {c.name} <span className="op-chev">›</span>
                      </span>
                    </td>
                    <td className="op-mono ev-sub">{c.uen || "—"}</td>
                    <td>{c.fye ? fmtDate(c.fye) : <span className="op-blank">—</span>}</td>
                    <td className="op-ctr">{tick(c.services.includes("acc"))}</td>
                    <td className="op-ctr">{tick(c.services.includes("fs_tax"))}</td>
                    <td className="op-ctr">{tick(c.services.includes("sec"))}</td>
                    <td>{cell(x.FS)}</td>
                    <td>{cell(x.AGM)}</td>
                    <td>{cell(x.AR)}</td>
                    <td>{x.ECI ? <span className="op-taxcomp">{x.ECI.status === "waived" ? "Waiver" : x.ECI.status === "completed" ? "Filed" : fmtDate(x.ECI.due_date)}</span> : <span className="op-blank">—</span>}</td>
                    <td>{ar === null ? <span className="op-pill off">—</span> : ar < 0 ? <span className="op-pill bad">AR overdue</span> : ar <= 30 ? <span className="op-pill warn">AR in {ar}d</span> : <span className="op-pill ok">on track</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {editing ? (
                        <span className="op-quick">
                          <input className="op-in sm" type="email" autoFocus value={edit[c.id]} placeholder="name@company.com" onChange={(e) => setEdit({ ...edit, [c.id]: e.target.value })} onKeyDown={(e) => (e.key === "Enter" ? void saveEmail(c) : e.key === "Escape" && setEdit((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== c.id))))} />
                          <button className="ev-btn sm gold" disabled={busy === c.id} onClick={() => void saveEmail(c)}>
                            {busy === c.id ? "…" : "Save"}
                          </button>
                        </span>
                      ) : c.contact_email ? (
                        <button className="ev-link op-email" disabled={!a.canEdit} onClick={() => setEdit({ ...edit, [c.id]: c.contact_email ?? "" })} title="Change the email">
                          {c.contact_email}
                        </button>
                      ) : a.canEdit ? (
                        <button className="op-due late op-addmail" onClick={() => setEdit({ ...edit, [c.id]: "" })}>
                          + Add email
                        </button>
                      ) : (
                        <span className="op-due late">No email</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={rows.length} setPage={setPage} />
      </section>
      <p className="ev-sub op-small">Your sheets have no email addresses, so add each client&rsquo;s here (or on its client page), or import a contacts sheet (company, contact name, email) on Excel sources. A reminder only goes to an address entered here.</p>
    </>
  );
}

/* ── Client page (mock-up: hero, filing deadlines as cards, contact, summary) ── */

function ClientPage({ a, setS, id, back, backLabel }: { a: Act; setS: (fn: (s: Snapshot) => Snapshot) => void; id: string; back: () => void; backLabel: string }) {
  const { s } = a;
  const c = a.byId.get(id);
  const [contact, setContact] = useState({ name: c?.contact_name ?? "", email: c?.contact_email ?? "" });
  const [notes, setNotes] = useState(c?.notes ?? "");
  const [busy, setBusy] = useState("");
  if (!c) {
    return (
      <>
        <button className="ev-link op-back" onClick={back}>
          ← Back
        </button>
        <PageHead icon="folder" eyebrow="Client" title="Client not found" />
      </>
    );
  }
  const all = s.deadlines.filter((d) => d.client_id === c.id);
  const dls = all.filter((d) => d.status === "active").sort((x, y) => x.due_date.localeCompare(y.due_date));
  const closed = all.filter((d) => d.status !== "active").sort((x, y) => y.due_date.localeCompare(x.due_date));
  const late = dls.filter((d) => d.due_date < s.today);
  const upcoming = dls.filter((d) => d.due_date >= s.today);
  const due = dueNow(dls, s.today);
  const history = s.deliveries.filter((d) => d.client_id === c.id && d.type !== "PAYMENT").slice(0, 20);
  const changed = contact.name !== (c.contact_name ?? "") || contact.email !== (c.contact_email ?? "");
  const cats = [...new Set(dls.map((d) => LABEL[d.type]))];
  const corpSec = dls.find((d) => d.type === "CORP_SEC_EXPIRY");

  async function patch(body: Record<string, unknown>, ok: string, local: Partial<Client>) {
    if (a.preview) {
      setS((x) => ({ ...x, clients: x.clients.map((k) => (k.id === c!.id ? { ...k, ...local } : k)) }));
      return a.say(`${ok} (preview only)`);
    }
    setBusy(ok);
    const r = await api("/api/onpoint/client", { method: "PATCH", body: JSON.stringify({ id: c!.id, ...body }) });
    setBusy("");
    if (!r.ok) return a.say(String(r.j.error ?? "Not saved."));
    a.say(ok);
    await a.reload();
  }

  return (
    <>
      <button className="ev-link op-back" onClick={back}>
        ← Back to {backLabel}
      </button>
      <header className="op-clienthero">
        <div>
          <h1>{c.name}</h1>
          <p className="ev-sub">
            {c.uen ? <span className="op-mono">{c.uen}</span> : null}
            {c.uen ? " · " : ""}
            <span className="op-email">{c.contact_email ?? "no email yet"}</span>
          </p>
        </div>
        <div className="op-chiprow op-push">
          <span className="op-mhpill">📄 {dls.length} deadline{dls.length === 1 ? "" : "s"}</span>
          {c.fye && <span className="op-mhpill fye">🗓️ FYE {fmtDate(c.fye)}</span>}
          {late.length > 0 && <span className="op-mhpill warn">⚠ {late.length} overdue</span>}
          {upcoming.length > 0 && <span className="op-mhpill">🕑 {upcoming.length} upcoming</span>}
        </div>
      </header>
      {s.ws.test_inbox && <SafetyNote inbox={s.ws.test_inbox} />}
      <div className="op-grid2 op-clientgrid">
        <section className="ev-card op-pad">
          <div className="op-h">
            <h2 className="op-h2">
              Filing deadlines <span className="ev-sub">{dls.length} tracked</span>
            </h2>
            {a.canEdit && c.contact_email && due.length > 0 && <SendAllDeadlines ids={due.map((d) => d.id)} label={`for ${c.name}`} s={s} preview={a.preview} say={a.say} reload={a.reload} text={`Send all due reminders (${due.length})`} />}
          </div>
          {dls.length === 0 && <p className="ev-sub">No open deadlines.</p>}
          {dls.map((d) => (
            <DeadlineCard key={d.id} a={a} d={d} />
          ))}
          {closed.length > 0 && (
            <p className="ev-sub op-small">
              Done or not applicable: {closed.slice(0, 6).map((d) => `${LABEL[d.type]} ${fmtDate(d.due_date)}`).join(" · ")}
              {closed.length > 6 ? ` and ${closed.length - 6} more` : ""}
            </p>
          )}
        </section>
        <div className="op-stack">
          <section className="ev-card op-pad">
            <h2 className="op-h2">Client contact</h2>
            <div className="op-field">
              <label className="op-lab" htmlFor="op-cname">
                Contact
              </label>
              <input id="op-cname" className="op-in" value={contact.name} disabled={!a.canEdit} placeholder="e.g. Alex Tan" onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            </div>
            <div className="op-field">
              <label className="op-lab" htmlFor="op-cmail">
                Email (reminders go here)
              </label>
              <input id="op-cmail" className="op-in" type="email" value={contact.email} disabled={!a.canEdit} placeholder="name@company.com" onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </div>
            {a.canEdit && (
              <button
                className="ev-btn"
                disabled={!changed || !!busy}
                onClick={() => {
                  const email = contact.email.trim().toLowerCase();
                  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return a.say("Check the email address.");
                  void patch({ contact_name: contact.name, contact_email: email }, "Contact saved", { contact_name: contact.name.trim() || null, contact_email: email || null });
                }}
              >
                {changed ? "Save contact" : "Saved"}
              </button>
            )}
            <div className="op-csrows">
              {corpSec && (
                <div>
                  <span>Corp Sec</span>
                  <b>{corpSec.label || "Corp-sec"}</b>
                </div>
              )}
              <div>
                <span>Categories</span>
                <b>{cats.join(", ") || "–"}</b>
              </div>
            </div>
          </section>
          <section className="ev-card op-pad">
            <h2 className="op-h2">Summary</h2>
            <div className="op-csrows">
              <div>
                <span>Financial Year End</span>
                <b>{c.fye ? fmtDate(c.fye) : "–"}</b>
              </div>
              <div>
                <span>Overdue</span>
                <b className={late.length ? "op-late" : ""}>{late.length}</b>
              </div>
              <div>
                <span>Upcoming</span>
                <b>{upcoming.length}</b>
              </div>
              <div>
                <span>Next due</span>
                <b>{upcoming[0] ? fmtDate(upcoming[0].due_date) : "–"}</b>
              </div>
              <div>
                <span>Sources</span>
                <b>{[...new Set(dls.map((d) => SOURCE_OF[d.type]))].join(", ") || "–"}</b>
              </div>
            </div>
          </section>
          <section className="ev-card op-pad">
            <h2 className="op-h2">Notes</h2>
            <textarea className="op-in" rows={4} value={notes} disabled={!a.canEdit} placeholder="e.g. director prefers WhatsApp; AGM usually held in March" onChange={(e) => setNotes(e.target.value)} />
            {a.canEdit && (
              <button className="ev-btn" disabled={notes === (c.notes ?? "") || !!busy} onClick={() => void patch({ notes }, "Notes saved", { notes: notes.trim() || null })}>
                {notes === (c.notes ?? "") ? "Saved" : "Save notes"}
              </button>
            )}
            <p className="ev-sub op-small">Only your team sees these notes.</p>
          </section>
        </div>
      </div>
      <section className="ev-card op-pad">
        <h2 className="op-h2">Reminder history</h2>
        {history.length === 0 && <p className="ev-sub">No reminders sent to this client yet.</p>}
        {history.map((x) => (
          <div key={x.id} className="op-act2">
            <span className={`op-acticon ${x.status}`} aria-hidden="true">
              <Ic n={x.status === "sent" ? "sent" : x.status === "failed" ? "bang" : "clock"} s={15} />
            </span>
            <div>
              <div>
                {x.status === "sent" ? "Sent" : x.status === "failed" ? "Not sent" : x.status === "queued" ? "Sending" : "Skipped"}: {x.subject ?? TYPE_NAME[x.type as ReminderType] ?? x.type}
                {x.trigger === "AUTOMATIC" ? <span className="op-testtag">automatic</span> : null}
                {x.test ? <span className="op-testtag">safety check</span> : null}
              </div>
              {x.error ? <div className="op-late op-small">{x.error}</div> : null}
              <div className="ev-sub op-small">{new Date(x.requested_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

/* ── Excel sources (mock-up: import zone, source cards, how mapping works, Export) ── */

const ago = (iso: string, now = Date.now()) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} d ago`;
};
const SOURCE_CARDS: Array<[string, string, string]> = [
  ["Master List", "Master_List.xlsx", "Pte Ltd · FYE, Acc, FS/Tax, Sec, Date of FS, AGM Date, AR Date, Tax Comp"],
  ["Job Schedule", "Job_Schedule.xlsx", "Accounts · Payroll · GST"],
  ["Nominee Service", "Nominee_Service.xlsx", "Secretary · Director · Shareholder · Address · QBO"],
  ["Contacts", "Contacts.xlsx", "Company · Contact name · Email"],
];

function Sources(p: { s: Snapshot; setS: (fn: (s: Snapshot) => Snapshot) => void; canEdit: boolean; preview: boolean; say: (t: string) => void; reload: () => Promise<void>; byId: Map<string, Client> }) {
  const { s } = p;
  const [busy, setBusy] = useState("");
  const [drag, setDrag] = useState(false);
  const [last, setLast] = useState<Array<Record<string, unknown>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [inbox, setInbox] = useState(s.ws.test_inbox ?? "");
  const [sender, setSender] = useState({ name: s.ws.sender_name, email: s.ws.sender_email ?? "" });
  const input = useRef<HTMLInputElement>(null);
  const [now] = useState(() => Date.now());
  async function upload(list: FileList | File[]) {
    setErr(null);
    const files = [...list].filter((f) => /\.(xlsx|csv|xls)$/i.test(f.name));
    if (!files.length) return setErr("Choose .xlsx or .csv files (Excel workbooks or CSV).");
    if (p.preview) return p.say("Preview: files are not read here.");
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    setBusy("import");
    const r = await api("/api/onpoint/import", { method: "POST", body: fd });
    setBusy("");
    if (!r.ok) return setErr(String(r.j.error ?? "Not imported."));
    setLast(r.j.results as Array<Record<string, unknown>>);
    p.say("Imported: every view has been recalculated");
    await p.reload();
  }
  async function saveSettings(patch: Record<string, unknown>, done: string) {
    if (p.preview) return p.say("Preview: not saved.");
    setBusy("settings");
    const r = await api("/api/onpoint/settings", { method: "PATCH", body: JSON.stringify(patch) });
    setBusy("");
    if (!r.ok) return p.say(String(r.j.error ?? "Not saved."));
    p.say(done);
    await p.reload();
  }
  const MAP: Array<[string, string]> = [
    ["Date of FS", "Financial Statements reminder"],
    ["AGM Date", "AGM reminder + calendar entry"],
    ["AR Date", "Annual Return reminder (ACRA)"],
    ["FYE", "ECI due date (FYE + 3 months); FS and AGM FYE + 6 months; AR FYE + 7 months"],
    ["Date expire", "Corp-Sec renewal notice"],
    ["Frequency · Last Completed · Next Due", "Recurring job reminder schedule"],
    ["“Managed by client”, “Exempted”, “Waiver”, “To strike off”", "Not applicable, waived or cancelled: no reminder"],
    ["Company + Email (+ Contact)", "Each client's reminder recipient"],
  ];
  const latest = (kind: string) => s.imports.find((x) => !x.undone_at && x.kind.split(", ").includes(kind));
  const count = (kind: string) => (kind === "Nominee Service" ? s.deadlines.filter((d) => d.type === "CORP_SEC_EXPIRY").length : kind === "Job Schedule" ? s.deadlines.filter((d) => d.type === "RECURRING_JOB").length : kind === "Contacts" ? s.clients.filter((c) => c.contact_email).length : s.clients.length);
  return (
    <>
      <header className="op-herorow">
        <PageHead icon="upload" eyebrow="Records" title="Excel sources">
          The sheets this system reads. It never overwrites them: it only watches for changes and turns dates into reminders. <b>Import your own</b> Master List, Job Schedule or Nominee sheet below.
        </PageHead>
        <ExportMenu s={s} byId={p.byId} say={p.say} />
      </header>
      {p.canEdit && (
        <section
          className={`op-drop op-dropgold ${drag ? "on" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void upload(e.dataTransfer.files);
          }}
        >
          <span className="op-dropicon" aria-hidden="true">
            📥
          </span>
          <b>Import an Excel sheet</b>
          <span>
            Drop a <b>.xlsx</b> or <b>.csv</b> here, or click to browse. Columns like <code>AGM Date</code>, <code>AR Date</code>, <code>Date expire</code> map automatically. Re-import any time: it replaces the last version, no duplicates.
          </span>
          <button className="ev-btn gold sm" disabled={busy === "import"} onClick={(e) => (e.stopPropagation(), input.current?.click())}>
            <Ic n="plus" s={13} />
            {busy === "import" ? "Reading…" : "Choose file"}
          </button>
          <input ref={input} type="file" accept=".xlsx,.csv" multiple hidden onChange={(e) => (e.currentTarget.files && void upload(e.currentTarget.files), (e.currentTarget.value = ""))} />
        </section>
      )}
      {err && (
        <div className="op-result err" role="alert">
          <b>⚠️ Couldn&rsquo;t import</b>
          <span>{err}</span>
          <button className="op-notex" aria-label="Dismiss" onClick={() => setErr(null)}>
            ×
          </button>
        </div>
      )}
      {last && (
        <section className="ev-card op-pad op-resultcard">
          {last.map((x, i) => {
            const imp = s.imports.find((k) => k.id === x.import_id);
            return (
              <div key={i} className="op-result">
                <b>
                  ✅ {Number(x.superseded) ? "Re-synced" : "Imported"} “{String(x.file)}”
                </b>
                <span className="ev-sub">
                  {Number(x.superseded) ? "This source was replaced with the latest version: no duplicates. " : ""}Deadlines and every view have been recalculated.{" "}
                  {((x.kinds as string[] | undefined) ?? []).map((k) => (
                    <span key={k} className="op-okchip">
                      {k}
                    </span>
                  ))}
                  <span className="op-okchip">{String(x.clients)} clients</span>
                  <span className="op-okchip">{String(x.deadlines)} deadlines</span>
                  {Number(x.contacts) ? <span className="op-okchip">{String(x.contacts)} emails</span> : null}
                </span>
                {(x.skipped as string[] | undefined)?.length ? <span className="ev-sub op-small">Not read: {(x.skipped as string[]).join(", ")}</span> : null}
                {p.canEdit && imp?.id && !imp.undone_at && <UndoImport imp={imp} preview={p.preview} say={p.say} reload={p.reload} setS={p.setS} label="Remove this import" />}
              </div>
            );
          })}
        </section>
      )}
      <div className="op-grid3">
        {SOURCE_CARDS.map(([kind, file, sheets]) => {
          const imp = latest(kind);
          return (
            <section key={kind} className={`ev-card op-src ${imp ? "imported" : ""}`}>
              <div className="op-srcfile">
                <span className="op-xls" aria-hidden="true">
                  X
                </span>
                {imp ? imp.file_name : file}
              </div>
              <span className="ev-sub op-small">Sheets: {sheets}</span>
              <div className="op-srcstat">
                <span>Recognised as</span>
                <b>{kind}</b>
              </div>
              <div className="op-srcstat">
                <span>{kind === "Master List" ? "Companies tracked" : kind === "Contacts" ? "Clients with an email" : kind === "Job Schedule" ? "Recurring jobs" : "Corp-sec records"}</span>
                <b>{imp ? count(kind) : "–"}</b>
              </div>
              <div className="op-srcfoot">
                {imp ? (
                  <>
                    <span className="op-srclive">
                      <i className="op-live" aria-hidden="true" />
                      Imported · updated <span suppressHydrationWarning>{ago(imp.imported_at, now)}</span>
                    </span>
                    {p.canEdit && imp.id ? <UndoImport imp={imp} preview={p.preview} say={p.say} reload={p.reload} setS={p.setS} label="Remove" /> : null}
                  </>
                ) : (
                  <span className="ev-sub op-small">Not imported yet</span>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="op-grid2">
        <section className="ev-card op-pad">
          <h2 className="op-h2">How mapping works</h2>
          <p className="ev-sub op-small">Each column becomes a tracked deadline. Edit a date in your sheet, re-import it, and the reminder moves with it: nothing is re-keyed.</p>
          {MAP.map(([x, y]) => (
            <div key={x} className="op-maprow">
              <code>{x}</code>
              <span aria-hidden="true">→</span>
              <span>{y}</span>
            </div>
          ))}
        </section>
        <section className="ev-card op-pad">
          <h2 className="op-h2">Imports</h2>
          {s.imports.length === 0 && <p className="ev-sub">Nothing imported yet.</p>}
          {s.imports.map((x, i) => (
            <div key={i} className="op-act op-imp">
              <span className="op-acticon file" aria-hidden="true">
                <Ic n="folder" s={14} />
              </span>
              <span>
                <b>{x.file_name}</b>
                <span className="ev-sub"> · {x.kind}</span>
              </span>
              <span className="ev-sub">{new Date(x.imported_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              {x.undone_at ? <span className="op-pill off">Removed</span> : p.canEdit && x.id ? <UndoImport imp={x} preview={p.preview} say={p.say} reload={p.reload} setS={p.setS} label="Remove" /> : null}
            </div>
          ))}
        </section>
      </div>
      {s.me.role === "admin" && <MailboxCard preview={p.preview} say={p.say} reload={p.reload} defaultEmail={s.ws.sender_email ?? ""} founder={s.me.founder} myEmail={s.me.email} />}
      {s.me.founder && (
        <section className="ev-card op-pad">
          <h2 className="op-h2">Sending · Founders Doc only</h2>
          <div className="op-field">
            <label className="op-lab" htmlFor="op-inbox">
              Safety-check inbox: for now every email goes here (empty = emails go to the clients)
            </label>
            <div className="op-chiprow">
              <input id="op-inbox" className="op-in" value={inbox} placeholder="administrator@foundersdoc.com" onChange={(e) => setInbox(e.target.value)} />
              <button
                className="ev-btn"
                disabled={busy === "settings" || inbox.trim() === (s.ws.test_inbox ?? "")}
                onClick={() => {
                  if (!inbox.trim() && !window.confirm("Go live? Reminders will go to the clients' own email addresses.")) return;
                  void saveSettings({ test_inbox: inbox }, inbox.trim() ? "Safety-check inbox saved" : "Emails now go to the clients");
                }}
              >
                Save
              </button>
            </div>
          </div>
          <div className="op-field">
            <span className="op-lab">Sender name in the email footer (a connected mailbox always sends as itself)</span>
            <div className="op-chiprow">
              <input className="op-in" value={sender.name} onChange={(e) => setSender({ ...sender, name: e.target.value })} />
              <input className="op-in" value={sender.email} placeholder="sadiq@…" onChange={(e) => setSender({ ...sender, email: e.target.value })} />
              <button className="ev-btn" disabled={busy === "settings"} onClick={() => void saveSettings({ sender_name: sender.name, sender_email: sender.email }, "Sender saved")}>
                Save
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
/* ── Brand identity (the sidebar logo) ─────────────────────────────────── */

function LogoModal(p: { current: string; name: string; preview: boolean; onClose: () => void; say: (t: string) => void; reload: () => Promise<void> }) {
  const [img, setImg] = useState<string | null>(null);
  const [name, setName] = useState(p.name);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [p]);
  function pick(f?: File) {
    setErr("");
    if (!f) return;
    if (!/^image\/(png|jpeg)$/.test(f.type)) return setErr("Upload a PNG or JPG image.");
    if (f.size > 500 * 1024) return setErr("The logo must be 500 KB or smaller.");
    const r = new FileReader();
    r.onload = () => setImg(String(r.result));
    r.onerror = () => setErr("That file could not be read.");
    r.readAsDataURL(f);
  }
  async function save() {
    const patch: Record<string, string> = {};
    if (img) patch.logo = img;
    if (name.trim() && name.trim() !== p.name) patch.name = name.trim();
    if (!Object.keys(patch).length) return p.onClose();
    if (p.preview) return (p.say("Preview: not saved."), p.onClose());
    setBusy(true);
    const r = await api("/api/onpoint/branding", { method: "PATCH", body: JSON.stringify(patch) });
    setBusy(false);
    if (!r.ok) return setErr(String(r.j.error ?? "Not saved."));
    p.say("Brand identity saved");
    await p.reload();
    p.onClose();
  }
  async function reset() {
    if (p.preview) return (p.say("Preview: not saved."), p.onClose());
    setBusy(true);
    const r = await api("/api/onpoint/branding", { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setErr(String(r.j.error ?? "Not reset."));
    p.say("Back to the default logo and name");
    await p.reload();
    p.onClose();
  }
  return (
    <>
      <button className="ev-scrim top" aria-label="Close" onClick={p.onClose} />
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="op-bi" aria-describedby="op-bid" className="ev-pay op-modal">
        <h2 id="op-bi">Brand identity</h2>
        <p id="op-bid">Swap the logo and company name shown in the sidebar.</p>
        <div className="op-logoprev">
          {/* eslint-disable-next-line @next/next/no-img-element -- the chosen file, shown before saving */}
          <img src={img ?? p.current} alt="Logo preview" />
        </div>
        <div
          className={`op-drop small ${drag ? "on" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files[0]);
          }}
        >
          <b>Drop a logo here, or click to choose</b>
          <span>PNG or JPG, up to 500 KB. A square image works best.</span>
          <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => pick(e.currentTarget.files?.[0] ?? undefined)} />
        </div>
        <label className="op-lab" htmlFor="op-coname">
          Company name
        </label>
        <input id="op-coname" className="op-in" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        {err && <p className="op-late">{err}</p>}
        <div className="ev-payb">
          <button className="ev-link" disabled={busy} onClick={() => void reset()}>
            Reset to default
          </button>
          <span style={{ flex: 1 }} />
          <button className="ev-btn" disabled={busy} onClick={p.onClose}>
            Cancel
          </button>
          <button className="ev-btn gold" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Export (0269) ─────────────────────────────────────────────────────── */

/** the deadlines on screen as a CSV for Excel; a cell starting with = + - @ is quoted so Excel never runs it */
function downloadCsv(rows: Deadline[], byId: Map<string, Client>, name: string) {
  const cell = (v: unknown) => {
    let x = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(x)) x = `'${x}`;
    return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  };
  const head = ["Client", "UEN", "Deadline", "Due date", "Status", "Done on", "Contact", "Email", "Source"];
  const body = rows.map((d) => {
    const c = byId.get(d.client_id);
    return [c?.name, c?.uen, d.label || TYPE_PICK[d.type], d.due_date, d.status === "active" ? "open" : d.status.replace("_", " "), d.done_on, c?.contact_name, c?.contact_email, d.source];
  });
  const csv = "﻿" + [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CAL_TAG: Record<ReminderType, string> = { AR: "AR", ECI: "ECI", AGM: "AGM", FS: "FS", CORP_SEC_EXPIRY: "Corp-sec", RECURRING_JOB: "Jobs" };

/* ── Billing & plan (0269) ─────────────────────────────────────────────── */

interface BillingData {
  configured: boolean;
  mode: "test" | "live" | "unset";
  open: boolean;
  plan: typeof PLAN_FALLBACK;
  ready: { monthly: boolean; setup: boolean; coupon: boolean; tax: boolean };
  price: { name: string; amount: number; currency: string; interval: string; tax: boolean } | null;
  sub: { status: string; cancel_at_period_end: boolean; renews_on: string | null; started_on: string; amount: number | null; currency: string; email: string | null } | null;
  card: { brand: string; last4: string; exp: string } | null;
  invoices: Array<{ id: string; number: string | null; date: string; amount: number; currency: string; status: string; url: string | null; pdf: string | null }>;
  linked?: boolean;
}

const STATUS: Record<string, [string, string]> = {
  active: ["Active", "ok"],
  trialing: ["Trial", "ok"],
  past_due: ["Payment failed: update the card", "bad"],
  unpaid: ["Unpaid", "bad"],
  incomplete: ["Waiting for payment", "warn"],
  canceled: ["Ended", "off"],
  paused: ["Paused", "off"],
};
/* 0281: the fee proposal (shown even before Stripe is set up; the server sends the same) */
const PLAN_FALLBACK = { setup: 28_000, setup_was: 108_800, intro: 8_000, intro_months: 3, monthly: 18_000, currency: "sgd" };
/* the preview: opening soon, nothing paid (sample only) */
const SAMPLE_BILLING: BillingData = {
  configured: true,
  mode: "test",
  open: false,
  plan: PLAN_FALLBACK,
  ready: { monthly: true, setup: true, coupon: true, tax: false },
  price: { name: "OnPoint Workflows", amount: 18000, currency: "sgd", interval: "month", tax: false },
  sub: null,
  card: null,
  invoices: [],
};

function Billing(p: { preview: boolean; founder: boolean; enquired?: string | null; say: (t: string) => void; back: { sessionId: string | null; cancelled: boolean } | null; clients: number }) {
  const [b, setB] = useState<BillingData | null>(p.preview ? SAMPLE_BILLING : null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);
  const { preview, say, back } = p;
  useEffect(() => {
    if (preview) return;
    let gone = false;
    const q = back?.sessionId && tick === 0 ? `?session_id=${encodeURIComponent(back.sessionId)}` : "";
    void api(`/api/onpoint/billing${q}`).then((r) => {
      if (gone) return;
      if (!r.ok) return setErr(String(r.j.error ?? "Could not load billing."));
      const data = r.j as unknown as BillingData;
      setB(data);
      if (data.linked) say("Card payment set up. Thank you!");
    });
    return () => {
      gone = true;
    };
  }, [preview, say, back, tick]);
  async function open(action: "checkout" | "portal", copy = false) {
    if (preview) return say("Preview: Stripe is not opened.");
    setBusy(action + (copy ? "-copy" : ""));
    const r = await api("/api/onpoint/billing", { method: "POST", body: JSON.stringify({ action }) });
    setBusy("");
    if (!r.ok || !r.j.url) return say(String(r.j.error ?? "Stripe could not be opened."));
    const url = String(r.j.url);
    if (copy) {
      await navigator.clipboard.writeText(url).then(
        () => say("Payment link copied. It works for 24 hours."),
        () => say("Could not copy: open it instead."),
      );
      return;
    }
    window.location.href = url;
  }
  /* Founders Doc only: make the prices in Stripe, open or close card payment */
  async function admin(action: "setup" | "open", on?: boolean) {
    if (preview) {
      if (action === "open" && b) setB({ ...b, open: !!on });
      return say("Preview: not saved.");
    }
    setBusy(action);
    const r = await api("/api/onpoint/billing", { method: "POST", body: JSON.stringify({ action, on }) });
    setBusy("");
    if (!r.ok) return say(String(r.j.error ?? "Not done."));
    const made = (r.j.made as string[] | undefined) ?? [];
    say(action === "setup" ? (made.length ? `Created in Stripe: ${made.join(", ")}` : "Everything was already in Stripe") : on ? "Billing is open: OnPoint can now pay by card" : "Billing closed: opening soon");
    setTick((t) => t + 1);
  }
  const st = b?.sub ? (STATUS[b.sub.status] ?? [b.sub.status, "off"]) : null;
  const plan = b?.plan ?? PLAN_FALLBACK;
  const canPay = !!b?.configured && !!b.ready.monthly && (b.open || p.founder);
  return (
    <>
      <PageHead icon="card" eyebrow="Account" title="Billing & plan">
        Your plan, as in the fee proposal: a one-off setup, then a monthly subscription paid by card.
      </PageHead>
      {back?.cancelled && <div className="op-warn">Payment not completed. Nothing was charged.</div>}
      {b && !b.open && !b.sub && (
        <div className="op-soonbar" role="note">
          <span className="op-soontag">Opening soon</span>
          <span>
            <b>Card payment opens soon.</b> Setting up and testing are part of your setup, so everything is free to use until then. Your plan starts when you go live.
          </span>
        </div>
      )}
      {b?.mode === "test" && p.founder && <div className="op-warn">Founders Doc: Stripe is on its practice keys, so no real card is charged here.</div>}
      {err && <div className="op-warn">{err}</div>}
      {!b && !err && <div className="ev-card op-pad ev-sub">Loading…</div>}
      {b && (
        <>
          <div className="op-grid2">
            <section className="ev-card op-pad op-plan">
              <div className="op-planh">
                <div>
                  <span className="op-lab">Your plan</span>
                  <b className="op-planname">{b.price?.name ?? "OnPoint Workflows"}</b>
                  {st ? <span className={`op-pill ${st[1]}`}>{b.sub?.cancel_at_period_end ? "Ends at period end" : st[0]}</span> : <span className={`op-pill ${b.open ? "warn" : "off"}`}>{b.open ? "Not paid yet" : "Opening soon · free for now"}</span>}
                </div>
              </div>
              <ul className="op-fees">
                <li>
                  <span>
                    <b>Setup</b>
                    <i>One-off · configuration, branding, migration and onboarding</i>
                  </span>
                  <span className="op-fee">
                    <s>{money(plan.setup_was, plan.currency)}</s> {money(plan.setup, plan.currency)}
                  </span>
                </li>
                <li>
                  <span>
                    <b>First {plan.intro_months} months</b>
                    <i>Early-adopter price</i>
                  </span>
                  <span className="op-fee">
                    {money(plan.intro, plan.currency)}
                    <em>/month</em>
                  </span>
                </li>
                <li>
                  <span>
                    <b>After that</b>
                    <i>Unlimited users, hosting, updates, support and maintenance</i>
                  </span>
                  <span className="op-fee">
                    {money(plan.monthly, plan.currency)}
                    <em>/month</em>
                  </span>
                </li>
              </ul>
              <p className="ev-sub op-small">Prices in Singapore dollars. Billed by card through Stripe when you go live: the first payment covers the setup and the first month. Signing in, your dashboard and this page always stay open; without an active plan, only the sending to clients pauses.</p>
              {b.sub ? (
                <div className="op-meta">
                  <div>
                    Renews on<b>{b.sub.renews_on ? fmtDate(b.sub.renews_on) : "–"}</b>
                  </div>
                  <div>
                    Since<b>{fmtDate(b.sub.started_on)}</b>
                  </div>
                  <div>
                    Receipts to<b>{b.sub.email ?? "–"}</b>
                  </div>
                  <div>
                    Clients tracked<b>{p.clients}</b>
                  </div>
                  <div>
                    Reminder sends<b>Unlimited</b>
                  </div>
                </div>
              ) : (
                <div className="op-chiprow">
                  <button className="ev-btn gold" disabled={!canPay || !!busy} onClick={() => void open("checkout")}>
                    <Ic n="card" s={15} />
                    {!b.open && !p.founder ? "Opening soon" : busy === "checkout" ? "Opening…" : "Set up card payment"}
                  </button>
                  {canPay && (
                    <button className="ev-btn" disabled={!!busy} onClick={() => void open("checkout", true)}>
                      {busy === "checkout-copy" ? "Copying…" : "Copy payment link"}
                    </button>
                  )}
                  {p.founder && !b.open && b.ready.monthly && <span className="ev-sub op-small">Founders Doc can test this before it opens.</span>}
                </div>
              )}
            </section>
            <section className="ev-card op-pad">
              <h2 className="op-h2">Payment method</h2>
              {b.card ? (
                <div className="op-cardrow">
                  <span className="op-brand2">{b.card.brand.toUpperCase()}</span>
                  <div>
                    <b>•••• {b.card.last4}</b>
                    <span className="ev-sub">Expires {b.card.exp}</span>
                  </div>
                </div>
              ) : (
                <p className="ev-sub">No card on file yet.</p>
              )}
              {b.sub && (
                <button className="ev-btn" disabled={!!busy} onClick={() => void open("portal")}>
                  {busy === "portal" ? "Opening…" : "Update card, email or address"}
                </button>
              )}
              <p className="ev-sub">🔒 The card is entered on Stripe&rsquo;s secure page. Card numbers never reach this system or your Excel sheets.</p>
            </section>
          </div>
          <AddonCard enquired={p.enquired ?? null} preview={preview} say={say} />
          {p.founder && (
            <section className="ev-card op-pad op-founder">
              <h2 className="op-h2">
                Founders Doc only <span className="ev-sub">· OnPoint does not see this</span>
              </h2>
              <ul className="op-checks">
                <li className={b.configured ? "c-ok" : "c-no"}>Stripe connected{b.configured ? ` (${b.mode} mode)` : ": set STRIPE keys on Vercel"}</li>
                <li className={b.ready.monthly ? "c-ok" : "c-no"}>Monthly price S$180 (lookup key onpoint_monthly)</li>
                <li className={b.ready.setup ? "c-ok" : "c-no"}>One-off setup S$280 (lookup key onpoint_setup)</li>
                <li className={b.ready.coupon ? "c-ok" : "c-no"}>First 3 months at S$80 (coupon onpoint_intro, S$100 off)</li>
                <li className={b.open ? "c-ok" : "c-opt"}>{b.open ? "Billing open: OnPoint can pay" : "Opening soon: OnPoint sees the plan and uses everything free"}</li>
              </ul>
              <div className="op-chiprow">
                <button className="ev-btn" disabled={!b.configured || !!busy || (b.ready.monthly && b.ready.setup && b.ready.coupon)} onClick={() => void admin("setup")}>
                  {busy === "setup" ? "Creating…" : b.ready.monthly && b.ready.setup && b.ready.coupon ? "Prices are in Stripe" : "Create prices in Stripe"}
                </button>
                <button className={`ev-btn ${b.open ? "" : "gold"}`} disabled={!!busy || (!b.open && !b.ready.monthly)} onClick={() => window.confirm(b.open ? "Close card payment again (opening soon)?" : "Open card payment? OnPoint's administrators can then pay by card.") && void admin("open", !b.open)}>
                  {busy === "open" ? "Saving…" : b.open ? "Close billing (opening soon)" : "Open billing"}
                </button>
              </div>
            </section>
          )}
          <section className="ev-card op-pad">
            <h2 className="op-h2">Invoices</h2>
            {b.invoices.length === 0 ? (
              <p className="ev-sub">No invoices yet.</p>
            ) : (
              <div className="ev-tablewrap">
                <table className="ev-table op-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th className="op-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {b.invoices.map((i) => (
                      <tr key={i.id}>
                        <td>{fmtDate(i.date)}</td>
                        <td>{i.number ?? "–"}</td>
                        <td>{money(i.amount, i.currency)}</td>
                        <td>
                          <span className={`op-pill ${i.status === "paid" ? "ok" : i.status === "open" ? "warn" : "off"}`}>{i.status === "paid" ? "Paid" : i.status === "open" ? "Due" : i.status}</span>
                        </td>
                        <td className="op-right">
                          <span className="op-acts">
                            {i.url && (
                              <a className="ev-link" href={i.url} target="_blank" rel="noopener noreferrer">
                                View
                              </a>
                            )}
                            {i.pdf && (
                              <a className="ev-link" href={i.pdf} target="_blank" rel="noopener noreferrer">
                                PDF
                              </a>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="ev-sub">Figures are in Singapore dollars.</p>
          </section>
          {/* mock-up: Manage subscription · Request scope change · Cancel */}
          <section className="ev-card op-pad">
            <h2 className="op-h2">Your subscription</h2>
            <div className="op-chiprow">
              <button className="ev-btn gold" disabled={!b.sub || !!busy} onClick={() => void open("portal")} title={b.sub ? "" : "After the first payment"}>
                {busy === "portal" ? "Opening…" : "Manage subscription"}
              </button>
              <ScopeChange preview={preview} say={say} />
              <button className="ev-btn" disabled={!b.sub || !!busy} onClick={() => window.confirm("Cancel your subscription? Reminders stop sending at the end of the current period. You confirm it on Stripe's page.") && void open("portal")}>
                Cancel
              </button>
            </div>
            <p className="ev-sub op-small">{b.sub ? "Manage and Cancel open Stripe's secure billing page." : "Manage and Cancel work once card payment is set up."}</p>
          </section>
        </>
      )}
    </>
  );
}

/* ── Sending mailbox (0270): the client connects their own Microsoft 365 email ─ */

interface MailboxData {
  configured: boolean;
  connected: boolean;
  address: string | null;
  name: string | null;
  connected_at: string | null;
  error: string | null;
}

function MailboxCard(p: { preview: boolean; say: (t: string) => void; reload: () => Promise<void>; defaultEmail: string; founder: boolean; myEmail: string }) {
  const { preview, say } = p;
  const [mb, setMb] = useState<MailboxData | null>(preview ? { configured: true, connected: false, address: null, name: null, connected_at: null, error: null } : null);
  const [email, setEmail] = useState(p.defaultEmail);
  const [link, setLink] = useState<{ url: string; expires: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);
  const load = () => setTick((n) => n + 1);
  useEffect(() => {
    if (preview) return;
    let gone = false;
    void api("/api/onpoint/mail").then((r) => {
      if (!gone && r.ok) setMb(r.j as unknown as MailboxData);
    });
    return () => {
      gone = true;
    };
  }, [preview, tick]);
  async function makeLink() {
    if (preview) return say("Preview: no link is made.");
    setBusy("link");
    const r = await api("/api/onpoint/mail", { method: "POST", body: JSON.stringify({ action: "link", email }) });
    setBusy("");
    if (!r.ok) return say(String(r.j.error ?? "No link made."));
    setLink(r.j as unknown as { url: string; expires: string });
    await navigator.clipboard.writeText(String(r.j.url)).then(
      () => say("Connect link copied: send it to the client."),
      () => say("Link ready: copy it below."),
    );
  }
  /* 0278: an OnPoint administrator connects their own email straight away: Microsoft's page opens here */
  async function connectMe() {
    if (preview) return say("Preview: Microsoft is not opened.");
    setBusy("me");
    const r = await api("/api/onpoint/mail", { method: "POST", body: JSON.stringify({ action: "link" }) });
    setBusy("");
    if (!r.ok || !r.j.url) return say(String(r.j.error ?? "Could not start the connection."));
    window.location.href = String(r.j.url);
  }
  async function unlink() {
    if (preview || !window.confirm("Disconnect this mailbox? Reminders will stop until it is connected again.")) return;
    setBusy("off");
    const r = await api("/api/onpoint/mail", { method: "POST", body: JSON.stringify({ action: "disconnect" }) });
    setBusy("");
    say(r.ok ? "Mailbox disconnected" : String(r.j.error ?? "Not changed."));
    load();
    await p.reload();
  }
  return (
    <section className="ev-card op-pad">
      <h2 className="op-h2">{p.founder ? "Sending mailbox · Founders Doc" : "Your sending email"}</h2>
      {!mb ? (
        <p className="ev-sub">Loading…</p>
      ) : !mb.configured ? (
        <p className="ev-sub">{p.founder ? "Microsoft sending is not set up on the server yet (ONPOINT_MS_CLIENT_ID, ONPOINT_MS_CLIENT_SECRET, ONPOINT_TOKEN_KEY). Until then reminders go through the Zapier hook." : "Connecting your email is not switched on yet. Founders Doc will let you know when it is ready."}</p>
      ) : mb.connected ? (
        <>
          <p>
            <span className="op-pill ok">Connected</span> Reminders are sent from <b>{mb.address}</b>
            {mb.name ? ` (${mb.name})` : ""}
            {mb.connected_at ? `, since ${fmtDate(mb.connected_at.slice(0, 10))}` : ""}.
          </p>
          {mb.error && <p className="op-late">{mb.error}</p>}
          <div className="op-chiprow">
            <button className="ev-btn" disabled={!!busy} onClick={() => void unlink()}>
              Disconnect
            </button>
          </div>
        </>
      ) : !p.founder ? (
        <>
          <p className="ev-sub">
            Send reminders from your own email, <b>{p.myEmail}</b>. You sign in to Microsoft with your own password and click Accept; reminders then go out from your address and show in your Sent items. Work (Microsoft 365) accounts only. The app can send emails but cannot read your inbox.
          </p>
          {mb.error && <p className="op-late">{mb.error}</p>}
          <div className="op-chiprow">
            <button className="ev-btn gold" disabled={!!busy} onClick={() => void connectMe()}>
              <Ic n="mail" s={14} />
              {busy === "me" ? "Opening Microsoft…" : "Connect my email"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="ev-sub">Send the client a link. They sign in to Microsoft with their own password and approve once; reminders then go out from their own email. Work (Microsoft 365) accounts only.</p>
          {mb.error && <p className="op-late">{mb.error}</p>}
          <div className="op-chiprow">
            <input className="op-in" type="email" value={email} placeholder="name@company.com" onChange={(e) => setEmail(e.target.value)} />
            <button className="ev-btn gold" disabled={!email.trim() || !!busy} onClick={() => void makeLink()}>
              {busy === "link" ? "Making…" : "Create connect link"}
            </button>
          </div>
        </>
      )}
      {link && (
        <div className="op-field">
          <span className="op-lab">Connect link (copied · valid until {fmtDate(link.expires.slice(0, 10))})</span>
          <input className="op-in sm" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </section>
  );
}


/** mock-up: "Request scope change": a short note to Founders Doc */
function ScopeChange({ preview, say }: { preview: boolean; say: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!note.trim()) return say("Say what you would like to change.");
    if (preview) return (setOpen(false), say("Request sent (preview only)"));
    setBusy(true);
    const r = await api("/api/onpoint/billing", { method: "POST", body: JSON.stringify({ action: "scope", note: note.trim() }) });
    setBusy(false);
    if (!r.ok) return say(String(r.j.error ?? "Not sent."));
    setOpen(false);
    setNote("");
    say("Scope change request sent: Founders Doc will be in touch");
  }
  if (!open)
    return (
      <button className="ev-btn" onClick={() => setOpen(true)}>
        Request scope change
      </button>
    );
  return (
    <span className="op-quick">
      <input className="op-in sm" autoFocus value={note} maxLength={280} placeholder="What would you like to change?" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} />
      <button className="ev-btn sm gold" disabled={busy} onClick={() => void send()}>
        {busy ? "Sending…" : "Send"}
      </button>
      <button className="ev-link" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}
function UndoImport(p: { imp: { id?: number; file_name: string }; preview: boolean; say: (t: string) => void; reload: () => Promise<void>; setS: (fn: (s: Snapshot) => Snapshot) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  async function undo() {
    if (!p.imp.id) return;
    if (!window.confirm(`Remove the import of ${p.imp.file_name}? The deadlines it added are removed. Clients and their emails stay.`)) return;
    if (p.preview) {
      p.setS((x) => ({ ...x, imports: x.imports.map((i) => (i.id === p.imp.id ? { ...i, undone_at: new Date().toISOString() } : i)) }));
      return p.say("Removed (preview only)");
    }
    setBusy(true);
    const r = await api(`/api/onpoint/import?id=${p.imp.id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return p.say(String(r.j.error ?? "Not undone."));
    const j = r.j as { deadlines: number };
    p.say(`Import removed: ${j.deadlines ?? 0} deadline${j.deadlines === 1 ? "" : "s"} taken off`);
    await p.reload();
  }
  return (
    <button className="ev-link op-undo" disabled={busy || !p.imp.id} onClick={() => void undo()}>
      {busy ? "Removing…" : (p.label ?? "Remove")}
    </button>
  );
}


/** 0284: where it matters (sending), say plainly where the emails go for now */
function SafetyNote({ inbox }: { inbox: string }) {
  return (
    <div className="op-safety" role="note">
      <Ic n="mail" s={14} />
      <span>
        For now, every email is sent to <b>{inbox}</b> for a safety check, not to your client. Founders Doc switches it to your clients with you.
      </span>
    </div>
  );
}

/* ── Document drafting add-on (0285): from the fee proposal, quoted on request ── */

function AddonCard(p: { enquired: string | null; preview: boolean; say: (t: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(p.enquired);
  const [note, setNote] = useState("");
  async function enquire() {
    if (p.preview) {
      setDone(new Date().toISOString());
      return p.say("Enquiry sent (preview only)");
    }
    setBusy(true);
    const r = await api("/api/onpoint/billing", { method: "POST", body: JSON.stringify({ action: "enquire", note }) });
    setBusy(false);
    if (!r.ok) return p.say(String(r.j.error ?? "Not sent."));
    setDone(String(r.j.at ?? new Date().toISOString()));
    p.say("Enquiry sent: Founders Doc will be in touch");
  }
  return (
    <section className="ev-card op-pad op-addon">
      <div className="op-addonh">
        <span className="op-addonicon" aria-hidden="true">📝</span>
        <div>
          <h2 className="op-h2">
            Document drafting &amp; review <span className="op-soontag muted">Optional add-on</span>
          </h2>
          <p className="ev-sub op-small">Generate filing documents in OnPoint&rsquo;s house style, or review uploaded documents for issues. Quoted on request.</p>
        </div>
      </div>
      {done ? (
        <p className="op-addondone">
          <Ic n="check" s={13} w={2.4} /> Enquiry sent on {fmtDate(done.slice(0, 10))}. Founders Doc will be in touch.
        </p>
      ) : (
        <div className="op-chiprow">
          <input className="op-in" value={note} maxLength={300} placeholder="What would you like help with? (optional)" onChange={(e) => setNote(e.target.value)} />
          <button className="ev-btn gold" disabled={busy} onClick={() => void enquire()}>
            {busy ? "Sending…" : "Enquire about add-on"}
          </button>
        </div>
      )}
    </section>
  );
}

/* ── Deadline tracking first (0290) ─────────────────────────────────────── */

/** Automatic filing reminders on/off (OnPoint's administrators), on the Reminder emails page */
function AutoFiling(p: { s: Snapshot; setS: (fn: (s: Snapshot) => Snapshot) => void; preview: boolean; say: (t: string) => void; reload: () => Promise<void> }) {
  const { s } = p;
  const on = s.ws.auto_send;
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (!window.confirm(on ? "Turn automatic reminders off?" : `Turn automatic reminders on? Every morning at 8am, each deadline gets its reminder on the days set for its type${s.ws.test_inbox ? ` (for now to ${s.ws.test_inbox}, for a safety check)` : ", sent to the client"}.`)) return;
    if (p.preview) {
      p.setS((x) => ({ ...x, ws: { ...x.ws, auto_send: !on } }));
      return p.say("Preview: not saved.");
    }
    setBusy(true);
    const r = await api("/api/onpoint/payments", { method: "POST", body: JSON.stringify({ action: "auto", on: !on }) });
    setBusy(false);
    if (!r.ok) return p.say(String(r.j.error ?? "Not saved."));
    p.say(on ? "Automatic reminders off" : "Automatic reminders on: the first ones go at 8am");
    await p.reload();
  }
  return (
    <section className="ev-card op-pad op-autofiling">
      <div>
        <h2 className="op-h2">
          Automatic reminders
          {s.me.role === "admin" ? (
            <button type="button" role="switch" aria-checked={on} className={`op-switch ${on ? "on" : ""}`} disabled={busy} onClick={() => void toggle()}>
              <i aria-hidden="true" />
              <span>{busy ? "Saving…" : on ? "On" : "Off"}</span>
            </button>
          ) : (
            <span className={`op-pill ${on ? "ok" : "off"}`}>{on ? "On" : "Off"}</span>
          )}
        </h2>
        <p className="ev-sub op-small">
          {on
            ? "Every morning at 8am (Singapore), each deadline gets its reminder on the days set under “Send automatically” for its type. Each one goes once; a deadline marked done stops."
            : "The system tracks every deadline from your sheets. Switch it on and each reminder goes by itself at 8am on the days set for its type. While it is off, use “Send this reminder now”."}
        </p>
      </div>
    </section>
  );
}

/** Send every reminder in a list of deadlines at once (the mock-up's "Send all"), after confirming the number */
function SendAllDeadlines(p: { ids: string[]; label: string; s: Snapshot; preview: boolean; say: (t: string) => void; reload: () => Promise<void>; wide?: boolean; text?: string }) {
  const [busy, setBusy] = useState(false);
  const ids = p.ids.slice(0, 50);
  async function go() {
    const where = p.s.ws.test_inbox ? `\n\nFor now they go to ${p.s.ws.test_inbox} for a safety check.` : "\n\nThey go to each client's email.";
    if (!window.confirm(`Send ${ids.length} reminder${ids.length === 1 ? "" : "s"} ${p.label} now?${where}`)) return;
    if (p.preview) return p.say("Preview: nothing is sent.");
    setBusy(true);
    const r = await api("/api/onpoint/send", { method: "POST", body: JSON.stringify({ deadline_ids: ids, confirm_count: ids.length, request_id: crypto.randomUUID() }) });
    setBusy(false);
    const res = (r.j.results as Array<{ status: string }>) ?? [];
    if (!res.length) return p.say(String(r.j.error ?? "Not sent."));
    const sent = res.filter((x) => x.status === "sent").length;
    p.say(`${sent} of ${res.length} sent${sent < res.length ? ": the others were skipped (already sent, or no email)" : ""}.`);
    await p.reload();
  }
  return (
    <button className={`ev-btn gold ${p.wide ? "op-wide" : "sm"}`} disabled={busy || !ids.length} onClick={() => void go()}>
      <Ic n="send" s={13} />
      {busy ? "Sending…" : (p.text ?? `Send all ${ids.length} reminder${ids.length === 1 ? "" : "s"}`)}
    </button>
  );
}

/** Payment reminders (invoices): optional, hidden unless switched on (OnPoint's system is deadline tracking) */
/* ── Feedback, page by page, for the first 3 months (0291) ──────────────── */


/** Founders Doc only: every new comment, from any page */
function FeedbackInbox(p: { s: Snapshot; setS: (fn: (s: Snapshot) => Snapshot) => void; preview: boolean; say: (t: string) => void; reload: () => Promise<void> }) {
  const open = (p.s.feedback ?? []).filter((f) => f.status === "new");
  async function done(f: Feedback) {
    if (p.preview) return p.setS((x) => ({ ...x, feedback: (x.feedback ?? []).map((k) => (k.id === f.id ? { ...k, status: "done" } : k)) }));
    const r = await api("/api/onpoint/feedback", { method: "PATCH", body: JSON.stringify({ id: f.id, done: true }) });
    if (!r.ok) return p.say(String(r.j.error ?? "Not saved."));
    await p.reload();
  }
  return (
    <section className="ev-card op-pad op-founder">
      <h2 className="op-h2">
        Feedback from OnPoint <span className="ev-sub">· {open.length} new · Founders Doc only</span>
      </h2>
      <ul className="op-fblist">
        {open.slice(0, 20).map((f) => (
          <li key={f.id}>
            <span className="op-fbmsg">
              <b>{f.page}</b> · {KINDS.find((k) => k[0] === f.kind)?.[2] ?? "Comment"}: {f.message}
              {f.shot ? (
                <>
                  {" "}
                  <a className="op-pdflink" href={`/api/onpoint/feedback?shot=${f.id}`} target="_blank" rel="noopener noreferrer">
                    Screenshot
                  </a>
                </>
              ) : null}
            </span>
            <span className="ev-sub op-small">
              {f.created_by ?? "—"} · {new Date(f.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            <button className="ev-link op-small" onClick={() => void done(f)}>
              Mark done
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Feedback panel (0292): Feedback → + New feedback → page, kind, comment, screenshot → Submit ── */

function FeedbackLauncher(p: { s: Snapshot; setS: (fn: (s: Snapshot) => Snapshot) => void; page: string; preview: boolean; say: (t: string) => void; reload: () => Promise<void> }) {
  const { s } = p;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "new">("list");
  const [tab, setTab] = useState<"page" | "all">("all");
  const [form, setForm] = useState({ page: p.page, kind: "" as "" | "change" | "add" | "fix" | "question", message: "" });
  const [shot, setShot] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  /* 0293: change or delete your own comment while it is not done */
  const [editing, setEditing] = useState<{ id: string; message: string; kind: Feedback["kind"] } | null>(null);
  const all = s.feedback ?? [];
  const mineCanChange = (f: Feedback) => f.status !== "done" && (s.me.founder || f.created_by === s.me.email);
  async function saveEdit() {
    if (!editing) return;
    const msg = editing.message.trim();
    if (!msg) return p.say("Write your comment first.");
    if (p.preview) {
      p.setS((x) => ({ ...x, feedback: (x.feedback ?? []).map((k) => (k.id === editing.id ? { ...k, message: msg, kind: editing.kind, edited_at: new Date().toISOString() } : k)) }));
      setEditing(null);
      return p.say("Changed (preview only)");
    }
    setBusy(true);
    const r = await api("/api/onpoint/feedback", { method: "PATCH", body: JSON.stringify({ id: editing.id, message: msg, kind: editing.kind }) });
    setBusy(false);
    if (!r.ok) return p.say(String(r.j.error ?? "Not saved."));
    setEditing(null);
    p.say("Comment changed");
    await p.reload();
  }
  async function remove(f: Feedback) {
    if (!window.confirm("Delete this comment? It can't be brought back.")) return;
    if (p.preview) {
      p.setS((x) => ({ ...x, feedback: (x.feedback ?? []).filter((k) => k.id !== f.id) }));
      return p.say("Deleted (preview only)");
    }
    const r = await api(`/api/onpoint/feedback?id=${f.id}`, { method: "DELETE" });
    if (!r.ok) return p.say(String(r.j.error ?? "Not deleted."));
    p.say("Comment deleted");
    await p.reload();
  }
  const list = (tab === "page" ? all.filter((f) => f.page === p.page) : all).slice(0, 40);
  const fresh = all.filter((f) => f.status === "new").length;
  const pages = [...new Set([...Object.values(PAGE_NAME), "Anything else"])];
  const start = () => {
    setForm({ page: p.page, kind: "", message: "" });
    setShot(null);
    setThanks(false);
    setMode("new");
  };
  function pickShot(f: File | null | undefined) {
    if (!f) return;
    if (!/^image\//.test(f.type)) return p.say("Choose an image (PNG or JPG).");
    if (f.size > 4 * 1024 * 1024) return p.say("The screenshot is larger than 4 MB.");
    setShot(f);
  }
  async function submit() {
    if (!form.kind) return p.say("Choose what kind of feedback it is.");
    if (!form.message.trim()) return p.say("Write your comment first.");
    if (p.preview) {
      p.setS((x) => ({ ...x, feedback: [{ id: `f${Date.now()}`, page: form.page, message: form.message.trim(), created_by: x.me.email, created_at: new Date().toISOString(), status: "new", kind: form.kind || "change", shot: !!shot }, ...(x.feedback ?? [])] }));
    } else {
      setBusy(true);
      const fd = new FormData();
      fd.append("page", form.page);
      fd.append("kind", form.kind);
      fd.append("message", form.message.trim());
      if (shot) fd.append("shot", shot);
      const r = await api("/api/onpoint/feedback", { method: "POST", body: fd });
      setBusy(false);
      if (!r.ok) return p.say(String(r.j.error ?? "Not sent."));
      await p.reload();
    }
    setThanks(true);
    setMode("list");
    setTab("all");
  }
  async function mark(f: Feedback) {
    if (p.preview) return p.setS((x) => ({ ...x, feedback: (x.feedback ?? []).map((k) => (k.id === f.id ? { ...k, status: k.status === "done" ? "new" : "done" } : k)) }));
    const r = await api("/api/onpoint/feedback", { method: "PATCH", body: JSON.stringify({ id: f.id, done: f.status !== "done" }) });
    if (!r.ok) return p.say(String(r.j.error ?? "Not saved."));
    await p.reload();
  }
  return (
    <>
      <button type="button" className="op-fbfab" onClick={() => (setOpen(true), setMode("list"), setThanks(false))} aria-haspopup="dialog">
        <span aria-hidden="true">💬</span> Feedback
        {s.me.founder && fresh > 0 ? <i>{fresh}</i> : null}
      </button>
      {open && (
        <>
          <button className="ev-scrim top" aria-label="Close feedback" onClick={() => setOpen(false)} />
          <aside className="op-fbpanel" role="dialog" aria-modal="true" aria-labelledby="op-fbt">
            <header className="op-fbph">
              <div>
                <h2 id="op-fbt">Your feedback</h2>
                <span className="op-soontag muted">Temporary · until {fmtDate(s.ws.feedback_until)}</span>
              </div>
              <button className="ev-link" aria-label="Close" onClick={() => setOpen(false)}>
                <Ic n="close" s={15} />
              </button>
            </header>
            {mode === "list" ? (
              <div className="op-fbbody">
                {thanks && (
                  <p className="op-fbthanks">
                    <Ic n="check" s={14} w={2.4} /> Thank you! We&rsquo;ve got it, and you&rsquo;ll see it marked done when it&rsquo;s sorted.
                  </p>
                )}
                <p className="ev-sub op-small">Tell us what to change, one point at a time, whenever you notice it. No call needed. You can edit or delete a comment until it is marked done.</p>
                <button className="ev-btn gold op-fbnew" onClick={start}>
                  <Ic n="plus" s={15} /> New feedback
                </button>
                <div className="ev-chips op-mt" role="group" aria-label="Show">
                  <button className={tab === "all" ? "on" : ""} aria-pressed={tab === "all"} onClick={() => setTab("all")}>
                    All <span>{all.length}</span>
                  </button>
                  <button className={tab === "page" ? "on" : ""} aria-pressed={tab === "page"} onClick={() => setTab("page")}>
                    This page <span>{all.filter((f) => f.page === p.page).length}</span>
                  </button>
                </div>
                {list.length === 0 ? (
                  <p className="ev-sub op-small op-mt">Nothing sent yet{tab === "page" ? " about this page" : ""}.</p>
                ) : (
                  <ul className="op-fbcards">
                    {list.map((f) => {
                      const k = KINDS.find((x) => x[0] === f.kind);
                      return (
                        <li key={f.id} className={f.status}>
                          <div className="op-fbmeta">
                            <span className="op-fbkind">{k ? `${k[1]} ${k[2]}` : "💬 Comment"}</span>
                            <span className="ev-sub op-small">{f.page}</span>
                            <span className={`op-pill ${f.status === "done" ? "ok" : "warn"}`}>{f.status === "done" ? "Done" : "Received"}</span>
                          </div>
                          {editing?.id === f.id ? (
                            <div className="op-fbedit">
                              <div className="op-fbkinds small" role="radiogroup" aria-label="Kind of feedback">
                                {KINDS.map(([v, icon, label]) => (
                                  <button key={v} type="button" role="radio" aria-checked={editing.kind === v} className={editing.kind === v ? "on" : ""} onClick={() => setEditing({ ...editing, kind: v })}>
                                    <span aria-hidden="true">{icon}</span> {label}
                                  </button>
                                ))}
                              </div>
                              <textarea className="op-in" rows={4} maxLength={4000} value={editing.message} onChange={(e) => setEditing({ ...editing, message: e.target.value })} />
                              <div className="op-chiprow">
                                <button className="ev-btn sm gold" disabled={busy || !editing.message.trim()} onClick={() => void saveEdit()}>
                                  {busy ? "Saving…" : "Save changes"}
                                </button>
                                <button className="ev-link op-small" onClick={() => setEditing(null)}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p>{f.message}</p>
                          )}
                          <div className="op-fbfoot">
                            <span className="ev-sub op-small">
                              {new Date(f.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              {f.edited_at ? " · edited" : ""}
                              {s.me.founder && f.created_by ? ` · ${f.created_by}` : ""}
                            </span>
                            {mineCanChange(f) && editing?.id !== f.id && (
                              <>
                                <button className="ev-link op-small" onClick={() => setEditing({ id: f.id, message: f.message, kind: f.kind ?? "change" })}>
                                  Edit
                                </button>
                                <button className="ev-link op-small" onClick={() => void remove(f)}>
                                  Delete
                                </button>
                              </>
                            )}
                            {f.shot ? (
                              <a className="ev-link op-small" href={`/api/onpoint/feedback?shot=${f.id}`} target="_blank" rel="noopener noreferrer">
                                Screenshot
                              </a>
                            ) : null}
                            {s.me.founder && (
                              <button className="ev-link op-small" onClick={() => void mark(f)}>
                                {f.status === "done" ? "Reopen" : "Mark done"}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <div className="op-fbbody">
                <div className="op-field">
                  <label className="op-lab op-step" htmlFor="op-fbpage">
                    <i>1</i>Which page is it about?
                  </label>
                  <label className="ev-select">
                    <span className="ev-sr">Page</span>
                    <select id="op-fbpage" value={form.page} onChange={(e) => setForm({ ...form, page: e.target.value })}>
                      {pages.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="op-field">
                  <span className="op-lab op-step">
                    <i>2</i>What kind of feedback?
                  </span>
                  <div className="op-fbkinds" role="radiogroup" aria-label="Kind of feedback">
                    {KINDS.map(([v, icon, label]) => (
                      <button key={v} type="button" role="radio" aria-checked={form.kind === v} className={form.kind === v ? "on" : ""} onClick={() => setForm({ ...form, kind: v })}>
                        <span aria-hidden="true">{icon}</span> {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="op-field">
                  <label className="op-lab op-step" htmlFor="op-fbmsg">
                    <i>3</i>Your comment
                  </label>
                  <textarea
                    id="op-fbmsg"
                    className="op-in"
                    rows={5}
                    maxLength={4000}
                    value={form.message}
                    placeholder="e.g. Please show the client’s UEN next to the name"
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    onPaste={(e) => pickShot([...e.clipboardData.files].find((f) => f.type.startsWith("image/")))}
                  />
                </div>
                <div className="op-field">
                  <span className="op-lab op-step">
                    <i>4</i>Screenshot <span className="ev-sub">(optional)</span>
                  </span>
                  {shot ? (
                    <div className="op-fbshot">
                      <Ic n="check" s={13} w={2.4} /> {shot.name || "Pasted image"}
                      <button className="ev-link op-small" onClick={() => setShot(null)}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label className="op-fbdrop">
                      <input type="file" accept="image/*" hidden onChange={(e) => pickShot(e.target.files?.[0])} />
                      Choose an image, or paste one into the comment box
                    </label>
                  )}
                </div>
                <div className="op-chiprow op-mt">
                  <button className="ev-btn gold" disabled={busy || !form.kind || !form.message.trim()} onClick={() => void submit()}>
                    {busy ? "Sending…" : "Submit feedback"}
                  </button>
                  <button className="ev-link" onClick={() => setMode("list")}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
