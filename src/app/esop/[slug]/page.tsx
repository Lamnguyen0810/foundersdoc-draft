import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { canResetSimulation } from "@/lib/esop/sim-reset";
import type { EsopBatch, EsopCompany, EsopDocument, EsopHolder, EsopRun, EsopSettings, MemberRole } from "@/lib/esop/vesting";
import EsopSheet from "./EsopSheet";
import { DEMO_BATCHES, DEMO_COMPANY, DEMO_DOCUMENTS, DEMO_HOLDERS, DEMO_NEW_COMPANY } from "../demo";
import "../esop.css";

/**
 * A client's ESOP dashboard: /esop/<slug> (first client: /esop/hitpay).
 *
 * WHO SEES IT. Signed-in people only (middleware sends everyone else to
 * /login and back). Of those, only the company's members (esop_members, e.g.
 * the CEO) and Founders Doc admins: row-level security returns NO company row
 * to anyone else, so this page cannot show what the database will not give it.
 * Tables and rules: supabase/105_esop_dashboard.sql.
 *
 * Without Supabase (local preview) the page shows the test data from ../demo
 * and says nothing is saved.
 */

export const metadata = { title: "ESOP dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EsopPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string; demo?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const focusRef = (sp.ref ?? "").toUpperCase().match(/^B\d{1,3}-T\d{1,2}$/)?.[0] ?? null;

  if (!isSupabaseConfigured()) {
    /* 0217 preview (?demo=lockin): a Modify from the Director, one vesting waiting for payment, one paid and locked */
    const now = new Date().toISOString();
    const DEMO_LOCKIN: { runs: EsopRun[]; requests: Record<string, NonNullable<EsopRun["request"]>> } = {
      runs: [
        { ref: "B5-T3", approved_by: "director@example.com (email)", approved_at: now, sent_at: now, payment_link: null, paid_at: null },
        { ref: "B99-T1", approved_by: "director@example.com (email)", approved_at: now, sent_at: now, payment_link: null, paid_at: now, paid_by: "Stripe (Zap)", locked: true },
      ],
      requests: { "B8-T2": { kind: "modify", note: "Specimen Holder Two should have 2,400 options, not 2,200.", by_email: "director@example.com", created_at: now } },
    };
    /* preview of a company that signed up by itself: empty, the client is its Admin */
    if (sp.demo === "new")
      return (
        <EsopSheet
          company={DEMO_NEW_COMPANY}
          batches={[]}
          holders={[]}
          documents={[]}
          role="ceo"
          viewer="founder@example.com"
          runs={[]}
          canApprove
          focusRef={null}
          supabaseUrl={null}
          supabaseKey={null}
          settings={{ self_serve: true, holder_access: false, alert_days: [14, 7, 0], alert_emails: [], plan: "free", ready: true }}
          access={{ role: "ceo", canEdit: true, canManage: true }}
        />
      );
    return (
      <EsopSheet
        company={DEMO_COMPANY}
        batches={DEMO_BATCHES}
        holders={DEMO_HOLDERS}
        documents={DEMO_DOCUMENTS}
        signPending={3}
        role="admin"
        viewer="Preview"
        runs={sp.demo === "lockin" ? DEMO_LOCKIN.runs : []}
        requests={sp.demo === "lockin" ? DEMO_LOCKIN.requests : undefined}
        canApprove
        simulation="administrator@foundersdoc.com"
        reset={{ to: "administrator@foundersdoc.com", refs: [] }}
        emailApproval
        focusRef={focusRef}
        supabaseUrl={null}
        supabaseKey={null}
        settings={{ self_serve: false, holder_access: true, alert_days: [], alert_emails: ["hr@example.com"], finance_emails: ["finance@example.com"], plan: "premium", ready: true }}
        access={{ role: "ceo", canEdit: true, canManage: true }}
      />
    );
  }

  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/esop/${slug}`)}`);

  const supabase = await createClient();
  const { data: company, error: companyError } = await supabase
    .from("esop_companies")
    .select("id, slug, name, logo_url, plan")
    .eq("slug", slug)
    .maybeSingle<EsopCompany>();

  if (companyError && /esop_companies/.test(companyError.message)) {
    return (
      <main className="esop-empty">
        <h1>ESOP dashboard is not set up yet</h1>
        <p>Run <code>supabase/105_esop_dashboard.sql</code> in Supabase, then reload this page.</p>
      </main>
    );
  }
  if (!company) {
    return (
      <main className="esop-empty">
        <h1>No access</h1>
        <p>
          This dashboard is private. If you should see it, ask Founders Doc to add <b>{user.email}</b>.
        </p>
        <p>
          <Link href="/draft">Back to FD AI</Link>
        </p>
      </main>
    );
  }

  const [batchesRes, holdersRes, docsRes, admin] = await Promise.all([
    supabase.from("esop_batches").select("batch, vesting_start, tranches, note").eq("company_id", company.id).order("batch"),
    supabase
      .from("esop_holders")
      .select("*")
      .eq("company_id", company.id)
      .order("batch")
      .order("name"),
    supabase
      .from("esop_documents")
      .select("*")
      .eq("company_id", company.id)
      .order("uploaded_at"),
    isAdmin(),
  ]);
  /* Settings (123) and this person's access. Before 123 is run: no settings, everyone edits as before. */
  const setRes = await supabase.from("esop_companies").select("self_serve, holder_access, alert_days, alert_emails").eq("id", company.id).maybeSingle();
  const sr = (setRes.error ? null : setRes.data) as { self_serve: boolean; holder_access: boolean; alert_days: number[] | null; alert_emails: string[] | null } | null;
  const settings: EsopSettings = {
    self_serve: !!sr?.self_serve,
    holder_access: !!sr?.holder_access,
    alert_days: sr?.alert_days ?? [],
    alert_emails: sr?.alert_emails ?? [],
    plan: company.plan === "premium" ? "premium" : "free",
    ready: !!sr,
  };
  /* 0202: finance copies of the payment email (SQL 126; before it, none) */
  const finRes = await supabase.from("esop_companies").select("finance_emails").eq("id", company.id).maybeSingle();
  settings.finance_emails = finRes.error ? [] : ((finRes.data as { finance_emails?: string[] | null } | null)?.finance_emails ?? []);
  const me = await supabase.from("esop_members").select("role").eq("company_id", company.id).eq("email", (user.email ?? "").toLowerCase()).maybeSingle();
  const myRole = ((me.data as { role?: MemberRole } | null)?.role ?? null) as MemberRole | null;
  const access = {
    role: myRole,
    canEdit: admin || !settings.ready || myRole !== "viewer",
    canManage: admin || myRole === "ceo",
  };
  /* Option pool (121). Before 121 is run the column is missing: the card then says "not set". */
  const poolRes = await supabase.from("esop_companies").select("option_pool").eq("id", company.id).maybeSingle();
  const option_pool = poolRes.error ? null : ((poolRes.data as { option_pool?: number | null } | null)?.option_pool ?? null);
  /* FD Sign badge (admins): this company's certificates still waiting for a signature */
  let signPending = 0;
  /* 0199: each certificate request's state, so Needs attention can say "waiting for a signature" once sent */
  let signStatus: Array<{ holder: string; tranche: number; status: string }> = [];
  if (admin && isAdminClientConfigured()) {
    const ids = ((holdersRes.data ?? []) as EsopHolder[]).map((h) => h.id);
    if (ids.length) {
      const r = await supabaseAdmin().from("sign_envelopes").select("esop_holder_id, esop_tranche, status").in("esop_holder_id", ids).in("status", ["sent", "completed"]);
      const list = (r.error ? [] : (r.data ?? [])) as Array<{ esop_holder_id: string; esop_tranche: number | null; status: string }>;
      signPending = list.filter((x) => x.status === "sent").length;
      signStatus = list.filter((x) => x.esop_tranche).map((x) => ({ holder: x.esop_holder_id, tranche: x.esop_tranche as number, status: x.status }));
    }
  }
  /* Approvals (107). Before 107 is run this simply returns nothing. */
  const runsRes = await supabase.rpc("esop_runs", { p_slug: slug });
  const runRows = (runsRes.data ?? []) as Array<EsopRun & { can_approve: boolean }>;
  const canApprove = runRows.some((r) => r.can_approve);
  /* Simulation (109): admins may approve an upcoming vesting early, to rehearse it */
  const sim = admin ? await supabase.from("esop_companies").select("email_override").eq("id", company.id).maybeSingle() : null;
  const simulation = ((sim?.data as { email_override?: string | null } | null)?.email_override ?? null) || null;
  const runs = runRows.filter((r) => r.ref) as EsopRun[];
  /* 0217 (SQL 129): Paid ✓ and the lock, and the Director's open Modify / Cancel. Before 129: none. */
  const paidRes = await supabase.from("esop_tranche_runs").select("ref, paid_at, paid_by").eq("company_id", company.id);
  if (!paidRes.error) {
    for (const p of (paidRes.data ?? []) as Array<{ ref: string; paid_at: string | null; paid_by: string | null }>) {
      const r = runs.find((x) => x.ref === p.ref);
      if (!r) continue;
      r.paid_at = p.paid_at;
      r.paid_by = p.paid_by;
      if (p.paid_at) {
        const lk = await supabase.rpc("esop_batch_locked", { p_company: company.id, p_batch: Number(/^B(\d+)/.exec(p.ref)?.[1] ?? 0) });
        r.locked = !lk.error && lk.data === p.ref;
      }
    }
  }
  const requests: Record<string, NonNullable<EsopRun["request"]>> = {};
  const reqRes = await supabase.from("esop_run_requests").select("ref, kind, note, by_email, created_at").eq("company_id", company.id).is("resolved_at", null).order("created_at", { ascending: false });
  if (!reqRes.error)
    for (const q of (reqRes.data ?? []) as Array<{ ref: string } & NonNullable<EsopRun["request"]>>) if (!requests[q.ref]) requests[q.ref] = { kind: q.kind, note: q.note, by_email: q.by_email, created_at: q.created_at };
  /* "Reset simulation" (116, 118): Rachel + Lam only, only on approvals made in simulation; also after
     simulation is switched off, so a rehearsal can never block the real vesting */
  let reset: { to: string | null; refs: string[] } | null = null;
  if (canResetSimulation(user.email) && isAdminClientConfigured()) {
    const db = supabaseAdmin();
    const c = (await db.from("esop_companies").select("email_override").eq("id", company.id).maybeSingle()).data as { email_override: string | null } | null;
    const r = await db.from("esop_tranche_runs").select("ref").eq("company_id", company.id).eq("simulation", true);
    const to = c?.email_override?.trim() || null;
    /* before 116 is run the column is missing: in simulation show the button anyway, the API then says to run 116 */
    const refs = r.error ? (to ? runs.map((x) => x.ref) : []) : ((r.data ?? []) as Array<{ ref: string }>).map((x) => x.ref);
    if (to || refs.length) reset = { to, refs };
  }

  return (
    <EsopSheet
      company={{ ...company, option_pool }}
      signPending={signPending}
      signStatus={signStatus}
      settings={settings}
      access={access}
      batches={(batchesRes.data ?? []) as EsopBatch[]}
      holders={(holdersRes.data ?? []) as EsopHolder[]}
      documents={(docsRes.data ?? []) as EsopDocument[]}
      role={admin ? "admin" : "ceo"}
      viewer={user.email ?? ""}
      runs={runs}
      requests={requests}
      canApprove={canApprove}
      simulation={simulation}
      reset={reset}
      emailApproval={admin || canResetSimulation(user.email)}
      focusRef={focusRef}
      supabaseUrl={supabaseUrl()}
      supabaseKey={supabasePublishableKey()}
    />
  );
}
