-- ===========================================================================
-- FDAI — join_waitlist also reports how many are on the list
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Needs 019_waitlist_new_flag.sql first (it is what this replaces).
--
-- The Slack message the Zap posts for each signup shows the running total.
-- That number has to come from the database at the moment of the signup —
-- not from counting rows in a sheet, which only knows the people since the
-- Zap went live. So the function now answers with two things: whether the
-- person was new, and how many people are on the list right now. "On the
-- list" means waiting or invited — the same count the admin dashboard shows
-- as "joined" beside the waitlist search.
--
-- Postgres will not change a function's return type in place, so the old
-- boolean version is dropped and this one created. Nothing else calls it.
-- ===========================================================================
drop function if exists public.join_waitlist(text, text, text, text, text);

create function public.join_waitlist(
  p_email   text,
  p_name    text default null,
  p_company text default null,
  p_note    text default null,
  p_source  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_rows  integer := 0;
  v_total integer;
begin
  if v_email is not null and v_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
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
  end if;

  select count(*) into v_total from public.waitlist where status in ('waiting', 'invited');

  -- new:   true for a new person; false if already on the list (or a bad address).
  -- total: everyone waiting or invited, this signup included.
  return jsonb_build_object('new', v_rows > 0, 'total', v_total);
end;
$$;

-- The site calls this as the anonymous visitor; keep that possible, and only that.
revoke all on function public.join_waitlist(text, text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text, text) to anon, authenticated;

do $$
declare r jsonb;
begin
  r := public.join_waitlist('not-an-address');
  if (r->>'new')::boolean = false and (r->>'total') is not null then
    raise notice 'OK    join_waitlist() reports new + total (currently % on the list)', r->>'total';
  else
    raise notice 'FAIL  join_waitlist() answered %', r;
  end if;
end $$;
