-- ============================================================================
-- 059 · Slack: every download heard, and feedback answered
-- ============================================================================
--
-- 1. DOWNLOADS. The "finished and downloaded a draft" line used to hang off
--    an analytics event the BROWSER sent after the Word file arrived. An ad
--    blocker, a privacy setting or a closed tab could stop that event, and
--    the database then had to guess which draft had been downloaded (the one
--    touched most recently). Some downloads were never announced.
--
--    Now the download route announces it itself, on the server, for the exact
--    draft (announce_draft_download below). The analytics event is still
--    recorded for the dashboard; it just no longer drives Slack.
--
--    One line per draft AND per version: a draft downloaded again after a
--    revision or an edit is announced again ("downloaded an updated
--    version"); the same file downloaded twice is announced once.
--
-- 2. FEEDBACK. The draft messages say: fb #ref: … . The app ignored those
--    (it wanted "fb:" with nothing in between) — fixed in the code. And a
--    piece of feedback that did not become a rule got no answer in Slack at
--    all; ack_slack_feedback() now says it was saved and where to find it.
--
-- Run AFTER the code (patch 0045) is live. Safe to run again.
-- ============================================================================

-- ─── 1a. the draft line, wording in one place ──────────────────────────────
create or replace function public.draft_ref_line(p_draft uuid)
returns text
language sql
immutable
as $$
  select 'Ref #' || left(p_draft::text, 6)
      || ' — to give feedback, send "fb #' || left(p_draft::text, 6) || ': …" as a new message in this channel';
$$;

-- ─── 1b. announce a download, from the download route ─────────────────────
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
  v_message := v_message || E'\n' || public.draft_ref_line(v_draft);

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

-- ─── 1c. the event trigger: "started answering" only ──────────────────────
-- (050's function, with the download branch taken out — the download route
-- announces those now, so a download is never announced twice.)
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
begin
  if new.name <> 'draft_started' then
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

  v_message := public.draft_message(new.name, v_who, v_doc, new.created_at, 0, '');

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',    new.name,
      'who',      v_who,
      'doc_type', v_doc,
      'words',    0,
      'skipped',  '',
      'at',       to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'at_text',  public.in_singapore(new.created_at),
      'ref',      '',
      'message',  v_message
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

-- ─── 2. an answer to feedback that did not become a rule ──────────────────
create or replace function public.ack_slack_feedback(
  p_feedback uuid,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.draft_feedback;
  v_url  text;
  v_doc  text;
  v_msg  text;
begin
  select * into v_row from public.draft_feedback where id = p_feedback;
  if v_row.id is null then
    return;
  end if;

  v_url := public.draft_webhook(v_row.doc_type_slug);
  if v_url is null or v_url = '' then
    return;
  end if;

  select label into v_doc from public.doc_types where slug = v_row.doc_type_slug;

  v_msg := 'Feedback saved'
        || case when v_row.draft_id is not null then ' for #' || left(v_row.draft_id::text, 6) else '' end
        || case when v_doc is not null then ' (' || v_doc || ')' else '' end
        || ' — from ' || coalesce(v_row.user_email, 'Slack') || E'\n'
        || '“' || left(v_row.message, 300) || case when length(v_row.message) > 300 then '…' else '' end || '”' || E'\n'
        || case
             when p_reason ilike '%already%' then 'FD AI already follows this rule, so nothing new was added.'
             when p_reason is not null and p_reason <> '' and p_reason <> 'error' then 'Not turned into a rule automatically: ' || left(p_reason, 200) || '.'
             else 'Not turned into a rule automatically.'
           end
        || E'\n' || 'It is waiting in Admin → AI files → Feedback & lessons.';

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('event', 'feedback_saved', 'message', v_msg),
    timeout_milliseconds := 5000
  );
exception when others then
  raise warning 'ack_slack_feedback: %', sqlerrm;
end;
$$;

revoke all on function public.ack_slack_feedback(uuid, text) from public, anon, authenticated;
grant execute on function public.ack_slack_feedback(uuid, text) to service_role;

-- ─── checks ────────────────────────────────────────────────────────────────
-- The last downloads announced, and what Zapier answered:
--   select draft_id, event, announced_at from public.draft_announcements order by announced_at desc limit 10;
--   select id, status_code, left(content::text, 80), created from net._http_response order by created desc limit 10;
