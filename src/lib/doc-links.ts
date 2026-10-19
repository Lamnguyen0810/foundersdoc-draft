/**
 * The name a document goes by in its link.
 *
 * Every document's link says its full name (Rachel's rule): the loan
 * agreement is /draft?type=loanagreement, the services agreement
 * /draft?type=servicesagreement. The database keeps the short slug — its
 * doc_types row, its drafts and its API stay "loan", "services" — and an old
 * short link still works: the page moves it to the full one.
 *
 * A new document: add its slug here, as its label in lower case without
 * spaces or punctuation.
 *
 * Pure: the page (server) and the catalogue (browser) both use it.
 */

/** slug → the name in the link. */
export const PUBLIC_SLUG: Record<string, string> = {
  nda: "nondisclosureagreement",
  term: "termsheet",
  employment: "employmentagreement",
  contractor: "contractoragreement",
  cofounder: "cofounderagreement",
  sha: "shareholdersagreement",
  spa: "sharepurchaseagreement",
  ssa: "sharesubscriptionagreement",
  ia: "investmentagreement",
  services: "servicesagreement",
  loan: "loanagreement",
  cln: "convertibleloanagreement",
  ipaa: "ipassignmentagreement",
  jva: "jointventureagreement",
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
