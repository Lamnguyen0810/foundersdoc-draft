import { daysBetween } from "./dates";
import { TYPES, type Deadline, type ReminderType } from "./types";

/**
 * Rules & flows (0294), as in the approved mock-up: WHEN a deadline gets close (or passes), THEN do something:
 * email the client, email the OnPoint team, post to Slack, create a Monday.com task, or send it to Zapier.
 * Pure, so the same rules decide what the page shows and what the 8am run does.
 *
 * The client reminders on "Reminder emails" (30 / 14 / 7 days before, per type) are shown here as one flow
 * per type ("chase" flows); switching one off pauses that type's automatic client emails.
 */

export const ACTIONS = ["email_client", "email_team", "slack", "monday", "zapier"] as const;
export type FlowAction = (typeof ACTIONS)[number];
export type FlowTrigger = "before" | "overdue";

export interface Flow {
  id: string;
  name: string;
  enabled: boolean;
  trigger: FlowTrigger;
  /** empty = every type */
  types: ReminderType[];
  /** before: days before the due date · overdue: days after it (0 = on the day it passes, i.e. the day after due) */
  days: number[];
  actions: FlowAction[];
  position?: number;
}

/** what the page learns about the connections: never a hook address */
export interface Connections {
  team_email: string | null;
  monday_email: string | null;
  slack: boolean;
  zapier: boolean;
}
export interface FlowRun {
  id: number;
  flow_id: string;
  deadline_id: string | null;
  action: FlowAction;
  status: "sent" | "failed" | "skipped";
  note: string | null;
  ran_at: string;
}
export interface DayNote {
  id: string;
  day: string;
  text: string;
  created_by: string | null;
}

export const ACTION_NAME: Record<FlowAction, string> = {
  email_client: "Email the client",
  email_team: "Email the OnPoint team",
  slack: "Post to Slack",
  monday: "Create a Monday.com task",
  zapier: "Send to Zapier",
};

export const isAction = (v: unknown): v is FlowAction => typeof v === "string" && (ACTIONS as readonly string[]).includes(v);

/** the days a flow fires on, cleaned: whole numbers, 0–365, no repeats, largest first */
export function cleanFlowDays(v: unknown, trigger: FlowTrigger): number[] {
  const list = Array.isArray(v) ? v : [];
  const out = new Set<number>();
  for (const x of list) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= (trigger === "before" ? 1 : 0) && n <= 365) out.add(n);
  }
  return [...out].sort((a, b) => b - a).slice(0, 8);
}

/** a flow from untrusted input (the browser): checked field by field; null = not valid */
export function cleanFlow(b: Record<string, unknown>): Omit<Flow, "id"> | { error: string } {
  const name = String(b.name ?? "").trim().slice(0, 120);
  if (!name) return { error: "Give the flow a name." };
  const trigger: FlowTrigger = b.trigger === "overdue" ? "overdue" : "before";
  const types = [...new Set((Array.isArray(b.types) ? b.types : []).map(String))].filter((t): t is ReminderType => (TYPES as readonly string[]).includes(t));
  const days = cleanFlowDays(b.days, trigger);
  if (!days.length) return { error: trigger === "before" ? "Choose how many days before the due date (1 to 365)." : "Choose how many days after the due date (0 to 365)." };
  const actions = [...new Set((Array.isArray(b.actions) ? b.actions : []).map(String))].filter(isAction);
  if (!actions.length) return { error: "Choose at least one thing to do (Then …)." };
  return { name, enabled: b.enabled !== false, trigger, types, days, actions };
}

/**
 * The day number a flow fires on for this deadline today, or null.
 * before: n days before due (n in days) · overdue: n days after due (n in days; 0 = the due day has just passed).
 */
export function flowHit(f: Pick<Flow, "enabled" | "trigger" | "types" | "days">, d: Pick<Deadline, "type" | "due_date" | "status">, today: string): number | null {
  if (!f.enabled || d.status !== "active") return null;
  if (f.types.length && !f.types.includes(d.type)) return null;
  const left = daysBetween(today, d.due_date);
  if (f.trigger === "before") return left > 0 && f.days.includes(left) ? left : null;
  const late = -left - 1;
  return late >= 0 && f.days.includes(late) ? late : null;
}

/** "Annual Return approaching" · "Any deadline passes" — the WHEN box */
export function whenTitle(f: Pick<Flow, "trigger" | "types">, typeName: (t: ReminderType) => string): string {
  const what = f.types.length === 0 ? "Any deadline" : f.types.length === 1 ? typeName(f.types[0]!) : f.types.map(typeName).join(" / ");
  return f.trigger === "before" ? `${what} approaching` : `${what} passes its due date`;
}

export function whenDetail(f: Pick<Flow, "trigger" | "days">): string {
  const ds = [...f.days].sort((a, b) => b - a);
  if (f.trigger === "before") return `${ds.join(", ")} day${ds.length === 1 && ds[0] === 1 ? "" : "s"} before the due date`;
  return ds.map((n) => (n === 0 ? "the day after it is due" : `${n + 1} days after it is due`)).join(", ");
}

/**
 * The next automatic client reminder for a deadline (Deadlines' "Next reminder"):
 * the largest lead time still ahead, or "due-day" when every lead time has passed, or "escalated" when overdue.
 */
export function nextReminder(d: Pick<Deadline, "due_date" | "status">, leads: number[], today: string, paused = false): { kind: "date"; date: string; inDays: number } | { kind: "escalated" } | { kind: "none" } | { kind: "dueday" } {
  if (d.status !== "active") return { kind: "none" };
  const left = daysBetween(today, d.due_date);
  if (left < 0) return { kind: "escalated" };
  if (paused || !leads.length) return { kind: "none" };
  const ahead = [...leads].filter((l) => l <= left).sort((a, b) => b - a);
  if (!ahead.length) return { kind: "dueday" };
  const l = ahead[0]!;
  return { kind: "date", date: shift(d.due_date, -l), inDays: left - l };
}

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** the flows from the approved mock-up, added once when the page is first set up (supabase/148 does the same) */
export const DEFAULT_FLOWS: Array<Omit<Flow, "id">> = [
  { name: "Overdue → escalate to OnPoint", enabled: true, trigger: "overdue", types: ["AR", "AGM", "FS", "ECI"], days: [0], actions: ["email_team", "slack", "monday"], position: 1 },
  { name: "Corp-Sec expiry — 60 day notice", enabled: true, trigger: "before", types: ["CORP_SEC_EXPIRY"], days: [60], actions: ["email_client", "zapier"], position: 2 },
  { name: "ECI filing — IRAS 3-month rule", enabled: false, trigger: "before", types: ["ECI"], days: [45], actions: ["email_client"], position: 3 },
];

/** a short, safe text for Slack, Zapier and Monday.com: company, what, when (no emails, no UENs) */
export function flowLine(company: string, typeName: string, due: string, today: string): string {
  const n = daysBetween(today, due);
  const when = n === 0 ? "due today" : n > 0 ? `due in ${n} day${n === 1 ? "" : "s"}` : `${-n} day${n === -1 ? "" : "s"} overdue`;
  return `${company}: ${typeName}, ${when} (${due})`;
}

/** Slack incoming webhooks and Zapier catch hooks only; Monday.com is reached by its board email address */
export function okHook(kind: "slack" | "zapier", url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    return kind === "slack" ? u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/") : u.hostname === "hooks.zapier.com" && u.pathname.startsWith("/hooks/catch/");
  } catch {
    return false;
  }
}
