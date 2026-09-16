import type Stripe from "stripe";
import { isStripeConfigured, stripe } from "./stripe";
import { moneyIn } from "./plans";

/**
 * Every payment this account has made, for the billing history page.
 *
 * ── WHY CHARGES AND NOT INVOICES ────────────────────────────────────────────
 * Stripe issues an invoice for a subscription, but a one-off Checkout payment
 * — a credit bundle, a top-up — has no invoice unless one is asked for. Listing
 * invoices would therefore show the memberships and silently omit every bundle
 * anybody ever bought, which is the opposite of a complete record.
 *
 * A charge exists for both. Each one knows whether it belongs to an invoice, so
 * the link out can be the hosted invoice when there is one and Stripe's receipt
 * when there is not. Both open a real Stripe page showing what was actually
 * charged — which is the point. A receipt we rendered ourselves could disagree
 * with the money, and then there would be two answers to a question that must
 * only ever have one.
 */

export interface PaymentRow {
  id: string;
  /** ISO date the charge was made. */
  paidAt: string | null;
  /** "S$49.80", in the currency Stripe actually charged. */
  amount: string;
  currency: string;
  description: string;
  /** paid · refunded · partly refunded · failed · pending */
  status: "paid" | "refunded" | "part_refunded" | "failed" | "pending";
  /** How much came back, when some did. */
  refunded: string | null;
  /** Stripe's hosted invoice page, or its receipt. Opened in a new tab. */
  url: string | null;
  /** Set when this payment belongs to a membership rather than a one-off. */
  subscriptionInvoice: boolean;
}

function describe(charge: Stripe.Charge): string {
  const meta = charge.metadata ?? {};
  if (meta.tier) {
    const tier = String(meta.tier);
    return `${tier.charAt(0).toUpperCase()}${tier.slice(1)} membership`;
  }
  if (meta.credits) return `${meta.credits} credits`;
  return charge.description || "Payment";
}

function statusOf(charge: Stripe.Charge): PaymentRow["status"] {
  if (charge.status === "failed") return "failed";
  if (charge.status === "pending") return "pending";
  const refunded = charge.amount_refunded ?? 0;
  if (refunded <= 0) return "paid";
  return refunded >= (charge.amount ?? 0) ? "refunded" : "part_refunded";
}

export async function paymentHistory(customerId: string | null): Promise<PaymentRow[]> {
  if (!customerId || !isStripeConfigured()) return [];

  try {
    const s = stripe();
    const res = await s.charges.list({ customer: customerId, limit: 100 });

    /* An invoice's hosted page is the nicer destination — it is the one with
       "Download invoice" and "Download receipt" on it — but it has to be
       fetched per charge, so only the ones that have an invoice are looked up,
       and a failure to look one up falls back to the receipt rather than
       losing the row. */
    const rows = await Promise.all(
      res.data.map(async (charge): Promise<PaymentRow> => {
        const invoiceRef = (charge as unknown as { invoice?: string | Stripe.Invoice | null })
          .invoice;
        let url: string | null = charge.receipt_url ?? null;

        if (invoiceRef) {
          try {
            const invoice =
              typeof invoiceRef === "string" ? await s.invoices.retrieve(invoiceRef) : invoiceRef;
            url = invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? url;
          } catch {
            // Keep the receipt URL.
          }
        }

        const currency = (charge.currency ?? "sgd").toLowerCase();
        const refunded = charge.amount_refunded ?? 0;

        return {
          id: charge.id,
          paidAt: charge.created ? new Date(charge.created * 1000).toISOString() : null,
          amount: moneyIn(charge.amount ?? 0, currency),
          currency,
          description: describe(charge),
          status: statusOf(charge),
          refunded: refunded > 0 ? moneyIn(refunded, currency) : null,
          url,
          subscriptionInvoice: Boolean(invoiceRef),
        };
      }),
    );

    return rows;
  } catch (err) {
    console.error("[billing] could not read payment history:", err);
    return [];
  }
}
