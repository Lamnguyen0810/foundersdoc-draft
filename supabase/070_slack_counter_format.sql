-- ============================================================================
-- 070 · Slack: the start counter in the new format
-- ============================================================================
--
-- The last line of each "started answering" message becomes:
--
--     NDA #10 · Cumulative: 10 · Daily: 1
--     Term Sheet #10 · Cumulative: 10 · Daily: 1
--
-- #N and Cumulative are every start of that document so far; Daily is the
-- starts since midnight Singapore time. Counting is unchanged from 069
-- (every start, admins left out). Only the wording changes.
--
-- Run after 069. Safe to run again.
-- ============================================================================

create or replace function public.doc_short_name(p_slug text)
returns text
language sql
immutable
as $$
  select case p_slug
    when 'nda'        then 'NDA'
    when 'term'       then 'Term Sheet'
    when 'employment' then 'Employment Contract'
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

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
          || ' · Cumulative: ' || to_char(v_total, 'FM999,999')
          || ' · Daily: ' || to_char(v_today, 'FM999,999');

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

-- Check: select public.doc_short_name('term'), * from public.start_counts('term');
