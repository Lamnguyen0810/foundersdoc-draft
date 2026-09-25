-- ============================================================================
-- 049 · Term sheet: flags are for the client's own lawyer, not a hold at FD
-- ============================================================================
--
-- The playbook's 🟡 "flag for lawyer review" is read as the review a client
-- gets from their own lawyer before signing. So a flagged term sheet is no
-- longer held back from download: its points are listed beside the letter.
-- Only a 🔴 stop is not drafted, and that still reaches Slack and the
-- dashboard's Review queue.
--
--   1. Any term sheet still waiting as `held` becomes an ordinary draft.
--   2. The Slack line for a stopped one says what the user was actually told.
--
-- Run once, after 048. Safe to run again. Nothing here touches the NDA.
-- ============================================================================

update public.drafts
   set status = 'draft'
 where status = 'held';

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

  select url into v_url from public.webhooks where name = 'draft_activity' and enabled;
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

-- check:
-- select count(*) from public.drafts where status = 'held';   -- 0
