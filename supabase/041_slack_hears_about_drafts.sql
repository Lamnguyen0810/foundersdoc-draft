-- ===========================================================================
-- FDAI — Slack hears when someone starts answering, and when they download
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 037 and 040 first (pg_net, the webhooks table, in_singapore()).
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
-- Two lines in Slack per draft:
--
--     Tan Wei Ling (wei.ling@example.com) started answering
--     Non-Disclosure Agreement · 23 Sep 2026, 4:12pm
--
--     Tan Wei Ling (wei.ling@example.com) finished and downloaded a draft
--     Non-Disclosure Agreement · 1,778 words · 23 Sep 2026, 4:20pm
--     Skipped: Who’s involved, Existing document
--
-- The first goes out when the first question is answered; the second the
-- FIRST time that draft's Word file is downloaded — one message per draft,
-- however many versions are downloaded afterwards. The last line names the
-- STEPS that were skipped — "Who’s involved", not the three questions
-- inside it — or says "Skipped: none" when every question was answered.
--
-- ── WHERE IT HOOKS IN ──────────────────────────────────────────────────────
-- The app already records `draft_started` and `draft_exported` in
-- public.events (lib/events.ts), for the admin dashboard. A trigger on that
-- table is the natural place: nothing in the browser changes, and a draft
-- made from any screen — new, reopened, revised — is reported the same way.
--
-- The skipped questions are read from the draft itself, not from events. The
-- drafting screen stores a skipped answer as the marker "__fd_skipped__"
-- (lib/prompt.ts), so the draft row knows exactly which questions were passed
-- over, however they were passed over — one at a time or with "Skip the rest
-- and draft". An existing document is a step of its own with no answer field;
-- it counts as skipped when the draft has no source text.
--
-- ── THE SAME RULE AS 037 ───────────────────────────────────────────────────
-- Nothing here may stop an event being recorded, let alone a draft being
-- made. Every path that can fail is caught and logged as a warning.
-- ===========================================================================

-- ───────────────────────────────────────── 0. one download message per draft
/*
 * Which drafts have already been announced as downloaded. A person who
 * downloads version 1, revises, and downloads version 2 is one line in
 * Slack, not two. The row is written in the same transaction as the event,
 * so two downloads a second apart cannot both get through.
 */
create table if not exists public.draft_announcements (
  draft_id     uuid not null references public.drafts (id) on delete cascade,
  event        text not null,
  announced_at timestamptz not null default now(),
  primary key (draft_id, event)
);

alter table public.draft_announcements enable row level security;
revoke all on public.draft_announcements from anon, authenticated;

-- ──────────────────────────────────────────────── 1. who, in the same words
/*
 * "Tan Wei Ling (wei.ling@example.com)": the name the person gave, wherever
 * they gave it — the profile, Google, the sign-up screen, the waitlist —
 * and failing all of those the part of the address before the @.
 */
create or replace function public.person_label(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name  text;
  v_meta  jsonb;
begin
  select lower(btrim(coalesce(u.email, ''))), u.raw_user_meta_data
    into v_email, v_meta
  from auth.users u
  where u.id = p_user;

  if v_email is null then
    return null;
  end if;

  select coalesce(
           nullif(btrim(coalesce(p.full_name, '')), ''),
           nullif(btrim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name', '')), ''),
           nullif(btrim(w.name), ''),
           split_part(v_email, '@', 1)
         )
    into v_name
  from (select 1) one
  left join public.profiles p on p.id = p_user
  left join public.waitlist w on lower(w.email) = v_email;

  return coalesce(v_name, split_part(v_email, '@', 1)) || ' (' || v_email || ')';
end;
$$;

revoke all on function public.person_label(uuid) from public, anon, authenticated;

-- ────────────────────────────────────────── 2. which steps a draft skipped
/*
 * The step titles, in questionnaire order, separated by commas — or an
 * empty string when nothing was skipped. A step is named once however many
 * of its questions were passed over: the team wants to know WHERE the
 * person gave up, not to read the questionnaire back.
 *
 * Titles come from doc_types.groups, the same list the admin console
 * publishes and the drafting screen shows. A document type that has never
 * had its steps published falls back to the group's own name ("Parties"),
 * which is still a sensible word to read in Slack.
 */
create or replace function public.skipped_steps(p_draft uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  with d as (
    select d.answers, d.source_text, t.fields, t.groups
    from public.drafts d
    left join public.doc_types t on t.id = d.doc_type_id
    where d.id = p_draft
  ),
  f as (
    select f.ord,
           f.val ->> 'key'   as key,
           f.val ->> 'group' as grp,
           f.val ->> 'label' as label
    from d, jsonb_array_elements(coalesce(d.fields, '[]'::jsonb)) with ordinality f(val, ord)
  ),
  g as (
    select g.val ->> 'name' as name, g.val ->> 'title' as title
    from d, jsonb_array_elements(coalesce(d.groups, '[]'::jsonb)) g(val)
  ),
  skipped as (
    select coalesce(nullif(btrim(g.title), ''), nullif(btrim(f.grp), ''), f.label) as title,
           min(f.ord) as ord
    from f
    cross join d
    left join g on g.name = f.grp
    where d.answers ->> f.key = '__fd_skipped__'
    group by 1
    union all
    select 'Existing document', 1000000
    from d
    where nullif(btrim(coalesce(d.source_text, '')), '') is null
  )
  select coalesce(string_agg(title, ', ' order by ord), '') from skipped;
$$;

revoke all on function public.skipped_steps(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────── 3. the two messages
/*
 * Wording in one place, as 040 does for accounts, so the test message and
 * the live one cannot drift apart.
 */
create or replace function public.draft_message(
  p_event   text,
  p_who     text,
  p_doc     text,
  p_when    timestamptz,
  p_words   integer,
  p_skipped text
)
returns text
language sql
immutable
as $$
  select case p_event
    when 'draft_started' then
      p_who || ' started answering' || E'\n'
      || p_doc || ' · ' || public.in_singapore(p_when)
    else
      p_who || ' finished and downloaded a draft' || E'\n'
      || p_doc
      || case when coalesce(p_words, 0) > 0
              then ' · ' || to_char(p_words, 'FM999,999') || ' words' else '' end
      || ' · ' || public.in_singapore(p_when) || E'\n'
      || case when coalesce(p_skipped, '') = ''
              then 'Skipped: none — every question answered'
              else 'Skipped: ' || p_skipped end
  end;
$$;

revoke all on function public.draft_message(text, text, text, timestamptz, integer, text) from public, anon, authenticated;

-- ──────────────────────────────────────────────────── 4. the announcement
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
  -- Only the two moments the firm asked to hear about, and only for people
  -- who are signed in — nobody else can draft.
  if new.name not in ('draft_started', 'draft_exported') or new.user_id is null then
    return new;
  end if;

  select url into v_url
  from public.webhooks
  where name = 'draft_activity' and enabled;

  -- Not configured, or switched off: quiet.
  if v_url is null or v_url = '' then
    return new;
  end if;

  v_who := public.person_label(new.user_id);
  if v_who is null then
    return new;
  end if;

  select label into v_doc from public.doc_types where slug = v_slug;
  v_doc := coalesce(v_doc, initcap(replace(coalesce(v_slug, 'document'), '_', ' ')));

  if new.name = 'draft_exported' then
    /* The download button does not say which draft it downloaded — the event
       carries no identifiers, on purpose — but a person downloads the draft
       they are looking at, and that is the one they made or opened most
       recently. */
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

    -- No draft to speak of: nothing to announce.
    if v_draft is null then
      return new;
    end if;

    -- Already announced for this draft: one download message per draft.
    insert into public.draft_announcements (draft_id, event)
    values (v_draft, 'draft_exported')
    on conflict do nothing;
    if not found then
      return new;
    end if;

    v_skipped := public.skipped_steps(v_draft);
  end if;

  v_message := public.draft_message(new.name, v_who, v_doc, new.created_at, v_words, v_skipped);

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
      -- Finished. This is the field that goes into the Slack step.
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

drop trigger if exists on_event_draft_activity on public.events;
create trigger on_event_draft_activity
  after insert on public.events
  for each row
  when (new.name in ('draft_started', 'draft_exported'))
  execute function public.announce_draft_activity();

revoke all on function public.announce_draft_activity() from public, anon, authenticated;

-- ─────────────────────────────────────────────── 5. a way to prove it works
/*
 *   select public.test_draft_webhook();
 *
 * Sends both messages, made up, to the draft_activity address, so Zapier's
 * "Find new records" has both shapes to learn from.
 */
create or replace function public.test_draft_webhook()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text;
  v_when timestamptz := now();
  v_who  text := 'Test Person (test.person@example.com)';
begin
  select url into v_url from public.webhooks where name = 'draft_activity' and enabled;
  if v_url is null or v_url = '' then
    return 'No address set. Run: select public.set_webhook(''draft_activity'', ''https://hooks.zapier.com/...'');';
  end if;

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',   'draft_started',
      'who',     v_who,
      'doc_type','Non-Disclosure Agreement',
      'words',   0,
      'skipped', '',
      'at',      to_char(v_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'at_text', public.in_singapore(v_when),
      'message', public.draft_message('draft_started', v_who, 'Non-Disclosure Agreement', v_when, 0, '')
                 || E'\n' || '(This is a test.)'
    ),
    timeout_milliseconds := 5000
  );

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',   'draft_exported',
      'who',     v_who,
      'doc_type','Non-Disclosure Agreement',
      'words',   1234,
      'skipped', 'Who’s involved, Existing document',
      'at',      to_char(v_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'at_text', public.in_singapore(v_when),
      'message', public.draft_message('draft_exported', v_who, 'Non-Disclosure Agreement', v_when, 1234,
                                      'Who’s involved, Existing document')
                 || E'\n' || '(This is a test.)'
    ),
    timeout_milliseconds := 5000
  );

  return 'Sent two test messages. They should appear in Zapier within a few seconds.';
end;
$$;

revoke all on function public.test_draft_webhook() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────── the check
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'on_event_draft_activity') then
    raise notice 'OK    draft activity will be announced';
  else
    raise notice 'FAIL  the trigger is not there';
  end if;

  if exists (select 1 from public.webhooks where name = 'draft_activity' and enabled) then
    raise notice 'OK    an address is set — run  select public.test_draft_webhook();  to prove it';
  else
    raise notice 'NEXT  set the address (the account_created URL works if that Zap only posts to Slack):';
    raise notice '      select public.set_webhook(''draft_activity'', ''PASTE THE ZAPIER HOOK URL'');';
    raise notice '      select public.test_draft_webhook();';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- AFTERWARDS
--
--   Set the address        select public.set_webhook('draft_activity', 'https://hooks.zapier.com/hooks/catch/...');
--   Prove it               select public.test_draft_webhook();
--   Turn it off for a day  update public.webhooks set enabled = false where name = 'draft_activity';
--   Turn it back on        update public.webhooks set enabled = true  where name = 'draft_activity';
--
--   One download message per draft. To let a draft announce again (for a
--   test, say):
--     delete from public.draft_announcements where draft_id = '<draft id>';
-- ═══════════════════════════════════════════════════════════════════════════
