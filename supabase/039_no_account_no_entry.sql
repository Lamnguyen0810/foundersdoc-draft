-- 039 — "Sign in with Google" on the sign-in screen no longer makes an account.
--
-- ── THE PROBLEM ──────────────────────────────────────────────────────────────
-- Delete a user, go to the sign-in screen, press "Sign in with Google": they
-- are straight back in, with a brand-new account nobody asked for. That is
-- not a bug in this database — it is how Google sign-in works everywhere.
-- Google proves who somebody is; it does not know whether they have an
-- account with us; and Supabase, on seeing a Google identity it has never
-- met, does the only thing it can do and creates one. Signing IN with Google
-- and signing UP with Google are the same request.
--
-- Which means the sign-in screen and the sign-up screen were the same door,
-- and "you have no account yet — sign up" was a thing this product could
-- never say to a Google user.
--
-- ── THE ANSWER ───────────────────────────────────────────────────────────────
-- The application now knows which screen the Google button was pressed on
-- (see src/app/auth/google/route.ts). When it was the SIGN-IN screen and the
-- account that came back was born by that very press, the application calls
-- this function, which removes the account again, and the person is sent to
-- the sign-up screen with a plain sentence saying they have no account yet.
--
-- The account exists for about a second. It has no drafts, no credits, no
-- settings — only the empty profile 001's trigger gave it — and deleting the
-- auth.users row takes all of that with it, the same way prune_closed_accounts
-- (033) does thirty days after somebody closes an account on purpose.
--
-- ── WHY IT IS THIS WAY ROUND ─────────────────────────────────────────────────
-- It would be tidier to refuse BEFORE the row is written, as 038's gate does.
-- It cannot be done: the gate runs inside Supabase's Google callback, which
-- carries nothing about which of our screens the person was on. The only
-- place that knows is the browser, and the browser is not consulted until
-- after the row exists. So: create, look, undo. Not elegant. Correct.
--
-- ── WHAT KEEPS THIS FROM DELETING THE WRONG ACCOUNT ──────────────────────────
-- The application decides; this function checks its working. It refuses to
-- delete anything except:
--   • the CALLER's own account (auth.uid() — never somebody else's), which
--   • came in through Google, and which
--   • is less than fifteen minutes old.
-- An account that has existed for a quarter of an hour was not born by the
-- press of a button a moment ago, whatever the application thinks, and stays.
-- A user could call this on themselves within fifteen minutes of signing up
-- with Google, and would lose an account they could remake in ten seconds —
-- that is the whole of the harm a misuse can do.
--
-- ── AND SLACK IS TOLD ────────────────────────────────────────────────────────
-- 037 announces every row that appears in auth.users, and the row appeared,
-- so #fdai-analytics-newaccounts has already been told "X created an FD AI
-- account with Google". That line is now wrong, and a running total that is
-- one too high stays wrong for ever unless something says so. This sends a
-- second message through the same hook, with the corrected count. Best
-- effort, like 037: a Slack failure never stops the deletion.
--
-- ── ORDER ────────────────────────────────────────────────────────────────────
-- Run this BEFORE the matching application change goes live. Without it the
-- application still signs the person out and sends them to sign up, but the
-- unwanted row is left behind and counted.

create or replace function public.leave_without_an_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid := auth.uid();
  v_row     jsonb;
  v_email   text;
  v_url     text;
  v_total   bigint;
begin
  if v_id is null then
    return false;
  end if;

  select to_jsonb(u) into v_row from auth.users u where u.id = v_id;
  if v_row is null then
    return false;
  end if;

  /* The three conditions above. Read as JSON like 035–037, so that a column
     Supabase renames one day makes this refuse rather than misfire. */
  if coalesce(v_row #>> '{raw_app_meta_data,provider}', '') <> 'google' then
    return false;
  end if;
  if (v_row ->> 'created_at')::timestamptz < now() - interval '15 minutes' then
    return false;
  end if;

  v_email := lower(btrim(coalesce(v_row ->> 'email', '')));

  delete from auth.users where id = v_id;

  /* Slack. Everything from here is reporting, and reporting may not undo the
     deletion above — hence its own block with its own exception handler. */
  begin
    select url into v_url
    from public.webhooks
    where name = 'account_created' and enabled;

    if v_url is not null and v_url <> '' then
      select count(*) into v_total from auth.users;

      perform net.http_post(
        url := v_url,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'event',          'account_not_created',
          'email',          v_email,
          'how',            'Google',
          'accounts_total', v_total,
          'message',        'Not a new account: ' || v_email
                            || ' pressed "Sign in with Google" on the sign-in screen without having an account. '
                            || 'Nothing was kept; they were asked to sign up. '
                            || case when v_total = 1 then 'Still 1 account.'
                                    else 'Still ' || v_total || ' accounts.' end
        ),
        timeout_milliseconds := 5000
      );
    end if;
  exception when others then
    raise warning 'leave_without_an_account (slack): %', sqlerrm;
  end;

  return true;
end;
$$;

comment on function public.leave_without_an_account() is
  'Removes the caller''s own Google account if it is under fifteen minutes old. '
  'Called by the application when "Sign in with Google" on the SIGN-IN screen '
  'created an account that should not exist. See 039.';

revoke all on function public.leave_without_an_account() from public, anon;
grant execute on function public.leave_without_an_account() to authenticated;
