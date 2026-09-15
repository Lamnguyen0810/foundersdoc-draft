import { loadDocTypes } from "@/lib/doctypes.server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { getWallet } from "@/lib/billing/credits";
import DraftChat, { type RecentDraft } from "./DraftChat";

export const metadata = { title: "FD AI — draft a document" };
export const dynamic = "force-dynamic";

/** "Today", "Mon", "28 Aug" — the rail's shorthand, matching the design. */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

async function recentDrafts(): Promise<RecentDraft[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("drafts")
      .select("id,title,created_at")
      .order("created_at", { ascending: false })
      .limit(6);
    return (data ?? []).map((r: { id: string; title: string | null; created_at: string }) => ({
      id: r.id,
      title: r.title ?? "Untitled draft",
      when: when(r.created_at),
    }));
  } catch {
    // The rail is decoration, not function. A database hiccup must never stop
    // someone drafting, so an empty list is the right failure.
    return [];
  }
}

export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { docTypes } = await loadDocTypes();

  // `/draft?type=nda` — the deep link the marketing site uses. An unknown slug
  // falls through to the catalogue rather than erroring, so a stale link on the
  // site lands somewhere sensible instead of breaking.
  const requested = (await searchParams).type?.trim().toLowerCase();
  const presetSlug = docTypes.find((d) => d.slug === requested)?.slug;

  const [user, recent, wallet, admin] = await Promise.all([
    isSupabaseConfigured() ? getUser() : Promise.resolve(null),
    recentDrafts(),
    getWallet(),
    isSupabaseConfigured() ? isAdmin() : Promise.resolve(false),
  ]);

  return (
    <DraftChat
      docTypes={docTypes}
      presetSlug={presetSlug}
      userEmail={user?.email ?? null}
      recent={recent}
      wallet={
        Number.isFinite(wallet.credits)
          ? { credits: wallet.credits, inTrial: wallet.inTrial, trialEndsAt: wallet.trialEndsAt }
          : null /* unmetered local dev: show nothing rather than "Infinity left" */
      }
      isAdmin={admin}
    />
  );
}
