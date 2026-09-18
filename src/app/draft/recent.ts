import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { nameFallback } from "@/lib/draft-name";
import type { RecentDraft } from "./DraftChat";

/**
 * The "Past drafts" list in the rail.
 *
 * Shared by the drafting screen and by a reopened draft, so both show the same
 * entries and the one you are looking at is marked on both.
 *
 * Pinned first, then newest first, and each row carries the heading it belongs
 * under — Today, Yesterday, Previous 7 days, and so on. The heading is worked
 * out here rather than in the browser so that the page the server sends and the
 * page the browser draws say the same thing.
 */

/** The firm is in Singapore, and so is the day a draft was made. A server in
 *  UTC would call a Friday-morning draft Thursday's. */
const TZ = "Asia/Singapore";

const DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, month: "long", year: "numeric" });

/** Whole days between two moments, counted in Singapore calendar days. */
function daysApart(then: Date, now: Date): number {
  const a = Date.parse(DAY.format(then) + "T00:00:00Z");
  const b = Date.parse(DAY.format(now) + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/** "Today", "Mon", "28 Aug" — the rail's shorthand, matching the design. */
export function when(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = daysApart(d, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAY.format(d);
  return DAY_MONTH.format(d);
}

/**
 * Which heading a draft sits under.
 *
 * The same shape of list as a chat sidebar, because that is what people are
 * used to: the last few days named, then a fortnight and a month in bulk, then
 * by month once it is history.
 */
export function heading(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = daysApart(d, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 days";
  if (days <= 30) return "Previous 30 days";
  return MONTH_YEAR.format(d);
}

interface Row {
  id: string;
  title: string | null;
  created_at: string;
  pinned: boolean | null;
  doc_types: { label: string } | null;
}

/** Enough to be worth grouping, few enough that the rail is not a filing cabinet. */
const LIMIT = 24;

export async function recentDrafts(): Promise<RecentDraft[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("drafts")
      .select("id,title,created_at,pinned,doc_types(label)")
      .is("deleted_at", null)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    /* 031_pin_a_draft.sql may not have been run yet. Rather than show an empty
       rail, ask again without the column that does not exist. */
    if (error) return await withoutPinning(supabase);

    const now = new Date();
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      title: (r.title ?? "").trim() || nameFallback(r.doc_types?.label, r.created_at),
      when: when(r.created_at, now),
      docLabel: r.doc_types?.label ?? undefined,
      pinned: Boolean(r.pinned),
      heading: r.pinned ? "Pinned" : heading(r.created_at, now),
    }));
  } catch {
    // The rail is decoration, not function. A database hiccup must never stop
    // someone drafting, so an empty list is the right failure.
    return [];
  }
}

/** The same list, from a database that has not been given the pinned column. */
async function withoutPinning(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<RecentDraft[]> {
  try {
    const { data } = await supabase
      .from("drafts")
      .select("id,title,created_at,doc_types(label)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    const now = new Date();
    return ((data ?? []) as unknown as Omit<Row, "pinned">[]).map((r) => ({
      id: r.id,
      title: (r.title ?? "").trim() || nameFallback(r.doc_types?.label, r.created_at),
      when: when(r.created_at, now),
      docLabel: r.doc_types?.label ?? undefined,
      pinned: false,
      heading: heading(r.created_at, now),
    }));
  } catch {
    return [];
  }
}
