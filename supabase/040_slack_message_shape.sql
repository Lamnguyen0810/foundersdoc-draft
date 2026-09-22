-- 040 — the Slack message reads like the waitlist one did.
--
-- 037 announced a new account in one sentence: "Kai Ze (kai@example.com)
-- created an FD AI account with Google — 22 Sep 2026, 11:08pm. That's 249
-- accounts." FD's team had been reading the waitlist message for months and
-- wanted the same shape back, not a new one to learn:
--
--     Kai Ze just signed up!
--     kai@example.com
--
--     Running total of registered (email) accounts: 249
--
-- No emoji: the old one had them, and they were the only part that ever
-- looked wrong — a tada that Zapier rendered as text on a bad day.
--
-- Word for word, "(email)" included, because that is what FD asked for and
-- what the team is used to reading. The count is of every account in
-- auth.users, Google ones included.
--
-- ── WHAT CHANGES ─────────────────────────────────────────────────────────────
-- Only the text. The same hook, the same fields, the same `message` chip in
-- the Zap — nothing in Zapier needs touching. The other fields (name, email,
-- how, company, created_at, accounts_total) are still sent, so a future Zap
-- can build a different message from parts.
--
-- account_message() holds the wording in ONE place, and the test message
-- (test_webhook) and the correction 039 sends use it too, so all three lines
-- in the channel look like they came from the same hand.

create or replace function public.account_message(p_name text, p_email text, p_total bigint)
returns text
language sql
immutable
as $$
  select p_name || ' just signed up!' || E'\n'
      || p_email || E'\n\n'
      || 'Running total of registered (email) accounts: ' || p_total;
$$;

revoke all on function public.account_message(text, text, bigint) from public, anon, authenticated;

-- ───────────────────────────────────── the announcement, from 037, reworded
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
      -- Finished. This is the field that goes into the Slack step. Three
      -- lines, the shape of the waitlist message FD's team already reads.
      'message',         public.account_message(v_name, v_email, v_total)
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

-- ────────────────────────────────────────────── the test message, from 037
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
      'message',         public.account_message('Test Person', 'test.person@example.com',
                                                (select count(*) from auth.users))
                         || E'\n' || '(This is a test.)'
    ),
    timeout_milliseconds := 5000
  );

  return 'Sent. It should appear in Zapier within a few seconds.';
end;
$$;

revoke all on function public.test_webhook() from public, anon, authenticated;

-- The trigger from 037 keeps pointing at announce_new_account(); replacing
-- the function body is enough. Nothing to re-create.
