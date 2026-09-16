import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient, getUser } from "@/lib/supabase/server";
import { isStripeConfigured, stripe } from "@/lib/billing/stripe";
import { moneyIn } from "@/lib/billing/plans";

/**
 * End a membership, now.
 *
 * ── WHY NOT STRIPE'S CUSTOMER PORTAL ────────────────────────────────────────
 * Cancelling used to hand the customer to the portal. That failed in two ways
 * at once: the portal is a separate thing that has to be switched on in the
 * Stripe dashboard, and when it is not, the request fell through to a CHECKOUT
 * page — so somebody trying to cancel was shown a card form offering to sell
 * them the same plan again, priced in the wrong currency. A cancel button that
 * can take money is worse than no cancel button.
 *
 * So cancellation happens here, against the Stripe API directly. It cannot
 * charge anything, it works whether or not the portal exists, and it can ask
 * why — which the portal cannot.
 *
 * ── WHAT CANCELLING MEANS HERE ──────────────────────────────────────────────
 * Immediately, not at the end of the month. Three consequences, each deliberate:
 *
 *   The unused part of the month is REFUNDED to the card. Ending someone's
 *   access on the 10th while keeping the whole month's fee is the kind of thing
 *   that produces chargebacks, and a law firm should not be doing it.
 *
 *   The monthly allowance STOPS. Bought credits — bundles and top-ups — are
 *   left alone, because /billing promises in three places that they never
 *   expire and a cancellation is not a reason to break a promise.
 *
 *   Nothing is deleted. Past drafts stay readable; the membership stays on the
 *   account as a cancelled row, with the date and the reason, for the billing
 *   history page.
 *
 * Re-joining afterwards is just Checkout again, at any tier. There is no
 * half-cancelled state to resume from, which is what made the old plan-change
 * paths so fiddly.
 */
export const dynamic = "force-dynamic";

/** The closed list the dialog offers. Anything else is recorded as "other". */
const REASONS = new Set([
  "too_expensive",
  "not_using",
  "missing_feature",
  "quality",
  "switching",
  "temporary",
  "other",
]);

/**
 * What to hand back for the part of the month they paid for and will not get.
 *
 * Deliberately conservative. It refunds by elapsed time against the period
 * Stripe itself billed, never more than was actually paid, and returns zero
 * rather than guessing whenever anything is missing or looks wrong — a refund
 * that is too small is a conversation, a refund that is too large is a loss
 * and, repeated, a way to drain an account.
 */
function unusedPortion(
  invoice: Stripe.Invoice,
  periodStart: number | null,
  periodEnd: number | null,
): number {
  const paid = invoice.amount_paid ?? 0;
  /* `== null`, not a falsy check: a timestamp of 0 is a real value, and
     treating it as "missing" would silently refund nothing. */
  if (paid <= 0 || periodStart == null || periodEnd == null || periodEnd <= periodStart) return 0;

  const now = Math.floor(Date.now() / 1000);
  if (now >= periodEnd) return 0; // the month is over; nothing unused
  if (now <= periodStart) return paid; // cancelled before it began

  const remaining = periodEnd - now;
  const total = periodEnd - periodStart;
  const amount = Math.floor((paid * remaining) / total);
  return Math.max(0, Math.min(paid, amount));
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string; note?: string };
  const reason = body.reason && REASONS.has(body.reason) ? body.reason : "other";
  const note = typeof body.note === "string" ? body.note.slice(0, 1000) : null;

  const supabase = await createClient();

  /* The subscription id comes from our own copy, which the webhook keeps up to
     date. Reading it needs nothing special: the row is readable by its owner,
     and RLS makes "their own" mean their own. */
  let stripeSubscriptionId: string | null = null;
  try {
    const { data } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id,status")
      .in("status", ["trialing", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    stripeSubscriptionId = (data?.stripe_subscription_id as string | null) ?? null;
  } catch (err) {
    console.error("[cancel] could not read the subscription:", err);
  }

  let refunded: string | null = null;
  let stripeEnded = false;
  /* True when our copy named a subscription Stripe does not have — the record
     is cleared, but nothing was cancelled or refunded, because there was
     nothing there. */
  let orphaned = false;

  if (isStripeConfigured() && stripeSubscriptionId) {
    try {
      const s = stripe();
      const sub = await s.subscriptions.retrieve(stripeSubscriptionId, {
        expand: ["latest_invoice"],
      });

      if (["active", "trialing", "past_due"].includes(sub.status)) {
        /* The period the refund is measured against. Stripe moved these onto
           the subscription ITEM in the 2025-08 release and the old fields are
           still served to older API versions, so both shapes are read — the
           same defensive pair the webhook uses. */
        const item = sub.items?.data?.[0] as
          | (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number })
          | undefined;
        const legacy = sub as unknown as {
          current_period_start?: number | null;
          current_period_end?: number | null;
        };
        const periodStart = item?.current_period_start ?? legacy.current_period_start ?? null;
        const periodEnd = item?.current_period_end ?? legacy.current_period_end ?? null;

        /* Refund BEFORE cancelling: once the subscription is gone its latest
           invoice is harder to reach, and a refund that quietly did not happen
           is the failure mode that costs a customer's goodwill. */
        const invoice =
          sub.latest_invoice && typeof sub.latest_invoice === "object"
            ? (sub.latest_invoice as Stripe.Invoice)
            : null;

        if (invoice && invoice.status === "paid") {
          const amount = unusedPortion(invoice, periodStart, periodEnd);
          const paymentIntent =
            (invoice as unknown as { payment_intent?: string | { id: string } }).payment_intent ??
            null;
          const intentId =
            typeof paymentIntent === "string" ? paymentIntent : (paymentIntent?.id ?? null);

          if (amount > 0 && intentId) {
            try {
              await s.refunds.create({
                payment_intent: intentId,
                amount,
                metadata: {
                  supabase_user_id: user.id,
                  fdai_reason: "cancelled mid-period: unused days returned",
                },
              });
              refunded = moneyIn(amount, invoice.currency ?? "sgd");
            } catch (err) {
              /* A refund can fail on its own — a disputed charge, a payment
                 method that will not take one. That must not stop the
                 cancellation: being unable to hand money back is no reason to
                 keep charging somebody. */
              console.error("[cancel] refund failed, cancelling anyway:", err);
            }
          }
        }

        await s.subscriptions.cancel(sub.id);
        stripeEnded = true;
      }
    } catch (err) {
      /* ── "NO SUCH SUBSCRIPTION" IS NOT A FAILURE ──────────────────────────
         It is the normal answer after switching Stripe accounts. The local
         copy was written by sandbox webhooks and names a sub_… that only ever
         existed there, so the live key cannot find it — and the account is
         left claiming a membership nobody is paying for, still handing out an
         allowance every month.

         Treating that as an error was the bug FD hit: the button said "we
         could not reach Stripe" and changed nothing, so the phantom
         membership could never be cleared. There is nothing to cancel in
         Stripe, which is exactly the state we are trying to reach, so carry
         on and record it locally.

         A real problem — a network failure, a bad key, a refusal — still
         stops here, because then Stripe and our copy would genuinely
         disagree. */
      const code = (err as { code?: string; statusCode?: number; type?: string }) ?? {};
      const missing =
        code.code === "resource_missing" ||
        (code.statusCode === 404 && code.type === "StripeInvalidRequestError");

      if (!missing) {
        console.error("[cancel] Stripe would not cancel:", err);
        return NextResponse.json(
          {
            error:
              "We could not reach Stripe to end the subscription, so nothing has been changed. " +
              "Please try again in a moment.",
          },
          { status: 502 },
        );
      }

      console.warn(
        `[cancel] Stripe has no subscription ${stripeSubscriptionId} — ` +
          "almost certainly a record left behind by the sandbox. Clearing it locally.",
      );
      orphaned = true;
    }
  }

  /* Record it locally. This runs even when Stripe had nothing to cancel —
     after switching Stripe accounts, for instance, the local copy can name a
     subscription that only ever existed in the sandbox, and leaving the
     account marked "member" when it is not would keep handing out credits. */
  const { data: result, error } = await supabase.rpc("cancel_membership", {
    p_reason: reason,
    p_note: note,
  });

  if (error) {
    console.error("[cancel] could not record the cancellation:", error);
    return NextResponse.json(
      {
        error: stripeEnded
          ? "Your subscription was cancelled in Stripe, but we could not update your account. Please contact us so we can put it right."
          : "Could not cancel. Please try again.",
      },
      { status: 500 },
    );
  }

  const row = Array.isArray(result) ? result[0] : result;

  return NextResponse.json({
    ok: true,
    ended: Number(row?.ended ?? 0),
    creditsRemoved: Number(row?.credits_removed ?? 0),
    refunded,
    stripeEnded,
    orphaned,
  });
}
