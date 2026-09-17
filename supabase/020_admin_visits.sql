-- ===========================================================================
-- FDAI — the website visitor counter on the admin dashboard
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- One number, clearly defined: visits to foundersdoc.com in the period,
-- counted from page loads recorded by the site's own counter, with the
-- firm's own admin accounts left out. A visit is one browser tab session
-- (the visit id lives in the tab and dies with it), so a person who comes
-- back tomorrow is a new visit — this is visits, not unique people, and
-- the dashboard says so.
-- ===========================================================================
create or replace function public.admin_visits(p_days integer default 30)
returns table (visits bigint, page_loads bigint, countries bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct e.anon_id), count(*), count(distinct e.country)
  from public.events e
  where e.created_at >= public.admin_window(p_days)
    and e.name = 'page_view'
    and public.is_admin()
    and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin');
$$;

revoke all on function public.admin_visits(integer) from public;
grant execute on function public.admin_visits(integer) to authenticated;

do $$
begin
  raise notice 'OK    admin_visits() — website visits, page loads, countries';
end $$;
