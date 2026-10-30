import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * The ESOP dashboard's list, for Zapier (supabase/106).
 *
 * Zapier has no login, so it calls /api/esop/zap/* with a private key per
 * company. The key is checked inside the database (esop_due / esop_record,
 * security definer, key stored hashed), so this file uses the public client
 * and holds no secret of its own.
 */

function anon() {
  return createClient(supabaseUrl()!, supabasePublishableKey()!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface DueHolder {
  holder_id: string;
  name: string;
  email: string;
  id_no: string;
  options: number;
  certificate_no: string;
  nationality?: string;
  grant_date_text?: string;
}
export interface DueLeaver {
  name: string;
  leaver_type: string;
  last_day: string | null;
}
export interface DueItem {
  ref: string;
  batch: number;
  tranche: number;
  vest_date: string;
  vest_date_text: string;
  days_left: number;
  done: boolean;
  invoice_no: string | null;
  approved_by?: string | null;
  slack_ts?: string | null;
  holders: DueHolder[];
  leavers: DueLeaver[];
}
interface DueResult {
  company: string;
  slug: string;
  today: string;
  target: string | null;
  items: DueItem[];
}

export async function loadDue(key: string, slug: string, days: number, ref: string | null) {
  const { data, error } = await anon().rpc("esop_due", { p_key: key, p_slug: slug, p_days: days, p_ref: ref });
  return { data: data as DueResult | null, error };
}

export async function record(key: string, slug: string, payload: Record<string, unknown>) {
  const { data, error } = await anon().rpc("esop_record", { p_key: key, p_slug: slug, p_payload: payload });
  return { data: data as Record<string, unknown> | null, error };
}

const n = (v: number) => v.toLocaleString("en-GB");

/** The Slack alert, same wording as the alert Rachel has seen. */
export function alertText(company: string, it: DueItem, approveUrl = ""): string {
  const test = /test/i.test(company);
  const plain = company.replace(/\s*\(test\)\s*/i, "").trim();
  const when = it.days_left === 0 ? "vests today" : it.days_left === 1 ? "vests tomorrow" : `vests in ${it.days_left} days`;
  const gets = it.holders.length ? it.holders.map((h) => `${h.name} (${n(h.options)})`).join(", ") : "nobody";
  const leaves = it.leavers.length ? it.leavers.map((l) => `${l.name} (${l.leaver_type})`).join(", ") : "none";
  return [
    `${test ? "[TEST] " : ""}:date: ${plain} ESOP — Batch ${it.batch}, Tranche ${it.tranche} ${when} (${it.vest_date_text})`,
    `:white_check_mark: Gets a certificate (${it.holders.length}): ${gets}`,
    `:door: Leavers, no certificate: ${leaves}`,
    it.done
      ? `:lock: Already approved${it.approved_by ? ` by ${it.approved_by}` : ""}.`
      : approveUrl
        ? `:point_right: <${approveUrl}|Review & approve on the dashboard> (payment link, certificates and emails go out only after approval)`
        : "Waiting for approval on the ESOP dashboard.",
    `Ref: ${it.ref}`,
  ].join("\n");
}

/** The firm's usual confirmation message to the client, filled in, to copy. */
export function confirmText(company: string, it: DueItem): string {
  const plain = company.replace(/\s*\(test\)\s*/i, "").trim();
  const list = it.holders.length
    ? it.holders.map((h, i) => `    ${String.fromCharCode(97 + (i % 26))}. ${h.name}: ${n(h.options)} options`).join("\n")
    : "    a. (none)";
  return [
    "Hi Aditya,",
    "",
    "Hope all is well!",
    "",
    `*FD x ${plain} | ESOP Administration*`,
    "",
    `1. *Batch ${it.batch}.* We note that as of ${it.vest_date_text}, additional Non-Voting Ordinary Shares have vested for *Batch ${it.batch}* (Tranche ${it.tranche}) option holders, which are:`,
    list,
    "2. *Next Steps.* Kindly confirm the same, and we will continue to: (a) issue the invoice; and (b) circulate the option certificates.",
    "",
    "Many thanks! :slightly_smiling_face:",
  ].join("\n");
}
