/**
 * Answers in progress, kept on the device (0241).
 *
 * Every drafting screen kept its unfinished answers in the tab
 * (sessionStorage) so a reload would bring them back. Two things were wrong:
 *
 *   1. They never came back. Each screen writes the stash whenever the
 *      answers change — including once on opening, when there are none — and
 *      that first empty write landed before the screen had read the stash.
 *      The NDA was the only document that restored.
 *   2. A tab is too small a place. Someone who runs out of credits buys
 *      more, and comes back in a new tab or the next day.
 *
 * So the stash now lives in localStorage, under the account it belongs to
 * (a short hash of the email, so a second account on the same computer never
 * sees it), for STASH_DAYS. An empty set of answers is never written, and a
 * stash is dropped when the draft is made. A stash an older version left in
 * the tab is still read once.
 *
 * It holds what the person typed, parties' details included, which is why it
 * expires, is cleared on drafting, and is cleared for everyone on this
 * computer when someone signs out (clearAllStashes, on the sign-out
 * buttons). Nothing here leaves the browser.
 */

export const STASH_DAYS = 7;

function ownerKey(key: string, email: string | null | undefined): string {
  let h = 5381;
  for (const c of (email ?? "guest").toLowerCase()) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return `${key}:${h.toString(36)}`;
}

const hasAnswers = (s: unknown): boolean => {
  const a = (s as { answers?: unknown } | null)?.answers;
  return !!a && typeof a === "object" && Object.keys(a as object).length > 0;
};

/** The stashed state as JSON, or null when there is none worth restoring. */
export function readStash(key: string, email: string | null | undefined): string | null {
  try {
    const mine = ownerKey(key, email);
    const raw = localStorage.getItem(mine) ?? sessionStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as { at?: number };
    if (!hasAnswers(s)) return null;
    if (typeof s.at === "number" && Date.now() - s.at > STASH_DAYS * 86_400_000) {
      localStorage.removeItem(mine);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/** Keep the state. A screen that has just opened, with no answers yet, writes nothing. */
export function writeStash(key: string, email: string | null | undefined, state: object): void {
  if (!hasAnswers(state)) return;
  try {
    localStorage.setItem(ownerKey(key, email), JSON.stringify({ ...state, at: Date.now() }));
  } catch {
    /* private mode, or storage full: the answers stay on the screen */
  }
}

/** The draft is made (or the person starts again): nothing left to restore. */
export function dropStash(key: string, email: string | null | undefined): void {
  try {
    localStorage.removeItem(ownerKey(key, email));
    sessionStorage.removeItem(key);
  } catch {
    /* fine */
  }
}

/** Signing out: nothing half-finished is left behind on a shared computer. */
export function clearAllStashes(): void {
  try {
    for (const store of [localStorage, sessionStorage]) {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && /^fdai\.[a-z]+-in-progress(:|$)/.test(k)) keys.push(k);
      }
      keys.forEach((k) => store.removeItem(k));
    }
  } catch {
    /* fine */
  }
}
