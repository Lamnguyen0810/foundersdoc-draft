-- ============================================================================
-- 102 — "Before you go": why people leave a document half-way
--
-- When someone who has started answering looks like leaving, FD AI asks what
-- made them stop (a reason), how it has been so far (1–5) and anything else
-- (optional text). Each answer:
--
--   1. is kept in public.exit_feedback (the firm reads it; nobody else can),
--   2. is posted to that document's Slack channel through the router Zap
--      (099), e.g.
--
--        👋 Left the IP Assignment Agreement after 4 questions
--        Reason: It's taking longer than I expected · Rating: ★★☆☆☆ (2/5)
--        "Wasn't sure what background IP meant"
--        A visitor (no account yet) · 19 Oct 2026, 3:05pm
--
-- Visitors without an account can send it, so it goes in through one
-- function that checks every value and keeps a lid on volume. Test accounts
-- and admins are stored but not posted.
--
-- Read them:  select * from public.exit_feedback order by created_at desc;
--
-- Safe to run twice. Run after 099.
-- ============================================================================

create table if not exists public.exit_feedback (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  doc_type     text not null,
  step         integer,
  total_steps  integer,
  reason       text check (reason in ('just_looking', 'too_long', 'unsure', 'wrong_doc', 'price', 'want_lawyer', 'not_working', 'other')),
  rating       smallint check (rating between 1 and 5),
  comment      text check (length(comment) <= 1000),
  trigger      text check (trigger in ('exit_intent', 'link')),
  user_id      uuid references auth.users (id) on delete set null,
  anon_id      text
);
alter table public.exit_feedback enable row level security;
revoke all on table public.exit_feedback from anon, authenticated;
create index if not exists exit_feedback_created on public.exit_feedback (created_at desc);

create or replace function public.exit_reason_label(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when 'just_looking' then 'Just having a look for now'
    when 'too_long'     then 'It''s taking longer than I expected'
    when 'unsure'       then 'I''m not sure how to answer some questions'
    when 'wrong_doc'    then 'This isn''t quite the document I need'
    when 'price'        then 'I''d like to know more about pricing'
    when 'want_lawyer'  then 'I''d feel better talking to a lawyer'
    when 'not_working'  then 'Something didn''t work as expected'
    when 'other'        then 'Something else'
    else 'Not given'
  end;
$$;

-- 1. The only way in -------------------------------------------------------------
create or replace function public.leave_exit_feedback(
  p_doc     text,
  p_step    integer,
  p_total   integer,
  p_reason  text,
  p_rating  integer,
  p_comment text,
  p_trigger text,
  p_anon    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_comment text := nullif(btrim(left(coalesce(p_comment, ''), 1000)), '');
  v_anon    text := nullif(left(regexp_replace(coalesce(p_anon, ''), '[^a-zA-Z0-9-]', '', 'g'), 40), '');
begin
  if p_doc is null or p_doc !~ '^[a-z_]{2,30}$' then
    raise exception 'bad document';
  end if;
  if p_reason is null and p_rating is null and v_comment is null then
    return null;   -- nothing said
  end if;
  -- A lid on volume: one per visitor per document per hour, and no flood overall.
  if exists (select 1 from public.exit_feedback
             where doc_type = p_doc and created_at > now() - interval '1 hour'
               and ((v_anon is not null and anon_id = v_anon) or (auth.uid() is not null and user_id = auth.uid()))) then
    return null;
  end if;
  if (select count(*) from public.exit_feedback where created_at > now() - interval '10 minutes') >= 30 then
    return null;
  end if;

  insert into public.exit_feedback (doc_type, step, total_steps, reason, rating, comment, trigger, user_id, anon_id)
  values (
    p_doc,
    case when p_step between 0 and 500 then p_step end,
    case when p_total between 0 and 500 then p_total end,
    case when p_reason in ('just_looking', 'too_long', 'unsure', 'wrong_doc', 'price', 'want_lawyer', 'not_working', 'other') then p_reason end,
    case when p_rating between 1 and 5 then p_rating end,
    v_comment,
    case when p_trigger in ('exit_intent', 'link') then p_trigger end,
    auth.uid(),
    v_anon
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.leave_exit_feedback(text, integer, integer, text, integer, text, text, text) from public;
grant execute on function public.leave_exit_feedback(text, integer, integer, text, integer, text, text, text) to anon, authenticated;

-- 2. Slack hears it, in the document's own channel -----------------------------------
create or replace function public.announce_exit_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text;
  v_doc     text;
  v_who     text;
  v_message text;
begin
  if new.user_id is not null and (
       public.is_quiet_user(new.user_id)
       or exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'admin')) then
    return new;
  end if;

  v_url := public.draft_webhook(new.doc_type);
  if v_url is null or v_url = '' then
    return new;
  end if;

  select label into v_doc from public.doc_types where slug = new.doc_type;
  v_doc := coalesce(v_doc, public.doc_short_name(new.doc_type));
  v_who := case when new.user_id is null then 'A visitor (no account yet)'
                else coalesce(public.person_label(new.user_id), 'A signed-in user') end;

  v_message := '👋 Left the ' || v_doc
            || coalesce(' after ' || new.step || case when new.total_steps is not null then ' of ' || new.total_steps else '' end
                        || case when new.step = 1 then ' question' else ' questions' end, '')
            || E'\n' || 'Reason: ' || public.exit_reason_label(new.reason)
            || ' · Rating: ' || coalesce(repeat('★', new.rating) || repeat('☆', 5 - new.rating) || ' (' || new.rating || '/5)', 'not given')
            || coalesce(E'\n' || '"' || new.comment || '"', '')
            || E'\n' || v_who || ' · ' || public.in_singapore(new.created_at);

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',        'exit_feedback',
      'who',          v_who,
      'doc_type',     v_doc,
      'reason',       public.exit_reason_label(new.reason),
      'rating',       new.rating,
      'comment',      coalesce(new.comment, ''),
      'channel',      public.draft_channel(new.doc_type),
      'channel_name', public.draft_channel_name(new.doc_type),
      'message',      v_message
    ),
    timeout_milliseconds := 5000
  );
  return new;

exception when others then
  raise warning 'announce_exit_feedback: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.announce_exit_feedback() from public, anon, authenticated;

drop trigger if exists on_exit_feedback on public.exit_feedback;
create trigger on_exit_feedback
  after insert on public.exit_feedback
  for each row execute function public.announce_exit_feedback();

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    exit_feedback ready (% rows). Visitors can send it; Slack hears it in each document''s channel.',
    (select count(*) from public.exit_feedback);
end $$;
