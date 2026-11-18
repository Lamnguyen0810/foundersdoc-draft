/**
 * Imported first by every FD Sign test (0243). It makes sure a test run can never reach a real
 * person or a real service, whatever is set on the machine it runs on:
 *
 *   - Supabase is switched off, so FD Sign uses its in-memory store (nothing is kept);
 *   - the email, Slack, WhatsApp and SMS settings are removed, so nothing can be sent;
 *   - the network is closed: any request is recorded and refused, and the tests check the list;
 *   - the signing code is switched on in its preview form, which returns the code instead of
 *     emailing it, so the whole flow can be followed: send, code, sign, signed copy;
 *   - Slack lines are kept in a list instead of being posted, so the tests can read them.
 */
for (const k of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SIGN_HOOK_URL",
  "SIGN_SLACK_HOOK_URL",
  "FD_SIGN_ACTIVITY_HOOK_URL",
  "FD_SIGN_SLACK_CHANNEL",
  "FD_SIGN_PHONE_CHANNELS",
  "FD_SIGN_PRICING",
  "FD_SIGN_PREVIEW_TIER",
  "FD_SIGN_DAILY_LIMIT",
  "SIGN_PHONE_PREVIEW",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "SLACK_QUIET_EMAILS",
])
  delete process.env[k];
process.env.SIGN_CODE_PREVIEW = "1";
process.env.SIGN_SLACK_PREVIEW = "1";

/** Every address a test tried to reach. Nothing is ever sent: each request is refused. */
export const network: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  network.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  throw new Error("The network is closed in tests.");
}) as typeof fetch;

/** What FD Sign would have posted to Slack, in order ("[slack]" = Founders Doc's own, "[slack:fd-sign]" = the activity lines). */
export const slackLines: Array<{ channel: "esop" | "activity"; text: string }> = [];
const log = console.log.bind(console);
console.log = (...a: unknown[]) => {
  if (a[0] === "[slack]") return void slackLines.push({ channel: "esop", text: String(a[1] ?? "") });
  if (a[0] === "[slack:fd-sign]") return void slackLines.push({ channel: "activity", text: String(a[1] ?? "") });
  log(...a);
};

/** Start each test with an empty store. */
export function emptyStore(): void {
  delete (globalThis as { __fdsign?: unknown }).__fdsign;
  slackLines.length = 0;
}
