-- ============================================================================
-- 072 · Free credits and the Slack "signed up" line wait for a confirmed email
-- ============================================================================
--
-- Bots were signing up with made-up names ("LmFvnzzHjGxAIcYBjdhqZ") and other
-- people's Gmail addresses. Each one got the free trial credits the moment the
-- row was written, and a "just signed up!" line in Slack.
--
-- Now both wait until the address is confirmed:
--
--   * Email and password, "Confirm email" ON  -> when the link is clicked.
--   * Email and password, "Confirm email" OFF -> straight away, as before
--     (Supabase confirms the address itself at sign-up).
--   * Google -> straight away, as before (Google has confirmed the address).
--
-- A bot that never opens the email gets no credits and no Slack line. The
-- running total in Slack counts confirmed accounts only.
--
-- The trial is granted once per account, however many times this runs: an
-- account that already had its trial from before this change is not given a
-- second one when it confirms.
--
-- Run any time; safe to run again. Turn on "Confirm email" in Supabase
-- (Authentication -> Sign In / Providers -> Email) once custom SMTP is set.
-- ============================================================================

-- ─── 1. the trial, once per account ───────────────────────────────────────
create or replace function public.grant_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
  v_days    integer;
begin
  -- Already had its trial (an account from before 072, or a second run).
  if exists (select 1 from public.credit_grants g where g.user_id = new.id and g.source = 'trial') then
    return new;
  end if;

  select trial_credits, trial_days into v_credits, v_days from public.billing_config where id;

  insert into public.billing_accounts (user_id, trial_granted)
  values (new.id, true)
  on conflict (user_id) do update set trial_granted = true;

  if coalesce(v_credits, 0) > 0 then
    insert into public.credit_grants (user_id, credits, remaining, source, expires_at)
    values (new.id, v_credits, v_credits, 'trial', now() + make_interval(days => coalesce(v_days, 7)));
  end if;

  return new;
end;
$$;

revoke all on function public.grant_trial() from public, anon, authenticated;

drop trigger if exists on_auth_user_trial on auth.users;
create trigger on_auth_user_trial
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.grant_trial();

drop trigger if exists on_auth_user_trial_confirmed on auth.users;
create trigger on_auth_user_trial_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.grant_trial();

-- ─── 2. the Slack line, once confirmed ────────────────────────────────────
-- (040's function; only the running total changes, to confirmed accounts.)
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

  -- Counted once confirmed (072): the number in the message is the number of
  -- confirmed accounts there are now, this one included.
  select count(*) into v_total from auth.users u where u.email_confirmed_at is not null;

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

revoke all on function public.announce_new_account() from public, anon, authenticated;

drop trigger if exists on_auth_user_announced on auth.users;
create trigger on_auth_user_announced
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.announce_new_account();

drop trigger if exists on_auth_user_announced_confirmed on auth.users;
create trigger on_auth_user_announced_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.announce_new_account();

-- ─── 3. checks ────────────────────────────────────────────────────────────
-- Accounts never confirmed (likely bots once "Confirm email" is on):
--   select id, email, created_at, raw_user_meta_data ->> 'full_name' as name
--   from auth.users where email_confirmed_at is null order by created_at desc;
