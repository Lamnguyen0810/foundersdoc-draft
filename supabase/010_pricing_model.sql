-- ===========================================================================
-- FDAI — the real pricing model
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- Trial          3 credits, 14 days
-- Pay-as-you-go  1 / 3 / 5 credit bundles, never expire
-- Membership     Basic 3, Pro 10 credits a month; Unlimited
-- Member top-ups 1 / 3 / 5 / 10, only while a membership is active
--
-- ── THE ONE RULE THAT DECIDES EVERYTHING BELOW ─────────────────────────────
-- Membership credits ROLL OVER while the membership lasts, and stop existing
-- when it is cancelled. Bought credits are bought: a bundle or a top-up is the
-- customer's property for ever, cancellation or not.
--
-- That distinction has to live in the data, not in someone's memory, which is
-- why `source` is checked and why cancellation touches exactly one kind of row.
-- Getting it backwards in either direction is a real harm: confiscating a
-- bundle somebody paid S$38 for, or handing out a year of accumulated
-- membership credits to somebody who has stopped paying.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Settings. Every number the business might change lives here, so changing
--    a price or an allowance is an UPDATE rather than a deploy.
-- ---------------------------------------------------------------------------
alter table public.billing_config
  add column if not exists unlimited_monthly_cap integer not null default 60
    check (unlimited_monthly_cap >= 0);

comment on column public.billing_config.unlimited_monthly_cap is
  'Fair-use ceiling for the Unlimited tier, per billing period. 0 means genuinely uncapped.';

-- The trial the pricing page promises: three documents, a fortnight.
update public.billing_config set trial_credits = 3, trial_days = 14 where id;


-- ---------------------------------------------------------------------------
-- 2. Where a credit came from, because it decides whether it survives.
-- ---------------------------------------------------------------------------
alter table public.credit_grants drop constraint if exists credit_grants_source_check;
alter table public.credit_grants
  add constraint credit_grants_source_check
  check (source in ('trial', 'purchase', 'gift', 'refund_reversal', 'membership', 'topup'));

comment on column public.credit_grants.source is
  'trial/membership are revocable when the trial lapses or the membership ends. '
  'purchase/topup/gift are the customer''s outright and are never taken back.';


-- ---------------------------------------------------------------------------
-- 3. An Unlimited draft spends no grant, but must still leave a trace: it is
--    what the fair-use count is made of, and what a refund reverses.
-- ---------------------------------------------------------------------------
alter table public.credit_spends alter column grant_id drop not null;

comment on column public.credit_spends.grant_id is
  'Null for an Unlimited-tier draft, which is metered for fair use but spends no credit.';


-- ---------------------------------------------------------------------------
-- 4. Memberships.
--
-- Stripe is the authority on whether somebody is paying; this table is a local
-- copy so that drafting does not have to call Stripe on every request. It is
-- written only by the webhook.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,

  stripe_customer_id     text,
  stripe_subscription_id text unique,

  tier   text not null check (tier in ('basic', 'pro', 'unlimited')),

  -- Stripe's own vocabulary, kept verbatim rather than simplified to a boolean:
  -- "past_due" is not "cancelled", and treating it as such would cut off a
  -- paying customer over a card that needs re-authorising.
  status text not null check (status in
    ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused')),

  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id, status);

alter table public.subscriptions enable row level security;

-- Readable by its owner, writable by nobody: the webhook uses the service key
-- and the functions below are SECURITY DEFINER.
drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- 5. Is this person a paying member, and of what?
--
-- "trialing" and "active" both count. "past_due" deliberately does too: Stripe
-- retries a failed payment for days, and locking someone out on the first
-- decline turns a bank's fraud check into a lost customer.
-- ---------------------------------------------------------------------------
create or replace function public.active_membership(p_user_id uuid default auth.uid())
returns table (tier text, status text, current_period_start timestamptz, current_period_end timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.tier, s.status, s.current_period_start, s.current_period_end
  from public.subscriptions s
  where s.user_id = coalesce(p_user_id, auth.uid())
    and s.status in ('trialing', 'active', 'past_due')
  order by
    case s.tier when 'unlimited' then 3 when 'pro' then 2 else 1 end desc,
    s.current_period_end desc nulls last
  limit 1;
$$;


-- ---------------------------------------------------------------------------
-- 6. How much of the Unlimited fair-use allowance is gone this period.
-- ---------------------------------------------------------------------------
create or replace function public.unlimited_used(p_user_id uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*), 0)::integer
  from public.credit_spends sp
  where sp.user_id = coalesce(p_user_id, auth.uid())
    and sp.grant_id is null
    and sp.refunded_at is null
    and sp.created_at >= coalesce(
      (select m.current_period_start from public.active_membership(coalesce(p_user_id, auth.uid())) m),
      date_trunc('month', now())
    );
$$;


-- ---------------------------------------------------------------------------
-- 7. Spending, now aware of Unlimited.
--
-- Order of business matters. Unlimited is checked FIRST, before any grant is
-- touched, so an Unlimited member who also happens to hold a bought bundle
-- keeps that bundle intact — they are paying monthly precisely so they do not
-- burn through credits they bought separately.
-- ---------------------------------------------------------------------------
create or replace function public.consume_credit(p_draft_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_grant uuid;
  v_spend uuid;
  v_tier  text;
  v_cap   integer;
begin
  if v_user is null then
    return null;
  end if;

  select tier into v_tier from public.active_membership(v_user);

  if v_tier = 'unlimited' then
    select unlimited_monthly_cap into v_cap from public.billing_config where id;
    v_cap := coalesce(v_cap, 60);

    -- 0 means the firm has decided to make it genuinely uncapped.
    if v_cap = 0 or public.unlimited_used(v_user) < v_cap then
      insert into public.credit_spends (user_id, grant_id, draft_id)
      values (v_user, null, p_draft_id)
      returning id into v_spend;
      return v_spend;
    end if;

    -- Over the fair-use ceiling. Distinct from "no credits": this person is
    -- paying, and the answer is a conversation, not a paywall.
    raise exception 'fair_use_reached' using errcode = '22023';
  end if;

  set local lock_timeout = '3s';

  begin
    select id into v_grant
    from public.credit_grants
    where user_id = v_user
      and remaining > 0
      and (expires_at is null or expires_at > now())
    -- Soonest-to-expire first, so a trial credit is never wasted while a
    -- bought one is burned in its place.
    order by expires_at nulls last, created_at
    limit 1
    for update;
  exception when lock_not_available then
    raise exception 'credit_lock_timeout' using errcode = '55P03';
  end;

  if v_grant is null then
    return null;
  end if;

  update public.credit_grants set remaining = remaining - 1 where id = v_grant;
  insert into public.credit_spends (user_id, grant_id, draft_id)
  values (v_user, v_grant, p_draft_id)
  returning id into v_spend;
  return v_spend;
end;
$$;


-- ---------------------------------------------------------------------------
-- 8. Refunding, now aware that some spends bought nothing to give back.
-- ---------------------------------------------------------------------------
create or replace function public.refund_credit(p_spend_id uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant uuid;
  v_found boolean := false;
begin
  select grant_id into v_grant
  from public.credit_spends
  where id = p_spend_id
    and refunded_at is null
  for update;

  if not found then
    return false;             -- already refunded, or never existed
  end if;

  update public.credit_spends
     set refunded_at = now(), refund_reason = left(p_reason, 120)
   where id = p_spend_id;

  -- An Unlimited draft spent no credit; marking it refunded is the whole
  -- refund, because it also removes it from the fair-use count.
  if v_grant is not null then
    update public.credit_grants set remaining = remaining + 1 where id = v_grant;
  end if;

  return true;
end;
$$;


-- ---------------------------------------------------------------------------
-- 9. The monthly membership allowance.
--
-- expires_at is null: these roll over for as long as the membership lasts,
-- which is what was promised. Step 10 is what ends them.
--
-- Idempotent on stripe_ref, because Stripe will deliver the same invoice event
-- twice sooner or later and nobody should get two months of credits for it.
-- ---------------------------------------------------------------------------
create or replace function public.grant_membership_credits(
  p_user_id uuid,
  p_credits integer,
  p_ref     text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_credits < 1 then
    return public.credit_balance(p_user_id);
  end if;

  -- The uniqueness on stripe_ref is a PARTIAL index (`where stripe_ref is not
  -- null`), so the conflict target has to repeat that predicate or Postgres
  -- refuses to match it — and the whole insert would raise instead of being
  -- quietly ignored, which is the opposite of idempotent.
  insert into public.credit_grants (user_id, credits, remaining, source, expires_at, stripe_ref)
  values (p_user_id, p_credits, p_credits, 'membership', null, p_ref)
  on conflict (stripe_ref) where stripe_ref is not null do nothing;

  return public.credit_balance(p_user_id);
end;
$$;


-- ---------------------------------------------------------------------------
-- 10. Cancellation.
--
-- Membership credits stop. Bought credits do not — read the note at the top of
-- this file before changing the `source` list here, because widening it takes
-- money from people who paid for it.
-- ---------------------------------------------------------------------------
create or replace function public.end_membership_credits(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer;
begin
  update public.credit_grants
     set remaining = 0
   where user_id = p_user_id
     and source = 'membership'
     and remaining > 0;

  get diagnostics v_removed = row_count;
  return coalesce(v_removed, 0);
end;
$$;


-- ---------------------------------------------------------------------------
-- 11. What the app needs to draw the rail and the pricing page in one call.
-- ---------------------------------------------------------------------------
create or replace function public.billing_summary(p_user_id uuid default auth.uid())
returns table (
  balance          integer,
  tier             text,
  status           text,
  period_end       timestamptz,
  unlimited_cap    integer,
  unlimited_used   integer,
  trial_ends_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.credit_balance(coalesce(p_user_id, auth.uid())),
    m.tier,
    m.status,
    m.current_period_end,
    (select unlimited_monthly_cap from public.billing_config where id),
    case when m.tier = 'unlimited'
         then public.unlimited_used(coalesce(p_user_id, auth.uid()))
         else 0 end,
    public.trial_ends_at(coalesce(p_user_id, auth.uid()))
  from (select * from public.active_membership(coalesce(p_user_id, auth.uid()))
        union all select null, null, null, null limit 1) m;
$$;


grant execute on function public.active_membership(uuid) to authenticated;
grant execute on function public.unlimited_used(uuid) to authenticated;
grant execute on function public.billing_summary(uuid) to authenticated;


-- ###########################################################################
-- ##  VERIFICATION — 6 rows, all OK                                        ##
-- ###########################################################################
select 'Trial is 3 credits / 14 days' as check_item,
       case when exists (select 1 from public.billing_config where trial_credits = 3 and trial_days = 14)
            then 'OK' else 'NOT SET' end as result
union all
select 'Unlimited fair-use cap column',
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='billing_config'
                           and column_name='unlimited_monthly_cap') then 'OK' else 'MISSING' end
union all
select 'subscriptions table',
       case when to_regclass('public.subscriptions') is not null then 'OK' else 'MISSING' end
union all
select 'credit_spends.grant_id is nullable',
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='credit_spends'
                           and column_name='grant_id' and is_nullable='YES') then 'OK' else 'STILL NOT NULL' end
union all
select 'membership + topup sources allowed',
       case when (select pg_get_constraintdef(oid) from pg_constraint
                  where conname='credit_grants_source_check') like '%membership%topup%'
            then 'OK' else 'CHECK FAILED' end
union all
select 'consume_credit knows Unlimited',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='consume_credit'
                           and p.prosrc like '%fair_use_reached%') then 'OK' else 'NOT UPDATED' end
order by 1;
