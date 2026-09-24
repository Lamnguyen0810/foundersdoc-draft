import { notFound } from "next/navigation";
import { forTheBrowser, loadDocTypes } from "@/lib/doctypes.server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { getWallet } from "@/lib/billing/credits";
import { nameFromAnswers } from "@/lib/draft-name";
import DraftChat, { type ResumeDraft } from "../DraftChat";
import { recentDrafts } from "../recent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Draft — FD AI" };

/**
 * A draft, opened again.
 *
 * This used to render a form: the answers in boxes, the document underneath,
 * and no sign of the conversation that produced them. Someone coming back to a
 * draft they made three weeks ago is coming back to the thinking, not to the
 * fields — what did I tell it, what did it give me, what do I want changed.
 * So it reopens as the conversation it was, with the document beside it and
 * the revision box live, exactly as they left it.
 *
 * Nothing new is stored to make that possible. The questions come from the
 * document type, the answers and the document from the draft row, and the
 * revisions from draft_versions.
 */

interface Row {
  id: string;
  answers: Record<string, string> | null;
  source_text: string | null;
  output: string | null;
  output_html: string | null;
  status: string;
  title: string | null;
  created_at: string;
  doc_types: { slug: string } | null;
}

interface VersionRow {
  version_number: number;
  detail_level: number;
  file_name: string;
  instruction: string | null;
  output: string;
}

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) notFound();
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("drafts")
    .select("id,answers,source_text,output,output_html,status,title,created_at,doc_types(slug)")
    .eq("id", id)
    /* A deleted draft is not found, even during its thirty days: it is in the
       wastebasket on the settings page, and that is the only way back to it. */
    .is("deleted_at", null)
    .maybeSingle();

  // RLS means another user's draft simply returns nothing — which is exactly the
  // behaviour we want: not found, not "forbidden".
  if (!data) notFound();
  const row = data as unknown as Row;

  const { docTypes: loaded } = await loadDocTypes();
  const docType = loaded.find((d) => d.slug === row.doc_types?.slug);
  /* Questions and labels only — see forTheBrowser(). */
  const { docTypes, looks } = forTheBrowser(loaded);

  /* The document type was retired or renamed after this draft was made. There
     is no conversation to replay without its questions, so rather than guess
     with another type's questions — which would show this person answers to
     things they were never asked — the draft is not reopened at all. */
  if (!docType) notFound();

  const [versionRows, recent, user, wallet, admin] = await Promise.all([
    supabase
      .from("draft_versions")
      .select("version_number,detail_level,file_name,instruction,output")
      .eq("draft_id", id)
      .order("version_number", { ascending: true }),
    recentDrafts(),
    getUser(),
    getWallet(),
    isAdmin(),
  ]);

  const answers = row.answers ?? {};

  const resume: ResumeDraft = {
    id: row.id,
    /* Drafts saved before naming existed have no title of their own. Rather
       than show "Untitled draft" again, the same rule the migration uses is
       applied here — from this draft's own answers, so it says something true
       about this document and not about drafts in general. */
    title: (row.title ?? "").trim() || nameFromAnswers(docType, answers, new Date(row.created_at)),
    docTypeSlug: docType.slug,
    answers,
    sourceText: row.source_text,
    output: row.output ?? "",
    outputHtml: row.output_html,
    createdAt: row.created_at,
    versions: ((versionRows.data ?? []) as unknown as VersionRow[]).map((v) => ({
      version: v.version_number,
      detailLevel: v.detail_level,
      fileName: v.file_name,
      instruction: v.instruction,
      output: v.output,
    })),
  };

  return (
    <DraftChat
      docTypes={docTypes}
      looks={looks}
      userEmail={user?.email ?? null}
      recent={recent}
      wallet={
        Number.isFinite(wallet.credits)
          ? { credits: wallet.credits, inTrial: wallet.inTrial, trialEndsAt: wallet.trialEndsAt }
          : null
      }
      isAdmin={admin}
      prefill={null /* settings prefill only ever fills a BLANK form */}
      resume={resume}
    />
  );
}
