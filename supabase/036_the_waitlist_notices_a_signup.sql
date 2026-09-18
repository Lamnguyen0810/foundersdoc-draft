-- ===========================================================================
-- FDAI — the waitlist notices when somebody signs up
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 034 and 035 first.
--
-- ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
-- waitlist.account_at was only ever stamped by ONE path: FD pressing Invite in
-- the admin console, which goes through the admin API and marks the row on its
-- way past. When registration moved onto the sign-up screen — the person
-- choosing their own password, with Supabase's ordinary sign-up and no server
-- route in the middle — nothing was left to do the stamping.
--
-- So an account really was created, and the waitlist row still said nobody had
-- one. The admin table went on offering Invite for somebody who had been using
-- the product for a week. Pressing it was harmless — createAccountFor answers
-- "already" and changes nothing — but the table was lying, and a table that
-- lies is worse than a table that is missing.
--
-- ── WHY A TRIGGER AND NOT A LINE OF TYPESCRIPT ──────────────────────────────
-- Because the stamping has to happen for every way in, and there are now
-- three: the sign-up screen, an invitation, and Google. Application code would
-- have to remember at each one, and the fourth would forget. The database sees
-- all of them, in the same transaction as the account itself, so the row and
-- the stamp are true together or neither exists.
--
-- ── AND WHY `status` IS LEFT ALONE ──────────────────────────────────────────
-- Somebody who signed themselves up was not invited. Writing 'invited' on
-- their row would be the tidier-looking lie, and it would quietly move them
-- out of the "waiting" count the admin console reports. account_at says what
-- actually happened; status stays FD's own record of what FD did.
-- ===========================================================================

create or replace function public.record_account_on_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_email text := lower(btrim(coalesce(to_jsonb(new) ->> 'email', '')));
begin
  if v_email = '' then
    return new;
  end if;

  /* coalesce, so the FIRST time is the time it keeps. An account created,
     closed and created again should not rewrite the history of the first. */
  update public.waitlist
  set account_at = coalesce(account_at, now())
  where lower(email) = v_email;

  return new;
end;
$$;

/*
 * AFTER, not BEFORE. The gate in 035 runs BEFORE and refuses; this runs once
 * the row is really there, so nothing is ever stamped for an account that was
 * turned away. Both are in the same transaction as the insert, so the stamp
 * and the account are true together or neither is.
 */
drop trigger if exists on_auth_user_waitlist on auth.users;
create trigger on_auth_user_waitlist
  after insert on auth.users
  for each row execute function public.record_account_on_waitlist();

revoke all on function public.record_account_on_waitlist() from public, anon, authenticated;

-- ────────────────────────────────────────── catching up the ones already made
-- Anybody who signed up between the sign-up screen going live and this file
-- being run. Matched on the address, which is the only thing the two tables
-- have in common, and only where the stamp is missing.
update public.waitlist w
set account_at = u.created_at
from auth.users u
where lower(u.email) = lower(w.email)
  and w.account_at is null;

-- ────────────────────────────────────────────────────────────────── the check
do $$
declare
  v_stamped integer;
  v_missing integer;
begin
  select count(*) into v_stamped from public.waitlist where account_at is not null;

  select count(*) into v_missing
  from public.waitlist w
  join auth.users u on lower(u.email) = lower(w.email)
  where w.account_at is null;

  raise notice 'OK    % of % addresses on the waitlist have an account',
    v_stamped, (select count(*) from public.waitlist);

  if v_missing = 0 then
    raise notice 'OK    every account is recorded against its waitlist row';
  else
    raise notice 'FAIL  % account(s) still unrecorded', v_missing;
  end if;

  -- Not a failure. An account with no waitlist row is one FD made by hand in
  -- the dashboard before 035, and it is worth knowing about rather than not.
  raise notice 'NOTE  % account(s) have no waitlist row at all',
    (select count(*) from auth.users u
      where u.email is not null
        and not exists (select 1 from public.waitlist w
                         where lower(w.email) = lower(u.email)));
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- WHO HAS AN ACCOUNT, AND WHO IS STILL WAITING
--
--   select w.email, w.created_at as joined, w.account_at, w.status,
--          (u.id is not null) as has_login
--   from public.waitlist w
--   left join auth.users u on lower(u.email) = lower(w.email)
--   order by w.created_at desc;
-- ═══════════════════════════════════════════════════════════════════════════
