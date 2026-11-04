import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { canResetSimulation } from "@/lib/esop/sim-reset";
import type { EsopBatch, EsopCompany, EsopDocument, EsopHolder, EsopRun } from "@/lib/esop/vesting";
import EsopSheet from "./EsopSheet";
import { DEMO_BATCHES, DEMO_COMPANY, DEMO_HOLDERS } from "../demo";
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
  searchParams: Promise<{ ref?: string }>;
}) {
  const { slug } = await params;
  const focusRef = ((await searchParams).ref ?? "").toUpperCase().match(/^B\d{1,3}-T\d{1,2}$/)?.[0] ?? null;

  if (!isSupabaseConfigured()) {
    return (
      <EsopSheet
        company={DEMO_COMPANY}
        batches={DEMO_BATCHES}
        holders={DEMO_HOLDERS}
        documents={[]}
        role="admin"
        viewer="Preview"
        runs={[]}
        canApprove
        simulation="administrator@foundersdoc.com"
        reset={{ to: "administrator@foundersdoc.com", refs: [] }}
        focusRef={null}
        supabaseUrl={null}
        supabaseKey={null}
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
  /* Approvals (107). Before 107 is run this simply returns nothing. */
  const runsRes = await supabase.rpc("esop_runs", { p_slug: slug });
  const runRows = (runsRes.data ?? []) as Array<EsopRun & { can_approve: boolean }>;
  const canApprove = runRows.some((r) => r.can_approve);
  /* Simulation (109): admins may approve an upcoming vesting early, to rehearse it */
  const sim = admin ? await supabase.from("esop_companies").select("email_override").eq("id", company.id).maybeSingle() : null;
  const simulation = ((sim?.data as { email_override?: string | null } | null)?.email_override ?? null) || null;
  const runs = runRows.filter((r) => r.ref) as EsopRun[];
  /* "Reset simulation" (116): Rachel + Lam only, only while simulation is on, only approvals made in simulation */
  let reset: { to: string; refs: string[] } | null = null;
  if (canResetSimulation(user.email) && isAdminClientConfigured()) {
    const db = supabaseAdmin();
    const c = (await db.from("esop_companies").select("email_override").eq("id", company.id).maybeSingle()).data as { email_override: string | null } | null;
    if (c?.email_override) {
      const r = await db.from("esop_tranche_runs").select("ref").eq("company_id", company.id).eq("simulation", true);
      /* before 116 is run the column is missing: show the button anyway, the API then says to run 116 */
      reset = { to: c.email_override, refs: r.error ? runs.map((x) => x.ref) : ((r.data ?? []) as Array<{ ref: string }>).map((x) => x.ref) };
    }
  }

  return (
    <EsopSheet
      company={company}
      batches={(batchesRes.data ?? []) as EsopBatch[]}
      holders={(holdersRes.data ?? []) as EsopHolder[]}
      documents={(docsRes.data ?? []) as EsopDocument[]}
      role={admin ? "admin" : "ceo"}
      viewer={user.email ?? ""}
      runs={runs}
      canApprove={canApprove}
      simulation={simulation}
      reset={reset}
      focusRef={focusRef}
      supabaseUrl={supabaseUrl()}
      supabaseKey={supabasePublishableKey()}
    />
  );
}
