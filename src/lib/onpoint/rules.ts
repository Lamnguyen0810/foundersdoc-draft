import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { daysBetween, fmtDate, isIso, sgToday } from "./dates";
import { cleanFlow, DEFAULT_FLOWS, flowHit, flowLine, okHook, type Connections, type DayNote, type Flow, type FlowAction, type FlowRun } from "./flows";
import { okSecret, seal, unseal } from "./seal";
import { all, count, OpError, sendPlain, sendReminder, zero, type Me, type RunTotals } from "./server";
import { TYPE_NAME, TYPES, type Deadline, type ReminderType, type Workspace } from "./types";

/**
 * Rules & flows (0294), calendar notes and the connections (supabase/148). Every write is checked here again.
 * Slack and Zapier hook addresses are sealed before they are stored and are never sent back to the browser:
 * the page only learns whether each one is connected.
 */

const db = () => supabaseAdmin();
const notReady = (e: { message: string } | null) => !!e && /onpoint_flows|onpoint_flow_runs|onpoint_day_notes|paused_types|team_email|monday_email|hook_enc/.test(e.message);
const READY = "Run supabase/148_onpoint_rules_flows.sql first.";
const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new OpError(notReady(r.error) ? READY : r.error.message, notReady(r.error) ? 503 : 500);
  return r.data;
};
const key = () => {
  const k = process.env.ONPOINT_TOKEN_KEY?.trim() ?? "";
  if (!okSecret(k)) throw new OpError("Connections need ONPOINT_TOKEN_KEY on the server first.", 503);
  return k;
};
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** everything the page shows; null = supabase/148 not run yet */
export async function rulesSnapshot(wsId: string): Promise<{ flows: Flow[]; runs: FlowRun[]; notes: DayNote[]; connections: Connections; paused: string[] } | null> {
  const [f, r, n, w] = await Promise.all([
    db().from("onpoint_flows").select("id, name, enabled, trigger, types, days, actions, position").eq("workspace_id", wsId).order("position").order("created_at"),
    db().from("onpoint_flow_runs").select("id, flow_id, deadline_id, action, status, note, ran_at").eq("workspace_id", wsId).order("ran_at", { ascending: false }).range(0, 99),
    db().from("onpoint_day_notes").select("id, day, text, created_by").eq("workspace_id", wsId).gte("day", shiftDays(sgToday(), -400)).order("day").order("created_at"),
    db().from("onpoint_workspaces").select("team_email, monday_email, slack_hook_enc, zapier_hook_enc, paused_types").eq("id", wsId).maybeSingle(),
  ]);
  if (f.error || r.error || n.error || w.error) return null;
  const ws = (w.data ?? {}) as { team_email: string | null; monday_email: string | null; slack_hook_enc: string | null; zapier_hook_enc: string | null; paused_types: string[] | null };
  return {
    flows: (f.data ?? []) as Flow[],
    runs: (r.data ?? []) as FlowRun[],
    notes: (n.data ?? []) as DayNote[],
    connections: { team_email: ws.team_email ?? null, monday_email: ws.monday_email ?? null, slack: !!ws.slack_hook_enc, zapier: !!ws.zapier_hook_enc },
    paused: ws.paused_types ?? [],
  };
}

function shiftDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/* ── flows ────────────────────────────────────────────────────────────── */

export async function saveFlow(m: Me, id: string | null, b: Record<string, unknown>) {
  const f = cleanFlow(b);
  if ("error" in f) throw new OpError(f.error);
  if (id) {
    const r = must(await db().from("onpoint_flows").update({ ...f, updated_at: new Date().toISOString() }).eq("workspace_id", m.ws.id).eq("id", id).select("id").maybeSingle());
    if (!r) throw new OpError("That flow is no longer there.", 404);
    return { id };
  }
  const top = must(await db().from("onpoint_flows").select("position").eq("workspace_id", m.ws.id).order("position").limit(1)) as Array<{ position: number }>;
  const r = must(await db().from("onpoint_flows").insert({ workspace_id: m.ws.id, ...f, position: (top[0]?.position ?? 1) - 1, created_by: m.email }).select("id").single()) as { id: string };
  return { id: r.id };
}

export async function toggleFlow(m: Me, id: string, on: boolean) {
  const r = must(await db().from("onpoint_flows").update({ enabled: on, updated_at: new Date().toISOString() }).eq("workspace_id", m.ws.id).eq("id", id).select("id").maybeSingle());
  if (!r) throw new OpError("That flow is no longer there.", 404);
  return { id, enabled: on };
}

export async function deleteFlow(m: Me, id: string) {
  must(await db().from("onpoint_flows").delete().eq("workspace_id", m.ws.id).eq("id", id));
  return { id };
}

/** the mock-up's flows again, if every flow was deleted */
export async function restoreFlows(m: Me) {
  const have = must(await db().from("onpoint_flows").select("id").eq("workspace_id", m.ws.id).limit(1)) as unknown[];
  if (have.length) return { added: 0 };
  must(await db().from("onpoint_flows").insert(DEFAULT_FLOWS.map((f) => ({ workspace_id: m.ws.id, ...f, created_by: m.email }))));
  return { added: DEFAULT_FLOWS.length };
}

/** switch a type's automatic client chase (Reminder emails' days) off or on */
export async function setTypePaused(m: Me, type: string, paused: boolean) {
  if (!(TYPES as readonly string[]).includes(type)) throw new OpError("Which deadline type?");
  const w = must(await db().from("onpoint_workspaces").select("paused_types").eq("id", m.ws.id).single()) as { paused_types: string[] | null };
  const set = new Set(w.paused_types ?? []);
  if (paused) set.add(type);
  else set.delete(type);
  must(await db().from("onpoint_workspaces").update({ paused_types: [...set] }).eq("id", m.ws.id));
  return { paused: [...set] };
}

/* ── connections ──────────────────────────────────────────────────────── */

/** admin: team email, Monday.com board email, Slack and Zapier hooks (a hook: "" = disconnect, undefined = unchanged) */
export async function saveConnections(m: Me, b: { team_email?: unknown; monday_email?: unknown; slack?: unknown; zapier?: unknown }) {
  const patch: Record<string, string | null> = {};
  for (const k of ["team_email", "monday_email"] as const) {
    if (b[k] === undefined) continue;
    const v = String(b[k] ?? "").trim().toLowerCase();
    if (v && !EMAIL.test(v)) throw new OpError(k === "team_email" ? "Check the team email address." : "Check the Monday.com board email address (Monday.com → board → Integrations → Email).");
    patch[k] = v || null;
  }
  for (const k of ["slack", "zapier"] as const) {
    if (b[k] === undefined) continue;
    const v = String(b[k] ?? "").trim();
    if (!v) {
      patch[`${k}_hook_enc`] = null;
      continue;
    }
    if (!okHook(k, v)) throw new OpError(k === "slack" ? "That is not a Slack incoming webhook (https://hooks.slack.com/services/…)." : "That is not a Zapier catch hook (https://hooks.zapier.com/hooks/catch/…).");
    patch[`${k}_hook_enc`] = seal(v, key());
  }
  if (!Object.keys(patch).length) return { saved: 0 };
  must(await db().from("onpoint_workspaces").update(patch).eq("id", m.ws.id));
  return { saved: Object.keys(patch).length };
}

async function hooks(wsId: string): Promise<{ slack: string | null; zapier: string | null; team: string | null; monday: string | null }> {
  const w = must(await db().from("onpoint_workspaces").select("team_email, monday_email, slack_hook_enc, zapier_hook_enc").eq("id", wsId).single()) as { team_email: string | null; monday_email: string | null; slack_hook_enc: string | null; zapier_hook_enc: string | null };
  const k = process.env.ONPOINT_TOKEN_KEY?.trim() ?? "";
  const open = (v: string | null) => (v && okSecret(k) ? unseal(v, k) : null);
  return { slack: open(w.slack_hook_enc), zapier: open(w.zapier_hook_enc), team: w.team_email, monday: w.monday_email };
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; error: string | null }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    return { ok: r.ok, error: r.ok ? null : `answered ${r.status}` };
  } catch {
    return { ok: false, error: "could not be reached" };
  }
}

/** one action for a list of lines (a flow's matches today); the text has company, deadline and date only */
async function act(ws: Workspace, action: Exclude<FlowAction, "email_client">, h: Awaited<ReturnType<typeof hooks>>, flowName: string, lines: string[]): Promise<{ ok: boolean; note: string }> {
  const company = ws.custom_name || ws.sender_name || ws.name;
  const title = `${flowName}: ${lines.length} deadline${lines.length === 1 ? "" : "s"}`;
  const text = `${title}\n\n${lines.map((l) => `• ${l}`).join("\n")}\n\nSent by ${company} Workflows (Rules & flows).`;
  if (action === "slack") {
    if (!h.slack) return { ok: false, note: "Slack is not connected" };
    const r = await post(h.slack, { text });
    return { ok: r.ok, note: r.ok ? "Posted to Slack" : `Slack ${r.error}` };
  }
  if (action === "zapier") {
    if (!h.zapier) return { ok: false, note: "Zapier is not connected" };
    const r = await post(h.zapier, { kind: "onpoint_flow", flow: flowName, count: lines.length, items: lines, text });
    return { ok: r.ok, note: r.ok ? "Sent to Zapier" : `Zapier ${r.error}` };
  }
  const to = action === "monday" ? h.monday : h.team || ws.sender_email;
  if (!to) return { ok: false, note: action === "monday" ? "Monday.com is not connected" : "No team email set" };
  const r = await sendPlain(ws, { to, subject: action === "monday" ? title : `[${company}] ${title}`, text, kind: action === "monday" ? "onpoint_monday" : "onpoint_team" });
  return { ok: r.ok, note: r.ok ? (action === "monday" ? "Monday.com task created" : "Team emailed") : (r.error ?? "Not sent") };
}

/** admin: a test message through one connection, now */
export async function testConnection(m: Me, kind: string) {
  if (!["slack", "zapier", "monday", "email_team"].includes(kind)) throw new OpError("Which connection?");
  const h = await hooks(m.ws.id);
  const r = await act(m.ws, kind as Exclude<FlowAction, "email_client">, h, "Test from Rules & flows", [flowLine("Sample Company Pte. Ltd.", "Annual Return (ACRA)", shiftDays(sgToday(), 14), sgToday())]);
  if (!r.ok) throw new OpError(r.note);
  return { message: r.note };
}

/* ── the 8am run ──────────────────────────────────────────────────────── */

/** every enabled flow against every live deadline: each (flow, deadline, day, action) once */
export async function flowRun(ws: Workspace): Promise<RunTotals> {
  const t = zero();
  const today = sgToday();
  const fr = await db().from("onpoint_flows").select("id, name, enabled, trigger, types, days, actions").eq("workspace_id", ws.id).eq("enabled", true);
  if (fr.error) return t; /* before supabase/148 */
  const flows = (fr.data ?? []) as Flow[];
  if (!flows.length) return t;
  const live = await all<Pick<Deadline, "id" | "client_id" | "type" | "label" | "due_date" | "status">>((f, x) =>
    db().from("onpoint_deadlines").select("id, client_id, type, label, due_date, status").eq("workspace_id", ws.id).eq("status", "active").gte("due_date", shiftDays(today, -366)).lte("due_date", shiftDays(today, 366)).range(f, x),
  );
  t.checked = live.length;
  const names = new Map<string, string>();
  const ids = [...new Set(live.map((d) => d.client_id))];
  for (let i = 0; i < ids.length; i += 200) {
    const r = await db().from("onpoint_clients").select("id, name").in("id", ids.slice(i, i + 200));
    for (const c of (r.data ?? []) as Array<{ id: string; name: string }>) names.set(c.id, c.name);
  }
  const h = await hooks(ws.id);
  for (const f of flows) {
    const hits = live.map((d) => ({ d, n: flowHit(f, d, today) })).filter((x): x is { d: (typeof live)[number]; n: number } => x.n !== null);
    if (!hits.length) continue;
    t.due += hits.length;
    for (const a of f.actions) {
      if (a === "email_client") {
        for (const { d, n } of hits) {
          const k = `${f.id}:${d.id}:${n}:${a}:${d.due_date}`;
          if (!(await claim(ws.id, f.id, d.id, n, a, k))) continue;
          try {
            const r = await sendReminder(ws, d.id, "AUTOMATIC", `flow: ${f.name}`.slice(0, 80), { leadDays: f.trigger === "before" ? n : -(n + 1) });
            count(t, r);
            await finish(k, r.status === "sent" ? "sent" : r.status === "failed" ? "failed" : "skipped", r.message);
          } catch {
            t.failed++;
            await finish(k, "failed", "Not sent");
          }
        }
        continue;
      }
      /* the team, Slack, Monday.com and Zapier get one message per flow per day, listing every match not told yet */
      const fresh: typeof hits = [];
      for (const x of hits) if (await claim(ws.id, f.id, x.d.id, x.n, a, `${f.id}:${x.d.id}:${x.n}:${a}:${x.d.due_date}`)) fresh.push(x);
      if (!fresh.length) continue;
      const lines = fresh.map(({ d }) => flowLine(names.get(d.client_id) ?? "A client", d.label || TYPE_NAME[d.type as ReminderType], d.due_date, today));
      const r = await act(ws, a, h, f.name, lines).catch(() => ({ ok: false, note: "Not sent" }));
      if (r.ok) t.sent++;
      else t.skipped++;
      for (const { d, n } of fresh) await finish(`${f.id}:${d.id}:${n}:${a}:${d.due_date}`, r.ok ? "sent" : "skipped", r.note);
    }
  }
  return t;
}

/** the run's row first (unique key), so a second run the same day does nothing twice */
async function claim(wsId: string, flowId: string, deadlineId: string, n: number, action: FlowAction, runKey: string): Promise<boolean> {
  const r = await db().from("onpoint_flow_runs").insert({ workspace_id: wsId, flow_id: flowId, deadline_id: deadlineId, day_n: n, action, status: "skipped", note: "running", run_key: runKey });
  return !r.error;
}
async function finish(runKey: string, status: "sent" | "failed" | "skipped", note: string) {
  await db().from("onpoint_flow_runs").update({ status, note: note.slice(0, 300), ran_at: new Date().toISOString() }).eq("run_key", runKey);
}

/* ── calendar notes ───────────────────────────────────────────────────── */

export async function addNote(m: Me, day: string, text: string) {
  const t = text.trim().slice(0, 300);
  if (!isIso(day) || Math.abs(daysBetween(sgToday(), day)) > 3650) throw new OpError("Which day?");
  if (!t) throw new OpError("Write the note first.");
  const r = must(await db().from("onpoint_day_notes").insert({ workspace_id: m.ws.id, day, text: t, created_by: m.email }).select("id, day, text, created_by").single()) as DayNote;
  return { note: r, message: `Note added to ${fmtDate(day)}` };
}

export async function removeNote(m: Me, id: string) {
  must(await db().from("onpoint_day_notes").delete().eq("workspace_id", m.ws.id).eq("id", id));
  return { id };
}

