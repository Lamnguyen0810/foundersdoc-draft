-- ===========================================================================
-- FDAI — "fb undo": take back the last rule from Slack
-- Paste into the Supabase SQL editor and run once, after 046. Safe to re-run.
--
-- A rule the drafter learnt from a comment can be switched off on the
-- dashboard. From Slack the same is one message:
--
--     fb undo            switches off the most recent live rule that was
--                        learnt or made, and says which
--     fb undo            again: the one before it, and so on
--
-- Nothing is deleted: the rule stays in the history, off, and can be
-- switched back on from the dashboard.
-- ===========================================================================

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

  select url into v_url from public.webhooks where name = 'draft_activity' and enabled;
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

revoke all on function public.undo_last_lesson(text) from public, anon, authenticated;
grant execute on function public.undo_last_lesson(text) to service_role;

-- The server reads the secret to check an undo (045 made the function but
-- granted it to nobody the server runs as).
grant execute on function public.slack_feedback_secret() to service_role;

do $$
begin
  raise notice 'OK    "fb undo" in Slack switches off the last live rule';
end $$;
