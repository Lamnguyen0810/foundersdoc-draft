import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import type { Envelope, SignStore } from "./store";
import { slackChannel } from "@/lib/esop/test-mode";
import { isQuietAccount } from "@/lib/quiet";
import { signExitLabel, type SignExitReason } from "./exit";

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

/* ── FD Sign activity (0221): people's own requests, step by step ───────────────────────────
   Rachel (12 Nov): "set up notification when someone wants to do signing, to which step".
   People's own requests stay private (SQL 119): these lines never carry the document title,
   the file, or the signers' names or emails: only the sender's account name and the step.
   They go to their own channel, FD_SIGN_SLACK_CHANNEL (a Slack channel ID, through the same
   Zap as SIGN_SLACK_HOOK_URL); 0232: #fdai-signing unless set, "off" = nothing is posted. The team's test accounts are skipped. */

export type SignStep = "started" | "left" | "sent" | "opened" | "code" | "signed" | "completed" | "stalled";

/** 0232: #fdai-signing by default (a channel ID, not a secret); FD_SIGN_SLACK_CHANNEL in Vercel overrides it, "off" stops the lines. */
const DEFAULT_ACTIVITY_CHANNEL = "C0BGDGZLTFG";

export function activityChannel(): string {
  const v = process.env.FD_SIGN_SLACK_CHANNEL?.trim() ?? "";
  if (v.toLowerCase() === "off") return "";
  return v || DEFAULT_ACTIVITY_CHANNEL;
}

/** 0234: FD Sign's own Zap ("FD Sign – activity to Slack", Catch Hook → Slack #fdai-signing).
 *  Where its address is kept, first found wins:
 *    1. FD_SIGN_ACTIVITY_HOOK_URL in Vercel;
 *    2. 0235: the locked public.webhooks table, row "fd_sign_activity" (set in the Supabase SQL editor, like the
 *       drafting hooks; nobody but the server can read it);
 *    3. the older shared hook, SIGN_SLACK_HOOK_URL. */
const ZAPIER = /^https:\/\/hooks\.zapier\.com\//;
let fromDb: { url: string; at: number } | null = null;
async function activityHook(): Promise<string> {
  const own = process.env.FD_SIGN_ACTIVITY_HOOK_URL?.trim() ?? "";
  if (ZAPIER.test(own)) return own;
  if (isSupabaseConfigured() && isAdminClientConfigured()) {
    if (!fromDb || fromDb.at < Date.now() - 5 * 60_000) {
      const r = await supabaseAdmin().from("webhooks").select("url").eq("name", "fd_sign_activity").eq("enabled", true).maybeSingle();
      fromDb = { url: ((r.data as { url?: string } | null)?.url ?? "").trim(), at: Date.now() };
    }
    if (ZAPIER.test(fromDb.url)) return fromDb.url;
  }
  return isSlackConfigured() ? (process.env.SIGN_SLACK_HOOK_URL?.trim() ?? "") : "";
}

export async function activity(text: string, senderEmail?: string | null): Promise<void> {
  if (isQuietAccount(senderEmail)) return;
  if (process.env.SIGN_SLACK_PREVIEW === "1" && !isSupabaseConfigured()) return void console.log("[slack:fd-sign]", text);
  const hook = await activityHook().catch(() => "");
  const channel = activityChannel();
  if (!hook || !channel || !text) return;
  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ref: "", thread_ts: "", slack_channel: channel, test_mode: false }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error("[sign] activity hand-over failed:", e);
  }
}

const WHO = (name: string | null | undefined, email: string | null | undefined) => (name?.trim() || (email ?? "").split("@")[0] || "Someone").slice(0, 80);

/** A signer's step on someone's own request: "👀 Ann Lee's request · signer 1 of 2 opened it". FD's own requests use slack() instead. */
export async function signerStep(store: SignStore, envelopeId: string, position: number, step: "opened" | "code" | "signed" | "completed"): Promise<void> {
  const o = await store.ownerOf(envelopeId).catch(() => null);
  if (!o?.owner_email) return;
  const all = await store.signers(envelopeId).catch(() => []);
  const n = all.length;
  const who = `${WHO(o.owner_name, o.owner_email)}'s request`;
  const of = n > 1 ? `signer ${position} of ${n}` : "the signer";
  const text =
    step === "opened"
      ? `👀 FD Sign · ${who} · ${of} opened it`
      : step === "code"
        ? `🔐 FD Sign · ${who} · ${of} confirmed their signing code`
        : step === "signed"
          ? `✍️ FD Sign · ${who} · ${of} signed${n > 1 ? ` (${all.filter((s) => s.status === "signed").length}/${n} done)` : ""}`
          : `✅ FD Sign · ${who} · completed${n > 1 ? `: all ${n} signed` : ""}`;
  await activity(text, o.owner_email);
}

/** The sender's own steps in /fd-sign/new: started, left partway, sent. */
export async function senderStep(
  name: string | null,
  email: string | null,
  step: "started" | "left" | "sent",
  detail: { step?: number; label?: string; signers?: number; pages?: number | null; reason?: SignExitReason | null; rating?: number | null; comment?: string | null } = {},
): Promise<void> {
  const who = WHO(name, email);
  /* 0233: the "Before you go" answer, when they gave one (the same lines as drafting's) */
  const said = step === "left" && (detail.reason || detail.rating || detail.comment);
  const feedback = said
    ? `\nReason: ${detail.reason ? signExitLabel(detail.reason) : "not given"} · Rating: ${detail.rating ? `${"★".repeat(detail.rating)}${"☆".repeat(5 - detail.rating)} (${detail.rating}/5)` : "not given"}` +
      (detail.comment ? `\n"${detail.comment}"` : "")
    : "";
  const text =
    step === "started"
      ? `🖊️ FD Sign · ${who} started a signing request (step 1 · Document)`
      : step === "left"
        ? `⏸ FD Sign · ${who} left at step ${detail.step ?? "?"} · ${detail.label ?? "?"}, nothing sent yet${feedback}`
        : `📤 FD Sign · ${who} sent a signing request to ${detail.signers ?? "?"} signer${detail.signers === 1 ? "" : "s"}${detail.pages ? ` (${detail.pages} pages)` : ""}`;
  await activity(text, email);
}

/* 0233: a download of a request's PDF, by the sender, a signer (their link) or someone sent a copy.
   Own requests only (FD's own ESOP certificates have no owner); never the title, the file or names. */
const downloads = new Map<string, number>();
export async function downloadStep(store: SignStore, envelopeId: string, by: { kind: "sender" } | { kind: "signer"; position: number } | { kind: "copy" }, signed: boolean): Promise<void> {
  const key = `${envelopeId}:${by.kind}:${by.kind === "signer" ? by.position : ""}`;
  const now = Date.now();
  if ((downloads.get(key) ?? 0) > now - 60_000) return; // one line a minute per person and document
  downloads.set(key, now);
  if (downloads.size > 5000) downloads.clear();
  const o = await store.ownerOf(envelopeId).catch(() => null);
  if (!o?.owner_email) return;
  const what = signed ? "the signed copy" : "the document";
  let text: string;
  if (by.kind === "sender") text = `⬇️ FD Sign · ${WHO(o.owner_name, o.owner_email)} downloaded ${what} of their request`;
  else {
    const n = (await store.signers(envelopeId).catch(() => [])).length;
    const whoDl = by.kind === "signer" ? (n > 1 ? `signer ${by.position} of ${n}` : "the signer") : "someone sent a copy";
    text = `⬇️ FD Sign · ${WHO(o.owner_name, o.owner_email)}'s request · ${whoDl} downloaded ${what}`;
  }
  await activity(text, o.owner_email);
}
