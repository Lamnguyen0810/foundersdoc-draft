-- ============================================================================
-- 071 · Slack: a download counter, in the same format as the start counter
-- ============================================================================
--
-- Each "finished and downloaded a draft" message gains a line:
--
--     NDA download #10 · Cumulative: 10 · Daily: 1
--     Term Sheet download #4 · Cumulative: 4 · Daily: 1
--
-- What is counted is exactly what Slack announces: one per draft and per
-- version (the same file downloaded twice counts once; a revised version
-- downloaded again counts again). Daily = since midnight Singapore time.
-- The count reads the record of announced downloads, which goes back to
-- migration 041, so downloads from before then are not in the total.
--
-- Run after 070. Safe to run again.
-- ============================================================================

create or replace function public.download_counts(p_slug text, p_at timestamptz default now())
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
  join public.drafts d on d.id = a.draft_id
  join public.doc_types t on t.id = d.doc_type_id
  where a.event like 'draft_exported%'
    and t.slug = p_slug
    and a.announced_at <= p_at;
$$;

revoke all on function public.download_counts(text, timestamptz) from public, anon, authenticated;

create or replace function public.announce_draft_download(
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
  v_message := v_message
            || E'\n' || public.doc_short_name(v_slug) || ' download #' || to_char(v_total, 'FM999,999')
            || ' · Cumulative: ' || to_char(v_total, 'FM999,999')
            || ' · Daily: ' || to_char(v_today, 'FM999,999')
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
      'message',  v_message
    ),
    timeout_milliseconds := 5000
  );

exception when others then
  raise warning 'announce_draft_download: %', sqlerrm;
end;
$$;

revoke all on function public.announce_draft_download(uuid, text) from public, anon;
grant execute on function public.announce_draft_download(uuid, text) to authenticated;

-- Check: select * from public.download_counts('nda');
