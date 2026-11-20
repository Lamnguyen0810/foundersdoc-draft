import "server-only";
import { postToSlack } from "@/lib/sign/slack";

/**
 * Alarms for the ESOP flow (0255). On 20 Nov 2026 a client approved a vesting and the Zap step that
 * hands the Stripe link back held the wrong key: the website answered "Not found", the payment
 * email never went, and nothing told anyone. The Slack line a moment later still read as if all
 * was well. These post in the ESOP channel the moment such a thing happens.
 */

const last = new Map<string, number>();
const QUIET_MS = 10 * 60_000;

const WHAT: Record<string, string> = {
  payment: "The Stripe link was NOT saved and the payment email has NOT been sent to the client.",
  paid: "The payment was NOT recorded. Press Mark as paid on the dashboard if the money is in.",
  approved: "The approval was NOT recorded on the dashboard.",
  certificate: "A certificate link was NOT saved on the holder.",
  alert: "The alert's Slack thread was NOT saved.",
  due: "The daily vesting alert could NOT read the list, so no alert went out.",
};

/** A Zap called with a key that does not match this company's. At most one alarm every 10 minutes for the same thing. */
export async function wrongKeyAlarm(slug: string, action: string, ref: string | null): Promise<void> {
  const k = `${slug}|${action}`;
  const now = Date.now();
  if (now - (last.get(k) ?? 0) < QUIET_MS) return;
  last.set(k, now);
  const safeRef = ref && /^B\d{1,3}-T\d{1,2}$/i.test(ref) ? ref.toUpperCase() : null;
  await postToSlack(wrongKeyText(slug, action), safeRef, null, false);
}

/** The alarm's words (pure, for the tests). */
export function wrongKeyText(slug: string, action: string): string {
  return `⚠️ A Zap called the ${slug} ESOP dashboard with a key that does not match, so that step did nothing. ${WHAT[action] ?? "The step was refused."} Fix: put the right key in that Zap step's Authorization header, publish, then do the step again by hand.`;
}

/** A real approval email was about to go to one of our own addresses standing in for the client's. */
export async function standInAlarm(slug: string, ref: string): Promise<void> {
  await postToSlack(`⚠️ The approval email was NOT sent: the client's contact on the ${slug} dashboard is still a Founders Doc address. Put the client's own email there, then send it again.`, ref, null, false);
}
