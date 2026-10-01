-- ===========================================================================
-- FDAI — two separate lists, two separate messages
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 073 and 074 first. Replaces 075's message (075 need not be run).
--
-- The firm keeps two lists and wants them apart:
--
--   Subscriber list  asked for news: the website forms, the old pop-up
--   Sign-up list     signed up to use FD AI
--
-- A new address is announced with ITS list only — its own title, its own
-- total, its own numbered list:
--
--   📧 New email added to subscriber list
--
--   New email: someone@example.com
--   Total subscribers: 72
--   Source: Corner pop-up
--   Added: 1 October 2026, 7:03 PM SGT
--
--   Subscriber list:
--   1. first@example.com
--   …
--
--   📝 New email added to sign-up list
--
--   New email: someone@example.com
--   Total sign-ups: 5
--   Source: FD AI sign-up form
--   Added: 1 October 2026, 7:05 PM SGT
--
--   Sign-up list:
--   1. first.signup@example.com
--   …
--
-- ── ONE CHANNEL OR TWO ──────────────────────────────────────────────────────
-- Both go to the 'subscriber_list' Zap unless a 'signup_list' address is set,
-- in which case sign-ups go there instead. So to give sign-ups their own
-- channel later: make a second Zap the same way, then
--   select public.set_webhook('signup_list', 'https://hooks.zapier.com/...');
-- No other change.
-- ===========================================================================

-- ──────────────────────────────────────────── 1. the message, one list only
create or replace function public.subscriber_message(
  p_email  text,
  p_source text,
  p_when   timestamptz,
  p_extra  text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_cap     constant int := 500;               -- keeps the message within Slack's limit
  v_listnm  text := public.subscriber_list_of(p_source);
  v_is_sign boolean := v_listnm = 'Sign-up list';
  v_text    text := public.in_singapore_long(p_when);
  v_n       bigint;
  v_list    text;
  v_msg     text;
begin
  /* Only the rows of this address's own list. */
  select count(*) into v_n
  from public.subscribers
  where unsubscribed_at is null
    and (source = 'FD AI sign-up form') = v_is_sign;

  select coalesce(string_agg(n || '. ' || email, E'\n' order by n), '')
    into v_list
  from (
    select email, row_number() over (order by added_at, email) as n
    from public.subscribers
    where unsubscribed_at is null
      and (source = 'FD AI sign-up form') = v_is_sign
    order by added_at desc, email desc
    limit c_cap
  ) s;

  /* The test's made-up address, as the newest on its list. */
  if p_extra is not null then
    v_n := v_n + 1;
    v_list := v_list || case when v_list = '' then '' else E'\n' end || v_n || '. ' || p_extra;
  end if;

  if v_n > c_cap then
    v_list := '… and ' || (v_n - c_cap) || E' earlier addresses\n' || v_list;
  end if;

  v_msg := case when v_is_sign then E'📝 New email added to sign-up list\n\n'
                               else E'📧 New email added to subscriber list\n\n' end
        || 'New email: ' || p_email || E'\n'
        || case when v_is_sign then 'Total sign-ups: ' else 'Total subscribers: ' end || v_n || E'\n'
        || 'Source: ' || public.subscriber_where(p_source) || E'\n'
        || 'Added: ' || v_text || E'\n\n'
        || v_listnm || E':\n' || v_list;

  return jsonb_build_object(
    'event',         'subscriber_added',
    'email',         p_email,
    'list',          v_listnm,
    'source',        public.subscriber_where(p_source),
    'added_at',      to_char(p_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'added_at_text', v_text,
    'list_total',    v_n,
    'list_emails',   v_list,
    -- Finished. This is the field that goes into the Slack step.
    'message',       v_msg
  );
end;
$$;

revoke all on function public.subscriber_message(text, text, timestamptz, text) from public, anon, authenticated;

-- ─────────────────────────────────── 2. where each list's message is sent
/* 'signup_list' if one is set for a sign-up, otherwise 'subscriber_list'. */
create or replace function public.subscriber_hook(p_source text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select url from public.webhooks
      where name = 'signup_list' and enabled and nullif(url, '') is not null
        and public.subscriber_list_of(p_source) = 'Sign-up list'),
    (select url from public.webhooks
      where name = 'subscriber_list' and enabled and nullif(url, '') is not null));
$$;

revoke all on function public.subscriber_hook(text) from public, anon, authenticated;

-- ───────────────────────────────────────── 3. adding one, sent to the right Zap
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
begin
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return false;
  end if;

  insert into public.subscribers (email, name, source, added_at)
  values (v_email, nullif(btrim(coalesce(p_name, '')), ''), v_source, v_when)
  on conflict (email) do nothing;

  if not found then
    return false;                                -- already on a list (or opted out)
  end if;

  if not p_announce then
    return true;
  end if;

  v_url := public.subscriber_hook(v_source);
  if v_url is null then
    return true;                                 -- on the list; nobody to tell
  end if;

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := public.subscriber_message(v_email, v_source, v_when)
            || jsonb_build_object('name', coalesce(nullif(btrim(coalesce(p_name, '')), ''), '')),
    timeout_milliseconds := 5000
  );

  return true;

exception when others then
  raise warning 'add_subscriber: %', sqlerrm;
  return false;
end;
$$;

revoke all on function public.add_subscriber(text, text, text, timestamptz, boolean) from public, anon, authenticated;

-- ───────────────────────────────────────────── 4. the test, either list
/*
 *   select public.test_subscriber_webhook();             -- a subscriber-list message
 *   select public.test_subscriber_webhook('sign-up');    -- a sign-up-list message
 * Nothing is added to either list.
 */
create or replace function public.test_subscriber_webhook(p_which text default 'subscriber')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := case when lower(coalesce(p_which, '')) like 'sign%' then 'FD AI sign-up form' else 'Website footer' end;
  v_url    text := public.subscriber_hook(v_source);
begin
  if v_url is null then
    return 'No address set. Run: select public.set_webhook(''subscriber_list'', ''https://hooks.zapier.com/...'');';
  end if;

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := public.subscriber_message('test.person@example.com', v_source, now(), 'test.person@example.com')
            || jsonb_build_object('name', ''),
    timeout_milliseconds := 5000);

  return 'Sent a ' || public.subscriber_list_of(v_source) || ' test. It should appear in Slack within a few seconds.';
end;
$$;

revoke all on function public.test_subscriber_webhook(text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    two lists: % subscriber(s), % sign-up(s)',
    (select count(*) from public.subscribers where unsubscribed_at is null and source <> 'FD AI sign-up form'),
    (select count(*) from public.subscribers where unsubscribed_at is null and source =  'FD AI sign-up form');
  if exists (select 1 from public.webhooks where name = 'signup_list' and enabled) then
    raise notice 'OK    sign-ups go to their own Zap (signup_list)';
  else
    raise notice 'NOTE  sign-ups go to the same Zap as subscribers; to separate them, set signup_list';
  end if;
  raise notice 'TRY   select public.test_subscriber_webhook();  and  select public.test_subscriber_webhook(''sign-up'');';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEEING EACH LIST
--   Subscriber list  select email, source, added_at from public.subscribers
--                    where unsubscribed_at is null and source <> 'FD AI sign-up form' order by added_at;
--   Sign-up list     select email, added_at from public.subscribers
--                    where unsubscribed_at is null and source = 'FD AI sign-up form' order by added_at;
-- ═══════════════════════════════════════════════════════════════════════════
