-- ===========================================================================
-- FDAI — the subscriber list, announced to Slack the way it used to be
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 037 (webhooks table, pg_net) first; 072 is assumed.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
-- One mailing list, kept in the database, and one Slack message every time an
-- address joins it — in the shape the firm liked before FD AI existed:
--
--   📧 New email added to mailing list
--
--   New email: someone@example.com
--   Total subscribers: 72
--   Source: FD AI sign-up form
--   Added: 1 October 2026, 3:41 PM SGT
--
--   All mailing-list emails:
--   1. first@example.com
--   2. second@example.com
--   …
--
-- An address joins the list from either door, once:
--   • the sign-up form (a waitlist row — the first step of signing up)
--   • a confirmed FD AI account (Google sign-in, an invitation, or an
--     address that somehow has an account without a waitlist row)
-- The same address through both doors is counted once. The old August list
-- (the "FD Insider List pop-up", 71 addresses) is NOT part of this count;
-- FD asked for a clean start.
--
-- ── WHY THE MESSAGE IS WRITTEN HERE ─────────────────────────────────────────
-- Same reason as 037: `message` arrives finished, so the Zap drops one field
-- into Slack and nothing has to be assembled in the right order by hand. The
-- separate fields are still sent for anyone who wants columns.
-- ===========================================================================

-- ──────────────────────────────────────────────────────────── 1. the list
create table if not exists public.subscribers (
  email      text primary key,                 -- always lower-case, trimmed
  name       text,
  source     text not null,                    -- as shown in Slack
  added_at   timestamptz not null default now()
);

comment on table public.subscribers is
  'The mailing list: every address that signed up or made an account, once.';

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
 * sign-up or an account (the rule 037 states, kept here).
 *
 * p_announce false = add quietly. Used by the backfill below so that the
 * addresses already in the database do not each get a Slack message.
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
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_when  timestamptz := coalesce(p_when, now());
  v_url   text;
  v_total bigint;
  v_list  text;
  v_text  text;
  v_msg   text;
begin
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return false;
  end if;

  insert into public.subscribers (email, name, source, added_at)
  values (v_email, nullif(btrim(coalesce(p_name, '')), ''), coalesce(nullif(btrim(p_source), ''), 'FD AI'), v_when)
  on conflict (email) do nothing;

  if not found then
    return false;                                -- already on the list
  end if;

  if not p_announce then
    return true;
  end if;

  select url into v_url from public.webhooks where name = 'subscriber_list' and enabled;
  if v_url is null or v_url = '' then
    return true;                                 -- on the list; nobody to tell
  end if;

  select count(*) into v_total from public.subscribers;

  /* Oldest first, numbered, one per line — the whole list, as before. Capped
     at 500 lines so the message can never outgrow what Slack accepts; past
     that the newest are shown and the rest summarised. */
  select string_agg(n || '. ' || email, E'\n' order by n)
    into v_list
  from (
    select email, row_number() over (order by added_at, email) as n
    from public.subscribers
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
         || 'Source: ' || coalesce(nullif(btrim(p_source), ''), 'FD AI') || E'\n'
         || 'Added: ' || v_text || E'\n\n'
         || E'All mailing-list emails:\n' || v_list;

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',             'subscriber_added',
      'email',             v_email,
      'name',              coalesce(nullif(btrim(coalesce(p_name, '')), ''), ''),
      'source',            coalesce(nullif(btrim(p_source), ''), 'FD AI'),
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

-- ────────────────────────────────────────────── 4. door one: the sign-up form
/*
 * What the form calls itself is 'signup_modal'; Slack gets plain words. Any
 * other source (a future landing page, say) is shown as given.
 */
create or replace function public.source_in_words(p_source text)
returns text
language sql
immutable
as $$
  select case coalesce(btrim(p_source), '')
           when ''             then 'FD AI sign-up form'
           when 'signup_modal' then 'FD AI sign-up form'
           else p_source
         end;
$$;

create or replace function public.subscribe_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.add_subscriber(new.email, new.name, public.source_in_words(new.source), new.created_at, true);
  return new;
end;
$$;

drop trigger if exists on_waitlist_subscribe on public.waitlist;
create trigger on_waitlist_subscribe
  after insert on public.waitlist
  for each row execute function public.subscribe_from_waitlist();

-- ─────────────────────────────────────── 5. door two: a confirmed account
/*
 * Only once the address is confirmed (072's rule), so an unconfirmed bot
 * never reaches the list. Nearly every account was on the waitlist minutes
 * earlier and is already listed; this catches Google sign-ins, invitations,
 * and anything else that bypassed the form. Same two triggers as 072.
 */
create or replace function public.subscribe_from_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  jsonb := to_jsonb(new);
  v_how  text;
begin
  v_how := case
    when v_row ->> 'invited_at' is not null then 'invitation'
    when coalesce(v_row #>> '{raw_app_meta_data,provider}', 'email') = 'google' then 'Google sign-in'
    else 'account sign-up'
  end;
  perform public.add_subscriber(
    v_row ->> 'email',
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    'FD AI ' || v_how,
    coalesce((v_row ->> 'created_at')::timestamptz, now()),
    true);
  return new;
end;
$$;

drop trigger if exists on_auth_user_subscribe on auth.users;
create trigger on_auth_user_subscribe
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.subscribe_from_account();

drop trigger if exists on_auth_user_subscribe_confirmed on auth.users;
create trigger on_auth_user_subscribe_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.subscribe_from_account();

revoke all on function public.subscribe_from_waitlist() from public, anon, authenticated;
revoke all on function public.subscribe_from_account() from public, anon, authenticated;
revoke all on function public.source_in_words(text) from public, anon, authenticated;

-- ──────────────────────────────── 6. everyone already here, added quietly
/*
 * The waitlist and the confirmed accounts as they stand today go onto the
 * list with their original dates, with no Slack message for any of them.
 * Re-running this file adds nobody twice.
 */
do $$
declare r record; n int := 0;
begin
  for r in
    select email, name, source, created_at from public.waitlist order by created_at
  loop
    if public.add_subscriber(r.email, r.name, public.source_in_words(r.source), r.created_at, false) then
      n := n + 1;
    end if;
  end loop;
  for r in
    select email,
           coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name') as name,
           created_at
    from auth.users
    where email_confirmed_at is not null
    order by created_at
  loop
    if public.add_subscriber(r.email, r.name, 'FD AI account sign-up', r.created_at, false) then
      n := n + 1;
    end if;
  end loop;
  raise notice 'OK    % address(es) added quietly; the list now has %',
    n, (select count(*) from public.subscribers);
end $$;

-- ───────────────────────────────────────────── 7. a way to prove it works
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
  v_total bigint := (select count(*) from public.subscribers);
  v_list text;
  v_msg  text;
begin
  select url into v_url from public.webhooks where name = 'subscriber_list' and enabled;
  if v_url is null or v_url = '' then
    return 'No address set. Run: select public.set_webhook(''subscriber_list'', ''https://hooks.zapier.com/...'');';
  end if;

  select coalesce(string_agg(n || '. ' || email, E'\n' order by n), '(nobody yet)')
    into v_list
  from (select email, row_number() over (order by added_at, email) as n from public.subscribers limit 500) s;

  v_msg := E'📧 New email added to mailing list\n\n'
        || E'New email: test.person@example.com\n'
        || 'Total subscribers: ' || (v_total + 1) || E'\n'
        || E'Source: a test — nothing was added\n'
        || 'Added: ' || public.in_singapore_long(v_when) || E'\n\n'
        || E'All mailing-list emails:\n' || v_list
        || E'\n' || (v_total + 1) || '. test.person@example.com';

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event', 'subscriber_added', 'email', 'test.person@example.com', 'name', 'Test Person',
      'source', 'a test — nothing was added',
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
  if exists (select 1 from pg_trigger where tgname = 'on_waitlist_subscribe')
     and exists (select 1 from pg_trigger where tgname = 'on_auth_user_subscribe') then
    raise notice 'OK    sign-ups and confirmed accounts will join the list';
  else
    raise notice 'FAIL  a trigger is missing';
  end if;

  if exists (select 1 from public.webhooks where name = 'subscriber_list' and enabled) then
    raise notice 'OK    an address is set — run  select public.test_subscriber_webhook();  to prove it';
  else
    raise notice 'NEXT  set the address of the new Zap:';
    raise notice '      select public.set_webhook(''subscriber_list'', ''PASTE THE ZAPIER HOOK URL'');';
    raise notice '      select public.test_subscriber_webhook();';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- AFTERWARDS
--
--   See the list          select email, source, added_at from public.subscribers order by added_at;
--   Set the address       select public.set_webhook('subscriber_list', 'https://hooks.zapier.com/hooks/catch/...');
--   Prove it              select public.test_subscriber_webhook();
--   Pause the messages    update public.webhooks set enabled = false where name = 'subscriber_list';
--   Remove an address     delete from public.subscribers where email = 'someone@example.com';
--
--   The Zap (Zapier): 1. Webhooks by Zapier — Catch Hook
--                     2. Slack — Send Channel Message, channel #fdai-subscriberlist,
--                        Message Text = the `message` field, Send as a bot = Yes,
--                        Bot Name = FD Subscriber List, Bot Icon = :notebook:
--   And in the old waitlist Zap, switch off its Slack step (keep the welcome
--   email step), or every sign-up is announced twice.
-- ═══════════════════════════════════════════════════════════════════════════
