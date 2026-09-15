# Switching payments on

Everything the product sells is described in **`src/lib/billing/plans.ts`**. That
file is the only place prices live in code. Stripe holds its own copy; the app
never sends an amount to Stripe, only a **lookup key**, and Stripe resolves the
key to its own price. If the two ever disagree, Stripe wins — the customer is
charged what Stripe says, which is the safe direction for a mismatch to fail in,
and the billing page shows the disagreement so you can fix it.

## What is sold

| | Item | Price | Credits | Expiry |
|---|---|---|---|---|
| Trial | 14 days | free | 3 | credits expire with the trial |
| Bundle | Single / 3 / 5 | S$8.80 / S$24 / S$38 | 1 / 3 / 5 | never |
| Membership | Basic / Pro | S$18.80 / S$49.80 a month | 3 / 10 a month | roll over while a member |
| Membership | Unlimited | S$88.80 a month | fair use | — |
| Top-up | 1 / 3 / 5 / 10 | S$6.80 / S$19.50 / S$31 / S$59 | 1 / 3 / 5 / 10 | never |

**The rule that matters:** membership credits roll over for as long as the
membership lasts and stop when it is cancelled. Anything bought outright — a
bundle, a top-up — is the customer's property and is never taken back. That
distinction is enforced by `source` on `credit_grants`; see the note at the top
of `supabase/010_pricing_model.sql` before changing it.

Top-ups are member-only. The check is in the checkout route, on the server. A
check in the browser would be a suggestion.

## Setting up an account (sandbox or live)

1. **Run the migration.** Paste `supabase/010_pricing_model.sql` into the
   Supabase SQL editor. It prints six `OK` rows.

2. **Create the products.**

   ```
   node scripts/create-stripe-products.mjs sk_test_...
   ```

   Safe to run twice: it skips anything that already exists and changes nothing.
   For the live account, run it again with the live key and `--live` on the end.
   The extra flag exists so a key pasted from the wrong tab cannot create real
   products by accident.

3. **Add the webhook.** Stripe → Developers → Webhooks → add an endpoint at
   `https://foundersdoc.com/api/billing/webhook`, subscribed to:

   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `charge.refunded`

   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

4. **Turn on the customer portal.** Stripe → Settings → Billing → Customer
   portal → activate. Without it, a member who wants to cancel has to email you.

## Going live

A change of three environment variables, and nothing else:

```
STRIPE_SECRET_KEY        sk_test_…  →  sk_live_…
STRIPE_WEBHOOK_SECRET    whsec_…    →  the live endpoint's secret
NEXT_PUBLIC_SITE_URL     https://foundersdoc.com
```

The lookup keys are identical in both accounts, so no code changes and no
redeploy of anything but the environment. The billing page shows a **Test mode**
or **Live mode** banner taken from the key's own prefix, so it cannot be left
switched on by mistake or be absent when it matters.

## The fair-use ceiling

`billing_config.unlimited_monthly_cap` — 60 by default, and **0 means genuinely
uncapped**. It is a row in the database rather than a constant in code, so
changing it is an `UPDATE` and takes effect immediately:

```sql
update public.billing_config set unlimited_monthly_cap = 100 where id;
```

A member who reaches it is not shown a paywall. They get a 429 and a message
saying to get in touch — they are paying, and the right answer is a conversation.
