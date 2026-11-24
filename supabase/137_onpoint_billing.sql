-- 137 · OnPoint billing (0269): the monthly card subscription, kept in Stripe.
--
-- Only the two Stripe ids are stored here, so the Billing & plan page can find the subscription again.
-- The amount, the card and the invoices live in Stripe and are read from there; no card details are
-- ever stored in this database. Safe to run more than once.

alter table public.onpoint_workspaces
  add column if not exists stripe_customer_id     text check (stripe_customer_id is null or stripe_customer_id like 'cus\_%'),
  add column if not exists stripe_subscription_id text check (stripe_subscription_id is null or stripe_subscription_id like 'sub\_%'),
  add column if not exists billing_linked_at      timestamptz;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'onpoint_workspaces' and column_name = 'stripe_subscription_id') then
    raise exception 'FAILED: billing columns not added';
  end if;
  raise notice 'OK    OnPoint billing columns ready.';
end $$;
