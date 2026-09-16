-- ===========================================================================
-- FDAI — cancellation, recorded
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- WHAT CHANGES
--   Cancelling a membership now takes effect immediately rather than at the
--   end of the paid period. Three things follow from that decision, and all
--   three are here:
--
--   1. The moment matters, so it is written down. `cancelled_at` is when, and
--      `cancel_reason` / `cancel_note` are why, in the customer's own words.
--   2. The monthly allowance stops at once — `end_membership_credits`, which
--      already existed for the webhook, is reused unchanged. Credits that were
--      BOUGHT are left alone: /billing promises in three places that they never
--      expire, and cancelling a subscription is not a reason to break that.
--   3. A cancelled membership does not disappear. It stays on the account as a
--      row with status 'canceled', which is what the billing history page
--      lists.
--
-- NOTHING HERE TOUCHES STRIPE. The API route cancels the subscription there
-- and issues the prorated refund; this only records what happened, so that the
-- app can answer "am I still a member?" without a round trip.
-- ===========================================================================

-- ------------------------------------------------------------------ columns
alter table public.subscriptions
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists cancel_note   text;

comment on column public.subscriptions.cancelled_at is
  'When the member cancelled. Null for a membership that ended any other way — a failed payment, say — because "cancelled" and "lapsed" are different stories.';
comment on column public.subscriptions.cancel_reason is
  'The reason chosen from the list on the cancel dialog. For FD to read; never shown back to the customer.';
comment on column public.subscriptions.cancel_note is
  'Anything they typed in their own words. Same audience.';

-- A short, closed list, so the answers can actually be counted. Free text goes
-- in cancel_note, where it cannot fragment the categories.
alter table public.subscriptions drop constraint if exists subscriptions_cancel_reason_check;
alter table public.subscriptions add constraint subscriptions_cancel_reason_check
  check (cancel_reason is null or cancel_reason in
    ('too_expensive', 'not_using', 'missing_feature', 'quality', 'switching', 'temporary', 'other'));

-- ===========================================================================
-- RECORD A CANCELLATION
--
-- SECURITY DEFINER, and deliberately so: `subscriptions` is readable by its
-- owner and writable by nobody, which is the right shape — but a person must
-- still be able to cancel their own membership. This function is the one
-- opening, and it is a narrow one. It takes no user id: it acts on
-- auth.uid() and cannot be pointed at anybody else's account.
--
-- It is called AFTER Stripe has confirmed the cancellation, so a Stripe
-- failure never leaves the local copy claiming something Stripe disagrees
-- with. Running it twice is harmless.
-- ===========================================================================
create or replace function public.cancel_membership(
  p_reason text default null,
  p_note   text default null
)
returns table (ended integer, credits_removed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_ended   integer;
  v_removed integer;
begin
  if v_user is null then
    raise exception 'cancel_membership: not signed in';
  end if;

  update public.subscriptions
     set status        = 'canceled',
         cancelled_at  = coalesce(cancelled_at, now()),
         cancel_reason = coalesce(p_reason, cancel_reason),
         cancel_note   = coalesce(nullif(trim(p_note), ''), cancel_note),
         cancel_at_period_end = false,
         current_period_end   = least(coalesce(current_period_end, now()), now())
   where user_id = v_user
     and status in ('trialing', 'active', 'past_due');

  get diagnostics v_ended = row_count;

  -- The monthly allowance goes. Bought credits do not: see the note above.
  v_removed := public.end_membership_credits(v_user);

  return query select coalesce(v_ended, 0), coalesce(v_removed, 0);
end;
$$;

grant execute on function public.cancel_membership(text, text) to authenticated;

-- ===========================================================================
-- THE BILLING HISTORY PAGE'S LIST OF MEMBERSHIPS
--
-- Every membership the account has ever had, newest first — live, expired,
-- cancelled and lapsed alike. The page pairs this with payments read from
-- Stripe; this half answers "what did I subscribe to, and what happened to
-- it", which Stripe's invoice list does not say in those words.
-- ===========================================================================
create or replace function public.membership_history(p_user_id uuid default auth.uid())
returns table (
  id                     uuid,
  tier                   text,
  status                 text,
  started_at             timestamptz,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancelled_at           timestamptz,
  cancel_reason          text,
  cancel_note            text,
  stripe_subscription_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.tier, s.status, s.created_at,
         s.current_period_start, s.current_period_end,
         s.cancelled_at, s.cancel_reason, s.cancel_note,
         s.stripe_subscription_id
  from public.subscriptions s
  where s.user_id = coalesce(p_user_id, auth.uid())
    -- An admin looking at somebody else's account is allowed; anybody else
    -- asking for an id that is not their own gets nothing.
    and (coalesce(p_user_id, auth.uid()) = auth.uid() or public.is_admin())
  order by s.created_at desc;
$$;

grant execute on function public.membership_history(uuid) to authenticated;


-- ###########################################################################
-- ##  VERIFICATION                                                         ##
-- ###########################################################################
do $$
declare ok boolean;
begin
  select count(*) = 3 into ok from information_schema.columns
   where table_name = 'subscriptions'
     and column_name in ('cancelled_at', 'cancel_reason', 'cancel_note');
  raise notice '% columns on subscriptions', case when ok then 'OK   ' else 'FAIL ' end;

  select count(*) = 1 into ok from pg_proc where proname = 'cancel_membership';
  raise notice '% cancel_membership()', case when ok then 'OK   ' else 'FAIL ' end;

  select count(*) = 1 into ok from pg_proc where proname = 'membership_history';
  raise notice '% membership_history()', case when ok then 'OK   ' else 'FAIL ' end;
end $$;
