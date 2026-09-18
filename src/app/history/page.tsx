import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { nameFallback } from "@/lib/draft-name";

export const metadata = { title: "Past drafts" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface Row {
  id: string;
  title: string | null;
  status: string;
  output: string | null;
  created_at: string;
  doc_types: { label: string } | null;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="wrap" style={{ paddingTop: 48 }}>
        <h1 style={{ fontSize: 30 }}>Past drafts</h1>
        <p className="sub" style={{ marginTop: 12, maxWidth: "56ch" }}>
          Nothing is saved while sign-in is not configured — drafts live only in the browser until
          you refresh. See SETUP_SUPABASE.md to enable saving.
        </p>
        <Link className="btn btn-gold" href="/draft" style={{ marginTop: 20 }}>
          New draft
        </Link>
      </main>
    );
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const user = await getUser();
  const supabase = await createClient();

  // Row-level security returns only the signed-in user's rows even though this
  // query does not filter by user_id. The database refuses; the app does not
  // have to remember to ask nicely.
  const { data, error, count } = await supabase
    .from("drafts")
    .select("id,title,status,output,created_at,doc_types(label)", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="wrap" style={{ paddingTop: 32 }}>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: "1px solid var(--grey-2)",
          paddingBottom: 20,
          marginBottom: 24,
        }}
      >
        <div>
          <p className="kicker">FD AI</p>
          <h1 style={{ fontSize: "clamp(26px, 3vw, 34px)", marginTop: 8 }}>Past drafts</h1>
          <p className="sub" style={{ marginTop: 6, fontSize: 14 }}>
            {total} in total · {user?.email}
          </p>
        </div>
        <Link className="btn btn-gold" href="/draft">
          New draft
        </Link>
      </header>

      {error && (
        <p className="note note-warn">
          Could not load drafts. Has 001_schema.sql been run in Supabase?
        </p>
      )}

      {!error && rows.length === 0 && (
        <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--grey-5)", fontSize: 14 }}>
            No drafts yet. Generate one and it will appear here.
          </p>
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/draft/${r.id}`}
              className="card"
              style={{ display: "block", padding: "16px 18px", transition: "border-color .15s" }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 500 }}>
                  {r.title?.trim() || nameFallback(r.doc_types?.label, r.created_at)}
                </span>
                <span style={{ fontSize: 12, color: "var(--grey-5)" }}>
                  {r.doc_types?.label ? `${r.doc_types.label} · ` : ""}
                  {new Date(r.created_at).toLocaleString("en-GB")}
                  {r.status === "final" && (
                    <span
                      style={{
                        marginLeft: 8,
                        background: "rgba(61,139,95,.12)",
                        color: "var(--ok)",
                        padding: "2px 7px",
                        borderRadius: 4,
                        fontWeight: 600,
                        fontSize: 11,
                      }}
                    >
                      final
                    </span>
                  )}
                </span>
              </div>
              <p
                style={{
                  marginTop: 6,
                  fontSize: 12.5,
                  color: "var(--grey-5)",
                  lineHeight: 1.6,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {(r.output ?? "").replace(/\s+/g, " ").slice(0, 220)}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {lastPage > 1 && (
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 24,
            fontSize: 13,
          }}
        >
          {page > 1 ? (
            <Link className="more" href={`/history?page=${page - 1}`}>
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span style={{ fontSize: 12, color: "var(--grey-5)" }}>
            Page {page} of {lastPage}
          </span>
          {page < lastPage ? (
            <Link className="more" href={`/history?page=${page + 1}`}>
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
