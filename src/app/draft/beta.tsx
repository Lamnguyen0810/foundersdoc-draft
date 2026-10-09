/**
 * Documents the site offers but still calls Beta: they draft, and the
 * firm is still reading early output closely. Add a slug here to show the
 * Beta badge in the catalogue and above the conversation; remove it when
 * the lawyers are happy. The NDA is the reference product and never Beta.
 */
export const BETA_SLUGS: ReadonlySet<string> = new Set(["term", "employment", "contractor", "cofounder", "sha", "spa", "ssa", "ia"]);

export function isBeta(slug: string | null | undefined): boolean {
  return Boolean(slug) && BETA_SLUGS.has(slug as string);
}

/** The badge itself, so every screen shows the same word the same way. */
export function BetaBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`pill beta ${className}`.trim()} title="Early release — please read the draft carefully before relying on it">
      Beta
    </span>
  );
}
