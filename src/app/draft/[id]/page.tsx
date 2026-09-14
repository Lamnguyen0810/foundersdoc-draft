import { notFound } from "next/navigation";
import Link from "next/link";
import { loadDocTypes } from "@/lib/doctypes.server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import DraftForm, { type InitialDraft } from "../DraftForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Draft — FDAI" };

interface Row {
  id: string;
  answers: Record<string, string> | null;
  source_text: string | null;
  output: string | null;
  status: string;
  title: string | null;
  created_at: string;
  doc_types: { slug: string } | null;
}

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) notFound();
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("drafts")
    .select("id,answers,source_text,output,status,title,created_at,doc_types(slug)")
    .eq("id", id)
    .maybeSingle();

  // RLS means another user's draft simply returns nothing — which is exactly the
  // behaviour we want: not found, not "forbidden".
  if (!data) notFound();
  const row = data as unknown as Row;

  const { docTypes } = await loadDocTypes();
  const slug = row.doc_types?.slug ?? docTypes[0]?.slug ?? "";

  const initial: InitialDraft = {
    id: row.id,
    docTypeSlug: slug,
    answers: row.answers ?? {},
    sourceText: row.source_text,
    output: row.output ?? "",
    status: row.status === "final" ? "final" : "draft",
    title: row.title,
  };

  return (
    <main className="wrap wrap-wide" style={{ paddingTop: 32, paddingBottom: 8 }}>
      <header
        style={{
          borderBottom: "1px solid var(--grey-2)",
          paddingBottom: 20,
          marginBottom: 28,
        }}
      >
        <Link className="more" href="/history" style={{ color: "var(--grey-5)" }}>
          ← Past drafts
        </Link>
        <h1 style={{ fontSize: "clamp(24px, 3vw, 32px)", marginTop: 10 }}>
          {row.title || "Untitled draft"}
        </h1>
        <p className="sub" style={{ marginTop: 8, fontSize: 14 }}>
          Created {new Date(row.created_at).toLocaleString("en-GB")} ·{" "}
          {row.status === "final" ? "marked final" : "draft"}. Editing here saves back to the same
          record.
        </p>
      </header>
      <DraftForm docTypes={docTypes} initial={initial} />
    </main>
  );
}
