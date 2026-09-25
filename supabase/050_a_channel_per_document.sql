-- ============================================================================
-- 050 · Slack: each document type to its own channel
-- ============================================================================
--
-- Until now every draft message went to one hook ('draft_activity'), so a
-- term sheet showed up in #fdai-draft-nda. Now each message is sent to the
-- hook named after its document type when there is one:
--
--     draft_activity_term   → the term sheet's Zap → #fdai-draft-termsheet
--     draft_activity        → everything else (the NDA's Zap, as today)
--
-- The same goes for feedback, rules learnt and "fb undo" about a type.
-- A term sheet's download line no longer lists NDA steps as "Skipped".
-- Nothing changes until the second hook is saved (step 2 below), so this can
-- be run before the Zap exists.
--
-- Run once, after 049. Safe to run again.
-- ============================================================================

-- ─── 1. which hook ──────────────────────────────────────────────────────────

create or replace function public.draft_webhook(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select url from public.webhooks
      where name = 'draft_activity_' || p_slug and enabled and btrim(url) <> ''),
    (select url from public.webhooks
      where name = 'draft_activity' and enabled)
  );
$$;

revoke all on function public.draft_webhook(text) from public, anon, authenticated;

-- ─── the announcers, each asking for its own hook ──────────────────────────
-- (The same functions as before, with that one line changed.)

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
  v_draft   uuid;
  v_words   integer := 0;
  v_skipped text := '';
  v_message text;
begin
  if new.name not in ('draft_started', 'draft_exported') then
    return new;
  end if;
  if new.name = 'draft_exported' and new.user_id is null then
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

  if new.name = 'draft_exported' then
    select d.id,
           array_length(regexp_split_to_array(btrim(coalesce(d.output, '')), '\s+'), 1)
      into v_draft, v_words
    from public.drafts d
    left join public.doc_types t on t.id = d.doc_type_id
    where d.user_id = new.user_id
      and d.deleted_at is null
      and (v_slug is null or t.slug = v_slug or t.slug is null)
    order by d.updated_at desc nulls last, d.created_at desc
    limit 1;

    if v_draft is null then
      return new;
    end if;

    insert into public.draft_announcements (draft_id, event)
    values (v_draft, 'draft_exported')
    on conflict do nothing;
    if not found then
      return new;
    end if;

    -- The skipped-steps line is about the NDA's questions; an assembled
    -- document (the term sheet) has none of those steps.
    if coalesce((select engine from public.doc_types where slug = v_slug), 'chat') <> 'assembly' then
      v_skipped := public.skipped_steps(v_draft);
    end if;
  end if;

  v_message := public.draft_message(new.name, v_who, v_doc, new.created_at, v_words, v_skipped);

  -- The handle for feedback: the first six characters of the draft's id.
  if v_draft is not null then
    v_message := v_message || E'\n'
      || 'Ref #' || left(v_draft::text, 6)
      || ' — reply "fb #' || left(v_draft::text, 6) || ': …" to give feedback on this draft';
  end if;

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',        new.name,
      'who',          v_who,
      'doc_type',     v_doc,
      'words',        coalesce(v_words, 0),
      'skipped',      v_skipped,
      'at',           to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'at_text',      public.in_singapore(new.created_at),
      'ref',          coalesce(left(v_draft::text, 6), ''),
      'message',      v_message
    ),
    timeout_milliseconds := 5000
  );

  return new;

exception when others then
  raise warning 'announce_draft_activity: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.announce_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text;
  v_who     text;
  v_doc     text;
  v_flags   text;
  v_message text;
  v_ref     text := left(new.id::text, 6);
begin
  if new.status not in ('held', 'stopped') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;

  v_url := public.draft_webhook((select slug from public.doc_types where id = new.doc_type_id));
  if v_url is null or v_url = '' then
    return new;
  end if;

  insert into public.draft_announcements (draft_id, event) values (new.id, new.status)
  on conflict do nothing;
  if not found then
    return new;
  end if;

  v_who := public.person_label(new.user_id);
  select label into v_doc from public.doc_types where id = new.doc_type_id;

  select string_agg('• ' || coalesce(f ->> 'scenario', '') || ': ' || coalesce(f ->> 'reason', ''), E'\n')
    into v_flags
  from jsonb_array_elements(coalesce(new.flags, '[]'::jsonb)) f
  where f ->> 'level' in ('yellow', 'red');

  if new.status = 'held' then
    v_message := ':large_yellow_circle: *' || coalesce(v_doc, 'Draft') || ' held for review* — ' || v_who
      || E'\n' || coalesce(v_flags, '(no reasons recorded)')
      || E'\n' || 'Release it from the dashboard → AI files → Review queue. Ref #' || v_ref;
  else
    v_message := ':red_circle: *' || coalesce(v_doc, 'Draft') || ' stopped* — ' || v_who
      || E'\n' || coalesce(v_flags, '(no reasons recorded)')
      || E'\n' || 'Nothing was drafted or charged; the user was pointed to a consultation. Ref #' || v_ref;
  end if;

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',    'draft_' || new.status,
      'who',      v_who,
      'doc_type', coalesce(v_doc, ''),
      'words',    0,
      'skipped',  coalesce(v_flags, ''),
      'at',       to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'at_text',  public.in_singapore(now()),
      'ref',      v_ref,
      'message',  v_message
    ),
    timeout_milliseconds := 5000
  );
  return new;

exception when others then
  raise warning 'announce_review: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.announce_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text;
  v_who  text;
  v_doc  text;
  v_msg  text;
begin
  -- It came from Slack: Slack has already seen it.
  if new.source = 'slack' then
    return new;
  end if;

  v_url := public.draft_webhook(new.doc_type_slug);
  if v_url is null or v_url = '' then
    return new;
  end if;

  v_who := coalesce(public.person_label(new.user_id), coalesce(new.user_email, 'Someone'));
  select label into v_doc from public.doc_types where slug = new.doc_type_slug;
  v_doc := coalesce(v_doc, 'a draft');

  v_msg := v_who || ' left feedback on ' || v_doc || E'\n'
        || '“' || left(new.message, 300) || case when length(new.message) > 300 then '…' else '' end || '”'
        || case when new.excerpt is not null
                then E'\n' || 'On: “' || left(new.excerpt, 160) || case when length(new.excerpt) > 160 then '…' else '' end || '”'
                else '' end
        || E'\n' || 'Admin → AI files → Feedback to turn it into a rule.';

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',   'draft_feedback',
      'who',     v_who,
      'doc_type', v_doc,
      'message', v_msg
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'announce_feedback: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.announce_lesson()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text;
  v_doc  text;
  v_from text := '';
  v_msg  text;
begin
  v_url := public.draft_webhook(new.scope);
  if v_url is null or v_url = '' then
    return new;
  end if;

  if new.scope = '*' then
    v_doc := 'every document';
  else
    select label into v_doc from public.doc_types where slug = new.scope;
    v_doc := coalesce(v_doc, new.scope);
  end if;

  if new.feedback_id is not null then
    select ' from ' || coalesce(f.user_email, 'Slack') || '’s feedback'
      into v_from
    from public.draft_feedback f where f.id = new.feedback_id;
  end if;

  v_msg := case when new.created_by = 'FD AI' then 'FD AI learnt a rule' else 'New rule' end
        || coalesce(v_from, '') || ' (' || v_doc || ')' || E'\n'
        || '“' || left(new.rule, 500) || '”' || E'\n'
        || 'It applies from the next draft. Edit or switch off: Admin → AI files → Feedback & lessons.';

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('event', 'lesson_learnt', 'scope', new.scope, 'message', v_msg),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'announce_lesson: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.undo_last_lesson(p_who text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.playbook_lessons;
  v_url text;
  v_doc text;
  v_msg text;
begin
  select * into v_row
  from public.playbook_lessons
  where live
  order by created_at desc
  limit 1;

  if v_row.id is null then
    return null;
  end if;

  update public.playbook_lessons set live = false where id = v_row.id;

  v_url := public.draft_webhook(v_row.scope);
  if v_url is not null and v_url <> '' then
    if v_row.scope = '*' then
      v_doc := 'every document';
    else
      select label into v_doc from public.doc_types where slug = v_row.scope;
      v_doc := coalesce(v_doc, v_row.scope);
    end if;
    v_msg := 'Rule switched off' || case when p_who is not null then ' by ' || p_who else '' end
          || ' (' || v_doc || ')' || E'\n'
          || '“' || left(v_row.rule, 500) || '”' || E'\n'
          || 'It no longer applies. Switch it back on: Admin → AI files → Feedback & lessons.';
    perform net.http_post(
      url := v_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('event', 'lesson_undone', 'scope', v_row.scope, 'message', v_msg),
      timeout_milliseconds := 5000
    );
  end if;

  return v_row.rule;
exception when others then
  raise warning 'undo_last_lesson: %', sqlerrm;
  return v_row.rule;
end;
$$;

-- ─── 2. the term sheet's hook ───────────────────────────────────────────────
-- In Zapier, make the new Zap (Catch Hook → Slack #fdai-draft-termsheet),
-- copy its Catch Hook URL, and run this line with it:
--
--   select public.set_webhook('draft_activity_term', 'https://hooks.zapier.com/hooks/catch/…/…/');
--
-- check:
--   select name, enabled, left(url, 45) from public.webhooks order by name;
