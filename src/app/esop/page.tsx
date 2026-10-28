import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import "./esop.css";

/* /esop: the ESOP dashboards this person may open. One → straight there. */

export const metadata = { title: "ESOP dashboards", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EsopIndex() {
  if (!isSupabaseConfigured()) redirect("/esop/hitpay");
  const user = await getUser();
  if (!user) redirect("/login?next=/esop");

  const supabase = await createClient();
  const { data } = await supabase.from("esop_companies").select("slug, name").order("name");
  const list = data ?? [];
  if (list.length === 1) redirect(`/esop/${list[0].slug}`);

  return (
    <main className="esop-empty">
      <h1>ESOP dashboards</h1>
      {list.length ? (
        <ul style={{ listStyle: "none", padding: 0, lineHeight: 2 }}>
          {list.map((c) => (
            <li key={c.slug}>
              <Link href={`/esop/${c.slug}`}>{c.name}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>There is no ESOP dashboard on this account. Ask Founders Doc to add {user.email}.</p>
      )}
    </main>
  );
}
