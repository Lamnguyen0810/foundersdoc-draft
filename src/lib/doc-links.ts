/**
 * The name a document goes by in its link.
 *
 * Most documents are linked by their slug: /draft?type=nda. A few have a
 * public name that reads better in a shared link than the slug the database
 * keeps: the loan agreement is /draft?type=loanagreement (Rachel's call),
 * while its doc_types row, its drafts and its API stay "loan". The old link
 * still works and is moved to the new one.
 *
 * Pure: the page (server) and the catalogue (browser) both use it.
 */

/** slug → the name in the link. */
export const PUBLIC_SLUG: Record<string, string> = {
  loan: "loanagreement",
};

/** The link to start a document. */
export function draftHref(slug: string): string {
  return `/draft?type=${PUBLIC_SLUG[slug] ?? slug}`;
}

/** The ?type= of a link → the slug. "loanagreement" and "loan" are both the loan agreement. */
export function slugFromParam(param: string | null | undefined): string | undefined {
  const s = (param ?? "").trim().toLowerCase();
  if (!s) return undefined;
  const hit = Object.entries(PUBLIC_SLUG).find(([, name]) => name === s);
  return hit ? hit[0] : s;
}
