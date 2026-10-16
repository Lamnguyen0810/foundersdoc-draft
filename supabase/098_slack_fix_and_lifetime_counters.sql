-- ============================================================================
-- 098 — Slack is told again, and the counters show the lifetime total
--
-- 1. THE FIX. 096 added a check to two triggers ("is this a test account?"):
--    on_event_draft_activity (events) and on_draft_review (drafts). A
--    trigger's condition runs as whoever writes the row, and 096 took away
--    everyone's right to run that check (public.is_quiet_user). Events are
--    written through record_event, which runs as the owner, so they were
--    fine. Drafts are written by the signed-in user, so since 096 every new
--    draft was refused: nothing was saved, and a download had no draft to
--    announce — which is why the document threads heard nothing.
--
--    The check only answers yes or no for an account id, so anyone may run
--    it. The list of test accounts itself stays private.
--
-- 2. THE COUNTERS. Each Slack message gains a second line, the total for
--    every document together:
--
--      Loan Agreement #12 · Cumulative: 12 · Daily: 2
--      All documents · Lifetime: 340 · Daily: 9
--
--      Loan Agreement download #4 · Cumulative: 4 · Daily: 1
--      All documents · Lifetime downloads: 210 · Daily: 4
--
--    Counted the same way as the line above it: starts leave out admins and
--    test accounts; downloads are the ones Slack announced (one per version
--    of a draft), which goes back to migration 041. Daily = since midnight,
--    Singapore time.
--
-- Safe to run twice. Run after 096 (and 097 if you have it).
-- ============================================================================

-- 1. The fix ---------------------------------------------------------------------
grant execute on function public.is_quiet_user(uuid) to anon, authenticated, service_role;

-- 2a. Every document together ------------------------------------------------------
create or replace function public.all_start_counts(p_at timestamptz default now())
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
    and e.created_at <= p_at
    and (e.user_id is null
         or (not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
             and not public.is_quiet_user(e.user_id)));
$$;
revoke all on function public.all_start_counts(timestamptz) from public, anon, authenticated;

create or replace function public.all_download_counts(p_at timestamptz default now())
returns table (total integer, today integer)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer,
         count(*) filter (
           where (a.announced_at at time zone 'Asia/Singapore')::date = (p_at at time zone 'Asia/Singapore')::date
         )::integer
  from public.draft_announcements a
  where a.event like 'draft_exported%'
    and a.announced_at <= p_at;
$$;
revoke all on function public.all_download_counts(timestamptz) from public, anon, authenticated;

-- 2b. Starts: the message of 070, with the lifetime line ------------------------------
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
  v_all     integer := 0;
  v_all_day integer := 0;
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
  select c.total, c.today into v_all, v_all_day from public.all_start_counts(new.created_at) c;
  v_count := public.doc_short_name(v_slug) || ' #' || to_char(v_total, 'FM999,999')
          || ' · Cumulative: ' || to_char(v_total, 'FM999,999')
          || ' · Daily: ' || to_char(v_today, 'FM999,999')
          || E'\n' || 'All documents · Lifetime: ' || to_char(v_all, 'FM999,999')
          || ' · Daily: ' || to_char(v_all_day, 'FM999,999');

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
      'all_started',   v_all,
      'all_today_started', v_all_day,
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

-- 2c. Downloads: the message of 071 (renamed by 096), with the lifetime line ----------
create or replace function public.announce_draft_download_all(
  p_draft uuid default null,
  p_slug  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_draft   uuid;
  v_slug    text;
  v_doc     text;
  v_engine  text;
  v_body    text;
  v_words   integer := 0;
  v_skipped text := '';
  v_key     text;
  v_again   boolean;
  v_url     text;
  v_who     text;
  v_message text;
  v_total   integer := 0;
  v_today   integer := 0;
  v_all     integer := 0;
  v_all_day integer := 0;
begin
  if v_user is null then
    return;
  end if;

  -- The draft named, if it is this person's; otherwise the one they touched last.
  select d.id, t.slug, t.label, coalesce(t.engine, 'chat'), coalesce(d.output, '')
    into v_draft, v_slug, v_doc, v_engine, v_body
  from public.drafts d
  left join public.doc_types t on t.id = d.doc_type_id
  where d.user_id = v_user
    and d.deleted_at is null
    and (
      (p_draft is not null and d.id = p_draft)
      or (p_draft is null and (p_slug is null or t.slug = p_slug))
    )
  order by d.updated_at desc nulls last, d.created_at desc
  limit 1;

  if v_draft is null then
    return;
  end if;

  v_slug := coalesce(v_slug, p_slug);
  v_doc := coalesce(v_doc, initcap(replace(coalesce(v_slug, 'document'), '_', ' ')));

  -- Once per version: the key is the text downloaded.
  select coalesce(nullif(d.output_html, ''), d.output, '') into v_key from public.drafts d where d.id = v_draft;
  v_key := 'draft_exported:' || md5(coalesce(v_key, ''));

  select exists (
    select 1 from public.draft_announcements
    where draft_id = v_draft and event like 'draft_exported%'
  ) into v_again;

  insert into public.draft_announcements (draft_id, event)
  values (v_draft, v_key)
  on conflict do nothing;
  if not found then
    return;  -- this very version was announced already
  end if;

  v_url := public.draft_webhook(v_slug);
  if v_url is null or v_url = '' then
    return;
  end if;

  v_who := public.person_label(v_user);
  if v_who is null then
    return;
  end if;

  v_words := coalesce(array_length(regexp_split_to_array(btrim(v_body), '\s+'), 1), 0);
  if v_engine <> 'assembly' then
    v_skipped := public.skipped_steps(v_draft);
  end if;

  v_message := public.draft_message('draft_exported', v_who, v_doc, now(), v_words, v_skipped);
  if v_again then
    v_message := replace(v_message, 'finished and downloaded a draft', 'downloaded an updated version of a draft');
  end if;
  select c.total, c.today into v_total, v_today from public.download_counts(v_slug, now()) c;
  select c.total, c.today into v_all, v_all_day from public.all_download_counts(now()) c;
  v_message := v_message
            || E'\n' || public.doc_short_name(v_slug) || ' download #' || to_char(v_total, 'FM999,999')
            || ' · Cumulative: ' || to_char(v_total, 'FM999,999')
            || ' · Daily: ' || to_char(v_today, 'FM999,999')
            || E'\n' || 'All documents · Lifetime downloads: ' || to_char(v_all, 'FM999,999')
            || ' · Daily: ' || to_char(v_all_day, 'FM999,999')
            || E'\n' || public.draft_ref_line(v_draft);

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',    'draft_exported',
      'who',      v_who,
      'doc_type', v_doc,
      'words',    v_words,
      'skipped',  v_skipped,
      'at',       to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'at_text',  public.in_singapore(now()),
      'ref',      left(v_draft::text, 6),
      'total_downloads', v_total,
      'today_downloads', v_today,
      'all_downloads',   v_all,
      'all_today_downloads', v_all_day,
      'message',  v_message
    ),
    timeout_milliseconds := 5000
  );

exception when others then
  raise warning 'announce_draft_download_all: %', sqlerrm;
end;
$$;
revoke all on function public.announce_draft_download_all(uuid, text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────── the check
do $$
declare
  ok boolean;
begin
  select has_function_privilege('authenticated', 'public.is_quiet_user(uuid)', 'execute') into ok;
  raise notice '%   Signed-in users can save drafts again (test-account check runnable: %).', case when ok then 'OK  ' else 'FAIL' end, ok;
  raise notice 'OK    Lifetime so far: % starts, % downloads announced.',
    (select total from public.all_start_counts()), (select total from public.all_download_counts());
end $$;
