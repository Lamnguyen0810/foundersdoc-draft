import { addYears, daysBetween, fmtDay, parseDay } from "@/lib/esop/vesting";
import { SIGN_PLANS, biggerPlan, type SignTier } from "@/lib/billing/sign-plans";
import { isQuietAccount } from "@/lib/quiet";

/**
 * The master dashboard's figures (0244): FD Sign and every ESOP dashboard on one page, for
 * Founders Doc admins (/admin/master).
 *
 * Pure code: rows in, figures out, so the page and the tests agree on one answer
 * (figures.test.ts). The rows are read by load.ts.
 *
 * TWO RULES THE FIGURES KEEP
 *   1. People's own signing requests stay private (SQL 119). Nothing here takes a request's
 *      title, its file or its signers' names or emails: the rows do not carry them. A request
 *      is known by its sender's account and each signer by their place ("signer 2 of 3").
 *      Founders Doc's own requests are named by their ESOP vesting (B8-T2), never by title,
 *      because a certificate's title carries the holder's name.
 *   2. Test activity is kept apart from real activity: the team's own test accounts
 *      (lib/quiet.ts) and ESOP simulations (a company with a simulation inbox, or a vesting
 *      approved in simulation). It is counted, in its own line, and never mixed in.
 *
 * WHAT CAN BE DONE FROM THE PAGE (0250). Three things, each decided here so the page and the
 * tests agree (Action.act):
 *   - remind the signer of one of Founders Doc's OWN requests who has waited more than 2 days.
 *     Never for a person's own request: that stays theirs to chase;
 *   - send the approval email for a coming vesting of a company Founders Doc runs;
 *   - mark an approved vesting of such a company as paid.
 * Everything else is still done on the page the row links to.
 */

/* ── the rows ──────────────────────────────────────────────────────────────── */

export interface MEnvelope {
  id: string;
  status: "sent" | "completed" | "voided";
  created_at: string;
  completed_at: string | null;
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  esop_holder_id: string | null;
  esop_tranche: number | null;
}
/** The signers of the requests that are still open. */
export interface MSigner {
  envelope_id: string;
  position: number;
  status: "waiting" | "invited" | "signed";
  invited_at: string | null;
  viewed_at: string | null;
}
export interface MCompany {
  id: string;
  slug: string;
  name: string;
  plan: "free" | "premium";
  /** made by the client themselves; false = set up and run by Founders Doc (payment step, certificates made for them) */
  self_serve: boolean;
  /** a simulation inbox is set: every email goes there */
  simulation: boolean;
}
export interface MBatch {
  company_id: string;
  batch: number;
  vesting_start: string | null;
  tranches: number;
}
export interface MHolder {
  id: string;
  company_id: string;
  batch: number;
  status: "Active" | "Leaver";
}
export interface MRun {
  company_id: string;
  ref: string;
  approved_at: string;
  sent_at: string | null;
  paid_at: string | null;
  simulation: boolean;
}
/** A certificate on a holder's record (uploaded, or filed by FD Sign). */
export interface MCertificate {
  holder_id: string;
  tranche: number | null;
}
/** A vesting someone was told about: the Zap's Slack alert, or the dashboard's own alert emails. */
export interface MAlert {
  company_id: string;
  ref: string;
}
/** The approver's open Modify or Cancel from the approval email (SQL 129). */
export interface MRequest {
  company_id: string;
  ref: string;
  kind: "modify" | "cancel";
}
export interface MSubscription {
  user_id: string;
  tier: string;
}
/** A reminder emailed to the signer of one of Founders Doc's open requests (when, never to whom). */
export interface MReminder {
  envelope_id: string;
  at: string;
}
/** An approval email made for a vesting (by the dashboard's button or the daily alert): when, never to whom. */
export interface MApprovalEmail {
  company_id: string;
  ref: string;
  created_at: string;
}

export interface MasterRows {
  envelopes: MEnvelope[];
  signers: MSigner[];
  companies: MCompany[];
  batches: MBatch[];
  holders: MHolder[];
  runs: MRun[];
  certificates: MCertificate[];
  alerts: MAlert[];
  requests: MRequest[];
  subscriptions: MSubscription[];
  reminders: MReminder[];
  approvalEmails: MApprovalEmail[];
}

/* ── the figures ───────────────────────────────────────────────────────────── */

export type ActionKind = "stalled" | "request" | "unapproved" | "unpaid" | "unsigned";
/** What the page can do about a line, there and then (0250). */
export type ActionDo =
  /** email the signer of Founders Doc's own request(s) again */
  | { type: "remind"; envelopes: string[] }
  /** email the company's approver the approval email; `again` = one was already sent */
  | { type: "approval-email"; company: string; ref: string; again: boolean; simulation: boolean }
  /** mark the vesting as paid */
  | { type: "paid"; company: string; ref: string };
export interface Action {
  kind: ActionKind;
  /** "err" = late or needs someone today; "warn" = coming up */
  tone: "err" | "warn";
  title: string;
  detail: string;
  /** where to act; none for people's own requests, which stay theirs */
  href: string | null;
  /** what can be done from the page itself; null = open the page it links to */
  act: ActionDo | null;
}

export interface SignWindow {
  label: string;
  sent: number;
  completed: number;
  cancelled: number;
  /** of "sent": people's own requests, the rest are Founders Doc's (ESOP certificates and others) */
  own: number;
}
export interface PlanRow {
  tier: SignTier;
  label: string;
  senders: number;
  requests: number;
}
export interface SignFigures {
  windows: SignWindow[];
  openNow: number;
  stalledNow: number;
  /** requests completed in the last 30 days: hours from sent to fully signed */
  timeToSign: { count: number; averageHours: number | null; medianHours: number | null };
  byPlan: PlanRow[];
}

export interface VestingStatus {
  ref: string;
  batch: number;
  tranche: number;
  date: string;
  daysLeft: number;
  certificates: number;
  alerted: boolean;
  approved: boolean;
  /** approved in a simulation only: a rehearsal, not an approval */
  rehearsed: boolean;
  /** null = this dashboard has no payment step */
  paid: boolean | null;
  signed: number;
  done: boolean;
  request: "modify" | "cancel" | null;
  /** when the latest approval email for it was made; null = none yet */
  approvalEmailAt: string | null;
}
export interface EsopRow {
  slug: string;
  name: string;
  managed: boolean;
  plan: "free" | "premium";
  simulation: boolean;
  active: number;
  leavers: number;
  /** the vesting to look at: one in progress, or else the next one */
  focus: VestingStatus | null;
}

export interface Master {
  at: string;
  actions: Action[];
  sign: SignFigures;
  esop: EsopRow[];
  /** test accounts and simulations: counted here, left out of everything above */
  test: { sent30: number; openNow: number; stalledNow: number };
}

/* ── time ──────────────────────────────────────────────────────────────────── */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A signer whose turn came this long ago and who hasn't signed is "waiting" (the same 2 days as the daily Slack summary). */
export const STALLED_DAYS = 2;
/** A vesting this close without an approval needs someone. */
export const SOON_DAYS = 14;
/** How far back a vesting that was never approved is still raised. */
export const LATE_DAYS = 30;
/** How far back a vesting that was approved, but not finished, is still raised. */
export const OPEN_DAYS = 60;

/** Today's date in Singapore, as a local midnight (what lib/esop/vesting's day arithmetic works in). */
export function singaporeDay(now: Date): Date {
  const s = new Date(now.getTime() + 8 * HOUR);
  return new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
}
/** The moment today began in Singapore. */
export function singaporeMidnight(now: Date): number {
  const s = new Date(now.getTime() + 8 * HOUR);
  s.setUTCHours(0, 0, 0, 0);
  return s.getTime() - 8 * HOUR;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const when = (daysLeft: number) => (daysLeft === 0 ? "today" : daysLeft > 0 ? `in ${plural(daysLeft, "day")}` : `${plural(-daysLeft, "day")} ago`);
const refOf = (batch: number, tranche: number) => `B${batch}-T${tranche}`;
/** "less than an hour ago", "5 hours ago", "3 days ago": how long since something was sent. */
export function agoText(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso);
  if (!(ms >= HOUR)) return "less than an hour ago";
  if (ms < DAY) return `${plural(Math.floor(ms / HOUR), "hour")} ago`;
  return `${plural(Math.floor(ms / DAY), "day")} ago`;
}

/* ── ESOP ──────────────────────────────────────────────────────────────────── */

/** Every vesting of one company from OPEN_DAYS ago onwards, with where it stands. */
export function vestings(c: MCompany, rows: MasterRows, now: Date): VestingStatus[] {
  const today = singaporeDay(now);
  const holders = rows.holders.filter((h) => h.company_id === c.id);
  const runs = new Map(rows.runs.filter((r) => r.company_id === c.id).map((r) => [r.ref, r]));
  const alerted = new Set(rows.alerts.filter((a) => a.company_id === c.id).map((a) => a.ref));
  const requests = new Map(rows.requests.filter((r) => r.company_id === c.id).map((r) => [r.ref, r.kind]));
  const emailed = new Map<string, string>();
  for (const a of rows.approvalEmails) if (a.company_id === c.id && a.created_at > (emailed.get(a.ref) ?? "")) emailed.set(a.ref, a.created_at);
  /* a holder's certificate for a tranche is in hand once FD Sign has it fully signed, or it is on their record */
  const have = new Set<string>();
  for (const e of rows.envelopes) if (e.status === "completed" && e.esop_holder_id && e.esop_tranche) have.add(`${e.esop_holder_id}|${e.esop_tranche}`);
  for (const d of rows.certificates) if (d.tranche) have.add(`${d.holder_id}|${d.tranche}`);

  const out: VestingStatus[] = [];
  for (const b of rows.batches.filter((x) => x.company_id === c.id)) {
    if (!b.vesting_start || !parseDay(b.vesting_start)) continue;
    const active = holders.filter((h) => h.status === "Active" && h.batch === b.batch);
    for (let t = 1; t <= b.tranches; t++) {
      const date = addYears(b.vesting_start, t);
      const daysLeft = daysBetween(today, parseDay(date)!);
      if (daysLeft < -OPEN_DAYS) continue;
      const ref = refOf(b.batch, t);
      const run = runs.get(ref);
      const approved = !!run && !run.simulation;
      const paid = c.self_serve ? null : approved && !!run?.paid_at;
      const signed = active.filter((h) => have.has(`${h.id}|${t}`)).length;
      out.push({
        ref,
        batch: b.batch,
        tranche: t,
        date,
        daysLeft,
        certificates: active.length,
        alerted: alerted.has(ref),
        approved,
        rehearsed: !!run?.simulation,
        paid,
        signed,
        /* finished once it is approved and every certificate is in hand (certificates only go out once paid,
           so a vesting from before the Paid step existed is not held open by it) */
        done: approved && active.length > 0 && signed >= active.length,
        request: requests.get(ref) ?? null,
        approvalEmailAt: emailed.get(ref) ?? null,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.batch - b.batch);
}

/** Is this vesting somebody's job right now? */
function inProgress(v: VestingStatus): boolean {
  if (!v.certificates || v.done || v.request === "cancel") return false;
  if (v.approved) return true; /* approved and not finished, within OPEN_DAYS */
  return v.daysLeft >= -LATE_DAYS && v.daysLeft <= SOON_DAYS;
}

export function esopRow(c: MCompany, rows: MasterRows, now: Date, all: VestingStatus[] = vestings(c, rows, now)): EsopRow {
  const holders = rows.holders.filter((h) => h.company_id === c.id);
  const focus = all.find(inProgress) ?? all.find((v) => v.daysLeft >= 0 && v.certificates > 0 && !v.done && v.request !== "cancel") ?? null;
  return {
    slug: c.slug,
    name: c.name,
    managed: !c.self_serve,
    plan: c.plan,
    simulation: c.simulation,
    active: holders.filter((h) => h.status === "Active").length,
    leavers: holders.filter((h) => h.status === "Leaver").length,
    focus,
  };
}

/** Where a vesting stands, in a few words. */
export function stageText(v: VestingStatus, managed: boolean): string {
  if (v.done) return "Done";
  if (v.request === "cancel") return "Cancelled by the approver";
  if (v.request === "modify") return "Change asked for";
  const certs = `${v.signed} of ${plural(v.certificates, "certificate")} ${managed ? "signed" : "on file"}`;
  if (managed) {
    if (v.paid) return certs;
    if (v.approved) return "Approved, waiting for payment";
  } else if (v.approved) return certs;
  if (v.rehearsed) return "Rehearsed in simulation, not approved";
  if (v.daysLeft < 0) return "Vested, not approved";
  return v.alerted ? "Alert sent, not approved" : "Coming up";
}

/** The steps of a vesting, for the row's progress marks: [label, reached]. */
export function steps(v: VestingStatus, managed: boolean): Array<[string, boolean]> {
  const out: Array<[string, boolean]> = [
    ["Alert", v.alerted || v.approved],
    ["Approved", v.approved],
  ];
  if (managed) out.push(["Paid", v.paid === true]);
  out.push(["Certificates", v.done]);
  return out;
}

function esopActions(row: EsopRow, all: VestingStatus[], now: Date): Action[] {
  const out: Action[] = [];
  const href = `/esop/${row.slug}`;
  const sim = row.simulation ? " · simulation is on" : "";
  for (const v of all) {
    if (!v.certificates || v.done) continue;
    const head = `${row.name} · ${v.ref}`;
    const vests = `vests ${fmtDay(v.date)} (${when(v.daysLeft)})`;
    if (v.request === "cancel") continue;
    if (v.request === "modify") {
      out.push({ kind: "request", tone: "err", title: `${head}: the approver asked for a change`, detail: `${plural(v.certificates, "certificate")} · ${vests}${sim}`, href, act: null });
      continue;
    }
    if (!v.approved) {
      if (v.daysLeft > SOON_DAYS || v.daysLeft < -LATE_DAYS) continue;
      out.push({
        kind: "unapproved",
        tone: v.daysLeft <= 3 ? "err" : "warn",
        title: `${head}: not approved yet`,
        detail: `${plural(v.certificates, "certificate")} · ${vests}${v.rehearsed ? " · rehearsed in simulation only" : ""}${v.approvalEmailAt ? ` · approval email sent ${agoText(v.approvalEmailAt, now)}` : ""}${sim}`,
        href,
        /* only where Founders Doc runs the dashboard (a self-serve company chases its own approver), and not
           for a vesting rehearsed in simulation: that one has to be reset on its dashboard first */
        act: row.managed && !v.rehearsed ? { type: "approval-email", company: row.slug, ref: v.ref, again: !!v.approvalEmailAt, simulation: row.simulation } : null,
      });
    } else if (row.managed && !v.paid) {
      out.push({ kind: "unpaid", tone: v.daysLeft < 0 ? "err" : "warn", title: `${head}: approved, not paid`, detail: `${plural(v.certificates, "certificate")} wait for the payment · ${vests}${sim}`, href, act: { type: "paid", company: row.slug, ref: v.ref } });
    } else if (v.signed < v.certificates) {
      const left = v.certificates - v.signed;
      out.push({
        kind: "unsigned",
        tone: v.daysLeft < 0 ? "err" : "warn",
        title: `${head}: ${plural(left, "certificate")} still to ${row.managed ? "sign" : "file"}`,
        detail: `${v.signed} of ${v.certificates} ${row.managed ? "signed" : "on file"} · ${vests}${sim}`,
        href,
        act: null,
      });
    }
  }
  return out;
}

/* ── FD Sign ───────────────────────────────────────────────────────────────── */

/** Which requests are test activity: a test account's own, or an ESOP certificate sent in a simulation. */
export function testEnvelopes(rows: MasterRows): Set<string> {
  const holder = new Map(rows.holders.map((h) => [h.id, h]));
  const simCompany = new Set(rows.companies.filter((c) => c.simulation).map((c) => c.id));
  const runs = new Map(rows.runs.map((r) => [`${r.company_id}|${r.ref}`, r]));
  const out = new Set<string>();
  for (const e of rows.envelopes) {
    if (isQuietAccount(e.owner_email)) {
      out.add(e.id);
      continue;
    }
    const h = e.esop_holder_id ? holder.get(e.esop_holder_id) : undefined;
    if (!h || !e.esop_tranche) continue;
    const run = runs.get(`${h.company_id}|${refOf(h.batch, e.esop_tranche)}`);
    const inSimRun = !!run?.simulation && Date.parse(e.created_at) >= Date.parse(run.approved_at) - 60_000;
    if (inSimRun || simCompany.has(h.company_id)) out.add(e.id);
  }
  return out;
}

interface Waiting {
  envelope: MEnvelope;
  position: number;
  of: number;
  opened: boolean;
  days: number;
}

/** Open requests where the signer whose turn it is has waited more than STALLED_DAYS. */
function waiting(rows: MasterRows, now: Date): Waiting[] {
  const env = new Map(rows.envelopes.map((e) => [e.id, e]));
  const count = new Map<string, number>();
  for (const s of rows.signers) count.set(s.envelope_id, (count.get(s.envelope_id) ?? 0) + 1);
  const out: Waiting[] = [];
  for (const s of rows.signers) {
    const e = env.get(s.envelope_id);
    if (!e || e.status !== "sent" || s.status !== "invited" || !s.invited_at) continue;
    const ms = now.getTime() - Date.parse(s.invited_at);
    if (!(ms > STALLED_DAYS * DAY)) continue;
    out.push({ envelope: e, position: s.position, of: count.get(e.id) ?? 1, opened: !!s.viewed_at, days: Math.floor(ms / DAY) });
  }
  return out.sort((a, b) => b.days - a.days);
}

function signActions(list: Waiting[], rows: MasterRows, now: Date): Action[] {
  const reminded = new Map<string, string>();
  for (const r of rows.reminders) if (r.at > (reminded.get(r.envelope_id) ?? "")) reminded.set(r.envelope_id, r.at);
  const holder = new Map(rows.holders.map((h) => [h.id, h]));
  const company = new Map(rows.companies.map((c) => [c.id, c]));
  /* certificates of one vesting waiting on the same signer are one line, not one each */
  const groups = new Map<string, { title: string; href: string | null; ours: boolean; items: Waiting[] }>();
  for (const w of list) {
    const e = w.envelope;
    const place = w.of > 1 ? `signer ${w.position} of ${w.of}` : "the signer";
    let key = e.id;
    let title: string;
    let href: string | null = null;
    if (e.owner_email) {
      title = `${(e.owner_name?.trim() || e.owner_email.split("@")[0]).slice(0, 80)}'s request · ${place}`;
    } else {
      const h = e.esop_holder_id ? holder.get(e.esop_holder_id) : undefined;
      const c = h ? company.get(h.company_id) : undefined;
      if (h && e.esop_tranche) {
        const ref = refOf(h.batch, e.esop_tranche);
        key = `${h.company_id}|${ref}|${w.position}`;
        title = `${c?.name ?? "ESOP"} · ${ref} certificates · ${place}`;
        href = "/admin/sign?tab=sent";
      } else {
        title = `Founders Doc request · ${place}`;
        href = `/fd-sign/d/${e.id}`;
      }
    }
    const g = groups.get(key) ?? { title, href, ours: !e.owner_email, items: [] };
    g.items.push(w);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const days = Math.max(...g.items.map((i) => i.days));
    const opened = g.items.filter((i) => i.opened).length;
    const state = g.items.length === 1 ? (opened ? "opened, not signed" : "not opened") : `${plural(g.items.length, "document")} waiting, ${opened} opened`;
    const last = g.items.map((i) => reminded.get(i.envelope.id) ?? "").sort().pop();
    return {
      kind: "stalled" as const,
      tone: days >= 7 ? ("err" as const) : ("warn" as const),
      title: g.title,
      detail: `${state} · ${plural(days, "day")}${last ? ` · reminded ${agoText(last, now)}` : ""}`,
      href: g.href,
      /* Founders Doc's own requests only: a person's own request is theirs to chase */
      act: g.ours ? { type: "remind" as const, envelopes: g.items.map((i) => i.envelope.id) } : null,
    };
  });
}

const TIER_ORDER: SignTier[] = ["none", "sign_personal", "sign_standard", "sign_business", "basic", "pro", "unlimited"];

function signFigures(rows: MasterRows, test: Set<string>, stalled: Waiting[], now: Date): SignFigures {
  const real = rows.envelopes.filter((e) => !test.has(e.id));
  const t = now.getTime();
  const since = (ms: number, label: string): SignWindow => {
    const sent = real.filter((e) => Date.parse(e.created_at) >= ms);
    return {
      label,
      sent: sent.length,
      completed: real.filter((e) => e.status === "completed" && e.completed_at && Date.parse(e.completed_at) >= ms).length,
      cancelled: sent.filter((e) => e.status === "voided").length,
      own: sent.filter((e) => !!e.owner_email).length,
    };
  };
  const month = t - 30 * DAY;
  const hours = real
    .filter((e) => e.status === "completed" && e.completed_at && Date.parse(e.completed_at) >= month)
    .map((e) => (Date.parse(e.completed_at!) - Date.parse(e.created_at)) / HOUR)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  const median = hours.length ? (hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2) : null;

  /* senders by plan: each account that sent a request of its own in the last 30 days */
  const tier = new Map<string, SignTier>();
  for (const s of rows.subscriptions) {
    if (!(s.tier in SIGN_PLANS)) continue;
    tier.set(s.user_id, biggerPlan(tier.get(s.user_id) ?? "none", s.tier as SignTier));
  }
  const senders = new Map<string, { tier: SignTier; requests: number }>();
  for (const e of real) {
    if (!e.owner_email || Date.parse(e.created_at) < month) continue;
    const who = e.owner_id ?? e.owner_email.toLowerCase();
    const s = senders.get(who) ?? { tier: (e.owner_id && tier.get(e.owner_id)) || "none", requests: 0 };
    s.requests++;
    senders.set(who, s);
  }
  const byPlan = TIER_ORDER.map((k) => {
    const of = [...senders.values()].filter((s) => s.tier === k);
    return { tier: k, label: k === "none" ? "No plan (free week)" : SIGN_PLANS[k].label, senders: of.length, requests: of.reduce((n, s) => n + s.requests, 0) };
  }).filter((r) => r.senders > 0);

  return {
    windows: [since(singaporeMidnight(now), "Today"), since(t - 7 * DAY, "7 days"), since(month, "30 days")],
    openNow: real.filter((e) => e.status === "sent").length,
    stalledNow: new Set(stalled.filter((w) => !test.has(w.envelope.id)).map((w) => w.envelope.id)).size,
    timeToSign: { count: hours.length, averageHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null, medianHours: median },
    byPlan,
  };
}

/* ── all of it ─────────────────────────────────────────────────────────────── */

const TONE = { err: 0, warn: 1 } as const;
const KIND: Record<ActionKind, number> = { request: 0, unapproved: 1, unpaid: 2, unsigned: 3, stalled: 4 };

export function master(rows: MasterRows, now: Date = new Date()): Master {
  const test = testEnvelopes(rows);
  const stalled = waiting(rows, now);
  const realStalled = stalled.filter((w) => !test.has(w.envelope.id));
  const companies = rows.companies.map((c) => {
    const all = vestings(c, rows, now);
    return { row: esopRow(c, rows, now, all), all };
  });
  const actions = [...companies.flatMap((c) => esopActions(c.row, c.all, now)), ...signActions(realStalled, rows, now)].sort((a, b) => TONE[a.tone] - TONE[b.tone] || KIND[a.kind] - KIND[b.kind]);
  const month = now.getTime() - 30 * DAY;
  const testRows = rows.envelopes.filter((e) => test.has(e.id));
  return {
    at: now.toISOString(),
    actions,
    sign: signFigures(rows, test, stalled, now),
    /* real dashboards before simulations; Founders Doc's managed clients first; then by name */
    esop: companies.map((c) => c.row).sort((a, b) => Number(a.simulation) - Number(b.simulation) || Number(b.managed) - Number(a.managed) || a.name.localeCompare(b.name)),
    test: {
      sent30: testRows.filter((e) => Date.parse(e.created_at) >= month).length,
      openNow: testRows.filter((e) => e.status === "sent").length,
      stalledNow: new Set(stalled.filter((w) => test.has(w.envelope.id)).map((w) => w.envelope.id)).size,
    },
  };
}

/** "3 h", "1.5 days": a length of time, for the time-to-sign tile. */
export function hoursText(h: number | null): string {
  if (h === null) return "–";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round((h / 24) * 10) / 10} days`;
}
