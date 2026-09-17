-- ===========================================================================
-- FDAI — open a day and see what happened, in order
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 024_daily_and_hourly.sql first if you have not.
--
-- Clicking a day on the dashboard asks these two questions of it:
--   admin_day_hours   how the traffic sat across that day's 24 hours
--   admin_day_events  what actually happened, in order, with the time
--
-- WHAT A PERSON IS CALLED HERE
--   Somebody signed in is named by their account's email, because an admin
--   can already see that on the Accounts table and needs it to help them.
--   Everybody else stays anonymous: a visit shows its country and device and
--   nothing else. No IP address, no fingerprint, no name a visitor did not
--   give. Page views are not listed one by one at all — they are the hour
--   table. Listing every page a single anonymous person opened, in order,
--   is a browsing history, which is not something a law firm should keep on
--   a dashboard.
--
-- Days run midnight to midnight in Singapore, as everywhere else on the page.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The shape of one day
-- ---------------------------------------------------------------------------
create or replace function public.admin_day_hours(p_day date)
returns table (hour integer, visits bigint, page_views bigint, signups bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'Asia/Singapore');
  v_to   timestamptz := v_from + interval '1 day';
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
    where e.created_at >= v_from and e.created_at < v_to
      and e.name = 'page_view'
      and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
    group by 1
  ),
  joins as (
    select extract(hour from w.created_at at time zone 'Asia/Singapore')::integer as h, count(*) as signups
    from public.waitlist w
    where w.created_at >= v_from and w.created_at < v_to
    group by 1
  )
  select hours.h, coalesce(views.visits, 0), coalesce(views.page_views, 0), coalesce(joins.signups, 0)
  from hours
  left join views on views.h = hours.h
  left join joins on joins.h = hours.h
  where coalesce(views.page_views, 0) > 0 or coalesce(joins.signups, 0) > 0
  order by hours.h;
end;
$$;

revoke all on function public.admin_day_hours(date) from public;
grant execute on function public.admin_day_hours(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. What happened that day, newest first
--
-- kind:   'signup' | 'draft' | an event name
-- who:    the account's email where somebody was signed in, else null
-- detail: the document type, the page, or the referrer — never an answer,
--         a draft's title or a file's name
-- ---------------------------------------------------------------------------
create or replace function public.admin_day_events(p_day date, p_limit integer default 200)
returns table (
  at      timestamptz,
  kind    text,
  who     text,
  detail  text,
  country text,
  device  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'Asia/Singapore');
  v_to   timestamptz := v_from + interval '1 day';
  v_n    integer     := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select * from (
    -- somebody joined the waitlist
    select w.created_at, 'signup'::text, w.email,
           nullif(coalesce(w.company, ''), '')::text, null::text, null::text
    from public.waitlist w
    where w.created_at >= v_from and w.created_at < v_to

    union all

    -- a draft was started
    select d.created_at, 'draft'::text, p.email,
           coalesce(t.label, 'Document')::text, null::text, null::text
    from public.drafts d
    left join public.profiles p on p.id = d.user_id
    left join public.doc_types t on t.id = d.doc_type_id
    where d.created_at >= v_from and d.created_at < v_to

    union all

    -- the moments worth seeing, rather than every page view
    select e.created_at, e.name, p.email,
           coalesce(e.props->>'doc_type', e.path)::text, e.country, e.device
    from public.events e
    left join public.profiles p on p.id = e.user_id
    where e.created_at >= v_from and e.created_at < v_to
      and e.name in (
        'draft_generated','draft_exported','draft_failed','source_uploaded',
        'draft_revised','draft_abandoned','paywall_hit',
        'sign_up_started','sign_in_ok','sign_in_failed',
        'contact_submit','consult_click','launch_fdai_click'
      )
  ) rows
  order by 1 desc
  limit v_n;
end;
$$;

revoke all on function public.admin_day_events(date, integer) from public;
grant execute on function public.admin_day_events(date, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
do $$
declare ok boolean;
begin
  select count(*) = 1 into ok from pg_proc where proname = 'admin_day_hours';
  raise notice '% admin_day_hours() — one day across its 24 hours', case when ok then 'OK   ' else 'FAIL ' end;
  select count(*) = 1 into ok from pg_proc where proname = 'admin_day_events';
  raise notice '% admin_day_events() — what happened that day, in order', case when ok then 'OK   ' else 'FAIL ' end;
end $$;
