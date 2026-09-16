-- ===========================================================================
-- FDAI — the admin dashboard's activity and log lists
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- The dashboard's Overview shows "Recent activity" and its Logs tab shows a
-- table of what happened. Both are read from the events table, which the app
-- already writes on every meaningful step — a draft generated, revised,
-- exported, failed; a sign-in; a paywall hit. Nothing new is recorded here;
-- this only lets an administrator read what is already there, with the
-- person's email attached, which the events table does not hold.
--
-- Admin-only: the function refuses anyone is_admin() does not vouch for.
-- ===========================================================================
create or replace function public.admin_recent_events(
  p_days  integer default 30,
  p_limit integer default 50
)
returns table (
  created_at timestamptz,
  name       text,
  email      text,
  path       text,
  props      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select e.created_at, e.name, u.email, e.path, e.props
  from public.events e
  left join auth.users u on u.id = e.user_id
  where public.is_admin()
    and e.created_at >= now() - make_interval(days => greatest(1, p_days))
    and e.name <> 'page_view'
  order by e.created_at desc
  limit least(greatest(1, p_limit), 200);
$$;

grant execute on function public.admin_recent_events(integer, integer) to authenticated;

do $$
declare ok boolean;
begin
  select count(*) = 1 into ok from pg_proc where proname = 'admin_recent_events';
  raise notice '% admin_recent_events()', case when ok then 'OK   ' else 'FAIL ' end;
end $$;
