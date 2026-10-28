import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import type { EsopBatch, EsopCompany, EsopDocument, EsopHolder } from "@/lib/esop/vesting";
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

export default async function EsopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <EsopSheet
        company={DEMO_COMPANY}
        batches={DEMO_BATCHES}
        holders={DEMO_HOLDERS}
        documents={[]}
        role="admin"
        viewer="Preview"
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
      .select("id, name, email, id_no, batch, options_per_tranche, status, leaver_type, last_day, notes, updated_at, updated_by")
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

  return (
    <EsopSheet
      company={company}
      batches={(batchesRes.data ?? []) as EsopBatch[]}
      holders={(holdersRes.data ?? []) as EsopHolder[]}
      documents={(docsRes.data ?? []) as EsopDocument[]}
      role={admin ? "admin" : "ceo"}
      viewer={user.email ?? ""}
      supabaseUrl={supabaseUrl()}
      supabaseKey={supabasePublishableKey()}
    />
  );
}
