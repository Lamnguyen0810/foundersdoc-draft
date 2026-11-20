/**
 * Test mode for the ESOP and FD Sign Zaps (0199).
 *
 * A simulation (esop_companies.email_override, 109) already sends every email
 * to one Founders Doc inbox. This adds the same for the rest of what the Zaps do:
 *
 *   slack_channel  the Slack channel the Zap posts to. Live: ESOP_SLACK_CHANNEL
 *                  (#hitpay-esop). Simulation: TEST_SLACK_CHANNEL, a private
 *                  channel only the tester is in, so every Slack step still runs
 *                  and succeeds but nobody else is notified.
 *   cc_emails      who gets a copy of the Zap's emails. Live: ESOP_CC_EMAILS
 *                  (e.g. fd.admin@, administrator@). Simulation: the simulation
 *                  inbox only, so nothing reaches Rachel or admin while testing.
 *
 * In each Zap, map the Slack step's Channel (custom value) to slack_channel and
 * the email step's CC to cc_emails. Empty env = the Zap's own default is kept.
 */
const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function slackChannel(simulation: boolean): string {
  const live = process.env.ESOP_SLACK_CHANNEL?.trim() ?? "";
  const test = process.env.TEST_SLACK_CHANNEL?.trim() ?? "";
  return simulation ? test || live : live;
}

export function ccEmails(simulationTo: string | null | undefined): string {
  const sim = (simulationTo ?? "").trim();
  if (sim) return sim.includes("@") ? sim : "";
  return list(process.env.ESOP_CC_EMAILS).join(", ");
}

/**
 * True CC (0254). The email Zap's CC field is mapped to the `cc` the website sends, so copies go on
 * the client's own email as a CC line.
 *
 * 0257: this is now the rule, not a switch to turn on: the first real approval email (20 Nov 2026)
 * went with separate "[Copy]" emails because the switch had not been set yet, and Rachel asked for
 * a CC line from the start. ESOP_TRUE_CC=0 is the only way back to separate copies (for a day the
 * Zap's CC field is not mapped).
 */
export const trueCc = () => process.env.ESOP_TRUE_CC?.trim() !== "0";

/** The fields every Zap payload carries. */
export function testModeFields(simulationTo: string | null | undefined) {
  const simulation = Boolean((simulationTo ?? "").trim());
  return { test_mode: simulation, slack_channel: slackChannel(simulation), cc_emails: ccEmails(simulationTo) };
}
