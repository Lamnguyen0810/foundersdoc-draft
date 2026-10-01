-- ===========================================================================
-- FDAI — the Slack message says which list the address came from
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 073 first.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
-- The mailing list is fed by two different things, and the firm wants to
-- tell them apart at a glance:
--
--   Subscriber list  someone asked for news: the website forms (footer, end
--                    of an article, the corner card) and the old pop-up
--   Sign-up list     someone signed up to use FD AI
--
-- So the Source line now names the list first, then where exactly:
--
--   📧 New email added to mailing list
--
--   New email: someone@example.com
--   Total subscribers: 73 (68 subscriber list · 5 sign-up list)
--   Source: Subscriber list · Website footer
--   Added: 1 October 2026, 3:41 PM SGT
--
--   All mailing-list emails:
--   1. first@example.com
--   2. second@example.com · sign-up
--   …
--
-- `list` is also sent as its own field, so a Zap can filter or route on it.
-- ===========================================================================

-- ─────────────────────────────────────────────── 1. which list is which
create or replace function public.subscriber_list_of(p_source text)
returns text
language sql
immutable
as $$
  select case when p_source = 'FD AI sign-up form' then 'Sign-up list' else 'Subscriber list' end;
$$;

/* "Website footer" reads fine as it is; the rest get plainer words. */
create or replace function public.subscriber_where(p_source text)
returns text
language sql
immutable
as $$
  select case coalesce(p_source, '')
           when 'Article'                then 'End of an article'
           when 'Slide-in'               then 'Corner pop-up'
           when 'FD Insider List pop-up' then 'Old website pop-up'
           when ''                       then 'Website'
           else p_source
         end;
$$;

revoke all on function public.subscriber_list_of(text) from public, anon, authenticated;
revoke all on function public.subscriber_where(text) from public, anon, authenticated;

-- ───────────────────────────────────────── 2. the message, built in one place
/*
 * Used by add_subscriber() for a real address and by the test, so the two
 * can never drift apart. p_extra is a line added to the numbered list (the
 * test's made-up address); null for a real one, which is already in the table.
 */
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
  v_total   bigint;
  v_signup  bigint;
  v_list    text;
  v_n       bigint;
  v_listnm  text := public.subscriber_list_of(p_source);
  v_text    text := public.in_singapore_long(p_when);
  v_msg     text;
begin
  select count(*),
         count(*) filter (where source = 'FD AI sign-up form')
    into v_total, v_signup
  from public.subscribers where unsubscribed_at is null;

  select string_agg(n || '. ' || email
                    || case when source = 'FD AI sign-up form' then ' · sign-up' else '' end,
                    E'\n' order by n)
    into v_list
  from (
    select email, source, row_number() over (order by added_at, email) as n
    from public.subscribers
    where unsubscribed_at is null
    order by added_at desc, email desc
    limit 500
  ) s;
  v_list := coalesce(v_list, '');
  if v_total > 500 then
    v_list := v_list || E'\n… and ' || (v_total - 500) || ' earlier addresses.';
  end if;

  if p_extra is not null then
    v_total := v_total + 1;
    if v_listnm = 'Sign-up list' then v_signup := v_signup + 1; end if;
    v_list := v_list || case when v_list = '' then '' else E'\n' end || v_total || '. ' || p_extra
              || case when v_listnm = 'Sign-up list' then ' · sign-up' else '' end;
  end if;

  v_n := v_total - v_signup;
  v_msg := E'📧 New email added to mailing list\n\n'
        || 'New email: ' || p_email || E'\n'
        || 'Total subscribers: ' || v_total
        || ' (' || v_n || ' subscriber list · ' || v_signup || ' sign-up list)' || E'\n'
        || 'Source: ' || v_listnm || ' · ' || public.subscriber_where(p_source) || E'\n'
        || 'Added: ' || v_text || E'\n\n'
        || E'All mailing-list emails:\n' || v_list;

  return jsonb_build_object(
    'event',             'subscriber_added',
    'email',             p_email,
    'list',              v_listnm,
    'source',            public.subscriber_where(p_source),
    'added_at',          to_char(p_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'added_at_text',     v_text,
    'subscribers_total', v_total,
    'subscriber_list_total', v_n,
    'signup_list_total', v_signup,
    'all_emails',        v_list,
    -- Finished. This is the field that goes into the Slack step.
    'message',           v_msg
  );
end;
$$;

revoke all on function public.subscriber_message(text, text, timestamptz, text) from public, anon, authenticated;

-- ───────────────────────────────────────── 3. adding one now uses it
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
    return false;                                -- already on the list (or opted out)
  end if;

  if not p_announce then
    return true;
  end if;

  select url into v_url from public.webhooks where name = 'subscriber_list' and enabled;
  if v_url is null or v_url = '' then
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
 *   select public.test_subscriber_webhook();                 -- as a subscriber-list address
 *   select public.test_subscriber_webhook('sign-up');        -- as a sign-up-list address
 *
 * Nothing is added to the list.
 */
drop function if exists public.test_subscriber_webhook();

create or replace function public.test_subscriber_webhook(p_which text default 'subscriber')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_source text := case when lower(coalesce(p_which, '')) like 'sign%' then 'FD AI sign-up form' else 'Website footer' end;
begin
  select url into v_url from public.webhooks where name = 'subscriber_list' and enabled;
  if v_url is null or v_url = '' then
    return 'No address set. Run: select public.set_webhook(''subscriber_list'', ''https://hooks.zapier.com/...'');';
  end if;

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := public.subscriber_message('test.person@example.com', v_source, now(), 'test.person@example.com')
            || jsonb_build_object('name', ''),
    timeout_milliseconds := 5000);

  return 'Sent as a ' || public.subscriber_list_of(v_source)
      || ' address. It should appear in Zapier within a few seconds.';
end;
$$;

revoke all on function public.test_subscriber_webhook(text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Slack messages now name the list: % subscriber list, % sign-up list',
    (select count(*) from public.subscribers where unsubscribed_at is null and source <> 'FD AI sign-up form'),
    (select count(*) from public.subscribers where unsubscribed_at is null and source =  'FD AI sign-up form');
  raise notice 'TRY   select public.test_subscriber_webhook();  and  select public.test_subscriber_webhook(''sign-up'');';
end $$;
