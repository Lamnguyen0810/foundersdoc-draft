-- ===========================================================================
-- FDAI — Feedback on drafts, and the lessons the drafter learns from it
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- ── THE LOOP ────────────────────────────────────────────────────────────────
-- A lawyer reads a draft and sees something wrong: "the definitions are not
-- in bold", "Compelled Disclosure does not sound right". They say so in one
-- of two places:
--
--   · the Feedback button beside the document (admins only — the firm's own
--     lawyers, not customers), with the passage they had selected;
--   · Slack: a message in the drafts channel beginning "feedback:", which
--     Zapier forwards to /api/feedback/slack. The secret it must carry is
--     made here — see SLACK, below.
--
-- The firm sees every piece of feedback on the admin dashboard. Each one can
-- be turned into a LESSON — a rule, in the firm's words — or dismissed. Live
-- lessons go into every later draft of that document type (or every draft,
-- when firm-wide), after the playbook and with the same authority: they are
-- the playbook's corrections, written one mistake at a time.
--
-- Nothing is learned automatically. A model that rewrote its own rules from
-- a comment would learn the comment's mood as readily as its point; the
-- firm decides what the rule is, and the dashboard makes that a minute's
-- work rather than a redeploy.
--
-- Slack hears about new feedback through the draft_activity webhook (041),
-- so the firm knows without opening the dashboard.
-- ===========================================================================

-- ─────────────────────────────────────────────────────────────── feedback
create table if not exists public.draft_feedback (
  id             uuid primary key default gen_random_uuid(),
  draft_id       uuid references public.drafts (id) on delete set null,
  doc_type_slug  text,
  user_id        uuid references auth.users (id) on delete set null,
  user_email     text,
  -- What was selected on the page when Feedback was pressed, if anything.
  excerpt        text,
  message        text not null check (length(message) between 1 and 4000),
  -- 'app' (the Feedback button) or 'slack' (a channel message, via Zapier).
  source         text not null default 'app' check (source in ('app', 'slack')),
  -- A link back to the Slack message, when that is where it came from.
  link           text,
  status         text not null default 'new' check (status in ('new', 'applied', 'dismissed')),
  lesson_id      uuid,
  handled_by     text,
  handled_at     timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.draft_feedback add column if not exists source text not null default 'app';
alter table public.draft_feedback add column if not exists link text;

create index if not exists draft_feedback_status_created
  on public.draft_feedback (status, created_at desc);

alter table public.draft_feedback enable row level security;

drop policy if exists "draft_feedback: admin" on public.draft_feedback;
create policy "draft_feedback: admin" on public.draft_feedback
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

/* The firm's own lawyers leave feedback — admins, not customers. A customer
   who thinks a draft is wrong has the conversation and the firm; feedback
   here changes the rules for everybody, so it is the firm's to give. Written
   through a function so the caller cannot set status or handled_by. */
create or replace function public.leave_feedback(
  p_draft uuid,
  p_message text,
  p_excerpt text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_slug  text;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'feedback is left by the firm''s admins' using errcode = '42501';
  end if;
  if p_message is null or btrim(p_message) = '' then
    raise exception 'say what should change';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  select t.slug into v_slug
  from public.drafts d
  left join public.doc_types t on t.id = d.doc_type_id
  where d.id = p_draft;

  insert into public.draft_feedback (draft_id, doc_type_slug, user_id, user_email, excerpt, message)
  values (
    case when v_slug is null then null else p_draft end,
    v_slug,
    auth.uid(),
    v_email,
    nullif(left(btrim(coalesce(p_excerpt, '')), 2000), ''),
    left(btrim(p_message), 4000)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.leave_feedback(uuid, text, text) from public, anon;
grant execute on function public.leave_feedback(uuid, text, text) to authenticated;

-- ────────────────────────────────────────────────────────────────── SLACK
/*
 * Feedback typed in the drafts channel. Zapier (Slack "New Message Posted
 * to Channel" → Webhooks POST) sends every human message to
 * /api/feedback/slack with a secret header; the route keeps the ones that
 * begin "feedback:" and calls this. The secret is made here, once, and read
 * back with:
 *
 *     select public.slack_feedback_secret();
 *
 * It is not a Zapier hook URL, so it does not go in public.webhooks.
 */
create table if not exists public.inbound_secrets (
  name       text primary key,
  secret     text not null,
  created_at timestamptz not null default now()
);
alter table public.inbound_secrets enable row level security;   -- no policies: service role only

insert into public.inbound_secrets (name, secret)
values ('slack_feedback', md5(random()::text || clock_timestamp()::text) || md5(clock_timestamp()::text || random()::text))
on conflict (name) do nothing;

create or replace function public.slack_feedback_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select secret from public.inbound_secrets where name = 'slack_feedback';
$$;
revoke all on function public.slack_feedback_secret() from public, anon, authenticated;

/* The row, from a Slack message. Service role only (the route runs with
   the secret key); the shared secret is checked again here. The document
   type is inferred from the words — "NDA", or a type's label — and left
   blank otherwise, which the dashboard shows as "Every document". */
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
  v_id   uuid;
  v_text text := btrim(coalesce(p_text, ''));
  v_slug text;
begin
  if p_secret is null or p_secret <> (select secret from public.inbound_secrets where name = 'slack_feedback') then
    raise exception 'bad secret' using errcode = '42501';
  end if;
  -- "feedback:" / "fb:" at the start, any case, is the signal; drop it.
  v_text := regexp_replace(v_text, '^\s*(feedback|fb)\s*:\s*', '', 'i');
  if v_text = '' then
    raise exception 'empty';
  end if;

  select t.slug into v_slug
  from public.doc_types t
  where t.is_active
    and (v_text ~* ('\m' || t.slug || '\M') or v_text ~* ('\m' || regexp_replace(t.label, '[^A-Za-z0-9 ]', '', 'g') || '\M'))
  order by length(t.label) desc
  limit 1;

  insert into public.draft_feedback (doc_type_slug, user_email, message, source, link)
  values (v_slug, left(coalesce(nullif(btrim(p_who), ''), 'Slack'), 200), left(v_text, 4000), 'slack', nullif(btrim(coalesce(p_link, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.feedback_from_slack(text, text, text, text) from public, anon, authenticated;
grant execute on function public.feedback_from_slack(text, text, text, text) to service_role;

-- ──────────────────────────────────────────────────────────────── lessons
create table if not exists public.playbook_lessons (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null,                       -- doc type slug, or '*'
  rule           text not null check (length(rule) between 1 and 2000),
  live           boolean not null default true,
  feedback_id    uuid references public.draft_feedback (id) on delete set null,
  created_by     text,
  created_at     timestamptz not null default now(),
  check (scope = '*' or scope ~ '^[a-z0-9_-]+$')
);

create index if not exists playbook_lessons_scope_live
  on public.playbook_lessons (scope, live, created_at);

alter table public.playbook_lessons enable row level security;

drop policy if exists "playbook_lessons: admin" on public.playbook_lessons;
create policy "playbook_lessons: admin" on public.playbook_lessons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

/* Turn feedback into a rule (or write a rule from nothing). Admin only. */
create or replace function public.add_lesson(
  p_scope text,
  p_rule text,
  p_feedback uuid default null
)
returns public.playbook_lessons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.playbook_lessons;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_rule is null or btrim(p_rule) = '' then
    raise exception 'the rule is empty';
  end if;
  select email into v_email from auth.users where id = auth.uid();

  insert into public.playbook_lessons (scope, rule, feedback_id, created_by)
  values (coalesce(nullif(btrim(p_scope), ''), '*'), left(btrim(p_rule), 2000), p_feedback, v_email)
  returning * into v_row;

  if p_feedback is not null then
    update public.draft_feedback
       set status = 'applied', lesson_id = v_row.id, handled_by = v_email, handled_at = now()
     where id = p_feedback;
  end if;

  return v_row;
end;
$$;

revoke all on function public.add_lesson(text, text, uuid) from public, anon;
grant execute on function public.add_lesson(text, text, uuid) to authenticated;

/* Dismiss feedback without a rule. Admin only. */
create or replace function public.dismiss_feedback(p_feedback uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  update public.draft_feedback
     set status = 'dismissed', handled_by = v_email, handled_at = now()
   where id = p_feedback;
end;
$$;

revoke all on function public.dismiss_feedback(uuid) from public, anon;
grant execute on function public.dismiss_feedback(uuid) to authenticated;

-- ──────────────────────────────────────────────────── what drafting reads
/* The live lessons for one document type: firm-wide first, then its own,
   oldest first so a later correction of a correction reads last. */
create or replace function public.lessons_for(p_slug text)
returns table (id uuid, scope text, rule text)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.scope, l.rule
  from public.playbook_lessons l
  where l.live
    and l.scope in ('*', p_slug)
  order by case when l.scope = '*' then 0 else 1 end, l.created_at;
$$;

revoke all on function public.lessons_for(text) from public, anon;
grant execute on function public.lessons_for(text) to authenticated;

-- ──────────────────────────────────────────────────────── Slack hears it
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

  select url into v_url from public.webhooks where name = 'draft_activity' and enabled;
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

drop trigger if exists on_draft_feedback on public.draft_feedback;
create trigger on_draft_feedback
  after insert on public.draft_feedback
  for each row execute function public.announce_feedback();

revoke all on function public.announce_feedback() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────── the check
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'draft_feedback') then
    raise notice 'OK    feedback can be left on a draft';
  end if;
  if exists (select 1 from pg_proc where proname = 'lessons_for') then
    raise notice 'OK    live lessons reach the drafter';
  end if;
  raise notice 'NEXT  Admin dashboard > AI files > Feedback: turn feedback into rules';
  raise notice 'NEXT  for feedback from Slack, the secret for the Zapier header is:  %', (select secret from public.inbound_secrets where name = 'slack_feedback');
end $$;
