-- ============================================================================
-- 069 · Slack: announce every start again, and count every start
-- ============================================================================
--
-- 068 skipped a start when the same browser tab had started the same document
-- in the last 12 hours, to ignore somebody changing their first answer. But
-- a tab's code lasts as long as the tab, so a person starting a SECOND NDA in
-- the same tab — the usual way to test, and a real use — was silenced.
--
-- Now the app itself records a start once per draft (patch 0068: changing the
-- first answer no longer records a new start), so the database can simply
-- announce every start it receives, and count every start:
--
--     A visitor (no account yet) started answering
--     Non-Disclosure Agreement · 30 Sep 2026, 5:12pm
--     NDA #42 started in total · 5 today
--
-- Admin accounts are still neither announced nor counted.
-- Run after 068. Safe to run again.
-- ============================================================================

create or replace function public.start_counts(p_slug text, p_at timestamptz default now())
returns table (total integer, today integer)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer,
         count(*) filter (
           where (e.created_at at time zone 'Asia/Singapore')::date = (p_at at time zone 'Asia/Singapore')::date
         )::integer
  from public.events e
  where e.name = 'draft_started'
    and e.props ->> 'doc_type' = p_slug
    and e.created_at <= p_at
    and (e.user_id is null
         or not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin'));
$$;

revoke all on function public.start_counts(text, timestamptz) from public, anon, authenticated;

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

  -- The firm's own admins: not announced (and not counted).
  if new.user_id is not null
     and exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'admin') then
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

-- Check: select * from public.start_counts('nda');
