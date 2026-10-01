-- ===========================================================================
-- FDAI — one message for both lists, the two lists shown apart
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 073 and 074 first. Replaces the message of 075 and 076 (neither needs
-- to be run; if 076 was, sign-ups still go wherever its routing says).
--
-- Every new address, from either list, is announced the same way:
--
--   📧 New email added to mailing list
--
--   New email: someone@example.com
--   Total: 76 (72 subscriber list · 4 sign-up list)
--   Source: Subscriber list            (or: Sign-up list)
--   Added: 1 October 2026, 7:03 PM SGT
--
--   Subscriber list (72):
--   1. first@example.com
--   …
--
--   Sign-up list (4):
--   1. someone@example.com
--   …
--
-- The exact place (footer, corner pop-up, article…) is still sent to Zapier
-- as the `source` field; only the message shows the list alone.
-- ===========================================================================

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
  c_cap     constant int := 300;               -- per list, so the message stays within Slack's limit
  v_listnm  text := public.subscriber_list_of(p_source);
  v_is_sign boolean := v_listnm = 'Sign-up list';
  v_text    text := public.in_singapore_long(p_when);
  v_sub_n   bigint;
  v_sign_n  bigint;
  v_sub     text;
  v_sign    text;
  v_msg     text;
begin
  select count(*) filter (where source <> 'FD AI sign-up form'),
         count(*) filter (where source =  'FD AI sign-up form')
    into v_sub_n, v_sign_n
  from public.subscribers where unsubscribed_at is null;

  /* Each list oldest first, numbered from 1. Past the cap, the newest are
     shown and the earlier ones summarised. */
  select coalesce(string_agg(n || '. ' || email, E'\n' order by n), '')
    into v_sub
  from (
    select email, row_number() over (order by added_at, email) as n
    from public.subscribers
    where unsubscribed_at is null and source <> 'FD AI sign-up form'
    order by added_at desc, email desc
    limit c_cap
  ) s;

  select coalesce(string_agg(n || '. ' || email, E'\n' order by n), '')
    into v_sign
  from (
    select email, row_number() over (order by added_at, email) as n
    from public.subscribers
    where unsubscribed_at is null and source = 'FD AI sign-up form'
    order by added_at desc, email desc
    limit c_cap
  ) s;

  /* The test's made-up address, added to the list it is pretending to be on. */
  if p_extra is not null then
    if v_is_sign then
      v_sign_n := v_sign_n + 1;
      v_sign := v_sign || case when v_sign = '' then '' else E'\n' end || v_sign_n || '. ' || p_extra;
    else
      v_sub_n := v_sub_n + 1;
      v_sub := v_sub || case when v_sub = '' then '' else E'\n' end || v_sub_n || '. ' || p_extra;
    end if;
  end if;

  if v_sub_n > c_cap then
    v_sub := '… and ' || (v_sub_n - c_cap) || E' earlier addresses\n' || v_sub;
  end if;
  if v_sign_n > c_cap then
    v_sign := '… and ' || (v_sign_n - c_cap) || E' earlier addresses\n' || v_sign;
  end if;

  v_msg := E'📧 New email added to mailing list\n\n'
        || 'New email: ' || p_email || E'\n'
        || 'Total: ' || (v_sub_n + v_sign_n)
        || ' (' || v_sub_n || ' subscriber list · ' || v_sign_n || ' sign-up list)' || E'\n'
        || 'Source: ' || v_listnm || E'\n'
        || 'Added: ' || v_text || E'\n\n'
        || 'Subscriber list (' || v_sub_n || E'):\n'
        || case when v_sub = '' then '(none yet)' else v_sub end || E'\n\n'
        || 'Sign-up list (' || v_sign_n || E'):\n'
        || case when v_sign = '' then '(none yet)' else v_sign end;

  return jsonb_build_object(
    'event',                 'subscriber_added',
    'email',                 p_email,
    'list',                  v_listnm,
    'source',                public.subscriber_where(p_source),
    'added_at',              to_char(p_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'added_at_text',         v_text,
    'subscribers_total',     v_sub_n + v_sign_n,
    'subscriber_list_total', v_sub_n,
    'signup_list_total',     v_sign_n,
    'subscriber_emails',     v_sub,
    'signup_emails',         v_sign,
    -- Finished. This is the field that goes into the Slack step.
    'message',               v_msg
  );
end;
$$;

revoke all on function public.subscriber_message(text, text, timestamptz, text) from public, anon, authenticated;

do $$
begin
  raise notice 'OK    one message, both lists shown apart: % subscriber(s), % sign-up(s)',
    (select count(*) from public.subscribers where unsubscribed_at is null and source <> 'FD AI sign-up form'),
    (select count(*) from public.subscribers where unsubscribed_at is null and source =  'FD AI sign-up form');
  raise notice 'TRY   select public.test_subscriber_webhook();  and  select public.test_subscriber_webhook(''sign-up'');';
end $$;
