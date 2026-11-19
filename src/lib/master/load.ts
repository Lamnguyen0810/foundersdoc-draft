import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ALERT_COLUMNS, BATCH_COLUMNS, CERTIFICATE_COLUMNS, COMPANY_COLUMNS, ENVELOPE_COLUMNS, HOLDER_COLUMNS, REMINDER_COLUMNS, REQUEST_COLUMNS, RUN_COLUMNS, SIGNER_COLUMNS, SUBSCRIPTION_COLUMNS, APPROVAL_EMAIL_COLUMNS } from "./columns";
import type { MApprovalEmail, MReminder, MAlert, MBatch, MCertificate, MCompany, MEnvelope, MHolder, MRequest, MRun, MSigner, MSubscription, MasterRows } from "./figures";

/**
 * The rows behind the master dashboard (0244): /admin/master, Founders Doc admins only.
 *
 * WHY THE SECRET-KEY CLIENT. FD Sign's tables are closed to every signed-in user by design
 * (row-level security on, no policies: supabase/112), and this page reads across every company's
 * ESOP dashboard. Only the server can do that. So the page checks is_admin() FIRST and only then
 * calls this; nothing here is reachable from a browser, and it only reads.
 *
 * It reads the columns in columns.ts and no others: never a request's title or file, never a
 * signer's or holder's name or email.
 *
 * A table or column that is not there yet (an older database) is not an error: its rows are
 * empty, the page says which part is incomplete, and the rest still shows.
 */

const DAY = 86_400_000;
/** How far back signing requests are read for the 30-day figures (with room to spare). */
const SINCE_DAYS = 90;
const PAGE = 1000;
const MOST = 20_000;

type Answer = { data: unknown; error: { message: string } | null };

export interface Loaded {
  rows: MasterRows;
  /** the parts that could not be read, in plain words */
  problems: string[];
}

export async function loadMaster(now: Date = new Date()): Promise<Loaded> {
  const db = supabaseAdmin();
  const problems: string[] = [];

  /** Every row of a query, a page at a time (Supabase returns at most 1,000 a request). */
  async function all<T>(what: string, page: (from: number, to: number) => PromiseLike<Answer>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; from < MOST; from += PAGE) {
      /* a failed read (a missing table, the database unreachable) is reported, never thrown */
      const r = await Promise.resolve(page(from, from + PAGE - 1)).catch((e: unknown): Answer => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } }));
      if (r.error) {
        console.error(`[master] ${what}:`, r.error.message);
        if (!problems.includes(what)) problems.push(what);
        return out;
      }
      const got = (r.data ?? []) as T[];
      out.push(...got);
      if (got.length < PAGE) break;
    }
    return out;
  }
  /* each query is made afresh for every page, in a fixed order so the pages never overlap */
  type Query = { range: (from: number, to: number) => PromiseLike<Answer> };
  const read = <T>(what: string, make: () => unknown) => all<T>(what, (from, to) => (make() as Query).range(from, to));

  const since = new Date(now.getTime() - SINCE_DAYS * DAY).toISOString();
  type Company = Omit<MCompany, "simulation"> & { email_override: string | null };
  const requestsOf = () => db.from("sign_envelopes").select(ENVELOPE_COLUMNS);

  const [recent, open, signedCertificates, companies, batches, holders, runs, certificates, slackAlerts, emailAlerts, requests, approvalEmails] = await Promise.all([
    read<MEnvelope>("signing requests", () => requestsOf().gte("created_at", since).order("id")),
    read<MEnvelope>("signing requests", () => requestsOf().eq("status", "sent").order("id")),
    /* ESOP certificates signed at any time: a vesting's certificates may have been signed before the 90 days */
    read<MEnvelope>("signing requests", () => requestsOf().eq("status", "completed").not("esop_holder_id", "is", null).order("id")),
    read<Company>("ESOP dashboards", () => db.from("esop_companies").select(COMPANY_COLUMNS).order("id")),
    read<MBatch>("ESOP batches", () => db.from("esop_batches").select(BATCH_COLUMNS).order("company_id").order("batch")),
    read<MHolder>("ESOP holders", () => db.from("esop_holders").select(HOLDER_COLUMNS).order("id")),
    read<MRun>("ESOP approvals and payments", () => db.from("esop_tranche_runs").select(RUN_COLUMNS).order("company_id").order("ref")),
    read<MCertificate>("ESOP certificates on file", () => db.from("esop_documents").select(CERTIFICATE_COLUMNS).eq("kind", "certificate").not("holder_id", "is", null).order("id")),
    read<MAlert>("ESOP alerts", () => db.from("esop_alerts").select(ALERT_COLUMNS).order("company_id").order("ref")),
    read<MAlert>("ESOP alerts", () => db.from("esop_alert_log").select(ALERT_COLUMNS).order("company_id").order("ref").order("days_before")),
    read<MRequest>("ESOP change requests", () => db.from("esop_run_requests").select(REQUEST_COLUMNS).is("resolved_at", null).order("company_id").order("ref").order("created_at")),
    /* when an approval email was made for a vesting (the button or the daily alert): shown as "sent 2 days ago" */
    read<MApprovalEmail>("ESOP approval emails", () => db.from("esop_approval_links").select(APPROVAL_EMAIL_COLUMNS).gte("created_at", since).order("company_id").order("ref").order("created_at")),
  ]);

  const byId = new Map<string, MEnvelope>();
  for (const e of [...recent, ...open, ...signedCertificates]) byId.set(e.id, e);
  const envelopes = [...byId.values()];

  /* the signers of the requests still open (for "waiting more than 2 days"), and each sender's plan */
  const openIds = envelopes.filter((e) => e.status === "sent").map((e) => e.id);
  const owners = [...new Set(envelopes.map((e) => e.owner_id).filter((x): x is string => !!x))];
  const chunks = <T>(list: T[], n = 150) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));
  const signers: MSigner[] = [];
  for (const ids of chunks(openIds)) signers.push(...(await read<MSigner>("signers", () => db.from("sign_signers").select(SIGNER_COLUMNS).in("envelope_id", ids).order("envelope_id").order("position"))));
  /* reminders already sent on Founders Doc's own open requests, so two admins don't both chase the same signer */
  const ours = envelopes.filter((e) => e.status === "sent" && !e.owner_email).map((e) => e.id);
  const reminders: MReminder[] = [];
  for (const ids of chunks(ours)) reminders.push(...(await read<MReminder>("reminders", () => db.from("sign_events").select(REMINDER_COLUMNS).eq("event", "reminded").in("envelope_id", ids).order("envelope_id").order("at").order("id"))));
  const subscriptions: MSubscription[] = [];
  for (const ids of chunks(owners))
    subscriptions.push(...(await read<MSubscription>("plans", () => db.from("subscriptions").select(SUBSCRIPTION_COLUMNS).in("user_id", ids).in("status", ["trialing", "active", "past_due"]).order("id"))));

  return {
    rows: {
      envelopes,
      signers,
      companies: companies.map(({ email_override, ...c }) => ({ ...c, plan: c.plan === "premium" ? "premium" : "free", self_serve: !!c.self_serve, simulation: !!email_override?.trim() })),
      batches,
      holders,
      runs: runs.map((r) => ({ ...r, simulation: !!r.simulation })),
      certificates,
      alerts: [...slackAlerts, ...emailAlerts],
      requests,
      subscriptions,
      reminders,
      approvalEmails,
    },
    problems,
  };
}
