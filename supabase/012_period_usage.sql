-- ===========================================================================
-- FDAI — how much of this period has been used
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- WHY THIS EXISTS
--   The usage page shows a percentage of the month's allowance. To do that it
--   needs two numbers it could not get: when the current billing period began,
--   and how many documents have been drafted since. It could have worked the
--   first out from period_end minus a month, and counted the second in the
--   browser's idea of "this month" — and both would drift out of step with the
--   window `unlimited_used()` already uses to enforce fair use.
--
--   One window, defined once. A page that disagrees with the gate about what
--   month it is will eventually tell somebody they have drafting left when the
--   database is about to refuse them.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- The start of the window everything is counted in: the member's own billing
-- period, or the calendar month for anyone without a membership.
-- ---------------------------------------------------------------------------
create or replace function public.period_start(p_user_id uuid default auth.uid())
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.current_period_start
     from public.active_membership(coalesce(p_user_id, auth.uid())) m),
    date_trunc('month', now())
  );
$$;


-- ---------------------------------------------------------------------------
-- Documents drafted in that window.
--
-- Counted from credit_spends, one row per document. NOT from usage_log, which
-- holds one row per call to the model — so a draft revised three times would
-- appear four times and push the meter past an allowance the person has not
-- reached.
--
-- Unlike unlimited_used() this counts every spend, not only the unmetered ones,
-- because a Basic or Pro member spends real credits and those are exactly what
-- the allowance is made of.
-- ---------------------------------------------------------------------------
create or replace function public.period_used(p_user_id uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*), 0)::integer
  from public.credit_spends sp
  where sp.user_id = coalesce(p_user_id, auth.uid())
    and sp.refunded_at is null
    and sp.created_at >= public.period_start(coalesce(p_user_id, auth.uid()));
$$;


-- ---------------------------------------------------------------------------
-- billing_summary gains the two columns. Everything already there keeps its
-- name and position, so nothing reading it today breaks.
-- ---------------------------------------------------------------------------
drop function if exists public.billing_summary(uuid);

create or replace function public.billing_summary(p_user_id uuid default auth.uid())
returns table (
  balance          integer,
  tier             text,
  status           text,
  period_end       timestamptz,
  unlimited_cap    integer,
  unlimited_used   integer,
  trial_ends_at    timestamptz,
  period_start     timestamptz,
  period_used      integer
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
    public.trial_ends_at(coalesce(p_user_id, auth.uid())),
    public.period_start(coalesce(p_user_id, auth.uid())),
    public.period_used(coalesce(p_user_id, auth.uid()))
  from (select * from public.active_membership(coalesce(p_user_id, auth.uid()))
        union all select null, null, null, null limit 1) m;
$$;


revoke all on function public.period_start(uuid) from public;
revoke all on function public.period_used(uuid) from public;
grant execute on function public.period_start(uuid)     to authenticated;
grant execute on function public.period_used(uuid)      to authenticated;
grant execute on function public.billing_summary(uuid)  to authenticated;


-- ---------------------------------------------------------------------------
-- Proof it ran.
-- ---------------------------------------------------------------------------
select 'period_start'    as fn, 'ok' as status
union all select 'period_used', 'ok'
union all select 'billing_summary (now returns period_start, period_used)', 'ok';
