"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ic, type IconName } from "../esop/[slug]/icons";
import { countdown, daysBetween, fmtDate } from "@/lib/onpoint/dates";
import { emailHtml, render, TOKENS, unknownTokens } from "@/lib/onpoint/templates";
import { OTHERS, TYPE_NAME, TYPE_PICK, TYPES, type Client, type Deadline, type Delivery, type ReminderType, type Template } from "@/lib/onpoint/types";

/**
 * OnPoint Workflows (0267): Dashboard, Deadlines, Reminder emails, Clients and Excel sources, in the look of
 * the ESOP dashboard. Everything shown comes from /api/onpoint/data; every change goes back through the API,
 * which checks it again. The preview here is rendered with the same code the server sends with.
 */

export interface Snapshot {
  me: { email: string; role: "admin" | "staff" | "viewer"; founder: boolean };
  ws: { id: string; slug: string; name: string; custom_name: string | null; logo: string | null; sender_name: string; sender_email: string | null; test_inbox: string | null; auto_send: boolean };
  clients: Client[];
  deadlines: Deadline[];
  deliveries: Delivery[];
  imports: Array<{ file_name: string; kind: string; summary: Record<string, unknown>; imported_by: string | null; imported_at: string }>;
  templates: Record<ReminderType, Template>;
  leads: Record<ReminderType, number[]>;
  today: string;
}

type View = "dashboard" | "deadlines" | "calendar" | "reminders" | "clients" | "sources" | "billing";
const VIEWS: View[] = ["dashboard", "deadlines", "calendar", "reminders", "clients", "sources", "billing"];
const PAGE = 50;
const DEFAULT_LOGO = "/onpoint/logo.png";
const shortType = (d: Pick<Deadline, "type" | "label">) => (d.type === "CORP_SEC_EXPIRY" || d.type === "RECURRING_JOB" ? d.label || TYPE_PICK[d.type] : d.type === "FS" ? "FS" : d.type);

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
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
              {nav("deadlines", "esop", "Deadlines", overdue.length)}
              {nav("calendar", "calendar", "Calendar")}
            </div>
            <div className="ev-grp">
              <div className="ev-h">Automation</div>
              {nav("reminders", "mail", "Reminder emails")}
            </div>
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
          <div className="ev-wrap">
            {view === "dashboard" && <Dashboard s={s} byId={byId} live={live} overdue={overdue} company={company} onPreview={openPreview} go={go} />}
            {view === "deadlines" && <Deadlines s={s} byId={byId} canEdit={canEdit} preview={preview} say={say} reload={reload} onPreview={openPreview} />}
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

function Dashboard(p: { s: Snapshot; byId: Map<string, Client>; live: Deadline[]; overdue: Deadline[]; company: string; onPreview: (d: Deadline) => void; go: (v: View) => void }) {
  const { s } = p;
  const fortnight = p.live.filter((d) => d.due_date >= s.today && daysBetween(s.today, d.due_date) <= 14);
  const month = s.today.slice(0, 7);
  const sent = s.deliveries.filter((d) => d.status === "sent" && d.requested_at.slice(0, 7) === month);
  const next = [...p.overdue.slice(-5).reverse(), ...p.live.filter((d) => d.due_date >= s.today).slice(0, 8)];
  const noEmail = s.clients.filter((c) => !c.contact_email && p.live.some((d) => d.client_id === c.id)).length;
  return (
    <>
      <header className="ev-title">
        <h1>Dashboard</h1>
        <span>{fmtDate(s.today)} · every filing deadline, from your Excel sheets</span>
      </header>
      {s.clients.length === 0 && (
        <div className="ev-card op-empty">
          <b>No clients yet.</b> Import the Master List, Nominee Service and Job Schedule sheets on <a href="#sources" onClick={(e) => (e.preventDefault(), p.go("sources"))}>Excel sources</a>, and every deadline appears here.
        </div>
      )}
      <div className="ev-cards">
        <Stat label="Deadlines tracked" value={p.live.length} sub={`${s.clients.length} clients`} />
        <Stat label="Due this fortnight" value={fortnight.length} sub={fortnight[0] ? `Next due ${fmtDate(fortnight[0].due_date)}` : "Nothing due"} />
        <Stat label="Overdue" value={p.overdue.length} sub="Requires attention" warn={p.overdue.length > 0} />
        <Stat label="Reminders sent" value={sent.length} sub="This month" />
      </div>
      {noEmail > 0 && (
        <div className="op-warn" role="note">
          {noEmail} client{noEmail === 1 ? "" : "s"} with a live deadline {noEmail === 1 ? "has" : "have"} no email address yet, so no reminder can reach them.{" "}
          <a href="#clients" onClick={(e) => (e.preventDefault(), p.go("clients"))}>
            Add emails
          </a>
        </div>
      )}
      <div className="op-grid2">
        <section className="ev-card op-list">
          <div className="op-h">
            <h2>Next deadlines</h2>
            <a href="#deadlines" onClick={(e) => (e.preventDefault(), p.go("deadlines"))}>
              View all →
            </a>
          </div>
          {next.length === 0 && <p className="ev-sub">Nothing to show yet.</p>}
          {next.map((d) => (
            <button key={d.id} className="op-row" onClick={() => p.onPreview(d)}>
              <span className="op-name">{p.byId.get(d.client_id)?.name ?? "—"}</span>
              <span className="op-tag">{shortType(d)}</span>
              <span>{fmtDate(d.due_date)}</span>
              <span className={d.due_date < s.today ? "op-late" : "op-soon"}>{countdown(d.due_date, s.today)}</span>
            </button>
          ))}
        </section>
        <section className="ev-card op-list">
          <div className="op-h">
            <h2>Reminder activity</h2>
          </div>
          {s.deliveries.length === 0 && <p className="ev-sub">No reminders sent yet.</p>}
          {s.deliveries.slice(0, 10).map((x) => (
            <div key={x.id} className="op-act">
              <span className={`op-dot ${x.status}`} aria-hidden="true" />
              <span>
                {x.status === "sent" ? "Sent" : x.status === "failed" ? "Failed" : x.status === "queued" ? "Sending" : "Skipped"}: {TYPE_NAME[x.type as ReminderType] ?? x.type} to {p.byId.get(x.client_id ?? "")?.name ?? "a client"}
                {x.test ? " (test)" : ""}
                {x.error ? ` · ${x.error}` : ""}
              </span>
              <span className="ev-sub">{new Date(x.requested_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: number; sub: string; warn?: boolean }) {
  return (
    <div className="ev-card op-stat">
      <span>{label}</span>
      <b className={warn ? "op-late" : ""}>{value.toLocaleString("en-GB")}</b>
      <span className="ev-sub">{sub}</span>
    </div>
  );
}

/* ── Deadlines ─────────────────────────────────────────────────────────── */

type DChip = "overdue" | "30" | "upcoming" | "done" | "all";

function Deadlines(p: { s: Snapshot; byId: Map<string, Client>; canEdit: boolean; preview: boolean; say: (t: string) => void; reload: () => Promise<void>; onPreview: (d: Deadline) => void }) {
  const { s } = p;
  const [chip, setChip] = useState<DChip>("overdue");
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
      <header className="ev-title">
        <h1>Deadlines</h1>
        <span>Every filing date, worked out from your sheets</span>
      </header>
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
                    Nothing here.
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
                      <span className="op-tag">{shortType(d)}</span>
                    </td>
                    <td>
                      {fmtDate(d.due_date)}
                      <div className={d.status !== "active" ? "ev-sub" : d.due_date < s.today ? "op-late" : "op-soon"}>{d.status === "active" ? countdown(d.due_date, s.today) : d.status === "completed" ? `Done${d.done_on ? ` ${fmtDate(d.done_on)}` : ""}` : d.status.replace("_", " ")}</div>
                    </td>
                    <td>{c?.contact_email ? <span>{c.contact_email}</span> : <span className="op-late">No email</span>}</td>
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
                            <button className="ev-link" disabled={busy === d.id} onClick={() => void mark(d, "completed")}>
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
      <header className="ev-title">
        <h1>Reminder emails</h1>
        <span>Sent to clients on {s.ws.sender_name}&rsquo;s behalf</span>
      </header>
      {missingClient && <div className="op-warn">That client or deadline is no longer there. Pick another below.</div>}
      <div className="op-grid2 wide">
        <section className="ev-card op-pad">
          <h2 className="op-h2">Template</h2>
          <div className="op-field">
            <span className="op-lab">Which deadline is this reminder for?</span>
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
            <span className="op-lab">Preview for client</span>
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
            <span className="op-lab">Send automatically</span>
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
            <label className="op-lab" htmlFor="op-subject">
              Subject
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
                ) : (
                  <b className="op-late">No email on file: add one on Clients</b>
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
                  logoUrl: s.ws.logo || "/onpoint/logo.png",
                  sender: s.ws.custom_name || s.ws.sender_name,
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
              <span className="op-tag">{shortType(d)}</span>
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
      <header className="ev-title">
        <h1>Clients</h1>
        <span>Who each reminder goes to</span>
      </header>
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
                    <td>
                      <b>{c.name}</b>
                      <div className="ev-sub">
                        {c.uen ? `UEN ${c.uen}` : "No UEN"}
                        {c.fye ? ` · FYE ${fmtDate(c.fye)}` : ""}
                        {c.services.length ? ` · ${c.services.map((x) => (x === "acc" ? "Accounts" : x === "fs_tax" ? "FS & tax" : "Corp-sec")).join(", ")}` : ""}
                      </div>
                    </td>
                    <td>{count.get(c.id) ?? 0}</td>
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
      <header className="ev-title">
        <h1>Excel sources</h1>
        <span>The sheets this system reads. It never changes them.</span>
      </header>
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
            <p key={i} className="ev-sub">
              <b>{String(x.file)}</b>: {String((x.kinds as string[] | undefined)?.join(", ") || "not recognised")} · {String(x.clients)} clients · {String(x.deadlines)} deadlines · {String(x.contacts)} emails
              {Number(x.superseded) ? ` · ${String(x.superseded)} older items superseded` : ""}
              {(x.skipped as string[] | undefined)?.length ? ` · not read: ${(x.skipped as string[]).join(", ")}` : ""}
            </p>
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
            <div key={i} className="op-act">
              <span className="op-dot sent" aria-hidden="true" />
              <span>
                {x.file_name} · {x.kind}
              </span>
              <span className="ev-sub">{new Date(x.imported_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </section>
      </div>
      {s.me.founder && <MailboxCard preview={p.preview} say={p.say} reload={p.reload} defaultEmail={s.ws.sender_email ?? ""} />}
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
      <header className="ev-title">
        <h1>Calendar</h1>
        <span>One view of every date</span>
      </header>
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
            const types = new Map<string, number>();
            for (const d of open) {
              const k = CAL_TAG[d.type];
              types.set(k, (types.get(k) ?? 0) + 1);
            }
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
                  <span key={k} className="op-calt">
                    {k} <b>{n}</b>
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
                <span className="op-tag">{shortType(d)}</span>
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

const money = (cents: number, cur: string) => `${cur.toLowerCase() === "sgd" ? "S$" : `${cur.toUpperCase()} `}${(cents / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      <header className="ev-title">
        <h1>Billing &amp; plan</h1>
        <span>Monthly subscription, paid by card</span>
      </header>
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

function MailboxCard(p: { preview: boolean; say: (t: string) => void; reload: () => Promise<void>; defaultEmail: string }) {
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
      <h2 className="op-h2">Sending mailbox · Founders Doc only</h2>
      {!mb ? (
        <p className="ev-sub">Loading…</p>
      ) : !mb.configured ? (
        <p className="ev-sub">Microsoft sending is not set up on the server yet (ONPOINT_MS_CLIENT_ID, ONPOINT_MS_CLIENT_SECRET, ONPOINT_TOKEN_KEY). Until then reminders go through the Zapier hook.</p>
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
