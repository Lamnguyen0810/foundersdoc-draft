/**
 * The one Slack message that says a vesting was approved (0257).
 *
 * Rachel, 20 Nov 2026: at the approval four messages landed at once (the approval and the payment
 * link in one, then a line for each option holder), and she had to read all of them to learn that
 * Aditya had approved, so she asked him again. One message now: who approved, in bold, on the first
 * line; the date and time; then what happens next.
 *
 * The website writes it and hands it to the Approved Zap as `slack_text`, so the wording lives here,
 * not in a Zapier text box. The same words in a simulation and for real. Pure, so it can be tested.
 */

type Item = Record<string, unknown> & { holders?: Array<Record<string, unknown>> };

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim();

/** "Fri, 20 Nov 2026 at 5:34 pm SGT": Founders Doc reads it in Singapore time. */
export function sgTime(iso: string | null | undefined, now: Date = new Date()): string {
  const t = iso ? new Date(iso) : now;
  const d = Number.isNaN(t.getTime()) ? now : t;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d);
  const p = (k: string) => parts.find((x) => x.type === k)?.value ?? "";
  return `${p("weekday")}, ${p("day")} ${p("month")} ${p("year")} at ${p("hour")}:${p("minute")} ${p("dayPeriod").toLowerCase().replace(/\./g, "")} SGT`;
}

/** "No. 48 to 50", "No. 48", "No. 48, 50, 53"; "" when not numbered yet. */
export function certificateNumbers(holders: Array<Record<string, unknown>>): string {
  const ns = holders.map((h) => Number(str(h.certificate_no))).filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  if (!ns.length || ns.length !== holders.length) return "";
  if (ns.length === 1) return `No. ${ns[0]}`;
  const run = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
  return run ? `No. ${ns[0]} to ${ns[ns.length - 1]}` : `No. ${ns.join(", ")}`;
}

export function approvedSlackText(item: Item, p: { origin: string; slug: string; ref: string; approvedBy: string; now?: Date }): string {
  const holders = item.holders ?? [];
  const n = holders.length;
  const company = str(item.company).replace(/\s*\(test\)\s*/i, "").trim() || p.slug;
  const raw = str(item.approved_by) || p.approvedBy.trim();
  const byEmail = /\(email\)\s*$/i.test(raw) || raw.toLowerCase() === "email";
  const by = raw.replace(/\s*\(email\)\s*$/i, "").trim();
  const first = str(item.contact_name).split(/\s+/)[0] ?? "";
  /* the client's own contact (in a simulation, the inbox standing in for them): by first name, as Rachel reads it */
  const contact = str(item.contact_email).toLowerCase();
  const isContact = Boolean(first) && ((by.includes("@") && by.toLowerCase() === contact) || (byEmail && !by.includes("@")));
  const head = isContact ? `${first} has approved` : by.includes("@") ? `Approved by ${by}` : "Approved";
  const nos = certificateNumbers(holders);
  const payer = first || "the client";
  return [
    `:white_check_mark: *${head}* · ${company} ESOP ${p.ref}`,
    `:clock3: ${sgTime(str(item.approved_at) || null, p.now)} · ${byEmail ? "from the approval email" : "on the dashboard"}`,
    `:scroll: ${n} option certificate${n === 1 ? "" : "s"}${nos ? ` (${nos})` : ""} · vesting ${str(item.vest_date_text)}`,
    "",
    "*What happens next*",
    `:one: *Payment.* The payment email goes to ${payer} now. We wait for payment.`,
    `:two: *Signing.* Once paid, we send the certificate${n === 1 ? "" : "s"} for signing: <${p.origin}/admin/sign?ref=${p.ref}|Admin → Sign>`,
    `:three: *Filing.* ${first || "The Director"} signs, then each option holder signs. The signed copies are filed on the dashboard.`,
  ].join("\n");
}
