-- ===========================================================================
-- FDAI — unique visitors, page views, and the dates a report covers
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 020_admin_visits.sql first if you have not.
--
-- WHAT CHANGES
--   Until now the dashboard could only count VISITS: one browser tab's
--   sitting, identified by an id that dies with the tab. A person who came
--   back the next day counted twice and there was no way to tell.
--
--   Events now carry a `visitor_hash`: a one-way fingerprint the site's
--   server makes from the visitor's IP address, their browser's user-agent
--   string, and a secret that CHANGES EVERY DAY (ANALYTICS_SALT + the date).
--   The IP itself is never sent here and never stored — only the hash is,
--   and a hash cannot be turned back into an address.
--
--   Because the secret changes at midnight UTC, the same person browsing
--   tomorrow produces a completely different hash. That is deliberate: it is
--   what keeps this out of consent-banner territory (nothing follows anyone
--   between days), and it is why the number is defined as
--
--        UNIQUE VISITORS = people, counted once per day.
--
--   Over a 30-day window, somebody who visited on five days counts five
--   times. The dashboard says so in as many words. Nothing here pretends to
--   be a count of individual people over the whole period — that would need
--   a lasting identifier, which would need consent.
--
--   Older rows have no hash. They still count towards visits and page views;
--   they simply cannot contribute a visitor. The dashboard shows a dash
--   rather than a wrong number when a period has no hashes at all.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists visitor_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_visitor_hash_len') then
    alter table public.events
      add constraint events_visitor_hash_len
      check (visitor_hash is null or length(visitor_hash) <= 64);
  end if;
end $$;

create index if not exists events_visitor_idx
  on public.events (created_at desc, visitor_hash);

-- ---------------------------------------------------------------------------
-- 2. record_event() accepts it
--
-- The old seven-argument version is dropped and replaced by one that takes
-- the hash as an eighth argument WITH A DEFAULT. That order matters: while
-- the site is still being deployed it will call this with the old seven
-- arguments, which land on this function with the hash left null. Nothing
-- stops being recorded in between.
-- ---------------------------------------------------------------------------
drop function if exists public.record_event(text, text, text, text, text, text, jsonb);

create or replace function public.record_event(
  p_name          text,
  p_anon_id       text default null,
  p_path          text default null,
  p_referrer_host text default null,
  p_country       text default null,
  p_device        text default null,
  p_props         jsonb default '{}'::jsonb,
  p_visitor_hash  text default null
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

  insert into public.events (name, user_id, anon_id, path, referrer_host, country, device, props, visitor_hash)
  values (
    p_name,
    auth.uid(),
    left(p_anon_id, 40),
    left(p_path, 200),
    left(p_referrer_host, 120),
    upper(left(p_country, 2)),
    case when p_device in ('mobile','tablet','desktop') then p_device else null end,
    v_props,
    -- Hex only, and never long enough to be anything but a hash.
    case when p_visitor_hash ~ '^[0-9a-f]{16,64}$' then p_visitor_hash else null end
  );
end;
$$;

revoke all on function public.record_event(text,text,text,text,text,text,jsonb,text) from public;
grant execute on function public.record_event(text,text,text,text,text,text,jsonb,text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The headline figures, with the dates they cover
--
-- visitors    people, counted once per day (null hashes ignored)
-- visits      browser tab sessions
-- page_views  pages opened
-- countries   distinct countries seen
-- first_day   the earliest day in the window that recorded anything
-- last_day    the latest
-- ---------------------------------------------------------------------------
drop function if exists public.admin_visits(integer);

create function public.admin_visits(p_days integer default 30)
returns table (
  visitors   bigint,
  visits     bigint,
  page_views bigint,
  countries  bigint,
  first_day  date,
  last_day   date
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
    max(e.created_at)::date
  from public.events e
  where e.created_at >= public.admin_window(p_days)
    and e.name = 'page_view'
    and public.is_admin()
    and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin');
$$;

revoke all on function public.admin_visits(integer) from public;
grant execute on function public.admin_visits(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The same three figures per page, per country, per device
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
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_kind = 'path' then
    return query
      select e.path,
             count(distinct e.visitor_hash) filter (where e.visitor_hash is not null),
             count(distinct e.anon_id),
             count(*)
      from public.events e
      where e.created_at >= v_from and e.name = 'page_view' and e.path is not null
        and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
      group by 1 order by 2 desc, 3 desc, 4 desc limit v_n;

  elsif p_kind = 'country' then
    return query
      select e.country,
             count(distinct e.visitor_hash) filter (where e.visitor_hash is not null),
             count(distinct e.anon_id),
             count(*)
      from public.events e
      where e.created_at >= v_from and e.name = 'page_view' and e.country is not null
        and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
      group by 1 order by 2 desc, 3 desc, 4 desc limit v_n;

  elsif p_kind = 'device' then
    return query
      select e.device,
             count(distinct e.visitor_hash) filter (where e.visitor_hash is not null),
             count(distinct e.anon_id),
             count(*)
      from public.events e
      where e.created_at >= v_from and e.name = 'page_view' and e.device is not null
        and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
      group by 1 order by 2 desc, 3 desc, 4 desc limit v_n;

  else
    raise exception 'admin_event_breakdown: unknown kind %', p_kind;
  end if;
end;
$$;

revoke all on function public.admin_event_breakdown(text, integer, integer) from public;
grant execute on function public.admin_event_breakdown(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
do $$
declare ok boolean;
begin
  select count(*) = 1 into ok from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'visitor_hash';
  raise notice '% events.visitor_hash', case when ok then 'OK   ' else 'FAIL ' end;

  select count(*) = 1 into ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_visits';
  raise notice '% admin_visits() — visitors, visits, page views, countries, dates',
    case when ok then 'OK   ' else 'FAIL ' end;

  raise notice 'NEXT  set ANALYTICS_SALT in Vercel, then redeploy, or unique visitors stay blank';
end $$;
