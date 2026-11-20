import "server-only";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/sign/notify";
import { maskEmail } from "@/lib/sign/code";
import { postToSlack } from "@/lib/sign/slack";
import { holderNoteEmail, noteCc, type NoteCc } from "./holder-note";
import { loadDue } from "./zap";

/**
 * Send each option holder of a vesting their note (0256), from the website.
 *
 * Checked like every other Zapier call: by the company's key, in the database. Only an approved
 * vesting, and once only: the claim is written first (esop_alert_log, days_before = -1), so a
 * second call, or two at the same moment, sends nothing. `dry` shows who would be emailed and
 * who would be copied without sending or claiming anything.
 */

/** esop_alert_log keeps one row per vesting and timing; -1 is "the holders' notes went". */
const NOTES = -1;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type NotesResult =
  | { status: "not_allowed" | "not_found" | "not_approved" | "no_holders" | "already_sent" | "unavailable" }
  | { status: "dry" | "sent"; ref: string; simulation: boolean; to: string[]; cc: string[]; sent: number; failed: number };

export async function sendHolderNotes(key: string, slug: string, ref: string, dry: boolean, cc: NoteCc = "all"): Promise<NotesResult> {
  const { data, error } = await loadDue(key, slug, 0, ref);
  if (error) return { status: /not allowed/.test(error.message ?? "") ? "not_allowed" : "not_found" };
  const item = data?.items?.[0] as (NonNullable<typeof data>["items"][number] & { contact_email?: string; simulation?: boolean }) | undefined;
  if (!item) return { status: "not_found" };
  if (!item.done) return { status: "not_approved" };
  const simulation = Boolean(item.simulation);
  const holders = item.holders.filter((h) => EMAIL.test((h.email ?? "").trim()));
  if (!holders.length) return { status: "no_holders" };

  const company = data?.company ?? slug;
  const mail = holderNoteEmail({ company, slug, vest_date_text: item.vest_date_text });
  const ccOf = (to: string) => noteCc(to, item.contact_email, simulation, cc);
  const shown = { ref: item.ref, simulation, to: holders.map((h) => maskEmail(h.email.trim())), cc: ccOf(holders[0].email).map(maskEmail) };
  if (dry) return { status: "dry", ...shown, sent: 0, failed: 0 };

  if (!isAdminClientConfigured()) return { status: "unavailable" };
  const db = supabaseAdmin();
  const c = await db.from("esop_companies").select("id").eq("slug", slug).maybeSingle();
  const companyId = (c.data as { id?: string } | null)?.id;
  if (!companyId) return { status: "not_found" };
  /* claim it first: a second call finds the row and sends nothing */
  const claim = await db.from("esop_alert_log").insert({ company_id: companyId, ref: item.ref, days_before: NOTES, recipients: holders.length });
  if (claim.error) return { status: /duplicate|23505/i.test(`${claim.error.code ?? ""} ${claim.error.message ?? ""}`) ? "already_sent" : "unavailable" };

  let sent = 0;
  for (const h of holders) {
    const to = h.email.trim();
    if (await sendEmail({ kind: "esop_vesting_note", to, name: h.name, subject: mail.subject, html: mail.html, text: mail.text, link: "https://foundersdoc.com", cc: ccOf(to) })) sent++;
  }
  const failed = holders.length - sent;
  /* nothing went at all (emails off, or the hand-over failed): give the claim back so it can be tried again */
  if (sent === 0) await db.from("esop_alert_log").delete().eq("company_id", companyId).eq("ref", item.ref).eq("days_before", NOTES);
  await postToSlack(
    sent === 0 ? `⚠️ Vesting emails NOT sent to the ${holders.length} option holder(s): the email hand-over failed.` : `✉️ Vesting email sent to ${sent} option holder${sent === 1 ? "" : "s"}${failed ? ` · ${failed} FAILED` : ""}${shown.cc.length ? ` · cc ${shown.cc.length}` : ""}`,
    item.ref,
    item.slack_ts ?? null,
    simulation,
  );
  return { status: "sent", ...shown, sent, failed };
}
