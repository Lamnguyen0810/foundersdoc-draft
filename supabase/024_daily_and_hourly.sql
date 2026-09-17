-- ===========================================================================
-- FDAI — the dashboard, day by day and hour by hour
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 022_unique_visitors.sql first if you have not.
--
-- WHY SINGAPORE TIME
--   Every timestamp is stored in UTC, which is right. But "Tuesday" to the
--   firm means Tuesday in Singapore, so both functions below group by
--   Asia/Singapore. A signup at 9am on the 17th appears on the 17th, not on
--   the 16th as a UTC grouping would show it.
--
--   One honest caveat, written on the panel as well as here: the visitor
--   fingerprint changes at midnight UTC, which is 8am in Singapore. Somebody
--   who browses before AND after 8am therefore counts as two unique visitors
--   on that day. Visits, page views and signups are unaffected. The fix
--   would be to rotate the fingerprint at Singapore midnight instead, which
--   is a change to the site, not to this file — worth doing if the split
--   ever matters more than the privacy property it protects.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Day by day
--
-- Every day in the window gets a row, including the quiet ones: a gap in a
-- list of dates reads as "nothing happened", which is exactly what it means,
-- and a missing row reads as a bug.
-- ---------------------------------------------------------------------------
create or replace function public.admin_daily(p_days integer default 30)
returns table (
  day        date,
  visitors   bigint,
  visits     bigint,
  page_views bigint,
  signups    bigint,
  drafts     bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_from timestamptz := public.admin_window(v_days);
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  with days as (
    select generate_series(
             (v_from at time zone 'Asia/Singapore')::date,
             (now()   at time zone 'Asia/Singapore')::date,
             interval '1 day'
           )::date as d
  ),
  views as (
    select (e.created_at at time zone 'Asia/Singapore')::date as d,
           count(distinct e.visitor_hash) filter (where e.visitor_hash is not null) as visitors,
           count(distinct e.anon_id)                                                as visits,
           count(*)                                                                 as page_views
    from public.events e
    where e.created_at >= v_from
      and e.name = 'page_view'
      and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
    group by 1
  ),
  joins as (
    select (w.created_at at time zone 'Asia/Singapore')::date as d, count(*) as signups
    from public.waitlist w
    where w.created_at >= v_from
    group by 1
  ),
  made as (
    select (dr.created_at at time zone 'Asia/Singapore')::date as d, count(*) as drafts
    from public.drafts dr
    where dr.created_at >= v_from
    group by 1
  )
  select days.d,
         coalesce(views.visitors, 0),
         coalesce(views.visits, 0),
         coalesce(views.page_views, 0),
         coalesce(joins.signups, 0),
         coalesce(made.drafts, 0)
  from days
  left join views on views.d = days.d
  left join joins on joins.d = days.d
  left join made  on made.d  = days.d
  order by days.d desc;
end;
$$;

revoke all on function public.admin_daily(integer) from public;
grant execute on function public.admin_daily(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Hour by hour
--
-- All 24 hours, in Singapore time, whether or not anything happened in them.
-- This is the shape of a day, not a list of events: it answers "when are
-- people on the site", which decides when to publish and when to deploy.
-- ---------------------------------------------------------------------------
create or replace function public.admin_hourly(p_days integer default 30)
returns table (hour integer, visits bigint, page_views bigint, signups bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  with hours as (select generate_series(0, 23) as h),
  views as (
    select extract(hour from e.created_at at time zone 'Asia/Singapore')::integer as h,
           count(distinct e.anon_id) as visits,
           count(*)                  as page_views
    from public.events e
    where e.created_at >= v_from
      and e.name = 'page_view'
      and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
    group by 1
  ),
  joins as (
    select extract(hour from w.created_at at time zone 'Asia/Singapore')::integer as h, count(*) as signups
    from public.waitlist w
    where w.created_at >= v_from
    group by 1
  )
  select hours.h,
         coalesce(views.visits, 0),
         coalesce(views.page_views, 0),
         coalesce(joins.signups, 0)
  from hours
  left join views on views.h = hours.h
  left join joins on joins.h = hours.h
  order by hours.h;
end;
$$;

revoke all on function public.admin_hourly(integer) from public;
grant execute on function public.admin_hourly(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
do $$
declare ok boolean;
begin
  select count(*) = 1 into ok from pg_proc where proname = 'admin_daily';
  raise notice '% admin_daily() — visitors, visits, views, signups, drafts per day', case when ok then 'OK   ' else 'FAIL ' end;
  select count(*) = 1 into ok from pg_proc where proname = 'admin_hourly';
  raise notice '% admin_hourly() — the shape of a day, Singapore time', case when ok then 'OK   ' else 'FAIL ' end;
end $$;
