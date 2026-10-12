-- ============================================================================
-- 091 · Where each new account came from, in Slack and on the dashboard
-- ============================================================================
--
-- Rachel, on Terence Chew's sign-up: "Is this from emails?" Nobody could say
-- without digging through the event log. Now the Slack line says it:
--
--     Terence Chew just signed up!
--     terencechew339@gmail.com
--     Came from: Blog – What Is a Term Sheet? (via Google search)
--
--     Running total of registered (email) accounts: 17
--
-- and the dashboard (Users tab) lists where every new account came from.
--
-- ── WHERE THE SOURCE COMES FROM ──────────────────────────────────────────────
-- The first page of the visit is remembered in the browser tab (sessionStorage,
-- gone when the tab closes, like the visit id already is): the page, its
-- title, the referring SITE (host only, never the full link) and any utm_
-- tags. At sign-up it is saved on the new account as
-- raw_user_meta_data.signup_source:
--
--   * Email and password: sent with the sign-up itself.
--   * Google: carried through the Google round trip and saved by
--     /auth/google/callback straight after the account is created.
--
-- ── THE ONE BEHAVIOUR CHANGE ─────────────────────────────────────────────────
-- A Google account is announced when its source is saved (a moment after it
-- is created), not at the instant it is created — otherwise the Slack line
-- would go out before there was anything to say. Email accounts are announced
-- exactly as before (072: when the address is confirmed).
--
-- DEPLOY THE APP FIRST, THEN RUN THIS FILE. Run before the new app is live, a
-- Google sign-up would wait for a source that the old app never saves.
--
-- Safe to run again.
-- ============================================================================

-- ─── 1. reading a source ──────────────────────────────────────────────────
-- Everything below copes with a source that is missing, empty or half filled:
-- accounts from before 091, accounts made by hand, private windows.

create or replace function public.signup_source_via(p jsonb)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    when lower(coalesce(p ->> 'utm_medium', '')) in ('email', 'newsletter', 'e-mail')
      or lower(coalesce(p ->> 'utm_source', '')) in ('email', 'newsletter', 'mailing-list', 'emailoctopus', 'brevo')
      or coalesce(p ->> 'ref', '') ~* '(^|\.)(mail\.google\.com|outlook\.(live|office|office365)\.com|mail\.yahoo\.com|mail\.zoho\.com)$'
      then 'email'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$' then 'AI assistant'
    when coalesce(p ->> 'ref', '') ~* '^google\.[a-z.]+$' then 'Google search'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org|baidu\.com|yandex\.[a-z]+)$' then 'search engine'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(linkedin\.com|lnkd\.in)$' then 'LinkedIn'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(facebook\.com|fb\.me)$' then 'social media: Facebook'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)instagram\.com$' then 'social media: Instagram'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(t\.co|x\.com|twitter\.com)$' then 'social media: X'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(youtube\.com|youtu\.be)$' then 'social media: YouTube'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(reddit\.com|threads\.net|tiktok\.com)$' then 'social media: ' || (p ->> 'ref')
    when nullif(p ->> 'utm_source', '') is not null then p ->> 'utm_source'
    when coalesce(p ->> 'ref', '') in ('', 'direct', 'internal') then 'direct'
    else 'a link on ' || (p ->> 'ref')
  end;
$$;

-- Broad buckets for the dashboard breakdown.
create or replace function public.signup_source_channel(p jsonb)
returns text
language sql
immutable
as $$
  select case
    when p is null or p = '{}'::jsonb then 'Not recorded'
    else case
      when public.signup_source_via(p) = 'email' then 'Email'
      when public.signup_source_via(p) in ('Google search', 'search engine') then 'Search'
      when public.signup_source_via(p) = 'AI assistant' then 'AI assistant'
      when public.signup_source_via(p) = 'LinkedIn' then 'LinkedIn'
      when public.signup_source_via(p) like 'social media%' then 'Other social'
      when public.signup_source_via(p) = 'direct' then 'Direct'
      else 'Other website'
    end
  end;
$$;

-- The first page, in words.
create or replace function public.signup_source_page(p jsonb)
returns text
language sql
immutable
as $$
  select case
    when p is null or nullif(p ->> 'path', '') is null then null
    when p ->> 'path' = '/' then 'Homepage'
    when p ->> 'kind' = 'article' or p ->> 'path' like '/resources/%'
      then 'Blog – ' || coalesce(nullif(p ->> 'title', ''), p ->> 'path')
    when p ->> 'path' = '/resources' then 'Blog'
    when p ->> 'path' = '/podcast' then 'Podcast'
    when p ->> 'path' = '/about' then 'About us'
    when p ->> 'path' = '/contact' then 'Contact page'
    when p ->> 'path' = '/fd-consult' then 'FD Consult page'
    when p ->> 'path' ~ '^/(signup|login|draft|auth)' then 'FD AI sign-up page'
    else coalesce(nullif(p ->> 'title', ''), p ->> 'path')
  end;
$$;

-- "Blog – What Is a Term Sheet? (via Google search)", or "not recorded".
create or replace function public.signup_source_label(p jsonb)
returns text
language sql
immutable
as $$
  select case
    when p is null or p = '{}'::jsonb then 'not recorded'
    else coalesce(public.signup_source_page(p), 'unknown page')
      || ' (via ' || public.signup_source_via(p) || ')'
      || coalesce(' · campaign: ' || nullif(p ->> 'utm_campaign', ''), '')
  end;
$$;

-- ─── 2. the message, with one more line ───────────────────────────────────
create or replace function public.account_message(p_name text, p_email text, p_total bigint, p_source text)
returns text
language sql
immutable
as $$
  select p_name || ' just signed up!' || E'\n'
      || p_email || E'\n'
      || coalesce('Came from: ' || p_source || E'\n', '')
      || E'\n'
      || 'Running total of registered (email) accounts: ' || p_total;
$$;

-- The three-argument form (039, test_webhook) keeps working, unchanged.
create or replace function public.account_message(p_name text, p_email text, p_total bigint)
returns text
language sql
immutable
as $$
  select public.account_message(p_name, p_email, p_total, null);
$$;

revoke all on function public.account_message(text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.account_message(text, text, bigint) from public, anon, authenticated;

-- ─── 3. the announcement (072's, plus the source) ─────────────────────────
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
  v_source  jsonb := new.raw_user_meta_data -> 'signup_source';
  v_label   text;
begin
  if v_email = '' then
    return new;
  end if;

  select url into v_url
  from public.webhooks
  where name = 'account_created' and enabled;

  if v_url is null or v_url = '' then
    return new;
  end if;

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

  if v_name is null then
    v_name := coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name',
                            new.raw_user_meta_data ->> 'name', '')), ''),
      split_part(v_email, '@', 1));
  end if;

  v_how := case
    when v_row ->> 'invited_at' is not null then 'an invitation'
    when coalesce(v_row #>> '{raw_app_meta_data,provider}', 'email') = 'google' then 'Google'
    when coalesce(v_row #>> '{raw_app_meta_data,provider}', 'email') = 'email' then 'email and password'
    else v_row #>> '{raw_app_meta_data,provider}'
  end;

  select count(*) into v_total from auth.users u where u.email_confirmed_at is not null;

  v_text  := public.in_singapore(v_when);
  -- An invitation or a hand-made account has no visit behind it: no line.
  v_label := case when v_source is null then null else public.signup_source_label(v_source) end;

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
      'source',          coalesce(v_label, ''),
      'source_channel',  public.signup_source_channel(v_source),
      'message',         public.account_message(v_name, v_email, v_total, v_label)
    ),
    timeout_milliseconds := 5000
  );

  return new;

-- Nothing about telling Slack may stop somebody getting an account (040).
exception when others then
  raise warning 'announce_new_account: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.announce_new_account() from public, anon, authenticated;

-- Created already confirmed (email with "Confirm email" off, invitations,
-- hand-made accounts): announced at once — except Google, which waits for
-- its source (below).
drop trigger if exists on_auth_user_announced on auth.users;
create trigger on_auth_user_announced
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null
        and coalesce(new.raw_app_meta_data ->> 'provider', 'email') <> 'google')
  execute function public.announce_new_account();

-- Email confirmed later (072), unchanged.
drop trigger if exists on_auth_user_announced_confirmed on auth.users;
create trigger on_auth_user_announced_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.announce_new_account();

-- Google: announced when /auth/google/callback saves the source. It saves
-- one for every new Google account (an empty one when nothing was recorded),
-- so every new Google account is still announced exactly once.
drop trigger if exists on_auth_user_announced_google on auth.users;
create trigger on_auth_user_announced_google
  after update of raw_user_meta_data on auth.users
  for each row
  when (new.email_confirmed_at is not null
        and coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'google'
        and (old.raw_user_meta_data -> 'signup_source') is null
        and (new.raw_user_meta_data -> 'signup_source') is not null)
  execute function public.announce_new_account();

-- ─── 4. the dashboard list ────────────────────────────────────────────────
create or replace function public.admin_signup_sources(p_days integer default 30, p_limit integer default 100)
returns table (
  created_at timestamptz,
  email      text,
  name       text,
  how        text,
  channel    text,
  came_from  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select u.created_at,
         u.email::text,
         coalesce(nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ''),
                  split_part(u.email, '@', 1))::text,
         case coalesce(u.raw_app_meta_data ->> 'provider', 'email')
           when 'google' then 'Google' else 'Email' end::text,
         public.signup_source_channel(u.raw_user_meta_data -> 'signup_source'),
         public.signup_source_label(u.raw_user_meta_data -> 'signup_source')
  from auth.users u
  where u.email_confirmed_at is not null
    and (p_days is null or p_days <= 0 or u.created_at >= now() - make_interval(days => p_days))
  order by u.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.admin_signup_sources(integer, integer) from public, anon;
grant execute on function public.admin_signup_sources(integer, integer) to authenticated;

-- ─── 5. checks ────────────────────────────────────────────────────────────
--   select public.signup_source_label('{"path":"/what-is-a-term-sheet","kind":"article","title":"What Is a Term Sheet? A Plain-English Guide","ref":"google.com"}');
--   -> Blog – What Is a Term Sheet? A Plain-English Guide (via Google search)
--
--   Latest accounts and where they came from:
--   select created_at, email, came_from from public.admin_signup_sources(30, 20);
--   (run as an admin, or read raw_user_meta_data -> 'signup_source' in auth.users)
