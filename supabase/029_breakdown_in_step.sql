-- ===========================================================================
-- FDAI — Top pages, Countries and Devices, in the same words as everything else
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Needs 028_frequent_visitors.sql.
--
-- The three breakdown panels still answered the old question — people, in a
-- column that was nearly all dashes — while the card above them had changed
-- to counting arrivals. Two panels on one screen using one word for two
-- different things is worse than either choice on its own.
--
-- They now report the same three figures the rest of the page does:
--   VISITORS  arrivals. Four pages in one sitting is one visitor.
--   UNIQUE    of those, the ones who came more than three separate times
--             across the whole period, and were on this page / in this
--             country / on this kind of device at least once.
--   VIEWS     pages opened.
-- ===========================================================================
drop function if exists public.admin_event_breakdown(text, integer, integer);

create function public.admin_event_breakdown(
  p_kind  text,
  p_days  integer default 30,
  p_limit integer default 8
)
returns table (label text, visitors bigint, frequent bigint, views bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
  v_n    integer     := greatest(1, least(coalesce(p_limit, 8), 50));
  v_col  text;
  FREQUENT_VISITS constant integer := 4;   -- "more than three times"
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  v_col := case p_kind when 'path' then 'path' when 'country' then 'country' when 'device' then 'device' else null end;
  if v_col is null then
    raise exception 'admin_event_breakdown: unknown kind %', p_kind;
  end if;

  return query execute format($q$
    with mine as (
      select e.*
      from public.events e
      where e.created_at >= $1 and e.name = 'page_view'
        and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
    ),
    regulars as (
      select m.visitor_id
      from mine m
      where m.visitor_id is not null
      group by 1
      having count(distinct m.anon_id) >= $3
    )
    select m.%1$I,
           count(distinct m.anon_id),
           count(distinct m.visitor_id) filter (where m.visitor_id in (select visitor_id from regulars)),
           count(*)
    from mine m
    where m.%1$I is not null
    group by 1 order by 2 desc, 4 desc limit $2
  $q$, v_col) using v_from, v_n, FREQUENT_VISITS;
end;
$$;

revoke all on function public.admin_event_breakdown(text, integer, integer) from public;
grant execute on function public.admin_event_breakdown(text, integer, integer) to authenticated;

do $$
declare ok boolean;
begin
  select pg_get_functiondef(oid) like '%regulars%' into ok from pg_proc where proname='admin_event_breakdown' limit 1;
  raise notice '% admin_event_breakdown() — visitors, unique, views', case when ok then 'OK   ' else 'FAIL ' end;
end $$;
