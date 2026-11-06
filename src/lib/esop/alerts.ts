import { fmtDay, schedule, today, type EsopBatch, type EsopHolder } from "./vesting";

/**
 * Vesting alerts by email (123): the days before a vesting the client chose in
 * Settings (e.g. 14, 7 and 0 = two weeks, one week, the day), to the people they
 * ticked plus any extra addresses. Pure code: the cron route and the tests use it.
 */

export interface DueAlert {
  ref: string;
  date: string;
  daysBefore: number;
  certificates: number;
  leavers: number;
  names: string[];
}

/** The vestings that need an alert today, for one company. */
export function dueAlerts(holders: EsopHolder[], batches: EsopBatch[], days: number[], now: Date = today()): DueAlert[] {
  if (!days.length) return [];
  return schedule(holders, batches, now)
    .filter((r) => days.includes(r.daysLeft) && r.certificates > 0)
    .map((r) => ({
      ref: `B${r.batch}-T${r.tranche}`,
      date: r.date,
      daysBefore: r.daysLeft,
      certificates: r.certificates,
      leavers: r.leavers,
      names: holders
        .filter((h) => h.status === "Active" && h.batch === r.batch)
        .map((h) => (h.legal_name?.trim() || h.name).trim())
        .sort((a, b) => a.localeCompare(b)),
    }));
}

/** Who gets it: the people ticked in Settings and the extra addresses, once each; a simulation sends to its own address only. */
export function alertRecipients(memberEmails: string[], extra: string[], override: string | null): string[] {
  if (override?.trim()) return [override.trim().toLowerCase()];
  return [...new Set([...memberEmails, ...extra].map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const whenText = (d: number) => (d === 0 ? "today" : d === 1 ? "tomorrow" : d % 7 === 0 ? `in ${d / 7} week${d === 7 ? "" : "s"}` : `in ${d} days`);

export function alertEmail(company: string, a: DueAlert, link: string) {
  const when = whenText(a.daysBefore);
  const subject = `${company} ESOP: ${a.certificates} holder${a.certificates === 1 ? "" : "s"} vest ${when} (${fmtDay(a.date)})`;
  const list = a.names.slice(0, 25);
  const more = a.names.length - list.length;
  const text = [
    `${company} ESOP · ${a.ref.replace("B", "Batch ").replace("-T", " · Tranche ")}`,
    `Vests ${when}: ${fmtDay(a.date)}`,
    "",
    `Who vests (${a.certificates}): ${list.join(", ")}${more > 0 ? ` and ${more} more` : ""}`,
    a.leavers ? `Leavers in this batch (no certificate): ${a.leavers}` : "",
    "",
    "Next: approve the option certificates on the dashboard, then have them signed.",
    link,
    "",
    "You get this because you are on the alert list in the ESOP dashboard's Settings.",
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Inter,Arial,sans-serif;color:#161616">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e9e9e9;border-radius:10px">
<tr><td style="background:#0f0f0f;padding:16px 24px;border-radius:10px 10px 0 0"><span style="display:inline-block;color:#ffffff;font-size:11px;letter-spacing:3px;text-transform:uppercase">Founders Doc</span></td></tr>
<tr><td style="padding:24px">
<div style="font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#6b4e00">${esc(company)} ESOP · vesting ${esc(when)}</div>
<div style="font-size:26px;font-weight:600;margin:6px 0 4px">${esc(fmtDay(a.date))}</div>
<div style="font-size:14px;color:#4a4a4a">Batch ${esc(a.ref.split("-T")[0].slice(1))} · Tranche ${esc(a.ref.split("-T")[1])} · ${a.certificates} holder${a.certificates === 1 ? "" : "s"}${a.leavers ? ` · ${a.leavers} leaver${a.leavers === 1 ? "" : "s"} skipped` : ""}</div>
<div style="margin:18px 0 6px;font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#666">Who vests</div>
<div style="font-size:14px;line-height:1.7">${list.map(esc).join("<br>")}${more > 0 ? `<br><span style="color:#666">and ${more} more</span>` : ""}</div>
<div style="margin:22px 0 8px"><a href="${esc(link)}" style="display:inline-block;background:#f3bf4b;color:#0f0f0f;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:6px">Open the vesting</a></div>
<div style="font-size:12px;color:#666;line-height:1.5">Next: approve the option certificates on the dashboard, then have them signed.</div>
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #f0f0f0;font-size:11px;color:#9a9a9a">You get this because you are on the alert list in the ESOP dashboard's Settings. Its Admin can change who is told, and when.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
