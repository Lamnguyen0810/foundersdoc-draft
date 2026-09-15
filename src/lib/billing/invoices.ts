import type Stripe from "stripe";
import { isStripeConfigured, stripe } from "./stripe";
import { moneyIn } from "./plans";

/**
 * What this account has been charged, for showing on our own page.
 *
 * ── WHY NOT JUST LINK TO STRIPE'S PORTAL ────────────────────────────────────
 * Because of what the portal shows a Singapore firm's Singapore customer: a
 * bare "$88.80 per month", an invoice reading ₫399,819 with "SGD 18.80"
 * underneath in grey, and a download icon the size of a full stop. None of
 * that is configurable — it is Stripe's page, and no amount of branding
 * changes its currency formatting.
 *
 * So the same facts are read through the API and rendered in FD's own type:
 * S$18.80, the date, whether it was paid, and a download that says Download.
 * Stripe still holds the money and still issues the PDF; only the page the
 * customer reads is ours.
 */

export interface InvoiceRow {
  id: string;
  /** "S$18.80", in the currency Stripe actually charged. */
  amount: string;
  /** Lower case ISO code, e.g. "sgd". Shown when it is not what we sell in. */
  currency: string;
  paidAt: string | null;
  status: string;
  description: string;
  /** Stripe's PDF. Null while an invoice is still a draft. */
  pdfUrl: string | null;
  /** Stripe's own hosted copy, for anything the PDF does not answer. */
  hostedUrl: string | null;
}

function describe(invoice: Stripe.Invoice): string {
  const line = invoice.lines?.data?.[0];
  return (
    line?.description ??
    (typeof line?.pricing?.price_details?.product === "string"
      ? line.pricing.price_details.product
      : null) ??
    invoice.description ??
    "FD AI"
  );
}

/**
 * The last `limit` invoices for a Stripe customer, newest first.
 *
 * Never throws. A billing page that fails to load because a history panel
 * could not reach Stripe is worse than a billing page with no history on it,
 * so every failure returns an empty list and says so in the log.
 */
export async function recentInvoices(
  customerId: string | null,
  limit = 12,
): Promise<InvoiceRow[]> {
  if (!customerId || !isStripeConfigured()) return [];

  try {
    const res = await stripe().invoices.list({ customer: customerId, limit });

    return res.data
      // A draft invoice is not a charge. It has no PDF and nothing was paid.
      .filter((inv) => inv.status && inv.status !== "draft")
      .map((inv) => ({
        id: inv.id ?? "",
        /* amount_paid, not total: it is what actually left the card. They
           differ whenever a credit from a cancelled plan is applied — which,
           after the plan-change flow, is exactly when someone looks. */
        amount: moneyIn(inv.amount_paid ?? inv.total ?? 0, inv.currency ?? "sgd"),
        currency: (inv.currency ?? "sgd").toLowerCase(),
        paidAt: inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
          : inv.created
            ? new Date(inv.created * 1000).toISOString()
            : null,
        status: inv.status ?? "unknown",
        description: describe(inv),
        pdfUrl: inv.invoice_pdf ?? null,
        hostedUrl: inv.hosted_invoice_url ?? null,
      }));
  } catch (err) {
    console.error("[billing] could not read invoices:", err);
    return [];
  }
}

/**
 * The card Stripe will charge next, for the billing panel on /usage.
 *
 * Returns null whenever the answer is not certain — no customer, no default
 * set, Stripe unreachable — because "•••• 4242" printed from a guess is worse
 * than no line at all on the one screen where somebody checks which card is
 * about to be billed.
 */
export async function defaultCard(
  customerId: string | null,
): Promise<{ brand: string; last4: string } | null> {
  if (!customerId || !isStripeConfigured()) return null;
  try {
    const s = stripe();
    const customer = await s.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if (customer.deleted) return null;

    const pm = (customer as Stripe.Customer).invoice_settings
      ?.default_payment_method as Stripe.PaymentMethod | string | null | undefined;
    const card = typeof pm === "object" && pm?.card ? pm.card : null;
    if (!card) return null;

    return { brand: card.brand ?? "card", last4: card.last4 ?? "" };
  } catch (err) {
    console.error("[billing] could not read the default card:", err);
    return null;
  }
}
