-- ============================================================================
-- 099 — One Zap for every document: each message says which channel
--
-- WHY. Each document needed its own Zap and its own hook address
-- (draft_activity_<slug>). A document without one fell back to the general
-- hook, which is the NDA Zap — so the Loan Agreement, Services Agreement,
-- SSA, Co-Founder Agreement and every new document were posted in
-- #fdai-draft-nda instead of their own channel.
--
-- NOW. Every Slack message FD AI sends carries two more fields:
--
--     channel       the Slack channel ID to post in, e.g. C0C8RNG1Y7K
--     channel_name  the same as a name, e.g. #fdai-draft-loanagmt
--
-- from the table public.slack_channels (one row per document). ONE Zap —
-- Catch Hook → Slack "Send Channel Message" with Channel = the "channel"
-- field — posts every document in its own channel. Once its address is
-- saved as 'draft_router', every document uses it:
--
--     select public.set_webhook('draft_router', '<the new Zap''s hook URL>');
--
-- A new document is then one line, no new Zap:
--
--     insert into public.slack_channels (slug, channel_id, channel_name)
--     values ('sha', 'C0XXXXXXX', '#fdai-draft-sha')
--     on conflict (slug) do update set channel_id = excluded.channel_id, channel_name = excluded.channel_name;
--
-- A document with no row goes to the 'default' row (#fdai-draft).
-- Until 'draft_router' is set, nothing changes: the old Zaps keep working.
--
-- The announcers are not copied here: the live ones are read from the
-- database and the two fields added just before 'message', so nothing else
-- in them changes. Safe to run twice. Run after 098.
-- ============================================================================

-- 1. Where each document is posted ------------------------------------------------
create table if not exists public.slack_channels (
  slug         text primary key,
  channel_id   text not null,
  channel_name text not null,
  updated_at   timestamptz not null default now()
);
alter table public.slack_channels enable row level security;
revoke all on table public.slack_channels from anon, authenticated;

insert into public.slack_channels (slug, channel_id, channel_name) values
  ('default',    'C0BADA70P0R', '#fdai-draft'),
  ('nda',        'C0BCBFP2VAB', '#fdai-draft-nda'),
  ('term',       'C0616D00UPR', '#fdai-draft-termsheet'),
  ('employment', 'C0BJJMGT7QD', '#fdai-draft-employmentcontract'),
  ('contractor', 'C05T9KST265', '#fdai-draft-contractoragreement'),
  ('cofounder',  'C05T49R8W0H', '#fdai-draft-cfa'),
  ('ia',         'C0C7XLLAE2J', '#fdai-draft-investmentagreement'),
  ('loan',       'C0C8RNG1Y7K', '#fdai-draft-loanagmt'),
  ('cln',        'C06DL3JKESE', '#fdai-draft-cln')
on conflict (slug) do nothing;

create or replace function public.draft_channel(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select channel_id from public.slack_channels where slug = p_slug),
                  (select channel_id from public.slack_channels where slug = 'default'));
$$;
revoke all on function public.draft_channel(text) from public, anon, authenticated;

create or replace function public.draft_channel_name(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select channel_name from public.slack_channels where slug = p_slug),
                  (select channel_name from public.slack_channels where slug = 'default'));
$$;
revoke all on function public.draft_channel_name(text) from public, anon, authenticated;

-- 2. The one Zap, when its address is saved, takes every document ------------------
create or replace function public.draft_webhook(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select url from public.webhooks
      where name = 'draft_router' and enabled and btrim(url) <> ''),
    (select url from public.webhooks
      where name = 'draft_activity_' || p_slug and enabled and btrim(url) <> ''),
    (select url from public.webhooks
      where name = 'draft_activity' and enabled)
  );
$$;
revoke all on function public.draft_webhook(text) from public, anon, authenticated;

-- 3. Every announcer adds channel and channel_name to what it sends ----------------
do $$
declare
  fn      text;
  def     text;
  arg     text;
  changed text;
  done    text[] := '{}';
  skipped text[] := '{}';
begin
  foreach fn in array array['announce_draft_activity', 'announce_draft_download_all', 'announce_review',
                            'announce_feedback', 'announce_lesson', 'undo_last_lesson'] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn
    limit 1;

    if def is null then
      skipped := skipped || (fn || ' (not found)');
      continue;
    end if;
    if def ~ '''channel''' then
      done := done || (fn || ' (already)');
      continue;
    end if;

    -- The slug the announcer already uses to pick its hook.
    arg := substring(def from 'draft_webhook\((.*?)\);\s*\n');
    if arg is null or (length(def) - length(replace(def, '''message''', ''))) / length('''message''') <> 1 then
      skipped := skipped || (fn || ' (shape not recognised)');
      continue;
    end if;

    changed := replace(def, '''message''',
      '''channel'', public.draft_channel(' || arg || '), ''channel_name'', public.draft_channel_name(' || arg || '), ''message''');
    execute changed;
    done := done || fn;
  end loop;

  raise notice 'OK    Messages now say their channel: %', array_to_string(done, ', ');
  if array_length(skipped, 1) > 0 then
    raise notice 'CHECK Not changed: %', array_to_string(skipped, ', ');
  end if;
end $$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    % documents have a channel (others go to %).',
    (select count(*) - 1 from public.slack_channels), public.draft_channel_name('default');
  raise notice '%', case when exists (select 1 from public.webhooks where name = 'draft_router' and enabled)
    then 'OK    The one Zap (draft_router) is set: every document goes through it.'
    else 'NEXT  Make the one Zap, then: select public.set_webhook(''draft_router'', ''<hook URL>'');' end;
end $$;
