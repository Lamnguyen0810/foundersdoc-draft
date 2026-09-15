import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Credits, from the server's point of view.
 *
 * Every function here acts AS THE SIGNED-IN USER — the ordinary client, bound
 * by row-level security. None of this needs the admin client, because a person
 * spending their own credit is exactly what the policies already allow.
 *
 * When Supabase is not configured the app runs unauthenticated and unmetered,
 * which is what makes local development possible without a billing setup.
 */

export interface Wallet {
  credits: number;
  trialEndsAt: string | null;
  /** True while the free week is still running. */
  inTrial: boolean;
}

export async function getWallet(): Promise<Wallet> {
  if (!isSupabaseConfigured()) return { credits: Infinity, trialEndsAt: null, inTrial: false };
  try {
    const supabase = await createClient();
    const [{ data: credits }, { data: ends }] = await Promise.all([
      supabase.rpc("credit_balance"),
      supabase.rpc("trial_ends_at"),
    ]);
    const trialEndsAt = (ends as string | null) ?? null;
    return {
      // `null` here means the RPC is absent (billing not installed yet), which
      // is unmetered — not a balance of zero. The rail then shows nothing
      // rather than telling a working installation it has run out.
      credits: credits === null || credits === undefined ? Infinity : Number(credits),
      trialEndsAt,
      inTrial: Boolean(trialEndsAt && new Date(trialEndsAt) > new Date()),
    };
  } catch {
    // Billing that cannot be read must not lock people out of a product they
    // may well have paid for. Fail open here; the spend itself still fails
    // closed, which is the one that protects the money.
    return { credits: Infinity, trialEndsAt: null, inTrial: false };
  }
}

/**
 * Take one credit. Returns the spend id (so it can be reversed) or null if
 * there were none.
 *
 * ── THE DISTINCTION THAT MATTERS ────────────────────────────────────────────
 * There are two very different reasons this can come back empty:
 *
 *   "You have no credits."     → refuse, show the paywall. Correct.
 *   "Billing isn't installed." → the migration has not been run on this
 *                                database yet, so consume_credit does not
 *                                exist.
 *
 * Treating the second like the first would lock every user out of drafting the
 * moment this code is deployed ahead of the SQL — a total outage caused by the
 * billing system before billing even exists. So a missing function means
 * UNMETERED: the app behaves exactly as it did before credits were introduced,
 * and says so once in the log. Deploy order stops being load-bearing.
 */
const BILLING_NOT_INSTALLED = new Set(["PGRST202", "42883"]);
let warnedNotInstalled = false;

/**
 * Returned instead of a spend id when an Unlimited member has reached the
 * fair-use ceiling. It is deliberately not a uuid and not null: null means
 * "you have run out, here is the paywall", which would be both wrong and
 * insulting to somebody paying S$88.80 a month.
 */
export const FAIR_USE_REACHED = "fair_use_reached";

export async function reserveCredit(): Promise<string | null> {
  if (!isSupabaseConfigured()) return "unmetered";
  const supabase = await createClient();

  /* ── A HARD CEILING ON HOW LONG BILLING MAY DELAY A DRAFT ─────────────────
     This call happens BEFORE the response starts streaming, so every second it
     spends is a second of silence for the person waiting — and if it runs long
     enough the whole request is killed by the platform and comes back as a
     bare 504. That is exactly what happened: a stuck row lock made this block
     for eleven seconds and climbing, and drafting failed three times in a row
     for a reason that had nothing to do with drafting.

     Five seconds, then give up and let the draft through. Handing out an
     occasional free document when the database is struggling is a far smaller
     problem than a product that does not work. */
  const rpc = supabase.rpc("consume_credit");
  const raced = await Promise.race([
    rpc,
    new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
      setTimeout(
        () => resolve({ data: null, error: { code: "APP_TIMEOUT", message: "billing timed out" } }),
        5000,
      ),
    ),
  ]);
  const { data, error } = raced as { data: unknown; error: { code?: string; message?: string } | null };

  if (error) {
    /* Two failures that must NOT look like "you have run out":
         55P03  the database could not get the lock in time (see 007_credit_lock.sql)
         APP_TIMEOUT  it did not answer at all
       Both mean the billing system is unwell. Refusing the draft would show a
       paywall to someone with a full balance, which is the worst possible
       moment to be wrong. */
    if (error.code === "55P03" || error.code === "APP_TIMEOUT" || /credit_lock_timeout/.test(error.message ?? "")) {
      console.error(
        "[credits] could not reserve a credit in time — letting this draft through unmetered.",
        error.code,
        error.message,
      );
      return "unmetered";
    }

    /* An Unlimited member who has hit the fair-use ceiling. Not a paywall:
       they are paying, and the right answer is a conversation. */
    if (/fair_use_reached/.test(error.message ?? "")) {
      return FAIR_USE_REACHED;
    }

    const missing =
      BILLING_NOT_INSTALLED.has(error.code ?? "") ||
      /could not find the function|does not exist/i.test(error.message ?? "");
    if (missing) {
      if (!warnedNotInstalled) {
        warnedNotInstalled = true;
        console.warn(
          "[credits] consume_credit() is not in this database — running UNMETERED. " +
            "Run supabase/004_billing.sql to switch credits on.",
        );
      }
      return "unmetered";
    }
    console.error("[credits] consume_credit failed:", error.code, error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/** Give it back — the draft never arrived. */
export async function refundCredit(spendId: string, reason: string): Promise<void> {
  if (!isSupabaseConfigured() || spendId === "unmetered") return;
  try {
    const supabase = await createClient();
    await supabase.rpc("refund_credit", { p_spend_id: spendId, p_reason: reason });
  } catch (err) {
    // Log loudly: this is someone's money.
    console.error("[credits] REFUND FAILED for spend", spendId, err);
  }
}

/** What is left, right now. Used to tell the browser after a draft is made. */
export async function currentBalance(): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("credit_balance");
    if (error || data === null || data === undefined) return null;
    return Number(data);
  } catch {
    return null;
  }
}

/** Record which draft the credit paid for, so it cannot also be refunded. */
export async function attachDraft(spendId: string, draftId: string): Promise<void> {
  if (!isSupabaseConfigured() || spendId === "unmetered") return;
  try {
    const supabase = await createClient();
    await supabase.rpc("attach_draft_to_spend", { p_spend_id: spendId, p_draft_id: draftId });
  } catch (err) {
    console.error("[credits] could not attach draft to spend:", err);
  }
}
