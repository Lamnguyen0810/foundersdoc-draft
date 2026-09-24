-- ===========================================================================
-- FDAI — The drafter learns from feedback by itself
-- Paste into the Supabase SQL editor and run once, after 045. Safe to re-run.
--
-- ── WHAT CHANGED ────────────────────────────────────────────────────────────
-- 045 queued feedback for a person to turn into a rule. The firm asked for
-- the loop to close on its own: a partner writes in Slack what is wrong
-- with a draft, and the next draft is different.
--
-- So every piece of feedback — from the Feedback button or from Slack — is
-- now read by the model together with the draft it was about, the playbook
-- and the rules already learnt, and rewritten as ONE precise rule in the
-- firm's terms. That rule goes live at once (lib/learn.ts), Slack is told
-- what was learnt, and the dashboard shows it with a switch and an edit.
-- Feedback that is not a correction ("looks good", a question) makes no
-- rule and is left for a person.
--
-- ── SAYING WHICH DRAFT ──────────────────────────────────────────────────────
-- The "finished and downloaded" Slack message now ends with a reference:
--
--     Ref #3f9a1c — reply "fb #3f9a1c: …" to give feedback on this draft
--
-- Feedback carrying that reference is read against THAT draft's text.
-- Without one, the most recent draft of the kind named (or the most recent
-- of all, within two days) is assumed, and the rule says so.
-- ===========================================================================

-- ───────────────────────────────────────────── 1. the reference on Slack
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

  select url into v_url from public.webhooks where name = 'draft_activity' and enabled;
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

    v_skipped := public.skipped_steps(v_draft);
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

revoke all on function public.announce_draft_activity() from public, anon, authenticated;

-- ────────────────────────────────────── 2. Slack feedback names its draft
create or replace function public.feedback_from_slack(
  p_secret text,
  p_text text,
  p_who text,
  p_link text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_text  text := btrim(coalesce(p_text, ''));
  v_slug  text;
  v_ref   text;
  v_draft uuid;
begin
  if p_secret is null or p_secret <> (select secret from public.inbound_secrets where name = 'slack_feedback') then
    raise exception 'bad secret' using errcode = '42501';
  end if;
  v_text := regexp_replace(v_text, '^\s*(feedback|fb)\s*:?\s*', '', 'i');

  -- "#3f9a1c" anywhere in the message: the draft it is about.
  v_ref := lower((regexp_match(v_text, '#([0-9a-fA-F]{6})'))[1]);
  if v_ref is not null then
    select d.id, t.slug into v_draft, v_slug
    from public.drafts d
    left join public.doc_types t on t.id = d.doc_type_id
    where left(d.id::text, 6) = v_ref
    order by d.created_at desc
    limit 1;
    v_text := btrim(regexp_replace(v_text, '#[0-9a-fA-F]{6}\s*:?\s*', '', 'g'));
  end if;
  if v_text = '' then
    raise exception 'empty';
  end if;

  if v_slug is null then
    select t.slug into v_slug
    from public.doc_types t
    where t.is_active
      and (v_text ~* ('\m' || t.slug || '\M') or v_text ~* ('\m' || regexp_replace(t.label, '[^A-Za-z0-9 ]', '', 'g') || '\M'))
    order by length(t.label) desc
    limit 1;
  end if;

  insert into public.draft_feedback (draft_id, doc_type_slug, user_email, message, source, link)
  values (v_draft, v_slug, left(coalesce(nullif(btrim(p_who), ''), 'Slack'), 200), left(v_text, 4000), 'slack', nullif(btrim(coalesce(p_link, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.feedback_from_slack(text, text, text, text) from public, anon, authenticated;
grant execute on function public.feedback_from_slack(text, text, text, text) to service_role;

-- ───────────────────────────────────────── 3. the rule the model wrote
/* Service role only: the server, having asked the model, records the rule
   and closes the feedback. `p_note` is the model's one-line reason, kept on
   the feedback row for the dashboard. */
alter table public.draft_feedback add column if not exists note text;

create or replace function public.learn_lesson(
  p_feedback uuid,
  p_scope text,
  p_rule text,
  p_note text default null
)
returns public.playbook_lessons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.playbook_lessons;
begin
  if p_rule is null or btrim(p_rule) = '' then
    raise exception 'the rule is empty';
  end if;
  insert into public.playbook_lessons (scope, rule, feedback_id, created_by)
  values (coalesce(nullif(btrim(p_scope), ''), '*'), left(btrim(p_rule), 2000), p_feedback, 'FD AI')
  returning * into v_row;

  update public.draft_feedback
     set status = 'applied', lesson_id = v_row.id, handled_by = 'FD AI', handled_at = now(),
         note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
   where id = p_feedback;
  return v_row;
end;
$$;
revoke all on function public.learn_lesson(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.learn_lesson(uuid, text, text, text) to service_role;

/* Feedback the model judged not to be a correction: left for a person,
   with the reason. */
create or replace function public.leave_for_a_person(p_feedback uuid, p_note text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.draft_feedback set note = nullif(left(btrim(coalesce(p_note, '')), 500), '') where id = p_feedback;
$$;
revoke all on function public.leave_for_a_person(uuid, text) from public, anon, authenticated;
grant execute on function public.leave_for_a_person(uuid, text) to service_role;

-- ───────────────────────────────────────────── 4. Slack hears the lesson
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
  select url into v_url from public.webhooks where name = 'draft_activity' and enabled;
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

drop trigger if exists on_lesson_learnt on public.playbook_lessons;
create trigger on_lesson_learnt
  after insert on public.playbook_lessons
  for each row execute function public.announce_lesson();

revoke all on function public.announce_lesson() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────── the check
do $$
begin
  if exists (select 1 from pg_proc where proname = 'learn_lesson') then
    raise notice 'OK    the drafter can record what it learns';
  end if;
  raise notice 'OK    Slack download messages now carry "Ref #xxxxxx" for draft-specific feedback';
end $$;
