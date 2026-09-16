-- ===========================================================================
-- FDAI — join_waitlist says whether the person was new
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- The site now tells Zapier about each new signup. Somebody who fills the
-- form twice is one person on the list, and should be one row in the sheet,
-- one welcome, one Slack message — so the function has to say whether the
-- row was written or already there. The reply the visitor sees does not
-- change: it is the same either way, so the form still cannot be used to
-- find out who is on the list.
-- ===========================================================================
create or replace function public.join_waitlist(
  p_email   text,
  p_name    text default null,
  p_company text default null,
  p_note    text default null,
  p_source  text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_rows  integer;
begin
  if v_email is null or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return false;
  end if;

  insert into public.waitlist (email, name, company, note, source)
  values (
    v_email,
    nullif(btrim(left(p_name, 120)), ''),
    nullif(btrim(left(p_company, 160)), ''),
    nullif(btrim(left(p_note, 1000)), ''),
    nullif(btrim(left(p_source, 80)), '')
  )
  on conflict (lower(email)) do nothing;

  get diagnostics v_rows = row_count;
  -- true: a new person. false: already on the list (or a bad address).
  return v_rows > 0;
end;
$$;

do $$
begin
  raise notice 'OK    join_waitlist() now reports whether the signup was new';
end $$;
