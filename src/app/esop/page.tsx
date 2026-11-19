import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import CreateDashboard from "./CreateDashboard";
import "./esop.css";

/* /esop: the way in to the ESOP dashboards this person may open (the menu's "ESOP dashboard", and the
   sales page's button, both lead here: 0245).
     - one dashboard        straight to it (unless ?new=1: "create another")
     - several              the list, each with what kind it is; Founders Doc admins see every company's
                            and get a link to the master dashboard (/admin/master)
     - none                 the create form first, then how to get added to a company's existing one
   Anyone signed in can create one for their own company (123). Row-level security decides which
   companies come back, so this page cannot list one the person may not open. */

export const metadata = { title: "ESOP dashboards", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Row = { slug: string; name: string; self_serve?: boolean | null };

export default async function EsopIndex({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const wantsNew = (await searchParams).new === "1";
  if (!isSupabaseConfigured())
    return wantsNew ? (
      <main className="esop-empty">
        <CreateDashboard first />
      </main>
    ) : (
      redirect("/esop/hitpay")
    );
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(wantsNew ? "/esop?new=1" : "/esop")}`);

  const supabase = await createClient();
  /* self_serve arrived with 123; before it, the names alone */
  let list: Row[];
  const full = await supabase.from("esop_companies").select("slug, name, self_serve").order("name");
  if (full.error) list = ((await supabase.from("esop_companies").select("slug, name").order("name")).data ?? []) as Row[];
  else list = (full.data ?? []) as Row[];
  if (list.length === 1 && !wantsNew) redirect(`/esop/${list[0].slug}`);

  if (list.length === 0)
    return (
      <main className="esop-empty">
        <h1>Your ESOP dashboard</h1>
        <CreateDashboard first />
        <p className="esop-list-note">
          Does your company already have one? Ask its Admin to add <b>{user.email}</b>, then come back here.
        </p>
      </main>
    );

  const admin = await isAdmin();
  return (
    <main className="esop-empty">
      <h1>ESOP dashboards</h1>
      {admin && (
        <p className="esop-list-note">
          You see every company&apos;s dashboard as a Founders Doc admin. <Link href="/admin/master">See them all with their next vesting ›</Link>
        </p>
      )}
      <ul className="esop-list">
        {list.map((c) => (
          <li key={c.slug}>
            <Link href={`/esop/${c.slug}`}>
              <span>
                <b>{c.name}</b>
                {c.self_serve !== undefined && c.self_serve !== null && <small>{c.self_serve ? "Self-serve" : "Run by Founders Doc"}</small>}
              </span>
              <span aria-hidden="true">Open ›</span>
            </Link>
          </li>
        ))}
      </ul>
      <CreateDashboard first={false} />
    </main>
  );
}
