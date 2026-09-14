# Switching payments on

Two stages: get it working in **test mode**, then flip three environment
variables to go live. Nothing else changes — no code edit, no redeploy of a
different branch.

---

## Stage 1 — Supabase

Run `supabase/004_billing.sql` in the SQL editor. It creates the credit ledger
and grants every existing account a free week.

Check it worked:

```sql
select trial_credits, trial_days from billing_config;   -- 3 and 7 by default
select email, credits, trial_ends_at from billing_overview;
```

To change the free week, change the row — no deploy:

```sql
update billing_config set trial_credits = 5, trial_days = 14;
```

## Stage 2 — Stripe, in test mode

1. **Products.** Stripe → Product catalogue → add one product per pack. On each
   product's price, open the ⋯ menu → **Edit price** → set the **lookup key**:

   | Pack | Lookup key | Credits |
   |---|---|---|
   | 3 documents | `fdai_pack_3` | 3 |
   | 10 documents | `fdai_pack_10` | 10 |
   | 25 documents | `fdai_pack_25` | 25 |

   The lookup key is the whole trick: the code never mentions a `price_…` id, so
   the same build works against test and live accounts.

   Prices and names shown on the page come from `src/lib/billing/packs.ts`;
   the amount actually charged always comes from Stripe.

2. **API key.** Developers → API keys → copy the **secret key** (`sk_test_…`).

3. **Webhook.** Developers → Webhooks → Add endpoint:
   - URL: `https://foundersdoc.com/api/billing/webhook`
   - Events: `checkout.session.completed` and `charge.refunded`
   - Copy the **signing secret** (`whsec_…`).

## Stage 3 — Vercel

| Variable | Value | Type |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` | Secret |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | Secret |
| `SUPABASE_SECRET_KEY` | Supabase → API Keys → **secret** | Secret |
| `NEXT_PUBLIC_SITE_URL` | `https://foundersdoc.com` | Config |

`SUPABASE_SECRET_KEY` is the one key this project otherwise never uses. Only the
Stripe webhook touches it, because a webhook arrives with no signed-in user and
must still credit an account. It must never carry a `NEXT_PUBLIC_` prefix.

## Stage 4 — Supabase sign-up

Authentication → Providers → Email → turn **Enable sign-ups** on, so
`/signup` works. Keep **Confirm email** on.

## Stage 5 — Test it

Buy a pack with Stripe's test card: **4242 4242 4242 4242**, any future expiry,
any CVC, any postcode.

| Check | Expect |
|---|---|
| `/billing` | A "Test mode" banner, and your balance |
| After paying | Credits appear within a few seconds |
| `/draft` → generate | Balance drops by one |
| Run out, then generate | The paywall message, not an error |
| Stripe → Webhooks → the endpoint | Recent deliveries all `200` |

## Stage 6 — Go live

1. Recreate the same three products in **live** mode with the **same lookup keys**.
2. Replace `STRIPE_SECRET_KEY` with `sk_live_…` and `STRIPE_WEBHOOK_SECRET` with
   the live endpoint's signing secret.
3. Redeploy.

The "Test mode" banner disappears by itself — it is driven by the key prefix, so
it cannot be left on by mistake, and it cannot appear when you are live.

---

## Before the first real payment

- [ ] `GEMINI_API_KEY` moved to a **paid** Google billing account. Free-tier
      input may be used to improve Google's models and may be read by human
      reviewers. Do not take money from people whose information goes there.
- [ ] Vercel on a **Pro** plan. Hobby is licensed for non-commercial use only.
- [ ] A privacy policy published, and the analytics and billing data named in it.
- [ ] Terms of service updated: what a credit buys, refunds, and that a draft is
      not legal advice.
- [ ] Decided, and written down, whether a subscriber is a client of the firm.
      If they are, conflicts and customer due diligence belong in the sign-up
      flow, not in a footer.
