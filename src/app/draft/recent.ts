import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { nameFallback } from "@/lib/draft-name";
import type { RecentDraft } from "./DraftChat";

/**
 * The "Past drafts" list in the rail.
 *
 * Shared by the drafting screen and by a reopened draft, so both show the same
 * six entries and the one you are looking at is marked on both.
 */

/** "Today", "Mon", "28 Aug" — the rail's shorthand, matching the design. */
export function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface Row {
  id: string;
  title: string | null;
  created_at: string;
  doc_types: { label: string } | null;
}

export async function recentDrafts(): Promise<RecentDraft[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("drafts")
      .select("id,title,created_at,doc_types(label)")
      .order("created_at", { ascending: false })
      .limit(6);
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      title: (r.title ?? "").trim() || nameFallback(r.doc_types?.label, r.created_at),
      when: when(r.created_at),
      docLabel: r.doc_types?.label ?? undefined,
    }));
  } catch {
    // The rail is decoration, not function. A database hiccup must never stop
    // someone drafting, so an empty list is the right failure.
    return [];
  }
}
