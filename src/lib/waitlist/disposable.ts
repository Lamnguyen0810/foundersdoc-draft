/**
 * Throwaway inboxes.
 *
 * Three documents are given away with every account, and every one of them is
 * a call to Gemini that the firm pays for. Without some limit, one person with
 * a script and a temp-mail domain has an unlimited supply.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 * It is not a work-email rule. Gmail, Outlook, Yahoo and iCloud are all fine,
 * because most founders in Singapore use one and turning them away would cost
 * far more than the credits ever could. It refuses only addresses at services
 * whose entire purpose is to be forgotten in ten minutes.
 *
 * ── AND IT IS NOT A WALL ────────────────────────────────────────────────────
 * Anyone determined can register a domain for a few dollars and walk straight
 * past this. It is a speed bump against the casual case, which is the only
 * case a list like this ever catches. The real controls are the switch in
 * signup_config and the fact that the credits expire in a fortnight.
 *
 * Kept deliberately short. A ten-thousand-domain list goes stale, ships a
 * hundred kilobytes to no purpose, and eventually refuses somebody real.
 */

const THROWAWAY = new Set([
  "0-mail.com",
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "temp-mail.org",
  "tempmail.com",
  "tempmailo.com",
  "tempr.email",
  "temp-mail.io",
  "tmpmail.org",
  "mailinator.com",
  "mailinator.net",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "sharklasers.com",
  "grr.la",
  "spam4.me",
  "yopmail.com",
  "yopmail.net",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "dispostable.com",
  "fakeinbox.com",
  "getnada.com",
  "nada.email",
  "maildrop.cc",
  "mailnesia.com",
  "mohmal.com",
  "emailondeck.com",
  "burnermail.io",
  "mytemp.email",
  "moakt.com",
  "luxusmail.org",
  "inboxkitten.com",
  "harakirimail.com",
  "spambog.com",
  "mailcatch.com",
  "anonbox.net",
  "einrot.com",
  "tempinbox.com",
  "vomoto.com",
  "byom.de",
]);

/** The bit after the @, lower-cased. Null if there is no sensible one. */
export function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * Is this a throwaway inbox?
 *
 * Subdomains count: `x.mailinator.com` is Mailinator. Checked by walking the
 * labels rather than by `endsWith`, so "notmailinator.com" — a real domain
 * somebody could own — is not caught by a string that happens to end the same
 * way.
 */
export function isThrowaway(email: string): boolean {
  const domain = domainOf(email);
  if (!domain) return false;

  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (THROWAWAY.has(labels.slice(i).join("."))) return true;
  }
  return false;
}
