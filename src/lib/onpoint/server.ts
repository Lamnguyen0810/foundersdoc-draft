import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { getUser, isAdmin } from "@/lib/supabase/server";
import { sgToday, daysBetween } from "./dates";
import type { Derived } from "./derive";
import { DEFAULT_LEADS, DEFAULT_TEMPLATES, emailHtml, logoUrl, render } from "./templates";
import { siteUrl } from "@/lib/billing/stripe";
import { sendFromMailbox, usesMailbox, type InlineImage } from "./mailbox";
import { autoTag, DEFAULT_AFTER, DEFAULT_BEFORE, DEFAULT_PAY, paymentHtml, renderPayment, type Invoice, type InvoiceList, type PdfDraft, type PdfItem } from "./payments";
import { clientKey } from "./derive";
import { TYPES, type Client, type Deadline, type ReminderType, type Template, type Workspace } from "./types";

/**
 * OnPoint's server side (0267): who may do what, reading and writing the tables (supabase/136), and sending.
 * The tables are closed to the browser; everything goes through here after `guard()`.
 */

export const SLUG = "onpoint";
export type Role = "admin" | "staff" | "viewer";
export interface Me {
  email: string;
  role: Role;
  founder: boolean;
  ws: Workspace;
}

export class OpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const db = () => supabaseAdmin();
const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new OpError(r.error.message, 500);
  return r.data;
};

const WS = "id, slug, name, custom_name, logo_data, sender_name, sender_email, test_inbox, auto_send";
export async function workspace(): Promise<Workspace> {
  /* 0280: before supabase/139 is run, the new columns are not there yet: filing stays on, payments wait */
  /* 0282: and before 141, the payment schedule is the standard one */
  /* 0290: before 144, payments stay shown as they were */
  const base = { filing_enabled: true, pay_subject: null, pay_body: null, pay_before: DEFAULT_BEFORE, pay_after: DEFAULT_AFTER, payments_enabled: true };
  let w: Workspace | null = null;
  for (const cols of [`${WS}, filing_enabled, pay_subject, pay_body, pay_before, pay_after, payments_enabled`, `${WS}, filing_enabled, pay_subject, pay_body, pay_before, pay_after`, `${WS}, filing_enabled, pay_subject, pay_body`, WS]) {
    const r = await db().from("onpoint_workspaces").select(cols).eq("slug", SLUG).maybeSingle();
    if (r.error && cols !== WS) continue;
    w = r.data ? ({ ...base, ...(must(r) as object) } as Workspace) : null;
    break;
  }
  if (!w || !w.id) throw new OpError("Run supabase/136_onpoint.sql first.", 503);
  return w;
}

/** The signed-in person and their role on OnPoint; null = not allowed (not signed in, or not a member). */
export async function me(): Promise<Me | null> {
  if (!isSupabaseConfigured() || !isAdminClientConfigured()) return null;
  const user = await getUser();
  const email = (user?.email ?? "").toLowerCase();
  if (!email) return null;
  const ws = await workspace();
  if (await isAdmin()) return { email, role: "admin", founder: true, ws };
  const m = must(await db().from("onpoint_members").select("role").eq("workspace_id", ws.id).eq("email", email).maybeSingle()) as { role: Role } | null;
  return m ? { email, role: m.role, founder: false, ws } : null;
}

export async function guard(need: "view" | "edit" | "admin" = "view"): Promise<Me> {
  const m = await me();
  if (!m) throw new OpError("Please sign in with an OnPoint account.", 401);
  if (need === "edit" && m.role === "viewer") throw new OpError("View only: ask your administrator.", 403);
  if (need === "admin" && m.role !== "admin") throw new OpError("Only an administrator can change this.", 403);
  return m;
}

export const isMember = async (email: string) => {
  const ws = await workspace();
  const m = must(await db().from("onpoint_members").select("email").eq("workspace_id", ws.id).eq("email", email).maybeSingle());
  return !!m;
};

/* ── reading ──────────────────────────────────────────────────────────── */

export async function currentTemplates(wsId: string): Promise<Record<ReminderType, Template>> {
  const rows = (must(await db().from("onpoint_templates").select("type, version, subject, body").eq("workspace_id", wsId).order("version", { ascending: false })) ?? []) as Template[];
  const out = {} as Record<ReminderType, Template>;
  for (const t of TYPES) {
    const r = rows.find((x) => x.type === t);
    out[t] = r ?? { type: t, version: 0, ...DEFAULT_TEMPLATES[t] };
  }
  return out;
}

export async function schedules(wsId: string): Promise<Record<ReminderType, number[]>> {
  const rows = (must(await db().from("onpoint_schedules").select("type, lead_days").eq("workspace_id", wsId)) ?? []) as Array<{ type: ReminderType; lead_days: number[] }>;
  const out = {} as Record<ReminderType, number[]>;
  for (const t of TYPES) out[t] = [...(rows.find((x) => x.type === t)?.lead_days ?? DEFAULT_LEADS[t])].sort((a, b) => b - a);
  return out;
}

/** every row, 1,000 at a time (Supabase returns at most 1,000 per request) */
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, cap = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const r = await q(from, from + 999);
    if (r.error) throw new OpError(r.error.message, 500);
    out.push(...(r.data ?? []));
    if ((r.data ?? []).length < 1000) break;
  }
  return out;
}

export async function snapshot(m: Me) {
  const id = m.ws.id;
  const DELIV = "id, client_id, deadline_id, type, trigger, lead_days, to_email, intended_to, subject, status, test, requested_by, requested_at, error";
  const [clients, deadlines, deliveries, imports, templates, leads, invoices] = await Promise.all([
    /* 0285: with notes (before 142: without) */
    all<Client>((f, t) => db().from("onpoint_clients").select("id, key, name, uen, fye, services, contact_name, contact_email, active, notes").eq("workspace_id", id).order("name").range(f, t)).catch(() =>
      all<Client>((f, t) => db().from("onpoint_clients").select("id, key, name, uen, fye, services, contact_name, contact_email, active").eq("workspace_id", id).order("name").range(f, t)),
    ),
    all<Deadline>((f, t) =>
      db().from("onpoint_deadlines").select("id, client_id, type, label, due_date, source, source_key, derived, status, done_on").eq("workspace_id", id).neq("status", "cancelled").order("due_date").range(f, t),
    ),
    db()
      .from("onpoint_deliveries")
      .select(`${DELIV}, invoice_id`)
      .eq("workspace_id", id)
      .order("requested_at", { ascending: false })
      .range(0, 299)
      .then(async (r) => (r.error ? ((await db().from("onpoint_deliveries").select(DELIV).eq("workspace_id", id).order("requested_at", { ascending: false }).range(0, 299)).data ?? []) : r.data ?? [])),
    /* 0282: with its id and whether it was undone (before 141: without) */
    db()
      .from("onpoint_imports")
      .select("id, file_name, kind, summary, imported_by, imported_at, undone_at")
      .eq("workspace_id", id)
      .order("imported_at", { ascending: false })
      .range(0, 29)
      .then(async (r) => (r.error ? ((await db().from("onpoint_imports").select("file_name, kind, summary, imported_by, imported_at").eq("workspace_id", id).order("imported_at", { ascending: false }).range(0, 29)).data ?? []) : r.data ?? [])),
    currentTemplates(id),
    schedules(id),
    /* 0280: null = supabase/139 not run yet */
    all<Invoice>((f, t) => db().from("onpoint_invoices").select(INV).eq("workspace_id", id).neq("status", "cancelled").order("due_date").range(f, t)).catch(() => null),
  ]);
  const { logo_data, ...ws } = m.ws;
  /* 0283: the rollout (proposal: connect, set the rules, test run, go live) and the plan */
  const [mb, plan, feedbackUntil, feedback, addon] = await Promise.all([
    db().from("onpoint_workspaces").select("mail_provider, mail_token_enc").eq("id", id).maybeSingle().then((r) => (r.data as { mail_provider: string | null; mail_token_enc: string | null } | null) ?? null, () => null),
    import("./billing").then((b) => b.planState(id)).catch(() => "free" as const),
    /* 0291: feedback (first 3 months) */
    db().from("onpoint_workspaces").select("feedback_until").eq("id", id).maybeSingle().then((r) => ((r.data as { feedback_until?: string | null } | null)?.feedback_until ?? null), () => null),
    db().from("onpoint_feedback").select("id, page, message, created_by, created_at, status").eq("workspace_id", id).order("created_at", { ascending: false }).range(0, 299).then((r) => (r.error ? null : r.data ?? []), () => null),
    /* 0285: when the document drafting add-on was enquired about */
    db().from("onpoint_workspaces").select("addon_enquired_at").eq("id", id).maybeSingle().then((r) => ((r.data as { addon_enquired_at?: string | null } | null)?.addon_enquired_at ?? null), () => null),
  ]);
  return {
    me: { email: m.email, role: m.role, founder: m.founder },
    ws: { ...ws, logo: logo_data ?? null, mail_connected: !!(mb?.mail_provider && mb.mail_token_enc), plan, addon_enquired_at: addon, feedback_until: feedbackUntil },
    feedback: feedback ?? [],
    feedback_ready: feedback !== null,
    clients,
    deadlines,
    deliveries,
    imports,
    templates,
    leads,
    invoices: invoices ?? [],
    payments_ready: invoices !== null,
    /* 0286: the file folder (null before supabase/143) */
    ...(await import("./files").then(async (f) => {
      const files = await f.listFiles(id);
      return { files: files ?? [], files_ready: files !== null };
    })),
    today: sgToday(),
  };
}

/* ── importing ────────────────────────────────────────────────────────── */

export async function applyImport(m: Me, fileName: string, d: Derived) {
  const id = m.ws.id;
  const now = new Date().toISOString();
  /* clients: add new ones; fill in UEN / FYE / services from the Master List; never wipe a contact.
     Every row in one request carries the same columns: a missing one would be sent as null. */
  const existing = (await all<{ id: string; key: string; uen: string | null }>((f, t) => db().from("onpoint_clients").select("id, key, uen").eq("workspace_id", id).range(f, t))) ?? [];
  const idOf = new Map(existing.map((c) => [c.key, c.id]));
  const uenOf = new Map(existing.map((c) => [c.key, c.uen]));
  const fresh = d.clients
    .filter((c) => !idOf.has(c.key))
    .map((c) => ({ workspace_id: id, key: c.key, name: c.name, uen: c.uen ?? null, fye: c.fye ?? null, services: c.services ?? [], updated_at: now }));
  for (let i = 0; i < fresh.length; i += 500) {
    const ins = must(await db().from("onpoint_clients").insert(fresh.slice(i, i + 500)).select("id, key")) as Array<{ id: string; key: string }>;
    for (const c of ins) idOf.set(c.key, c.id);
  }
  /* known clients seen in a Master List (it has the FYE): refresh UEN / FYE / services, contacts untouched */
  const known = d.clients
    .filter((c) => c.fye && uenOf.has(c.key))
    .map((c) => ({ workspace_id: id, key: c.key, name: c.name, uen: c.uen ?? uenOf.get(c.key) ?? null, fye: c.fye!, services: c.services ?? [], updated_at: now }));
  for (let i = 0; i < known.length; i += 500) must(await db().from("onpoint_clients").upsert(known.slice(i, i + 500), { onConflict: "workspace_id,key" }));
  /* contacts */
  let contacts = 0;
  for (const c of d.contacts) {
    const cid = idOf.get(c.client_key);
    if (!cid) continue;
    must(await db().from("onpoint_clients").update({ contact_email: c.contact_email, ...(c.contact_name ? { contact_name: c.contact_name } : {}), updated_at: now }).eq("id", cid));
    contacts++;
  }
  /* deadlines: upsert by source key; a status set by hand in the app (waived, not applicable) is kept */
  const dl = d.deadlines
    .filter((x) => idOf.has(x.client_key))
    .map((x) => ({ workspace_id: id, client_id: idOf.get(x.client_key)!, type: x.type, label: x.label, due_date: x.due_date, source: x.source, source_key: x.source_key, derived: x.derived, status: x.status, done_on: x.done_on, synced_at: now }));
  const keys = dl.map((x) => x.source_key);
  /* marked done / waived / not applicable in the app: kept while the sheet still shows the item open */
  const manual = new Map<string, { status: string; done_on: string | null }>();
  const seen = new Set<string>();
  /* 0275: 100 at a time, so the request address stays well under the gateway's limit (300 came close to 16 KB) */
  for (let i = 0; i < keys.length; i += 100) {
    const got = (must(await db().from("onpoint_deadlines").select("source_key, status, done_on").eq("workspace_id", id).in("source_key", keys.slice(i, i + 100))) ?? []) as Array<{ source_key: string; status: string; done_on: string | null }>;
    for (const g of got) {
      seen.add(g.source_key);
      if (g.status === "completed" || g.status === "waived" || g.status === "not_applicable") manual.set(g.source_key, g);
    }
  }
  for (const x of dl) {
    const k = manual.get(x.source_key);
    if (k && x.status === "active") {
      x.status = k.status as typeof x.status;
      x.done_on = k.done_on;
    }
  }
  /* 0282: a new deadline remembers this import, so the import can be undone; known ones keep theirs */
  const imp = await openImport(m, fileName, d.kinds.join(", ") || "Not recognised");
  const fresh2 = dl.filter((x) => !seen.has(x.source_key)).map((x) => (imp.link ? { ...x, import_id: imp.id } : x));
  const old2 = dl.filter((x) => seen.has(x.source_key));
  for (const part of [fresh2, old2]) for (let i = 0; i < part.length; i += 500) must(await db().from("onpoint_deadlines").upsert(part.slice(i, i + 500), { onConflict: "workspace_id,source_key" }));

  /* a newer Master List supersedes an older one: per client and type, only the latest due date stays live */
  const live = await all<{ id: string; client_id: string; type: string; due_date: string; source_key: string }>((f, t) =>
    db().from("onpoint_deadlines").select("id, client_id, type, due_date, source_key").eq("workspace_id", id).eq("status", "active").like("source_key", "ML:%").range(f, t),
  );
  const newest = new Map<string, string>();
  for (const x of live) {
    const k = `${x.client_id}|${x.type}`;
    if (!newest.has(k) || newest.get(k)! < x.due_date) newest.set(k, x.due_date);
  }
  const old = live.filter((x) => newest.get(`${x.client_id}|${x.type}`)! > x.due_date).map((x) => x.id);
  for (let i = 0; i < old.length; i += 100) must(await db().from("onpoint_deadlines").update({ status: "cancelled" }).in("id", old.slice(i, i + 100)));

  const summary = { kinds: d.kinds, clients: d.clients.length, deadlines: dl.length, added: fresh2.length, contacts, superseded: old.length, skipped: d.skipped };
  await closeImport(imp.id, summary);
  return { ...summary, import_id: imp.id };
}

/* ── sending ──────────────────────────────────────────────────────────── */

export type SendResult = { status: "sent" | "duplicate" | "failed" | "blocked"; message: string; delivery_id?: string };

/**
 * Send one reminder for one deadline. Everything is read again here; nothing the browser sent is trusted
 * but the deadline's id. The delivery row (with its unique key) is written first, so a retry, a double click
 * or two daily runs at once send nothing twice. While the workspace has a safety-check inbox (test_inbox), the email goes there.
 */
export async function sendReminder(ws: Workspace, deadlineId: string, trigger: "MANUAL" | "AUTOMATIC", by: string, opts: { requestId?: string; leadDays?: number } = {}): Promise<SendResult> {
  const d = must(await db().from("onpoint_deadlines").select("id, client_id, type, label, due_date, status").eq("workspace_id", ws.id).eq("id", deadlineId).maybeSingle()) as Deadline | null;
  if (!d) return { status: "blocked", message: "That deadline is no longer there." };
  if (d.status !== "active") return { status: "blocked", message: "That deadline is not active (done, waived or not applicable)." };
  const c = must(await db().from("onpoint_clients").select("id, name, uen, contact_name, contact_email, active").eq("id", d.client_id).maybeSingle()) as Client | null;
  if (!c || !c.active) return { status: "blocked", message: "That client is not active." };
  const to = (c.contact_email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { status: "blocked", message: `${c.name} has no email address on file.` };
  const tpl = (await currentTemplates(ws.id))[d.type];
  const today = sgToday();
  const r = render(tpl, { type: d.type, label: d.label, company: c.name, uen: c.uen, contact: c.contact_name, due: d.due_date, today });
  if (r.unknown.length) return { status: "blocked", message: `The template has unsupported tokens: ${r.unknown.join(", ")}.` };
  if (r.missing.length) return { status: "blocked", message: `Missing for this client: ${r.missing.join(", ")}.` };
  if (!r.subject || !r.body.trim()) return { status: "blocked", message: "The email is empty." };

  if (trigger === "MANUAL") {
    /* a second click within two minutes is the same send */
    const since = new Date(Date.now() - 120_000).toISOString();
    const recent = must(await db().from("onpoint_deliveries").select("id").eq("deadline_id", d.id).eq("trigger", "MANUAL").in("status", ["queued", "sent"]).gte("requested_at", since).limit(1));
    if ((recent as unknown[]).length) return { status: "duplicate", message: "This reminder was just sent." };
  }
  const test = !!ws.test_inbox?.trim();
  /* 0283: once card payment is open, reminders reach clients only with an active plan (test mode always works) */
  if (!test && !(await import("./billing").then((b) => b.planState(ws.id).then(b.liveAllowed)))) return { status: "blocked", message: "Your plan is not active yet: set up the card payment on Billing & plan to send to your clients." };
  const key = trigger === "AUTOMATIC" ? `automatic:${ws.id}:${d.id}:${opts.leadDays}:${d.due_date}` : `manual:${ws.id}:${d.id}:${tpl.version}:${(opts.requestId ?? "").slice(0, 60) || Date.now()}`;
  const ins = await db()
    .from("onpoint_deliveries")
    .insert({
      workspace_id: ws.id,
      client_id: c.id,
      deadline_id: d.id,
      type: d.type,
      trigger,
      lead_days: opts.leadDays ?? null,
      template_version: tpl.version,
      from_name: ws.sender_name,
      to_email: test ? ws.test_inbox!.trim().toLowerCase() : to,
      intended_to: to,
      subject: r.subject,
      body: r.body,
      status: "queued",
      test,
      idem_key: key,
      requested_by: by,
    })
    .select("id")
    .single();
  if (ins.error) {
    if (/duplicate|23505/i.test(`${ins.error.code ?? ""} ${ins.error.message}`)) return { status: "duplicate", message: "This reminder has already been sent." };
    throw new OpError(ins.error.message, 500);
  }
  const deliveryId = (ins.data as { id: string }).id;

  /* 0271: the designed email (logo, deadline card, footer) */
  const look = (logo: string) =>
    emailHtml(r.body, {
      logoUrl: logo,
      sender: ws.custom_name || ws.sender_name,
      /* 0273: no uploaded logo → the sharp "P" mark with the name as text, instead of the small, blurry picture */
      brandName: ws.logo_data ? undefined : ws.custom_name || ws.sender_name,
      deadline: { type: r.typeName, company: c.name, uen: c.uen, due: d.due_date, today },
      banner: test ? `Safety check: this reminder goes to ${to} once it is switched to the client.` : undefined,
    });
  return dispatch(ws, { deliveryId, to, test, subject: r.subject, text: r.body, look, kind: "onpoint_reminder" });
}

/**
 * Send one email that already has its delivery row (0280: shared by filing and payment reminders).
 * The client's own connected Microsoft mailbox first (0270); the Zapier hook otherwise.
 */
async function dispatch(ws: Workspace, m: { deliveryId: string; to: string; test: boolean; subject: string; text: string; look: (logoUrl: string) => string; kind: string }): Promise<SendResult> {
  const hook = process.env.ONPOINT_HOOK_URL?.trim() ?? "";
  let ok = false;
  let error: string | null = null;
  const dest = m.test ? ws.test_inbox!.trim() : m.to;
  /* 0274: no uploaded logo → the name as text (sharp everywhere); an uploaded logo is shown as a picture */
  const html = m.look(ws.logo_data ? logoUrl(siteUrl("https://foundersdoc.com"), ws.logo_data) : "");
  if (await usesMailbox(ws.id)) {
    /* 0272: from the mailbox the logo travels inside the email, so it shows without "Show content" */
    const inline = ws.logo_data ? await logoImage(ws.logo_data) : null;
    ({ ok, error } = await sendFromMailbox(ws.id, { to: dest, subject: m.subject, html: inline ? m.look(`cid:${inline.cid}`) : html, inline }));
  } else if (!/^https:\/\/hooks\.zapier\.com\//.test(hook)) error = "Sending is not set up yet: connect the mailbox (or set ONPOINT_HOOK_URL).";
  else {
    try {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: m.kind,
          to: dest,
          subject: m.subject,
          text: m.test ? `[Safety check: this email goes to ${m.to} once it is switched to the client]\n\n${m.text}` : m.text,
          html,
          from_name: ws.sender_name,
          test: m.test,
          delivery_id: m.deliveryId,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      ok = res.ok;
      if (!ok) error = `The email Zap answered ${res.status}.`;
    } catch {
      error = "The email Zap could not be reached.";
    }
  }
  must(await db().from("onpoint_deliveries").update(ok ? { status: "sent", sent_at: new Date().toISOString() } : { status: "failed", error }).eq("id", m.deliveryId));
  return ok
    ? { status: "sent", message: m.test ? `Sent to ${ws.test_inbox} for a safety check (client: ${m.to}).` : `Sent to ${m.to}.`, delivery_id: m.deliveryId }
    : { status: "failed", message: error ?? "Not sent.", delivery_id: m.deliveryId };
}

/** The daily run: every active deadline whose days-to-due is one of its type's lead times. */
export interface RunTotals {
  checked: number;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}
const zero = (): RunTotals => ({ checked: 0, due: 0, sent: 0, skipped: 0, failed: 0 });
const count = (t: RunTotals, r: SendResult) => (r.status === "sent" ? t.sent++ : r.status === "failed" ? t.failed++ : t.skipped++);

/**
 * The daily run (8am Singapore), while "Automatic sending" is on (Founders Doc switches it on):
 * payment reminders on the days set on Payments (0282), and filing reminders if they are shown.
 */
export async function dailyRun(): Promise<RunTotals & { off?: boolean; payments: RunTotals; filing: RunTotals }> {
  const ws = await workspace();
  if (!ws.auto_send) return { ...zero(), off: true, payments: zero(), filing: zero() };
  const payments = ws.payments_enabled ? await paymentRun(ws).catch(() => zero()) : zero();
  const filing = ws.filing_enabled ? await filingRun(ws) : zero();
  const sum = (k: keyof RunTotals) => payments[k] + filing[k];
  return { checked: sum("checked"), due: sum("due"), sent: sum("sent"), skipped: sum("skipped"), failed: sum("failed"), payments, filing };
}

async function filingRun(ws: Workspace): Promise<RunTotals> {
  const leads = await schedules(ws.id);
  const today = sgToday();
  const live = await all<Pick<Deadline, "id" | "client_id" | "type" | "label" | "due_date" | "status">>((f, t) => db().from("onpoint_deadlines").select("id, client_id, type, label, due_date, status").eq("workspace_id", ws.id).eq("status", "active").gte("due_date", today).range(f, t));
  const t = zero();
  t.checked = live.length;
  for (const d of live) {
    const n = daysBetween(today, d.due_date);
    if (!leads[d.type]?.includes(n)) continue;
    t.due++;
    try {
      count(t, await sendReminder(ws, d.id, "AUTOMATIC", "daily run", { leadDays: n }));
    } catch {
      t.failed++;
    }
  }
  return t;
}

/** every unpaid invoice whose day it is (before, on or after the due date); each one once (0282) */
export async function paymentRun(ws: Workspace): Promise<RunTotals> {
  const today = sgToday();
  const open = await all<Invoice>((f, t) => db().from("onpoint_invoices").select(INV).eq("workspace_id", ws.id).eq("status", "open").range(f, t));
  const t = zero();
  t.checked = open.length;
  for (const v of open) {
    const a = autoTag(v, today, ws.pay_before, ws.pay_after);
    if (!a) continue;
    t.due++;
    try {
      count(t, await sendPayment(ws, v.id, "daily run", "", a));
    } catch {
      t.failed++;
    }
  }
  return t;
}

/* ── imports that can be undone (0282) ────────────────────────────────── */

/** the import's row first, so what it adds can point to it (link = false before supabase/141: it cannot be undone) */
async function openImport(m: Me, fileName: string, kind: string): Promise<{ id: number; link: boolean }> {
  const [p1, p2] = await Promise.all([db().from("onpoint_invoices").select("import_id").limit(1), db().from("onpoint_deadlines").select("import_id").limit(1)]);
  const r = await db().from("onpoint_imports").insert({ workspace_id: m.ws.id, file_name: fileName.slice(0, 200), kind, summary: { running: true }, imported_by: m.email }).select("id").single();
  if (r.error) throw new OpError(r.error.message, 500);
  return { id: (r.data as { id: number }).id, link: !p2.error && (!p1.error || !/import_id/.test(p1.error.message)) };
}
async function closeImport(id: number, summary: Record<string, unknown>) {
  must(await db().from("onpoint_imports").update({ summary }).eq("id", id));
}

/**
 * Undo an import done by mistake: the invoices and deadlines it added are removed (emails already sent stay in
 * the history). Clients and their emails stay; amounts or dates it changed on items that were already there stay.
 */
export async function undoImport(m: Me, importId: number) {
  const imp = must(await db().from("onpoint_imports").select("id, undone_at").eq("workspace_id", m.ws.id).eq("id", importId).maybeSingle()) as { id: number; undone_at?: string | null } | null;
  if (!imp) throw new OpError("That import is no longer there.", 404);
  if (imp.undone_at) throw new OpError("That import was already undone.", 409);
  const inv = await db().from("onpoint_invoices").delete().eq("workspace_id", m.ws.id).eq("import_id", importId).select("id");
  const dl = await db().from("onpoint_deadlines").delete().eq("workspace_id", m.ws.id).eq("import_id", importId).select("id");
  if ((inv.error && /import_id/.test(inv.error.message)) || (dl.error && /import_id/.test(dl.error.message))) throw new OpError("Undo needs supabase/141_onpoint_auto_undo.sql first.", 503);
  if (inv.error && !/onpoint_invoices/.test(inv.error.message)) throw new OpError(inv.error.message, 500);
  if (dl.error) throw new OpError(dl.error.message, 500);
  must(await db().from("onpoint_imports").update({ undone_at: new Date().toISOString(), undone_by: m.email }).eq("id", importId));
  return { invoices: (inv.data ?? []).length, deadlines: (dl.data ?? []).length };
}

/** the days of the automatic payment reminders (before / after the due date) */
export async function savePaySchedule(m: Me, before: number[], after: number[]) {
  const r = await db().from("onpoint_workspaces").update({ pay_before: before, pay_after: after, updated_at: new Date().toISOString() }).eq("id", m.ws.id);
  if (r.error) throw new OpError(/pay_before|pay_after/.test(r.error.message) ? "Run supabase/141_onpoint_auto_undo.sql first." : r.error.message, 503);
}

export const errorJson = (e: unknown) => {
  const status = e instanceof OpError ? e.status : 500;
  if (!(e instanceof OpError)) console.error("[onpoint]", e);
  return { body: { error: e instanceof OpError ? e.message : "Something went wrong. Please try again." }, status };
};

/* ── the logo inside the email (0272) ─────────────────────────────────── */

let defaultLogo: InlineImage | null = null;

/** the workspace's own logo, or the default OnPoint logo; null if neither can be read (the email then links it) */
export async function logoImage(logoData: string | null | undefined): Promise<InlineImage | null> {
  const m = /^data:(image\/(png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(logoData ?? "");
  if (m) return { cid: "onpoint-logo", name: `logo.${m[2] === "jpeg" ? "jpg" : "png"}`, contentType: m[1], base64: m[3] };
  if (defaultLogo) return defaultLogo;
  try {
    const res = await fetch(`${siteUrl("https://foundersdoc.com")}/onpoint/logo-mark.png`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/png")) return null;
    defaultLogo = { cid: "onpoint-logo", name: "logo-mark.png", contentType: "image/png", base64: Buffer.from(await res.arrayBuffer()).toString("base64") };
    return defaultLogo;
  } catch {
    return null;
  }
}

/* ── payment reminders (0280) ─────────────────────────────────────────── */

export const INV = "id, client_id, number, description, amount_cents, currency, issue_date, due_date, status, paid_on, source";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const notReady = (e: { message: string } | null) => (e && /onpoint_invoices|invoice_id|pay_subject|filing_enabled/.test(e.message) ? new OpError("Payment reminders are not switched on yet: run supabase/139_onpoint_payments.sql.", 503) : null);
const mustP = <T>(r: { data: T; error: { message: string } | null }): T => {
  const nr = notReady(r.error);
  if (nr) throw nr;
  return must(r);
};

export const payTemplate = (ws: Workspace) => ({ subject: ws.pay_subject?.trim() || DEFAULT_PAY.subject, body: ws.pay_body?.trim() || DEFAULT_PAY.body });

/** "1,234.50" / "S$ 1234.5" / 1234.5 → cents (positive, under a billion dollars) */
export function cents(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : String(v ?? "").replace(/[,\s]|S\$|\$|SGD/gi, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(parseFloat(s) * 100);
  return c > 0 && c < 100_000_000_000 ? c : null;
}

/** the client with this name (same key as the sheets), made if new; an email is only filled in where none is kept */
async function clientFor(wsId: string, name: string, email: string | null, contact: string | null): Promise<string> {
  const key = clientKey(name);
  if (!key) throw new OpError("Type the client's name.");
  const got = must(await db().from("onpoint_clients").select("id, contact_email, contact_name").eq("workspace_id", wsId).eq("key", key).maybeSingle()) as { id: string; contact_email: string | null; contact_name: string | null } | null;
  if (got) {
    if (email && !got.contact_email) must(await db().from("onpoint_clients").update({ contact_email: email, ...(contact && !got.contact_name ? { contact_name: contact } : {}), updated_at: new Date().toISOString() }).eq("id", got.id));
    return got.id;
  }
  const ins = must(await db().from("onpoint_clients").insert({ workspace_id: wsId, key, name: name.slice(0, 200), services: [], contact_email: email, contact_name: contact }).select("id").single()) as { id: string };
  return ins.id;
}

export async function addInvoice(m: Me, b: Record<string, unknown>) {
  const name = String(b.client_name ?? "").replace(/\s+/g, " ").trim();
  const clientId = String(b.client_id ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase() || null;
  const contact = String(b.contact_name ?? "").replace(/\s+/g, " ").trim().slice(0, 160) || null;
  const number = String(b.number ?? "").trim().slice(0, 60) || null;
  const description = String(b.description ?? "").trim().slice(0, 300) || null;
  const amount = cents(b.amount);
  const due = String(b.due_date ?? "");
  if (email && !EMAIL_RE.test(email)) throw new OpError("Check the client's email.");
  if (!amount) throw new OpError("Type the amount, e.g. 1200 or 1,200.50.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new OpError("Pick the due date.");
  let cid = clientId;
  if (cid) {
    const c = must(await db().from("onpoint_clients").select("id, contact_email").eq("workspace_id", m.ws.id).eq("id", cid).maybeSingle()) as { id: string; contact_email: string | null } | null;
    if (!c) throw new OpError("That client is no longer there.", 404);
    if (email && !c.contact_email) must(await db().from("onpoint_clients").update({ contact_email: email, ...(contact ? { contact_name: contact } : {}), updated_at: new Date().toISOString() }).eq("id", cid));
  } else cid = await clientFor(m.ws.id, name, email, contact);
  const r = await db()
    .from("onpoint_invoices")
    .insert({ workspace_id: m.ws.id, client_id: cid, number, description, amount_cents: amount, currency: /^[A-Z]{3}$/.test(String(b.currency ?? "")) ? String(b.currency) : "SGD", due_date: due, source: String(b.source ?? "").slice(0, 200) || "Added in the app", source_key: number ? `INV:${number.toLowerCase()}` : `MAN:${crypto.randomUUID()}`, created_by: m.email })
    .select("id")
    .single();
  if (r.error && /duplicate|23505/i.test(`${r.error.code ?? ""} ${r.error.message}`)) throw new OpError(`Invoice ${number} is already there.`, 409);
  return mustP(r) as { id: string };
}

export async function setInvoiceStatus(m: Me, id: string, status: string) {
  if (!["open", "paid", "cancelled"].includes(status)) throw new OpError("Unknown status.");
  const r = await db()
    .from("onpoint_invoices")
    .update({ status, paid_on: status === "paid" ? sgToday() : null, updated_at: new Date().toISOString() })
    .eq("workspace_id", m.ws.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (!mustP(r)) throw new OpError("That invoice is no longer there.", 404);
}

export async function savePayTemplate(m: Me, subject: string, body: string) {
  const s = subject.trim();
  const b = body.trim();
  if (!s || s.length > 300) throw new OpError("The subject must be 1 to 300 characters.");
  if (!b || b.length > 8000) throw new OpError("The email must be 1 to 8,000 characters.");
  const bad = renderPayment({ subject: s, body: b }, { company: "x", contact: null, number: null, description: null, amount_cents: 1, currency: "SGD", due: sgToday(), today: sgToday() }).unknown;
  if (bad.length) throw new OpError(`Not supported: ${bad.join(", ")}`);
  mustP(await db().from("onpoint_workspaces").update({ pay_subject: s, pay_body: b, updated_at: new Date().toISOString() }).eq("id", m.ws.id));
}

/** 0290: payment reminders shown or hidden (optional) */
export async function setPayments(m: Me, on: boolean) {
  const r = await db().from("onpoint_workspaces").update({ payments_enabled: on, updated_at: new Date().toISOString() }).eq("id", m.ws.id);
  if (r.error) throw new OpError(/payments_enabled/.test(r.error.message) ? "Run supabase/144_onpoint_deadlines_first.sql first." : r.error.message, 503);
}

export async function setFiling(m: Me, on: boolean) {
  mustP(await db().from("onpoint_workspaces").update({ filing_enabled: on, updated_at: new Date().toISOString() }).eq("id", m.ws.id));
}

/** an invoice list → invoices (new ones added, known ones refreshed; one marked paid in the app stays paid) */
export async function applyInvoiceImport(m: Me, fileName: string, list: InvoiceList) {
  const id = m.ws.id;
  const now = new Date().toISOString();
  const known = await all<{ id: string; key: string; contact_email: string | null }>((f, t) => db().from("onpoint_clients").select("id, key, contact_email").eq("workspace_id", id).range(f, t));
  const idOf = new Map(known.map((c) => [c.key, c.id]));
  const hasMail = new Map(known.map((c) => [c.key, !!c.contact_email]));
  /* new clients, once each */
  const fresh = new Map<string, { workspace_id: string; key: string; name: string; services: string[]; contact_email: string | null; contact_name: string | null; updated_at: string }>();
  for (const v of list.invoices) if (!idOf.has(v.client_key) && !fresh.has(v.client_key)) fresh.set(v.client_key, { workspace_id: id, key: v.client_key, name: v.client.slice(0, 200), services: [], contact_email: v.email, contact_name: v.contact, updated_at: now });
  const freshRows = [...fresh.values()];
  for (let i = 0; i < freshRows.length; i += 500) {
    const ins = must(await db().from("onpoint_clients").insert(freshRows.slice(i, i + 500)).select("id, key")) as Array<{ id: string; key: string }>;
    for (const c of ins) idOf.set(c.key, c.id);
  }
  /* emails from the list, only where none is kept */
  let emails = 0;
  const done = new Set<string>();
  for (const v of list.invoices) {
    if (!v.email || hasMail.get(v.client_key) !== false || done.has(v.client_key)) continue;
    done.add(v.client_key);
    must(await db().from("onpoint_clients").update({ contact_email: v.email, ...(v.contact ? { contact_name: v.contact } : {}), updated_at: now }).eq("id", idOf.get(v.client_key)!));
    emails++;
  }
  /* what we already have: an invoice paid or removed in the app stays so */
  const keys = list.invoices.map((v) => v.source_key);
  const had = new Map<string, { status: string; paid_on: string | null }>();
  for (let i = 0; i < keys.length; i += 100) {
    const got = (mustP(await db().from("onpoint_invoices").select("source_key, status, paid_on").eq("workspace_id", id).in("source_key", keys.slice(i, i + 100))) ?? []) as Array<{ source_key: string; status: string; paid_on: string | null }>;
    for (const g of got) had.set(g.source_key, g);
  }
  const source = `Invoice list · ${fileName.replace(/\.(xlsx|csv)$/i, "").slice(0, 120)}`;
  const rows = list.invoices
    .filter((v) => idOf.has(v.client_key))
    .map((v) => ({
      workspace_id: id,
      client_id: idOf.get(v.client_key)!,
      number: v.number,
      description: v.description,
      amount_cents: v.amount_cents,
      currency: v.currency,
      issue_date: v.issue_date,
      due_date: v.due_date,
      status: had.get(v.source_key)?.status ?? "open",
      paid_on: had.get(v.source_key)?.paid_on ?? null,
      source,
      source_key: v.source_key,
      created_by: m.email,
      updated_at: now,
    }));
  /* 0282: a new invoice remembers this import, so the import can be undone; known ones keep theirs */
  const imp = await openImport(m, fileName, "Invoice list");
  const newRows = rows.filter((r) => !had.has(r.source_key)).map((r) => (imp.link ? { ...r, import_id: imp.id } : r));
  const oldRows = rows.filter((r) => had.has(r.source_key));
  for (const part of [newRows, oldRows]) for (let i = 0; i < part.length; i += 500) mustP(await db().from("onpoint_invoices").upsert(part.slice(i, i + 500), { onConflict: "workspace_id,source_key" }));
  /* shown as paid in the list → paid here */
  let paid = 0;
  const paidKeys = [...new Set(list.paid)];
  for (let i = 0; i < paidKeys.length; i += 100) {
    const r = mustP(await db().from("onpoint_invoices").update({ status: "paid", paid_on: sgToday(), updated_at: now }).eq("workspace_id", id).eq("status", "open").in("source_key", paidKeys.slice(i, i + 100)).select("id")) as unknown[] | null;
    paid += r?.length ?? 0;
  }
  const summary = { invoices: rows.length, added: rows.filter((r) => !had.has(r.source_key)).length, new_clients: freshRows.length, emails, marked_paid: paid, skipped: list.skipped.slice(0, 50) };
  await closeImport(imp.id, summary);
  return { ...summary, import_id: imp.id };
}

/** Send one payment reminder now (a button; automatic payment reminders come later). Same safeguards as filing. */
export async function sendPayment(ws: Workspace, invoiceId: string, by: string, requestId: string, auto?: { tag: string; lead: number }): Promise<SendResult> {
  const v = mustP(await db().from("onpoint_invoices").select(INV).eq("workspace_id", ws.id).eq("id", invoiceId).maybeSingle()) as Invoice | null;
  if (!v) return { status: "blocked", message: "That invoice is no longer there." };
  if (v.status !== "open") return { status: "blocked", message: "That invoice is already paid or removed." };
  const c = must(await db().from("onpoint_clients").select("id, name, contact_name, contact_email, active").eq("id", v.client_id).maybeSingle()) as Client | null;
  if (!c || !c.active) return { status: "blocked", message: "That client is not active." };
  const to = (c.contact_email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(to)) return { status: "blocked", message: `${c.name} has no email address on file.` };
  const today = sgToday();
  const r = renderPayment(payTemplate(ws), { company: c.name, contact: c.contact_name, number: v.number, description: v.description, amount_cents: v.amount_cents, currency: v.currency, due: v.due_date, today });
  if (r.unknown.length) return { status: "blocked", message: `The email has unsupported tokens: ${r.unknown.join(", ")}.` };
  if (!auto) {
    const since = new Date(Date.now() - 120_000).toISOString();
    const recent = must(await db().from("onpoint_deliveries").select("id").eq("invoice_id", v.id).in("status", ["queued", "sent"]).gte("requested_at", since).limit(1));
    if ((recent as unknown[]).length) return { status: "duplicate", message: "This reminder was just sent." };
  }
  const test = !!ws.test_inbox?.trim();
  /* 0283: once card payment is open, reminders reach clients only with an active plan (test mode always works) */
  if (!test && !(await import("./billing").then((b) => b.planState(ws.id).then(b.liveAllowed)))) return { status: "blocked", message: "Your plan is not active yet: set up the card payment on Billing & plan to send to your clients." };
  const ins = await db()
    .from("onpoint_deliveries")
    .insert({
      workspace_id: ws.id,
      client_id: c.id,
      invoice_id: v.id,
      type: "PAYMENT",
      trigger: auto ? "AUTOMATIC" : "MANUAL",
      lead_days: auto?.lead ?? null,
      from_name: ws.sender_name,
      to_email: test ? ws.test_inbox!.trim().toLowerCase() : to,
      intended_to: to,
      subject: r.subject,
      body: r.body,
      status: "queued",
      test,
      /* automatic: once per invoice, due date and day (a second run the same day, or a retry, sends nothing) */
      idem_key: auto ? `payauto:${ws.id}:${v.id}:${v.due_date}:${auto.tag}` : `pay:${ws.id}:${v.id}:${requestId.slice(0, 60) || Date.now()}`,
      requested_by: by,
    })
    .select("id")
    .single();
  if (ins.error) {
    if (/duplicate|23505/i.test(`${ins.error.code ?? ""} ${ins.error.message}`)) return { status: "duplicate", message: "This reminder has already been sent." };
    throw notReady(ins.error) ?? new OpError(ins.error.message, 500);
  }
  const look = (logo: string) =>
    paymentHtml(r.body, {
      logoUrl: logo,
      sender: ws.custom_name || ws.sender_name,
      brandName: ws.logo_data ? undefined : ws.custom_name || ws.sender_name,
      company: c.name,
      number: v.number,
      description: v.description,
      amount_cents: v.amount_cents,
      currency: v.currency,
      due: v.due_date,
      today,
      banner: test ? `Safety check: this reminder goes to ${to} once it is switched to the client.` : undefined,
    });
  return dispatch(ws, { deliveryId: (ins.data as { id: string }).id, to, test, subject: r.subject, text: r.body, look, kind: "onpoint_payment_reminder" });
}

/** 0285: the document drafting add-on: tell Founders Doc (Slack, if set up) and remember it was asked */
export async function enquireAddon(m: Me, note: string) {
  const at = new Date().toISOString();
  const r = await db().from("onpoint_workspaces").update({ addon_enquired_at: at, addon_enquired_by: m.email }).eq("id", m.ws.id);
  if (r.error) throw new OpError(/addon_enquired/.test(r.error.message) ? "Run supabase/142_onpoint_client_notes_addon.sql first." : r.error.message, 503);
  const channel = process.env.ONPOINT_SLACK_CHANNEL?.trim();
  if (channel) {
    const { teamNotice } = await import("@/lib/sign/slack");
    await teamNotice(`📝 OnPoint asked about the document drafting & review add-on (${m.email})${note ? `: ${note.slice(0, 300)}` : ""}`, channel).catch(() => false);
  }
  return { at };
}

/* ── PDF invoices (0286) ──────────────────────────────────────────────── */

/**
 * Read a PDF for the person to check; nothing is added yet. 0287: a PDF that lists many invoices in a table (an
 * invoice list, an aged receivables report, a statement) gives one draft per row; otherwise one invoice.
 */
export async function readPdfInvoice(m: Me, buf: Buffer): Promise<{ table: boolean; drafts: PdfDraft[]; notes: string[] }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const { parseInvoiceText, readInvoiceList, tableFromPdf } = await import("./payments");
  let text = "";
  const pages: PdfItem[][] = [];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    text = String((await extractText(pdf, { mergePages: true })).text ?? "");
    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      pages.push(
        (tc.items as Array<{ str?: string; transform?: number[]; width?: number }>)
          .filter((t) => typeof t.str === "string" && t.transform)
          .map((t) => ({ str: t.str!, x: t.transform![4], y: t.transform![5], w: t.width ?? 0 })),
      );
    }
  } catch {
    /* not readable: the single-invoice reading below says so */
  }
  const clients = await all<{ id: string; name: string; key: string; contact_email: string | null }>((f, t) => db().from("onpoint_clients").select("id, name, key, contact_email").eq("workspace_id", m.ws.id).range(f, t));
  const w = (await db().from("onpoint_workspaces").select("mail_address").eq("id", m.ws.id).maybeSingle()).data as { mail_address?: string | null } | null;
  const own = {
    names: [m.ws.name, m.ws.custom_name ?? "", m.ws.sender_name].filter(Boolean),
    emails: [m.ws.sender_email ?? "", w?.mail_address ?? "", m.email].map((e) => e.toLowerCase()).filter(Boolean),
  };
  const single = parseInvoiceText(text, clients, own);
  const rows = tableFromPdf(pages);
  const list = rows ? readInvoiceList([{ name: "PDF table", rows }], "PDF") : null;
  if (!list || list.invoices.length < 2) return { table: false, drafts: [single], notes: [] };
  const byKey = new Map(clients.map((c) => [c.key, c]));
  const ownKeys = own.names.map(clientKey);
  const drafts: PdfDraft[] = list.invoices.map((v) => {
    /* no client on the row (a statement for one client): the client named on the PDF */
    const name = v.client && !ownKeys.includes(v.client_key) ? v.client : single.client;
    const k = byKey.get(clientKey(name));
    const problems: string[] = [];
    if (!name) problems.push("Client not found: type the name.");
    else if (!k) problems.push("New client (not in your list yet): check the name.");
    return { client: k?.name ?? name, client_id: k?.id ?? null, email: v.email ?? k?.contact_email ?? null, number: v.number, description: v.description, amount_cents: v.amount_cents, currency: v.currency, due_date: v.due_date, issue_date: v.issue_date, problems };
  });
  const notes = [
    ...(list.paid.length ? [`${list.paid.length} row${list.paid.length === 1 ? "" : "s"} shown as paid: left out.`] : []),
    ...list.skipped.slice(0, 5),
  ];
  return { table: true, drafts, notes };
}

/* ── feedback, page by page (0291) ─────────────────────────────────────── */

export async function addFeedback(m: Me, page: string, message: string) {
  const text = message.trim().slice(0, 4000);
  if (!text) throw new OpError("Type your comment first.");
  const r = await db().from("onpoint_feedback").insert({ workspace_id: m.ws.id, page: page.slice(0, 40) || "general", message: text, created_by: m.email }).select("id").single();
  if (r.error) throw new OpError(/onpoint_feedback/.test(r.error.message) ? "Run supabase/145_onpoint_feedback.sql first." : r.error.message, 503);
  const channel = process.env.ONPOINT_SLACK_CHANNEL?.trim();
  if (channel && !m.founder) {
    const { teamNotice } = await import("@/lib/sign/slack");
    await teamNotice(`💬 OnPoint feedback on ${page} (${m.email}): ${text.slice(0, 500)}`, channel).catch(() => false);
  }
  return r.data as { id: string };
}

export async function markFeedback(m: Me, id: string, done: boolean) {
  if (!m.founder) throw new OpError("Only Founders Doc marks feedback done.", 403);
  const r = await db().from("onpoint_feedback").update({ status: done ? "done" : "new", done_at: done ? new Date().toISOString() : null }).eq("workspace_id", m.ws.id).eq("id", id);
  if (r.error) throw new OpError(r.error.message, 500);
}
