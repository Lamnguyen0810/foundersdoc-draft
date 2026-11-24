"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ic, type IconName } from "../esop/[slug]/icons";
import { countdown, daysBetween, fmtDate } from "@/lib/onpoint/dates";
import { emailHtml, render, TOKENS, unknownTokens } from "@/lib/onpoint/templates";
import { DEFAULT_PAY, money, PAY_TOKENS, paymentHtml, renderPayment, unknownPayTokens, type Invoice, type InvoiceStatus } from "@/lib/onpoint/payments";
import { OTHERS, TYPE_NAME, TYPE_PICK, TYPES, type Client, type Deadline, type Delivery, type ReminderType, type Template } from "@/lib/onpoint/types";

/**
 * OnPoint Workflows (0267): Dashboard, Deadlines, Reminder emails, Clients and Excel sources, in the look of
 * the ESOP dashboard. Everything shown comes from /api/onpoint/data; every change goes back through the API,
 * which checks it again. The preview here is rendered with the same code the server sends with.
 */

export interface Snapshot {
  me: { email: string; role: "admin" | "staff" | "viewer"; founder: boolean };
  ws: { id: string; slug: string; name: string; custom_name: string | null; logo: string | null; sender_name: string; sender_email: string | null; test_inbox: string | null; auto_send: boolean; filing_enabled: boolean; pay_subject: string | null; pay_body: string | null };
  clients: Client[];
  deadlines: Deadline[];
  deliveries: Delivery[];
  imports: Array<{ file_name: string; kind: string; summary: Record<string, unknown>; imported_by: string | null; imported_at: string }>;
  templates: Record<ReminderType, Template>;
  leads: Record<ReminderType, number[]>;
  /* 0280: payment reminders; payments_ready = supabase/139 has been run */
  invoices: Invoice[];
  payments_ready: boolean;
  today: string;
}

type View = "dashboard" | "payments" | "deadlines" | "calendar" | "reminders" | "clients" | "sources" | "billing";
const VIEWS: View[] = ["dashboard", "payments", "deadlines", "calendar", "reminders", "clients", "sources", "billing"];
const PAGE = 50;
const DEFAULT_LOGO = "/onpoint/logo.png";
/* 0276: one calm colour per filing type, used wherever a deadline is shown */
const TAG: Record<ReminderType, string> = { AR: "t-ar", ECI: "t-eci", AGM: "t-agm", FS: "t-fs", CORP_SEC_EXPIRY: "t-cs", RECURRING_JOB: "t-job" };
const tagClass = (type: ReminderType) => `op-tag ${TAG[type] ?? ""}`;
const shortType = (d: Pick<Deadline, "type" | "label">) => (d.type === "CORP_SEC_EXPIRY" || d.type === "RECURRING_JOB" ? d.label || TYPE_PICK[d.type] : d.type === "FS" ? "FS" : d.type);

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  /* 0275: an answer that is not ours (a timeout or a gateway page) still says what happened */
  if (!res.ok && !j.error) j.error = `The server answered ${res.status}${res.status === 504 ? ": it took too long. Try one file at a time." : res.status === 413 ? ": the file is too large." : "."}`;
  return { ok: res.ok, status: res.status, j };
}

export default function OnPointApp({ initial, preview = false }: { initial: Snapshot; preview?: boolean }) {
  const [s, setS] = useState(initial);
  const [view, setView] = useState<View>("dashboard");
  const [toast, setToast] = useState("");
  const [logoOpen, setLogoOpen] = useState(false);
  const [focus, setFocus] = useState<{ client: string; deadline: string } | null>(null);
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

  /* coming back from Stripe (?billing=done&session_id=…) or a link to a view (?view=billing) */
  const [stripeReturn, setStripeReturn] = useState<{ sessionId: string | null; cancelled: boolean } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("view") as View | null;
    const billing = q.get("billing");
    if (!billing && !(v && VIEWS.includes(v))) return;
    /* eslint-disable react-hooks/set-state-in-effect -- read once from the address bar after the first render */
    if (billing) {
      setView("billing");
      setStripeReturn({ sessionId: q.get("session_id"), cancelled: billing === "cancelled" });
    } else if (v) setView(v);
    /* eslint-enable react-hooks/set-state-in-effect */
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const [chip, setChip] = useState<DChip>("overdue");
  const [payAt, setPayAt] = useState<{ chip: PChip; id: string | null; n: number }>({ chip: "overdue", id: null, n: 0 });
  const filing = s.ws.filing_enabled;
  const payLate = s.invoices.filter((v) => v.status === "open" && v.due_date < s.today).length;
  const openPay = (c: PChip, id?: string) => (setPayAt((x) => ({ chip: c, id: id ?? null, n: x.n + 1 })), go("payments"));
  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openPreview = (d: Deadline) => {
    setFocus({ client: d.client_id, deadline: d.id });
    go("reminders");
  };

  const nav = (v: View, icon: IconName, label: string, badge?: number) => (
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
      {badge ? <span className="ev-badge">{badge}</span> : null}
    </a>
  );

  return (
    <div className="esop ev op" id="top">
      {preview && <div className="op-preview">Preview with sample companies · nothing is saved or sent</div>}
      {s.ws.test_inbox && (
        <div className="op-test" role="note">
          <b>Test mode.</b> Every reminder goes to {s.ws.test_inbox}, not to the client. {s.ws.auto_send ? "Automatic sending is on." : "Automatic sending is off."}
        </div>
      )}
      <div className="ev-body">
        <aside className="ev-side">
          <div className="op-brand">
            <button type="button" className={`op-logo ${isAdmin ? "edit" : ""}`} onClick={() => isAdmin && setLogoOpen(true)} disabled={!isAdmin} aria-label={isAdmin ? "Change company logo" : company}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a small logo (data URL or public/) */}
              <img src={s.ws.logo || DEFAULT_LOGO} alt={`${company} logo`} />
              {isAdmin && <span aria-hidden="true">Change</span>}
            </button>
            <div>
              <b>{company}</b>
              <span>Workflows · powered by FD AI</span>
            </div>
          </div>
          <nav aria-label="Main" className="ev-navs">
            <div className="ev-grp">
              <div className="ev-h">Overview</div>
              {nav("dashboard", "overview", "Dashboard")}
              {nav("payments", "card", "Payments", payLate)}
            </div>
            {/* 0280: filing reminders are optional (OnPoint sends payment reminders) */}
            {filing && (
              <div className="ev-grp">
                <div className="ev-h">Filing reminders</div>
                {nav("deadlines", "esop", "Deadlines", overdue.length)}
                {nav("calendar", "calendar", "Calendar")}
                {nav("reminders", "mail", "Reminder emails")}
              </div>
            )}
            <div className="ev-grp">
              <div className="ev-h">Records</div>
              {nav("clients", "folder", "Clients")}
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
              {s.ws.sender_email ? <span>{s.ws.sender_email}</span> : null}
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
          <div className="ev-wrap op-view" key={view}>
            {view === "dashboard" && !filing && <PayDashboard s={s} byId={byId} company={company} go={go} openPay={openPay} />}
            {view === "payments" && <Payments key={payAt.n} s={s} setS={setS} byId={byId} canEdit={canEdit} isAdmin={isAdmin} preview={preview} say={say} reload={reload} initialChip={payAt.chip} openId={payAt.id} />}
            {view === "dashboard" && filing && <Dashboard s={s} byId={byId} live={live} overdue={overdue} company={company} onPreview={openPreview} go={go} openDeadlines={(c) => (setChip(c), go("deadlines"))} />}
            {view === "deadlines" && <Deadlines s={s} byId={byId} canEdit={canEdit} preview={preview} say={say} reload={reload} onPreview={openPreview} initialChip={chip} />}
            {view === "calendar" && <Calendar s={s} byId={byId} onPreview={openPreview} />}
            {view === "billing" && isAdmin && <Billing preview={preview} say={say} back={stripeReturn} />}
            {view === "reminders" && <Reminders s={s} setS={setS} byId={byId} live={live} canEdit={canEdit} preview={preview} say={say} reload={reload} focus={focus} />}
            {view === "clients" && <Clients s={s} canEdit={canEdit} preview={preview} say={say} reload={reload} />}
            {view === "sources" && <Sources s={s} canEdit={canEdit} preview={preview} say={say} reload={reload} />}
          </div>
        </main>
      </div>
      {logoOpen && <LogoModal current={s.ws.logo || DEFAULT_LOGO} name={company} preview={preview} onClose={() => setLogoOpen(false)} say={say} reload={reload} />}
      <div className={`e-toast ${toast ? "on" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

/* ── Dashboard ─────────────────────────────────────────────────────────── */

/** 0277: the same calm heading on every page: an icon, a small gold line, the title and one sentence */
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

function Dashboard(p: { s: Snapshot; byId: Map<string, Client>; live: Deadline[]; overdue: Deadline[]; company: string; onPreview: (d: Deadline) => void; go: (v: View) => void; openDeadlines: (c: DChip) => void }) {
  const { s } = p;
  const fortnight = p.live.filter((d) => d.due_date >= s.today && daysBetween(s.today, d.due_date) <= 14);
  const month = s.today.slice(0, 7);
  const sent = s.deliveries.filter((d) => d.status === "sent" && d.requested_at.slice(0, 7) === month);
  const next = [...p.overdue.slice(-5).reverse(), ...p.live.filter((d) => d.due_date >= s.today).slice(0, 8)];
  const noEmail = s.clients.filter((c) => !c.contact_email && p.live.some((d) => d.client_id === c.id)).length;
  const sheets = new Set(s.imports.map((x) => x.kind)).size;
  return (
    <>
      <header className="op-hero">
        <p className="op-eyebrow">Overview · {longDate(s.today)}</p>
        <h1>Welcome back, {p.company.replace(/,?\s+(pte\.?\s*ltd\.?|private limited)$/i, "")}</h1>
        <p>
          Here is where your filings stand today, worked out from your <b>Master List</b>, <b>Job Schedule</b> and <b>Nominee Service</b> sheets. Reminders go to your clients on your behalf before each due date.
        </p>
      </header>
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
        <Stat icon="clipboard" tone="gold" label="Deadlines tracked" value={p.live.length} sub={<><i className="op-live" aria-hidden="true" /> Live · {sheets || 0} sheet{sheets === 1 ? "" : "s"} imported</>} onClick={() => p.openDeadlines("upcoming")} />
        <Stat icon="hourglass" tone="blue" label="Due this fortnight" value={fortnight.length} sub={fortnight[0] ? `Next due ${fmtDate(fortnight[0].due_date)}` : "Nothing due"} onClick={() => p.openDeadlines("30")} />
        <Stat icon="alert" tone="red" label="Overdue" value={p.overdue.length} sub={p.overdue.length ? "Requires attention" : "All on time"} warn={p.overdue.length > 0} onClick={() => p.openDeadlines("overdue")} />
        <Stat icon="sent" tone="green" label="Reminders sent" value={sent.length} sub="This month, on your behalf" onClick={() => p.go("reminders")} />
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
            <button key={d.id} className="op-row op-next" onClick={() => p.onPreview(d)}>
              <span className="op-name op-namechev">
                <span>{p.byId.get(d.client_id)?.name ?? "—"}</span>
                <Ic n="chev" s={11} />
              </span>
              <span className={tagClass(d.type)}>{shortType(d)}</span>
              <span className="op-date">{fmtDate(d.due_date)}</span>
              <span className={dueClass(d.due_date, s.today)}>{shortCount(d.due_date, s.today)}</span>
            </button>
          ))}
        </section>
        <section className="ev-card op-list">
          <div className="op-h">
            <h2>Reminder activity</h2>
          </div>
          {s.deliveries.length === 0 && <p className="ev-sub">No reminders sent yet. They appear here as they go out.</p>}
          {s.deliveries.slice(0, 10).map((x) => (
            <div key={x.id} className="op-act2">
              <span className={`op-acticon ${x.status}`} aria-hidden="true">
                <Ic n={x.status === "sent" ? "sent" : x.status === "failed" ? "bang" : "clock"} s={15} />
              </span>
              <div>
                <div>
                  {x.status === "sent" ? "Reminder sent" : x.status === "failed" ? "Not sent" : x.status === "queued" ? "Sending" : "Skipped"} to <b>{p.byId.get(x.client_id ?? "")?.name ?? "a client"}</b>: {TYPE_NAME[x.type as ReminderType] ?? x.type}
                  {x.test ? <span className="op-testtag">test</span> : null}
                </div>
                {x.error ? <div className="op-late op-small">{x.error}</div> : null}
                <div className="ev-sub op-small">{new Date(x.requested_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
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

/* ── Deadlines ─────────────────────────────────────────────────────────── */

type DChip = "overdue" | "30" | "upcoming" | "done" | "all";

function Deadlines(p: { s: Snapshot; byId: Map<string, Client>; canEdit: boolean; preview: boolean; say: (t: string) => void; reload: () => Promise<void>; onPreview: (d: Deadline) => void; initialChip?: DChip }) {
  const { s } = p;
  const [chip, setChip] = useState<DChip>(p.initialChip ?? "overdue");
  const [type, setType] = useState<"" | ReminderType>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState("");
  const test = (d: Deadline, c: DChip) =>
    c === "overdue" ? d.status === "active" && d.due_date < s.today : c === "30" ? d.status === "active" && d.due_date >= s.today && daysBetween(s.today, d.due_date) <= 30 : c === "upcoming" ? d.status === "active" && d.due_date >= s.today : c === "done" ? d.status !== "active" : true;
  const base = s.deadlines.filter((d) => (!type || d.type === type) && (!q.trim() || (p.byId.get(d.client_id)?.name ?? "").toLowerCase().includes(q.trim().toLowerCase())));
  const rows = base.filter((d) => test(d, chip)).sort((a, b) => (chip === "overdue" ? b.due_date.localeCompare(a.due_date) : a.due_date.localeCompare(b.due_date)));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const chips: Array<[DChip, string]> = [
    ["overdue", "Overdue"],
    ["30", "Next 30 days"],
    ["upcoming", "All upcoming"],
    ["done", "Done / not applicable"],
    ["all", "All"],
  ];
  async function mark(d: Deadline, status: string) {
    if (p.preview) return p.say("Preview: not saved.");
    setBusy(d.id);
    const r = await api("/api/onpoint/deadline", { method: "PATCH", body: JSON.stringify({ id: d.id, status }) });
    setBusy("");
    if (!r.ok) return p.say(String(r.j.error ?? "Not saved."));
    p.say(status === "completed" ? "Marked done" : status === "active" ? "Back to active" : "Marked not applicable");
    await p.reload();
  }
  return (
    <>
      <PageHead icon="esop" eyebrow="Overview" title="Deadlines">
        Every filing for every client, worked out from your sheets. Mark one done and its reminders stop.
      </PageHead>
      <section className="ev-card op-pad">
        <div className="op-tools">
          <label className="ev-search wide">
            <Ic n="search" />
            <span className="ev-sr">Search clients</span>
            <input value={q} placeholder="Search a client" onChange={(e) => (setQ(e.target.value), setPage(0))} />
          </label>
          <label className="ev-select">
            <span className="ev-sr">Type</span>
            <select value={type} onChange={(e) => (setType(e.target.value as ReminderType | ""), setPage(0))}>
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_PICK[t]}
                </option>
              ))}
            </select>
          </label>
          <button className="ev-btn op-push" onClick={() => downloadCsv(rows, p.byId, `OnPoint deadlines ${s.today}.csv`)} disabled={!rows.length}>
            <Ic n="download" s={14} />
            Export CSV
          </button>
        </div>
        <div className="ev-chips" role="group" aria-label="Filter">
          {chips.map(([k, label]) => (
            <button key={k} className={chip === k ? "on" : ""} aria-pressed={chip === k} onClick={() => (setChip(k), setPage(0))}>
              {label} <span>{base.filter((d) => test(d, k)).length}</span>
            </button>
          ))}
        </div>
        <div className="ev-tablewrap">
          <table className="ev-table op-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Deadline</th>
                <th>Due</th>
                <th>Reminder goes to</th>
                <th className="op-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="ev-empty">
                    <div className="op-emptystate">
                      <span aria-hidden="true">
                        <Ic n="check" s={22} />
                      </span>
                      <b>{chip === "overdue" ? "Nothing overdue" : "Nothing here"}</b>
                      <span className="ev-sub">{chip === "overdue" ? "Every deadline is on time." : "Try another filter or search."}</span>
                    </div>
                  </td>
                </tr>
              )}
              {shown.map((d) => {
                const c = p.byId.get(d.client_id);
                return (
                  <tr key={d.id}>
                    <td>
                      <b>{c?.name ?? "—"}</b>
                      <div className="ev-sub">{d.derived ? "Worked out from FYE" : "From the sheet"} · {d.source.split(" · ").pop()}</div>
                    </td>
                    <td>
                      <span className={tagClass(d.type)}>{shortType(d)}</span>
                    </td>
                    <td>
                      <div className="op-date2">{fmtDate(d.due_date)}</div>
                      {d.status === "active" ? (
                        <span className={dueClass(d.due_date, s.today)}>{countdown(d.due_date, s.today)}</span>
                      ) : (
                        <span className="op-due done">
                          <Ic n="check" s={11} w={2.4} />
                          {d.status === "completed" ? `Done${d.done_on ? ` ${fmtDate(d.done_on)}` : ""}` : d.status.replace("_", " ")}
                        </span>
                      )}
                    </td>
                    <td>
                      {c?.contact_email ? (
                        <span>{c.contact_email}</span>
                      ) : d.status === "active" && p.canEdit ? (
                        <button className="op-due late op-addmail" onClick={() => p.onPreview(d)} title="Add the email and send">
                          + Add email
                        </button>
                      ) : (
                        <span className="op-due late">No email</span>
                      )}
                    </td>
                    <td className="op-right">
                      <span className="op-acts">
                        {d.status === "active" && (
                          <button className="ev-btn sm" onClick={() => p.onPreview(d)}>
                            <Ic n="mail" s={13} />
                            Preview email
                          </button>
                        )}
                        {p.canEdit && d.status === "active" && (
                          <>
                            <button className="ev-btn sm op-done" disabled={busy === d.id} onClick={() => void mark(d, "completed")}>
                              <Ic n="check" s={12} w={2.2} />
                              Done
                            </button>
                            <button className="ev-link" disabled={busy === d.id} onClick={() => void mark(d, "not_applicable")}>
                              Not applicable
                            </button>
                          </>
                        )}
                        {p.canEdit && d.status !== "active" && (
                          <button className="ev-link" disabled={busy === d.id} onClick={() => void mark(d, "active")}>
                            Reopen
                          </button>
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
    if (!window.confirm(`Send the ${TYPE_PICK[type]} reminder for ${client.name} now?${s.ws.test_inbox ? `\n\nTest mode: it goes to ${s.ws.test_inbox}.` : `\n\nIt goes to ${client.contact_email}.`}`)) return;
    setBusy("send");
    const res = await api("/api/onpoint/send", { method: "POST", body: JSON.stringify({ deadline_id: picked.id, request_id: crypto.randomUUID() }) });
    setBusy("");
    p.say(String(res.j.message ?? res.j.error ?? (res.ok ? "Sent" : "Not sent")));
    await p.reload();
  }

  return (
    <>
      <PageHead icon="mail" eyebrow="Automation" title="Reminder emails">
        The emails your clients receive, sent on {s.ws.sender_name}&rsquo;s behalf. Each filing type has its own wording and timing.
      </PageHead>
      {missingClient && <div className="op-warn">That client or deadline is no longer there. Pick another below.</div>}
      <div className="op-grid2 wide">
        <section className="ev-card op-pad">
          <h2 className="op-h2">Template</h2>
          <div className="op-field">
            <span className="op-lab op-step"><i>1</i>Which deadline is this reminder for?</span>
            <div className="ev-chips" role="radiogroup" aria-label="Deadline type">
              {(["AR", "ECI"] as ReminderType[]).map((t) => (
                <button key={t} role="radio" aria-checked={type === t} className={type === t ? "on" : ""} onClick={() => pickType(t)}>
                  {TYPE_PICK[t]}
                </button>
              ))}
              <button role="radio" aria-checked={OTHERS.includes(type)} className={OTHERS.includes(type) ? "on" : ""} onClick={() => !OTHERS.includes(type) && pickType("AGM")}>
                Others
              </button>
            </div>
            {OTHERS.includes(type) && (
              <label className="ev-select op-mt">
                <span className="ev-sr">Which other deadline?</span>
                <select value={type} onChange={(e) => pickType(e.target.value as ReminderType)}>
                  {OTHERS.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_PICK[t]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="op-field">
            <span className="op-lab op-step"><i>2</i>Preview for client</span>
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
            <span className="op-lab op-step"><i>3</i>Send automatically</span>
            <div className="op-chiprow">
              {leads.length === 0 && <span className="ev-sub">No automatic reminders for this type.</span>}
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
              <div className="op-chiprow op-mt">
                {[30, 14, 7, 3, 1].map((n) => (
                  <button key={n} className="ev-btn sm" disabled={leads.includes(n)} onClick={() => addLead(n)}>
                    + {n}
                  </button>
                ))}
                <input className="op-num" inputMode="numeric" placeholder="days" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} />
                <button className="ev-btn sm" onClick={() => (addLead(Number(custom)), setCustom(""))} disabled={!custom}>
                  Add
                </button>
              </div>
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
              <div className="op-chiprow op-mt" aria-label="Insert a token">
                {TOKENS.map((t) => (
                  <button key={t} className="op-token" onClick={() => insert(t)}>
                    {t}
                  </button>
                ))}
              </div>
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
          {s.ws.test_inbox && <p className="ev-sub">Test mode: sending now goes to {s.ws.test_inbox}.</p>}
          {dirty && <p className="ev-sub">Save the template first: the email sent is always the saved version.</p>}
          {p.canEdit && (
            <button className="ev-btn gold op-mt" disabled={!canSend || busy === "send"} onClick={() => void send()}>
              <Ic n="mail" s={14} />
              {busy === "send" ? "Sending…" : "Send this reminder now"}
            </button>
          )}
          <h3 className="op-h3">Who this reaches</h3>
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
        </section>
      </div>
    </>
  );
}

/* ── Clients ───────────────────────────────────────────────────────────── */

function Clients(p: { s: Snapshot; canEdit: boolean; preview: boolean; say: (t: string) => void; reload: () => Promise<void> }) {
  const { s } = p;
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<Record<string, { contact_name: string; contact_email: string }>>({});
  const [busy, setBusy] = useState("");
  const count = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of s.deadlines) if (d.status === "active") m.set(d.client_id, (m.get(d.client_id) ?? 0) + 1);
    return m;
  }, [s.deadlines]);
  const rows = s.clients.filter((c) => (!onlyMissing || !c.contact_email) && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || (c.uen ?? "").toLowerCase().includes(q.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const missing = s.clients.filter((c) => !c.contact_email).length;
  async function save(c: Client) {
    const e = edit[c.id];
    if (!e) return;
    if (p.preview) return p.say("Preview: not saved.");
    setBusy(c.id);
    const r = await api("/api/onpoint/client", { method: "PATCH", body: JSON.stringify({ id: c.id, ...e }) });
    setBusy("");
    if (!r.ok) return p.say(String(r.j.error ?? "Not saved."));
    p.say(`${c.name} saved`);
    setEdit((x) => {
      const n = { ...x };
      delete n[c.id];
      return n;
    });
    await p.reload();
  }
  return (
    <>
      <PageHead icon="folder" eyebrow="Records" title="Clients">
        Who each reminder goes to. A reminder only goes to an email address saved here.
      </PageHead>
      <section className="ev-card op-pad">
        <div className="op-tools">
          <label className="ev-search wide">
            <Ic n="search" />
            <span className="ev-sr">Search</span>
            <input value={q} placeholder="Search a client or UEN" onChange={(e) => (setQ(e.target.value), setPage(0))} />
          </label>
          <div className="ev-chips">
            <button className={!onlyMissing ? "on" : ""} onClick={() => (setOnlyMissing(false), setPage(0))}>
              All <span>{s.clients.length}</span>
            </button>
            <button className={onlyMissing ? "on" : ""} onClick={() => (setOnlyMissing(true), setPage(0))}>
              No email <span>{missing}</span>
            </button>
          </div>
        </div>
        <p className="ev-sub">Your sheets have no email addresses, so add each client&rsquo;s here, or import a contacts sheet (company, contact name, email) on Excel sources. A reminder only goes to an address entered here.</p>
        <div className="ev-tablewrap">
          <table className="ev-table op-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Live deadlines</th>
                <th>Contact name</th>
                <th>Email</th>
                <th className="op-right" />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const e = edit[c.id] ?? { contact_name: c.contact_name ?? "", contact_email: c.contact_email ?? "" };
                const changed = !!edit[c.id];
                return (
                  <tr key={c.id}>
                    <td className={`op-clientcell ${changed ? "changed" : ""}`}>
                      <span className={`op-avatar ${c.contact_email ? "" : "none"}`} aria-hidden="true">
                        {initials(c.name)}
                      </span>
                      <div>
                      <b>{c.name}</b>
                      <div className="ev-sub">
                        {c.uen ? `UEN ${c.uen}` : "No UEN"}
                        {c.fye ? ` · FYE ${fmtDate(c.fye)}` : ""}
                        {c.services.length ? ` · ${c.services.map((x) => (x === "acc" ? "Accounts" : x === "fs_tax" ? "FS & tax" : "Corp-sec")).join(", ")}` : ""}
                      </div>
                      </div>
                    </td>
                    <td>
                      <span className={`op-count ${count.get(c.id) ? "" : "zero"}`}>{count.get(c.id) ?? 0}</span>
                    </td>
                    <td>
                      <input className="op-in sm" value={e.contact_name} disabled={!p.canEdit} placeholder="e.g. Alex Tan" onChange={(x) => setEdit((m) => ({ ...m, [c.id]: { ...e, contact_name: x.target.value } }))} />
                    </td>
                    <td>
                      <input className="op-in sm" type="email" value={e.contact_email} disabled={!p.canEdit} placeholder="name@company.com" onChange={(x) => setEdit((m) => ({ ...m, [c.id]: { ...e, contact_email: x.target.value } }))} />
                    </td>
                    <td className="op-right">
                      {changed && (
                        <button className="ev-btn sm gold" disabled={busy === c.id} onClick={() => void save(c)}>
                          {busy === c.id ? "Saving…" : "Save"}
                        </button>
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
    </>
  );
}

/* ── Excel sources ─────────────────────────────────────────────────────── */

function Sources(p: { s: Snapshot; canEdit: boolean; preview: boolean; say: (t: string) => void; reload: () => Promise<void> }) {
  const { s } = p;
  const [busy, setBusy] = useState("");
  const [drag, setDrag] = useState(false);
  const [last, setLast] = useState<Array<Record<string, unknown>> | null>(null);
  const [inbox, setInbox] = useState(s.ws.test_inbox ?? "");
  const [sender, setSender] = useState({ name: s.ws.sender_name, email: s.ws.sender_email ?? "" });
  const input = useRef<HTMLInputElement>(null);
  async function upload(list: FileList | File[]) {
    const files = [...list].filter((f) => /\.xlsx$/i.test(f.name));
    if (!files.length) return p.say("Choose .xlsx files (Excel workbooks).");
    if (p.preview) return p.say("Preview: files are not read here.");
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    setBusy("import");
    const r = await api("/api/onpoint/import", { method: "POST", body: fd });
    setBusy("");
    if (!r.ok) return p.say(String(r.j.error ?? "Not imported."));
    setLast(r.j.results as Array<Record<string, unknown>>);
    p.say("Imported");
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
  const RULES: Array<[string, string]> = [
    ["FYE (Master List)", "ECI due FYE + 3 months · FS and AGM FYE + 6 months · AR FYE + 7 months"],
    ["Date of FS / AGM Date / AR Date / ECI Date", "A date here marks that item done: no reminder"],
    ["“Managed by client”, “Exempted”, “Waiver”, “To strike off”", "Not applicable, waived or cancelled: no reminder"],
    ["Acc / FS-Tax / Sec ticks", "Only the services OnPoint does get reminders"],
    ["Date expire (Nominee Service)", "Corp-sec, nominee, address and QBO renewals"],
    ["Last Completed + Frequency, Last filed, Next Due (Job Schedule)", "Recurring accounts, payroll and GST jobs"],
    ["A sheet with Company + Email (+ Contact)", "Each client's reminder recipient"],
  ];
  return (
    <>
      <PageHead icon="upload" eyebrow="Records" title="Excel sources">
        The sheets this system reads. Upload them again any time; your files are never changed.
      </PageHead>
      {p.canEdit && (
        <section
          className={`ev-card op-drop ${drag ? "on" : ""}`}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void upload(e.dataTransfer.files);
          }}
        >
          <span className="op-dropicon" aria-hidden="true">
            <Ic n="upload" s={24} />
          </span>
          <b>Import Excel sheets</b>
          <span>Drop the Master List, Nominee Service, Job Schedule or a contacts sheet (.xlsx) here. Re-import any time: dates move with the sheet, nothing is entered twice.</span>
          <button className="ev-btn gold" disabled={busy === "import"} onClick={() => input.current?.click()}>
            <Ic n="upload" />
            {busy === "import" ? "Reading…" : "Choose files"}
          </button>
          <input ref={input} type="file" accept=".xlsx" multiple hidden onChange={(e) => (e.currentTarget.files && void upload(e.currentTarget.files), (e.currentTarget.value = ""))} />
        </section>
      )}
      {last && (
        <section className="ev-card op-pad">
          <h2 className="op-h2">Just imported</h2>
          {last.map((x, i) => (
            <div key={i} className="op-result">
              <span className="op-acticon sent" aria-hidden="true">
                <Ic n="check" s={15} w={2.2} />
              </span>
              <div>
                <b>{String(x.file)}</b> <span className="ev-sub">· {String((x.kinds as string[] | undefined)?.join(", ") || "not recognised")}</span>
                <div className="op-resultnums">
                  <span>
                    <b>{String(x.clients)}</b> clients
                  </span>
                  <span>
                    <b>{String(x.deadlines)}</b> deadlines
                  </span>
                  <span>
                    <b>{String(x.contacts)}</b> emails
                  </span>
                  {Number(x.superseded) ? (
                    <span>
                      <b>{String(x.superseded)}</b> older items replaced
                    </span>
                  ) : null}
                </div>
                {(x.skipped as string[] | undefined)?.length ? <div className="ev-sub op-small">Not read: {(x.skipped as string[]).join(", ")}</div> : null}
              </div>
            </div>
          ))}
        </section>
      )}
      <div className="op-grid2">
        <section className="ev-card op-pad">
          <h2 className="op-h2">How each column is read</h2>
          {RULES.map(([a, b]) => (
            <div key={a} className="op-rule">
              <b>{a}</b>
              <span>→ {b}</span>
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
              Test inbox (empty = live: reminders go to the clients)
            </label>
            <div className="op-chiprow">
              <input id="op-inbox" className="op-in" value={inbox} placeholder="administrator@foundersdoc.com" onChange={(e) => setInbox(e.target.value)} />
              <button
                className="ev-btn"
                disabled={busy === "settings" || inbox.trim() === (s.ws.test_inbox ?? "")}
                onClick={() => {
                  if (!inbox.trim() && !window.confirm("Go live? Reminders will go to the clients' own email addresses.")) return;
                  void saveSettings({ test_inbox: inbox }, inbox.trim() ? "Test inbox saved" : "Live: reminders now go to clients");
                }}
              >
                Save
              </button>
            </div>
          </div>
          <div className="op-field">
            <span className="op-lab">Automatic sending (every morning, 8am Singapore)</span>
            <button className="ev-btn" disabled={busy === "settings"} onClick={() => void saveSettings({ auto_send: !s.ws.auto_send }, s.ws.auto_send ? "Automatic sending off" : "Automatic sending on")}>
              {s.ws.auto_send ? "On · turn off" : "Off · turn on"}
            </button>
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

/* ── Calendar (0269) ───────────────────────────────────────────────────── */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CAL_TAG: Record<ReminderType, string> = { AR: "AR", ECI: "ECI", AGM: "AGM", FS: "FS", CORP_SEC_EXPIRY: "Corp-sec", RECURRING_JOB: "Jobs" };
const initials = (name: string) =>
  name
    .replace(/\b(pte|ltd|private|limited|llp|the)\b\.?/gi, "")
    .split(/[\s&.,()-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "·";
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function Calendar(p: { s: Snapshot; byId: Map<string, Client>; onPreview: (d: Deadline) => void }) {
  const { s } = p;
  const [ym, setYm] = useState(() => s.today.slice(0, 7));
  const [type, setType] = useState<"" | ReminderType>("");
  const [day, setDay] = useState<string | null>(s.today);
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const byDay = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    for (const d of s.deadlines) {
      if (d.status === "cancelled" || !d.due_date.startsWith(ym) || (type && d.type !== type)) continue;
      map.set(d.due_date, [...(map.get(d.due_date) ?? []), d]);
    }
    return map;
  }, [s.deadlines, ym, type]);
  const move = (n: number) => {
    const t = y * 12 + (m - 1) + n;
    setYm(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
    setDay(null);
  };
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const list = day ? (byDay.get(day) ?? []) : [];
  const monthTotal = [...byDay.values()].reduce((n, l) => n + l.filter((d) => d.status === "active").length, 0);
  return (
    <>
      <PageHead icon="calendar" eyebrow="Overview" title="Calendar">
        One view of every date, month by month. Click a day to see who is due.
      </PageHead>
      <section className="ev-card op-pad">
        <div className="op-tools">
          <button className="ev-btn sm" aria-label="Previous month" onClick={() => move(-1)}>
            <Ic n="back" s={12} />
          </button>
          <h2 className="op-h2 op-month">
            {MONTHS[m - 1]} {y}
          </h2>
          <button className="ev-btn sm" aria-label="Next month" onClick={() => move(1)}>
            <Ic n="chev" s={12} />
          </button>
          <button className="ev-btn sm" onClick={() => (setYm(s.today.slice(0, 7)), setDay(s.today))}>
            Today
          </button>
          <span className="ev-sub">{monthTotal} open this month</span>
          <label className="ev-select op-push">
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
        <div className="op-cal" role="grid" aria-label={`${MONTHS[m - 1]} ${y}`}>
          {WEEK.map((w) => (
            <div key={w} className="op-calh" role="columnheader">
              {w}
            </div>
          ))}
          {cells.map((c, i) => {
            if (!c) return <div key={`x${i}`} className="op-cald empty" aria-hidden="true" />;
            const l = byDay.get(c) ?? [];
            const open = l.filter((d) => d.status === "active");
            const late = c < s.today && open.length > 0;
            const types = new Map<ReminderType, number>();
            for (const d of open) types.set(d.type, (types.get(d.type) ?? 0) + 1);
            return (
              <button
                key={c}
                role="gridcell"
                aria-selected={day === c}
                aria-label={`${fmtDate(c)}: ${open.length} open`}
                className={`op-cald ${day === c ? "on" : ""} ${c === s.today ? "today" : ""} ${late ? "late" : ""}`}
                onClick={() => setDay(c)}
              >
                <span className="op-caln">{Number(c.slice(8))}</span>
                {[...types].slice(0, 3).map(([k, n]) => (
                  <span key={k} className={`op-calt ${TAG[k]}`}>
                    {CAL_TAG[k]} <b>{n}</b>
                  </span>
                ))}
                {types.size > 3 && <span className="ev-sub">+{types.size - 3} more</span>}
                {!open.length && l.length > 0 && <span className="ev-sub">{l.length} done</span>}
              </button>
            );
          })}
        </div>
      </section>
      {day && (
        <section className="ev-card op-pad">
          <h2 className="op-h2">{fmtDate(day)}</h2>
          {list.length === 0 && <p className="ev-sub">Nothing due on this day.</p>}
          {list
            .slice()
            .sort((a, b) => (p.byId.get(a.client_id)?.name ?? "").localeCompare(p.byId.get(b.client_id)?.name ?? ""))
            .map((d) => (
              <div key={d.id} className="op-dayrow">
                <span className="op-name">{p.byId.get(d.client_id)?.name ?? "—"}</span>
                <span className={tagClass(d.type)}>{shortType(d)}</span>
                <span className={d.status !== "active" ? "ev-sub" : d.due_date < s.today ? "op-late" : "op-soon"}>{d.status === "active" ? countdown(d.due_date, s.today) : d.status.replace("_", " ")}</span>
                {d.status === "active" ? (
                  <button className="ev-btn sm" onClick={() => p.onPreview(d)}>
                    <Ic n="mail" s={13} />
                    Preview email
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
        </section>
      )}
    </>
  );
}

/* ── Billing & plan (0269) ─────────────────────────────────────────────── */

interface BillingData {
  configured: boolean;
  mode: "test" | "live" | "unset";
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
const SAMPLE_BILLING: BillingData = {
  configured: true,
  mode: "test",
  price: { name: "OnPoint Workflows", amount: 18000, currency: "sgd", interval: "month", tax: true },
  sub: { status: "active", cancel_at_period_end: false, renews_on: "2026-12-24", started_on: "2026-11-24", amount: 18000, currency: "sgd", email: "accounts@example.com" },
  card: { brand: "visa", last4: "4242", exp: "12/29" },
  invoices: [{ id: "in_sample", number: "SAMPLE-0001", date: "2026-11-24", amount: 19620, currency: "sgd", status: "paid", url: null, pdf: null }],
};

function Billing(p: { preview: boolean; say: (t: string) => void; back: { sessionId: string | null; cancelled: boolean } | null }) {
  const [b, setB] = useState<BillingData | null>(p.preview ? SAMPLE_BILLING : null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const { preview, say, back } = p;
  useEffect(() => {
    if (preview) return;
    let gone = false;
    const q = back?.sessionId ? `?session_id=${encodeURIComponent(back.sessionId)}` : "";
    void api(`/api/onpoint/billing${q}`).then((r) => {
      if (gone) return;
      if (!r.ok) return setErr(String(r.j.error ?? "Could not load billing."));
      const data = r.j as unknown as BillingData;
      setB(data);
      if (data.linked) say("Monthly card payment set up. Thank you!");
    });
    return () => {
      gone = true;
    };
  }, [preview, say, back]);
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
  const st = b?.sub ? (STATUS[b.sub.status] ?? [b.sub.status, "off"]) : null;
  const amount = b?.sub?.amount ?? b?.price?.amount ?? null;
  const cur = b?.sub?.currency ?? b?.price?.currency ?? "sgd";
  return (
    <>
      <PageHead icon="card" eyebrow="Account" title="Billing & plan">
        Your monthly subscription, paid by card and charged automatically each month.
      </PageHead>
      {back?.cancelled && <div className="op-warn">Payment not completed. Nothing was charged.</div>}
      {b?.mode === "test" && <div className="op-warn">Stripe test mode: no real card is charged here.</div>}
      {err && <div className="op-warn">{err}</div>}
      {!b && !err && <div className="ev-card op-pad ev-sub">Loading…</div>}
      {b && !b.configured && <div className="ev-card op-pad">Card payments are not switched on yet.</div>}
      {b?.configured && (
        <>
          <div className="op-grid2">
            <section className="ev-card op-pad op-plan">
              <div className="op-planh">
                <div>
                  <span className="op-lab">Current plan</span>
                  <b className="op-planname">{b.price?.name ?? "OnPoint Workflows"}</b>
                  {st ? <span className={`op-pill ${st[1]}`}>{b.sub?.cancel_at_period_end ? "Ends at period end" : st[0]}</span> : <span className="op-pill off">Not set up</span>}
                </div>
                {amount != null && (
                  <div className="op-price">
                    <b>{money(amount, cur)}</b>
                    <span>per {b.price?.interval ?? "month"}{b.price?.tax ? " + GST" : ""}</span>
                  </div>
                )}
              </div>
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
                </div>
              ) : (
                <>
                  <p className="ev-sub">Pay once on Stripe&rsquo;s secure page. After that the card is charged automatically every month, and Stripe emails the receipt.</p>
                  {!b.price && <p className="op-late">The monthly price is not set up in Stripe yet.</p>}
                  <div className="op-chiprow">
                    <button className="ev-btn gold" disabled={!b.price || !!busy} onClick={() => void open("checkout")}>
                      <Ic n="card" s={15} />
                      {busy === "checkout" ? "Opening…" : "Set up monthly card payment"}
                    </button>
                    <button className="ev-btn" disabled={!b.price || !!busy} onClick={() => void open("checkout", true)}>
                      {busy === "checkout-copy" ? "Copying…" : "Copy payment link"}
                    </button>
                  </div>
                </>
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
            <p className="ev-sub">Figures are in Singapore dollars. To change the plan or cancel, just let us know in writing.</p>
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

/* ── Payment reminders (0280) ──────────────────────────────────────────── */

type PChip = "overdue" | "14" | "open" | "paid" | "all";
const PAY_CHIPS: Array<[PChip, string]> = [
  ["overdue", "Overdue"],
  ["14", "Due in 14 days"],
  ["open", "All unpaid"],
  ["paid", "Paid"],
  ["all", "All"],
];
const payTest = (v: Invoice, c: PChip, today: string) =>
  c === "overdue" ? v.status === "open" && v.due_date < today : c === "14" ? v.status === "open" && v.due_date >= today && daysBetween(today, v.due_date) <= 14 : c === "open" ? v.status === "open" : c === "paid" ? v.status === "paid" : true;
const dollars = (n: number) => `S$${n.toLocaleString("en-GB")}`;
const sum = (xs: Invoice[]) => xs.reduce((a, v) => a + v.amount_cents, 0);

/** when each invoice was last reminded, from the recent emails */
function useReminded(s: Snapshot) {
  return useMemo(() => {
    const m = new Map<string, { last: string; n: number }>();
    for (const d of s.deliveries) {
      if (!d.invoice_id || d.status !== "sent") continue;
      const x = m.get(d.invoice_id);
      if (!x) m.set(d.invoice_id, { last: d.requested_at, n: 1 });
      else x.n++;
    }
    return m;
  }, [s.deliveries]);
}

function PayDashboard(p: { s: Snapshot; byId: Map<string, Client>; company: string; go: (v: View) => void; openPay: (c: PChip, id?: string) => void }) {
  const { s } = p;
  const open = s.invoices.filter((v) => v.status === "open");
  const late = open.filter((v) => v.due_date < s.today);
  const soon = open.filter((v) => v.due_date >= s.today && daysBetween(s.today, v.due_date) <= 14);
  const month = s.today.slice(0, 7);
  const sent = s.deliveries.filter((d) => d.type === "PAYMENT" && d.status === "sent" && d.requested_at.slice(0, 7) === month);
  const next = [...late.slice().sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5), ...open.filter((v) => v.due_date >= s.today).slice(0, 8)];
  const noEmail = new Set(open.filter((v) => !p.byId.get(v.client_id)?.contact_email).map((v) => v.client_id)).size;
  return (
    <>
      <header className="op-hero">
        <p className="op-eyebrow">Overview · {longDate(s.today)}</p>
        <h1>Welcome back, {p.company.replace(/,?\s+(pte\.?\s*ltd\.?|private limited)$/i, "")}</h1>
        <p>
          Here is what your clients owe today, from your <b>invoice list</b>. Send each client a payment reminder from your own email, before and after the due date.
        </p>
      </header>
      {!s.payments_ready && <div className="op-warn">Payment reminders are not switched on yet: Founders Doc runs one database update (139) first.</div>}
      {s.payments_ready && s.invoices.length === 0 && (
        <div className="ev-card op-empty">
          <b>No invoices yet.</b> Import your unpaid invoice list (Excel or CSV, e.g. from Xero) or add one by hand on{" "}
          <a href="#payments" onClick={(e) => (e.preventDefault(), p.go("payments"))}>
            Payments
          </a>
          .
        </div>
      )}
      <div className="op-stats">
        <Stat icon="card" tone="gold" label="Outstanding" value={Math.round(sum(open) / 100)} fmt={dollars} sub={`${open.length} unpaid invoice${open.length === 1 ? "" : "s"}`} onClick={() => p.openPay("open")} />
        <Stat icon="alert" tone="red" label="Overdue" value={late.length} sub={late.length ? `${money(sum(late))} past due` : "Nothing overdue"} warn={late.length > 0} onClick={() => p.openPay("overdue")} />
        <Stat icon="hourglass" tone="blue" label="Due in 14 days" value={soon.length} sub={soon.length ? money(sum(soon)) : "Nothing due soon"} onClick={() => p.openPay("14")} />
        <Stat icon="sent" tone="green" label="Reminders sent" value={sent.length} sub="This month, from your email" onClick={() => p.openPay("all")} />
      </div>
      {noEmail > 0 && (
        <div className="op-warn" role="note">
          {noEmail} client{noEmail === 1 ? "" : "s"} with an unpaid invoice {noEmail === 1 ? "has" : "have"} no email yet. Add it on Payments when you send the reminder.
        </div>
      )}
      <div className="op-grid2 op-dash">
        <section className="ev-card op-list">
          <div className="op-h">
            <h2>
              To chase <span className="ev-sub">overdue first</span>
            </h2>
            <a href="#payments" onClick={(e) => (e.preventDefault(), p.go("payments"))}>
              View all →
            </a>
          </div>
          {next.length === 0 && <p className="ev-sub">Nothing to chase.</p>}
          {next.map((v) => (
            <button key={v.id} className="op-row op-next" onClick={() => p.openPay(v.due_date < s.today ? "overdue" : "open", v.id)}>
              <span className="op-name op-namechev">
                <span>{p.byId.get(v.client_id)?.name ?? "—"}</span>
                <Ic n="chev" s={11} />
              </span>
              <span className="op-amt">{money(v.amount_cents, v.currency)}</span>
              <span className="op-date">{fmtDate(v.due_date)}</span>
              <span className={dueClass(v.due_date, s.today)}>{shortCount(v.due_date, s.today)}</span>
            </button>
          ))}
        </section>
        <section className="ev-card op-list">
          <div className="op-h">
            <h2>Reminder activity</h2>
          </div>
          {s.deliveries.length === 0 && <p className="ev-sub">No reminders sent yet. They appear here as they go out.</p>}
          {s.deliveries.slice(0, 10).map((x) => {
            const inv = x.invoice_id ? s.invoices.find((v) => v.id === x.invoice_id) : undefined;
            return (
              <div key={x.id} className="op-act2">
                <span className={`op-acticon ${x.status}`} aria-hidden="true">
                  <Ic n={x.status === "sent" ? "sent" : x.status === "failed" ? "bang" : "clock"} s={15} />
                </span>
                <div>
                  <div>
                    {x.status === "sent" ? "Reminder sent" : x.status === "failed" ? "Not sent" : x.status === "queued" ? "Sending" : "Skipped"} to <b>{p.byId.get(x.client_id ?? "")?.name ?? "a client"}</b>:{" "}
                    {x.type === "PAYMENT" ? (inv ? `payment ${money(inv.amount_cents, inv.currency)}` : "payment") : (TYPE_NAME[x.type as ReminderType] ?? x.type)}
                    {x.test ? <span className="op-testtag">test</span> : null}
                  </div>
                  {x.error ? <div className="op-late op-small">{x.error}</div> : null}
                  <div className="ev-sub op-small">{new Date(x.requested_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}

function Payments(p: {
  s: Snapshot;
  setS: (fn: (s: Snapshot) => Snapshot) => void;
  byId: Map<string, Client>;
  canEdit: boolean;
  isAdmin: boolean;
  preview: boolean;
  say: (t: string) => void;
  reload: () => Promise<void>;
  initialChip?: PChip;
  openId?: string | null;
}) {
  const { s } = p;
  const [chip, setChip] = useState<PChip>(p.initialChip ?? "overdue");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<string | null>(p.openId ?? null);
  const [wording, setWording] = useState(false);
  const reminded = useReminded(s);
  const file = useRef<HTMLInputElement>(null);

  const base = s.invoices.filter((v) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const c = p.byId.get(v.client_id);
    return `${c?.name ?? ""} ${v.number ?? ""} ${v.description ?? ""}`.toLowerCase().includes(t);
  });
  const rows = base.filter((v) => payTest(v, chip, s.today)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const selected = sel ? s.invoices.find((v) => v.id === sel) : undefined;

  async function mark(v: Invoice, status: InvoiceStatus) {
    if (p.preview) {
      p.setS((x) => ({ ...x, invoices: x.invoices.map((i) => (i.id === v.id ? { ...i, status, paid_on: status === "paid" ? s.today : null } : i)).filter((i) => i.status !== "cancelled") }));
      return p.say(status === "paid" ? "Marked paid (preview only)" : "Updated (preview only)");
    }
    setBusy(v.id);
    const r = await api("/api/onpoint/payments", { method: "PATCH", body: JSON.stringify({ id: v.id, status }) });
    setBusy("");
    if (!r.ok) return p.say(String(r.j.error ?? "Not saved."));
    p.say(status === "paid" ? "Marked paid: no more reminders for it" : status === "open" ? "Back to unpaid" : "Invoice removed");
    await p.reload();
  }
  async function importFile(f: File | undefined) {
    if (!f) return;
    if (p.preview) return p.say("Preview: not imported.");
    const fd = new FormData();
    fd.append("file", f);
    setBusy("import");
    const r = await api("/api/onpoint/payments", { method: "POST", body: fd });
    setBusy("");
    if (file.current) file.current.value = "";
    if (!r.ok) return p.say(String(r.j.error ?? "Not imported."));
    const j = r.j as { invoices: number; added: number; new_clients: number; emails: number; marked_paid: number; skipped: string[] };
    p.say(`${j.invoices} unpaid invoice${j.invoices === 1 ? "" : "s"} read (${j.added} new)${j.new_clients ? `, ${j.new_clients} new client${j.new_clients === 1 ? "" : "s"}` : ""}${j.marked_paid ? `, ${j.marked_paid} marked paid` : ""}${j.skipped.length ? `, ${j.skipped.length} row${j.skipped.length === 1 ? "" : "s"} skipped` : ""}.`);
    setChip("open");
    await p.reload();
  }

  return (
    <>
      <PageHead icon="card" eyebrow="Payments" title="Payment reminders">
        Your clients&rsquo; unpaid invoices. Preview the reminder, add an email if it&rsquo;s missing, and send it from {s.ws.sender_email || s.ws.sender_name}.
      </PageHead>
      {!s.payments_ready && <div className="op-warn">Payment reminders are not switched on yet: run supabase/139_onpoint_payments.sql in Supabase first.</div>}
      <div className="op-soonbar" role="note">
        <span className="op-soontag">Coming soon</span>
        <span>
          <b>Automatic reminders</b> before and after each due date. For now, send each reminder with the button: it goes straight away, from your own email.
        </span>
      </div>
      <section className="ev-card op-pad">
        <div className="op-tools">
          <label className="ev-search wide">
            <Ic n="search" />
            <span className="ev-sr">Search</span>
            <input value={q} placeholder="Search a client or invoice" onChange={(e) => (setQ(e.target.value), setPage(0))} />
          </label>
          {p.canEdit && (
            <>
              <button className="ev-btn op-push" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
                <Ic n="plus" s={14} />
                Add invoice
              </button>
              <button className="ev-btn gold" disabled={busy === "import"} onClick={() => file.current?.click()}>
                <Ic n="upload" s={14} />
                {busy === "import" ? "Importing…" : "Import invoice list"}
              </button>
              <input ref={file} type="file" accept=".xlsx,.csv" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
            </>
          )}
        </div>
        {adding && <AddInvoice s={s} setS={p.setS} preview={p.preview} say={p.say} reload={p.reload} done={(id) => (setAdding(false), setChip("open"), id && setSel(id))} />}
        <p className="ev-sub op-small op-mt">Import: an Excel or CSV list of unpaid invoices (Xero&rsquo;s invoice export works) with a client, an amount and a due date; an email column fills in missing emails. Invoices marked paid in the file are marked paid here.</p>
        <div className="ev-chips" role="group" aria-label="Filter">
          {PAY_CHIPS.map(([k, label]) => (
            <button key={k} className={chip === k ? "on" : ""} aria-pressed={chip === k} onClick={() => (setChip(k), setPage(0))}>
              {label} <span>{base.filter((v) => payTest(v, k, s.today)).length}</span>
            </button>
          ))}
        </div>
        <div className="ev-tablewrap">
          <table className="ev-table op-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Invoice</th>
                <th className="op-right">Amount</th>
                <th>Due</th>
                <th>Last reminder</th>
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
                      <b>{chip === "overdue" ? "Nothing overdue" : s.invoices.length ? "Nothing here" : "No invoices yet"}</b>
                      <span className="ev-sub">{s.invoices.length ? "Try another filter or search." : "Import your invoice list or add one by hand."}</span>
                    </div>
                  </td>
                </tr>
              )}
              {shown.map((v) => {
                const c = p.byId.get(v.client_id);
                const rem = reminded.get(v.id);
                return (
                  <tr key={v.id}>
                    <td>
                      <b>{c?.name ?? "—"}</b>
                      <div className="ev-sub">
                        {c?.contact_email ? (
                          c.contact_email
                        ) : v.status === "open" && p.canEdit ? (
                          <button className="op-due late op-addmail" onClick={() => setSel(v.id)}>
                            + Add email
                          </button>
                        ) : (
                          <span className="op-due late">No email</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <b>{v.number || "—"}</b>
                      {v.description ? <div className="ev-sub op-clip">{v.description}</div> : null}
                    </td>
                    <td className="op-right op-amt">{money(v.amount_cents, v.currency)}</td>
                    <td>
                      <div className="op-date2">{fmtDate(v.due_date)}</div>
                      {v.status === "open" ? (
                        <span className={dueClass(v.due_date, s.today)}>{countdown(v.due_date, s.today)}</span>
                      ) : (
                        <span className="op-due done">
                          <Ic n="check" s={11} w={2.4} />
                          Paid{v.paid_on ? ` ${fmtDate(v.paid_on)}` : ""}
                        </span>
                      )}
                    </td>
                    <td>{rem ? <span className="ev-sub">{fmtDate(rem.last.slice(0, 10))}{rem.n > 1 ? ` · ${rem.n} sent` : ""}</span> : <span className="ev-sub">Not yet</span>}</td>
                    <td className="op-right">
                      <span className="op-acts">
                        {v.status === "open" && (
                          <button className="ev-btn sm gold" onClick={() => setSel(v.id)}>
                            <Ic n="mail" s={13} />
                            Preview &amp; send
                          </button>
                        )}
                        {p.canEdit && v.status === "open" && (
                          <button className="ev-btn sm op-done" disabled={busy === v.id} onClick={() => void mark(v, "paid")}>
                            <Ic n="check" s={12} w={2.2} />
                            Paid
                          </button>
                        )}
                        {p.canEdit && v.status === "paid" && (
                          <button className="ev-link" disabled={busy === v.id} onClick={() => void mark(v, "open")}>
                            Not paid
                          </button>
                        )}
                        {p.canEdit && (
                          <button className="ev-link" disabled={busy === v.id} onClick={() => window.confirm(`Remove ${v.number ? `invoice ${v.number}` : "this invoice"} for ${c?.name ?? "this client"}? No reminders will be sent for it.`) && void mark(v, "cancelled")}>
                            Remove
                          </button>
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
      <PayWording s={s} setS={p.setS} canEdit={p.canEdit} preview={p.preview} say={p.say} reload={p.reload} open={wording} setOpen={setWording} />
      {p.isAdmin && <FilingSwitch s={s} setS={p.setS} preview={p.preview} say={p.say} reload={p.reload} />}
      {selected && <PaySend s={s} setS={p.setS} v={selected} client={p.byId.get(selected.client_id)} canEdit={p.canEdit} preview={p.preview} say={p.say} reload={p.reload} onClose={() => setSel(null)} editWording={() => (setSel(null), setWording(true))} />}
    </>
  );
}

function AddInvoice(p: { s: Snapshot; setS: (fn: (s: Snapshot) => Snapshot) => void; preview: boolean; say: (t: string) => void; reload: () => Promise<void>; done: (id?: string) => void }) {
  const [f, setF] = useState({ client: "", email: "", contact: "", number: "", description: "", amount: "", due: p.s.today });
  const [busy, setBusy] = useState(false);
  const known = p.s.clients.find((c) => c.name.toLowerCase() === f.client.trim().toLowerCase());
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    if (!f.client.trim()) return p.say("Type the client's name.");
    if (!/^\d+(\.\d{1,2})?$/.test(f.amount.replace(/[,\s]/g, ""))) return p.say("Type the amount, e.g. 1200 or 1,200.50.");
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return p.say("Check the email address.");
    if (p.preview) {
      const id = `v${Date.now()}`;
      const cid = known?.id ?? `c${Date.now()}`;
      p.setS((x) => ({
        ...x,
        clients: known
          ? x.clients.map((c) => (c.id === known.id && !c.contact_email && f.email ? { ...c, contact_email: f.email.trim().toLowerCase() } : c))
          : [...x.clients, { id: cid, key: f.client.toLowerCase(), name: f.client.trim(), uen: null, fye: null, services: [], contact_name: f.contact || null, contact_email: f.email.trim().toLowerCase() || null, active: true }],
        invoices: [...x.invoices, { id, client_id: cid, number: f.number || null, description: f.description || null, amount_cents: Math.round(parseFloat(f.amount.replace(/[,\s]/g, "")) * 100), currency: "SGD", issue_date: null, due_date: f.due, status: "open", paid_on: null, source: "Added in the app" }],
      }));
      p.say("Invoice added (preview only)");
      return p.done(id);
    }
    setBusy(true);
    const r = await api("/api/onpoint/payments", {
      method: "POST",
      body: JSON.stringify({ action: "add", client_id: known?.id, client_name: f.client, email: f.email, contact_name: f.contact, number: f.number, description: f.description, amount: f.amount, due_date: f.due }),
    });
    setBusy(false);
    if (!r.ok) return p.say(String(r.j.error ?? "Not added."));
    p.say("Invoice added");
    await p.reload();
    p.done(String(r.j.id ?? ""));
  }
  return (
    <div className="op-addinv">
      <label>
        <span className="op-lab">Client</span>
        <input className="op-in sm" list="op-clientnames" value={f.client} onChange={set("client")} placeholder="Company name" />
        <datalist id="op-clientnames">
          {p.s.clients.slice(0, 2000).map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </label>
      <label>
        <span className="op-lab">Client email {known?.contact_email ? <i className="ev-sub">(on file: {known.contact_email})</i> : null}</span>
        <input className="op-in sm" type="email" value={f.email} onChange={set("email")} placeholder={known?.contact_email ? "Leave empty to keep it" : "client@company.com"} />
      </label>
      <label>
        <span className="op-lab">Contact name (optional)</span>
        <input className="op-in sm" value={f.contact} onChange={set("contact")} placeholder="For “Hi …”" />
      </label>
      <label>
        <span className="op-lab">Invoice no. (optional)</span>
        <input className="op-in sm" value={f.number} onChange={set("number")} placeholder="INV-0001" />
      </label>
      <label className="op-span2">
        <span className="op-lab">What it is for (optional)</span>
        <input className="op-in sm" value={f.description} onChange={set("description")} placeholder="e.g. Corporate secretarial fee 2027" />
      </label>
      <label>
        <span className="op-lab">Amount (S$)</span>
        <input className="op-in sm" inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="1,200.00" />
      </label>
      <label>
        <span className="op-lab">Due date</span>
        <input className="op-in sm" type="date" value={f.due} onChange={set("due")} />
      </label>
      <div className="op-span2 op-chiprow">
        <button className="ev-btn gold" disabled={busy} onClick={() => void save()}>
          {busy ? "Adding…" : "Add invoice"}
        </button>
        <button className="ev-link" onClick={() => p.done()}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function PaySend(p: { s: Snapshot; setS: (fn: (s: Snapshot) => Snapshot) => void; v: Invoice; client: Client | undefined; canEdit: boolean; preview: boolean; say: (t: string) => void; reload: () => Promise<void>; onClose: () => void; editWording: () => void }) {
  const { s, v, client } = p;
  const [quick, setQuick] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [p]);
  if (!client) return null;
  const tpl = { subject: s.ws.pay_subject || DEFAULT_PAY.subject, body: s.ws.pay_body || DEFAULT_PAY.body };
  const r = renderPayment(tpl, { company: client.name, contact: client.contact_name, number: v.number, description: v.description, amount_cents: v.amount_cents, currency: v.currency, due: v.due_date, today: s.today });
  const canSend = p.canEdit && v.status === "open" && !!client.contact_email && !r.unknown.length;
  async function saveQuick() {
    const email = quick.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return p.say("Check the email address.");
    if (p.preview) {
      p.setS((x) => ({ ...x, clients: x.clients.map((c) => (c.id === client!.id ? { ...c, contact_email: email, contact_name: quick.name.trim() || c.contact_name } : c)) }));
      return p.say("Saved (preview only)");
    }
    setBusy("quick");
    const res = await api("/api/onpoint/client", { method: "PATCH", body: JSON.stringify({ id: client!.id, contact_name: quick.name.trim() || client!.contact_name, contact_email: email }) });
    setBusy("");
    if (!res.ok) return p.say(String(res.j.error ?? "Not saved."));
    p.say(`Email saved for ${client!.name}`);
    await p.reload();
  }
  async function send() {
    if (p.preview) return p.say("Preview: nothing is sent.");
    if (!window.confirm(`Send the payment reminder (${money(v.amount_cents, v.currency)}) to ${client!.name} now?${s.ws.test_inbox ? `\n\nTest mode: it goes to ${s.ws.test_inbox}.` : `\n\nIt goes to ${client!.contact_email}.`}`)) return;
    setBusy("send");
    const res = await api("/api/onpoint/payments", { method: "POST", body: JSON.stringify({ action: "send", invoice_id: v.id, request_id: crypto.randomUUID() }) });
    setBusy("");
    p.say(String(res.j.message ?? res.j.error ?? (res.ok ? "Sent" : "Not sent")));
    await p.reload();
    if (res.ok) p.onClose();
  }
  return (
    <>
      <button className="ev-scrim top" aria-label="Close" onClick={p.onClose} />
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="op-ps" className="ev-pay op-modal wide">
        <div className="op-h">
          <h2 id="op-ps">Payment reminder · {client.name}</h2>
          <button className="ev-link" onClick={p.onClose} aria-label="Close">
            <Ic n="close" s={14} />
          </button>
        </div>
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
          <iframe
            className="op-mailframe"
            title="Email preview"
            sandbox="allow-same-origin"
            srcDoc={paymentHtml(r.body, {
              logoUrl: s.ws.logo || "",
              sender: s.ws.custom_name || s.ws.sender_name,
              brandName: s.ws.logo ? undefined : s.ws.custom_name || s.ws.sender_name,
              company: client.name,
              number: v.number,
              description: v.description,
              amount_cents: v.amount_cents,
              currency: v.currency,
              due: v.due_date,
              today: s.today,
            })}
            onLoad={(e) => {
              const f = e.currentTarget;
              const h = f.contentDocument?.documentElement.scrollHeight;
              if (h) f.style.height = `${h}px`;
            }}
          />
        </div>
        {r.notes.map((n) => (
          <p key={n} className="ev-sub op-small">
            {n}
          </p>
        ))}
        {r.unknown.length > 0 && <p className="op-late">Not supported in the wording: {r.unknown.join(", ")}</p>}
        {s.ws.test_inbox && <p className="ev-sub op-small">Test mode: sending now goes to {s.ws.test_inbox}.</p>}
        <div className="op-chiprow op-mt">
          {p.canEdit && (
            <button className="ev-btn gold" disabled={!canSend || busy === "send"} onClick={() => void send()}>
              <Ic n="mail" s={14} />
              {busy === "send" ? "Sending…" : "Send this reminder now"}
            </button>
          )}
          {p.canEdit && (
            <button className="ev-link" onClick={p.editWording}>
              Change the wording
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function PayWording(p: { s: Snapshot; setS: (fn: (s: Snapshot) => Snapshot) => void; canEdit: boolean; preview: boolean; say: (t: string) => void; reload: () => Promise<void>; open: boolean; setOpen: (b: boolean) => void }) {
  const cur = { subject: p.s.ws.pay_subject || DEFAULT_PAY.subject, body: p.s.ws.pay_body || DEFAULT_PAY.body };
  const [d, setD] = useState(cur);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const dirty = d.subject !== cur.subject || d.body !== cur.body;
  const bad = unknownPayTokens(d.subject + d.body);
  useEffect(() => {
    if (p.open) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [p.open]);
  async function save() {
    if (bad.length) return p.say(`Remove unsupported tokens first: ${bad.join(", ")}`);
    if (p.preview) {
      p.setS((x) => ({ ...x, ws: { ...x.ws, pay_subject: d.subject, pay_body: d.body } }));
      return p.say("Saved (preview only)");
    }
    setBusy(true);
    const r = await api("/api/onpoint/payments", { method: "POST", body: JSON.stringify({ action: "template", ...d }) });
    setBusy(false);
    if (!r.ok) return p.say(String(r.j.error ?? "Not saved: your edits are kept here."));
    p.say("Payment reminder wording saved");
    await p.reload();
  }
  return (
    <section ref={ref} className="ev-card op-pad op-mt2">
      <button className="op-fold" aria-expanded={p.open} onClick={() => p.setOpen(!p.open)}>
        <span>
          <b>Email wording</b>
          <span className="ev-sub"> · the same for every payment reminder; the invoice details fill in by themselves</span>
        </span>
        <Ic n={p.open ? "up" : "down"} s={14} />
      </button>
      {p.open && (
        <>
          <div className="op-field op-mt">
            <label className="op-lab" htmlFor="op-psub">
              Subject
            </label>
            <input id="op-psub" className="op-in" value={d.subject} disabled={!p.canEdit} onChange={(e) => setD({ ...d, subject: e.target.value })} />
          </div>
          <div className="op-field">
            <label className="op-lab" htmlFor="op-pbody">
              Email
            </label>
            <textarea id="op-pbody" className="op-in" rows={11} value={d.body} disabled={!p.canEdit} onChange={(e) => setD({ ...d, body: e.target.value })} />
            {p.canEdit && (
              <div className="op-chiprow op-mt" aria-label="Insert a token">
                {PAY_TOKENS.map((t) => (
                  <button key={t} className="op-token" onClick={() => setD({ ...d, body: `${d.body}${t}` })}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            {bad.length > 0 && <p className="op-late">Not supported: {bad.join(", ")}</p>}
          </div>
          {p.canEdit && (
            <div className="op-chiprow">
              <button className="ev-btn gold" disabled={!dirty || busy} onClick={() => void save()}>
                {busy ? "Saving…" : dirty ? "Save wording" : "Saved"}
              </button>
              {dirty && (
                <button className="ev-link" onClick={() => setD(cur)}>
                  Undo changes
                </button>
              )}
              <button className="ev-link" onClick={() => setD(DEFAULT_PAY)}>
                Back to the standard wording
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FilingSwitch(p: { s: Snapshot; setS: (fn: (s: Snapshot) => Snapshot) => void; preview: boolean; say: (t: string) => void; reload: () => Promise<void> }) {
  const on = p.s.ws.filing_enabled;
  const [busy, setBusy] = useState(false);
  async function flip() {
    if (p.preview) {
      p.setS((x) => ({ ...x, ws: { ...x.ws, filing_enabled: !on } }));
      return p.say(on ? "Filing reminders hidden (preview only)" : "Filing reminders shown (preview only)");
    }
    setBusy(true);
    const r = await api("/api/onpoint/payments", { method: "POST", body: JSON.stringify({ action: "filing", on: !on }) });
    setBusy(false);
    if (!r.ok) return p.say(String(r.j.error ?? "Not saved."));
    p.say(on ? "Filing reminders hidden" : "Filing reminders switched on");
    await p.reload();
  }
  return (
    <section className="ev-card op-pad op-mt2 op-optional">
      <div>
        <b>Filing reminders</b> <span className="op-soontag muted">Optional</span>
        <p className="ev-sub op-small">ACRA and IRAS deadline reminders (AR, ECI, AGM…) worked out from the Master List. {on ? "Shown in the menu." : "Hidden: you only send payment reminders."}</p>
      </div>
      <button className="ev-btn" disabled={busy} onClick={() => void flip()}>
        {on ? "Hide filing reminders" : "Show filing reminders"}
      </button>
    </section>
  );
}
