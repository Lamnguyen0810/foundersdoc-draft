-- ============================================================================
-- 068 · Slack: every start, with the running count
-- ============================================================================
--
-- The line Slack already gets when somebody starts answering (041, 050, 059)
-- now carries the count so far:
--
--     A visitor (no account yet) started answering
--     Non-Disclosure Agreement · 30 Sep 2026, 5:12pm
--     NDA #42 started in total · 5 today
--
-- COUNTED ONCE PER SITTING. Going back to change the first answer records
-- the first-question event again; that is not a second person starting. A
-- repeat from the same sitting (the same tab, anon_id) or the same account
-- within 12 hours sends nothing and is not counted again.
--
-- The firm's own admin accounts are not counted (they test), and their
-- starts are not announced.
--
-- "Today" is the Singapore day. The same figures go to Zapier as
-- total_started and today_started, should the Zap want them separately.
--
-- Run after 059. Safe to run again. Nothing here can stop an event being
-- recorded: every failure is caught and logged as a warning.
-- ============================================================================

-- ─── 1. the short name used in the count line ─────────────────────────────
create or replace function public.doc_short_name(p_slug text)
returns text
language sql
immutable
as $$
  select case p_slug
    when 'nda'        then 'NDA'
    when 'term'       then 'Term sheet'
    when 'employment' then 'Employment contract'
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ─── 2. how many have started, in total and today ─────────────────────────
/*
 * One per sitting (anon_id), or per account when there is no sitting code,
 * or per event when there is neither. Admins left out.
 */
create or replace function public.start_counts(p_slug text, p_at timestamptz default now())
returns table (total integer, today integer)
language sql
stable
security definer
set search_path = public
as $$
  with starts as (
    select e.created_at,
           coalesce(e.anon_id, 'u:' || e.user_id::text, 'e:' || e.id::text) as who
    from public.events e
    where e.name = 'draft_started'
      and e.props ->> 'doc_type' = p_slug
      and e.created_at <= p_at
      and (e.user_id is null
           or not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin'))
  ),
  firsts as (
    select who, min(created_at) as first_at from starts group by who
  )
  select count(*)::integer,
         count(*) filter (
           where (first_at at time zone 'Asia/Singapore')::date = (p_at at time zone 'Asia/Singapore')::date
         )::integer
  from firsts;
$$;

revoke all on function public.start_counts(text, timestamptz) from public, anon, authenticated;

-- ─── 3. the announcement, with the count ──────────────────────────────────
create or replace function public.announce_draft_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text;
  v_who     text;
  v_slug    text := new.props ->> 'doc_type';
  v_doc     text;
  v_message text;
  v_total   integer := 0;
  v_today   integer := 0;
  v_count   text;
begin
  if new.name <> 'draft_started' then
    return new;
  end if;

  -- The firm's own admins: not announced (and not counted, see start_counts).
  if new.user_id is not null
     and exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'admin') then
    return new;
  end if;

  -- Once per sitting: the first answer changed again is not a new start.
  if exists (
    select 1 from public.events e
    where e.name = 'draft_started'
      and e.id <> new.id
      and e.props ->> 'doc_type' = v_slug
      and e.created_at > new.created_at - interval '12 hours'
      and e.created_at <= new.created_at
      and ((new.anon_id is not null and e.anon_id = new.anon_id)
           or (new.anon_id is null and new.user_id is not null and e.user_id = new.user_id))
  ) then
    return new;
  end if;

  v_url := public.draft_webhook(v_slug);
  if v_url is null or v_url = '' then
    return new;
  end if;

  if new.user_id is null then
    v_who := 'A visitor (no account yet)';
  else
    v_who := public.person_label(new.user_id);
    if v_who is null then
      return new;
    end if;
  end if;

  select label into v_doc from public.doc_types where slug = v_slug;
  v_doc := coalesce(v_doc, initcap(replace(coalesce(v_slug, 'document'), '_', ' ')));

  select c.total, c.today into v_total, v_today from public.start_counts(v_slug, new.created_at) c;
  v_count := public.doc_short_name(v_slug) || ' #' || to_char(v_total, 'FM999,999')
          || ' started in total · ' || to_char(v_today, 'FM999,999') || ' today';

  v_message := public.draft_message(new.name, v_who, v_doc, new.created_at, 0, '') || E'\n' || v_count;

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',         new.name,
      'who',           v_who,
      'doc_type',      v_doc,
      'words',         0,
      'skipped',       '',
      'at',            to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'at_text',       public.in_singapore(new.created_at),
      'ref',           '',
      'total_started', v_total,
      'today_started', v_today,
      'message',       v_message
    ),
    timeout_milliseconds := 5000
  );
  return new;

exception when others then
  raise warning 'announce_draft_activity: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.announce_draft_activity() from public, anon, authenticated;

-- ─── checks ────────────────────────────────────────────────────────────────
-- The count as Slack will see it next:
--   select * from public.start_counts('nda');
-- What Zapier answered to the last few announcements:
--   select id, status_code, left(content::text, 80), created from net._http_response order by created desc limit 10;
