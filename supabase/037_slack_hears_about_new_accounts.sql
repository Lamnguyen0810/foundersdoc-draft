-- ===========================================================================
-- FDAI — Slack hears about every new account
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 034, 035 and 036 first.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
-- Somebody creates an FD AI account and a line appears in Slack saying who,
-- how, when, and how many accounts that makes. No dashboard to remember to
-- open; the firm finds out the way it finds out everything else.
--
-- ── WHY THE DATABASE AND NOT THE APPLICATION ────────────────────────────────
-- The same argument 036 makes, and it was right then. There are three ways to
-- get an account — the sign-up screen, Google, and FD pressing Invite — and
-- only one of them passes through a server route we control. TypeScript would
-- have to remember at each door, and the fourth door would forget. The
-- database sees all of them, in the same transaction as the account itself.
--
-- That last part is worth saying plainly: pg_net does not send anything here
-- and now. It puts the request on a queue INSIDE this transaction and a worker
-- sends it after the commit. So an account that rolls back announces nothing,
-- and an announcement that cannot be sent never delays the person signing up.
--
-- ── AND WHY THE MESSAGE IS WRITTEN HERE RATHER THAN IN ZAPIER ───────────────
-- The weekly report spent a month saying "for the week from 11 September to
-- 4 September" because two identical-looking fields had been dragged into the
-- Zap the wrong way round. Nothing was wrong with the code. The fix was to
-- stop sending parts that have to be assembled correctly by hand.
--
-- So `message` arrives finished. Drop that one field into Slack and there is
-- no order to get wrong, no timezone to convert, no date to reformat. The
-- separate fields are all still there for the Zapier Tables row, where they
-- belong in columns.
-- ===========================================================================

-- ─────────────────────────────────────────────────────── 0. the way out of pg
/*
 * pg_net lets Postgres make an HTTP request. It ships with Supabase; this
 * switches it on. In the `extensions` schema, which is where Supabase keeps
 * them — the functions themselves land in a schema called `net`.
 */
create extension if not exists pg_net with schema extensions;

-- ──────────────────────────────────────────────────────── 1. where to send it
/*
 * The Zapier hook address lives in a row, not in this file, for three reasons:
 * it is a secret of sorts — anyone holding it can post fake signups into the
 * firm's Slack; it changes when FD rebuilds the Zap, and that should not need
 * a deploy; and a migration in git that carries a live endpoint gets copied
 * into a staging database by somebody one day and quietly posts test accounts
 * to the real channel.
 */
create table if not exists public.webhooks (
  name       text primary key,
  url        text not null,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.webhooks is
  'Outgoing hook addresses, by purpose. Set with public.set_webhook().';

/*
 * RLS on and no policy at all. The service key bypasses policies and the SQL
 * editor is not subject to them, so the firm can still read it; a browser that
 * guesses the table name learns nothing. An address is not something a signed-
 * in user has any business reading.
 */
alter table public.webhooks enable row level security;
revoke all on public.webhooks from anon, authenticated;

/*
 * Refuses anything that is not an address, at the moment the mistake is made.
 *
 * Without this, a placeholder left in by accident — YOUR CATCH HOOK URL, say —
 * is accepted here without complaint and fails minutes later, inside pg_net,
 * as "Malformed input to a URL function" in a twenty-line stack trace that
 * names neither the field that is wrong nor where to find the right value.
 * The check costs one regular expression; the error it prevents costs an
 * afternoon.
 */
drop function if exists public.set_webhook(text, text);

create or replace function public.set_webhook(p_name text, p_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_url text := btrim(coalesce(p_url, ''));
begin
  if v_url !~ '^https://[^[:space:]]+\.[^[:space:]]+' or v_url ~ '[[:space:]]' then
    return 'Not saved. That is not a web address: "' || v_url || '"'
        || E'\nIt should look like  https://hooks.zapier.com/hooks/catch/1234567/abcdefg/'
        || E'\nZapier: step 1 (Catch Hook) -> the Test tab -> copy the URL it shows.';
  end if;

  insert into public.webhooks (name, url, updated_at)
  values (btrim(p_name), v_url, now())
  on conflict (name) do update
    set url = excluded.url, enabled = true, updated_at = now();

  return 'Saved. Now run:  select public.test_webhook();';
end;
$$;

revoke all on function public.set_webhook(text, text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────── 2. the time, in words
/*
 * "21 Sep 2026, 4:12pm", Singapore time — the same shape the weekly report
 * now uses, and for the same reason. An ISO instant ending in Z is correct and
 * unreadable, and being eight hours behind Singapore it prints the wrong DAY
 * for anything that happens in the evening. Somebody checking Slack against
 * the calendar then concludes the system is broken when it is not.
 *
 * FM drops the zero padding: "4:12pm", not "04:12pm". Mon gives "Sep" rather
 * than the four-letter "Sept" that en-GB produces and that looks like a typo
 * in a column of dates.
 */
create or replace function public.in_singapore(p_when timestamptz)
returns text
language sql
immutable
as $$
  select to_char(p_when at time zone 'Asia/Singapore', 'FMDD FMMon YYYY, FMHH12:MIam');
$$;

-- ───────────────────────────────────────────────── 3. announcing a new account
create or replace function public.announce_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     jsonb := to_jsonb(new);
  v_email   text  := lower(btrim(coalesce(v_row ->> 'email', '')));
  v_url     text;
  v_name    text;
  v_company text;
  v_how     text;
  v_total   bigint;
  v_when    timestamptz := coalesce((v_row ->> 'created_at')::timestamptz, now());
  v_text    text;
  v_who     text;
  v_count   text;
begin
  if v_email = '' then
    return new;
  end if;

  select url into v_url
  from public.webhooks
  where name = 'account_created' and enabled;

  -- Not configured, or switched off. Nothing sent, nothing logged, no account
  -- kept waiting. This is the normal state of a database that has just been
  -- restored from a backup, and it should be quiet.
  if v_url is null or v_url = '' then
    return new;
  end if;

  /* The name as the person gave it, wherever they gave it. Google supplies
     full_name; the sign-up screen puts name in the same place; the waitlist
     form asked for it days earlier. Failing all three, the part of the address
     before the @, which is at least something to say in Slack. */
  select coalesce(
           nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name',
                                 new.raw_user_meta_data ->> 'name', '')), ''),
           nullif(btrim(w.name), ''),
           split_part(v_email, '@', 1)
         ),
         nullif(btrim(w.company), '')
    into v_name, v_company
  from public.waitlist w
  where lower(w.email) = v_email;

  -- No waitlist row at all: an account FD made by hand in the dashboard.
  if v_name is null then
    v_name := coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name',
                            new.raw_user_meta_data ->> 'name', '')), ''),
      split_part(v_email, '@', 1));
  end if;

  /* Which door they came through. raw_app_meta_data is written by GoTrue on
     the user row itself at the moment of creation; auth.identities is filled
     in a moment later and would still be empty here. Read as JSON, like 035
     and 036, so that a column Supabase renames one day stops this announcing
     rather than stopping people signing up. */
  v_how := case
    when v_row ->> 'invited_at' is not null then 'an invitation'
    when coalesce(v_row #>> '{raw_app_meta_data,provider}', 'email') = 'google' then 'Google'
    when coalesce(v_row #>> '{raw_app_meta_data,provider}', 'email') = 'email' then 'email and password'
    else v_row #>> '{raw_app_meta_data,provider}'
  end;

  -- AFTER INSERT, so this row is already counted. That is what we want: the
  -- number in the message is the number of accounts there are now.
  select count(*) into v_total from auth.users;

  v_text  := public.in_singapore(v_when);
  v_who   := v_name || coalesce(', ' || v_company, '') || ' (' || v_email || ')';
  v_count := case when v_total = 1 then 'That''s 1 account.'
                  else 'That''s ' || v_total || ' accounts.' end;

  /* One flat object, one level deep, every value a string or a number. Zapier
     offers each key by name in the field picker; nothing has to be dug out of
     a nested structure or parsed by a Code step. */
  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',           'account_created',
      'email',           v_email,
      'name',            v_name,
      'company',         coalesce(v_company, ''),
      'how',             v_how,
      'created_at',      to_char(v_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'created_at_text', v_text,
      'accounts_total',  v_total,
      -- Finished. This is the field that goes into the Slack step.
      'message',         v_who || ' created an FD AI account with ' || v_how
                         || ' — ' || v_text || '. ' || v_count
    ),
    timeout_milliseconds := 5000
  );

  return new;

/* ── THE RULE THIS BLOCK EXISTS TO ENFORCE ──────────────────────────────────
   Nothing about telling Slack may stop somebody getting an account. If pg_net
   is not installed, if the queue is full, if the URL is malformed — the
   account is still created and the person still gets in. A missing Slack
   message is a nuisance; a sign-up screen that errors because of a Slack
   message is the product being broken by its own reporting. */
exception when others then
  raise warning 'announce_new_account: %', sqlerrm;
  return new;
end;
$$;

/*
 * AFTER, so nothing is announced for an account 035's gate turned away. Named
 * to sort before on_auth_user_created and on_auth_user_waitlist, which run in
 * alphabetical order — not that it matters, since this reads only auth.users
 * and the waitlist, and neither is written by them.
 */
drop trigger if exists on_auth_user_announced on auth.users;
create trigger on_auth_user_announced
  after insert on auth.users
  for each row execute function public.announce_new_account();

revoke all on function public.announce_new_account() from public, anon, authenticated;
revoke all on function public.in_singapore(timestamptz) from public, anon, authenticated;

-- ──────────────────────────────────────────────── 4. a way to prove it works
/*
 * Sends one made-up account to the same address, with the same fields, so
 * Zapier's "Test step" has something real to learn the shape from — and so
 * that "is it wired up?" can be answered in five seconds instead of by
 * creating a throwaway account and then having to delete it.
 *
 *   select public.test_webhook();
 *
 * The name says Test Person, so nobody mistakes it for a customer.
 */
create or replace function public.test_webhook()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text;
  v_when timestamptz := now();
  v_text text;
begin
  select url into v_url from public.webhooks where name = 'account_created' and enabled;
  if v_url is null or v_url = '' then
    return 'No address set. Run: select public.set_webhook(''account_created'', ''https://hooks.zapier.com/...'');';
  end if;

  v_text := public.in_singapore(v_when);

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',           'account_created',
      'email',           'test.person@example.com',
      'name',            'Test Person',
      'company',         'Example Pte Ltd',
      'how',             'email and password',
      'created_at',      to_char(v_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'created_at_text', v_text,
      'accounts_total',  (select count(*) from auth.users),
      'message',         'Test Person, Example Pte Ltd (test.person@example.com) created an FD AI account with email and password — '
                         || v_text || '. This is a test.'
    ),
    timeout_milliseconds := 5000
  );

  return 'Sent. It should appear in Zapier within a few seconds.';
end;
$$;

revoke all on function public.test_webhook() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────── the check
do $$
declare v_has_net boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_net') into v_has_net;

  if v_has_net then
    raise notice 'OK    pg_net is installed';
  else
    raise notice 'FAIL  pg_net did not install — nothing will be sent';
  end if;

  if exists (select 1 from pg_trigger where tgname = 'on_auth_user_announced') then
    raise notice 'OK    new accounts will be announced';
  else
    raise notice 'FAIL  the trigger is not there';
  end if;

  if exists (select 1 from public.webhooks where name = 'account_created' and enabled) then
    raise notice 'OK    an address is set — run  select public.test_webhook();  to prove it';
  else
    raise notice 'NEXT  set the address:';
    raise notice '      select public.set_webhook(''account_created'', ''PASTE THE ZAPIER HOOK URL'');';
    raise notice '      select public.test_webhook();';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- AFTERWARDS
--
--   Set the address        select public.set_webhook('account_created', 'https://hooks.zapier.com/hooks/catch/...');
--   Prove it               select public.test_webhook();
--   Turn it off for a day  update public.webhooks set enabled = false where name = 'account_created';
--   Turn it back on        update public.webhooks set enabled = true  where name = 'account_created';
--
--   What was sent, and what came back — pg_net keeps roughly six hours of it:
--     select id, created, status_code, content
--     from net._http_response order by created desc limit 20;
--
--   A 200 is Zapier accepting it. A 410 means the Zap was deleted or turned
--   off; set a new address. Nothing at all means pg_net's worker is not
--   running, which on Supabase means the project was paused.
-- ═══════════════════════════════════════════════════════════════════════════
