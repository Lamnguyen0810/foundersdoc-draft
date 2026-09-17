-- ===========================================================================
-- FDAI — count people, not person-days: unique and returning visitors
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Needs 022_unique_visitors.sql and 024_daily_and_hourly.sql.
--
-- ── WHY THIS EXISTS ────────────────────────────────────────────────────────
-- `visitor_hash` has the date baked into it, so the same person browsing on
-- eight days produced eight codes and the dashboard read "8 unique visitors"
-- when it meant one person, eight times. That is the price of a code that
-- cannot follow anyone between days — and the property that keeps it out of
-- consent-banner territory.
--
-- This adds a SECOND, OPTIONAL code, `visitor_id`, with no date in it. The
-- same person is then one visitor however many days they come, and it can be
-- said whether they had been before.
--
-- ── IT IS OFF UNTIL THE FIRM TURNS IT ON ──────────────────────────────────
-- The site only sends visitor_id when ANALYTICS_STABLE is set in Vercel.
-- Until then this column stays empty, the dashboard keeps using the daily
-- code, and nothing changes. That is deliberate: a code that survives
-- between days is a stable pseudonym, and therefore personal data under the
-- PDPA and the GDPR even though it is one-way and no IP is stored. It should
-- not start being collected before the privacy notice says it is.
--
-- ── AND IT IS DELETED ─────────────────────────────────────────────────────
-- analytics_prune() at the end removes analytics events older than twelve
-- months, so the retention promise is kept by the database rather than by
-- somebody remembering. Schedule it; the file says how.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists visitor_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_visitor_id_len') then
    alter table public.events
      add constraint events_visitor_id_len
      check (visitor_id is null or length(visitor_id) <= 64);
  end if;
end $$;

create index if not exists events_visitor_id_idx on public.events (visitor_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. record_event() accepts it
--
-- Ninth argument, with a default, so the site keeps recording normally
-- during the minutes between running this file and the deploy landing.
-- ---------------------------------------------------------------------------
drop function if exists public.record_event(text, text, text, text, text, text, jsonb, text);

create or replace function public.record_event(
  p_name          text,
  p_anon_id       text default null,
  p_path          text default null,
  p_referrer_host text default null,
  p_country       text default null,
  p_device        text default null,
  p_props         jsonb default '{}'::jsonb,
  p_visitor_hash  text default null,
  p_visitor_id    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_props jsonb := coalesce(p_props, '{}'::jsonb);
begin
  if p_name is null or p_name !~ '^[a-z][a-z0-9_]{2,40}$' then
    raise exception 'record_event: bad event name';
  end if;

  if pg_column_size(v_props) > 2048 then
    v_props := '{"truncated": true}'::jsonb;
  end if;

  insert into public.events (name, user_id, anon_id, path, referrer_host, country, device, props, visitor_hash, visitor_id)
  values (
    p_name,
    auth.uid(),
    left(p_anon_id, 40),
    left(p_path, 200),
    left(p_referrer_host, 120),
    upper(left(p_country, 2)),
    case when p_device in ('mobile','tablet','desktop') then p_device else null end,
    v_props,
    case when p_visitor_hash ~ '^[0-9a-f]{16,64}$' then p_visitor_hash else null end,
    case when p_visitor_id   ~ '^[0-9a-f]{16,64}$' then p_visitor_id   else null end
  );
end;
$$;

revoke all on function public.record_event(text,text,text,text,text,text,jsonb,text,text) from public;
grant execute on function public.record_event(text,text,text,text,text,text,jsonb,text,text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The headline figures
--
-- visitors    different people in the window (one person, eight days, is 1)
-- returning   of those, how many had been seen on an earlier day
-- new_people  the rest — people whose first day here is inside the window
--
-- All three are null-free but only meaningful once visitor_id is being
-- recorded; `visitors_from` says the first day it was, and the dashboard
-- shows a dash rather than a nought before then.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_visits(integer);

create function public.admin_visits(p_days integer default 30)
returns table (
  visitors      bigint,
  returning_v   bigint,
  new_v         bigint,
  visits        bigint,
  page_views    bigint,
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
begin
  if not public.is_admin() then
    return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
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
    select m.visitor_id,
           min(m.created_at) as first_seen_here,
           -- had this person been recorded before this window at all?
           exists (
             select 1 from public.events b
             where b.visitor_id = m.visitor_id
               and b.name = 'page_view'
               and b.created_at < v_from
           ) as seen_before,
           count(distinct (m.created_at at time zone 'Asia/Singapore')::date) as days_here
    from mine m
    where m.visitor_id is not null
    group by 1
  )
  select
    (select count(*) from people),
    (select count(*) from people where seen_before or days_here > 1),
    (select count(*) from people where not seen_before and days_here = 1),
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
-- 4. Per page, per country, per device — people, not person-days
-- ---------------------------------------------------------------------------
drop function if exists public.admin_event_breakdown(text, integer, integer);

create function public.admin_event_breakdown(
  p_kind  text,
  p_days  integer default 30,
  p_limit integer default 8
)
returns table (label text, visitors bigint, visits bigint, views bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
  v_n    integer     := greatest(1, least(coalesce(p_limit, 8), 50));
  v_col  text;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  v_col := case p_kind when 'path' then 'path' when 'country' then 'country' when 'device' then 'device'
                       else null end;
  if v_col is null then
    raise exception 'admin_event_breakdown: unknown kind %', p_kind;
  end if;

  return query execute format($q$
    select e.%1$I,
           count(distinct e.visitor_id) filter (where e.visitor_id is not null),
           count(distinct e.anon_id),
           count(*)
    from public.events e
    where e.created_at >= $1 and e.name = 'page_view' and e.%1$I is not null
      and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
    group by 1 order by 2 desc, 3 desc, 4 desc limit $2
  $q$, v_col) using v_from, v_n;
end;
$$;

revoke all on function public.admin_event_breakdown(text, integer, integer) from public;
grant execute on function public.admin_event_breakdown(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Day by day, with the people who had been before
-- ---------------------------------------------------------------------------
drop function if exists public.admin_daily(integer);

create function public.admin_daily(p_days integer default 30)
returns table (
  day        date,
  visitors   bigint,
  returning_v bigint,
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
  mine as (
    select e.*, (e.created_at at time zone 'Asia/Singapore')::date as d
    from public.events e
    where e.created_at >= v_from
      and e.name = 'page_view'
      and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
  ),
  views as (
    select m.d,
           count(distinct m.visitor_id) filter (where m.visitor_id is not null) as visitors,
           count(distinct m.anon_id)                                            as visits,
           count(*)                                                             as page_views
    from mine m group by 1
  ),
  -- somebody is "returning" on a day if they were recorded on an earlier day
  back as (
    select m.d, count(distinct m.visitor_id) as returning_v
    from mine m
    where m.visitor_id is not null
      and exists (
        select 1 from public.events b
        where b.visitor_id = m.visitor_id
          and b.name = 'page_view'
          and (b.created_at at time zone 'Asia/Singapore')::date < m.d
      )
    group by 1
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
         coalesce(back.returning_v, 0),
         coalesce(views.visits, 0),
         coalesce(views.page_views, 0),
         coalesce(joins.signups, 0),
         coalesce(made.drafts, 0)
  from days
  left join views on views.d = days.d
  left join back  on back.d  = days.d
  left join joins on joins.d = days.d
  left join made  on made.d  = days.d
  order by days.d desc;
end;
$$;

revoke all on function public.admin_daily(integer) from public;
grant execute on function public.admin_daily(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The retention promise, kept by the database
--
-- Deletes analytics events older than twelve months. Nothing else reads this
-- table, so nothing else is affected. Run it on a schedule:
--
--   Supabase → Integrations → Cron → new job
--     name:     prune-analytics
--     schedule: 0 3 * * 0          (Sundays, 3am UTC)
--     command:  select public.analytics_prune();
--
-- Or run it by hand now and then; it is the same function either way.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_prune(p_months integer default 12)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cut timestamptz := now() - (greatest(1, least(coalesce(p_months, 12), 60)) || ' months')::interval;
  v_gone bigint;
begin
  delete from public.events where created_at < v_cut;
  get diagnostics v_gone = row_count;
  return v_gone;
end;
$$;

revoke all on function public.analytics_prune(integer) from public;
grant execute on function public.analytics_prune(integer) to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
do $$
declare ok boolean;
begin
  select count(*) = 1 into ok from information_schema.columns
    where table_schema='public' and table_name='events' and column_name='visitor_id';
  raise notice '% events.visitor_id (empty until ANALYTICS_STABLE is set)', case when ok then 'OK   ' else 'FAIL ' end;

  select pg_get_functiondef(oid) like '%returning_v%' into ok from pg_proc where proname='admin_visits' limit 1;
  raise notice '% admin_visits() — visitors, returning, new', case when ok then 'OK   ' else 'FAIL ' end;

  select count(*) = 1 into ok from pg_proc where proname='analytics_prune';
  raise notice '% analytics_prune() — schedule it; see the comment in this file', case when ok then 'OK   ' else 'FAIL ' end;
end $$;
