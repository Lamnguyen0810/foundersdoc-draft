/**
 * Accounts Slack is not told about when they download a document: the team's
 * own test accounts, so the channel only shows real customers.
 *
 * More can be added without a deploy-time code change: SLACK_QUIET_EMAILS in
 * the environment, comma-separated. Matching ignores case and spaces.
 */
const BUILT_IN = ["nguyenhoanglam.first@gmail.com"];

export function isQuietAccount(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  const extra = (process.env.SLACK_QUIET_EMAILS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return BUILT_IN.includes(e) || extra.includes(e);
}
