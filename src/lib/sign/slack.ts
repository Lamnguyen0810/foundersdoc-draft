import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import type { Envelope, SignStore } from "./store";
import { slackChannel } from "@/lib/esop/test-mode";

/**
 * FD Sign progress in Slack, so everyone at Founders Doc sees what went out
 * and who signed (Rachel: "everyone cc-ed should be notified"). A separate
 * Zapier Catch Hook (SIGN_SLACK_HOOK_URL, kept in Vercel) posts "text" to
 * #hitpay-esop, in the vesting's thread when there is one ("thread_ts").
 * Not set = nothing is posted. Code emails are never posted.
 */
export function isSlackConfigured(): boolean {
  return /^https:\/\/hooks\.zapier\.com\//.test(process.env.SIGN_SLACK_HOOK_URL?.trim() ?? "");
}

/** The ESOP vesting a certificate belongs to (e.g. B8-T2) and its Slack thread, if any. */
async function vesting(env: Envelope): Promise<{ ref: string | null; thread_ts: string | null; simulation?: boolean }> {
  if (!env.esop_holder_id || !env.esop_tranche || !isSupabaseConfigured() || !isAdminClientConfigured()) return { ref: null, thread_ts: null };
  try {
    const db = supabaseAdmin();
    const h = (await db.from("esop_holders").select("batch, company_id").eq("id", env.esop_holder_id).maybeSingle()).data as { batch: number; company_id: string } | null;
    if (!h) return { ref: null, thread_ts: null };
    const ref = `B${h.batch}-T${env.esop_tranche}`;
    const a = (await db.from("esop_alerts").select("slack_ts").eq("company_id", h.company_id).eq("ref", ref).maybeSingle()).data as { slack_ts: string } | null;
    const c = (await db.from("esop_companies").select("email_override").eq("id", h.company_id).maybeSingle()).data as { email_override: string | null } | null;
    return { ref, thread_ts: a?.slack_ts ?? null, simulation: Boolean(c?.email_override?.trim()) };
  } catch {
    return { ref: null, thread_ts: null };
  }
}

/** Post straight to #hitpay-esop (in a vesting's thread when given); simulation = the tester's own channel (0199). */
export async function postToSlack(text: string, ref: string | null, threadTs: string | null, simulation = false): Promise<void> {
  if (process.env.SIGN_SLACK_PREVIEW === "1" && !isSupabaseConfigured()) return void console.log("[slack]", text);
  const hook = process.env.SIGN_SLACK_HOOK_URL?.trim();
  if (!hook || !isSlackConfigured() || !text) return;
  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: ref ? `*${ref}* · ${text}` : text, ref: ref ?? "", thread_ts: threadTs ?? "", slack_channel: slackChannel(simulation), test_mode: simulation }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error("[esop] slack hand-over failed:", e);
  }
}

export async function slack(store: SignStore, envelopeIds: string[], text: string): Promise<void> {
  /* people's own requests (FD Sign for everyone, SQL 119) are private: never posted */
  if (envelopeIds.length && (await store.ownerOf(envelopeIds[0]).catch(() => null))) return;
  /* local preview: print instead of posting */
  if (store.kind === "memory" && process.env.SIGN_SLACK_PREVIEW === "1") return void console.log("[slack]", text);
  const hook = process.env.SIGN_SLACK_HOOK_URL?.trim();
  if (!hook || !isSlackConfigured() || !text) return;
  const env = envelopeIds.length ? await store.envelope(envelopeIds[0]) : null;
  const v = env ? await vesting(env) : { ref: null, thread_ts: null };
  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: v.ref ? `*${v.ref}* · ${text}` : text, ref: v.ref ?? "", thread_ts: v.thread_ts ?? "", slack_channel: slackChannel(Boolean(v.simulation)), test_mode: Boolean(v.simulation) }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error("[sign] slack hand-over failed:", e);
  }
}

/** "3 documents" / the title of one */
export const what = (titles: string[]) => (titles.length === 1 ? titles[0] : `${titles.length} documents`);
