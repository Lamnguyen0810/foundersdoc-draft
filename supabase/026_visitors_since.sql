-- ===========================================================================
-- FDAI — say from when unique visitors have actually been counted
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Needs 022_unique_visitors.sql.
--
-- THE PROBLEM THIS FIXES
--   The dashboard reads "8 unique visitors" beside "363 visits" for the same
--   thirty days, which looks broken. It is not: unique visitors have only
--   been counted since the day ANALYTICS_SALT was set, and everything before
--   that was never fingerprinted. The two figures cover different stretches
--   of the same period, and the page had no way to say so.
--
--   admin_visits now also reports the first day on which a fingerprint
--   exists, so the tile can name the date it is counting from, and stop
--   looking like an error.
-- ===========================================================================
drop function if exists public.admin_visits(integer);

create function public.admin_visits(p_days integer default 30)
returns table (
  visitors      bigint,
  visits        bigint,
  page_views    bigint,
  countries     bigint,
  first_day     date,
  last_day      date,
  -- The first day inside the window that has any visitor fingerprint at all.
  -- Null when none has: unique visitors are not switched on yet.
  visitors_from date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(distinct e.visitor_hash) filter (where e.visitor_hash is not null),
    count(distinct e.anon_id),
    count(*),
    count(distinct e.country),
    min(e.created_at)::date,
    max(e.created_at)::date,
    min(e.created_at) filter (where e.visitor_hash is not null)::date
  from public.events e
  where e.created_at >= public.admin_window(p_days)
    and e.name = 'page_view'
    and public.is_admin()
    and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin');
$$;

revoke all on function public.admin_visits(integer) from public;
grant execute on function public.admin_visits(integer) to authenticated;

do $$
declare ok boolean;
begin
  select pg_get_functiondef(oid) like '%visitors_from%' into ok
    from pg_proc where proname = 'admin_visits' limit 1;
  raise notice '% admin_visits() now says from when visitors have been counted',
    case when ok then 'OK   ' else 'FAIL ' end;
end $$;
