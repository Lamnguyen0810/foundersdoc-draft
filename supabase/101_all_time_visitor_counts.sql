-- ============================================================================
-- 101 — All-time unique visitors and visits, counted by the database
--
-- The daily report showed "not tracked" for the all-time unique visitors
-- and visits: counting them in the app means reading every page view ever
-- recorded, every day. The database counts them in a moment instead.
--
--   people  different people (their lasting code; a person back three
--           times is one)
--   visits  different sittings (four pages in one sitting is one visit)
--
-- Counted the same way as the daily figures: page views up to p_end, the
-- firm's admins left out. Only the report (service role) may call it.
-- Safe to run twice.
-- ============================================================================

create or replace function public.page_view_totals(p_end timestamptz default now())
returns table (people bigint, visits bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct coalesce(e.visitor_id, e.anon_id)),
         count(distinct e.anon_id)
  from public.events e
  where e.name = 'page_view'
    and e.created_at < p_end
    and (e.user_id is null
         or not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin'));
$$;
revoke all on function public.page_view_totals(timestamptz) from public, anon, authenticated;
grant execute on function public.page_view_totals(timestamptz) to service_role;

-- ────────────────────────────────────────────────────────────── the check
do $$
declare
  r record;
begin
  select * into r from public.page_view_totals();
  raise notice 'OK    All time so far: % unique visitors, % visits.', r.people, r.visits;
end $$;
