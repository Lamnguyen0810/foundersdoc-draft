/**
 * The rail's list of past drafts: its row type and its grouping. Plain
 * functions, shared by the NDA's screen (DraftChat), the term sheet's
 * (TermSheet) and the server (recent.ts).
 */

export interface RecentDraft {
  id: string;
  title: string;
  when: string;
  /** Which document it is — so a list of six tells you six different things. */
  docLabel?: string;
  /** The document type's slug ("nda", "term", "employment"), for the type filter. */
  docSlug?: string;
  /** Kept at the top of the list, above the dated groups. */
  pinned?: boolean;
  /** "Pinned", "Today", "Previous 7 days", "August 2026" — worked out on the
   *  server, in Singapore time, so the two renders agree. */
  heading?: string;
}

/**
 * The list, cut into the sections the rail shows.
 *
 * The rows arrive in the right order already — pinned first, then newest
 * first — so this only has to notice where the heading changes. Pinning a
 * draft in the browser moves it without asking the server again, which is why
 * the sort is repeated here rather than trusted.
 */
export function groupDrafts(list: RecentDraft[]): { heading: string; items: RecentDraft[] }[] {
  const ordered = [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const out: { heading: string; items: RecentDraft[] }[] = [];
  for (const row of ordered) {
    const head = row.pinned ? "Pinned" : (row.heading ?? "Earlier");
    const last = out[out.length - 1];
    if (last && last.heading === head) last.items.push(row);
    else out.push({ heading: head, items: [row] });
  }
  return out;
}

/** The short name a type goes by in the rail's filter. */
export function shortType(slug: string | undefined, label: string | undefined): string {
  if (slug === "nda") return "NDA";
  if (slug === "term") return "Term sheet";
  if (slug === "employment") return "Employment";
  return label ?? "Other";
}
