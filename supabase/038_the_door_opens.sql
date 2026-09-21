-- ===========================================================================
-- FDAI — the door opens
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 034 to 037 first.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────
-- FD AI stops being invitation-only. Anybody may create an account, and the
-- waitlist stops standing in the way of the sign-up screen.
--
-- 035 put a trigger on auth.users that refused any address not already on the
-- waitlist. That was the right answer while the product was closed and it is
-- the wrong answer now: with the waitlist step removed from the sign-up
-- screen, nothing would ever put an address on the list, so that trigger would
-- refuse EVERY sign-up — including Google, including the firm's own — with
-- "Database error saving new user" and no explanation anywhere.
--
-- So the waitlist check goes. Running this file before the new sign-up screen
-- is deployed is harmless; running the new screen before this file is not.
-- If both are happening at once, run this FIRST.
--
-- ── WHAT DOES NOT CHANGE ────────────────────────────────────────────────────
-- The waitlist TABLE stays, with every row in it. It is the record of who
-- asked before FD opened up, the admin console still reads it, and 036 still
-- stamps account_at when one of those people finally registers. Nothing new
-- will be written to it, which is the intended state, not a fault.
--
-- The announcement in 037 stays exactly as it is. It reads the name from the
-- account itself before it looks at the waitlist, so the new sign-up screen's
-- Full name box feeds it directly and the Slack line keeps working for people
-- who were never on a list. Company is the one thing it can no longer find,
-- and it is left blank rather than guessed at.
--
-- ── WHAT REPLACES IT ────────────────────────────────────────────────────────
-- One switch, which 035 already had underneath the waitlist check: a single
-- row saying whether registration is open. It is not a gate — it defaults to
-- open and anybody may walk in — it is the brake FD can pull without a deploy
-- if something goes wrong at an hour when a deploy is not possible.
--
--   close it   update public.signup_config set auto_account = false;
--   open it    update public.signup_config set auto_account = true;
--
-- Which is worth keeping precisely BECAUSE the door is now open. An open door
-- with no handle is not a decision anyone should be one bad night away from.
-- ===========================================================================

-- ───────────────────────────────────────────────── 1. what the switch now means
comment on column public.signup_config.auto_account is
  'true: anybody may create an account (the normal state). '
  'false: registration is closed and sign-up is refused, except for people FD '
  'invites by hand from the admin console. Not a waitlist — a stop switch.';

-- ────────────────────────────────────────────────────────── 2. the new gate
/*
 * The same shape as 035's and for the same reasons — BEFORE INSERT, so a
 * refusal happens before the row exists and 004's trigger never grants trial
 * credits to an account that was turned away; SECURITY DEFINER, because it
 * reads a public table while running as GoTrue's role; and the row read as
 * JSON rather than as new.<column>, because this function runs on EVERY
 * account ever created and a reference to a column Supabase renames one day
 * would not be a small bug. It would be nobody anywhere being able to sign up.
 */
create or replace function public.registration_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  jsonb := to_jsonb(new);
  v_auto boolean;
begin
  -- FD invited them. A person already made that decision and it stands
  -- whatever the switch says.
  if v_row ->> 'invited_at' is not null then
    return new;
  end if;

  select auto_account into v_auto from public.signup_config where id;

  /* coalesce to TRUE, which is the opposite of 035's choice and deliberate.
     There, a missing row meant "closed", because the safe failure for an
     invitation-only product is to let nobody in. Here the product is open, so
     the safe failure is to keep it open: a deleted config row should not
     silently shut the front door. */
  if coalesce(v_auto, true) = false then
    raise exception 'fdai_registration_closed'
      using hint = 'signup_config.auto_account is off. Turn it on to reopen sign-up.';
  end if;

  return new;
end;
$$;

revoke all on function public.registration_gate() from public, anon, authenticated;

-- ──────────────────────────────────────────── 3. swap one trigger for the other
drop trigger if exists on_auth_user_gate on auth.users;
create trigger on_auth_user_gate
  before insert on auth.users
  for each row execute function public.registration_gate();

/*
 * 035's function is dropped rather than left lying about. A SECURITY DEFINER
 * function that refuses sign-ups, sitting unused next to a trigger of almost
 * the same name, is exactly the thing somebody reattaches by accident while
 * trying to fix something else at midnight.
 */
drop function if exists public.only_waitlist_may_register() cascade;

-- ───────────────────────────────────────────────────────────────── the check
do $$
declare
  v_fn text;
  v_open boolean;
begin
  select p.proname into v_fn
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgname = 'on_auth_user_gate' and not t.tgisinternal;

  if v_fn = 'registration_gate' then
    raise notice 'OK    the waitlist no longer gates sign-up';
  elsif v_fn is null then
    raise notice 'FAIL  no gate at all on auth.users';
  else
    raise notice 'FAIL  the gate still runs %', v_fn;
  end if;

  if exists (select 1 from pg_proc where proname = 'only_waitlist_may_register') then
    raise notice 'FAIL  the old waitlist gate is still defined';
  else
    raise notice 'OK    the old waitlist gate is gone';
  end if;

  select coalesce(auto_account, true) into v_open from public.signup_config where id;
  if coalesce(v_open, true) then
    raise notice 'OK    registration is OPEN — anybody may create an account';
  else
    raise notice 'NOTE  registration is CLOSED. To open it:';
    raise notice '      update public.signup_config set auto_account = true;';
  end if;

  raise notice 'NOTE  % row(s) kept on the waitlist as history; nothing new is written to it',
    (select count(*) from public.waitlist);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- AFTERWARDS
--
--   Supabase → Authentication → Sign In / Providers:
--     "Allow new users to sign up"   ON   (it already is)
--     "Confirm email"                OFF  (it already is)
--
--   Nobody proves they own the address they type. The account is worth three
--   documents and a fortnight, and the real owner takes it back with "Forgot
--   your password?", so the trade is a reasonable one while volume is low —
--   but it IS a trade. Turning "Confirm email" on reverses it, and needs a
--   mail provider configured first, because Supabase's built-in sender is
--   rate-limited to a handful an hour and sign-up would start failing.
-- ═══════════════════════════════════════════════════════════════════════════
