-- ===========================================================================
-- FDAI — the gate moves into the database
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 034_waitlist_becomes_signup.sql first.
--
-- ── WHAT CHANGES, AND WHY ───────────────────────────────────────────────────
-- Until now the thing that kept strangers out was a toggle: Supabase's own
-- sign-up was switched off, so the only way to make an account was the admin
-- key. That worked, but it bought the gate at the price of the product: a
-- person could not choose their own password on screen, and could not sign in
-- with Google at all, because both of those are Supabase creating a user.
--
-- So the gate moves down a level. Supabase sign-up is switched ON, and this
-- trigger decides instead — before any row is written, for every provider,
-- for every route in and out of the product:
--
--     an account may be created ONLY for an address already on the waitlist.
--
-- That is stronger than the toggle it replaces. A toggle is one click in a
-- dashboard away from being wrong; this cannot be turned off by accident, it
-- applies to email sign-up and Google alike, and it is enforced where no
-- application code can route around it.
--
-- ── AND IT HONOURS THE SWITCH ───────────────────────────────────────────────
-- signup_config.auto_account off means self-serve registration stops. An
-- invitation FD sends by hand still works, because that is FD choosing, and
-- an invited row is distinguishable: GoTrue sets invited_at on it.
--
-- ⚠ ONE CONSEQUENCE, WORTH KNOWING BEFORE IT SURPRISES YOU
-- Creating a user by hand in the Supabase dashboard now fails for an address
-- that is not on the waitlist. Put them on it first, which is one line:
--
--     select public.join_waitlist('someone@example.com');
-- ===========================================================================

/*
 * The gate.
 *
 * BEFORE INSERT, so a refused account is never created rather than created
 * and cleaned up — there is no window in which the row exists, no trial
 * credits granted by 004's AFTER INSERT trigger to a stranger, and nothing to
 * roll back.
 *
 * SECURITY DEFINER because it reads public.waitlist while running as GoTrue's
 * own role, which has no business being granted access to it in general.
 */
create or replace function public.only_waitlist_may_register()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   jsonb   := to_jsonb(new);
  v_email text    := lower(btrim(coalesce(v_row ->> 'email', '')));
  v_auto  boolean;
begin
  /* ── WHY THE ROW IS READ AS JSON AND NOT AS new.<column> ─────────────────
     This function runs on EVERY account ever created, and an exception in it
     stops the insert. So a reference to a column that has been renamed — or
     that this version of GoTrue simply does not have — would not be a small
     bug: it would be nobody anywhere being able to sign up, with "Database
     error saving new user" as the only clue.

     auth.users is Supabase's table, not ours. Reading it through to_jsonb
     means an absent field is null rather than an error, so the worst case
     degrades to "the gate does not apply" instead of "the product is shut". */
  /* No address at all. Nothing this function can reason about, and refusing
     would break any future provider that fills the email in a step later, so
     it is left to Supabase's own rules. */
  if v_email = '' then
    return new;
  end if;

  /* FD invited them. That is a decision a person already made, and it stands
     whatever the self-serve switch says. */
  if v_row ->> 'invited_at' is not null then
    return new;
  end if;

  if not exists (select 1 from public.waitlist where lower(email) = v_email) then
    raise exception 'fdai_not_on_waitlist'
      using hint = 'Join the waitlist first; only registered addresses may create an account.';
  end if;

  select auto_account into v_auto from public.signup_config where id;
  if coalesce(v_auto, false) = false then
    raise exception 'fdai_registration_closed'
      using hint = 'signup_config.auto_account is off; FD invites people by hand.';
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_gate on auth.users;
create trigger on_auth_user_gate
  before insert on auth.users
  for each row execute function public.only_waitlist_may_register();

revoke all on function public.only_waitlist_may_register() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────── the check
do $$
declare v_ok boolean;
begin
  select exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_gate' and not tgisinternal
  ) into v_ok;

  if v_ok then
    raise notice 'OK    only waitlisted addresses may register (% on the list)',
      (select count(*) from public.waitlist);
    raise notice 'OK    self-serve registration is %',
      case when (select auto_account from public.signup_config where id)
           then 'OPEN' else 'CLOSED — invitation only' end;
  else
    raise notice 'FAIL  the trigger was not created';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOW SWITCH SUPABASE SIGN-UP ON
--
-- Authentication → Sign In / Providers → Email:
--   • "Allow new users to sign up"  ON   — this trigger is the gate now
--   • "Confirm email"               OFF  — they choose a password on the page
--                                          they are already looking at; there
--                                          is no email step to confirm
--
-- Leaving sign-up off makes the registration screen fail for everybody, and
-- leaving "Confirm email" on sends them an email they were not expecting and
-- leaves them signed out until they find it.
-- ═══════════════════════════════════════════════════════════════════════════
