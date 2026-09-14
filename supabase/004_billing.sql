-- ===========================================================================
-- FDAI — billing: a free week, then paid credits
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- THE MODEL, IN ONE PARAGRAPH
--   Everything is a GRANT of credits. A new account is granted a handful that
--   expire in seven days — that is the free week. A Stripe payment grants more
--   that never expire. Drafting spends one. The trial and the paid product are
--   therefore the same mechanism with a different expiry date, which means one
--   set of rules to reason about and one place a bug can hide instead of two.
--
-- WHY A LEDGER AND NOT A `credits` COLUMN
--   A single number cannot answer "why do I have 4 credits?" or "did that
--   refund come off?". A firm taking money needs to answer both — to a
--   customer, to a bank during a chargeback, and to itself at year end. Every
--   credit in and out is a row here, and the balance is derived from them.
-- ===========================================================================

-- ------------------------------------------------------------------ config
-- Tunable without a deploy: change the row, not the code.
create table if not exists public.billing_config (
  id            boolean primary key default true check (id),
  trial_credits integer not null default 3   check (trial_credits between 0 and 100),
  trial_days    integer not null default 7   check (trial_days between 0 and 90),
  updated_at    timestamptz not null default now()
);
insert into public.billing_config (id) values (true) on conflict (id) do nothing;

-- -------------------------------------------------------- billing_accounts
create table if not exists public.billing_accounts (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  trial_granted      boolean not null default false,
  created_at         timestamptz not null default now()
);

-- ------------------------------------------------------------ credit_grants
-- Credits coming IN. `remaining` is decremented as they are spent, so a grant
-- carries its own running balance and expiry travels with the credits it
-- belongs to — a trial credit cannot outlive the trial by being mixed into a
-- single pooled number.
create table if not exists public.credit_grants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  credits      integer not null check (credits > 0),
  remaining    integer not null check (remaining >= 0),
  source       text not null check (source in ('trial', 'purchase', 'gift', 'refund_reversal')),
  expires_at   timestamptz,                      -- null = never expires (paid credits)
  stripe_ref   text,                             -- checkout session / payment intent
  created_at   timestamptz not null default now()
);

create index if not exists credit_grants_user_idx
  on public.credit_grants (user_id, expires_at nulls last, created_at);

-- Paying twice for the same Stripe session must not grant twice.
create unique index if not exists credit_grants_stripe_ref_idx
  on public.credit_grants (stripe_ref) where stripe_ref is not null;

-- ------------------------------------------------------------ credit_spends
-- Credits going OUT. One row per draft generated.
create table if not exists public.credit_spends (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  grant_id   uuid not null references public.credit_grants (id) on delete cascade,
  draft_id    uuid references public.drafts (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Set when a draft failed and the credit was handed back. The row is kept,
  -- not deleted: "you were charged and then refunded" is a different and more
  -- answerable story than "nothing ever happened here".
  refunded_at timestamptz,
  refund_reason text
);

create index if not exists credit_spends_user_idx on public.credit_spends (user_id, created_at desc);

-- ------------------------------------------------------------ stripe_events
-- Stripe retries a webhook until it gets a 200, and will happily send the same
-- event twice. This table is how "already handled that one" is answered.
create table if not exists public.stripe_events (
  id           text primary key,          -- Stripe's own evt_… id
  type         text not null,
  handled_at   timestamptz not null default now()
);

-- ===========================================================================
-- ROW-LEVEL SECURITY
-- A person may READ their own billing history and nothing else. Nobody may
-- write to any of it from the browser: credits are created by Stripe webhooks
-- and spent by the drafting endpoint, both server-side.
-- ===========================================================================
alter table public.billing_accounts enable row level security;
alter table public.credit_grants    enable row level security;
alter table public.credit_spends    enable row level security;
alter table public.stripe_events    enable row level security;
alter table public.billing_config   enable row level security;

drop policy if exists "billing_accounts: read own" on public.billing_accounts;
create policy "billing_accounts: read own" on public.billing_accounts
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

drop policy if exists "credit_grants: read own" on public.credit_grants;
create policy "credit_grants: read own" on public.credit_grants
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

drop policy if exists "credit_spends: read own" on public.credit_spends;
create policy "credit_spends: read own" on public.credit_spends
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

drop policy if exists "billing_config: read" on public.billing_config;
create policy "billing_config: read" on public.billing_config
  for select to authenticated using (true);

-- stripe_events gets NO policy: the webhook reaches it with the secret key,
-- and nothing else has any business reading it.

-- ===========================================================================
-- BALANCE
-- ===========================================================================
create or replace function public.credit_balance(p_user_id uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(remaining), 0)::integer
  from public.credit_grants
  where user_id = coalesce(p_user_id, auth.uid())
    and (expires_at is null or expires_at > now());
$$;

-- When the free week runs out, for the banner in the app.
create or replace function public.trial_ends_at(p_user_id uuid default auth.uid())
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(expires_at)
  from public.credit_grants
  where user_id = coalesce(p_user_id, auth.uid())
    and source = 'trial';
$$;

grant execute on function public.credit_balance(uuid) to authenticated;
grant execute on function public.trial_ends_at(uuid) to authenticated;

-- ===========================================================================
-- SPENDING A CREDIT
--
-- Two properties matter and neither is free:
--   ATOMIC. Two drafts started in the same second must not both spend the same
--   last credit. `for update` on the chosen row makes the second wait and then
--   find it empty.
--   FIFO BY EXPIRY. Credits that are about to expire are spent first, so a
--   trial credit is never wasted while a paid one is burned in its place.
--
-- Returns true if a credit was taken, false if there were none. It does NOT
-- raise: the caller turns false into a polite paywall, not a stack trace.
-- ===========================================================================
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
begin
  if v_user is null then
    return null;
  end if;

  select id into v_grant
  from public.credit_grants
  where user_id = v_user
    and remaining > 0
    and (expires_at is null or expires_at > now())
  order by expires_at nulls last, created_at
  limit 1
  for update;

  if v_grant is null then
    return null;              -- no credit available; the caller shows a paywall
  end if;

  update public.credit_grants set remaining = remaining - 1 where id = v_grant;
  insert into public.credit_spends (user_id, grant_id, draft_id)
  values (v_user, v_grant, p_draft_id)
  returning id into v_spend;
  return v_spend;
end;
$$;

grant execute on function public.consume_credit(uuid) to authenticated;

-- ===========================================================================
-- GIVING ONE BACK
--
-- A credit is taken BEFORE the AI is called, because otherwise ten browser tabs
-- turn one credit into ten documents. The cost of reserving first is that a
-- draft which fails has already been paid for — so this reverses it.
--
-- It can only reverse the caller's OWN spend, only once, and only a spend that
-- never produced a draft. Someone who has their document cannot ask for the
-- credit back by replaying the call.
-- ===========================================================================
create or replace function public.refund_credit(p_spend_id uuid, p_reason text default 'draft failed')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant uuid;
begin
  select grant_id into v_grant
  from public.credit_spends
  where id = p_spend_id
    and user_id = auth.uid()
    and refunded_at is null
    and draft_id is null
  for update;

  if v_grant is null then
    return false;
  end if;

  update public.credit_spends
     set refunded_at = now(), refund_reason = left(p_reason, 120)
   where id = p_spend_id;

  update public.credit_grants set remaining = remaining + 1 where id = v_grant;
  return true;
end;
$$;

grant execute on function public.refund_credit(uuid, text) to authenticated;

-- Attach a draft to the credit that paid for it, once it exists.
create or replace function public.attach_draft_to_spend(p_spend_id uuid, p_draft_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.credit_spends
     set draft_id = p_draft_id
   where id = p_spend_id and user_id = auth.uid() and draft_id is null;
$$;

grant execute on function public.attach_draft_to_spend(uuid, uuid) to authenticated;

-- ===========================================================================
-- THE FREE WEEK
-- Granted by trigger the moment an account is created, so there is no window
-- in which a new user is signed in with nothing to use.
-- ===========================================================================
create or replace function public.grant_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
  v_days    integer;
begin
  select trial_credits, trial_days into v_credits, v_days from public.billing_config where id;

  insert into public.billing_accounts (user_id, trial_granted)
  values (new.id, true)
  on conflict (user_id) do nothing;

  if coalesce(v_credits, 0) > 0 then
    insert into public.credit_grants (user_id, credits, remaining, source, expires_at)
    values (new.id, v_credits, v_credits, 'trial', now() + make_interval(days => coalesce(v_days, 7)));
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_trial on auth.users;
create trigger on_auth_user_trial
  after insert on auth.users
  for each row execute function public.grant_trial();

-- Backfill: existing accounts get their free week too, once.
insert into public.billing_accounts (user_id, trial_granted)
select u.id, true from auth.users u
left join public.billing_accounts b on b.user_id = u.id
where b.user_id is null;

insert into public.credit_grants (user_id, credits, remaining, source, expires_at)
select u.id, c.trial_credits, c.trial_credits, 'trial', now() + make_interval(days => c.trial_days)
from auth.users u
cross join public.billing_config c
where c.id
  and not exists (select 1 from public.credit_grants g where g.user_id = u.id and g.source = 'trial');

-- ===========================================================================
-- A read for the admin page: who is paying, who is trialling, who has lapsed.
-- ===========================================================================
create or replace view public.billing_overview
with (security_invoker = true) as
  select
    p.id                                   as user_id,
    p.email,
    public.credit_balance(p.id)            as credits,
    public.trial_ends_at(p.id)             as trial_ends_at,
    (select count(*) from public.credit_spends s
      where s.user_id = p.id and s.refunded_at is null)                   as drafts_used,
    (select count(*) from public.credit_grants g
      where g.user_id = p.id and g.source = 'purchase')                   as purchases
  from public.profiles p;
