-- ===========================================================================
-- FDAI — the firm's own vocabulary: visitors, and the ones who keep coming
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Needs 027_returning_visitors.sql.
--
-- ── THE WORDS, AS THE FIRM USES THEM ──────────────────────────────────────
--   VISITOR          a person who came. One person is one visitor, however
--                    many times they came back.
--   UNIQUE VISITOR   a visitor who came MORE THAN THREE TIMES in the period
--                    — four separate sittings or more. They are counted in
--                    Visitors as well: this is a subset, not a separate
--                    population.
--   VISIT            one sitting.
--   VIEW             one page opened.
--
--   Note for whoever reads this later: "unique visitor" means something
--   else in Google Analytics and in most analytics writing, where it is
--   simply a distinct person. The dashboard spells out the firm's meaning
--   beside the figure so the two are never confused.
--
--   THRESHOLD is four. To change it, edit FREQUENT_VISITS below and re-run;
--   nothing else needs touching.
--
-- Both figures need the lasting visitor code, which the site only sends when
-- ANALYTICS_STABLE is set. Until then they come back as nought and the
-- dashboard shows a dash.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The headline figures
-- ---------------------------------------------------------------------------
drop function if exists public.admin_visits(integer);

create function public.admin_visits(p_days integer default 30)
returns table (
  visitors      bigint,   -- people
  frequent      bigint,   -- of those, the ones who came more than three times
  visits        bigint,   -- sittings
  page_views    bigint,   -- pages opened
  countries     bigint,
  first_day     date,
  last_day      date,
  visitors_from date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
  -- More than three times. Four or more sittings.
  FREQUENT_VISITS constant integer := 4;
begin
  if not public.is_admin() then
    return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
                        null::date, null::date, null::date;
    return;
  end if;

  return query
  with mine as (
    select e.*
    from public.events e
    where e.created_at >= v_from
      and e.name = 'page_view'
      and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
  ),
  people as (
    select m.visitor_id, count(distinct m.anon_id) as times_here
    from mine m
    where m.visitor_id is not null
    group by 1
  )
  select
    (select count(*) from people),
    (select count(*) from people where times_here >= FREQUENT_VISITS),
    (select count(distinct anon_id) from mine),
    (select count(*) from mine),
    (select count(distinct country) from mine),
    (select min(created_at)::date from mine),
    (select max(created_at)::date from mine),
    (select min(created_at) filter (where visitor_id is not null)::date from mine);
end;
$$;

revoke all on function public.admin_visits(integer) from public;
grant execute on function public.admin_visits(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Day by day, in the firm's column order
--
--    day · visitors · frequent · signups · visits · page views · drafts
--
-- `frequent` on a single day means a person who has come more than three
-- times across the whole period and was here on that day — the same people
-- the headline figure counts, shown on the days they turned up. Counting
-- "more than three times within one day" would be a different and far less
-- useful question.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_daily(integer);

create function public.admin_daily(p_days integer default 30)
returns table (
  day        date,
  visitors   bigint,
  frequent   bigint,
  signups    bigint,
  visits     bigint,
  page_views bigint,
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
  FREQUENT_VISITS constant integer := 4;
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
  mine as (
    select e.*, (e.created_at at time zone 'Asia/Singapore')::date as d
    from public.events e
    where e.created_at >= v_from
      and e.name = 'page_view'
      and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
  ),
  regulars as (
    select m.visitor_id
    from mine m
    where m.visitor_id is not null
    group by 1
    having count(distinct m.anon_id) >= FREQUENT_VISITS
  ),
  views as (
    select m.d,
           count(distinct m.visitor_id) filter (where m.visitor_id is not null) as visitors,
           count(distinct m.visitor_id) filter (where m.visitor_id in (select visitor_id from regulars)) as frequent,
           count(distinct m.anon_id)                                            as visits,
           count(*)                                                             as page_views
    from mine m group by 1
  ),
  joins as (
    select (w.created_at at time zone 'Asia/Singapore')::date as d, count(*) as signups
    from public.waitlist w where w.created_at >= v_from group by 1
  ),
  made as (
    select (dr.created_at at time zone 'Asia/Singapore')::date as d, count(*) as drafts
    from public.drafts dr where dr.created_at >= v_from group by 1
  )
  select days.d,
         coalesce(views.visitors, 0),
         coalesce(views.frequent, 0),
         coalesce(joins.signups, 0),
         coalesce(views.visits, 0),
         coalesce(views.page_views, 0),
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
-- Check
-- ---------------------------------------------------------------------------
do $$
declare ok boolean;
begin
  select pg_get_functiondef(oid) like '%frequent%' into ok from pg_proc where proname='admin_visits' limit 1;
  raise notice '% admin_visits() — visitors, and those who came more than three times', case when ok then 'OK   ' else 'FAIL ' end;
  select pg_get_functiondef(oid) like '%frequent%' into ok from pg_proc where proname='admin_daily' limit 1;
  raise notice '% admin_daily() — day, visitors, unique, signups, visits, views, drafts', case when ok then 'OK   ' else 'FAIL ' end;
end $$;
