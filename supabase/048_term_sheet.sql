-- ============================================================================
-- 048 · The term sheet: a second way of drafting, and a review queue
-- ============================================================================
--
-- The NDA is drafted by a model from the firm's playbook and samples. The
-- term sheet is not: it is ASSEMBLED — answers to a branching questionnaire
-- are put into the firm's approved master (FD Master Term Sheet v4.0) by
-- rule, and the model drafts only a handful of short fields, which are
-- checked before they are used. Nothing in this file changes how the NDA
-- is drafted.
--
-- What this file does:
--   1. doc_types.engine — 'chat' (the NDA) or 'assembly' (the term sheet),
--      and the `term` row itself, which is what makes "Term Sheet" live in
--      the catalogue.
--   2. drafts.status gains 'held' and 'stopped', with the flags and the
--      review columns a lawyer's sign-off needs.
--   3. review_queue() and release_draft() — the dashboard's review panel.
--   4. announce_review() — Slack hears when a term sheet is held or stopped.
--
-- Run once, in the Supabase SQL editor. Safe to run again.
-- ============================================================================

-- ─── 1. the engine, and the term sheet row ──────────────────────────────────

alter table public.doc_types
  add column if not exists engine text not null default 'chat';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.doc_types'::regclass and conname = 'doc_types_engine_check'
  ) then
    alter table public.doc_types
      add constraint doc_types_engine_check check (engine in ('chat', 'assembly'));
  end if;
end $$;

comment on column public.doc_types.engine is
  'chat: a model drafts the whole document from the playbook and samples. assembly: answers are put into the firm''s master by rule; the model drafts named fields only.';

insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'term',
  'Term Sheet',
  'Investment, loan, acquisition or project. Assembled from FD Master Term Sheet v4.0 by rule; the AI drafts only the heading, the nature of the deal, the structure and the key-term lines, per the Term Sheet Drafting Playbook.',
  '[]'::jsonb,
  'Assembled from the FD master term sheet. The AI drafts only the fields the Term Sheet Drafting Playbook allows (upload it under Playbook → Term Sheet).',
  '[]'::jsonb,
  'assembly',
  true
)
on conflict (slug) do update
  set label       = excluded.label,
      description = excluded.description,
      engine      = 'assembly',
      is_active   = true,
      updated_at  = now();

-- ─── 2. held and stopped drafts ─────────────────────────────────────────────

-- The status check was written inline in 001, so its name is Postgres's
-- choice. Find it by what it says rather than by name.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.drafts'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.drafts drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.drafts
  add constraint drafts_status_check check (status in ('draft', 'final', 'held', 'stopped'));

alter table public.drafts add column if not exists flags        jsonb not null default '[]'::jsonb;
alter table public.drafts add column if not exists review_note  text;
alter table public.drafts add column if not exists reviewed_at  timestamptz;
alter table public.drafts add column if not exists reviewed_by  uuid references auth.users (id) on delete set null;

comment on column public.drafts.status is
  'draft: with the user. final: marked final by the user. held: drafted, but a lawyer must release it before it can be downloaded (playbook 🟡). stopped: not drafted; a lawyer must help (playbook 🔴).';
comment on column public.drafts.flags is
  'The playbook''s flags on this draft: [{level, scenario, reason, field}]. Yellow ones are what a lawyer reviews.';

create index if not exists drafts_review_idx on public.drafts (status, created_at desc) where status in ('held', 'stopped');

-- ─── 3. the review queue ────────────────────────────────────────────────────

-- What the dashboard shows a lawyer. 011 kept a rule that admin functions
-- never return a draft's content; a held term sheet is the exception the
-- firm asked for, because a lawyer cannot release what they cannot read.
-- Only held and stopped drafts, and the last thirty released, come back.
create or replace function public.review_queue()
returns table (
  id           uuid,
  title        text,
  status       text,
  who          text,
  doc_label    text,
  flags        jsonb,
  answers      jsonb,
  output_html  text,
  review_note  text,
  created_at   timestamptz,
  reviewed_at  timestamptz
)
language sql
security definer
set search_path = public
as $$
  select d.id, d.title, d.status, public.person_label(d.user_id), t.label, d.flags, d.answers,
         case when d.status = 'held' then d.output_html else null end,
         d.review_note, d.created_at, d.reviewed_at
  from public.drafts d
  left join public.doc_types t on t.id = d.doc_type_id
  where public.is_admin()
    and d.deleted_at is null
    and ((d.status = 'held') or (d.status = 'stopped' and d.reviewed_at is null) or d.reviewed_at is not null)
  order by (d.status = 'held' or (d.status = 'stopped' and d.reviewed_at is null)) desc, d.created_at desc
  limit 60;
$$;

revoke all on function public.review_queue() from public, anon;
grant execute on function public.review_queue() to authenticated;

-- A lawyer releases a held draft: it becomes an ordinary draft the user can
-- download. The note, if any, is shown to the user beside the document.
-- Released and handled drafts stay in the queue's "released" list, but a
-- stopped one that has been handled leaves the waiting list only.
create or replace function public.release_draft(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  -- A held draft becomes an ordinary draft. A stopped one has no letter to
  -- release: it is marked as handled and stays stopped.
  update public.drafts
     set status      = case when status = 'held' then 'draft' else status end,
         review_note = nullif(trim(coalesce(p_note, '')), ''),
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_id and status in ('held', 'stopped');
end;
$$;

revoke all on function public.release_draft(uuid, text) from public, anon;
grant execute on function public.release_draft(uuid, text) to authenticated;

-- ─── 4. Slack hears about it ────────────────────────────────────────────────

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
      || E'\n' || 'The user was told a lawyer will be in touch. Ref #' || v_ref;
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

drop trigger if exists on_draft_review on public.drafts;
create trigger on_draft_review
  after insert or update of status on public.drafts
  for each row execute function public.announce_review();

-- ─── check ──────────────────────────────────────────────────────────────────
-- select slug, engine, is_active from public.doc_types;
-- select id, status, flags from public.drafts where status in ('held','stopped');
