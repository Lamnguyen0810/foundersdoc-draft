-- ===========================================================================
-- FDAI — ranked examples, capped, and redaction on record
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- Two things the AI files tab now does that the database has to know about.
--
-- RANK. The admin puts the library in order — the firm's best NDA first —
-- and Gemini reads the examples in that order, the first labelled as the
-- style to prefer. Only the top eight ready sources of a type are sent with
-- a draft: every example is text the model must read before it writes a
-- word, and past a handful more examples make a draft slower and no better.
-- The rank is per document type; NDAs are ranked against NDAs.
--
-- REDACTION. When private details are blacked out, the text in the row IS
-- the redacted text — there is no second copy of the original anywhere in
-- the application. Two columns record that it happened, and how much.
-- ===========================================================================

alter table public.ai_sources add column if not exists rank            integer;
alter table public.ai_sources add column if not exists redacted_at     timestamptz;
alter table public.ai_sources add column if not exists redaction_count integer not null default 0;

-- Every existing row gets a place: approved ones first, in the order they
-- were approved, then the rest in the order they arrived. Re-running leaves
-- rows that already have a rank alone.
with placed as (
  select id,
         row_number() over (
           partition by doc_type_slug
           order by (status = 'ready') desc, approved_at nulls last, created_at
         ) as rn
  from public.ai_sources
)
update public.ai_sources s
   set rank = placed.rn
  from placed
 where placed.id = s.id
   and s.rank is null;

create index if not exists ai_sources_type_rank_idx on public.ai_sources (doc_type_slug, rank);

-- ---------------------------------------------------------------------------
-- What Gemini reads: ready sources of a type, best first, at most eight.
-- Same name and shape as before, so the app needs no change to call it.
-- ---------------------------------------------------------------------------
create or replace function public.ai_examples_for(p_slug text)
returns table (title text, text text)
language sql
stable
security definer
set search_path = public
as $$
  select s.title, s.content
  from public.ai_sources s
  where s.doc_type_slug = p_slug
    and s.status = 'ready'
  order by s.rank nulls last, s.approved_at nulls last, s.created_at
  limit 8;
$$;

grant execute on function public.ai_examples_for(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Saving an order: the admin sends the ids of one document type in the order
-- wanted, and each gets its position. One statement, so a half-saved order
-- cannot exist. Admin only — the same is_admin() every policy uses.
-- ---------------------------------------------------------------------------
create or replace function public.ai_sources_reorder(p_slug text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  update public.ai_sources s
     set rank = ord.pos,
         updated_at = now()
    from unnest(p_ids) with ordinality as ord(id, pos)
   where s.id = ord.id
     and s.doc_type_slug = p_slug;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.ai_sources_reorder(text, uuid[]) to authenticated;

-- New uploads land at the bottom of their type.
create or replace function public.ai_sources_default_rank()
returns trigger
language plpgsql
as $$
begin
  if new.rank is null then
    select coalesce(max(rank), 0) + 1 into new.rank
      from public.ai_sources
     where doc_type_slug = new.doc_type_slug;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_sources_default_rank on public.ai_sources;
create trigger ai_sources_default_rank
  before insert on public.ai_sources
  for each row execute function public.ai_sources_default_rank();

-- ---------------------------------------------------------------------------
-- The Users tab's three panels — Top pages, Countries, Devices — on one basis
--
-- Before, Top pages counted page loads while Countries and Devices counted
-- every recorded event, so the three panels disagreed with each other, and
-- the team's own testing was in all of them. Now each counts page loads
-- only, "people" is distinct visits (the visit id lives for one tab), and
-- anything done while signed in as an admin is left out. Same name, same
-- shape; only the counting changed.
-- ---------------------------------------------------------------------------
create or replace function public.admin_event_breakdown(
  p_kind  text,
  p_days  integer default 30,
  p_limit integer default 8
)
returns table (label text, people bigint, hits bigint)
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
      select e.path, count(distinct e.anon_id), count(*)
      from public.events e
      where e.created_at >= v_from and e.name = 'page_view' and e.path is not null
        and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
      group by 1 order by 2 desc, 3 desc limit v_n;

  elsif p_kind = 'country' then
    return query
      select e.country, count(distinct e.anon_id), count(*)
      from public.events e
      where e.created_at >= v_from and e.name = 'page_view' and e.country is not null
        and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
      group by 1 order by 2 desc, 3 desc limit v_n;

  elsif p_kind = 'device' then
    return query
      select e.device, count(distinct e.anon_id), count(*)
      from public.events e
      where e.created_at >= v_from and e.name = 'page_view' and e.device is not null
        and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
      group by 1 order by 2 desc, 3 desc limit v_n;

  elsif p_kind = 'source' then
    return query
      select e.referrer_host, count(distinct e.anon_id), count(*)
      from public.events e
      where e.created_at >= v_from and e.name = 'page_view' and e.referrer_host is not null
        and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
      group by 1 order by 2 desc, 3 desc limit v_n;

  elsif p_kind = 'event' then
    return query
      select e.name, count(distinct coalesce(e.anon_id, e.user_id::text)), count(*)
      from public.events e
      where e.created_at >= v_from
      group by 1 order by 3 desc limit v_n;

  else
    raise exception 'unknown breakdown %', p_kind using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.admin_event_breakdown(text, integer, integer) from public;
grant execute on function public.admin_event_breakdown(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
do $$
declare ok boolean; n integer;
begin
  select count(*) = 1 into ok from pg_proc where proname = 'ai_sources_reorder';
  raise notice '% ai_sources_reorder()', case when ok then 'OK   ' else 'FAIL ' end;

  select count(*) into n from public.ai_sources where rank is null;
  raise notice '% every source has a rank (% without)', case when n = 0 then 'OK   ' else 'FAIL ' end, n;
end $$;
