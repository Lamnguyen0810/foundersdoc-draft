-- ===========================================================================
-- FDAI — the subscriber list, announced to Slack the way it used to be
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 037 (webhooks table, pg_net) first.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
-- The mailing list: people who asked to hear from the firm. It is NOT the
-- list of FD AI accounts — those are announced separately (037) and are a
-- different thing: somebody who made an account has not asked for a
-- newsletter, and somebody on the newsletter may never make an account.
--
-- Addresses arrive two ways: the subscribe forms on the website (the footer
-- on every page, the box at the end of each article, the corner slide-in),
-- by way of /api/subscribe -> public.subscribe(); and the FD AI sign-up
-- form, whose first step writes a waitlist row — somebody who gives the
-- firm their address to try FD AI is on the list too. Each new one gets a
-- Slack message in the shape the firm had before FD AI existed:
--
--   📧 New email added to mailing list
--
--   New email: someone@example.com
--   Total subscribers: 67
--   Source: Website footer
--   Added: 1 October 2026, 3:41 PM SGT
--
--   All mailing-list emails:
--   1. first@example.com
--   2. second@example.com
--   …
--
-- The addresses the old pop-up collected are brought in with
-- public.import_subscribers() — quietly, no Slack message per address.
--
-- ── WHY THE MESSAGE IS WRITTEN HERE ─────────────────────────────────────────
-- Same reason as 037: `message` arrives finished, so the Zap drops one field
-- into Slack and nothing has to be assembled in the right order by hand. The
-- separate fields are still sent for anyone who wants columns.
-- ===========================================================================

-- ──────────────────────────────────────────────────────────── 1. the list
create table if not exists public.subscribers (
  email           text primary key,            -- always lower-case, trimmed
  name            text,
  source          text not null,               -- as shown in Slack
  added_at        timestamptz not null default now(),
  unsubscribed_at timestamptz                  -- set when they opt out; row kept so they are not re-added
);

comment on table public.subscribers is
  'The mailing list: every address that asked to hear from the firm, once.';

/* An earlier draft of this file created the table without this column, and
   fed it from the waitlist and from accounts — which is the mix 073 exists
   to avoid. Bring such a database up to date: the column, no triggers, and
   none of the rows those triggers wrote. */
alter table public.subscribers add column if not exists unsubscribed_at timestamptz;
drop trigger if exists on_waitlist_subscribe on public.waitlist;
drop trigger if exists on_auth_user_subscribe on auth.users;
drop trigger if exists on_auth_user_subscribe_confirmed on auth.users;
drop function if exists public.subscribe_from_account();
drop function if exists public.source_in_words(text);
delete from public.subscribers
 where source in ('FD AI account sign-up', 'FD AI Google sign-in', 'FD AI invitation');

alter table public.subscribers enable row level security;
revoke all on public.subscribers from anon, authenticated;

-- ────────────────────────────────────────── 2. the time, the old way round
/*
 * "13 August 2026, 7:27 PM SGT" — the exact shape of the old message, which
 * is not the shape 037 uses ("13 Aug 2026, 7:27pm"). Both are Singapore time.
 */
create or replace function public.in_singapore_long(p_when timestamptz)
returns text
language sql
immutable
as $$
  select to_char(p_when at time zone 'Asia/Singapore', 'FMDD FMMonth YYYY, FMHH12:MI AM') || ' SGT';
$$;

-- ───────────────────────────────────────────── 3. adding one, and saying so
/*
 * Adds the address if it is not already on the list, and when it was new
 * posts the finished message to the 'subscriber_list' hook. Returns true
 * when the address was new. Never raises: a Slack problem must not stop a
 * subscription (the rule 037 states, kept here).
 *
 * p_announce false = add quietly. Used by the import below.
 */
create or replace function public.add_subscriber(
  p_email    text,
  p_name     text,
  p_source   text,
  p_when     timestamptz default now(),
  p_announce boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_source text := coalesce(nullif(btrim(p_source), ''), 'Website');
  v_when   timestamptz := coalesce(p_when, now());
  v_url    text;
  v_total  bigint;
  v_list   text;
  v_text   text;
  v_msg    text;
begin
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return false;
  end if;

  insert into public.subscribers (email, name, source, added_at)
  values (v_email, nullif(btrim(coalesce(p_name, '')), ''), v_source, v_when)
  on conflict (email) do nothing;

  if not found then
    return false;                                -- already on the list (or opted out)
  end if;

  if not p_announce then
    return true;
  end if;

  select url into v_url from public.webhooks where name = 'subscriber_list' and enabled;
  if v_url is null or v_url = '' then
    return true;                                 -- on the list; nobody to tell
  end if;

  select count(*) into v_total from public.subscribers where unsubscribed_at is null;

  /* Oldest first, numbered, one per line — the whole list, as before. Capped
     at 500 lines so the message can never outgrow what Slack accepts; past
     that the newest are shown and the rest summarised. */
  select string_agg(n || '. ' || email, E'\n' order by n)
    into v_list
  from (
    select email, row_number() over (order by added_at, email) as n
    from public.subscribers
    where unsubscribed_at is null
    order by added_at desc, email desc
    limit 500
  ) s;
  if v_total > 500 then
    v_list := v_list || E'\n… and ' || (v_total - 500) || ' earlier addresses.';
  end if;

  v_text := public.in_singapore_long(v_when);
  v_msg  := E'📧 New email added to mailing list\n\n'
         || 'New email: ' || v_email || E'\n'
         || 'Total subscribers: ' || v_total || E'\n'
         || 'Source: ' || v_source || E'\n'
         || 'Added: ' || v_text || E'\n\n'
         || E'All mailing-list emails:\n' || v_list;

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',             'subscriber_added',
      'email',             v_email,
      'name',              coalesce(nullif(btrim(coalesce(p_name, '')), ''), ''),
      'source',            v_source,
      'added_at',          to_char(v_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'added_at_text',     v_text,
      'subscribers_total', v_total,
      'all_emails',        v_list,
      -- Finished. This is the field that goes into the Slack step.
      'message',           v_msg
    ),
    timeout_milliseconds := 5000
  );

  return true;

exception when others then
  raise warning 'add_subscriber: %', sqlerrm;
  return false;
end;
$$;

revoke all on function public.add_subscriber(text, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.in_singapore_long(timestamptz) from public, anon, authenticated;

-- ─────────────────────────────────────────────── 4. the door: the website
/*
 * What /api/subscribe calls. Open to anyone — it has to be — and shaped so
 * that being open costs nothing: it accepts an address, nothing else goes
 * in, and the answer is the same whether the address was new or already
 * there. Otherwise this becomes a way to check, one address at a time, who
 * is on a law firm's mailing list.
 *
 * The source is one of a short list the website sends ('Website footer',
 * 'Article', 'Slide-in'); anything else is shown as 'Website'.
 */
create or replace function public.subscribe(p_email text, p_source text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := case
    when p_source in ('Website footer', 'Article', 'Slide-in', 'Sign-up form') then p_source
    else 'Website' end;
begin
  perform public.add_subscriber(p_email, null, v_source, now(), true);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.subscribe(text, text) from public;
grant execute on function public.subscribe(text, text) to anon, authenticated;

-- ───────────────────────────────── 4b. the other door: the sign-up form
/*
 * The first step of signing up for FD AI writes a waitlist row (034). That
 * address joins the list the moment it is written, announced like any other,
 * with the source "FD AI sign-up form". The account itself is not what puts
 * them here — giving the firm their address is — so accounts made some other
 * way (Google, an invitation) are not on this list unless they subscribe.
 */
create or replace function public.subscribe_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.add_subscriber(new.email, new.name, 'FD AI sign-up form', new.created_at, true);
  return new;
end;
$$;

drop trigger if exists on_waitlist_subscribe on public.waitlist;
create trigger on_waitlist_subscribe
  after insert on public.waitlist
  for each row execute function public.subscribe_from_waitlist();

revoke all on function public.subscribe_from_waitlist() from public, anon, authenticated;

/* Everyone already on the waitlist, added quietly with their original date.
   Re-running adds nobody twice. */
do $$
declare r record; n int := 0;
begin
  for r in select email, name, created_at from public.waitlist order by created_at loop
    if public.add_subscriber(r.email, r.name, 'FD AI sign-up form', r.created_at, false) then
      n := n + 1;
    end if;
  end loop;
  raise notice 'OK    % sign-up address(es) added quietly from the waitlist', n;
end $$;

-- ────────────────────────────────── 5. the old pop-up's list, brought in
/*
 *   select public.import_subscribers(
 *     'first@example.com
 *      second@example.com',
 *     'FD Insider List pop-up',
 *     '2026-08-13 19:27+08');
 *
 * One address per line (commas and spaces are fine too). Each is added
 * quietly with the date given — no Slack message per address. Addresses
 * already on the list are skipped. Returns how many were added.
 */
create or replace function public.import_subscribers(
  p_emails text,
  p_source text default 'FD Insider List pop-up',
  p_when   timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_each text;
  n int := 0;
begin
  foreach v_each in array regexp_split_to_array(coalesce(p_emails, ''), '[[:space:],;]+') loop
    if public.add_subscriber(v_each, null, p_source, p_when, false) then
      n := n + 1;
    end if;
  end loop;
  return n || ' added quietly; the list now has '
      || (select count(*) from public.subscribers where unsubscribed_at is null) || '.';
end;
$$;

revoke all on function public.import_subscribers(text, text, timestamptz) from public, anon, authenticated;

-- ───────────────────────────────────────────── 6. a way to prove it works
/*
 *   select public.test_subscriber_webhook();
 *
 * Posts one made-up subscriber to the hook so the Zap's "Test step" has a
 * real message to learn from. Nothing is added to the list.
 */
create or replace function public.test_subscriber_webhook()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text;
  v_when timestamptz := now();
  v_total bigint := (select count(*) from public.subscribers where unsubscribed_at is null);
  v_list text;
  v_msg  text;
begin
  select url into v_url from public.webhooks where name = 'subscriber_list' and enabled;
  if v_url is null or v_url = '' then
    return 'No address set. Run: select public.set_webhook(''subscriber_list'', ''https://hooks.zapier.com/...'');';
  end if;

  select coalesce(string_agg(n || '. ' || email, E'\n' order by n), '')
    into v_list
  from (select email, row_number() over (order by added_at, email) as n
        from public.subscribers where unsubscribed_at is null limit 500) s;

  v_msg := E'📧 New email added to mailing list\n\n'
        || E'New email: test.person@example.com\n'
        || 'Total subscribers: ' || (v_total + 1) || E'\n'
        || E'Source: Website footer\n'
        || 'Added: ' || public.in_singapore_long(v_when) || E'\n\n'
        || E'All mailing-list emails:\n' || v_list
        || case when v_list = '' then '' else E'\n' end || (v_total + 1) || '. test.person@example.com';

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event', 'subscriber_added', 'email', 'test.person@example.com', 'name', '',
      'source', 'Website footer',
      'added_at', to_char(v_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'added_at_text', public.in_singapore_long(v_when),
      'subscribers_total', v_total + 1, 'all_emails', v_list, 'message', v_msg),
    timeout_milliseconds := 5000);

  return 'Sent. It should appear in Zapier within a few seconds.';
end;
$$;

revoke all on function public.test_subscriber_webhook() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  if exists (select 1 from public.webhooks where name = 'subscriber_list' and enabled) then
    raise notice 'OK    an address is set — run  select public.test_subscriber_webhook();  to prove it';
  else
    raise notice 'NEXT  set the address of the Zap:';
    raise notice '      select public.set_webhook(''subscriber_list'', ''PASTE THE ZAPIER HOOK URL'');';
    raise notice '      select public.test_subscriber_webhook();';
  end if;
  raise notice 'LIST  % subscriber(s) so far', (select count(*) from public.subscribers where unsubscribed_at is null);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- AFTERWARDS
--
--   See the list          select email, source, added_at from public.subscribers
--                         where unsubscribed_at is null order by added_at;
--   Bring in the old list select public.import_subscribers('a@x.com
--                                                           b@y.com', 'FD Insider List pop-up', '2026-08-13 19:27+08');
--   Set the address       select public.set_webhook('subscriber_list', 'https://hooks.zapier.com/hooks/catch/...');
--   Prove it              select public.test_subscriber_webhook();
--   Pause the messages    update public.webhooks set enabled = false where name = 'subscriber_list';
--   Somebody opts out     update public.subscribers set unsubscribed_at = now() where email = 'someone@example.com';
--
--   The Zap (Zapier): 1. Webhooks by Zapier — Catch Hook
--                     2. Slack — Send Channel Message, channel #fdai-subscriberlist,
--                        Message Text = the `message` field, Send as a bot = Yes,
--                        Bot Name = FD Subscriber List,
--                        Bot Icon = https://www.foundersdoc.com/slack/fd-subscriber-list.png
-- ═══════════════════════════════════════════════════════════════════════════
